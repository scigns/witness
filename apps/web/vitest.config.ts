import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors tsconfig.json's own `@/*` -> `./src/*` path — Vite's built-in
  // alias resolution, not a new plugin/dependency — so a test can import a
  // real source file (e.g. `src/app/manifest.ts`) without that file needing
  // to know it's under test.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
