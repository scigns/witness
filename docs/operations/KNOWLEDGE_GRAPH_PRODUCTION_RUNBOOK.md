# Evidence Knowledge Graph — production runbook

**Owner:** Infrastructure Lead with Knowledge Graph Lead
**Status:** Drafted alongside `neo4j`/`graph-projector` becoming addable to
`deployments/cloud-managed/docker-compose.pilot.yml` (Phase 5, Workstream 3).
Verified locally (rebuild against real Postgres + Neo4j, and the full
`graph-integrity.live.test.ts` suite, including its own wipe-and-rebuild
equivalence test); **not yet exercised against the production pilot itself.**

This runbook does not change the running pilot. Bringing the graph online is
an explicit, operator-run procedure — nothing in `scripts/pilot/deploy.sh` or
the `deploy.yml` GitHub Actions workflow starts these two containers on its
own (that script only ever recreates `api`/`web`; see its own `up -d` line).

## What this is, and why it is off by default

The Evidence Knowledge Graph (ADR-0011, ADR-0026) is complete and tested — the
gap this runbook closes is that no running Witness deployment actually has a
Neo4j to project into, so the capability exists in the codebase but not for
any real customer. PostgreSQL remains the sole system of record; Neo4j is a
**projection**, rebuildable from it in full at any time — it is deliberately
not backed up as independent canonical truth (`docker-compose.pilot.yml`'s
`neo4j-data` volume comment).

Two new containers, both additive:

- **`neo4j`** — the graph database itself. No published ports; reachable only
  from the compose network, the same guarantee `postgres` already has.
- **`graph-projector`** (`workers/graph-projector/`) — the only process that
  ever writes to Neo4j. Polls Postgres's existing transactional outbox for
  confirmed knowledge assertions and entity merges, and projects them.
  Idempotent by construction (`MERGE`, never `CREATE`) — replaying the same
  event twice, or the whole history from empty, produces the same graph.

`api-gateway`'s `KnowledgeGraphQueryService` (the read side traversal API)
connects to Neo4j **lazily** — only on the first actual graph query, not at
startup — and `NEO4J_URI`/`NEO4J_READONLY_USER`/`NEO4J_READONLY_PASSWORD` all
default to empty in `docker-compose.pilot.yml`. Until this runbook's
"Enabling it" section is followed, on an already-running pilot: `api` and
`web` behave exactly as before, `/ready` reports Neo4j as `not_configured`,
and no graph endpoint can be reached (it 500s with a clear "must be set"
message rather than serving stale or wrong data).

## Enabling it on an already-running pilot

One-time, operator-run, on the pilot host:

1. **Generate credentials.** Set `NEO4J_PASSWORD` (and, if you want distinct
   read-only/projector credentials — Neo4j Community Edition cannot yet
   enforce the difference at the database level, but keeping the names
   distinct now avoids a rename later if Enterprise/Apache AGE is adopted —
   `NEO4J_READONLY_PASSWORD`/`NEO4J_PROJECTOR_PASSWORD` too) in the pilot's
   protected `.env` (`deployments/cloud-managed/.env.example` documents every
   variable). Never print these or place them in a shell argument — the same
   discipline `scripts/pilot/backup.sh` already follows.

2. **Start the two new containers** (this is the deliberate step — nothing
   automated does this):

   ```bash
   cd /path/to/witness  # the pilot host's checkout
   docker compose --env-file .env -f deployments/cloud-managed/docker-compose.pilot.yml \
     up -d --build neo4j graph-projector
   ```

   Wait for `neo4j`'s healthcheck (`docker compose ... ps neo4j` — up to 60s
   `start_period`).

