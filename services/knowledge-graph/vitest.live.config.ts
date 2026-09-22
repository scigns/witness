import { defineConfig } from 'vitest/config';

// Real-Neo4j suite (`pnpm test:live`) — not part of the default `pnpm test`
// run. Requires NEO4J_URI/NEO4J_USER (or NEO4J_READONLY_USER)/NEO4J_PASSWORD
// (or NEO4J_READONLY_PASSWORD) in the environment and a reachable Neo4j; the
// suite skips itself gracefully (not a failure) when either is missing.
export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
