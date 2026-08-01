# Developer Onboarding

**Owner:** Developer Experience Lead
**Status:** Active — verified end-to-end on 2026-08-01 against Witness 0.1.0
**Audience:** a new engineer with a clean machine and no context

---

## What you will have at the end

Witness running locally: a web application at `http://localhost:3000`, an API at
`http://localhost:3001`, a PostgreSQL database with synthetic records, and a passing test suite.

Budget about fifteen minutes, most of which is downloading container images.

**Every command below has been executed against a clean clone.** If one fails for you, that is a
defect worth reporting — not something you are expected to work around.

---

## 1. Prerequisites

| Tool                | Version | Why                                                                  |
| ------------------- | ------- | -------------------------------------------------------------------- |
| Node.js             | 22.x    | `.nvmrc` pins it; `>=22 <23` is enforced by `package.json`           |
| pnpm                | ≥ 9     | Workspace manager (ADR-0016). `corepack enable` is the easiest route |
| Docker + Compose v2 | recent  | Runs PostgreSQL and, later, the full stack                           |
| Git                 | any     | —                                                                    |
| GNU Make            | any     | Every entry point is a `make` target                                 |

```bash
node --version      # v22.x
pnpm --version      # 9.x
docker compose version
```

Missing something? `bash scripts/dev/check-prerequisites.sh` tells you exactly what.

> **No Docker?** You can point `DATABASE_URL` at any PostgreSQL 16 you already have and skip step 4.
> Nothing else in the Developer Preview needs a container. The full stack in step 9 does.

## 2. Clone

```bash
git clone https://github.com/scigns/witness.git
cd witness
```

## 3. Bootstrap

```bash
make bootstrap
```

This checks prerequisites, creates `.env` from `.env.example` if absent, and installs dependencies.

`.env` is git-ignored and must never be committed. The defaults are the **sovereign** defaults:
nothing in them causes an outbound connection to any third party.

> **Change `POSTGRES_PASSWORD` before using this anywhere but your own machine.** The default is
> literally `change-me-in-every-environment`.

## 4. Start the database

```bash
make dev
```

Starts PostgreSQL and Valkey, then blocks until both report healthy — so the migration in step 5
cannot run against a database that is still initialising.

Only the services the Developer Preview actually uses start here. Neo4j, OpenSearch, Keycloak, MinIO,
NATS and Ollama are behind a `full` profile (step 9) because this build does not call any of them, and
starting them would imply an integration that does not exist.

```bash
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml ps
```

## 5. Apply migrations

```bash
make migrate
```

Creates `actor`, `source`, `record` and `audit_event`. To reset and start over:

```bash
make reset-data     # destroys local data, re-seeds; refuses to run against anything non-local
```

## 6. Seed synthetic fixtures

```bash
make seed
```

Three records in different review states, with valid hash-chained audit trails.

**Every fixture is invented.** Witness records real deliberation by real people; seeding a development
database with production data would violate the consent framework the product exists to enforce.

## 7. Start Witness

```bash
make app
```

Runs the API and the web application together.

|               |                                |
| ------------- | ------------------------------ |
| **Web**       | <http://localhost:3000>        |
| **API**       | <http://localhost:3001>        |
| **Liveness**  | <http://localhost:3001/health> |
| **Readiness** | <http://localhost:3001/ready>  |

Open <http://localhost:3000>. You should see the dashboard with system status, three seeded records,
and a list of what this build does not implement.

### Try the workflow

1. **Capture** → fill the form. The source description and date are required — a record without
   provenance is what principle P3 forbids, so the domain rejects it.
2. The record appears as a **draft**, prominently labelled _a candidate, not institutional record_.
3. **Submit for review**, then **Confirm as record**. The candidate warning disappears.
4. Scroll to **Audit trail** — three hash-chained entries, each carrying the hash of the one before.
5. Change **Acting as** to `reader` and try to review again. The API refuses with a 403 explaining
   which role was missing. That denial comes from the server, not from a hidden button.

> **"Acting as" is not a login.** The `X-Witness-Dev-User` header is unverified and trivially forged.
> It exists so the authorisation _boundary_ can be demonstrated without shipping a fake sign-in screen
> that teaches everyone who sees it that authentication exists. It does not. Keycloak and Casbin are
> Phase 2 (ADR-0007), and the adapter behind this refuses to load outside the development profile.

## 8. Run the checks

```bash
make verify              # everything CI runs: format, lint, typecheck, test, build
```

Individually:

```bash
make test                # 69 package tests
pnpm test:invariants     # 20 — the promises Witness makes
pnpm test:adversarial    # 21 — attempts to break them
make typecheck
make lint
make docs-lint           # links and document ownership
bash scripts/ci/check-domain-purity.sh
```

