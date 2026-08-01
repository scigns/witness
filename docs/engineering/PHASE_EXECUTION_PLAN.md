# Phase Execution Plan

**Owner:** CTO & Engineering Manager
**Status:** Active
**Last updated:** 2026-08-01
**Related:** [`ROADMAP.md`](../../ROADMAP.md) · [`DEPARTMENTS.md`](DEPARTMENTS.md) ·
[`DEPARTMENT_ASSIGNMENTS.md`](DEPARTMENT_ASSIGNMENTS.md) · [`STATUS.md`](../../STATUS.md)

---

## What this document is

[`ROADMAP.md`](../../ROADMAP.md) sequences capability. This document turns that sequence into
assignable work: for each phase, which departments are involved, what they produce, in what order the
pull requests land, and what has to be true before the phase is allowed to close.

**This does not replace the roadmap.** The roadmap is the commitment; this is how it gets executed.
Where the two disagree, the roadmap wins and this document is the defect.

An engineering lead should be able to open this document, pick a phase, and hand out work without
asking anyone what to do next.

### How a phase runs

1. **Entry check** — every prerequisite met. A phase started on an unmet prerequisite gets paid for
   later at a higher price; this is the whole reason the roadmap is sequenced by dependency rather
   than by demo appeal.
2. **Assignment** — deliverables handed to departments in [`DEPARTMENT_ASSIGNMENTS.md`](DEPARTMENT_ASSIGNMENTS.md).
3. **Execution** — PRs land in the stated order. Each carries tests, docs and a `STATUS.md` update.
4. **Exit gate** — verified by the named department, not self-certified by the implementer.
5. **Close** — `STATUS.md` and `ROADMAP.md` updated; retrospective recorded.

### Standing requirements — every phase, every PR

These are not repeated per phase below. They always apply.

| Requirement                            | Enforced by                                          |
| -------------------------------------- | ---------------------------------------------------- |
| Tests for new behaviour                | `make test`; QA Lead review                          |
| No invariant weakened                  | `test/invariants`; QA Lead + Principal Architect     |
| Typecheck and lint clean               | `make typecheck`, `make lint`                        |
| Domain purity (ADR-0003)               | `check-domain-purity.sh`                             |
| Documentation current                  | `check-doc-headers.sh`, `check-links.sh`; D10 review |
| Every path owned                       | `check-codeowners-coverage.sh`                       |
| Debt logged in the PR that incurs it   | [`TECH_DEBT.md`](TECH_DEBT.md); rule 1               |
| Security review where a boundary moves | Security Lead                                        |
| Conventional commit + DCO sign-off     | commitlint, pre-commit hook                          |
| ADR for any new or replaced technology | `check-adrs.sh`; Principal Architect                 |

---

## Phase 0 — Engineering organisation ✅ complete

**Objective.** An organisation capable of building this for ten years exists before any code does.

**Departments.** D1, D2, D6, D7, D10

**Outputs.** Governance framework · 21 ADRs · 19 role charters · CODEOWNERS covering every path ·
executable governance gates · CI/CD · full documentation baseline.

**Exit gate.** A competent engineer joining with no context can find the answer to "how do we work
here, and why is it built this way?" without asking a human. **Met.**

---

## Phase 1 — Architecture & research 🟡 in progress

**Objective.** Every significant technical choice is made, justified and recorded before
implementation.

**Departments.** D2 (lead) · D1 · D5 · D6 · D8 · D10

**Prerequisites.** Phase 0 closed. ✅

**Inputs.** `VISION.md` · P1–P8 · ADR-0000–0021.

### Deliverables

