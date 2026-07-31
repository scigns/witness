# Documentation

Start with [`PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md). It is short and it is binding.

## By audience

| You are | Read |
|---|---|
| **A new contributor** | [`CONTRIBUTING.md`](../CONTRIBUTING.md) → [`engineering/DEVELOPER_GUIDE.md`](engineering/DEVELOPER_GUIDE.md) → [`engineering/ENGINEERING_GUIDE.md`](engineering/ENGINEERING_GUIDE.md) |
| **An architect** | [`architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) → [`architecture/decisions/`](../architecture/decisions/) |
| **An operator** | [`operations/DEPLOYMENT_GUIDE.md`](operations/DEPLOYMENT_GUIDE.md) → [`operations/ADMIN_GUIDE.md`](operations/ADMIN_GUIDE.md) |
| **An integrator** | [`guides/API_GUIDE.md`](guides/API_GUIDE.md) → [`sdk/`](../sdk/) |
| **An end user** | [`guides/USER_GUIDE.md`](guides/USER_GUIDE.md) |
| **An evaluator** (procurement, security, legal) | [`../VISION.md`](../VISION.md) → [`governance/DIGITAL_SOVEREIGNTY.md`](governance/DIGITAL_SOVEREIGNTY.md) → [`../SECURITY.md`](../SECURITY.md) → [`governance/RISK_REGISTER.md`](governance/RISK_REGISTER.md) |
| **An AI agent** | [`../.ai/README.md`](../.ai/README.md) → [`engineering/AI_GUIDELINES.md`](engineering/AI_GUIDELINES.md) |
| **A community partner** | [`governance/CONSENT_FRAMEWORK.md`](governance/CONSENT_FRAMEWORK.md) → [`governance/INDIGENOUS_DATA_SOVEREIGNTY.md`](governance/INDIGENOUS_DATA_SOVEREIGNTY.md) |

## Directory map

### [`engineering/`](engineering/) — how we build

| Document | Covers |
|---|---|
| [`ENGINEERING_OPERATING_MODEL.md`](engineering/ENGINEERING_OPERATING_MODEL.md) | How engineering is organised, decides and measures itself |
| [`ENGINEERING_GUIDE.md`](engineering/ENGINEERING_GUIDE.md) | How we write code — layering, modelling, errors, observability |
| [`CODING_STANDARDS.md`](engineering/CODING_STANDARDS.md) | Mechanical rules; what the tools enforce |
| [`DEVELOPER_GUIDE.md`](engineering/DEVELOPER_GUIDE.md) | Getting set up and being productive |
| [`BRANCH_STRATEGY.md`](engineering/BRANCH_STRATEGY.md) | Thirty long-lived branches, their owners and rules |
| [`REPOSITORY_STRATEGY.md`](engineering/REPOSITORY_STRATEGY.md) | Monorepo layout, boundaries, ownership |
| [`RELEASE_STRATEGY.md`](engineering/RELEASE_STRATEGY.md) | Versioning, cadence, LTS, release checklist |
| [`DOCUMENTATION_STRATEGY.md`](engineering/DOCUMENTATION_STRATEGY.md) | Standards, audiences, maintenance |
| [`ADR_PROCESS.md`](engineering/ADR_PROCESS.md) | How architectural decisions are made and recorded |
| [`CODE_REVIEW.md`](engineering/CODE_REVIEW.md) | What approval means; how to review well |
| [`PULL_REQUEST_WORKFLOW.md`](engineering/PULL_REQUEST_WORKFLOW.md) | PR lifecycle, size, merging, reverting |
| [`ISSUE_WORKFLOW.md`](engineering/ISSUE_WORKFLOW.md) | Triage, labels, priority, acceptance criteria |
| [`CI_CD.md`](engineering/CI_CD.md) | Pipeline, gates, supply chain |
| [`SECURITY_REVIEW.md`](engineering/SECURITY_REVIEW.md) | When security review applies and what it checks |
| [`TESTING_STRATEGY.md`](engineering/TESTING_STRATEGY.md) | Test types, invariants, adversarial and evaluation testing |
| [`AI_GUIDELINES.md`](engineering/AI_GUIDELINES.md) | AI development workflow and its limits |
| [`TECH_DEBT.md`](engineering/TECH_DEBT.md) | The debt register and how it is governed |

### [`product/`](product/) — what we build and why

[`PRODUCT_OPERATING_MODEL.md`](product/PRODUCT_OPERATING_MODEL.md) · [`PERSONAS.md`](product/PERSONAS.md) · `prd/` · `design/`

### [`governance/`](governance/) — the commitments we are held to

[`CONSENT_FRAMEWORK.md`](governance/CONSENT_FRAMEWORK.md) · [`DIGITAL_SOVEREIGNTY.md`](governance/DIGITAL_SOVEREIGNTY.md) · [`INDIGENOUS_DATA_SOVEREIGNTY.md`](governance/INDIGENOUS_DATA_SOVEREIGNTY.md) · [`RISK_REGISTER.md`](governance/RISK_REGISTER.md) · [`DECISIONS.md`](governance/DECISIONS.md)

### [`operations/`](operations/) — running Witness

[`DEPLOYMENT_GUIDE.md`](operations/DEPLOYMENT_GUIDE.md) · [`ADMIN_GUIDE.md`](operations/ADMIN_GUIDE.md) · [`SECURITY_HARDENING.md`](operations/SECURITY_HARDENING.md) · [`INCIDENT_RESPONSE.md`](operations/INCIDENT_RESPONSE.md) · `runbooks/`

### [`guides/`](guides/) — using and building on Witness

[`USER_GUIDE.md`](guides/USER_GUIDE.md) · [`API_GUIDE.md`](guides/API_GUIDE.md)

### [`research/`](research/) — what we investigated

[`OSS_EVALUATION.md`](research/OSS_EVALUATION.md) · `THREAT_MODEL.md` · `rfc/` · benchmarks

### [`../architecture/`](../architecture/) — how it is built

Architecture documents and all twenty-one ADRs. Start at [`architecture/README.md`](../architecture/README.md).

---

## Documentation standards

Documentation drift is a **defect** here, not a chore. It ships in the same pull request as the
change, and a behaviour change without a documentation update fails CI.

**If the documentation failed you, that is our bug.** Open a `type:docs` issue. Standards and
process: [`DOCUMENTATION_STRATEGY.md`](engineering/DOCUMENTATION_STRATEGY.md).
