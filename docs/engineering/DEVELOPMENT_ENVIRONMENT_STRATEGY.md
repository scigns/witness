# Development Environment Strategy

**Owner:** Engineering
**Status:** Active — see ADR-0029 for the binding decision; this document is the fuller reasoning,
measurements and unresolved items behind it.
**Related:** [ADR-0029](../../architecture/decisions/ADR-0029-development-environment-strategy.md),
[DEVELOPMENT_ENVIRONMENTS.md](./DEVELOPMENT_ENVIRONMENTS.md)

## The principle

**The product must be reproducible from Git, not from the state of one developer's laptop.**

## Current problem

Not simply low disk space. During this work, on a 228 GiB volume with the repository as the primary
occupant, the following were **observed directly, in sequence, not hypothesised**:

1. Free disk fell to ~440 MB after routine `pnpm install`/Next.js build/Docker-pull activity across
   several worktrees.
2. `docker ps` and `docker info` began hanging (not erroring — hanging, past a 120-second timeout).
3. After disk pressure was relieved (unrelated log/cache cleanup freed several GB), Docker Desktop's
   daemon remained unreachable.
4. `open -a Docker` failed to relaunch it (`_LSOpenURLsWithCompletionHandler` error), and it did not
   recover after a further 150 seconds of waiting.

Docker Desktop remained non-functional on this machine for the remainder of this work — a real,
current illustration of the risk this document exists to remove, not a worst-case scenario invented
to justify it.

**Root cause, structurally:** the integration stack grew from 2 services (Postgres, Valkey) at
0.1.0 to 9 (Neo4j, OpenSearch, Keycloak, MinIO, NATS, Ollama, plus an observability stack) as later
phases landed. Running all of it, repeatedly, through one Docker Desktop installation was never
re-evaluated as the codebase grew.

## Measured resource usage

Measured on this repository's checkout at the time of writing (`du`, `df`, `docker system df` where
Docker was reachable):

| Item | Size | Notes |
|---|---|---|
| Top-level `node_modules` (pnpm-hoisted) | 993 MB | Shared across the whole workspace via pnpm's content-addressed store |
| `.turbo` build cache | 1.0 GB | Regenerable; safe to delete, never done automatically |
| `apps/marketing/.next` | 65 MB | Per-app Next.js build cache |
| `apps/web/.next` | 59 MB | Per-app Next.js build cache |
| pnpm global store (`~/Library/pnpm/store`) | 3.5 GB | Shared across every worktree on the machine — a second worktree's `pnpm install` cost is near-zero marginal disk because of this |
| Whole checkout (one worktree) | 2.2 GB | Includes all of the above |

Docker image sizes below are **documented publication sizes for the pinned tags, not measured on
this machine** (the daemon was down for the relevant window) — stated as an estimate, not a
measurement, per this document's own evidence standard:

| Image | Approx. published size | Typical RAM while running |
|---|---|---|
| `pgvector/pgvector:pg16` | ~380 MB | ~200 MB idle |
| `valkey/valkey:8-alpine` | ~30 MB | ~10 MB — **unused by any code in this workspace today**, see below |
| `neo4j:5-community` | ~550 MB (grows with graph data) | 2 GB heap configured (`NEO4J_HEAP`) |
| `quay.io/keycloak/keycloak:26.0` | ~500 MB | ~512 MB–1 GB |
| `opensearchproject/opensearch:2` | ~1.4 GB | 1 GB heap configured, the single heaviest service |
| `minio/minio:latest` | ~150 MB | ~256 MB |
| `nats:2-alpine` | ~20 MB | ~50 MB |
| `ollama/ollama:latest` | ~1–2 GB image; **pulled models add multiple GB each** (e.g. a Llama 3 8B model is ~4.7 GB) | Model-dependent; this is the single largest realistic disk consumer if a model was ever pulled |

