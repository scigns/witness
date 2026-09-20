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

import neo4j from 'neo4j-driver';
import pg from 'pg';

import { loadConfig } from './config.js';
import { isProjectable, projectAssertion } from './neo4j-projector.js';
import {
  advanceCheckpoint,
  fetchPendingOutbox,
  loadAssertionProjection,
  markOutboxAttemptFailed,
  markOutboxDispatched,
} from './postgres-source.js';

const DESTINATION = 'graph-projector';
const PROJECTION_NAME = 'neo4j-graph';
const CONFIRMED_EVENT_TYPE_SUFFIX = 'knowledge.assertion.confirmed.v1';

let shuttingDown = false;

async function tick(
  pool: pg.Pool,
  driver: neo4j.Driver,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const items = await fetchPendingOutbox(pool, DESTINATION, config.batchSize);
  for (const item of items) {
    if (!item.eventType.endsWith(CONFIRMED_EVENT_TYPE_SUFFIX)) {
      // Only one event type is handled today (ADR-0026 point 10 scopes this
      // pass to the projector's own unblocking need); an unrecognised type
      // is a loud, visible skip, never a silent drop, per
      // `EVENT_CATALOGUE.md` §2 ("an unhandled version is a loud failure").

      console.warn(`[graph-projector] unhandled event type '${item.eventType}', leaving pending`);
      continue;
    }

    try {
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

main().catch((error: unknown) => {
  console.error('[graph-projector] fatal error', error);
  process.exit(1);
});
