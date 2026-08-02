import { defineConfig } from 'vitest/config';

// Root config for the cross-cutting suites. Package-level tests are run by each
// package's own vitest config through turbo; these two suites deliberately span
// packages, because the guarantees they assert do too.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    environment: 'node',
  },
});
