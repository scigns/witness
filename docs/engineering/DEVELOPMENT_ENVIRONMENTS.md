# Development Environments

**Owner:** Engineering
**Status:** Active
**Related:**
[ADR-0029](../../architecture/decisions/ADR-0029-development-environment-strategy.md),
[DEVELOPMENT_ENVIRONMENT_STRATEGY.md](./DEVELOPMENT_ENVIRONMENT_STRATEGY.md)

A new contributor should be productive from this document alone — no tribal knowledge required.

## The short version

- **Editing, Git, unit tests, browser testing** → your own machine, no Docker required.
- **Real Postgres/Neo4j/Keycloak, cross-service work** → a GitHub Codespace (`.devcontainer/`), not
  your own Docker install.
- **"Does this actually work end to end?"** → GitHub Actions, which runs the live suites against
  disposable Postgres/Neo4j on every PR.
- **Production** → never a development target, by any of the above. See "Production separation"
  below.

## Local lightweight development (dev-lite)

**When to use it:** almost always. Most domain/API/web changes, all unit tests, and most PR review
need nothing more than this.

```sh
make bootstrap   # first time only: prerequisites, pnpm install, prisma generate
make dev         # starts Postgres only
make migrate
make seed        # synthetic fixtures — see "Development data" below
make app         # pnpm dev — runs the API and web app
make doctor      # check environment health any time something feels off
```

This runs under `WITNESS_DEPLOYMENT_PROFILE=development` (the `.env.example` default), which accepts
an unverified `X-Witness-Dev-User: <name>|<role>` header instead of real Keycloak auth. That is
correct and expected for this tier — it is not a security bug, and it is why Keycloak does not need
to run for most work.

**Does not need Docker at all** if you already have a Postgres reachable some other way; `make dev`
is simply the documented way to get one.

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

## The complete stack (dev-full)

**When to use it:** release-candidate acceptance, or work that genuinely touches OpenSearch, MinIO,
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

GitHub Actions is validation, not a place to develop interactively — do not treat a workflow run as
a substitute for `make dev`/a Codespace.

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
