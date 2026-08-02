# Open Source Dependency Evaluation

**Owner:** Research Lead
**Status:** Complete for the core stack — Phase 1 deliverable 1.6
**Last reviewed:** 2026-07-31
**Review cadence:** Every release, and on any upstream licence or governance change

---

## Why this exists

**We do not build what already exists.** Witness is not a database, a search engine, an identity
provider or a speech recognition system, and every line we write that duplicates mature open source
is
a line we must maintain for a decade for no benefit.

But every dependency is a liability accepted deliberately. This dossier records, for each one: what
it
does for us, what it costs us, how we would live without it, and what would tell us it is time to
leave.

**The replacement strategy is the section people skip and the one that matters.** If we cannot
describe how we would remove a dependency, we are not adding it.

## Evaluation criteria

| Criterion | What we ask |
|---|---|
| **Purpose** | What problem does this solve that we cannot reasonably solve ourselves? |
| **Licence** | Compatible with the consuming package (GPL-3.0 platform / Apache-2.0 SDK)? Acceptable in government procurement? |
| **Community** | Multiple maintainers? Multiple corporate backers? Neutral governance, or single-vendor? |
| **Maintenance** | Recent releases? Issue triage? Security response history? |
| **Advantages** | Why this over the alternatives? |
| **Risks** | What could go wrong — technically, commercially, legally? |
| **Integration** | How is it bounded so it does not spread through the codebase? |
| **Replacement** | What is the exit, how long does it take, and what triggers it? |

**Automatic rejection:** licence incompatible with the consuming package · unmaintained (no release
or
meaningful commit in 12 months) without a fork plan · single maintainer on a critical path without
mitigation · requires a phone-home or external service in the default configuration · known unpatched
critical vulnerability.

---

## Summary

| Dependency | Licence | Governance | Criticality | Exit cost |
|---|---|---|---|---|
| PostgreSQL | PostgreSQL | Community, multi-vendor | **Critical** | Very high *(accepted)* |
| pgvector | PostgreSQL | Small team, healthy | High | Low |
| Neo4j Community | GPL-3.0 | **Single vendor** | Medium | Medium |
| OpenSearch | Apache-2.0 | Linux Foundation | Medium | Medium |
| Valkey *(not Redis)* | BSD-3 | Linux Foundation | Low | Low |
| MinIO | AGPL-3.0 | Single vendor | Low | **Very low** (S3 API) |
| NATS JetStream | Apache-2.0 | CNCF | Medium | Low |
| Keycloak | Apache-2.0 | Red Hat / CNCF | High | Medium |
| Casbin | Apache-2.0 | Community | High | Low |
| NestJS | MIT | Single maintainer + sponsors | High | High *(accepted)* |
| Next.js | MIT | **Vercel** | High | High *(accepted)* |
| Prisma | Apache-2.0 | Single vendor | Medium | Medium |
| shadcn/ui | MIT | Single maintainer | Low | **None** (vendored) |
| Whisper / faster-whisper | MIT / MIT | OpenAI / SYSTRAN | High | Low |
| WhisperX | BSD-4 + gated models | Academic | Medium | Low |
| LiteLLM | MIT | Single vendor, active | Medium | Low |
| Ollama | MIT | Single vendor | Medium | Low |
| LangGraph | MIT | LangChain Inc. | Medium | Medium |
| LlamaIndex | MIT | LlamaIndex Inc. | Low | Low |
| OpenTelemetry | Apache-2.0 | CNCF | Medium | Low |
| Prometheus / Grafana | Apache-2.0 / AGPL-3.0 | CNCF / Grafana Labs | Low | Low |
| pnpm / Turborepo | MIT / MIT | Community / Vercel | Medium | Low |
| Vitest / Playwright | MIT / Apache-2.0 | Community / Microsoft | Medium | Low |

---

## Critical dependencies — full evaluation

### PostgreSQL 16 + pgvector

**Purpose.** System of record: event log, write model, consent records, audit chain, and — via
`pgvector` — embeddings.

**Licence.** PostgreSQL Licence (permissive, BSD-like). `pgvector` under the same. No concerns.

**Community.** The strongest case available. Independent global development group, 25+ years, no
single corporate owner, and multiple companies whose businesses depend on it. There is no plausible
scenario in which PostgreSQL becomes unavailable or hostile.

**Maintenance.** Annual majors, quarterly minors, a mature and public security process. `pgvector` is
a smaller project but actively maintained with a growing contributor base.

**Advantages.** Universally understood by public-sector DBAs — which matters more than any technical
property for a system operated by under-resourced teams. Transactional guarantees we need for consent.
Row-level security for tenant isolation. `pgvector` avoids a fourth data store and a fourth backup.

