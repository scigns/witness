Witness MVP Checklist

Version: 1.0
**Status:** Active
Purpose: Binary release gate for real co-design testing
**Owner:** Founder / Product Lead with Engineering and QA  

**2026-08-18 status note:** the per-item entries below reflect each item's status
*when its milestone shipped*, and several have since fallen behind current `main` —
"PR not yet merged" now reads as merged, and a few items marked NOT THIS MILESTONE
were subsequently built as separate milestones. Verified against current code and
the v0.2.0 controlled-pilot release (see `docs/release/INTERNAL_PILOT_RELEASE.md`,
`CHANGELOG.md`), the following have superseding current status and should not be
rediscovered as gaps:

- **Agenda items** (line ~259, "NOT THIS MILESTONE") — READY. `packages/domain/src/agenda-item.ts`,
  `services/api-gateway/src/agenda-items/`, `/workspaces/[id]/agenda`.
- **Evidence Capture — Upload** (section E, "remain unchecked until Media Upload is built") — READY.
  Audio/document/image upload, progress, retry, checksum integrity, R2 storage all shipped
  (`services/api-gateway/src/evidence/evidence-attachment.service.ts`, `CHANGELOG.md` 0.2.0).
- **Evidence Capture — Recording** (section E, "Browser recording…") — READY as of PR #79. No
  documented decision to stay upload-only was ever found (`docs/PRODUCT_ROADMAP.md` poses it as an
  open question, not a resolved one); implemented as a `MediaRecorder`-based control on the existing
  attachment step, feature-detected with the file-upload path kept as a fallback.
- **Low-connectivity / offline queue** — READY, though not itemised as its own section here.
  `apps/web/src/lib/offline-queue.ts` plus `clientRequestId`-based idempotent retry
  (`services/api-gateway/src/evidence/evidence.service.ts`) cover queued local drafts, safe retry,
  and duplicate-submission prevention.

Everything not listed above should still be verified against current code before being treated as
either done or missing — this note corrects known stale entries, it is not a full re-audit.

How to Use This Checklist

Check an item only when it works on the current deployable version.

An open PR does not count as complete.

Documentation alone does not count as complete.

A backend-only implementation does not count when the user journey requires UI.

Every mandatory item must be manually verified.

Record evidence such as PR number, test name, screenshot, or pilot note where useful.

Items marked Pilot-blocking must be complete before processing a real session.

Items marked Public-MVP may be completed after a controlled internal pilot but before a broader
external pilot.

A. Current Baseline

Organisation vertical slice merged and verified

Workspace vertical slice merged and verified

Current main passes lint

Current main passes typecheck

Current main passes automated tests

Current main builds successfully

Application starts locally using documented commands

Database migration and seed process works from a clean environment

No overlapping open PR duplicates the next capability

B. Trusted Access

Users and Memberships

User domain model exists — READY (PR #19, not yet merged — per this checklist's own rule, an open
PR does not count as complete). `packages/domain/src/user.ts` (`createUser`), 42 domain tests
including email normalisation and duplicate-prevention cases.