The invariant and adversarial suites are worth reading before you write code. They are the shortest
description of what this project will not compromise on.

## 9. The full stack (optional, Phase 2 onward)

```bash
make dev-full            # adds Neo4j, OpenSearch, MinIO, NATS, Keycloak, Ollama
make dev-obs             # adds Prometheus, Grafana, Tempo, Loki
```

Several gigabytes of images and a few minutes. The Developer Preview does not need any of it.

## 10. Stopping

```bash
make down                # stop, keep data
make clean               # stop and DESTROY all local volumes
```

---

## Troubleshooting

| Symptom                                              | Cause                                                                    | Fix                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `required variable POSTGRES_PASSWORD is missing`     | No `.env`                                                                | `make bootstrap`, or `cp .env.example .env`                                         |
| Compose says a variable is unset that you _have_ set | Compose resolves `.env` relative to the compose **file**, not your shell | Use the `make` targets — they pass `--env-file .env`                                |
| `Cannot reach the Witness API` in the browser        | API not running                                                          | `make app`, then check `curl localhost:3001/health`                                 |
| `P3014 shadow database` on `prisma migrate dev`      | The DB user cannot create databases                                      | `ALTER ROLE witness CREATEDB;` — dev only, not needed for `make migrate`            |
| Health shows `postgres: down`                        | Database not up or still starting                                        | `make dev` blocks until healthy; check `docker compose ps`                          |
| 401 on every API call                                | No acting user                                                           | The web app sends the header; for curl add `-H 'X-Witness-Dev-User: You\|reviewer'` |
| 403 on review actions                                | Acting as `reader` or `contributor`                                      | Switch to `reviewer` — this is the boundary working                                 |
| `next build` fails on `/404`                         | `NODE_ENV=development` leaking from `.env`                               | Fixed — the build script pins `NODE_ENV=production`                                 |
| Port 3000 or 3001 in use                             | Something else is running                                                | Set `WITNESS_WEB_PORT` / `WITNESS_API_PORT` in `.env`                               |
| Docker image pull fails                              | Registry unreachable from your network                                   | See the no-Docker note in step 1 — the preview needs only PostgreSQL                |

---

## Reading order for the architecture

Once it runs, read in this order. Roughly two hours, and it is the difference between contributing and
guessing.

| #   | Document                                                                     | Why                                        |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | [`VISION.md`](../../VISION.md)                                               | What Witness is. Canonical                 |
| 2   | [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md)                             | P1–P8. Constraints, not aspirations        |
| 3   | [`STATUS.md`](../../STATUS.md)                                               | Where the project actually is today        |
| 4   | [`architecture/ARCHITECTURE.md`](../../architecture/ARCHITECTURE.md)         | The system                                 |
| 5   | [`architecture/decisions/README.md`](../../architecture/decisions/README.md) | Why it is that system                      |
| 6   | ADR-0003, 0004, 0007, 0009, 0013                                             | The five that shape everything else        |
| 7   | [`packages/domain/src/`](../../packages/domain/)                             | The rules, in code. Start with `record.ts` |
| 8   | [`test/invariants/`](../../test/invariants/)                                 | The promises, as assertions                |
| 9   | [`DEPARTMENTS.md`](DEPARTMENTS.md)                                           | Who owns what                              |
| 10  | [`AGENT_HANDOFF_PROTOCOL.md`](AGENT_HANDOFF_PROTOCOL.md)                     | **Read before your first PR**              |

## Where the code is

```text
packages/domain/       Pure domain. No infrastructure imports — enforced by CI (ADR-0003)
packages/config/       Environment validation and deployment-profile enforcement (ADR-0013)
packages/contracts/    API types and schemas. Apache-2.0 (ADR-0002)
services/api-gateway/  NestJS over Prisma and PostgreSQL
apps/web/              Next.js application
test/invariants/       The promises
test/adversarial/      Attempts to break them
```

Start in `packages/domain/src/record.ts`. It is where the state machine and the P4 human-confirmation
rule live, and everything else is an adapter around it.

## Your first contribution

1. Read [`AGENT_HANDOFF_PROTOCOL.md`](AGENT_HANDOFF_PROTOCOL.md) — it is short and it will stop you
   accidentally redesigning something already decided.
2. Pick an available row in [`DEPARTMENT_ASSIGNMENTS.md`](DEPARTMENT_ASSIGNMENTS.md). Three Phase 1
   rows have no dependencies at all.
3. Branch, work, `make verify`, open a PR against the template.

Welcome.
