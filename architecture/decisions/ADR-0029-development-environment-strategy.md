# ADR-0029: Development environment strategy — Codespaces-first, CI-verified, local-optional

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-25 |
| **Deciders** | Principal Architect, Engineering Lead |
| **Consulted** | Security |
| **Informed** | All contributors |
| **Supersedes** | none |
| **Related** | ADR-0013 (single-node Compose as a first-class production target), ADR-0009 (sovereignty) |
| **Principles engaged** | P1 (sovereignty — production untouched by this), P6 (evidence over assertion) |

## Context

Witness's integration stack (`infrastructure/docker/docker-compose.yml`) grew from two services
(Postgres, Valkey) at 0.1.0 to nine (adds Neo4j, OpenSearch, Keycloak, MinIO, NATS, Ollama, plus an
observability stack) as Phases 2–5 landed real Keycloak-backed auth, the Evidence Knowledge Graph,
and object storage. Running the full stack repeatedly on one contributor's laptop, through Docker
Desktop, produced — measured directly during this ADR's own preparation, not hypothesised — disk
exhaustion (`ENOSPC` from `docker pull`/`pnpm install`/`next build`), a hung, unresponsive `docker`
CLI, and Docker Desktop itself failing to relaunch after the disk pressure passed. This happened on
a 228 GiB volume; the constraint is Docker's own VM disk allocation and this repository's image
footprint, not raw laptop capacity.

Two facts changed the calculus since ADR-0013 was written:

- **Most of the stack is not needed for most work.** `neo4j` connects lazily (only on the first
  actual graph query) and `keycloak` is bypassed entirely by the `development` deployment profile's
  `X-Witness-Dev-User` header — the majority of domain/API/web work in this codebase has been done,
  by measured practice, against Postgres alone.
- **The live-database test suites (`*.live.test.ts`, real Postgres; `*.live.test.ts` in
  `services/knowledge-graph`/`workers/graph-projector`, real Neo4j) have never run anywhere except a
  contributor's own Docker.** No CI workflow invoked `test:live` before this ADR. A regression only
  a live database could catch had exactly one place it could be caught: the founder's laptop.

## Decision

> **A contributor's own machine is for editing, Git, unit tests and browser testing. Heavy
> integration infrastructure (Postgres, Neo4j, Keycloak) is reproducible on demand — in a GitHub
> Codespace for interactive work, and in GitHub Actions service containers for CI — never required
> to live permanently on one laptop.**

Concretely:

1. **Three local profiles, not one**, in the same `infrastructure/docker/docker-compose.yml`
   (unchanged file, refined `profiles:` tags — no new compose file, no Kubernetes, no change to
   ADR-0013's production target):
   - `make dev` (dev-lite): Postgres only.
   - `make dev-integration`: adds Neo4j, Keycloak.
   - `make dev-full`: the complete stack (adds OpenSearch, MinIO, NATS, Ollama, Valkey) — release-
     candidate acceptance only.
2. **A `.devcontainer/` reusing the same compose file** (`dockerComposeFile` array merge — no second
   definition of Postgres/Neo4j/Keycloak to drift from the first) — GitHub Codespaces becomes the
   default place to run `dev-integration`, not a contributor's own Docker.
3. **A new `integration` CI job** with disposable Postgres and Neo4j service containers, running the
   live suites on every PR. This is the actual fix for "a live-database regression was only ever
   caught on one laptop" — proven by running there, not merely made possible.
4. **`make doctor`**: a fast, read-only check (disk, toolchain, Docker, Postgres, ports) that warns
   *before* a long operation starts, calibrated against this ADR's own measured failure (disk
   exhaustion below ~2 GiB free is where `docker pull`/`pnpm install` have actually failed).
5. **Production is explicitly not a development target** — restated, not changed: no code here
   reads a production database, Neo4j, Keycloak realm, object store, or email recipient. This ADR
   introduces no new path to any of those.

### What this ADR does not do

- **No Kubernetes.** Nine service containers on one Codespace machine is still well inside what
  Compose handles; Kubernetes would add an orchestration layer this project does not need at this
  scale.
- **No production move.** ADR-0013's single-node Compose target for customer deployments is
  untouched. This ADR is entirely about where a *contributor* runs infrastructure, never where a
  *customer's* Witness instance runs.
- **No mandatory self-hosted CI runner.** Evaluated (see "Alternatives") and deliberately deferred:
  running untrusted pull-request code on a persistent, privileged runner is a real trust-boundary
  risk this project does not need to accept yet. Hosted GitHub Actions runners remain the default.
- **No GitLab migration.** No material benefit was found that offsets the migration cost of leaving
  GitHub, where Actions, Codespaces and the existing CODEOWNERS/branch-protection setup already
  integrate natively.
- **No mandatory ephemeral preview environment per branch.** Deferred until either several engineers
  are contributing concurrently, or customer UAT needs an externally reachable build on demand —
  neither is true yet.

## Mandatory infrastructure review trigger

