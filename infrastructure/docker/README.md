# Docker

**Owner:** Infrastructure Lead
**Status:** Baseline — Phase 2

| File | Purpose |
|---|---|
| `docker-compose.yml` | The core stack. **A first-class production target for single-institution deployments**, not just a development convenience |
| `docker-compose.observability.yml` | Prometheus, Grafana, Tempo, Loki — optional overlay |
| `docker-compose.airgap.yml` | Network-isolated overlay used by `make egress-test` |
| `init/` | Database and Keycloak realm initialisation, as code |

## Usage

```bash
make dev          # core stack
make dev-obs      # with observability
make down         # stop, keep data
make clean        # stop and DESTROY data
```

## What is backed up, and what is not

**Backed up:** `postgres-data` (system of record), `minio-data` (original media).

**Not backed up:** `neo4j-data`, `opensearch-data` — they are projections, rebuilt from the event log
([ADR-0011](../../architecture/decisions/ADR-0011-knowledge-graph-as-projection.md)).

This is deliberate and is the main operational dividend of the architecture. **Do not "fix" the
omission** — backing up projections would create the illusion that they need to be consistent with the
write model at restore time, which is exactly the problem we designed away.

## Sovereignty

Nothing in this stack makes an outbound connection. MinIO update checks are disabled, there is no
telemetry, and no image phones home. `make egress-test` verifies it, and that check runs in CI.