**Risks.**

- `pgvector` is younger and less proven at very large scale than dedicated vector databases.
  **Assessment:** adequate for tens of millions of vectors, which exceeds our largest projected
  deployment.
- Deep coupling: we deliberately use advanced features (RLS, recursive CTEs, JSONB, window functions).

**Integration.** Behind `RepositoryPort` and `VectorPort`. Prisma for the common path; hand-written
SQL where the ORM is insufficient, confined to repository adapters.

**Replacement.** **Very high cost, deliberately.** This is the one place we accept deep coupling,
because a lowest-common-denominator abstraction would waste the capability we chose Postgres for. We
consider the risk of needing to replace it negligible. *Trigger: none foreseen.*

---

### Neo4j 5 Community

**Purpose.** Graph projection for traversal queries.

**Licence.** **GPL-3.0** for Community edition — compatible with our platform. Enterprise is
commercial; we use and require only Community.

**Community.** ⚠️ **Single vendor.** Neo4j Inc. controls the roadmap, the licence and the split
between Community and Enterprise. Historically they have moved capability into Enterprise.

**Maintenance.** Actively developed, regular releases, good security response.

**Advantages.** Best-in-class traversal ergonomics. Cypher is genuinely readable by non-specialists,
which matters when a policy analyst wants to understand what a query does. Mature tooling.

**Risks.**

- Community edition lacks clustering — a single point of failure if it held authoritative data.
- Single-vendor licence risk: capability could move to Enterprise.
- Java runtime adds to the operational footprint.

**Why the risks are tolerable.** [ADR-0011](../../architecture/decisions/ADR-0011-knowledge-graph-as-projection.md)
means **Neo4j holds no authoritative data**. It is a rebuildable projection. If Neo4j became
unavailable, unaffordable or hostile tomorrow, we would lose a query capability, not any data. That
single architectural decision converts a critical vendor risk into a medium one.

**Integration.** Behind `GraphPort`. Application services hold **read-only** credentials; only the
projector writes.

**Replacement.** **Apache AGE** (Postgres graph extension) is under active evaluation as an
alternative binding — open decision **D-4**. Estimated 2–4 weeks: implement `GraphPort` over AGE, no
data migration because the source of truth does not move. *Triggers: a licence change; capability moving
to Enterprise; operator feedback that the footprint is unmanageable.*

---

### Keycloak 26

**Purpose.** Identity provider — OIDC, SAML, LDAP/AD federation, identity brokering to national SSO.

**Licence.** Apache-2.0. Clean.

**Community.** Red Hat sponsored, CNCF incubating. Multi-contributor with genuine external
participation.

**Maintenance.** Frequent releases, responsive security process, long track record.

**Advantages.** The reference open-source IdP for government. Federating to whatever directory an
institution already runs is essential — asking a ministry to manage a second credential store is
both a
security regression and an adoption blocker. Step-up authentication supports our elevated-authority
operations.

**Risks.**

- ⚠️ **Heavy.** A meaningful share of the platform's total operational complexity is Keycloak's. JVM
  tuning, memory footprint, occasional upgrade friction.
- Major upgrades have historically required attention.

**Integration.** Behind `IdentityProviderPort`. Realm-as-code so configuration is reproducible.
Services validate JWTs locally against cached JWKS — no per-request round trip, so an IdP outage
degrades rather than halts.

**Replacement.** **Zitadel** or **Authentik** for smaller deployments — lighter, more modern, less
proven in government federation. Estimated 1–2 weeks plus user migration; the painful part is that
external subject IDs change. *Trigger: operator feedback that Keycloak's footprint is the deciding
obstacle to adoption.*

---

### Whisper (faster-whisper + WhisperX)

**Purpose.** Speech recognition, diarisation, and word-level alignment.

**Licence.** Whisper MIT (including weights). faster-whisper MIT. WhisperX BSD-4-clause.
⚠️ **pyannote diarisation models are gated** — they require accepting terms on Hugging Face.

**Community.** Whisper is OpenAI's, released and effectively unmaintained upstream but stable.
faster-whisper is SYSTRAN, actively maintained. WhisperX is academic, smaller, less certain longevity.
pyannote is academic with commercial backing.

**Advantages.** The best openly licensed ASR available, with credible multilingual coverage.
faster-whisper gives roughly 4× throughput and int8 quantisation, making CPU-only deployment viable.
WhisperX gives word-level timestamps — which is what makes our provenance claims precise enough to
play the exact sentence rather than a vague region.

**Risks.**

- ⚠️ **The gated pyannote licence complicates the air-gapped offline bundle.** Must be handled in the
  install path and documented, not discovered by an operator at 2am.