**A full infrastructure/capacity review is mandatory after the second paying organisation onboards**
— not automatically scheduled sooner, and not skipped because it "still feels fine" at that point.
At that trigger, reassess (not pre-decide): production CPU/RAM, database and Neo4j load, object
storage and backup/restore capacity, monitoring, dev/staging/prod separation, tenant isolation, data
residency and sovereign-hosting requests, support/SLA expectations, CI capacity, and whether a
persistent shared development environment (e.g. a DigitalOcean development Droplet) has become
economically preferable to Codespaces (see the comparison in
`docs/engineering/DEVELOPMENT_ENVIRONMENT_STRATEGY.md`). This is a decision *gate*, not a committed
future architecture — the review may conclude "no change needed."

## Alternatives considered

### Keep local Docker as the only development path (status quo)

**Rejected.** This is the problem, not a solution — it is what produced the disk exhaustion and
Docker Desktop failure this ADR responds to, and it structurally cannot be fixed by asking one
person to manage their disk more carefully; the stack itself has outgrown "always running on one
laptop."

### Move production to a shared/managed platform because local dev broke

**Rejected.** Conflates two unrelated problems. Local development pain is not evidence that
production's architecture (ADR-0013's single-node Compose) is wrong — no measurement here says
production is under-resourced, and reacting to a laptop's disk pressure by moving customer
infrastructure would be a solution to the wrong problem.

### Self-hosted GitHub Actions runner now

**Considered, deferred.** A remote dev server could plausibly also run CI, saving hosted-runner
minutes. But it means running arbitrary pull-request code (including from anyone who opens a PR
against a public-ish repository) on a persistent, credentialed machine — a real security trade
against a benefit (minutes saved) this project does not yet need at solo/pre-customer scale. Hosted
runners stay the default; revisit only if hosted-minutes usage or cost becomes a genuine constraint.

### GitLab migration

**Considered, rejected.** No committed workflow, integration, or cost advantage was found that
offsets rewriting CI, losing the existing GitHub-native Codespaces integration, and re-establishing
CODEOWNERS/branch-protection equivalents elsewhere. "Do not migrate unless there is an overwhelming,
documented benefit" — none was found.

### DigitalOcean development Droplet now

**Considered, deferred.** Becomes the better choice once Codespaces usage consistently exceeds its
included quota, two or more engineers need a shared persistent integration environment, or
full-stack testing needs more predictable resources than Codespaces' ephemeral machines. None of
those conditions hold at one contributor, pre-revenue. Documented as the explicit trigger, not
spent against pre-emptively.

## Consequences

### Positive

- A live-database regression (Postgres or Neo4j) is now caught on every PR, by CI, on disposable
  infrastructure — not only if and when someone happened to run the suite locally.
- A new contributor can be productive from `docs/engineering/DEVELOPMENT_ENVIRONMENTS.md` and a
  GitHub Codespace alone; no tribal knowledge about which services their laptop needs.
- `make doctor` turns "the operation failed two hours in with 440 MB free" into a warning before it
  starts.
- Zero change to production architecture, image set, or deployment path — this ADR is additive to
  development tooling only.

### Negative

- Two places now define local profile membership conditionally (the main compose file's `profiles:`
  tags and the devcontainer override's `!reset` clears) — a contributor extending the stack with a
  new service must remember to consider both. Mitigated by the file header comments in each
  explaining the other's existence.
- GitHub Actions minutes usage increases (one more job — `integration` — per PR, with two service
  containers). Mitigated by turbo output caching added in the same change, and bounded because the
  live suites themselves are already fast (seconds, not minutes) — see
  `docs/engineering/DEVELOPMENT_ENVIRONMENT_STRATEGY.md` for the measured job time.
- Codespaces' forwarded-port model means a real, browser-driven Keycloak OIDC flow inside a
  Codespace has a known rough edge (the OIDC issuer URL a server validates against and the URL a
  browser redirects to are not automatically the same address through a forwarding proxy) — not
  solved by this ADR, documented as a known limitation. The `development` profile's dev-header path
  needs none of this and covers most work.

### Risks accepted

- **Update, post-merge:** the CI `integration` job has now run end-to-end for real, on PR #232 —
  see `docs/engineering/DEVELOPMENT_ENVIRONMENT_STRATEGY.md`'s "Unresolved risks" for what it found
  and what was fixed. This item is resolved for CI; the devcontainer/Codespaces half (no actual
  Codespace created yet) remains open, tracked below.
- This ADR's devcontainer configuration has been syntax- and schema-validated (`docker compose
  config`, a real YAML parse) but **not yet run end-to-end** — no actual Codespace has been created
  from this configuration. Recorded as pending verification in
  `docs/engineering/DEVELOPMENT_ENVIRONMENT_STRATEGY.md` rather than claimed as proven, because
  creating a real Codespace has a cost/quota impact on the repository owner's account this ADR does
  not assume permission to spend without asking first.
- Path-based CI filtering (skip the expensive jobs entirely for documentation-only PRs) was
  identified as a further, real cost optimisation but deliberately not implemented here — the
  existing `detect` job answers "does this repository contain code," not "did this specific PR
  touch code," and hand-rolling that distinction under time pressure risked a CI gate that silently
  skips real tests on a code-containing PR, a worse failure mode than the cost it would have saved.
  Left as a documented follow-up with a concrete recommended implementation (`dorny/paths-filter`,
  pinned by SHA to match this repository's existing action-pinning convention).
