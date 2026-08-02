# Technology Stack

**Owner:** CTO & Principal Architect
**Status:** Baseline — Phase 1
**Rule:** no technology enters this document without an ADR stating what it replaces and why the
existing stack cannot do the job. No exceptions, including for the CTO.

---

## Selection criteria

Every choice is scored against these, in this order:

1. **Sovereignty** — self-hostable, open source, no phone-home, no licence server
2. **Longevity** — will this be maintained in ten years? Who pays for it? What is the governance?
3. **Operability** — can a two-person government IT team run it at 2am with a runbook?
4. **Replaceability** — how hard is it to remove? What is the exit path?
5. **Maturity** — production-proven at comparable scale, not merely promising
6. **Licence** — compatible with GPL-3.0 and with government procurement
7. **Community** — multiple maintainers, multiple corporate backers, active issue triage
8. **Fit** — does it actually solve our problem, or a problem adjacent to it?

**Boring wins.** A technology that is 20% worse but universally understood beats a better one that
nobody in a ministry of health can debug.

---

## Stack summary

| Layer | Technology | Licence | Port/adapter | Exit difficulty |
|---|---|---|---|---|
| **Frontend** | Next.js 15, React 19, TypeScript 5.6 | MIT | — | High (accepted) |
| | Tailwind CSS 4, shadcn/ui | MIT | — | Low (source in repo) |
| | TanStack Query, Zustand | MIT | — | Low |
| **Backend** | NestJS 10, TypeScript | MIT | — | High (accepted) |
| | GraphQL (Apollo Server 4) | MIT | `ApiPort` | Medium |
| | REST (OpenAPI 3.1) | — | `ApiPort` | Low |
| | Prisma 5 | Apache-2.0 | `RepositoryPort` | Medium |
| **Data** | PostgreSQL 16 + pgvector | PostgreSQL / PostgreSQL | `RepositoryPort`, `VectorPort` | Very high (accepted, deliberate) |
| | Neo4j 5 Community | GPL-3.0 | `GraphPort` | Medium |
| | OpenSearch 2 | Apache-2.0 | `SearchPort` | Medium |
| | Redis 7 (or Valkey) | BSD-3 / RSAL* | `CachePort` | Low |
| | MinIO | AGPL-3.0 | `ObjectStorePort` | Low (S3 API) |
| **Events** | NATS JetStream | Apache-2.0 | `EventBusPort` | Low |
| **AI** | Whisper (faster-whisper / WhisperX) | MIT | `TranscriptionPort` | Low |
| | LiteLLM | MIT | `LanguageModelPort` | Low |
| | Ollama | MIT | `LanguageModelPort` | Low |
| | LangGraph | MIT | `PipelinePort` | Medium |
| | LlamaIndex | MIT | `DocumentProcessingPort` | Medium |
| **Identity** | Keycloak 26 | Apache-2.0 | `IdentityProviderPort` | Medium |
| | Casbin | Apache-2.0 | `AuthorizationPort` | Low |
| **Infrastructure** | Docker, Compose, Kubernetes, Helm, Terraform | Apache-2.0 | — | Medium |
| | GitHub Actions | — | — | Medium (mitigated) |
| **Observability** | OpenTelemetry, Prometheus, Grafana, Tempo, Loki | Apache-2.0 / AGPL | `TelemetryPort` | Low |
| **Tooling** | pnpm, Turborepo, Vitest, Playwright, ESLint, Prettier | MIT | — | Low |

\* Redis licensing is a live risk — see the note under Data.

---

## Frontend

### Next.js 15 + React 19 + TypeScript

**Why:** server components meaningfully reduce client bundle size, which matters for the
low-bandwidth field deployments in principle P8. Mature, enormous talent pool, self-hostable with
no vendor dependency.
**Risk:** the framework moves fast and has a commercial sponsor whose interests are hosting-shaped.
**Mitigation:** we deploy in standalone Node output mode; we use no Vercel-only feature. Verified
in CI by building and running the standalone container. Exit would be expensive but possible —
this is a deliberate, documented acceptance rather than an oversight.