| #    | Deliverable                         | Dept  | Role                 | State                       |
| ---- | ----------------------------------- | ----- | -------------------- | --------------------------- |
| 1.1  | C4 architecture views               | D2    | Principal Architect  | 🟡 context + container done |
| 1.2  | Domain model & bounded contexts     | D2    | Principal Architect  | 🟡 draft                    |
| 1.3  | Knowledge graph ontology v0.1       | D5    | Knowledge Graph Lead | 🟡 draft                    |
| 1.4  | Event catalogue v0.1 (AsyncAPI)     | D2/D3 | Backend Lead         | 🟡 draft                    |
| 1.5  | API contract v0.1 (OpenAPI + SDL)   | D2/D3 | Backend Lead         | ⚪ not started              |
| 1.6  | OSS evaluation                      | D1    | Research Lead        | 🟢 complete                 |
| 1.7  | Threat model (STRIDE) & PIA         | D6    | Security Lead        | 🟡 STRIDE started           |
| 1.8  | Consent framework specification     | D1/D6 | Governance Lead      | 🟡 needs external review    |
| 1.9  | Accessibility & i18n strategy       | D8    | UX Lead              | ⚪ not started              |
| 1.10 | NFRs & SLOs                         | D2    | CTO                  | ⚪ not started              |
| 1.11 | Scope & architecture reconciliation | D1/D2 | CTO                  | 🟢 **complete — ADR-0021**  |

### PR sequence

1. `docs: accessibility and internationalisation strategy` (1.9) — no dependencies, start now
2. `docs: non-functional requirements and service level objectives` (1.10) — no dependencies
3. `docs: STRIDE threat model and privacy impact assessment` (1.7)
4. `feat(contracts): API contract v0.1 — OpenAPI and GraphQL SDL, spec only` (1.5)
5. `feat(contracts): event catalogue v0.1 — AsyncAPI` (1.4)
6. `docs(architecture): component views and context map` (1.1, 1.2)
7. `docs(architecture): knowledge graph ontology v0.1` (1.3)

Items 1–3 are unblocked and independent; they can run in parallel today. Items 4–7 depend on ADR-0021,
which is now resolved.

**Acceptance.** Each deliverable reviewed by its owning department plus D2.
**Test requirements.** Contract schemas have round-trip tests before any implementation consumes them.
**Security review.** 1.7 and 1.8 are themselves security deliverables; Security Lead signs both off.
**Documentation.** Every artefact carries an owner header and appears in an index.

**Exit gate.** No unanswered "we'll figure that out later" on any load-bearing decision. ADRs 0001–0021
accepted or explicitly deferred with an owner. **Verified by:** Principal Architect and CTO jointly.

---

## Phase 2 — Infrastructure & identity ⚪ next

**Objective.** A developer clones the repository and has a working, observable, authenticated platform
locally in under fifteen minutes.

**Departments.** D7 (lead) · D6 · D3 · D9

**Prerequisites.**

- Phase 1 exit gate met.
- **TD-001 closed** — Dependency graph enabled. Non-negotiable: this phase introduces the first real
  third-party dependencies, and a supply-chain gate switched off at that moment is worse than one
  never claimed.
- D-1 licensing confirmed before `sdk/` or `packages/contracts/` accepts outside contributions.

**Inputs.** Developer Preview toolchain (0.1.0) · ADR-0007 · ADR-0013 · ADR-0014 · ADR-0016.

### Deliverables

| #   | Deliverable                                  | Dept | Definition of done                                                         |
| --- | -------------------------------------------- | ---- | -------------------------------------------------------------------------- |
| 2.1 | Monorepo toolchain                           | D7   | 🟢 **done in 0.1.0** — `pnpm install && pnpm build` green from clean clone |
| 2.2 | Local dev stack (full profile)               | D7   | `make dev-full` → all services healthy                                     |
| 2.3 | CI pipeline                                  | D7   | 🟢 **done in 0.1.0** — all PRs gated; < 10 min p95                         |
| 2.4 | Observability baseline                       | D7   | Traces span HTTP → service → DB; overlay exists, wiring pending            |
| 2.5 | Keycloak realm-as-code, OIDC, JWT validation | D6   | Login works; realm reproducible from source                                |
| 2.6 | Casbin authorisation model                   | D6   | Policy unit tests pass; deny-by-default proven                             |
| 2.7 | Helm chart & Terraform skeleton              | D7   | Chart installs on kind; `terraform validate` clean                         |
| 2.8 | Secrets management & rotation runbook        | D6   | No secret in git; rotation tested                                          |

### PR sequence

