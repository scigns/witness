# Infrastructure

**Owner:** Infrastructure Lead
**Status:** Baseline — Phase 2

| Path | Purpose |
|---|---|
| [`docker/`](docker/) | Compose stack — development and single-node production |
| [`kubernetes/`](kubernetes/) | Raw manifests and examples |
| [`helm/`](helm/) | Helm chart for clustered deployment |
| [`terraform/`](terraform/) | Modules for provisioning cloud or on-prem virtualised infrastructure |
| [`observability/`](observability/) | Prometheus rules, Grafana dashboards, alert definitions |

## Principle

**Operability is architectural goal 4 — above performance.** Every decision here is weighed against
whether a two-person government IT team can run it at 2am with a runbook.

Kubernetes is optional and always will be. Docker Compose on a single host is the recommended topology
for most institutions, and it is tested and supported as a production target.

Architecture: [`DEPLOYMENT_ARCHITECTURE.md`](../architecture/DEPLOYMENT_ARCHITECTURE.md).
Operator instructions: [`docs/operations/DEPLOYMENT_GUIDE.md`](../docs/operations/DEPLOYMENT_GUIDE.md).
