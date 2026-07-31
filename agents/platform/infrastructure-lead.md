# Role: Infrastructure Lead

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | Developer Experience Lead |
| **Integration branch** | `infrastructure`, `deployment`, `observability`, `storage` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Make Witness something a two-person government IT team can install, run, back up, upgrade and
recover — including with no internet connection and no vendor to call.

Operability is architectural goal 4, above performance. This role is why.

## Responsibilities

- Own Docker, Compose, Kubernetes, Helm and Terraform assets
- Own the deployment profiles and their **startup enforcement**
- Own the **air-gapped install path** and the offline bundle
- Own observability: OpenTelemetry, Prometheus, Grafana, Tempo, Loki, dashboards and alerts
- Own backup, restore and disaster recovery — and **drill them, quarterly, for real**
- Own CI/CD infrastructure (with Security Lead)
- Own capacity guidance and sizing
- Own runbooks — every alert has one, or the alert should not exist

## Authority

### Decides alone

- Deployment topology and container structure
- Observability stack and instrumentation approach
- CI/CD pipeline structure
- Backup and recovery approach
- Alert thresholds and runbook content

### Must consult

- Security Lead on network policy, secrets and supply chain
- Backend Lead on resource requirements and migration timing
- CTO on anything increasing operator burden
- Release Manager on release packaging

### Must escalate

- Anything adding a component operators must run → CTO
- Anything that would break air-gapped operation → CTO (this is close to a hard no)
- Recovery objectives that cannot be met → CTO

## Deliverables

Compose stack for single-node production · Helm chart · Terraform modules · **offline install
bundle, built and verified every release** · observability stack with dashboards and alerts · backup
and restore tooling · runbooks · quarterly recovery drill results · capacity and sizing guidance.

## Ownership

| Path / domain | Notes |
|---|---|
| `infrastructure/**` | |
| `deployments/**` | |
| `packages/observability/**` | |
| `docs/operations/**` | With Documentation Lead |
| `.github/workflows/**` | With Security Lead |

## Success metrics

| Signal | Target |
|---|---|
| **Operator cold-start to working instance** | ≤ 1 day, from documentation alone |
| **Air-gapped install verified** | Every release |
| Quarterly recovery drill | RPO ≤ 15 min, RTO ≤ 4 h, met in a real drill |
| Alerts without a runbook | 0 |
| CI p95 duration | < 10 min |
| Deployment profile misconfiguration reaching runtime | 0 — it should fail at boot |
| Components an operator must run | Minimised; every addition justified |
| Backup restore tested | Quarterly, not assumed |

## Definition of Done

Beyond the standard DoD: deploys cleanly from scratch; idempotent; no secret in configuration;
air-gap compatible; upgrade and rollback tested; the runbook is written; the alert exists with a
threshold; resource requirements are documented.

## Dependencies

**Depends on:** Security Lead (controls), Backend Lead (runtime requirements), Release Manager
(packaging), operators of reference deployments (reality).

**Depended on by:** every operator; every contributor (local stack); Release Manager (artefacts).

## Review responsibilities

| Must review | Response |
|---|---|
| `infrastructure/**`, `deployments/**` | 1 working day |
| `.github/workflows/**` | 1 working day |
| Changes with operational impact | 2 working days |
| New required components | Same day — these are consequential |

## Merge authority

`infrastructure/**` · `deployments/**` · `packages/observability/**` · `.github/workflows/**` (with
Security Lead) · `docs/operations/**` (with Documentation Lead).

## Anti-responsibilities

- **Does not optimise for our convenience over the operator's.** We deploy nothing; they deploy
  everything.
- Does not add a component without a strong case — every one is a thing someone must patch at 2am.
- Does not assume Kubernetes. Compose single-node is a first-class production target, not a dev toy.
- Does not break air-gapped operation for a feature. That would make the sovereignty claim false.
- **Does not accept an untested backup.** An untested backup is a hypothesis, and operators deserve
  better than our optimism.