1. `chore(ci): enable dependency graph and close TD-001` — **blocking; must be first**
2. `feat(infra): observability wiring — OpenTelemetry exporter in the API` (2.4)
3. `feat(identity): Keycloak realm-as-code and OIDC discovery` (2.5)
4. `feat(authz): Casbin policy model and adapter` (2.6)
5. `feat(authz): replace the development authorisation adapter` (2.5, 2.6) — **deletes
   `DevelopmentAuthorizationAdapter`; the `X-Witness-Dev-User` header stops working, by design**
6. `feat(infra): Helm chart and Terraform modules` (2.7)
7. `docs(ops): secrets management and key rotation runbook` (2.8)

PR 5 is the one to plan around. It is the point at which the preview's honest-but-fake authorisation
is replaced by the real thing, and every integration test that relied on the header must move to
issuing tokens against a test realm.

**Acceptance.** New contributor productive in one morning; a hostile reviewer cannot find an
unauthenticated path to data.
**Test requirements.** Deny-by-default proven adversarially, not asserted. Realm reproducible from a
clean database.
**Security review.** Mandatory on PRs 3, 4, 5 and 7 — Security Lead, non-delegable.
**Documentation.** `DEVELOPER_ONBOARDING.md` re-executed end to end and updated in the same PR that
changes authentication.

**Exit gate.** `make bootstrap && make dev-full && make app` works from a clean clone; no
unauthenticated path to data exists. **Verified by:** Security Lead and Infrastructure Lead jointly.

---

## Phase 3 — Core backend & data

**Objective.** The system of record exists and is correct, with consent enforced before any data lands.

**Departments.** D4 (lead) · D3 · D6 · D9

**Prerequisites.** Phase 2 exit gate; ADR-0008 consent model confirmed; D-2 event transport decided.

### Deliverables

| #   | Deliverable                             | Dept  | Definition of done                                                    |
| --- | --------------------------------------- | ----- | --------------------------------------------------------------------- |
| 3.1 | Domain layer complete                   | D3    | 100% unit tested; zero infrastructure imports (already enforced)      |
| 3.2 | Hexagonal service template              | D3/D7 | Generates a service passing every gate                                |
| 3.3 | Schema, event log, transactional outbox | D4    | Migrations reversible; at-least-once delivery proven                  |
| 3.4 | **Consent service**                     | D6    | Revocation propagates within SLO; bypass impossible by construction   |
| 3.5 | Identity service — org/tenant/user/role | D6    | Multi-tenant isolation verified adversarially                         |
| 3.6 | API gateway — GraphQL BFF + REST        | D3    | Contract tests against Phase 1 specs; breaking-change detection in CI |
| 3.7 | Audit log — append-only, tamper-evident | D4    | Hash-chained (already built); DB trigger + restricted role added      |
| 3.8 | Backup & restore runbook                | D7    | Full restore from cold backup, timed                                  |

### PR sequence

1. `feat(data): event log and transactional outbox` (3.3)
2. `feat(consent): consent aggregate, grants and scopes` (3.4)
3. `feat(consent): revocation propagation` (3.4)
4. `feat(data): make consent_grant_id NOT NULL` (3.4) — **the hard migration; every existing record
   needs a grant or an explicit legacy disposition, and that disposition is D1's call, not D4's**
5. `feat(identity): tenant model with row-level security` (3.5)
6. `feat(data): audit append-only trigger and restricted role` (3.7)
7. `feat(api): GraphQL BFF conforming to the Phase 1 contract` (3.6)
8. `docs(ops): backup and restore runbook` (3.8)

**Acceptance.** Consent and provenance invariants enforced by the type system and the database,
not by developer discipline.
**Test requirements.** INV-7 (no processing without consent), INV-8 (tenant isolation) and INV-10
(revocation propagation) become executable and join `test/invariants`.
**Security review.** Mandatory on 2, 3, 4, 5, 6. Governance Lead signs off on 2, 3 and 4 — consent is
their absolute-veto territory.

**Exit gate.** Attempting to process without a consent grant fails by construction, demonstrated by
trying it. **Verified by:** Governance Lead and Security Lead jointly.

---

## Phase 4 — Knowledge graph

