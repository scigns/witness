import { defineConfig } from 'vitest/config';

// Real-PostgreSQL suite (`pnpm test:live`) — not part of the default
// `pnpm test` run. Requires DATABASE_URL in the environment and a reachable
// database; the suite skips itself gracefully (not a failure) when either
// is missing.
export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
