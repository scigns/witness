/**
 * Entry point — the poll loop. `EVENT_CATALOGUE.md` §3: at-least-once
 * delivery, per-aggregate ordering only, consumer-side idempotency keyed on
 * the event id (satisfied here by `projectAssertion` being `MERGE`-based,
 * not by de-duplicating events before processing — replaying the same event
 * twice is safe by construction, so this loop does not need its own
 * dedup table).
 *
 * This is the "minimal profile: in-process polling dispatcher" ADR-0005
 * names, applied to a real, separate consumer process rather than folded
 * into `api-gateway` — reading Postgres, not subscribing to anything, is
 * what makes it "minimal" rather than "the real NATS adapter".
 */

import { fileURLToPath } from 'node:url';

import neo4j from 'neo4j-driver';
import pg from 'pg';

import { loadConfig } from './config.js';
import { isProjectable, projectAssertion, removeMergedEntityNode } from './neo4j-projector.js';
import {
  advanceCheckpoint,
  fetchAssertionIdsReferencingEntity,
  fetchMergeSubtreeIds,
  fetchPendingOutbox,
  loadAssertionProjection,
  markOutboxAttemptFailed,
  markOutboxDispatched,
} from './postgres-source.js';

const DESTINATION = 'graph-projector';
const PROJECTION_NAME = 'neo4j-graph';
const CONFIRMED_EVENT_TYPE_SUFFIX = 'knowledge.assertion.confirmed.v1';
const ENTITY_MERGED_EVENT_TYPE_SUFFIX = 'knowledge.entity.merged.v1';

let shuttingDown = false;

/**
 * Re-projects every assertion that referenced `mergedEntityId` *or any
 * entity that had already merged into it* — so each one's
 * `fromEntity`/`toEntity`/`entity` now resolves through
 * `resolveCanonicalEntity` all the way to the surviving entity — then
 * removes the merged entity's own node. The subtree lookup is what makes a
 * chained merge (`C` into `B` yesterday, `B` into `A` today) correct: `C`'s
 * assertion still cites `C` in Postgres, and `C`'s node is already gone from
 * Neo4j (detached when `C` merged into `B`), so only a subtree-aware search
 * finds it and re-points it at `A` before `B`'s node (and the stale edge
 * still hanging off it) is removed. Order matters: the removal must run
 * last, or a relationship not yet re-projected would lose its endpoint
 * entirely for the moment between the two steps (`KNOWLEDGE_GRAPH.md` §13,
 * Gap B).
 */
export async function projectEntityMerge(
  pool: pg.Pool,
  driver: neo4j.Driver,
  survivingEntityId: string,
  mergedEntityId: string,
): Promise<number> {
  const subtreeIds = await fetchMergeSubtreeIds(pool, mergedEntityId);
  const affectedAssertionIds = await fetchAssertionIdsReferencingEntity(pool, subtreeIds);
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    for (const assertionId of affectedAssertionIds) {
      const projection = await loadAssertionProjection(pool, assertionId);
      if (projection !== null) {
        await projectAssertion(session, projection);
      }
    }
    await removeMergedEntityNode(session, mergedEntityId);
  } finally {
    await session.close();
  }
  // eslint-disable-next-line no-console
  console.log(
    `[graph-projector] resolved merge: '${mergedEntityId}' -> '${survivingEntityId}' ` +
      `(${affectedAssertionIds.length} assertion(s) re-projected)`,
  );
  return affectedAssertionIds.length;
}

async function tick(
  pool: pg.Pool,
  driver: neo4j.Driver,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const items = await fetchPendingOutbox(pool, DESTINATION, config.batchSize);
  for (const item of items) {
    const isConfirmedAssertion = item.eventType.endsWith(CONFIRMED_EVENT_TYPE_SUFFIX);
    const isEntityMerged = item.eventType.endsWith(ENTITY_MERGED_EVENT_TYPE_SUFFIX);

    if (!isConfirmedAssertion && !isEntityMerged) {
      // Only two event types are handled today (ADR-0026 point 10 scopes
      // this pass to the projector's own unblocking need); an unrecognised
      // type is a loud, visible skip, never a silent drop, per
      // `EVENT_CATALOGUE.md` §2 ("an unhandled version is a loud failure").
      console.warn(`[graph-projector] unhandled event type '${item.eventType}', leaving pending`);
      continue;
    }

    try {
      if (isEntityMerged) {
        const survivingEntityId = String(item.payload['survivingEntityId']);
        const mergedEntityId = String(item.payload['mergedEntityId']);
        await projectEntityMerge(pool, driver, survivingEntityId, mergedEntityId);
        await advanceCheckpoint(pool, PROJECTION_NAME, item.eventId);
        await markOutboxDispatched(pool, item.outboxId);
        continue;
      }

      const projection = await loadAssertionProjection(pool, item.aggregateId);
      if (projection === null) {
        throw new Error(`No projectable data found for assertion '${item.aggregateId}'.`);
      }
      const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
      try {
        await projectAssertion(session, projection);
      } finally {
        await session.close();
      }
      await advanceCheckpoint(pool, PROJECTION_NAME, item.eventId);
      await markOutboxDispatched(pool, item.outboxId);
      // eslint-disable-next-line no-console
      console.log(
        `[graph-projector] projected assertion '${item.aggregateId}' (${isProjectable(projection) ? 'upserted' : 'retracted'})`,
      );
    } catch (error) {
      console.error(`[graph-projector] failed to project event '${item.eventId}':`, error);
      await markOutboxAttemptFailed(pool, item.outboxId, item.attempts, config.maxAttempts);
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
  );

  // eslint-disable-next-line no-console
  console.log(`[graph-projector] starting, polling every ${config.pollIntervalMs}ms`);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      shuttingDown = true;
    });
  }

  while (!shuttingDown) {
    await tick(pool, driver, config);
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }

  await driver.close();
  await pool.end();
}

// Guarded so importing this module for `projectEntityMerge` (the live
// integration suite does) never starts the poll loop — only running it
// directly (`node ./dist/main.js`) does.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error('[graph-projector] fatal error', error);
    process.exit(1);
  });
}
