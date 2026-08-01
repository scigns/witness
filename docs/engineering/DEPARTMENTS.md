# Departments

**Owner:** CTO
**Status:** Active — established 2026-08-01
**Related:** [`agents/README.md`](../../agents/README.md) ·
[`.github/CODEOWNERS`](../../.github/CODEOWNERS) ·
[`PHASE_EXECUTION_PLAN.md`](PHASE_EXECUTION_PLAN.md) ·
[`DEPARTMENT_ASSIGNMENTS.md`](DEPARTMENT_ASSIGNMENTS.md)

---

## Why departments exist on top of roles

The nineteen role charters in [`agents/`](../../agents/) describe _authority_ — who decides what,
and who they escalate to. They do not describe _work allocation_, and until now nothing did.

A department is the unit of assignment. It groups roles that share a body of work, owns a set of
paths in the repository, and has an acceptance gate that says when its work is done. When a phase
begins, work is handed to departments; departments hand it to roles.

**Departments do not replace roles, CODEOWNERS or ADRs.** Merge authority still comes from
CODEOWNERS. Architectural authority still comes from the ADR process. A department that disagrees
with an accepted ADR writes a superseding ADR — it does not proceed and document later.

### The rule that makes this safe

> **No department may unilaterally change something another department owns.**

The cost of getting this wrong is specific and known: an implementation department quietly widening
scope, or working around a security control because the control was inconvenient. Every department
below therefore carries an explicit **prohibited** list. Those lists are the point of this document.

---

## Department index