### Tailwind CSS 4 + shadcn/ui

**Why:** shadcn/ui is *copied into the repository*, not installed as a dependency. We own the
component source, which is exactly right for a ten-year accessibility commitment — we can fix a
WCAG defect without waiting for an upstream release. Built on Radix primitives, which have
genuinely good accessibility foundations.
**Risk:** owning the source means owning the maintenance.
**Mitigation:** accepted knowingly; `packages/ui` has a named owner and an accessibility test suite.

---

## Backend

### NestJS

**Why:** opinionated structure with first-class dependency injection, which is what makes
hexagonal architecture practical rather than aspirational. Modules map cleanly to bounded
contexts. Its conventions mean a new contributor reads any service and knows where things are —
worth a great deal over a decade.
**Risk:** framework coupling; heavier than Fastify alone.
**Mitigation:** domain and application layers are framework-free. NestJS lives only in the adapter
layer. A framework migration would be a large but bounded adapter rewrite, not a rewrite of the
system.

### GraphQL + REST, both, spec-first

**Why:** they serve different consumers and we need both. GraphQL is the backend-for-frontend: the
web app fetches a meeting with its decisions, participants and provenance in one round trip
instead of a waterfall. REST is for integrators — government systems, scripts, EDRMS connectors,
and the long tail of tooling that will never speak GraphQL.
**Rule:** GraphQL is the BFF and is allowed to change with the UI. REST is the public contract and
changes only under the versioning policy in [`docs/guides/API_GUIDE.md`](../docs/guides/API_GUIDE.md).
[ADR-0006](decisions/ADR-0006-api-strategy.md)

### Prisma

**Why:** excellent TypeScript type inference, first-class migrations, good developer ergonomics.
**Risk:** limited support for advanced Postgres features we will need — recursive CTEs, complex
window functions, `pgvector` operators, row-level security.
**Mitigation:** repository ports allow raw SQL where required; Prisma is not permitted to leak past
the repository adapter. We expect a meaningful minority of queries to be hand-written SQL and that
is fine.

---

## Data

### PostgreSQL 16 + pgvector — the system of record

**Why:** the most operationally trusted open-source database in existence, understood by every
public-sector DBA, with a 25-year track record and no ownership risk. `pgvector` means semantic
search does not require a fourth data store, a fourth backup and a fourth on-call runbook.
**Exit difficulty:** very high — and deliberately so. This is the one place we accept deep coupling,
because the alternative is a lowest-common-denominator abstraction that wastes the capability we
chose Postgres for. [ADR-0004](decisions/ADR-0004-polyglot-persistence.md)

### Neo4j 5 Community — graph projection

**Why:** best-in-class traversal ergonomics; Cypher is genuinely readable by non-specialists, which
matters when a policy analyst wants to understand a query.
**Risk:** Community edition lacks clustering and some security features; the licence and product
direction are controlled by a single vendor.
**Mitigation:** Neo4j holds **no** authoritative data — it is a rebuildable projection. Access is
behind `GraphPort`. **Apache AGE** (Postgres graph extension) is under active evaluation as an
alternative binding for constrained deployments, tracked as open decision D-4.

### OpenSearch — lexical projection

**Why:** Apache-2.0, community-governed under the Linux Foundation, no rug-pull risk of the kind
that motivated its fork from Elasticsearch. Mature BM25 and aggregation capability.
**Mitigation:** behind `SearchPort`; a Postgres full-text fallback exists for minimal deployments.

### Redis — cache, locks, rate limiting

**Why:** ubiquitous, well understood, operationally simple.
**⚠️ Licensing risk:** Redis moved to RSALv2/SSPL in 2024. Those licences are **not** acceptable for
this project.
**Mitigation:** we target **Valkey** (the Linux Foundation BSD-licensed fork) as the default, with
Redis OSS 7.2 as a compatible alternative. Redis holds no durable state — a total loss costs a cold
cache, nothing more. This is a genuine licensing hazard on a dependency people assume is safe, and
it is exactly why every dependency needs an exit strategy.