- Quality in low-resource languages may be inadequate — **risk R-03**, and it falls hardest on
  precisely the institutions we most want to serve.
- WhisperX is a small project; upstream abandonment is plausible.
- Diarisation degrades badly with crosstalk, which real meetings contain constantly.

**Integration.** Behind `TranscriptionPort`. Engine composition is configuration, not architecture —
open decision **D-3** pending benchmarking against target languages.

**Replacement.** Deliberately one of our cheapest exits, because ASR is the fastest-moving part of the
stack and we expect to change it more than once. whisper.cpp for constrained deployments; commercial
ASR as opt-in adapters under the ADR-0009 egress policy. Days, not weeks.

---

### Valkey (in place of Redis)

**Purpose.** Cache, distributed locks, rate limiting. **No durable state.**

**Licence.** BSD-3-Clause.

**⚠️ Why not Redis.** Redis relicensed to RSALv2/SSPL in 2024. **Those licences are not acceptable for
this project** — they are not OSI-approved, they are incompatible with GPL-3.0 distribution, and they
would disqualify Witness from Digital Public Good status.

Valkey is the Linux Foundation fork of Redis 7.2.4, BSD-licensed, backed by AWS, Google, Oracle and
Ericsson. Redis OSS 7.2 (pre-relicence) remains a compatible alternative.

**This entry is why every dependency needs an exit strategy.** Redis was, for a decade, the textbook
example of a safe dependency. It changed licence with no warning to its users. Nothing about a
dependency's history guarantees its future.

**Advantages.** Ubiquitous, operationally simple, well understood.

**Risks.** Minimal. Valkey holds no durable state — total loss costs a cold cache.

**Integration.** Behind `CachePort`.

**Replacement.** Trivial. Any Redis-protocol server, or in-memory caching for single-node deployments.
Days.

---

### Next.js 15

**Purpose.** Web application framework.

**Licence.** MIT.

**Community.** ⚠️ **Vercel-controlled.** Enormous user community, but roadmap and governance sit
with a
company whose business is hosting.

**Advantages.** Server components meaningfully reduce client bundle size, which is decisive for the
low-bandwidth field deployments in principle P8. Enormous talent pool. Self-hostable in standalone mode.

**Risks.**

- ⚠️ **Vendor incentive misalignment.** Vercel's interests are hosting-shaped; features are sometimes
  optimised for their platform.
- Fast-moving with frequent breaking changes across majors.
- Complexity of the app router and caching model.

**Integration.** Standalone Node output mode. **No Vercel-only feature is permitted**, verified in CI
by building and running the standalone container.

**Replacement.** **High cost, accepted knowingly.** Migrating to Remix, TanStack Start or plain React
would be a substantial rewrite of the app shell — likely 6–10 weeks. This is a documented, deliberate
acceptance rather than an oversight. *Trigger: a licence change, or a Vercel-only dependency becoming
unavoidable for core functionality.*

---

### NestJS

**Purpose.** Backend service framework.

**Licence.** MIT.

**Community.** ⚠️ Substantially one maintainer (Kamil Myśliwiec) with sponsor support. Large user base,
but the bus factor upstream is a genuine consideration.

**Advantages.** First-class dependency injection, which is what makes hexagonal architecture practical
rather than aspirational. Module structure maps cleanly to bounded contexts. Strong conventions mean
a
contributor can read any service and know where things are — worth a great deal over a decade.

**Risks.** Upstream bus factor. Framework coupling. Heavier than Fastify alone.

**Integration.** **NestJS lives only in the adapter layer.** Domain and application layers are
framework-free, enforced by lint. This is the mitigation for the upstream risk: a framework migration
would be a bounded adapter rewrite, not a rewrite of the system.

**Replacement.** High but bounded — the domain and application layers survive intact. Estimated 4–6
weeks to move to Fastify with a DI container. *Trigger: upstream abandonment, or a security issue
handled poorly.*

---

### LangGraph

**Purpose.** Orchestration of the multi-step extraction pipeline.

**Licence.** MIT.

**Community.** LangChain Inc. ⚠️ The LangChain ecosystem has a documented history of rapid API churn
and abstraction turnover.

**Advantages.** Extraction is genuinely a stateful graph with retries, branching and human-in-the-loop
interrupts, and LangGraph models exactly that. Checkpointing gives resumable pipelines — necessary
because a four-hour parliamentary session cannot restart from zero on a transient failure.

**Risks.** ⚠️ Young and fast-moving. Ecosystem churn. Vendor-shaped roadmap.

**Integration.** **Strictly bounded.** Used *only* for orchestration behind `PipelinePort`. No
LangChain abstraction is permitted in the domain, and prompt management is ours — prompts are versioned
assets we own, not framework artefacts.

