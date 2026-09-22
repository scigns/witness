import { defineConfig } from 'vitest/config';

// Real-Postgres-and-Neo4j suite (`pnpm test:live`) — not part of the default
// `pnpm test` run. Requires DATABASE_URL, NEO4J_URI, and NEO4J_USER/
// NEO4J_PASSWORD (or NEO4J_PROJECTOR_USER/NEO4J_PROJECTOR_PASSWORD) in the
// environment and a reachable database; the suite skips itself gracefully
// (not a failure) when either is missing or unreachable.
export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