| #   | Department                                                                        | Lead role           | Primary paths                                           | Active from |
| --- | --------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------- | ----------- |
| D1  | [Product & Governance](#d1--product--governance)                                  | Product Director    | `VISION.md`, `ROADMAP.md`, `docs/governance/`           | Phase 0     |
| D2  | [Architecture](#d2--architecture)                                                 | Principal Architect | `architecture/`                                         | Phase 0     |
| D3  | [Application Engineering](#d3--application-engineering)                           | Backend Lead        | `services/`, `apps/`, `packages/domain`                 | Phase 2     |
| D4  | [Data Engineering](#d4--data-engineering)                                         | Backend Lead        | `prisma/`, migrations, `workers/graph-projector`        | Phase 3     |
| D5  | [AI & Knowledge Engineering](#d5--ai--knowledge-engineering)                      | AI Lead             | `services/ai-orchestrator`, `workers/extraction`        | Phase 4     |
| D6  | [Security, Privacy & Sovereignty](#d6--security-privacy--sovereignty)             | Security Lead       | `scripts/security/`, `packages/policy`, `SECURITY.md`   | Phase 0     |
| D7  | [DevOps, Platform & SRE](#d7--devops-platform--sre)                               | Infrastructure Lead | `infrastructure/`, `.github/workflows/`, `deployments/` | Phase 0     |
| D8  | [UX & Accessibility](#d8--ux--accessibility)                                      | UX Lead             | `apps/web/src/components`, `packages/ui`                | Phase 1     |
| D9  | [QA & Verification](#d9--qa--verification)                                        | QA Lead             | `test/`                                                 | Phase 1     |
| D10 | [Documentation & Knowledge Management](#d10--documentation--knowledge-management) | Documentation Lead  | `docs/`, `README.md`, `.ai/`                            | Phase 0     |

---

## D1 — Product & Governance

**Mission.** Decide what Witness is, what it is not, and who has the authority to change that.

**Roles.** Product Director (lead) · Founder · Governance Lead · Research Lead · CTO (escalation)

**Responsibilities.** Product scope · requirements and PRDs · roadmap sequencing · governance
process · non-architectural decision records · consent framework · Indigenous data sovereignty
protocols · stakeholder acceptance.

**Authority.** Sole authority to change product scope. Governance Lead holds an **absolute veto**
where consent, provenance or Indigenous data sovereignty would be weakened
([`GOVERNANCE.md`](../../GOVERNANCE.md)).

**Owns.** `VISION.md` · `MISSION.md` · `ROADMAP.md` · `GOVERNANCE.md` · `docs/governance/` ·
`docs/product/` · `PROJECT_CONTEXT.md` (jointly with D2)

**May modify.** `STATUS.md` · `CHANGELOG.md` (release notes narrative)

**Required reviewers.** Scope change → Product Director **and** CTO. Principle change → Steering
Committee, 14-day notice.

**Depends on.** Nothing. This department is upstream of every other.

**Acceptance criteria.** Every deliverable traces to a stated user need; no requirement contradicts
P1–P8; scope changes carry a decision record.

**Prohibited.**

- Changing an accepted ADR (write a superseding one — D2's process).
- Committing implementation code.
- Adding scope through a PRD without an accompanying `ROADMAP.md` change.
- Citing [`SECTOR_APPLICATIONS.md`](../product/SECTOR_APPLICATIONS.md) as justification for work.

---

## D2 — Architecture

**Mission.** Keep the system coherent across a ten-year design life, and record why every expensive
decision was made.

**Roles.** Principal Architect (lead) · CTO · Knowledge Graph Lead · Backend Lead (consulted)

**Responsibilities.** System architecture · ADRs · bounded contexts and context map · interface and
contract design · technology selection · architecture fitness functions · technical coherence review.

**Authority.** Sole authority to accept an ADR. May **block any pull request** that violates an
accepted ADR, regardless of which department wrote it.

**Owns.** `architecture/` · `architecture/decisions/` · `packages/contracts` (jointly with D3) ·
`docs/engineering/ADR_PROCESS.md`

**May modify.** `PROJECT_CONTEXT.md` · `docs/engineering/CODING_STANDARDS.md`

**Required reviewers.** New ADR → Principal Architect **and** CTO, 7-day minimum discussion.
Contract change → D2 plus every consuming department.

**Depends on.** D1 for scope.

**Acceptance criteria.** No load-bearing decision is undocumented; every ADR states its costs and the
alternative a reasonable person would have chosen; `check-adrs.sh` passes.

**Prohibited.**

- Editing an accepted ADR. Supersede it — the record of having been wrong is part of the value.
- Introducing a technology absent from `TECH_STACK.md` without an ADR naming what it replaces.
- Weakening P1–P8 through an ADR without Steering Committee approval.

---

## D3 — Application Engineering

**Mission.** Implement the domain, the APIs and the application workflows, inside the architecture
D2 defined.

**Roles.** Backend Lead (lead) · Frontend Lead · Engineering Manager · Developer Experience Lead

**Responsibilities.** Domain model implementation · service implementation · API gateway (GraphQL
BFF and REST) · web application · admin console · application-level workflows · SDKs.

**Authority.** Full authority over implementation _within_ accepted architecture. May choose
libraries not listed in `TECH_STACK.md` **only** where they are internal to one package and
introduce no new runtime dependency for consumers.

**Owns.** `services/` · `apps/` · `packages/domain` · `packages/ui` (jointly with D8) · `sdk/`

**May modify.** `packages/contracts` (with D2 review) · `test/` (with D9 review)

**Required reviewers.** Backend Lead or Frontend Lead by area. Anything touching `packages/domain`
additionally requires Principal Architect — the domain is where the invariants live.

**Depends on.** D2 (architecture, contracts) · D4 (schema) · D6 (authorisation model) · D7 (local
stack).

**Acceptance criteria.** Tests pass · typecheck passes · `check-domain-purity.sh` passes ·
no new `any` · every new route declares an authorisation policy · debt logged in the same PR.

**Prohibited.**

- Importing infrastructure into `packages/domain` (ADR-0003 — mechanically enforced).
- Adding a route without `@Requires(...)`; the guard denies undeclared routes by design.
- Building an authentication system. Identity is D6's, and ADR-0007 already decided it.
- Widening the `notImplemented` list's silence — a capability that starts working must leave the list.

---

## D4 — Data Engineering

**Mission.** Own the system of record and everything derived from it, so that provenance survives
every schema change.

**Roles.** Backend Lead (lead) · Knowledge Graph Lead · Infrastructure Lead (consulted)

**Responsibilities.** PostgreSQL schema · migrations · event log and transactional outbox ·
projections (Neo4j, OpenSearch, pgvector) · projector workers · retention and deletion · backup and
restore · provenance chain storage.

**Authority.** Sole authority over migrations. May **refuse** a schema change that would make
existing provenance unverifiable.

**Owns.** `services/*/prisma/` · all migrations · `workers/graph-projector` · `workers/indexing` ·
`architecture/DATA_MODEL.md` (jointly with D2)

**May modify.** `infrastructure/docker/docker-compose.yml` data services (with D7 review)

**Required reviewers.** Every migration → Backend Lead **and** Principal Architect. Any migration
touching consent, provenance or audit → additionally Security Lead and Governance Lead.

**Depends on.** D2 (data model) · D1 (retention policy).

**Acceptance criteria.** Migrations are reversible · rebuild from the event log produces a
byte-comparable projection · no authoritative data outside PostgreSQL and object storage · backup and
restore timed and documented.

**Prohibited.**

- Storing authoritative data in a projection (ADR-0004 — projections are rebuildable by definition).
- An `UPDATE` or `DELETE` path against `audit_event`. It is append-only.
- Making `consent_grant_id` nullable once the consent service exists.
- Dropping a column carrying provenance without a superseding ADR.

---

## D5 — AI & Knowledge Engineering

**Mission.** Turn recorded conversation into candidate assertions a human can review — and never
present a model's inference as fact.

**Roles.** AI Lead (lead) · Knowledge Graph Lead · Research Lead

**Responsibilities.** Model abstraction and the LiteLLM gateway · local inference · transcription and
diarisation · extraction pipeline · embeddings and retrieval · ontology implementation · entity
resolution · evaluation harness and regression suites.

**Authority.** Model and prompt selection. **No authority** to change what constitutes acceptance of
a record — that is P4 and belongs to the domain.

**Owns.** `services/ai-orchestrator` · `workers/extraction` · `workers/transcription` ·
`services/knowledge-graph` · `architecture/KNOWLEDGE_GRAPH.md`

**May modify.** `packages/domain` assertion types (with D2 and D3 review)

**Required reviewers.** AI Lead **and** Principal Architect. Any change to egress behaviour →
Security Lead, mandatory.

**Depends on.** D4 (storage, provenance) · D6 (egress policy) · D2 (ontology).

**Acceptance criteria.** Every candidate carries model identifier, version, prompt hash, sampling
parameters, confidence and source span · the default configuration provably makes zero external
calls · no model or prompt change merges without an evaluation delta report.

**Prohibited.**

- Making an external provider reachable in the sovereign profile (ADR-0009 — enforced at boot).
- Writing a model output directly into the accepted record. Candidates only.
- Presenting a confidence score as a truth value, or hiding one from a user.
- Shipping an extraction change without an evaluation run.

---

## D6 — Security, Privacy & Sovereignty

**Mission.** Make the guarantees in P1–P5 true in code, and prove it adversarially.

**Roles.** Security Lead (lead) · Governance Lead · CTO

**Responsibilities.** Threat modelling · privacy impact assessment · consent enforcement · Indigenous
data sovereignty protocols · identity and access control · authorisation policy · secret management ·
supply-chain security · security review · incident response.

**Authority.** May **block any merge** on security grounds. Governance Lead holds an absolute veto
where consent, provenance or Indigenous data sovereignty is weakened. Security exceptions require an
expiry date — an open-ended exception is refused.

**Owns.** `SECURITY.md` · `scripts/security/` · `packages/policy` · `services/identity` ·
`services/consent` · `architecture/SECURITY_ARCHITECTURE.md` · `docs/governance/CONSENT_FRAMEWORK.md`

**May modify.** `.github/workflows/security.yml` · any file where a vulnerability is being fixed

**Required reviewers.** Security Lead. Consent or Indigenous data sovereignty → additionally
Governance Lead, non-delegable.

**Depends on.** D2 (architecture) · D1 (legal bases, retention policy).

**Acceptance criteria.** Deny-by-default proven by test · no secret in git · every egress path
logged and surfaced · adversarial suite passes · every security exception carries an expiry.

**Prohibited.**

- Granting a security exception without an expiry date and an owner.
- Approving a change that weakens P1–P5 without Steering Committee approval.
- Allowing the development authorisation adapter to be reachable outside the development profile.

---

## D7 — DevOps, Platform & SRE

**Mission.** Make Witness runnable — by us in development, and by a two-person government IT team at
2am with a runbook.

**Roles.** Infrastructure Lead (lead) · Developer Experience Lead · Release Manager

**Responsibilities.** CI/CD · containers and images · local development stack · Kubernetes,
Helm and Terraform · observability · environments and configuration · release engineering ·
backup operations · air-gapped installation.

**Authority.** Sole authority over the pipeline and deployment topology within ADR-0013. May
**refuse** a change that cannot be operated or observed.

**Owns.** `infrastructure/` · `deployments/` · `.github/workflows/` · `Makefile` ·
`scripts/dev/` · `scripts/ci/` · `docs/operations/`

**May modify.** `package.json` scripts · `turbo.json` · `.env.example`

**Required reviewers.** Infrastructure Lead. Workflow changes → additionally Security Lead, because
a workflow is a supply-chain surface.

**Depends on.** D6 (hardening requirements) · D3 (what needs running).

**Acceptance criteria.** `make bootstrap && make dev && make app` works from a clean clone ·
CI p95 under 10 minutes · every action pinned to a commit SHA · zero-egress verification passes ·
air-gapped install verified with no internet.

**Prohibited.**

- Adding a step that requires network egress in the sovereign profile.
- Using a floating action tag. Pin to a SHA — enforced by `check-action-pinning.sh`.
- Disabling or narrowing a gate to make a build pass. Fix the failure or record the debt.
- Putting a secret in a workflow file or a compose file.

---

## D8 — UX & Accessibility

**Mission.** Make an unassisted policy officer able to do the job, in the language and bandwidth they
actually have.

**Roles.** UX Lead (lead) · Frontend Lead · Documentation Lead (consulted)

**Responsibilities.** Interaction design · information architecture · the design system ·
accessibility · internationalisation and RTL · usability testing · low-bandwidth budgets.

**Authority.** May **block a merge** on a WCAG 2.2 AA failure. P8 makes accessibility a merge gate,
not a milestone.

**Owns.** `packages/ui` · `apps/web/src/components` ·
`apps/web/src/app/globals.css` · `docs/product/PERSONAS.md`

**May modify.** `apps/web/src/app/**` page composition (with D3 review)

**Required reviewers.** UX Lead for any user-facing change.

**Depends on.** D1 (journeys) · D3 (data available to render).

**Acceptance criteria.** WCAG 2.2 AA verified per component · keyboard-only path complete ·
visible focus on every interactive element · meaning never carried by colour alone · usable at
low bandwidth · translatable strings.

**Prohibited.**

- Removing a focus indicator.
- Rendering an unaccepted record identically to a confirmed one — that defeats P4 in the interface.
- Adding a runtime dependency on an externally hosted font, script or image (P1).
- Shipping a component with no accessibility test.

---

## D9 — QA & Verification

**Mission.** Prove the promises, and try to break them.

**Roles.** QA Lead (lead) · Security Lead (adversarial) · Principal Architect (invariants)

**Responsibilities.** Test strategy · unit, integration, contract and end-to-end testing ·
the invariant suite · the adversarial suite · acceptance criteria · regression prevention ·
performance and scale testing · disaster recovery exercises.

**Authority.** May **block a release**. Sole authority over `test/invariants` and
`test/adversarial` — a weakened assertion there requires QA Lead **and** the owning department.

**Owns.** `test/` · `docs/engineering/TESTING_STRATEGY.md`

**May modify.** any package's test files

**Required reviewers.** QA Lead. Invariant changes → additionally Principal Architect. Adversarial
changes → additionally Security Lead.

**Depends on.** every implementing department.

**Acceptance criteria.** Every principle P1–P8 has at least one executable assertion or a documented
phase in which it acquires one · no invariant is stubbed to pass · adversarial tests are written from
the attacker's side.

**Prohibited.**

- Weakening an invariant assertion to make a build pass. That is the loudest possible signal in
  review, and it means either the change is wrong or an ADR is needed.
- Stubbing a test green over code that does not exist. Document the phase instead.
- Deleting a failing test rather than fixing what it caught.

---

## D10 — Documentation & Knowledge Management

**Mission.** Make the repository answer "how do we work here, and why is it built this way?" without
asking a human.

**Roles.** Documentation Lead (lead) · Open Source Lead · Developer Experience Lead

**Responsibilities.** Technical documentation · user and operator documentation · onboarding ·
decision indexes · repository discoverability · AI contributor context · community documentation.

**Authority.** May **block a merge** that leaves documentation stale — staleness is a defect
([`CONTRIBUTING.md`](../../CONTRIBUTING.md)), not a follow-up.

**Owns.** `docs/` (except `docs/governance/`, D1) · `README.md` · `CONTRIBUTING.md` · `.ai/` ·
`docs/engineering/DEVELOPER_ONBOARDING.md`

**May modify.** any document header, ownership line or index entry

**Required reviewers.** Documentation Lead.

**Depends on.** every department.

**Acceptance criteria.** Every document declares an owner and status · every internal link resolves
against tracked content · onboarding executes end-to-end on a clean clone · `STATUS.md` is current.

**Prohibited.**

- Documenting a capability that does not exist without labelling it as target state.
- Leaving a document without an owner — `check-doc-headers.sh` fails the build.
- Describing a command that does not run. Every documented command is executed before merge.

---

## Cross-department escalation

```text
Implementation disagreement        → Engineering Manager
Architectural disagreement         → Principal Architect → CTO
Scope disagreement                 → Product Director → CTO
Security objection                 → Security Lead (blocking; CTO cannot override alone)
Consent / provenance / Indigenous
  data sovereignty objection       → Governance Lead (absolute veto)
Principle (P1–P8) change           → Steering Committee, 14-day notice
Licence change                     → Steering Committee + every copyright holder, 30-day notice
```

A department that believes another department's decision is wrong **states the objection and
escalates**. It does not route around it, and it does not implement its preferred answer and document
afterwards. The second is how an architecture becomes a rumour.
