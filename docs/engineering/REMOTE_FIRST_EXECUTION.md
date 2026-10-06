# Remote-first execution audit

**Owner:** Platform Engineering
**Status:** Active — audited 6 October 2026 from checkpoint `7879897`

## Default operating model

Edit → optional cheap targeted checks → commit explicit paths → push → inspect GitHub Actions.
Docker Desktop may remain stopped. Once the push succeeds, the laptop can be shut down:
GitHub-hosted jobs and the deployment runner do not use its Docker daemon, filesystem or processes.
`AGENTS.md` and `CLAUDE.md` establish this default for coding agents; full local gates are optional
reproduction tools, never a prerequisite for opening a PR. CI must pass before merge.

## Command classification

| Class                       | Commands / entry points                                                                                                                                                                   | Execution policy                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A: lightweight/local-safe   | Git status/diff, `git diff --check`, `make help`, `gh pr checks`, `gh run view`, Prettier/ESLint on explicit changed files, `bash -n`, selected service-free tests                        | Optional developer checks; no Docker                                                |
| A: setup                    | `make bootstrap`, default `scripts/dev/check-prerequisites.sh`                                                                                                                            | Node/pnpm/Git and dependency install only; no daemon probe, DB or Prisma generation |
| B: optional local debugging | `make bootstrap-runtime`, `make dev`, `dev-integration`, `dev-full`, `dev-obs`, `app`, `doctor`, `disk-usage`, `migrate*`, `seed`, local browser acceptance                               | Explicit opt-in; synthetic isolated resources; Docker required for Compose          |
| C: CI-authoritative         | `make verify`, `make test`, `make build`, full lint/typecheck/format, `pnpm verify`, `pnpm test*`, `pnpm build`, invariants/adversarial, live API/graph/projector suites, security/CodeQL | GitHub-hosted runners; local execution only for explicit reproduction               |
| C: full rehearsal tools     | `release-check`, `scripts/release/preflight.sh`, migration/restore rehearsals and complete acceptance suites                                                                              | Deliberately provisioned isolated rehearsal environment, not routine Mac validation |
| D: production-server-only   | `pilot-deploy`, `pilot-backup`, `pilot-status`, `pilot-backup-status`, `scripts/pilot/*`, live acceptance                                                                                 | Approved deployment/operator path; never local development prerequisites            |

Production acceptance requires separately authorised controlled test data. Class D does not imply
permission to mutate production. Backup, object recovery, migration, exact-SHA/image approval,
rollback compatibility and client acceptance gates remain intact and unresolved where recorded in
the [release matrix](../release/PRODUCTION_RECONCILIATION_2026-10-06.md).

## Findings and corrections

Previously, bootstrap required Docker and queried daemon memory; setup examples started Postgres
and prescribed full verification. Agent handoffs, PR checklists and developer guidance required
`make verify` locally. These defaults unnecessarily consumed laptop RAM. Bootstrap is now
Docker-free; `bootstrap-runtime` preserves the previous opt-in runtime setup. PR and agent
instructions now require remote check evidence rather than duplicate local full gates.

Root `package.json` full-suite commands remain available. `turbo.json` lint/typecheck/test tasks
depend on `^build`; a filtered Turbo command can still compile dependencies. Invariant/adversarial
scripts explicitly build first. Avoid these as cheap local checks. Commit hooks remain staged-file
lint/format, branch validation and secret scanning; the push secret scan can inspect full Git
history but requires no Docker, DB or application build. No hooks or security checks are weakened.
Codespaces remain optional interactive debugging infrastructure, not mandatory paid CI.

## Verified compute boundaries

`ci.yml` runs static, unit/contract, invariants/adversarial, build and disposable Postgres/Neo4j
integration jobs on `ubuntu-latest`. `security.yml` and `codeql.yml` also use GitHub-hosted runners.
Only `deploy.yml` uses `[self-hosted, witness-pilot]`; no PR CI is assigned to the production host.
Those workflow files and their gate dependencies are unchanged by this task. Production resources
retain priority; do not add general CI jobs to that runner.

## Artifact migration follow-up

The subsequent [registry artifact pipeline](../release/REGISTRY_ARTIFACT_PIPELINE_2026-10-06.md)
implements the smallest GHCR migration identified here: build/validate once on hosted CI, publish
retained bytes only from a deliberate trusted exact-SHA tag, then pull approved digests on the
existing deployment runner without compilation. Production deployment remains disabled and no
release/recovery gate is satisfied by this migration alone. No general CI moved onto the server.

## Remaining CI efficiencies

Existing pnpm caching, Turbo output caches, parallel jobs and PR concurrency cancellation already
reduce CI work. Independent job installs provide isolation; merging them is not automatically an
improvement. Invariants/adversarial each request a workspace build (normally Turbo-cache hits),
while other jobs also build. Measure cache hit rates before changing this. Path selection currently
detects an installable workspace, not affected paths; safer affected selection needs coverage proof
and an always-reporting aggregate gate. No test, security or integration job is skipped for this task.

## Completion evidence

The isolated change keeps the active release branch/history and protected untracked mobile work.
Local validation is limited to changed-file formatting, shell syntax, diff review and a fake-tool
prerequisite check proving no Docker call in default mode. Full validation follows the push in
GitHub Actions. Remaining local requirements are Git/network for pushing and inspecting results,
and Node/pnpm when choosing targeted checks or using installed hooks. No laptop daemon or service
must stay running after push.
