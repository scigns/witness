# Domain Model & Bounded Contexts

**Owner:** Principal Architect
**Status:** Draft — Phase 1 deliverable 1.2. Pending Principal Architect sign-off per
[`DEPARTMENT_ASSIGNMENTS.md`](../../docs/engineering/DEPARTMENT_ASSIGNMENTS.md)'s acceptance gate
for row 1.2 ("Aggregates, invariants, context map; Principal Architect"). Not self-certified — see
[`PHASE_EXECUTION_PLAN.md`](../../docs/engineering/PHASE_EXECUTION_PLAN.md)'s rule that an exit gate
is verified by the named department, not the implementer.
**Related:** [`ARCHITECTURE.md`](../ARCHITECTURE.md) §3 (context map, source of the twelve contexts
below) · [`DATA_MODEL.md`](../DATA_MODEL.md) (aggregate map, bitemporality, tenancy, retention —
this document elaborates each context against it, not instead of it) ·
[`../views/COMPONENT_VIEWS.md`](../views/COMPONENT_VIEWS.md) (C4 L3 for three containers)

---

## What this is

`ARCHITECTURE.md` §3 named twelve bounded contexts with their ownership and one key invariant each.
`DATA_MODEL.md` §2 mapped eight aggregates and their consistency boundaries. Neither elaborated a
single context to the depth [`DEPARTMENT_ASSIGNMENTS.md`](../../docs/engineering/DEPARTMENT_ASSIGNMENTS.md)'s
acceptance gate for 1.2 requires. This document does that, context by context, and — because 1.2
depends on 1.1 and gates 1.4/1.5 — closes with an explicit map of every context against what the
Developer Preview 0.1.0 actually implements, so a reader can tell decided architecture from shipped
code without cross-referencing five files.

**One file, not twelve.** `architecture/domains/README.md` anticipated "detail lands here as each
context is designed" — this is that landing, kept as one document rather than split per context,
because at Phase 1's depth the contexts are still small enough that a single navigable document beats
twelve thin ones. Split when a context's detail outgrows a section, not before.

## How to read the classification labels

Every context ends with two labels, used consistently and only in these forms:

**Implementation status** — `IMPLEMENTED IN 0.1.0` · `APPROVED BUT NOT IMPLEMENTED` (an ADR or this
document decided it; no code exists) · `PLANNED / GATED` (decided in outline; blocked behind a phase
prerequisite, e.g. ADR-0019's external review) · `FUTURE` (named in scope, not yet designed).

**Drift classification**, only where 0.1.0 code exists and differs from this document:
`PREVIEW SIMPLIFICATION` (a deliberate, documented Phase-1 shortcut, e.g. `consent_grant_id` nullable
until Phase 3) · `PHASE 2 GAP` (a decided control not yet built, on the roadmap) ·
`TECHNICAL DEBT` (an undocumented or accidental gap — should have a `TECH_DEBT.md` entry) ·
`DECISION REQUIRED` (the code and the architecture disagree and neither is obviously right) ·
`NO DRIFT` (code matches the model).

---

## 1. Identity & Tenancy

**Mission.** Establish who is acting and within which tenant boundary, so every other context can
assume that question is already answered.

**Owned aggregates.** `Tenant` (`DATA_MODEL.md` §2 — "Isolation root; changes rarely; everything
hangs off it").

**Entities and value objects.** Tenant, Workspace, User, Role, Group (`ARCHITECTURE.md` §3: "Owns
Organisations, workspaces, users, roles, groups").

**Invariants.** A user acts within exactly one tenant per request; cross-tenant reference is
impossible (`ARCHITECTURE.md` §3). Every tenant-scoped table carries `tenant_id NOT NULL` plus
PostgreSQL row-level security (`DATA_MODEL.md` §5) — defence in depth, not either/or.

**Commands.** *(Not yet named — Identity & Tenancy has no implementation. Naming commands before the
IdP integration (ADR-0007, Phase 2) is designed would invent an API this document has no authority to
decide alone; see `APPROVED BUT NOT IMPLEMENTED` below.)*

**Events.** Not yet named, same reason.

**Inbound / outbound dependencies.** No inbound dependency — this context is upstream of everything
else. Outbound: every other context depends on it as a **Conformist**
(`ARCHITECTURE.md` — "Identity → all: Conformist. Everyone accepts the identity model as given").

**Transaction and consistency boundary.** `Tenant` is its own aggregate root; a tenant's
configuration change is independently consistent from any workspace or user change beneath it.

**Permitted integration patterns.** Conformist (downstream contexts take the identity model as
given, no local reinterpretation).

**Prohibited cross-context access.** No context may resolve a user's tenant membership by any path
other than the identity context's own record — not by inference from data ownership, not by caching
a stale claim past token expiry.

**Provenance ownership.** None — Identity & Tenancy is not a provenance source; it is consumed by
provenance (every `capturedBy` actor resolves through this context).

**Consent ownership.** None.

**Audit ownership.** None directly, but every audit event's actor resolves through this context.

**Identity/policy boundary.** This context *is* the identity half of the identity/policy boundary.
[ADR-0007](../decisions/ADR-0007-identity-and-access.md) is the accepted decision: Keycloak
federating to whatever IdP the institution already runs. The policy half (Casbin) is a separate
context — see §3.

**Projection/search ownership.** None.

**Retention/deletion responsibilities.** Tenant offboarding and user deprovisioning — not yet
designed; flagged as a gap this document surfaces rather than silently omits.

**Current implementation mapping.** Partial, as of `BUILD_ROADMAP.md` Release 0.2 items 1–2 and
Milestone 1.1. `packages/domain/src/organisation.ts` (`createOrganisation`) and
`services/api-gateway/src/organisations/` implement creation and listing of the isolation root this
section calls `Tenant` — named `Organisation` in code, matching `ARCHITECTURE.md` §3's "Owns
Organisations, workspaces, users, roles, groups" rather than `DATA_MODEL.md` §2's `Tenant` label; the
two documents do not yet agree on one name for this aggregate, and this implementation did not
resolve that, only proceed under the roadmap's term.
`packages/domain/src/workspace.ts` (`createWorkspace`) and `services/api-gateway/src/workspaces/`
add a `Workspace` scoped to exactly one organisation via a real foreign key — unlike `AuditEvent`'s
polymorphic subject reference, a workspace has exactly one parent type, so referential integrity is
a database constraint here, not an application-layer promise.

Milestone 1.1 (Users and Memberships) adds `packages/domain/src/user.ts` (`createUser` — a
registered account, deliberately independent of `Actor`; see that file's own header for why),
`packages/domain/src/membership.ts` (one state machine — `invited → active ⇄ suspended`, `revoked`
terminal — shared by both membership kinds), `organisation-membership.ts` and
`workspace-membership.ts`, plus `services/api-gateway/src/users/`,
`organisation-memberships/` and `workspace-memberships/`. A workspace membership cannot exist
without an organisation membership in good standing *for that workspace's specific organisation* —
the eligibility check the domain enforces from a state the service reads and passes in, which is
what stops standing in one organisation being used to justify workspace access under another. Role
and Group remain unimplemented, as does tenant-scoped row-level security (§`Invariants` above) —
nothing on `Record` or `Source` references an organisation, workspace, or user, so cross-tenant
isolation is still not enforced anywhere; membership answers "does this user belong here", not "what
may they do here" (that is Milestone 1.2, Roles and Permission Assignment, deliberately not this
PR). The Developer Preview's `DevelopmentAuthorizationAdapter`
(`services/api-gateway/src/authz/development.adapter.ts`) still resolves a principal from an
unverified `X-Witness-Dev-User` header, unrelated to and unchanged by this — real identity remains
Milestone 1.3.

**Future implementation mapping.** `services/identity` (named in `ARCHITECTURE.md`'s container view
as `SIDENT`). Milestone 1.3 (Authentication).

**Classification.** `PARTIALLY IMPLEMENTED` (isolation root, its workspaces, registered users, and
organisation/workspace membership — no role assignment, no row-level security, no authentication;
ADR-0007 still decides the identity approach and no identity service exists). Drift:
`PREVIEW SIMPLIFICATION` — a user can now be a member of an organisation and, transitively, a
workspace, but nothing enforces that membership against `Record`/`Source` access, so nothing is
actually tenant-isolated yet; every other context in this document still correctly treats Identity &
Tenancy as not delivering isolation.

---

## 2. Consent & Legal Basis

**Mission.** No processing without a valid, scoped, revocable consent grant.

**Owned aggregates.** `Subject & Consent`, root `Subject` (`DATA_MODEL.md` §2 — "A person's consent
state must be transactionally consistent — a partial revocation is a privacy incident").

**Entities and value objects.** Subject, ConsentGrant, ConsentScope (`ARCHITECTURE.md` §3: "Owns
Grants, scopes, subjects, revocations, legal bases").

**Invariants.** No processing of a subject's data without an active grant covering the purpose
(`ARCHITECTURE.md` §3). Consent revocation propagates to every projection within
[`NFR_SLO.md`](../NFR_SLO.md) §2's p99 ≤ 300s SLO — the one guarantee the architecture treats as
page-worthy rather than merely monitored.

**Commands.** `GrantConsent`, `ScopeConsent`, `RevokeConsent` — named provisionally from
`CONSENT_FRAMEWORK.md`'s lifecycle (§4), not yet formalised as an API; formalisation is deliverable
3.4, not this document's authority.

**Events.** `ConsentGranted`, `ConsentScopeAdded`, `ConsentRevoked` — same provisional status.

**Inbound / outbound dependencies.** Inbound: Identity & Tenancy (a subject's grant is scoped to a
tenant). Outbound: Ingestion & Media, Knowledge Graph, Search & Retrieval all depend on this context
as **Customer/Supplier with an enforced gate** — `ARCHITECTURE.md`: "Downstream cannot proceed
without a decision; this is a *hard* dependency by design."

**Transaction and consistency boundary.** The `Subject` aggregate, including all its grants and
scopes, is one consistency boundary — a revocation must be atomic with respect to every scope it
touches, or a downstream context could observe a partially-revoked state.

**Permitted integration patterns.** Customer/Supplier with an enforced gate (the policy decision
point — see §3), never a soft advisory check a downstream context can choose to skip.

**Prohibited cross-context access.** No context may process subject data via a path that does not
pass through this context's policy decision point — [ADR-0008](../decisions/ADR-0008-consent-as-a-domain-primitive.md)
names this explicitly, and `docs/research/THREAT_MODEL.md` T-1 (Critical) is the threat model entry
for exactly this bypass.

**Provenance ownership.** None — consumed by provenance (a record's `consentGrantId`, once
non-nullable, is itself a provenance fact: under what authority was this processed).

**Consent ownership.** This context **is** the consent owner. No other context may hold or interpret
consent state independently.

**Audit ownership.** None directly; every consent lifecycle transition is itself an audited event
(owned by Audit & Provenance, §10).

**Identity/policy boundary.** Downstream of Identity & Tenancy (who the subject/grantor is);
upstream of Authorisation (§3) only insofar as a consent decision is one input the PDP evaluates —
consent and authorisation remain distinct decisions, not one merged check.

**Projection/search ownership.** None directly; constrains what Knowledge Graph and Search &
Retrieval may expose (`ARCHITECTURE.md`'s context map: "Consent -.->|constrains| KG" and
"-.->|constrains| Search").

**Retention/deletion responsibilities.** Drives erasure: `DATA_MODEL.md` §7's reconciliation (content
hard-deleted everywhere, structural record and audit tombstone retained) is triggered by a subject's
erasure request, which is a consent-context event.

**Current implementation mapping.** None. `services/api-gateway/prisma/schema.prisma`'s `Record`
model has `consentGrantId String?` — nullable, with a code comment stating exactly why: "Nullable
ONLY because the consent service does not exist yet — Phase 3, roadmap 3.4."

**Future implementation mapping.** `services/consent` (`architecture/views/COMPONENT_VIEWS.md` §2
already sketches its internal components — Grant aggregate, policy decision point, revocation
propagator). Phase 3, deliverable 3.4.

**Classification.** `APPROVED BUT NOT IMPLEMENTED`. Drift on the one field that exists today
(`consentGrantId`): `PREVIEW SIMPLIFICATION` — nullable is a documented, deliberate Phase-1 gap, not
an accident, per the schema's own comment and `PHASE_EXECUTION_PLAN.md`'s PR sequence item
"`feat(data): make consent_grant_id NOT NULL` — the hard migration."

---

## 3. Authorisation

**Mission.** Decide, for every request, whether the acting principal may do what they are asking —
and refuse by default.

**Owned aggregates.** None — Authorisation is a decision function over other contexts' state
(identity, consent, sensitivity), not an aggregate root of its own.

**Entities and value objects.** Policy model, decision point, effective permissions
(`ARCHITECTURE.md` §3).

**Invariants.** Absence of an explicit allow is a deny (`ARCHITECTURE.md` §3) — deny-by-default,
verified adversarially in the Developer Preview today (`test/adversarial/adversarial.test.ts`,
"ATTACK — escalate privilege through the authorisation adapter": an invented role grants nothing,
an empty header yields no anonymous principal).

**Commands.** `Authorize(principal, action, resource)` — the one operation this context exposes,
already the actual shape of `AuthorizationPort.decide()` in
`services/api-gateway/src/authz/authorization.port.ts`.

**Events.** None emitted by this context directly; an authorisation decision is recorded as context
on the action it gated, not as its own event stream.

**Inbound / outbound dependencies.** Inbound: Identity & Tenancy (who), Consent & Legal Basis (one
input to the decision). Outbound: every context that gates an action calls this one — it has no
downstream dependents in the DDD sense, only callers.

**Transaction and consistency boundary.** Stateless per decision — a decision reads current state
from Identity, Consent and the resource's sensitivity; it does not itself hold transactional state.

**Permitted integration patterns.** Open host service — a single decision API every other context
calls identically, never reimplemented locally.

**Prohibited cross-context access.** No context may implement its own authorisation check in
preference to calling this context's decision point — the exact failure mode `AuthorizationGuard`
(`services/api-gateway/src/authz/authorization.guard.ts`) exists to make structurally hard: every
route goes through the guard, not through ad hoc checks in controllers.

**Provenance ownership.** None.

**Consent ownership.** None — consumes consent decisions, does not own consent state.

**Audit ownership.** None — decisions are logged by the caller as part of the action's audit event,
not by this context as a separate stream (avoids a second source of truth for "was this allowed").

**Identity/policy boundary.** This context **is** the policy half of the identity/policy boundary
named in §1. [ADR-0007](../decisions/ADR-0007-identity-and-access.md) names Casbin as the accepted
policy engine.

**Projection/search ownership.** None directly; every projection read path must call through here
for permission-aware filtering (Phase 6, `PHASE_EXECUTION_PLAN.md`: "Hybrid search with
permission-aware filtering").

**Retention/deletion responsibilities.** None.

**Current implementation mapping.** `services/api-gateway/src/authz/` — `AuthorizationPort` (the
seam), `AuthorizationGuard` (deny-by-default enforcement), `DevelopmentAuthorizationAdapter` (the
one implementation today, explicitly a development-only stand-in). This is the **most implemented**
context in 0.1.0 relative to its final design: the port/guard shape is the real, permanent
architecture: only the adapter behind the port is temporary.

**Future implementation mapping.** Casbin-backed adapter implementing the same `AuthorizationPort`,
replacing `DevelopmentAuthorizationAdapter` (`DEPARTMENT_ASSIGNMENTS.md` row
`feat/remove-dev-authz`, Phase 2, "**deletes** `DevelopmentAuthorizationAdapter`; the
`X-Witness-Dev-User` header stops working, by design").

**Classification.** `IMPLEMENTED IN 0.1.0` for the port/guard boundary; `PLANNED / GATED` for the
real policy engine. Drift: `NO DRIFT` — the development adapter does not pretend to be the final
implementation; its own log line says so at every boot ("DEVELOPMENT ONLY — NOT AN AUTHENTICATION
SYSTEM").

---

## 4. Ingestion & Media

**Mission.** Get a recorded or uploaded session into the system with its consent gate and media
lifecycle intact.

**Owned aggregates.** `Session` (`DATA_MODEL.md` §2 — "The meeting: participants, media, metadata.
Consistency needed for the consent gate").

**Entities and value objects.** Session, MediaObject, Participation (`ARCHITECTURE.md` §3: "Owns
Sessions, recordings, uploads, documents, lifecycle").

**Invariants.** Every media object is bound to a session with a consent grant before processing
(`ARCHITECTURE.md` §3).

**Commands.** `CreateSession`, `AttachMedia`, `RecordParticipation` — provisional, not yet a formal
API; this context has no implementation to ground a real command shape in.

**Events.** `SessionCreated`, `MediaAttached` — provisional, same caveat.

**Inbound / outbound dependencies.** Inbound: Consent & Legal Basis (hard gate). Outbound:
Transcription depends on this context for media (`ARCHITECTURE.md` context map: "INGEST →
TRANSCRIBE").

**Transaction and consistency boundary.** `Session` is the consistency boundary; a session's
participant list and media attachments are transactionally consistent with each other, not with
downstream transcription state.

**Permitted integration patterns.** Customer/Supplier with the consent gate enforced (same shape as
Consent's outbound relationship in §2).

**Prohibited cross-context access.** No media may be attached to processing (transcription,
extraction) without the session's consent gate already having passed — this is the same T-1 threat
boundary as §2, restated from the ingestion side.

**Provenance ownership.** Partial — a `Session` is itself a provenance `Source` candidate
(`DATA_MODEL.md`'s `SOURCE` entity in the aggregate map), but Audit & Provenance (§10) owns the
provenance chain construction, not this context.

**Consent ownership.** None — consumes the consent gate, does not own consent state.

**Audit ownership.** None directly.

**Identity/policy boundary.** Downstream of Identity (who is uploading) and Authorisation (may this
principal ingest for this tenant).

**Projection/search ownership.** None.

**Retention/deletion responsibilities.** Media lifecycle and retention policy application — not yet
designed in detail; `DATA_MODEL.md` §7's erasure reconciliation applies once this context exists.

**Current implementation mapping.** None. The Developer Preview's `Record.capture` flow
(`packages/domain/src/record.ts` `captureRecord`) takes a `Source` and `Provenance` directly — it
does not model a `Session` or `MediaObject` at all, because there is no ingestion pipeline yet. A
`Source` in 0.1.0 is a simplified stand-in for what this context will eventually produce.

**Future implementation mapping.** No container named yet in `ARCHITECTURE.md`'s Level 2 view under
this exact name; the closest is `SINGEST` (`services/api-gateway/src/main.ts`'s container diagram).
Phase 5 (`PHASE_EXECUTION_PLAN.md`: "media ingestion and lifecycle").

**Classification.** `FUTURE`. Drift: not applicable — `packages/domain`'s `Source` type is not a
simplification of `Session`/`MediaObject`, it is a different, smaller concept serving 0.1.0's single
narrow workflow (manual capture, not recorded-session ingestion).

---

## 5. Transcription

**Mission.** Turn recorded audio into a time-aligned, speaker-attributed transcript.

**Owned aggregates.** `Transcript` (`DATA_MODEL.md` §2 — "Large and immutable once complete;
separate so a session update does not lock a transcript").

**Entities and value objects.** Transcript, Utterance, Speaker, alignment data (`ARCHITECTURE.md`
§3).

**Invariants.** Every utterance has a time range in an identified media object (`ARCHITECTURE.md`
§3).

**Commands.** `TranscribeMedia` — provisional.

**Events.** `TranscriptCompleted` — provisional; `ARCHITECTURE.md`'s context map names the
Transcript schema as a **Published language** to Extraction, so this event's payload is a public
contract once it exists, not an internal detail.

**Inbound / outbound dependencies.** Inbound: Ingestion & Media. Outbound: Extraction, via the
published transcript schema in `packages/contracts`.

**Transaction and consistency boundary.** `Transcript` is immutable once complete and does not share
a transaction with `Session` — deliberately, so a session metadata edit never locks or blocks
transcript writes (`DATA_MODEL.md` §2).

**Permitted integration patterns.** Published language (versioned contract in
`packages/contracts` — `ARCHITECTURE.md`'s context map).

**Prohibited cross-context access.** Extraction may not read raw media directly; it consumes only
the published Transcript schema, never reaching upstream into Transcription's internal
representation.

**Provenance ownership.** Contributes provenance (utterance-level timestamps are the anchor every
downstream assertion cites), but does not own the provenance chain itself.

**Consent ownership.** None.

**Audit ownership.** None.

**Identity/policy boundary.** None directly — operates on already-consented media.

**Projection/search ownership.** None directly; transcripts are a future full-text search source
(Phase 6).

**Retention/deletion responsibilities.** Subject to the same erasure reconciliation as media
(`DATA_MODEL.md` §7) — transcript content is hard-deleted on erasure, structural fact retained.

**Current implementation mapping.** None.

**Future implementation mapping.** `workers/transcription` (named in `ARCHITECTURE.md`'s container
view as `WTRANS`, calling Whisper). Phase 5, `PHASE_EXECUTION_PLAN.md` PR sequence item 4:
"`feat(workers): transcription and diarisation`."

**Classification.** `FUTURE`. Drift: not applicable.

---

## 6. Extraction

**Mission.** Propose candidate institutional-memory assertions from a transcript, never presenting
them as fact.

**Owned aggregates.** `CandidateSet` (`DATA_MODEL.md` §2 — "One extraction run's output; reviewed as
a unit").

**Entities and value objects.** Candidate assertion, model run, prompt, confidence
(`ARCHITECTURE.md` §3).

**Invariants.** Every candidate cites the utterance span that produced it (`ARCHITECTURE.md` §3).
Schema-constrained output only — `docs/research/THREAT_MODEL.md` T-5's planned mitigation for prompt
injection.

**Commands.** `RunExtraction(transcriptId)` — provisional.

**Events.** `CandidateSetProduced` — provisional; published language to Curation & Review, same
pattern as Transcription → Extraction.

**Inbound / outbound dependencies.** Inbound: Transcription (published transcript schema).
Outbound: Curation & Review, via the published candidate-assertion schema
(`ARCHITECTURE.md` context map).

**Transaction and consistency boundary.** `CandidateSet` — one extraction run's output is reviewed
and accepted/rejected as a unit, not candidate-by-candidate at the storage layer (review UX may
still present them individually).

**Permitted integration patterns.** Published language (candidate assertion schema in
`packages/contracts`).

**Prohibited cross-context access.** Extraction output may never write directly to the Knowledge
Graph or to an `Assertion` — it can only ever produce a `CandidateSet` that Curation & Review
processes. This is the literal implementation of P4 ("the machine proposes, the human disposes") as
a context boundary, not just a UI convention.

**Provenance ownership.** Contributes to the provenance chain (model identifier, version, prompt
hash — `DEPARTMENTS.md` D5's acceptance criteria) but does not own chain construction.

**Consent ownership.** None — operates only on already-consented, already-ingested media.

**Audit ownership.** None.

**Identity/policy boundary.** None directly.

**Projection/search ownership.** None.

**Retention/deletion responsibilities.** Rejected candidates and superseded extraction runs are
subject to a retention policy — not yet designed.

**Current implementation mapping.** None. `packages/domain/src/record.ts`'s domain functions —
`captureRecord`, `submitForReview`, `confirmRecord` — enforce the human-confirmation invariant
(P4) that this context will eventually feed into, but there is no extraction pipeline producing
candidates in 0.1.0; every 0.1.0 record is captured by a human directly.

**Future implementation mapping.** `workers/extraction` and `services/ai-orchestrator`
(`ARCHITECTURE.md` container view: `WEXTRACT`, `SAI`). Phase 5, sequenced explicitly **after** the
evaluation harness (`PHASE_EXECUTION_PLAN.md`: "Ordering 3 before 5 is deliberate. An extraction
pipeline built before its evaluation harness cannot be improved safely").

**Classification.** `FUTURE`. Drift: not applicable — the P4 guarantee this context will rely on is
already `IMPLEMENTED IN 0.1.0` one level down, in Curation & Review (§7) and `packages/domain`
directly; this document does not double-count that as extraction-context progress.

---

## 7. Curation & Review

**Mission.** The one context where a human decides what becomes institutional memory.

**Owned aggregates.** `Assertion`, and in 0.1.0's simplified form, `InstitutionalRecord`
(`packages/domain/src/record.ts`). `DATA_MODEL.md` §2: *"`Assertion` is its own aggregate rather
than being nested under `Entity`. This means two reviewers can confirm different assertions about
the same person concurrently without contention."*

**Entities and value objects.** Review queues, adjudication, corrections, merges
(`ARCHITECTURE.md` §3). In 0.1.0: `InstitutionalRecord` with `reviewState` ∈
`{draft, in_review, confirmed, corrected, rejected}` (`packages/domain/src/review.ts`).

**Invariants.** No candidate becomes an assertion without a human decision (`ARCHITECTURE.md` §3) —
`packages/domain/src/record.ts`'s `confirmRecord` throws `HumanConfirmationRequired` for any
non-human actor, tested adversarially ("cannot launder a model actor by giving it a human-looking
name"). A no-change correction is refused — "recording an unchanged correction would corrupt the
correction-rate signal" (`record.ts`), because `VISION.md` measures correction rate as a product
quality signal. `confirmed` and `corrected` are deliberately distinct terminal states for the same
reason (`review.ts`).

**Commands.** `captureRecord`, `submitForReview`, `confirmRecord`, `correctRecord`, `rejectRecord`,
`reopenRecord` — the actual exported functions of `packages/domain/src/record.ts`, the one context
in this document whose commands are not provisional.

**Events.** `record.captured`, `record.submitted_for_review`, `record.confirmed`,
`record.corrected`, `record.rejected`, `record.reopened` — the actual audit action strings emitted
by `record.ts`, verified live this session (capture → submit → confirm produced exactly these three
in order, hash-chained).

**Inbound / outbound dependencies.** Inbound: Extraction (candidate assertions, once it exists) —
in 0.1.0, direct human capture instead. Outbound: Knowledge Graph accepts only confirmed assertions
(`ARCHITECTURE.md` context map: "Curation → Knowledge Graph: Customer/Supplier — Graph only accepts
confirmed assertions").

**Transaction and consistency boundary.** Per-`InstitutionalRecord` / per-`Assertion` — each review
decision is independently consistent, enabling concurrent review of different items
(`DATA_MODEL.md` §2's stated rationale).

**Permitted integration patterns.** Customer/Supplier toward Knowledge Graph (confirmed-only).
Published language inbound from Extraction once that context exists.

**Prohibited cross-context access.** No context may set `reviewState` to `confirmed` except through
this context's own state machine — `review.ts`'s `TRANSITIONS` table is exhaustive and
`Cannot move a record from 'draft' to 'confirmed'` is enforced (tested: "cannot skip review by going
straight from draft to confirmed").

**Provenance ownership.** Consumes and displays provenance (`InstitutionalRecord.provenance`); does
not construct the chain — that is Audit & Provenance (§10), via `packages/domain/src/audit.ts`'s
injected `HashFunction`.

**Consent ownership.** None — in 0.1.0, `consentGrantId` passes through nullable (§2's noted
`PREVIEW SIMPLIFICATION`).

**Audit ownership.** Produces audit events (one per state transition) but the chain itself — hashing,
`previousHash` linkage, `verifyChain` — is owned by Audit & Provenance.

**Identity/policy boundary.** Every command requires an `Actor`; `confirmRecord`/`correctRecord`/
`rejectRecord` additionally require `actor.kind === 'human'` — the concrete implementation of the
identity/policy boundary at the point P4 is enforced.

**Projection/search ownership.** None — 0.1.0 reads directly from PostgreSQL
(`RecordsService` → `PrismaService`), no projection exists yet.

**Retention/deletion responsibilities.** None implemented; inherits `DATA_MODEL.md` §7's erasure
model once consent and retention services exist.

**Current implementation mapping.** `packages/domain/src/record.ts`, `review.ts`, `provenance.ts`,
`actor.ts` (pure domain) · `services/api-gateway/src/records/` (`RecordsController`,
`RecordsService`) · `services/api-gateway/prisma/schema.prisma`'s `Record` model · `apps/web`'s
`/records`, `/records/new`, `/records/[id]` pages. This is **the only fully implemented context** in
0.1.0.

**Future implementation mapping.** Extends to accept `CandidateSet` input from Extraction (Phase 5)
and to enforce `consentGrantId NOT NULL` (Phase 3) without changing its core state machine — the
state machine is the permanent architecture; the input source and the nullability are what change.

**Classification.** `IMPLEMENTED IN 0.1.0`. Drift: `NO DRIFT` on the state machine and human-gate
invariants (verified this session, live, against real code and real tests) —
`PREVIEW SIMPLIFICATION` on `consentGrantId` nullability and on accepting only direct human capture
rather than `CandidateSet` input, both already documented as such elsewhere (schema comment,
`PHASE_EXECUTION_PLAN.md`'s sequencing) rather than newly discovered here.

---

## 8. Knowledge Graph

**Mission.** Project confirmed assertions into a queryable graph that can be destroyed and rebuilt
without loss.

**Owned aggregates.** `Entity` (`DATA_MODEL.md` §2 — "Resolved identity; merges and splits are
entity-level transactions").

**Entities and value objects.** Entities, relationships, temporal validity, resolution
(`ARCHITECTURE.md` §3).

**Invariants.** Every node and edge resolves to at least one confirmed assertion
(`ARCHITECTURE.md` §3) — nothing appears in the graph that Curation & Review did not confirm. Full
rebuild from the event log produces a byte-comparable result — INV-9,
[ADR-0011](../decisions/ADR-0011-knowledge-graph-as-projection.md)'s central guarantee.

**Commands.** `ProjectAssertion`, `RebuildProjection`, `ResolveEntity` — provisional; §3 of
`architecture/views/COMPONENT_VIEWS.md` already sketches the projector's internal components
(event consumer, entity resolver, projection writer, rebuild controller).

**Events.** Consumes events; does not itself emit domain events (a projection is a read model, not
a source of new facts).

**Inbound / outbound dependencies.** Inbound: Curation & Review (confirmed assertions only), Consent
& Legal Basis (constrains what may be projected). Outbound: Search & Retrieval
(`ARCHITECTURE.md` context map: "Knowledge Graph → Search: Open host service — projection events").

**Transaction and consistency boundary.** None of its own — Neo4j holds **no authoritative data**
(ADR-0011); the transaction boundary that matters is PostgreSQL's event log, which this context only
reads.

**Permitted integration patterns.** Open host service toward Search & Retrieval (projection events,
not direct database access).

**Prohibited cross-context access.** No context may write to Neo4j directly, or treat Neo4j as a
source of truth for anything — `DEPARTMENTS.md` D4's prohibited list: "Storing authoritative data in
a projection (ADR-0004 — projections are rebuildable by definition)."

**Provenance ownership.** None — every node/edge carries a reference to its source assertion's
provenance chain, owned upstream.

**Consent ownership.** None — constrained by consent, does not own it.

**Audit ownership.** None.

**Identity/policy boundary.** Community restriction (`community_restriction_id`,
`DATA_MODEL.md` §6) is enforced at the policy decision point above this context, per
[ADR-0019](../decisions/ADR-0019-indigenous-data-sovereignty.md) — this context stores the
restriction, Authorisation (§3) enforces it.

**Projection/search ownership.** This context **is** the graph projection owner. Search & Retrieval
(§9) is a separate, sibling projection, not downstream of this one for authority purposes (both are
independently rebuilt from the same event log).

**Retention/deletion responsibilities.** None directly — erasure propagates via projection rebuild
after the source assertion is erased (`DATA_MODEL.md` §7), never via a direct delete against Neo4j.

**Current implementation mapping.** None.

**Future implementation mapping.** `services/knowledge-graph`, `workers/graph-projector`
(`ARCHITECTURE.md` container view: `SKG`, `WPROJ`). Phase 4, additionally gated on
[ADR-0019](../decisions/ADR-0019-indigenous-data-sovereignty.md)'s external Indigenous governance
review — `PHASE_EXECUTION_PLAN.md`: "a hard gate, and nothing in this area is implemented until it
is met."

**Classification.** `PLANNED / GATED`. Drift: not applicable.

---

## 9. Search & Retrieval

**Mission.** Answer "what did we decide, and why" without ever returning something the caller isn't
permitted to see.

**Owned aggregates.** None — a read-only projection, same status as Knowledge Graph with respect to
authoritative data.

**Entities and value objects.** Indexes, embeddings, ranking, permission filtering
(`ARCHITECTURE.md` §3).

**Invariants.** No result is returned that the caller is not permitted to see (`ARCHITECTURE.md`
§3) — permission-aware filtering is not a post-filter on results, it is load-bearing to the query
itself.

**Commands.** `Query(text | filters, principal)` — provisional.

**Events.** Consumes projection events from the event log (same pattern as §8); does not emit.

**Inbound / outbound dependencies.** Inbound: Curation & Review (confirmed assertions), Consent &
Legal Basis (constrains). Sibling to Knowledge Graph, not dependent on it.

**Transaction and consistency boundary.** None of its own — OpenSearch and pgvector hold no
authoritative data, same as Neo4j (ADR-0011).

**Permitted integration patterns.** Consumer of the same open host service (projection events) as
Knowledge Graph.

**Prohibited cross-context access.** No context may bypass permission filtering by querying
OpenSearch or pgvector directly instead of through this context's API.

**Provenance ownership.** None.

**Consent ownership.** None.

**Audit ownership.** None.

**Identity/policy boundary.** Every query call passes through Authorisation (§3) for
permission-aware filtering — this is the "hybrid search with permission-aware filtering" Phase 6
deliverable's binding constraint.

**Projection/search ownership.** This context **is** the search projection owner.

**Retention/deletion responsibilities.** Same as Knowledge Graph — erasure propagates via
re-indexing after source erasure, never a direct delete against the index.

**Current implementation mapping.** None.

**Future implementation mapping.** `services/search` (`ARCHITECTURE.md` container view: `SSEARCH`).
Phase 6.

**Classification.** `FUTURE`. Drift: not applicable.

---

## 10. Audit & Provenance

**Mission.** Make every institutional fact traceable to its source, and make tampering detectable.

**Owned aggregates.** `AuditEntry` (`DATA_MODEL.md` §2 — "Append-only, never part of another
aggregate's transaction").

**Entities and value objects.** Append-only audit log, provenance chains (`ARCHITECTURE.md` §3). In
0.1.0: `AuditEvent` (hash-chained), `Provenance` (source, capturedBy, capturedAt) —
`packages/domain/src/audit.ts`, `provenance.ts`.

**Invariants.** The log is tamper-evident and never mutated (`ARCHITECTURE.md` §3) — verified live
this session: an `audit_event` row was altered directly in PostgreSQL, `verifyChain()` correctly
reported it invalid, and restoring the row restored validity. A record cannot exist without
provenance (P3) — the type system admits no null (INV-2,
`test/invariants/invariants.test.ts`).

**Commands.** `createAuditEvent`, `createProvenance`, `verifyChain` — the actual exported functions
of `packages/domain/src/audit.ts` and `provenance.ts`.

**Events.** Every domain event across every context is, by construction, also an audit event — this
context does not emit its own separate event stream; it is the append-only ledger every other
context's events land in.

**Inbound / outbound dependencies.** Inbound: every context (all events are audited). Outbound: none
in the DDD sense — this is a terminal, append-only sink, though its content is read by every
context's UI (e.g. Curation & Review renders the audit trail).

**Transaction and consistency boundary.** Each `AuditEvent` is independently append-only; never part
of another aggregate's transaction (`DATA_MODEL.md` §2) — a record's own transition and its audit
entry are committed together (same transaction, `RecordsService`), but the audit log as a whole is
never mutated retroactively by any other operation.

**Permitted integration patterns.** Every other context calls into this one to record an event; no
context reads another context's raw audit stream directly — provenance/audit data is exposed through
each owning context's own read API (e.g. `InstitutionalRecord.auditTrail`), not a shared audit
service queried directly by unrelated contexts.

**Prohibited cross-context access.** No `UPDATE` or `DELETE` path against `audit_event`
(`DEPARTMENTS.md` D4's prohibited list) — enforced today at the repository layer; a database trigger
plus restricted role is Phase 3 (deliverable 3.7), tracked as `docs/research/THREAT_MODEL.md` T-3's
stated gap between detection (live) and prevention (not yet built).

**Provenance ownership.** This context **is** the provenance owner.

**Consent ownership.** None — a `consentGrantId`, once populated, becomes a provenance fact this
context's chain includes, but this context does not decide consent.

**Audit ownership.** This context **is** the audit owner.

**Identity/policy boundary.** Every audit event requires an `Actor`, resolved through Identity &
Tenancy (§1); the human/model distinction on that actor is what makes P4 checkable at all.

**Projection/search ownership.** None — the audit log is the source PostgreSQL keeps; it is not
itself a projection.

**Retention/deletion responsibilities.** The audit chain is explicitly **not** subject to content
erasure the way a record's body is — `DATA_MODEL.md` §7: "Audit chain: Never broken — the tombstone
is a chain entry, so the hash chain remains verifiable." This context is the one place where
"retained forever" is the correct answer even under an erasure request; only the content it
references is erased.

**Current implementation mapping.** `packages/domain/src/audit.ts` (hash chain, injected
`HashFunction` so the domain layer never imports `node:crypto` directly — ADR-0003's purity rule),
`provenance.ts` · `services/api-gateway/prisma/schema.prisma`'s `AuditEvent` model
(`previousHash`/`hash`, unique, append-only by convention) · `services/api-gateway/src/infrastructure/hashing.ts`
(the concrete `HashFunction` implementation) · rendered in `apps/web`'s record detail page.

**Future implementation mapping.** Database-enforced append-only trigger and restricted role
(deliverable 3.7); external anchoring, so tampering is detectable even if an attacker controls the
database entirely (Phase 7, per `STATUS.md`'s stated known gap and
`docs/research/THREAT_MODEL.md` T-3).

**Classification.** `IMPLEMENTED IN 0.1.0` for the hash chain and provenance requirement. Drift:
`PHASE 2 GAP` (more precisely Phase 3) for the append-only database trigger — detection exists,
prevention does not, and this is already tracked (not a newly discovered gap) in
`docs/research/THREAT_MODEL.md` T-3.

---

## 11. Notification

**Mission.** Tell people what they need to know without leaking content they cannot see.

**Owned aggregates.** None yet designed.

**Entities and value objects.** Subscriptions, digests, delivery (`ARCHITECTURE.md` §3).

**Invariants.** Notifications never leak content the recipient cannot see (`ARCHITECTURE.md` §3) —
this context inherits the same permission-aware filtering constraint as Search & Retrieval (§9),
restated because a notification is content leaving the system's normal query path.

**Commands, Events.** Not yet named — no design work has started on this context beyond the mission
statement.

**Inbound / outbound dependencies.** Inbound: Authorisation (permission check before any content
inclusion). Not otherwise decided.

**Transaction and consistency boundary, integration patterns, prohibited access, provenance,
consent, audit, identity/policy, projection/search, retention.** Not yet decided — flagged here as
undesigned rather than guessed, consistent with `NFR_SLO.md` §6's discipline for genuinely open
questions.

**Current implementation mapping.** None.

**Future implementation mapping.** No container named yet in `ARCHITECTURE.md`'s Level 2 view; not
sequenced to a specific phase in `PHASE_EXECUTION_PLAN.md` or `ROADMAP.md`.

**Classification.** `FUTURE`. Drift: not applicable.

---

## 12. Administration

**Mission.** Give operators the configuration and retention control the sovereignty guarantee
requires, with every action attributable.

**Owned aggregates.** None yet designed.

**Entities and value objects.** Configuration, retention, model policy, tenant setup
(`ARCHITECTURE.md` §3).

**Invariants.** Every administrative action is audited and attributable (`ARCHITECTURE.md` §3) —
routes through Audit & Provenance (§10) like every other context's events.

**Commands, Events.** Not yet named.

**Inbound / outbound dependencies.** Inbound: Identity & Tenancy, Authorisation (administrative
actions are still subject to deny-by-default — `DEPARTMENTS.md` D6 notes community restrictions
apply "regardless of any other role the requester holds — including administrators"). Not otherwise
decided.

**Transaction and consistency boundary, integration patterns, prohibited access, provenance,
consent, audit, identity/policy, projection/search, retention.** Not yet decided.

**Current implementation mapping.** `packages/config` (`WITNESS_DEPLOYMENT_PROFILE` validation,
ADR-0013) is the closest existing analogue — boot-time configuration, not runtime administration,
and not itself a bounded context so much as infrastructure every context depends on.

**Future implementation mapping.** Admin console (`apps/admin`, named in `README.md`'s repository
map as a planned application). Not yet phase-sequenced in detail.

**Classification.** `FUTURE`. Drift: not applicable — `packages/config` is correctly out of scope
for this context; it is deployment-time, not an administrative bounded context.

---

## Summary table

| # | Context | Department | Status | Drift |
|---|---|---|---|---|
| 1 | Identity & Tenancy | D6 | PARTIALLY IMPLEMENTED (organisation/workspace + users + membership, no roles/auth) | PREVIEW SIMPLIFICATION (no row-level security; nothing on Record/Source scoped to an organisation yet) |
| 2 | Consent & Legal Basis | D6 | APPROVED BUT NOT IMPLEMENTED | PREVIEW SIMPLIFICATION (`consentGrantId` nullable) |
| 3 | Authorisation | D6 | IMPLEMENTED IN 0.1.0 (port/guard) / PLANNED-GATED (policy engine) | NO DRIFT |
| 4 | Ingestion & Media | D3/D5 | FUTURE | n/a |
| 5 | Transcription | D5 | FUTURE | n/a |
| 6 | Extraction | D5 | FUTURE | n/a |
| 7 | Curation & Review | D3 | IMPLEMENTED IN 0.1.0 | NO DRIFT (state machine) / PREVIEW SIMPLIFICATION (consent, direct capture) |
| 8 | Knowledge Graph | D5/D4 | PLANNED / GATED (ADR-0019 external review) | n/a |
| 9 | Search & Retrieval | D3/D5 | FUTURE | n/a |
| 10 | Audit & Provenance | D4 | IMPLEMENTED IN 0.1.0 | PHASE 2 GAP (append-only trigger, tracked as T-3) |
| 11 | Notification | D3 | FUTURE | n/a |
| 12 | Administration | D1/D7 | FUTURE | n/a |

**No `DECISION REQUIRED` or untracked `TECHNICAL DEBT` drift was found.** Every gap between this
document and 0.1.0 code traces to an existing, dated decision (a schema comment, a roadmap sequence
item, a threat-model entry) — none is a newly discovered disagreement between architecture and code.
That is itself evidence worth stating plainly, not assuming: the Developer Preview was built against
this model, even though this model wasn't written down as one document until now.

## Open questions carried forward, not resolved here

`DATA_MODEL.md` §9's DM-1 through DM-5 remain open, owned as stated there (Backend Lead, Principal
Architect, AI Lead, Knowledge Graph Lead across Phases 3–4). This document does not resolve them —
elaborating each context to this depth surfaced no new open question beyond what `DATA_MODEL.md`
already tracked.