### MinIO — object storage

**Why:** S3-compatible API, self-hostable, straightforward to operate.
**Risk:** AGPL-3.0 (compatible with our GPL-3.0 platform, but operators should understand it) and
recent upstream feature-gating of the console.
**Mitigation:** we use only the S3 API through `ObjectStorePort`. Any S3-compatible store — SeaweedFS,
Garage, Ceph, or a cloud provider's S3 — is a configuration change. Exit is genuinely cheap here.

---

## Events

### NATS JetStream

**Why it is here at all** (it was not in the original stack list, so it requires justification):
services need reliable asynchronous communication with durable delivery. Kafka is the obvious
answer and the wrong one for us — ZooKeeper/KRaft, partition management and rebalancing are a
serious operational burden for a two-person team. NATS JetStream is a single ~15 MB binary,
embeddable for single-node deployments, with durable streams, at-least-once delivery and consumer
groups. It matches our scale and our operator profile.
**Alternative considered:** Postgres-only using `LISTEN/NOTIFY` plus an outbox table. Genuinely
viable at small scale and available as a profile for minimal deployments.
[ADR-0005](decisions/ADR-0005-event-driven-backbone.md)

---

## AI platform

### Whisper (faster-whisper / WhisperX)

**Why:** the best openly licensed ASR available, with credible multilingual coverage. MIT licensed
weights. `faster-whisper` (CTranslate2) gives roughly 4× the throughput at lower memory;
`WhisperX` adds forced alignment and speaker diarisation, and word-level timestamps are what make
our provenance spans precise rather than approximate.
**Open decision D-3:** exact composition pending benchmarking against target languages. The port
boundary means this is a configuration decision, not an architectural one.

### LiteLLM — model gateway

**Why:** one OpenAI-compatible interface across Ollama, vLLM, and any external provider, with
per-key budgets, rate limits and request logging. It is the natural place to enforce the egress
policy — a single chokepoint where "did this tenant permit an external call?" is answered.

### Ollama — local inference default

**Why:** trivial to operate, good model library, sensible defaults. The default binding, so the
out-of-the-box experience is sovereign.
**Note:** for larger deployments **vLLM** is the recommended alternative for throughput. Both sit
behind `LanguageModelPort`.

### LangGraph — extraction orchestration

**Why:** extraction is a stateful multi-step graph with retries, branching and human-in-the-loop
interrupts. LangGraph models exactly that, and its checkpointing supports resumable pipelines —
which we need, because a 4-hour parliamentary session cannot restart from zero on a transient failure.
**Risk:** young, fast-moving, part of the LangChain ecosystem which has a history of churn.
**Mitigation:** used **only** for orchestration behind `PipelinePort`. No LangChain abstraction is
permitted in the domain or in prompt management. Prompts are versioned assets we own.

### LlamaIndex — document processing

**Why:** mature document parsing, chunking and ingestion across formats we must handle (PDF
submissions, scanned minutes, Word documents).
**Scope limit:** used for parsing and chunking only. Retrieval and ranking are ours, because they
must be permission-aware and provenance-preserving — properties no general framework will enforce
for us.

---

## Identity & authorisation

### Keycloak

**Why:** the reference open-source IdP for government. Supports OIDC, SAML, LDAP/AD federation,
step-up authentication and identity brokering — which is how we federate to whatever national SSO
an operator already runs. Red Hat backed, CNCF incubating.
**Risk:** heavy; a meaningful share of the platform's operational complexity is Keycloak's.
**Mitigation:** realm-as-code, shipped configuration, thorough runbooks. Behind
`IdentityProviderPort` so a lighter IdP (Zitadel, Authentik) can be substituted for small deployments.

### Casbin

