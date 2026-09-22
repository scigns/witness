import { defineConfig } from 'vitest/config';

// `*.live.test.ts` needs a real Neo4j and is run separately via
// `vitest.live.config.ts` (`pnpm test:live`) — excluded here so `pnpm test`
// (CI's default) never depends on live infrastructure being reachable.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.live.test.ts', 'node_modules/**'],
    environment: 'node',
  },
});
