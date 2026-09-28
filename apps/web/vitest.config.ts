import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
    // Existing config/runtime tests stay on the fast `node` environment;
    // component-behaviour tests (WEB-NEXT-01) opt into `jsdom` by filename
    // rather than moving every test to jsdom by default.
    environmentMatchGlobs: [['test/**/*.dom.test.tsx', 'jsdom']],
    setupFiles: ['./test/setup-dom.ts'],
  },
});