**Why:** policy as data rather than code, supporting RBAC, ABAC and ReBAC in one model. Our
authorisation is genuinely complex — role, tenant, consent scope, data classification, community
restriction and graph relationship all participate — and expressing that in scattered `if`
statements is how privacy incidents happen.
**Mitigation:** a single policy decision point; policy files are versioned and unit-tested like code.

---

## Infrastructure

**Docker + Compose** for the single-node and development profiles — this is the *default*
deployment for most institutions and is treated as a first-class production target, not a dev toy.
**Kubernetes + Helm** for larger deployments. Optional, never required.
**Terraform** for operators provisioning cloud or on-prem virtualised infrastructure. Modules are
provided; nothing depends on them.

### GitHub Actions

**Why:** where the code is; excellent ecosystem; zero setup cost.
**Risk:** vendor lock-in on a critical path, and a supply-chain surface.
**Mitigation:** all real logic lives in `scripts/` and `Makefile` targets, invoked identically
locally, in Actions, or in GitLab CI. Workflows are thin wrappers. Actions are pinned to commit
SHAs. A mirror to a self-hosted GitLab CI is a Phase 7 deliverable, because a public-infrastructure
project that can only be built on one commercial platform is not credibly sovereign.

### OpenTelemetry + Prometheus + Grafana + Tempo + Loki

**Why:** vendor-neutral instrumentation is the whole point of OTel — operators can forward to
whatever they already run. Self-hosted by default, telemetry never leaves the operator's boundary,
and there is no upstream collector. We will not add one.

---

## Languages

| Language | Where | Why |
|---|---|---|
| **TypeScript** | Frontend, backend, workers, SDK | One language across the stack; shared domain types between server and client, which eliminates a whole class of contract drift |
| **Python** | ML workers, Python SDK | Where the ML ecosystem lives. Isolated to workers behind message contracts, so it never couples to the core |
| **SQL** | Migrations, complex queries | Explicit and reviewable where the ORM is insufficient |
| **HCL / YAML** | Infrastructure | Terraform, Kubernetes, Helm, Actions |
| **Bash** | Scripts | Only where trivial; anything with logic goes to Node or Python |

**Deliberately not used:** Go (would fragment the backend for no benefit at our scale), Rust (no
current problem justifies the hiring and review cost), Java (Keycloak and Neo4j are Java; we do not
add more).

---

## Version policy

| Category | Policy |
|---|---|
| **Runtime (Node)** | LTS only. Upgrade one minor after a new LTS ships |
| **Databases** | N-1 major supported; upgrade within 12 months of a new major |
| **Frameworks** | Upgrade within one minor of release; majors get an evaluation issue and a plan |
| **Security patches** | Critical within 7 days; high within 30 |
| **Dependencies** | Renovate/Dependabot weekly, batched, auto-merged only when the full test suite passes |

## Anti-stack

Technologies deliberately rejected, recorded so the argument is not relitigated without new
evidence.

| Not used | Why |
|---|---|
| Kafka | Operational burden disproportionate to our scale |
| MongoDB | Our data is deeply relational; SSPL is unacceptable |
| Elasticsearch | Licence change; OpenSearch is the governed fork |
| Pinecone / Weaviate / Qdrant | pgvector avoids a fourth store; revisit only with measured evidence |
| Firebase / Supabase / any BaaS | Sovereignty |
| Vercel / Netlify hosting | Sovereignty |
| Auth0 / Clerk / WorkOS | Sovereignty |
| LangChain (as an application framework) | Excessive abstraction churn on a ten-year horizon; LangGraph used narrowly for orchestration only |
| Blockchain / DLT | A hash-chained log gives tamper evidence without the cost |
| Proprietary ASR (Deepgram, AssemblyAI, Azure Speech) | Sovereignty; supported as opt-in adapters only |
| Any "AI agent" framework writing to the graph | Violates principle P4 |

---

**Every dependency has a full evaluation, including exit strategy, in
[`docs/research/OSS_EVALUATION.md`](../docs/research/OSS_EVALUATION.md).**
