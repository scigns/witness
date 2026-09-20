/**
 * Rebuild — the ADR-0011 exit gate: "delete the graph, rebuild, byte-comparable
 * result." Drops every node/edge this projector owns and replays every
 * confirmed, non-retracted assertion from Postgres, oldest first. Requires a
 * running Neo4j (`make dev-full`), which is why this is a script invoked
 * deliberately (`pnpm --filter @witness/graph-projector run rebuild`) rather
 * than something CI runs against a mocked driver — the guarantee this proves
 * is specifically that the *real* database round-trips correctly, and a
 * mock cannot stand in for that without asserting the thing that matters.
 *
 * Runs in a shadow-safe way for a single-node deployment: it does not touch
 * Postgres (the source of truth) at all, so a failure partway through never
 * loses data — rerunning is always safe, being itself `MERGE`-based.
 */

import neo4j from 'neo4j-driver';
import pg from 'pg';

import { loadConfig } from './config.js';
import { projectAssertion } from './neo4j-projector.js';
import {
  fetchAllConfirmedAssertionIds,
  loadAssertionProjection,
  resetCheckpoint,
  advanceCheckpoint,
} from './postgres-source.js';

const PROJECTION_NAME = 'neo4j-graph';

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const driver = neo4j.driver(
    config.neo4jUri,
    neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
  );

  const startedAt = Date.now();
  await resetCheckpoint(pool, PROJECTION_NAME);

  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    // eslint-disable-next-line no-console
    console.log('[graph-projector:rebuild] dropping existing projection');
    await session.executeWrite((tx) => tx.run('MATCH (n) DETACH DELETE n'));
  } finally {
    await session.close();
  }

  const assertionIds = await fetchAllConfirmedAssertionIds(pool);
  // eslint-disable-next-line no-console
  console.log(`[graph-projector:rebuild] replaying ${assertionIds.length} confirmed assertion(s)`);

  let projected = 0;
  for (const assertionId of assertionIds) {
    const projection = await loadAssertionProjection(pool, assertionId);
    if (projection === null) continue;
    const writeSession = driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await projectAssertion(writeSession, projection);
      projected += 1;
    } finally {
      await writeSession.close();
    }
  }

  const lastId = assertionIds[assertionIds.length - 1];
  if (lastId !== undefined) {
    await advanceCheckpoint(pool, PROJECTION_NAME, lastId);
  }

  const durationMs = Date.now() - startedAt;
  // eslint-disable-next-line no-console
  console.log(
    `[graph-projector:rebuild] projected ${projected}/${assertionIds.length} assertion(s) in ${durationMs}ms`,
  );

  await driver.close();
  await pool.end();
}

main().catch((error: unknown) => {
  console.error('[graph-projector:rebuild] fatal error', error);
  process.exit(1);
});
