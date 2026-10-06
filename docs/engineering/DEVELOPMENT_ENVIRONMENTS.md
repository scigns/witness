# Development Environments

**Owner:** Engineering
**Status:** Active
**Related:**
[ADR-0029](../../architecture/decisions/ADR-0029-development-environment-strategy.md),
[DEVELOPMENT_ENVIRONMENT_STRATEGY.md](./DEVELOPMENT_ENVIRONMENT_STRATEGY.md)

A new contributor should be productive from this document alone — no tribal knowledge required.

## Default: remote-first development

Edit → optional cheap targeted checks → commit explicit paths → push → inspect GitHub Actions.
Docker Desktop normally stays stopped. GitHub CI continues independently when the laptop shuts
down after a successful push. See [command classifications](REMOTE_FIRST_EXECUTION.md) and
[agent instructions](../../AGENTS.md).

```sh
make bootstrap          # optional Node/pnpm dependency setup; no Docker/DB required
git diff --check         # cheap local check
# Optionally format/lint explicit changed files, then commit explicit paths and push
gh pr checks <number>    # full validation is authoritative remotely
```

Git alone is enough for edits; installed hooks/targeted code checks need Node/pnpm. Full workspace
lint/typecheck/tests/builds, invariant/adversarial suites and infrastructure tests are not local
prerequisites. Filtered Turbo tasks can still build dependencies. No database is required for
routine editing. Local full suites remain available for explicit debugging.

## Optional local runtime debugging

Choose this only to reproduce infrastructure behaviour with synthetic fixtures:

```sh
make bootstrap-runtime  # requires Docker; .env, dependencies and Prisma generation
make dev                # Postgres
make migrate
make seed
make app
make doctor             # infrastructure diagnostics, not an editing prerequisite
```

The development profile accepts the development-user header instead of real Keycloak auth.
Do not use production credentials/services. Existing accessible non-production Postgres can
replace `make dev`; Docker is needed only for Compose. This is not the default development loop.

## GitHub Codespaces (dev-integration)

**When to use it:** you need real Keycloak-backed auth, the Evidence Knowledge Graph (Neo4j), or
want a clean environment that isn't shaped by whatever is already running on your own machine.

Open the repository in a Codespace (GitHub's "Code" → "Codespaces" → "Create codespace on main").
`.devcontainer/devcontainer.json` starts Postgres, Neo4j and Keycloak alongside your workspace
container automatically, and `postCreate.sh` generates a fresh `.env` with random development-only
secrets (never a value that also protects a real deployment), installs dependencies, generates the
Prisma client, applies migrations, and seeds synthetic fixtures.

```sh
pnpm dev          # start the API and web app inside the Codespace
make doctor       # same health check as local
```

Ports 3000 (web), 3001 (api), 5432 (postgres), 7474/7687 (neo4j), 8080 (keycloak) forward
automatically; VS Code/the browser will prompt you.

**Known rough edge:** a real browser-driven Keycloak sign-in inside a Codespace has not yet been
verified end-to-end — the server-side OIDC issuer URL and the browser-facing forwarded-port URL are
not automatically the same address. If you hit this, the dev-header path above needs none of it and
covers most work in the meantime. See `DEVELOPMENT_ENVIRONMENT_STRATEGY.md`'s unresolved risks.

**Cost:** a GitHub Free personal account includes 120 core-hours/month — 60 hours on the recommended
2-core machine — before $0.18/core-hour applies. See `DEVELOPMENT_ENVIRONMENT_STRATEGY.md` for the
full cost model. Stop your Codespace when you are done (`gh codespace stop`, or it auto-stops after
30 minutes idle) — a stopped Codespace costs
only storage, not compute.

## Optional complete stack debugging (dev-full)

**When to use it:** explicitly requested isolated reproduction touching OpenSearch, MinIO,
NATS, or Ollama — none of which anything in the current codebase calls by default.

```sh
make dev-full
```

Locally, this is the configuration most likely to exhaust disk and hang Docker Desktop — see
`make doctor` before running it, and `make disk-usage` if something looks wrong afterward. Prefer a
Codespace for this too if your local disk is already tight.

## GitHub Actions — what runs where

| Check | Job | Infrastructure |
|---|---|---|
| Lint, format, typecheck | `static` | none |
| Unit + contract tests | `test` | none |
| Domain invariants, adversarial suites | `invariants` | none |
| **Live Postgres + Neo4j suites** | `integration` | disposable service containers, destroyed after the job |
| Build, bundle-size budget | `build` | none |
| Markdown/link/header checks | `docs` | none |
| CODEOWNERS/config/ADR/branch-naming | `governance` | none |

Every job here is also a `make` target — if it works locally (or in a Codespace) it works in CI, and
if it doesn't, that discrepancy is treated as a bug in the tooling, not the check.

GitHub Actions is the authoritative full validation layer. Interactive infrastructure debugging
is optional locally or in a Codespace; it is not required before pushing routine edits.

## Production separation

None of the above ever touches production. Explicitly:

- No development or Codespace configuration reads `DATABASE_URL`, `NEO4J_URI`, or `KEYCLOAK_URL`
  pointed at the real deployment — every generated `.env` uses locally-provisioned services.
- The production Keycloak realm is never used for development sign-in.
- Production object storage is never used for development uploads.
- No development or CI email configuration can reach a real recipient — see
  `docs/operations/EMAIL_OPERATIONS.md` for the deployed mailer's own environment gating.
- `WITNESS_DEPLOYMENT_PROFILE=development` (the default for all of the above) is refused by the
  application outside local/Codespace/CI use — see ADR-0013 and `packages/config`'s startup
  validation.

## Development data

**Never seed a development or Codespace database from a production dump.** `make seed` (or the
Codespace's automatic `postCreate.sh` step) populates synthetic fixtures only — see
`services/api-gateway/prisma/seed.ts`'s own header for why: seeding with real deliberation would
violate the same consent framework the product exists to enforce.

`make reset-data` wipes and re-seeds if your local data gets into a state you don't want to debug.

## Disk and Docker hygiene

```sh
make doctor       # warns before disk gets critical, not after
make disk-usage   # shows what Witness's own Docker resources/worktrees are using, and safe cleanup commands
```

`make disk-usage` never suggests `docker system prune` or any other blanket command — those affect
every project on your machine, not just this one. It only ever names Witness-owned resources and the
exact command to remove each one.

## Two-paying-organisation architecture review

This environment strategy, and Witness's production architecture generally, is deliberately
optimised for low cost before meaningful customer revenue. A full infrastructure/capacity review is
**mandatory once the second paying organisation onboards** — see ADR-0029's own trigger section and
`DEVELOPMENT_ENVIRONMENT_STRATEGY.md`'s scale stages for what gets reassessed at that point.
