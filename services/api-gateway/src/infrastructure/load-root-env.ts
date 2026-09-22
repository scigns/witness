/**
 * Load the monorepo's root `.env` into `process.env`, filling gaps only —
 * never overriding a variable the real environment already set.
 *
 * Every other entry point that reads `DATABASE_URL` (Prisma's own CLI, most
 * directly) already does this implicitly; `main.ts` did not, which is the
 * reason `pnpm dev` / `make app` failed with "DATABASE_URL: Required" for a
 * fresh contributor who followed the documented onboarding flow exactly —
 * nothing in that flow ever sources `.env` into the shell running the app.
 * `prisma generate` quietly worked anyway (its own bundled dotenv support),
 * which made the gap easy to miss: schema generation succeeded while the
 * actual server failed one step later, for a reason that looked unrelated.
 *
 * Safe in every profile: a real deployment sets its variables through the
 * platform (systemd/Docker/orchestrator env), not a checked-in file, and
 * `.env` is git-ignored — there is normally nothing here to load in
 * production, and `override: false` means even a stray file could never
 * shadow a value the platform actually set.
 */

import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// src/infrastructure/ (or dist/infrastructure/) -> services/api-gateway -> services -> repo root
const repoRootEnvPath = resolve(here, '../../../../.env');

export function loadRootEnv(): void {
  if (!existsSync(repoRootEnvPath)) return;

  const result = loadDotenv({ path: repoRootEnvPath, override: false, quiet: true });
  if (result.error) return;

  // eslint-disable-next-line no-console
  console.log(`[load-root-env] Filled unset variables from ${repoRootEnvPath}`);
}