A `dev-full` cold pull (every image above, no models) is comfortably several GB in one operation —
consistent with why `make doctor`'s hard-stop threshold is set where it is.

### Service categorisation

| Service | Tier | Needed for | Docker required? |
|---|---|---|---|
| Postgres | 1 (lite) | Everything — system of record | Yes, or any reachable Postgres 16 |
| Valkey | — | **Nothing today** — no code in the workspace connects to it (verified by grep, not assumed); kept documented for planned cache/rate-limiting use | N/A until adopted |
| Neo4j | 2 (integration) | Evidence Knowledge Graph work only; `KnowledgeGraphQueryService` connects lazily, `/ready` reports `not_configured` otherwise | Yes |
| Keycloak | 2 (integration) | Real OIDC sign-in flows; the `development` profile's dev-header path needs none of it | Yes |
| OpenSearch | 3 (full) | Not called by any current code path (`.env.example`: "planned lexical search projection") | Yes |
| MinIO | 3 (full) | Only the `hybrid`/`cloud-managed` object-storage path; the `sovereign` profile default stores bytes in Postgres | Yes |
| NATS | 3 (full) | Not called by any current code path (`.env.example`: "planned event transport") | Yes |
| Ollama | 3 (full) | Local transcription/summarisation drafting | Yes, plus a pulled model |
| Observability (Prometheus/Tempo/Loki/Grafana) | 3 (full, separate compose file) | Observability work only | Yes |

## Selected architecture

```text
Mac
  ├─ editing / browser / light tests
  │
GitHub
  ├─ source
  ├─ PRs
  ├─ Actions CI (unit, invariants, live Postgres+Neo4j integration, build)
  └─ Codespaces remote development
       │
       ├─ disposable PostgreSQL
       ├─ disposable Neo4j
       ├─ Keycloak
       ├─ API
       └─ web

DigitalOcean
  └─ production only — unchanged, untouched by this work
```

See ADR-0029 for the full decision record, alternatives considered, and why each of Kubernetes, a
production move, GitLab migration, and a mandatory self-hosted runner were rejected or deferred.

## Codespaces setup

`.devcontainer/devcontainer.json` + `.devcontainer/docker-compose.yml` reuse
`infrastructure/docker/docker-compose.yml` directly (a compose-file merge, via `dockerComposeFile`'s
array form) rather than defining Postgres/Neo4j/Keycloak a second time — one file remains the single
source of truth for how those three services are configured, whether started locally or in a
Codespace. The override file adds one `workspace` service (the codespace's own container, an
official `mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm` image) and uses the Compose
`!reset` merge tag to lift the `integration`/`full` profile gate on Neo4j/Keycloak specifically for
the Codespace context, since the devcontainer tooling's `runServices` does not pass a `--profile`
flag.

`.devcontainer/postCreate.sh` runs once per Codespace creation: generates a fresh `.env` with
per-Codespace random secrets (`openssl rand -hex 20`, never a value that also protects a real
deployment), points server-to-server connections at compose service names (`postgres`, `neo4j`)
rather than `localhost`, enables corepack (pinning pnpm to the exact version in `package.json`),
installs dependencies, generates the Prisma client, applies migrations, and seeds synthetic
fixtures.

**Machine size:** the smallest Codespaces machine GitHub offers (2-core, 4 GB RAM, 32 GB storage) is
the recommended starting point. Four containers (workspace, postgres, neo4j, keycloak) fit
comfortably at idle; Neo4j's configured 2 GB heap is the single largest consumer and is the reason
not to try the smallest machine below this if graph work is the goal. **Escalate to 4-core only if
measurement (not assumption) shows the 2-core machine struggling** — not before.