**Replacement.** Medium. The orchestration logic is a state machine; a hand-rolled implementation with
Postgres checkpointing is 2–3 weeks. The narrow integration boundary is what keeps this affordable.
*Trigger: a breaking change we cannot absorb, or churn consuming maintenance capacity.*

---

## Standard evaluations

Lower-risk dependencies, evaluated to the same criteria in condensed form.

| Dependency | Purpose · Licence | Key risk | Integration | Replacement |
|---|---|---|---|---|
| **OpenSearch 2** | Lexical index · Apache-2.0 | Heavy JVM footprint | `SearchPort`; read-only credentials | Postgres FTS for minimal profile — supported configuration, not just theoretical |
| **MinIO** | Object storage · AGPL-3.0 | Single vendor; console feature-gating | S3 API only, via `ObjectStorePort` | **Very low** — SeaweedFS, Garage, Ceph or any S3 store is a config change |
| **NATS JetStream** | Event transport · Apache-2.0 (CNCF) | Smaller ecosystem than Kafka | `EventBusPort`; outbox is the durability guarantee | Kafka, Redis Streams or Postgres-only. 1–2 weeks plus cutover |
| **Casbin** | Authorisation · Apache-2.0 | Terse syntax; policy authoring concentrates in few people | Single PDP; policies unit-tested | OPA/Rego, 1–2 weeks plus policy translation |
| **Prisma** | ORM · Apache-2.0 | Single vendor; limited advanced Postgres support | Confined to repository adapters | Drizzle or Kysely, 3–4 weeks |
| **shadcn/ui** | Components · MIT | Single maintainer | **Vendored into `packages/ui`** — we own the source | **None.** Already ours. This is why we chose it for a 10-year a11y commitment |
| **LiteLLM** | Model gateway · MIT | Young; single vendor | `LanguageModelPort`; the egress chokepoint | Direct provider adapters, 1 week |
| **Ollama** | Local inference · MIT | Single vendor | `LanguageModelPort` | vLLM (recommended at scale) or llama.cpp, days |
| **LlamaIndex** | Document parsing · MIT | Ecosystem churn | **Parsing and chunking only** — retrieval and ranking are ours, because they must be permission-aware | Unstructured.io or direct parsers, 1–2 weeks |
| **OpenTelemetry** | Instrumentation · Apache-2.0 (CNCF) | Node SDK churn | Wrapped in `packages/observability` | Vendor-neutral by design; backend swap is config |
| **Prometheus / Grafana** | Metrics, dashboards · Apache-2.0 / AGPL-3.0 | Grafana AGPL — fine for self-host | Optional profile | Any OTLP-compatible backend |
| **pnpm / Turborepo** | Build · MIT | Turborepo remote caching is a Vercel product | Real logic in `Makefile` and `scripts/` | Nx (~1 week) or plain Make (~2 days) |
| **Vitest / Playwright** | Testing · MIT / Apache-2.0 | Low | Standard | Jest / Cypress, low cost |

---

## Rejected dependencies

Recorded so the argument is not relitigated without new evidence.

| Rejected | Reason |
|---|---|
| **Redis (post-2024)** | RSALv2/SSPL — not OSI-approved, GPL-incompatible, disqualifies DPG status |
| **Elasticsearch** | Licence change; OpenSearch is the community-governed fork |
| **MongoDB** | SSPL; and our data is deeply relational |
| **Kafka** | Operational burden disproportionate to our scale — rejected on operability, which is architectural goal 4 |
| **Pinecone / Weaviate / Qdrant** | A fifth data store for capability `pgvector` provides adequately at our scale |
| **Auth0 / Clerk / WorkOS** | Sovereignty (P1) |
| **Firebase / Supabase** | Sovereignty (P1) |
| **LangChain (as an application framework)** | Excessive abstraction churn on a ten-year horizon |
| **Any blockchain / DLT** | A hash-chained log gives tamper evidence without the operational and political cost |
| **Proprietary ASR** | Sovereignty as a default; supported as opt-in adapters only |

---

## Review triggers

A dependency is re-evaluated immediately on: a **licence change** · a **governance change** (acquisition,
foundation transfer, maintainer transfer) · **12 months without a release** · an unpatched critical
vulnerability · a **maintainer transfer in the last 6 months** (a well-documented supply chain risk
pattern).

Otherwise: every release, and comprehensively every quarter.

## Adding a dependency

1. Add an entry here covering all eight criteria — **including the replacement strategy**
2. Research Lead reviews (3 working days) and Security Lead reviews (2 working days)
3. ADR if it is architecturally significant
4. CI licence gate must pass

**If you cannot describe how we would remove it, we are not adding it.**
