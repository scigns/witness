# Developer Guide

**Owner:** Developer Experience Lead
**Status:** Active — target state for Phase 2

> **Witness is pre-implementation.** The toolchain below is the Phase 2 target. Until then,
> contributions are documentation, architecture, research and governance — which is what the project
> needs now. See [`STATUS.md`](../../STATUS.md).

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 LTS | See `.nvmrc`; use `nvm`, `fnm` or `mise` |
| pnpm | 9+ | `corepack enable` — do not install separately |
| Docker | 24+ | With Compose v2 |
| Make | any | Task entry point |
| Git | 2.40+ | |
| Python | 3.11+ | Only for ML workers and the Python SDK |

**Resources:** 16 GB RAM minimum for the full stack (8 GB with the minimal profile), 20 GB disk. A
GPU is optional — without one, transcription is 6–10× slower than realtime, which is fine for
development against short fixtures.

## First run

```bash
git clone https://github.com/scigns/witness.git
cd witness

make bootstrap    # checks prerequisites, installs deps, creates .env
make dev          # starts Postgres, Neo4j, OpenSearch, Valkey, MinIO, Keycloak, NATS
make verify       # lint, typecheck, test, build — the same gates CI runs
```

If `make bootstrap` fails, that is a defect in our tooling. Open a `type:bug` issue — do not work
around it silently, because the next person will hit the same thing.

## Everyday commands

| Command | Does |
|---|---|
| `make dev` | Start the local stack |
| `make dev-obs` | Stack plus Prometheus, Grafana, Tempo, Loki |
| `make down` | Stop, keeping data |
| `make clean` | Stop and **destroy** local data |
| `make logs` | Tail stack logs |
| `make reset-data` | Wipe and re-seed synthetic fixtures |
| `make verify` | **Every gate CI runs.** Do this before opening a PR |
| `make test` | Unit and integration |
| `make test-e2e` | End-to-end (needs the stack) |
| `make security` | Secrets, dependencies, licences, containers |
| `make egress-test` | Verify the sovereign profile makes zero external calls |
| `make adr TITLE="..."` | New ADR from the template |
| `make docs-lint` | Markdown lint and link check |

## Local services

| Service | URL | Credentials |
|---|---|---|
| Web app | <http://localhost:3000> | via Keycloak |
| API gateway | <http://localhost:4000> | |
| GraphQL playground | <http://localhost:4000/graphql> | dev only |
| Keycloak | <http://localhost:8080> | `admin` / see `.env` |
| Neo4j browser | <http://localhost:7474> | see `.env` |
| OpenSearch Dashboards | <http://localhost:5601> | |
| MinIO console | <http://localhost:9001> | see `.env` |
| Grafana | <http://localhost:3001> | `admin` / `admin` |

## Synthetic data

**Never use real recordings, transcripts or personal data — including your own meetings.** Fixtures
live in [`examples/`](../../examples/): a community consultation, a parliamentary session and a
quickstart set, all synthetic, with known ground truth so extraction accuracy is measurable.

`make reset-data` re-seeds them.

## Adding something new

| Adding | Do this |
|---|---|
| **A service** | `pnpm gen:service <name>` from `templates/service/` — generates the hexagonal structure with all gates passing |
| **A package** | `pnpm gen:package <name>` |
| **An endpoint** | Contract in `packages/contracts` **first**, then implement, then contract test |
| **An event** | Add to `packages/contracts/events` and [`EVENT_CATALOGUE.md`](../../architecture/EVENT_CATALOGUE.md), then implement |
| **A dependency** | Entry in [`OSS_EVALUATION.md`](../research/OSS_EVALUATION.md) with a replacement strategy, then add |
| **A migration** | `pnpm db:migrate:new <name>` — must be reversible; test both directions |
| **An ADR** | `make adr TITLE="..."` |

The templates exist so the easy path is the correct path. If a template produces something that fails
a gate, that is a bug in the template.

## Debugging

**A trace is faster than a log.** Grafana → Tempo, search by trace ID. Trace context propagates
through NATS, so an async pipeline is one trace from upload to graph.

| Symptom | Look at |
|---|---|
| Nothing appears in the graph | `projection_lag_events`; projector logs; is the assertion confirmed? |
| Consent denial you did not expect | Consent service decision log — it records *why* |
| Search returns nothing | Index status; permission filter; is the projection current? |
| Transcription stuck | Worker queue depth; dead-letter queue; model availability |
| Everything is slow | Check you are not running the full observability stack on 8 GB |

## Common problems

| Problem | Fix |
|---|---|
| Port already in use | `make down`, check for a stray container |
| `pnpm install` fails | `corepack enable`; check Node version against `.nvmrc` |
| Tests pass locally, fail in CI | Almost always test ordering or a shared fixture. Run `make test` with a clean stack |
| Turborepo serving a stale build | `pnpm build --force`; check task inputs are declared |
| Keycloak will not start | Usually memory. Give Docker ≥ 8 GB |
| Out of disk | `make clean`, then `docker system prune` |

## Editor

VS Code settings and recommended extensions are committed in `.vscode/`. Essentials: ESLint,
Prettier, and format-on-save. Any editor is fine — but formatting must match Prettier, because CI
does not care about your preferences.

## Getting help

1. Search [`docs/`](../) — and if the answer should have been there, open a `type:docs` issue. That
   is a real bug, not a complaint.
2. Search existing issues and discussions.
3. Ask in GitHub Discussions.
4. Ask the domain lead ([`agents/`](../../agents/) names them).

**Asking is faster than guessing.** Nobody is judged for asking; people are judged for shipping a
guess.