**Codespaces cost, checked live for this document (GitHub's own published pricing, not estimated):**
a GitHub Free personal account includes 120 core-hours/month plus 15 GB-month of storage. Usage is
core-hours (elapsed hours × machine cores), so the 2-core machine recommended above gives **60 hours
of actual development time per month before any charge**, at a constant $0.18/core-hour beyond that
regardless of machine size, and $0.07/GB-month for storage beyond the included 15 GB. A stopped
Codespace (auto-stops after 30 minutes idle by default) bills only storage, not compute — stopping
between sessions rather than leaving one running is the single biggest lever on this cost.
[github.com/pricing](https://github.com/pricing)

**Verification status — stated plainly, not implied:** the devcontainer configuration has been
**syntax- and schema-validated** (`docker compose config` against the merged files succeeds, all
four services resolve, the merged config is a valid Compose document) but **no actual GitHub
Codespace has been created and booted from it**. Doing so consumes the repository owner's Codespaces
quota/cost and was not done without asking first — see "Unresolved risks."

## GitHub Actions strategy

### What already existed (verified by reading `.github/workflows/ci.yml`, not assumed)

- Concurrency cancellation on superseded commits, already correctly scoped to non-`main` refs.
- `pnpm`-aware dependency caching via `actions/setup-node`'s `cache: pnpm`.
- A `detect` job gating every code-touching job on the presence of an installable workspace.
- Separate `docs`/`governance`/`static`/`test`/`invariants`/`build` jobs, converging on one `gate`
  job that fails if any required job failed or was cancelled.

### What this work added

- **A new `integration` job**: real Postgres (`pgvector/pgvector:pg16`) and Neo4j (`neo4j:5-community`)
  as GitHub Actions service containers, health-checked, destroyed when the job ends. Runs
  `prisma migrate deploy` then the three live suites (`@witness/api`, `@witness/knowledge-graph`,
  `@witness/graph-projector`) that previously only ran against a contributor's own Docker. Added to
  the `gate` job's required list.
- **Turbo build-output caching** (`actions/cache@v4` on `.turbo`, keyed on commit SHA with an
  OS-scoped restore-key fallback) added to every code-touching job (`static`, `test`, `invariants`,
  `integration`, `build`) — previously every job rebuilt from a cold cache.

### What was identified but deliberately not implemented

- **Path-based filtering** (skip `static`/`test`/`invariants`/`integration`/`build` entirely for a
  documentation-only PR). The existing `detect` job answers "does this repository contain code,"
  not "did this PR touch code" — a different, new distinction. Recommended concrete implementation:
  `dorny/paths-filter@v3`, pinned by commit SHA to match this repository's existing action-pinning
  convention, gating on `apps/**`, `packages/**`, `services/**`, `workers/**`, `sdk/**`,
  `pnpm-lock.yaml`. Not implemented here because a rushed version risked a CI gate that silently
  skips real tests on a code-containing PR — a worse failure than the minutes it would have saved.

### Workflow validation status

The updated `ci.yml` has been **parsed and structurally validated** (a real YAML parse confirming
job/step/`needs` graph correctness, `docker compose config` confirming the referenced images and
env vars resolve) but **has not yet been exercised by a real GitHub Actions run** — pushing a branch
to trigger one was not done without asking first (see "Unresolved risks"). `scripts/ci/check-config-syntax.sh`
and `scripts/ci/check-adrs.sh` — the repository's own existing governance checks — both pass against
every file this work touched.

## GitHub Actions cost model

Estimated, not measured (no run has executed the new job yet):

| Usage pattern | `integration` job frequency | Rough monthly Actions minutes (all jobs combined) |
|---|---|---|
| Light (occasional PRs) | ~5–10 runs/month | Well within GitHub's free-tier included minutes for a private repo on any paid plan, and unlimited for a public repo |
| Normal solo development | ~30–60 runs/month | Likely within included minutes; monitor via the Actions usage dashboard rather than assume |
| Heavy (multiple PRs/day, several pushes each) | 100+ runs/month | Watch the billing dashboard; turbo caching and concurrency cancellation both reduce this, but no specific ceiling is asserted here without measurement |

No unsupported billing assumption is made beyond this — GitHub's own included-minutes tables (which
change over time and by plan) are the authority, not this document.

## DigitalOcean development-Droplet alternative

**Not deployed. Documented as the trigger-based alternative, not spent against pre-emptively.**

| | Codespaces | DigitalOcean dev Droplet |
|---|---|---|
| Cost | Free tier likely covers solo usage; pay-per-use beyond it | $24/month for a 2 vCPU/4 GiB Basic Droplet (DigitalOcean's published pricing, checked live for this document — [digitalocean.com/pricing/droplets](https://www.digitalocean.com/pricing/droplets)), +20%/month for weekly backups or +30%/month for daily |
| Persistence | Ephemeral by default (stoppable, storage persists while stopped) | Fully persistent, always-on unless deliberately stopped |
| Setup | `.devcontainer/` — reproducible from Git | Manual provisioning + the same Compose file, SSH/VS Code Remote SSH |
| Shared use | One Codespace per developer | Naturally shared if multiple engineers need the same running services |
| Becomes preferable when | — | Codespaces usage consistently exceeds included quota; 2+ engineers need a shared integration environment; Codespaces startup/build overhead becomes material; full-stack testing needs more predictable resources than an ephemeral machine |

None of the "becomes preferable" conditions hold today (one contributor, pre-revenue).

## GitLab comparison

| | GitHub (current) | GitLab |
|---|---|---|
| Migration effort | None | Rewrite CI, re-establish CODEOWNERS/branch-protection equivalents, migrate issues/PRs |
| CI quota | Actions minutes, as above | GitLab CI has its own included-minutes model; no measured advantage found |
| Codespaces-equivalent | Native (GitHub Codespaces) | GitLab Web IDE / remote development is less mature for this exact devcontainer-based workflow |
| Net benefit found | — | None overwhelming enough to justify the migration cost |

**Not recommended.** No material benefit was found; ADR-0029 records this as rejected.

## Security boundaries

- No production secret appears in `.devcontainer/`, `postCreate.sh`, or `ci.yml` — every credential
  either of those two paths sets is freshly generated (`openssl rand -hex 20` for the devcontainer,
  fixed non-secret placeholder values like `witness-ci-only` for CI service containers that are
  destroyed at job end and never reachable outside the job's own network).
- Development, staging (none exists yet) and production configuration remain distinct — no
  mechanism introduced here lets a Codespace or CI job default to a production API, database, or
  identity provider.
- Untrusted pull-request code still runs only on hosted, ephemeral GitHub-managed runners, never a
  persistent self-hosted machine — deliberately preserved, not merely left unexamined (see ADR-0029's
  "Alternatives considered").

## Developer workflow

See `DEVELOPMENT_ENVIRONMENTS.md` for the full, example-driven walkthrough. In short:
`make bootstrap` → `make dev` → `make migrate` → `make seed` → `make app`, with `make doctor`
available any time, and a GitHub Codespace as the on-ramp to `dev-integration` without touching
local Docker at all.

## CI workflow

See "GitHub Actions strategy" above and the table in `DEVELOPMENT_ENVIRONMENTS.md` for exactly which
check runs where.

## Production separation

Restated from `DEVELOPMENT_ENVIRONMENTS.md`: no development or Codespace configuration reads a
production `DATABASE_URL`, `NEO4J_URI`, or `KEYCLOAK_URL`; no development seed touches real data;
`WITNESS_DEPLOYMENT_PROFILE=development` is refused outside local/Codespace/CI use by the
application's own startup validation (unchanged by this work).

## Cost controls

- Codespaces: smallest working machine (2-core/4GB) recommended as the default, not the largest
  available; no prebuilds configured (they consume Actions minutes for a benefit not yet
  demonstrated — CW-equivalent reasoning to this project's own "no premature investment" discipline
  elsewhere); rely on Codespaces' own default auto-stop-on-idle rather than configuring a shorter one
  pre-emptively.
- GitHub Actions: turbo caching and existing concurrency cancellation both reduce redundant compute;
  path-filtering identified as a further optimisation, not yet implemented (see above).
- No production dataset, object storage replication, or production credential is ever pulled into
  either environment — the cost of a data breach via a development environment is architecturally
  excluded, not merely discouraged.

## Two-paying-organisation review trigger

Restated from ADR-0029: **a full infrastructure/capacity review is mandatory once the second paying
organisation onboards.** At that point, reassess production CPU/RAM, database and Neo4j load, object
storage and backup/restore capacity, monitoring, dev/staging/prod separation, tenant isolation, data
residency and sovereign-hosting requests, support/SLA expectations, CI capacity, developer team size,
and deployment automation — and specifically, whether a persistent shared DigitalOcean development
environment has become preferable to Codespaces per the comparison above. This is a decision gate,
not a pre-committed architecture; the review may conclude no change is needed.

## Future scale stages (tentative — decision gates, not committed architecture)

### Stage 0 — current (0 paying organisations, pilot development)

Priorities: minimum cost, reproducibility, product completion, production safety. Environment:
lightweight local + Codespaces + hosted CI, exactly as this document describes.

### Stage 1 — two organisations

Mandatory review (above). Assess: persistent shared dev environment, formal staging, production
resizing, customer-specific hosting.

### Stage 2 — several organisations

Likely needs: clear dev/staging/prod separation, improved observability, dedicated backup
procedures, capacity monitoring, formal support procedures.

### Stage 3 — enterprise/sovereignty customers

Evaluate: dedicated deployment, regional hosting, isolated databases, customer-managed deployment,
contractual SLA, SSO/SCIM, security assessments. Not committed architecture — decision gates.

## Unresolved risks

1. **No real GitHub Codespace has been created and booted from this configuration.** Syntax/schema
   validation is real; end-to-end verification (does `postCreate.sh` actually complete, do all four
   services actually reach `healthy`, does `pnpm dev` actually serve the app through forwarded
   ports) is not. Creating one consumes the repository owner's Codespaces quota/cost — recommended
   as the very next step, with explicit go-ahead.
2. **No real GitHub Actions run has exercised the new `integration` job or the turbo-cache
   additions.** Pushing a branch to trigger one is low-cost on a repository already using hosted
   Actions, but was not done without asking first, consistent with this session's general practice
   of confirming before actions with an external, account-level effect.
3. **Real Keycloak OIDC sign-in through a Codespace's forwarded ports is a known, unsolved rough
   edge** (see ADR-0029's consequences) — documented, not fixed. The dev-header path is unaffected
   and covers most work.
4. **The extended `services/api-gateway/prisma/seed.ts` fixtures (organisation, workspace, four
   users with different roles, a session, one evidence record) have been type-checked against the
   real generated Prisma client (a temporary, scoped `tsc` project confirmed zero errors) but have
   not been run against a live database** — Docker/Postgres were unavailable for the remainder of
   this work. Recommended as part of the same first Codespace verification in risk 1.
5. **Docker Desktop itself remains non-functional on the machine this work was done on.** Restarting
   or repairing it was not attempted — outside this task's scope, and the entire point of this
   strategy is that fixing one laptop's Docker installation should no longer be a blocking
   dependency for Witness development.

## What is safe to merge now

Every change in this work is additive to development tooling: compose profile tags, a devcontainer
configuration, CI workflow additions, two new `scripts/dev/*.sh` read-only or narrowly-scoped
scripts, an extended (never destructive) seed script, and documentation. **Nothing here changes
production configuration, deployment, or the application's own runtime behaviour** — `packages/config`'s
`WITNESS_DEPLOYMENT_PROFILE` validation, the actual compose service definitions besides their
`profiles:` tags, and every production script under `scripts/pilot/`/`scripts/ops/` are untouched.