**Objective.** The graph is a projection that can be destroyed and rebuilt without loss.

**Departments.** D5 (lead) · D4 · D9

**Prerequisites.** Phase 3 exit gate; ontology v0.1; **ADR-0019 external Indigenous governance review
completed** — a hard gate, and nothing in this area is implemented until it is met.

**Deliverables.** Ontology implementation and versioning · graph projector worker · entity resolution
with human adjudication · bitemporal model · graph query API with traversal limits · provenance chain
API.

### PR sequence

1. `feat(kg): ontology schema and versioned migrations`
2. `feat(kg): graph projector worker — event log to Neo4j`
3. `feat(kg): full rebuild from zero`
4. `feat(kg): entity resolution with human adjudication`
5. `feat(kg): bitemporal valid-time and transaction-time model`
6. `feat(api): provenance chain endpoint`

**Exit gate.** Delete the graph entirely; rebuild from the event log; byte-comparable result
(INV-9). **Verified by:** QA Lead and Knowledge Graph Lead jointly.

---

## Phase 5 — AI platform & meeting capture

**Objective.** Extraction produces candidates with full provenance, and no candidate reaches the
record without a human.

**Departments.** D5 (lead) · D6 · D9 · D8

**Prerequisites.** Phase 4 exit gate; D-3 ASR engine decided; evaluation fixture set exists.

**Deliverables.** LiteLLM gateway and per-tenant egress policy · transcription and diarisation ·
media ingestion and lifecycle · extraction pipeline · human review queue · evaluation harness ·
document processing · offline capture.

### PR sequence

1. `feat(ai): LanguageModelPort and LiteLLM gateway` — egress policy first, before any model call
2. `feat(ai): local inference via Ollama`
3. `feat(ai): evaluation harness and regression suite` — **before** the extraction pipeline, so the
   first extraction change is already measurable
4. `feat(workers): transcription and diarisation`
5. `feat(workers): extraction to candidate assertions`
6. `feat(web): human review queue and correction UX`
7. `feat(ai): document processing`

Ordering 3 before 5 is deliberate. An extraction pipeline built before its evaluation harness cannot
be improved safely, because nobody can tell whether a prompt change helped.

**Exit gate.** No model output reaches the graph without provenance and human confirmation —
demonstrated by attempting to bypass it and failing. **Verified by:** Security Lead and AI Lead.

---

## Phase 6 — Search & experience

**Departments.** D8 (lead) · D3 · D5

**Deliverables.** Hybrid search with permission-aware filtering · full web application · design
system · graph exploration UI · admin console · i18n and RTL · SDKs.

**Exit gate.** An unassisted policy officer completes the core task in usability testing.
**Verified by:** UX Lead, with real participants.

---

## Phase 7 — Hardening

**Departments.** D6 (lead) · D7 · D9

**Deliverables.** Independent penetration test · performance and scale testing · disaster recovery
exercise · external accessibility audit · SBOM, signing, SLSA level 3 · air-gapped installation ·
threat model refresh against the as-built system.

**Exit gate.** External audit findings remediated or formally accepted with expiry dates.
**Verified by:** Security Lead and CTO.

---

## Phase 8 — v1.0 & reference deployments

**Departments.** D1 (lead) · every other department

**Deliverables.** Three reference deployments · operator training · published case studies including
failure modes · foundation governance transition · DPGA submission · v1.0.0 with LTS commitment.

**Exit gate.** Three institutions running Witness in production, at least one of which we did not
deploy ourselves. **Verified by:** Founder and Steering Committee.

---

## When a phase gate is not met

We do not proceed. From [`ROADMAP.md`](../../ROADMAP.md): _"Where a phase gate is not met, we do not
proceed — we fix."_

The failure mode this prevents is specific. Consent and provenance are cross-cutting invariants that
must exist before the first assertion is written. Every assertion written before them is permanently
untrustworthy — it cannot be retrofitted, only discarded. A phase gate slipped "just this once"
for a demo date is how a memory system ends up unable to prove anything about its own early
records.

If a gate cannot be met, the options are: fix it, or take it to the Steering Committee and record the
decision. Proceeding quietly is not among them.