3. **Recreate `api`** so it picks up the new `NEO4J_*` environment values
   (already in the compose file's `api` service, defaulted empty until now):

   ```bash
   docker compose --env-file .env -f deployments/cloud-managed/docker-compose.pilot.yml \
     up -d --force-recreate api
   ```

4. **Project the existing history.** Every confirmed knowledge assertion that
   existed in Postgres before `graph-projector` ever ran needs one initial
   rebuild (the poll loop only picks up new outbox events going forward):

   ```bash
   docker compose --env-file .env -f deployments/cloud-managed/docker-compose.pilot.yml \
     run --rm graph-projector node dist/rebuild.js
   ```

5. **Verify.** `curl -sk https://<api-host>/ready | python3 -m json.tool` —
   `components.neo4j.status` should read `ok` with a `latencyMs`. Confirm at
   least one real entity/relationship traversal from the UI for a workspace
   known to have confirmed assertions.

Every step above is additive and reversible (§"Turning it back off").

## Rebuild-first disaster recovery

**Neo4j is never restored from a backup — it is rebuilt from Postgres.**
Postgres is the only system of record this deployment backs up
(`scripts/pilot/backup.sh`); `neo4j-data` deliberately has no equivalent.

Recovery procedure, for a corrupted graph, a bad migration, or simply "start
clean":

```bash
# 1. Stop the writer so nothing races the rebuild.
docker compose --env-file .env -f deployments/cloud-managed/docker-compose.pilot.yml stop graph-projector

# 2. Wipe and replay. rebuild.ts drops every node/edge this projector owns,
#    then replays every confirmed, non-retracted assertion from Postgres,
#    oldest first. It never touches Postgres — a failure partway through
#    loses nothing, and rerunning is always safe (MERGE-based).
docker compose --env-file .env -f deployments/cloud-managed/docker-compose.pilot.yml \
  run --rm graph-projector node dist/rebuild.js

# 3. Resume the poll loop.
docker compose --env-file .env -f deployments/cloud-managed/docker-compose.pilot.yml start graph-projector
```

**Recovery time** is proportional to confirmed-assertion count, not database
size — verified locally at roughly 4.5 seconds for a small fixture set (one
assertion, one merge chain); budget accordingly for the pilot's real volume
before treating any specific SLA as proven. There is no partial-recovery
concern: the graph is either fully rebuilt or the rebuild is still running —
readers see the graph as of the last completed run throughout (rebuild writes
directly, there is no separate "swap" step, so a reader mid-rebuild can see a
transiently incomplete graph; this is judged acceptable for a rare,
operator-initiated recovery, not a routine one).

**Verifying equivalence** — this exact guarantee already has a live,
passing regression test: `workers/graph-projector/src/graph-integrity.live.test.ts`,
`'tenant-scoped wipe and rebuild (rebuild.ts equivalence, without a whole-database
wipe)'`. Run `pnpm --filter @witness/graph-projector test:live` against a copy
of production data (never against the live pilot database) before trusting a
schema or projector-logic change in this recovery path.

## Turning it back off

Stopping `neo4j`/`graph-projector` and clearing the `api` service's
`NEO4J_*` values returns the deployment to exactly its prior state — nothing
elsewhere depends on the graph being present (`/ready`'s `not_configured`
path, the same one every pilot has been running under until this runbook is
followed). `docker volume rm` the `neo4j-data` volume only after confirming
no rollback is wanted; there is nothing in it that Postgres cannot regenerate.

## Health and observability

`/ready`'s `neo4j` component (`services/api-gateway/src/health/health.controller.ts`):

| `status`         | Meaning                                                              |
| ---------------- | --------------------------------------------------------------------- |
| `not_configured` | `NEO4J_URI` unset — this deployment has not enabled the graph.        |
| `ok`             | Reached, round-trip under 1s.                                         |
| `degraded`       | Reached, but slow (over 1s) — investigate before it becomes `down`.   |
| `down`           | Configured but unreachable. `detail` carries the connection error.    |

`graph-projector` itself has no HTTP surface (`workers/graph-projector/Dockerfile`'s
own comment) — its liveness is "the container is still running"
(`docker compose ... ps graph-projector`), and its own console log lines
(`[graph-projector] projected assertion '...'`, `[graph-projector] failed to
project event '...': ...`) are the operator-visible signal for a stuck or
failing projection; `docker compose ... logs -f graph-projector`.

## Not covered here

AI-assisted extraction, embeddings, and semantic search remain explicitly out
of scope for this phase (Phase 5's own "do not build" list) — this runbook
only concerns making the existing, already-built manual-governance graph
reachable in production.