Organisation membership exists — READY (PR #19, not yet merged).
`packages/domain/src/organisation-membership.ts`, unique
constraint on (organisationId, userId), `invited → active ⇄ suspended → revoked` state machine.

Workspace membership exists — READY (PR #19, not yet merged).
`packages/domain/src/workspace-membership.ts`; refuses
creation unless the user has an organisation membership in good standing for that workspace's
specific organisation (verified by adversarial cross-organisation test).

Administrator can add or invite a user — READY (PR #19, not yet merged), with a caveat: "invited"
means registered, not that an email was sent — Witness does not deliver invitation email yet, and
the UI says so on every screen that uses the word. `/users/new`, `POST /api/v1/users`, admin-only.

Duplicate membership is prevented — READY (PR #19, not yet merged). Unique constraints in the
schema plus a pre-check returning `409 DUPLICATE_MEMBERSHIP`; covered by service tests for both
organisation and workspace membership.

Membership changes create audit events — READY (PR #19, not yet merged). `organisation_membership.created`/`.state_changed`
and `workspace_membership.created`/`.state_changed`, hash-chained through the existing audit
mechanism (`packages/domain/src/audit.ts`), same as every other subject type.

User list and membership state are visible in the UI — READY (PR #19, not yet merged). `/users`, and
membership management
(add, activate, suspend, revoke) on `/organisations/[id]` and `/workspaces/[id]`.

**Mark these DONE only after PR #19 merges to `main` and the workflow is re-verified on the
deployable version** — this checklist is a binary release gate, not a PR-review tracker.

Roles and Authorisation

Roles are explicitly defined — READY (PR #21, not yet merged — per this checklist's own rule, an
open PR does not count as complete). Six canonical roles (`admin`, `facilitator`, `contributor`,
`reviewer`, `participant`, `reader`) in `packages/domain/src/role.ts`, each mapped to an explicit
permitted-actions list. No inheritance.

Role assignment has organisation or workspace scope — READY (PR #21, not yet merged).
`packages/domain/src/role-assignment.ts`; one assignment per (user, scope); a role cannot be
assigned without membership — and, for a workspace scope, the parent organisation membership too —
in good standing.

API denies unauthorised actions — READY (PR #21, not yet merged), for role-assignment management
specifically: `role_assignment:{read,write,delete}` are admin-only, verified against a real
database and by 30/30 adversarial tests. Broader request-time enforcement across every action in
the system is Milestone 1.4, not this PR.

UI reflects, but does not replace, API enforcement — READY (PR #21, not yet merged). The role
picker on `/organisations/[id]` and `/workspaces/[id]` shows server-computed permitted actions; a
non-admin caller is refused by the API regardless of what the UI renders.

Invalid or invented roles are rejected — READY (PR #21, not yet merged). Domain-level
(`INVALID_ROLE`) and contract-level (`assignRoleRequestSchema`'s `z.enum`) validation.

Cross-organisation access is denied — READY (PR #21, not yet merged), for role assignment
specifically: a role assignment addressed through the wrong organisation's URL is refused
`MEMBERSHIP_NOT_FOUND`, verified against a real database. General cross-tenant data isolation
beyond role/membership management remains Phase 3 (`architecture/domains/DOMAIN_MODEL.md` §1).

Cross-workspace access is denied — READY (PR #21, not yet merged), same scope and same evidence as
the organisation case above, for workspace-scoped role assignment.

Adversarial authorisation tests pass — READY (PR #21, not yet merged). 30/30, up from 26 —
administrator-permitted, reviewer-denied-write, facilitator-self-promotion-denied, and
read-only-denied cases for every new action.

**Mark these DONE only after PR #21 merges to `main` and the workflow is re-verified on the
deployable version** — this checklist is a binary release gate, not a PR-review tracker.

Authentication

Sign-in works — READY (Authentication PR, not yet merged — per this checklist's own rule, an open
PR does not count as complete). OIDC authorization-code-with-PKCE against the ADR-0007 Keycloak
adapter (`services/api-gateway/src/authn/keycloak-oidc.adapter.ts`); verified end-to-end in this
sandbox against a protocol-faithful development identity-provider double
(`development-identity-provider.adapter.ts`) that performs the same real JWT/JWKS signature,
issuer, audience, and nonce verification — live Keycloak sign-in itself could not be exercised
here because no container runtime is available in this sandbox (see Known limitations).

Sign-out works — READY (Authentication PR, not yet merged). `POST /api/v1/auth/logout` revokes the
session server-side (`SessionService.revoke`); verified manually — a token rejected with 401 on
`GET /api/v1/me` immediately after sign-out.

Expired or invalid sessions fail safely — READY (Authentication PR, not yet merged). Sessions are
looked up by SHA-256 hash with an `expiresAt` check (`SessionService.resolveUserId`); an
expired, unknown, or garbage token resolves to no principal and the request is refused
`401 UNAUTHENTICATED`, never silently downgraded to anonymous or dev access.

Authenticated identity maps to a Witness user — READY (Authentication PR, not yet merged). The
verified OIDC subject is the permanent key (`IdentityLink.provider` + `.providerSubject`, unique
together); email is used only as a one-time bootstrap lookup at first sign-in, never as an ongoing
identity key. First sign-in activates an `invited` account only when the provider confirms
`email_verified`; an already-active, suspended, deactivated, or otherwise-unmatched identity is
refused (`unknown_identity`/`account_suspended`/`account_deactivated`) rather than auto-creating or
silently attaching to an account. Verified against a real local PostgreSQL 16 database: first
sign-in activation, repeat sign-in reusing the same link (no duplicate), and denial for a suspended
account with an existing link, each confirmed against the actual database rows and audit trail.

Local development authentication is documented — READY (Authentication PR, not yet merged). The
development identity-provider double, its dev-idp endpoints, and how to drive a full sign-in
without a live Keycloak are documented in the PR and in `docs/operations/` (see PR for exact
paths).

Production identity provider is replaceable and open-source compatible — READY (Authentication PR,
not yet merged). `IdentityProviderPort` is the reversal seam named by ADR-0007; the shipped
`KeycloakOidcAdapter` uses the standard OIDC discovery document
(`${issuer}/.well-known/openid-configuration`) rather than Keycloak-specific paths, so any
spec-compliant provider (Zitadel, Authentik — both noted as acceptable in ADR-0007) can replace it
without a domain or API change.

Pilot-blocking gate

A real user can sign in and see only the organisations and workspaces they actually belong to —
READY (Authentication PR, merged). Verified manually end-to-end through a real browser:
signed-in `GET /api/v1/me` (and the dashboard's "Your access" section that renders it) lists only
the organisations and workspaces the signed-in user actually belongs to, never the full catalog —
confirmed against a user with a narrower membership set than the database's full contents.
`GET /api/v1/organisations` and `GET /api/v1/workspaces` now apply the same membership-based
visibility filter for a real session (Authorisation Hardening PR, not yet merged) — see below.

**Mark these DONE only after the Authentication PR merges to `main` and the workflow is
re-verified on the deployable version** — this checklist is a binary release gate, not a
PR-review tracker.

Authorisation Hardening (BUILD_ROADMAP.md Milestone 1.4)

A Casbin policy decision point exists — READY (Authorisation Hardening PR, not yet merged).
`packages/policy/model.conf` + `packages/policy/policy.csv` (versioned, reviewed, unit-tested in
isolation per ADR-0007) are the single source of truth for what a request-time grant tier may do;
`PolicyEngineService` loads them via a real Casbin `Enforcer`. `role-grants.ts`'s table is now the
deprecated fallback for the unverified development header only.

Organisation- and workspace-scoped actions are authorised per exact scope — READY (Authorisation
Hardening PR, not yet merged). `PolicyEnforcementService` resolves the caller's role tiers for the
specific organisation or workspace a request concerns (`RoleResolutionService.scopedGrantTiers`,
`admin` included only within that one scope) before consulting the policy engine; `AuthorizationGuard`
calls it with a scope resolved from the route's path parameters or a creation body. Covers
organisation-membership, workspace-membership, and role-assignment management actions.
Cross-organisation and cross-workspace leakage are covered by adversarial unit tests
(`role-resolution.service.test.ts`), not yet by a live-database manual walkthrough — see Known
limitations.

Deny-by-default and fail-closed on internal error — READY (Authorisation Hardening PR, not yet
merged). No role in scope, an unresolvable policy engine, or a role-resolution database error are
all denials, never a silent allow (`policy-enforcement.service.test.ts`).

`record:*`/`user:*` actions remain global, not organisation/workspace-scoped — KNOWN LIMITATION,
deliberate. `Record`/`Source` carry no organisation or workspace foreign key in the current schema;
scoping them would require new domain modelling this milestone does not invent.
`organisation:create`/`user:create` remain unreachable via a real session (the *global* tier
resolution never includes `admin`) — the same fail-closed boundary Milestone 1.3 documented,
re-deferred rather than resolved here.

Existing organisation/workspace/membership management UI is not yet migrated to real sessions —
KNOWN LIMITATION, deliberate. `/organisations/[id]`, `/workspaces/[id]`, and their member-management
flows still call the API through the unverified `X-Witness-Dev-User` header. The scoped enforcement
above is real and reachable by any client sending a real session's bearer token, but not yet
reachable by clicking through the existing management pages in a browser — migrating them was
judged out of scope for this milestone.

**Mark these DONE only after the Authorisation Hardening PR merges to `main` and the workflow is
re-verified on the deployable version** — this checklist is a binary release gate, not a
PR-review tracker.

C. Session Preparation

Facilitator can create a co-design session — READY (Co-design Session Management PR, not yet
merged — per this checklist's own rule, an open PR does not count as complete).
`packages/domain/src/co-design-session.ts`'s `createCoDesignSession`; `POST
/api/v1/workspaces/:workspaceId/sessions`; `/workspaces/[id]/sessions/new`.

Session belongs to one organisation and workspace — READY (Co-design Session Management PR, not
yet merged). `organisationId`/`workspaceId` are required, non-nullable fields on the aggregate and
the database row; every route nests under `:workspaceId`, so `AuthorizationGuard`'s existing scope
resolution (Milestone 1.4) Casbin-scopes every session action to that workspace automatically.

Session has title — READY (Co-design Session Management, PR #26 merged). Required, validated,
editable.

Session has purpose or objectives — READY (Co-design Session Management, PR #26 merged).
`purpose` is a required field, distinct from the optional `description`.

Session has date and time — READY (Co-design Session Management, PR #26 merged). The
`schedule` lifecycle transition sets `startAt`/`endAt`/`timezone`.

Session has location or online format — READY (Co-design Session Management, PR #26 merged).
`location` (free text) and `deliveryMode` (`in_person`/`online`/`hybrid`/`asynchronous`/`other`).

Session has language metadata — READY (Co-design Session Management, PR #26 merged).
`supportedLanguages`, a list of language codes on the session itself — distinct from
participant-level language/accessibility needs, which are Participant Management's job (Milestone
3, below).

Session status is visible — READY (Co-design Session Management, PR #26 merged). Server-side
`status` field, rendered via a status badge on every session screen; `permittedTransitions` is
server-computed so the frontend never reimplements the lifecycle state machine.

Session can be edited before completion — READY (Co-design Session Management, PR #26 merged).
Editable in every status except `archived` (enforced in the domain layer, not just the UI); the
`update` endpoint uses optimistic concurrency (`expectedVersion`) so a stale edit is rejected rather
than silently overwriting a concurrent change.

Session can be archived without silent deletion — READY (Co-design Session Management PR, not yet
merged). Archiving is an audited lifecycle transition (`co_design_session.archived`), not a
delete — the row and its full history remain, `archived` is a terminal, read-only status.

Agenda items can be added and ordered — NOT THIS MILESTONE. No agenda-item concept exists yet;
out of scope for Co-design Session Management, not silently dropped.

Facilitator can add participants — READY (Participant Management PR, not yet merged — per this
checklist's own rule, an open PR does not count as complete).
`packages/domain/src/session-participant.ts`'s `addParticipant`; `POST
/api/v1/workspaces/:workspaceId/sessions/:sessionId/participants`;
`/workspaces/[id]/sessions/[sessionId]/participants/new`. Named, pseudonymous, anonymous,
registered, and non-registered participation are all supported — a participant is never required
to hold a Witness user account.

Participant preferred name can be recorded — READY (Participant Management PR, not yet merged).
`preferredName`, optional, cleared automatically for anonymous participants.

Participant affiliation is optional — READY (Participant Management PR, not yet merged).
`affiliation` (organisation or community), optional, same anonymous-clearing rule.

Language or accessibility needs can be recorded — READY (Participant Management PR, not yet
merged), for participants specifically. `languagePreference`/`accessibilityRequirements` on
`SessionParticipant`; session-level supported languages were already READY, above.

Session dashboard shows the next required action — NOT THIS MILESTONE. No such dashboard exists
yet; the session detail screen shows current status and available transitions, not a guided
next-action prompt.

Pilot-blocking gate

A facilitator can prepare a real session without an external setup spreadsheet — PARTIALLY READY.
Session creation and lifecycle management (Milestone 2), participant management (Milestone 3),
consent management (Milestone 4), structured evidence capture (Milestone 5, merged as PR #29) and
evidence review and validation (Milestone 6, merged as PR #35) are all now implemented. This gate
is not fully met until the flow is walked through end to end against a live Postgres and browser,
which this sandbox does not have.

C.1 Participant Privacy (Milestone 3)

Anonymous participation records no identifying details — READY (Participant Management PR, not
yet merged). `addParticipant` forces `displayName` to a fixed generic label and clears
`preferredName`/`pronouns`/`affiliation` for `identityMode: 'anonymous'`, regardless of what the
caller sends — enforced in the domain layer, not the frontend form.

Anonymous participation cannot be linked to a registered account — READY (Participant Management
PR, not yet merged). `addParticipant`/`changeLinkedUser` reject a `linkedUserId` for an anonymous
participant with a domain invariant (`ANONYMOUS_CANNOT_BE_LINKED`).

Pseudonymous participation retains an internal record without exposing it through ordinary reads
— READY (Participant Management PR, not yet merged). A pseudonymous participant's `linkedUserId`
is stored but never included in `SessionParticipantSummary` (the list/export shape has no such
field at all) and only included in `SessionParticipantDetail` for a caller holding
`participant:manage_restricted`.

Restricted facilitator notes require explicit permission, not just session access — READY
(Participant Management PR, not yet merged). Gated by `participant:manage_restricted`, a
narrower Casbin action than ordinary `participant:update`, enforced server-side via an imperative
policy decision inside `ParticipantsService` (`participants.service.test.ts`'s privacy-projection
tests).

Redacted export never includes restricted fields, regardless of exporter's own access — READY
(Participant Management PR, not yet merged). `exportRedacted` always applies the unprivileged
redaction rule, tested directly (`participants.service.test.ts`).

Cross-session, cross-workspace, and cross-organisation participant access is denied — READY
(Participant Management PR, not yet merged), covered by adversarial unit tests
(`participants.service.test.ts`), not yet by a live-database manual walkthrough — see Known
limitations.

No per-session or per-participant ownership check — KNOWN LIMITATION, deliberate, same shape as
Milestone 2's session gap. Any contributor- or admin-tier holder in a session's organisation or
workspace may manage ANY participant there, not only ones they facilitate. There is also no
self-service view letting a signed-in registered user see only their own participant record —
`participant:read`/`participant:manage_restricted` are workspace-scoped tiers, not row-level
ownership.

D. Consent and Participant Rights

Consent statement is versioned — READY (Consent Management PR, not yet merged — per this
checklist's own rule, an open PR does not count as complete). `ConsentTemplate` is structurally
versioned: each row IS one immutable version, grouped by a shared `familyId`; there is no "edit
template" function anywhere, so a used version cannot be changed, only superseded by a new one
(`createNewTemplateVersion`).

Consent is linked to a participant and session — READY (Consent Management PR, not yet merged).
`ParticipantConsentRecord` carries `sessionId`+`participantId`+`consentTemplateId`+
`templateVersion`; `SessionConsentConfiguration` links a session to the template version and
categories governing it.

Recording permission is explicit — READY (Consent Management PR, not yet merged).
`audio_recording`/`video_recording`/`photography` are distinct, independently-decided categories,
never bundled into a single "consent to participate" checkbox.

Processing purpose is explicit — READY (Consent Management PR, not yet merged).
`ai_processing`/`transcription`/`internal_use`/`external_reporting`/`research_use`/`future_reuse`/
`knowledge_graph_inclusion` are each distinct categories a participant grants or refuses
independently.

Sharing or publication permission is explicit where applicable — READY (Consent Management PR, not
yet merged). `attributed_quotation`/`anonymous_quotation`/`publication` are distinct categories,
separate from participation and from each other.

Consent capture method and time are recorded — READY (Consent Management PR, not yet merged).
`ParticipantConsentRecord.captureMethod` (free text, e.g. "in-person verbal") and `capturedAt` are
required on every capture.

Consent can be restricted — READY (Consent Management PR, not yet merged). A session's
`SessionConsentConfiguration` chooses which of a template's categories are required vs optional;
`captureParticipantConsent` rejects a decision for any category not in that configured set.

Consent can be withdrawn — READY (Consent Management PR, not yet merged).
`withdrawParticipantConsent`; a withdrawn record is never treated as active by the decision
boundary (`consent-decision.ts`), and there is deliberately no "restore" — re-granting after
withdrawal is a fresh capture, not an undo, so the audit trail preserves "withdrew, then changed
their mind again" as its own event.

Withdrawal is visible to authorised users — READY (Consent Management PR, not yet merged).
`withdrawnAt` is visible on the record to any `participant_consent:read` holder; the withdrawal
*reason* is additionally restricted to `participant_consent:manage_restricted`.

Processing cannot silently exceed recorded consent — READY, and now wired to an actual capability
(Structured Evidence Capture, Milestone 5, PR not yet merged). `ConsentPolicyService`
(`services/api-gateway/src/consent/consent-policy.service.ts`) answers each processing question
(`mayRecordAudio`, `mayProcessWithAi`, `mayPublish`, ...) fail-closed — missing, expired, withdrawn
or superseded-without-replacement consent all deny by construction — and `EvidenceService`
(`services/api-gateway/src/evidence/evidence.service.ts`) now calls `mayParticipate` (every
participant-backed capture) and `mayAttributeQuotation`/`mayQuoteAnonymously` (quotation evidence)
before any evidence is captured, refusing with `403 CONSENT_NOT_GRANTED` rather than duplicating
the decision logic. This is proven in the domain and service test suites, not yet through a live
end-to-end walkthrough (no Postgres/browser in this sandbox — see Section E below).

Consent changes are auditable — READY (Consent Management PR, not yet merged).
`consent_template.created`/`.version_created`/`.activated`/`.retired`,
`session_consent_configuration.created`/`.updated`, and
`participant_consent_record.captured`/`.superseded`/`.withdrawn` all hash-chained through the
existing `AuditEvent` mechanism, same as every other subject type.

Sensitive participant information is access-controlled — READY (Consent Management PR, not yet
merged). Category-by-category decisions and withdrawal reasons require
`participant_consent:manage_restricted`; a general `participant_consent:read` caller sees only a
computed status summary, the same structurally-absent-not-null convention Milestone 3 established.

Plain-language participant explanation is available — READY (Consent Management PR, not yet
merged). `ConsentTemplate.plainLanguageSummary` (required on every template) and
`SessionConsentConfiguration.participantIntroduction` (optional, session-specific) are both
free-text fields intended for a general audience, rendered on the participant consent capture
screen before the category form.

Pilot-blocking gate

Every contribution processed by Witness is covered by valid consent — PARTIALLY READY. Structured
Evidence Capture (Milestone 5, PR not yet merged) now exists and demonstrably calls
`ConsentPolicyService` before capturing or editing any participant-backed evidence (test coverage:
`services/api-gateway/src/evidence/evidence.service.test.ts`, including fail-closed cases for
missing consent and refused quotation categories). This gate is not fully met until the PR merges
and the flow is walked through end to end against a live Postgres and browser, which this sandbox
does not have.

E. Evidence Capture

*Note: this section describes the future audio/document upload and browser-recording capability
(post-MVP build order: Media Upload, then AI Transcription). Milestone 5 (Structured Live Evidence
Capture, delivered above) is a distinct, human-led, text-based capability — a facilitator typing a
structured observation, quote, or note during a session — and deliberately does not do
transcription, recording, or file upload. None of the items below are met by Milestone 5; they
remain unchecked until the Media Upload capability is built.*

Upload

Audio upload works

Upload progress is visible

Failed uploads can be retried

Duplicate uploads are detected or safely handled

File type and size validation exists

File integrity hash is stored

Evidence is linked to the correct session

Evidence register shows source and status

Storage can run locally or in a sovereign-compatible service

Recording

Browser recording clearly indicates active capture

Recording cannot begin without consent confirmation

Pause and resume behaviour is safe

Stopping creates a recoverable evidence item

Interrupted capture does not silently lose the recording

Mobile-browser behaviour has been tested

Other Evidence

Document upload works

Image upload works

Evidence metadata can be edited without replacing the original source

Original evidence remains preserved according to retention policy

Pilot-blocking gate

A facilitator can capture or upload at least one valid audio recording without losing provenance

E.1 Evidence Review and Validation (Milestone 6)

*Note: this subsection covers human review of human-captured evidence — the Milestone 6 capability.
It is distinct from section F's "Human Review", which covers review of AI-generated output and
remains post-MVP and unchecked.*

Captured evidence does not become validated by default — READY (Evidence Review, PR #35
merged). `captureEvidence` starts every record `unverified`, and only `validateEvidence` — reachable
solely from `under_review` — ever sets `verificationStatus: 'verified'`. Draft→Validated,
Submitted→Validated, Draft→Under-Review-without-submission and Rejected→Validated are unreachable
because no function in `packages/domain/src/evidence.ts` accepts those starting states.

A reviewer can be assigned to a specific piece of evidence — READY (Evidence Review, PR #35
merged). `ReviewAssignment` (`packages/domain/src/review-assignment.ts`) is a first-class aggregate;
`POST .../evidence/:id/review/assignment` creates one, and the MVP allows exactly one *active*
assignment per evidence — checked in `EvidenceReviewService.assign` and backed by a partial unique
index (`review_assignment_one_active_per_evidence_key`) as the last line of defence.

Only the assigned reviewer can validate or reject — READY (Evidence Review, PR #35 merged).
Two authorisation layers apply: the Casbin `evidence_review:*` action check (does this role hold the
action in this workspace at all), then `EvidenceReviewService.requireAssignedReviewer` (is this
principal the reviewer of record for *this* evidence). A role grant alone is not sufficient; test
coverage in `services/api-gateway/src/evidence/evidence-review.service.test.ts` includes the
wrong-reviewer and no-assignment cases.

A reviewer can request clarification and receive an answer — READY (Evidence Review, PR #35
merged). `Clarification` (`packages/domain/src/clarification.ts`) has its own
`open → answered → closed` lifecycle plus `withdrawn`; requesting one moves the evidence to
`needs_clarification` and closing an answered one resumes `under_review` — each pairing is a single
transaction, so the two aggregates can never disagree.

Evidence can be corrected during review without silently becoming validated — READY (Evidence
Review, PR #35 merged). `correctEvidence` requires a `correctionType`
(`clerical`/`participant_clarification`/`facilitator_interpretation`/`substantive`) and a reason,
applies only to `submitted`/`under_review`/`needs_clarification`, and never writes `reviewStatus` —
the field is absent from its output overrides, so this is structural, not a runtime guard.

Rejected evidence is distinguishable from withdrawn evidence — READY (Evidence Review, PR #35
merged). `rejectEvidence` sets `verificationStatus: 'disputed'` and requires a reason;
`withdrawEvidence` sets `reviewStatus: 'withdrawn'` and leaves verification `unverified`. Withdrawn
evidence never reads as verified.

Review events are audited — READY (Evidence Review, PR #35 merged). Ten new audit actions
(`evidence.review_started`, `evidence.needs_clarification`, `evidence.validated`,
`evidence.rejected`, `evidence.corrected`, `review_assignment.*`, `clarification.*`) append to the
existing hash-chained `AuditEvent` trail, on the same subject-scoped chains as every prior
milestone.

Concurrent review decisions cannot both land — READY (Evidence Review, PR #35 merged). Every
review write carries `expectedVersion` and commits through a conditional `updateMany`; a stale
write is a `409 STALE_VERSION` with nothing persisted, including the audit event.

Pilot-blocking gate

Evidence that supports an institutional outcome has been validated by an identified human reviewer,
with the decision, its reason, and its reviewer preserved in the audit trail — PARTIALLY READY.
The mechanism exists, is unit- and service-tested, and is now enforced at the point of use by
Milestone 7 (see E.2). This gate is not fully met until the review workflow is walked through end
to end against a live Postgres and browser, which this sandbox does not have.

E.2 Decisions, Commitments and Actions (Milestone 7)

A session's decisions are recorded separately from its evidence — READY (Outcomes PR, not yet
merged). `Decision` (`packages/domain/src/decision.ts`) is its own aggregate with its own
lifecycle: `proposed → confirmed`, then `superseded` (replaced by a later decision) or `reversed`
(the institution changed its mind). The two terminal states stay distinct, because collapsing them
would destroy the only signal that tells an institution its decisions are unstable.

Commitments record who undertook what, by when — READY (Outcomes PR, not yet merged). `Commitment`
runs `proposed → active → fulfilled`, with `withdrawn` and `superseded` as the other exits.
Ownership is two-part: `ownerDescription` is required plain language (a team, a service, a named
post), and `ownerUserId` is optional and must be a member in good standing of the outcome's own
organisation. A session participant is never recorded as an owner — no field allows it, which is
what keeps Milestone 4's anonymity guarantees intact here.

Actions can be tracked through to completion — READY (Outcomes PR, not yet merged). `ActionItem`
runs `open → in_progress → completed`, with `blocked` (reason required) and `cancelled` (reason
required) alongside, plus a priority and an advisory percentage. Progress can be recorded while an
action is blocked, because requiring an unblock first would lose the note.

A decision or commitment cannot be made authoritative without a stated basis — READY (Outcomes PR,
not yet merged). `confirmDecision` and `activateCommitment` call `assertSupported` before they will
return a confirmed or active aggregate, so "confirmed with nothing behind it" is not representable.
Exactly two bases are admissible: validated evidence, or an explicitly recorded institutional
synthesis whose rationale is mandatory.

Validated evidence or a recorded institutional synthesis can support an authoritative outcome —
READY (Outcomes PR, not yet merged). Nothing else can.
`assertEvidenceSupportable` (`packages/domain/src/outcome-support.ts`) refuses evidence that is
`draft`, `submitted`, `under_review`, `needs_clarification`, `rejected` or `withdrawn` by name
rather than by a catch-all, refuses evidence whose verification is `disputed`, and refuses evidence
from another workspace or organisation. Evidence the caller cannot reach at all is refused as
`EVIDENCE_NOT_FOUND` before the domain is consulted, so an outcome id cannot be used to probe for
evidence elsewhere.

Traceability survives a later correction — READY (Outcomes PR, not yet merged). The support record
freezes the evidence id, the *version* that was validated, and the verification status at link
time. Correcting the evidence afterwards bumps its own version and leaves the support record
untouched, so "what did we actually rely on" is still answerable.

An outcome cannot quietly lose its basis — READY (Outcomes PR, not yet merged). The support records
are loaded inside the same transaction that writes a confirmation, so a basis removed concurrently
is seen; and `OutcomeSupportService.remove` refuses to detach the last basis from an outcome that
is already authoritative.

Confirming an outcome is a separate permission from proposing one — READY (Outcomes PR, not yet
merged). `outcome:create`/`update`/`transition`/`link_support` are contributor-tier;
`outcome:confirm` and `outcome:close` are reviewer-tier, mirroring the split Milestone 6
established between capturing evidence and validating it.

Outcome history is preserved — READY (Outcomes PR, not yet merged). Twenty-two new audit actions
across four new subject-scoped hash chains (`decision`, `commitment`, `action_item`,
`outcome_support`). Nothing in this milestone deletes an outcome; superseding and reversing both
keep the record and say which happened.

Concurrent outcome writes cannot both land — READY (Outcomes PR, not yet merged). Every write
carries `expectedVersion` and commits through a conditional `updateMany`; a stale write is a
`409 STALE_VERSION` with nothing persisted, including the audit event.

Pilot-blocking gate

Every confirmed decision and active commitment in a session can be traced to validated evidence or
to a recorded institutional synthesis with its rationale — PARTIALLY READY. The mechanism exists
and is unit- and service-tested (Outcomes PR, not yet merged). This gate is not fully met until the
workflow is walked through end to end against a live Postgres and browser, which this sandbox does
not have.

E.3 Session Summary, Reporting and Export (Milestone 8)

A session can be turned into a report — READY (Reporting PR, not yet merged). `Report`
(`packages/domain/src/report.ts`) runs `draft → under_review → approved → published_internally`,
with `exported` recording that a copy has left. Review can send a report back to draft with a
required statement of what needs to change, because forcing an approve/reject binary pushes
reviewers into approving things they doubt.

An approved report is not silently rewritten — READY (Reporting PR, not yet merged). Editing is
refused on anything but a draft. `reviseApprovedReport` produces a *new* report at the next
revision, carrying its citations forward and pointing back at what it supersedes; the approved
revision keeps its status, its approver and its date.

Every material claim is traceable — READY (Reporting PR, not yet merged). `ReportSource`
(`packages/domain/src/report-source.ts`) records one row per cited record with the *version* it held
at inclusion. A record that has moved since is flagged as drifted rather than silently swapped for
its current self.

Draft, rejected and withdrawn evidence cannot be presented as fact — READY (Reporting PR, not yet
merged). `assertSourceAdmissible` accepts only validated evidence, confirmed or superseded
decisions, and active or fulfilled commitments; actions are admissible in any state, because an
honest account includes what an institution stopped. Cross-session, cross-workspace and
cross-organisation records are refused by name.

Facilitator synthesis is never presented as participant testimony — READY (Reporting PR, not yet
merged). The narrative sections live on the report rather than among its sources, and every renderer
labels them as the facilitator's interpretation. `isFacilitatorVoice` names the three sections so no
template decides for itself.

Consent governs what a report may say — READY (Reporting PR, not yet merged).
`projectEvidenceForReport` (`packages/domain/src/report-composition.ts`) answers three separate
questions in order: may this appear (withdrawn or audience-refused consent removes it entirely), may
it be quoted (refused quotation keeps the finding and withholds the content, structurally absent
rather than blanked), and whose voice is it (an anonymous participant is never named; attributed
evidence without attributed-quotation consent falls back to anonymous). A participant-sourced record
with no resolvable consent answer fails closed.

The participant summary cannot identify anyone — READY (Reporting PR, not yet merged). Counts only,
never a list. Withdrawn participants remain in the total, because a count that dropped between
revisions would say who left.

Withdrawal of consent reaches an already-approved report — READY (Reporting PR, not yet merged).
Consent is evaluated at render time rather than frozen at approval, so the next copy of a published
report omits a participant who has since withdrawn.

Reports can be exported — READY (Reporting PR, not yet merged). Printable HTML, Markdown, JSON and
CSV. PDF is deliberately out of scope for the MVP; the HTML export prints. Redaction happens in
`ReportsService.render` before any format is chosen, so all four serialise the same already-redacted
document.

Exports are server-authoritative and hostile-input aware — READY (Reporting PR, not yet merged). The
client never filters; it receives an already-redacted payload. CSV neutralises leading `=`, `+`, `-`
and `@` so a participant quotation is not executed as a spreadsheet formula, HTML escapes, and every
export is served as an attachment rather than rendered inline in the application's origin.

Approving a report is a separate permission from writing one — READY (Reporting PR, not yet merged).
`report:create`/`update`/`submit` are contributor-tier and `report:approve`/`publish` are
reviewer-tier, with no overlap, so a contributor cannot approve their own report.

Report activity is audited — READY (Reporting PR, not yet merged). Ten new actions across the
`report` and `report_source` hash chains, including every individual export with its format and its
actor.

Pilot-blocking gate

An authorised person can produce a privacy-safe, evidence-traceable report of a real session and
export it — PARTIALLY READY. The mechanism exists and is unit- and service-tested (Reporting PR, not
yet merged). This gate is not fully met until the workflow is walked through end to end against a
live Postgres and browser, which this sandbox does not have.

F. AI Processing

Processing Jobs

Processing job status is visible

Processing failure is visible

Failed jobs can be retried safely

Model and configuration are recorded

AI provider can be replaced through an interface

Processing respects consent and access boundaries

Transcription

Audio can be transcribed

Transcript contains timestamps

Transcript language is recorded

Transcript can be edited

Original generated transcript is preserved or versioned

Revised transcript records who changed it

Unsupported or poor audio fails clearly

Speaker labels can be corrected, whether automatically generated or manual

Summary

Summary can be generated

Summary is marked as AI-generated until confirmed

Summary can be edited

Summary links to source evidence

Summary can be confirmed or rejected

Actions

Actions can be extracted

Action text can be edited

Owner can be assigned or corrected

Due date can be assigned or corrected

Action links to supporting evidence

Action can be confirmed or rejected

Decisions

Decisions can be extracted

Decision text can be edited

Decision status can be set

Decision links to supporting evidence

Decision can be confirmed or rejected

Human Review

Review queue exists

Reviewer can distinguish generated, edited, confirmed, and rejected content

AI output does not silently become authoritative

Review events are audited

Pilot-blocking gate

A facilitator can produce and approve a transcript, summary, and useful actions or decisions from a
valid session recording

G. Institutional Memory

Search

Search covers session title and purpose

Search covers approved transcript

Search covers approved summary

Search covers actions

Search covers decisions

Search respects organisation boundaries

Search respects workspace boundaries

Search respects roles and consent restrictions

Results show the originating session

Results link to source evidence where applicable

Filters and Timeline

Filter by date

Filter by organisation

Filter by workspace

Filter by session

Filter by result type

Timeline view or ordered history exists

Retrieval

User can ask whether a topic was discussed before

Answer cites internal evidence

Insufficient evidence is stated clearly

Generated synthesis is distinguishable from confirmed records

No cross-tenant or consent-restricted evidence is exposed

Public-MVP gate

A user can find a previous discussion and inspect the evidence behind it

H. Export and Use

Session summary can be exported

Transcript can be exported where permitted

Actions can be exported

Decisions can be exported

Export identifies session and source

Export identifies generated versus confirmed content

Export respects access and consent

Printable HTML or PDF output works

Markdown or structured JSON output works

Export can be generated without developer assistance

Pilot-blocking gate

A facilitator can share an approved result after the session

I. Provenance, Audit, and Data Integrity

Organisation changes are audited

Workspace changes are audited

Membership and role changes are audited

Session changes are audited

Consent changes are audited

Evidence capture is audited

AI processing records model and configuration

Human review and confirmation are audited

Audit chain verification passes

Tampering is detected

Source evidence remains linked to derived outputs

Deletion, restriction, and retention actions are visible and controlled

Pilot-blocking gate

Every approved AI-derived output can be traced to source evidence and human review

J. Security and Privacy

Secrets are not committed

Sensitive logs are avoided

File access is authorised

Input validation exists

Rate or resource abuse has a basic mitigation

Dependency and secret scans pass

Common OWASP risks are reviewed

Access tests include negative cases

Retention and deletion behaviour is documented

Backup does not bypass access or encryption requirements

Security contact and reporting process exist

Pilot-blocking gate

No known critical security, access, consent, or data-loss defect remains open

K. Accessibility and Usability

Core workflow works with keyboard navigation

Forms have labels and clear errors

Focus states are visible

Colour contrast is acceptable

Core workflow works on a common mobile viewport

Language is understandable to non-technical facilitators

Loading and processing status is visible

Empty states explain the next action

Failure states explain recovery

Accessibility needs can be recorded for participants

Public-MVP gate

A trusted facilitator completes the workflow with limited assistance

L. Deployment and Operations

Local development setup is reproducible

Docker-based deployment works

Database migration works in deployment

Required AI services are documented

Storage configuration is documented

Health endpoint works

Readiness endpoint works

Logs support diagnosis without exposing sensitive content

Backup process is tested

Restore process is tested

Administrator can identify failed processing jobs

Version and release notes are visible

Public-MVP gate

A clean environment can deploy the pilot version using documented steps

M. Pilot Execution

Internal Pilot

Real session selected

Facilitator identified

Consent language reviewed

Test deployment ready

End-to-end session completed

Transcript reviewed

Summary reviewed

Actions or decisions reviewed

Search tested

Export produced

Critical defects recorded

Time spent measured

Trusted Facilitator Pilot

Facilitator onboarded without repository knowledge

Facilitator prepared a session

Facilitator captured consent

Facilitator captured evidence

Facilitator reviewed AI outputs

Facilitator exported results

Usability feedback recorded

Trust concerns recorded

Facilitator stated whether they would use Witness again

Partner Pilot

Organisation and data owner identified

Deployment location agreed

Access and retention requirements agreed

Support path agreed

Session completed

Institutional value assessed

Next-use decision recorded

N. MVP Release Gate

Witness is ready for a controlled external MVP only when all statements below are true:

All Pilot-blocking gates are complete

All Public-MVP gates are complete

At least one internal pilot is complete

At least one trusted facilitator pilot is complete

No unresolved critical defect remains

Consent and access behaviour have been manually verified

Backup and restore have been tested

A complete workshop output has been searched and exported

Known limitations are documented

Product owner approves the release

Technical lead approves the release

Release tag and notes are prepared

O. Post-MVP Learning Gate

Before expanding scope:

At least 3 real sessions completed

At least 2 facilitators used Witness

Users identified the most valuable AI output

Users identified the most confusing workflow

Consent concerns have been reviewed

Search questions have been collected

Deployment constraints have been collected

Roadmap reprioritised from evidence

Deferred enterprise work remains deferred unless justified by pilots
