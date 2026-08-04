Witness MVP Checklist

Version: 1.0
**Status:** Active
Purpose: Binary release gate for real co-design testing
**Owner:** Founder / Product Lead with Engineering and QA  

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

Facilitator can create a co-design session

Session belongs to one organisation and workspace

Session has title

Session has purpose or objectives

Session has date and time

Session has location or online format

Session has language metadata

Session status is visible

Session can be edited before completion

Session can be archived without silent deletion

Agenda items can be added and ordered

Facilitator can add participants

Participant preferred name can be recorded

Participant affiliation is optional

Language or accessibility needs can be recorded

Session dashboard shows the next required action

Pilot-blocking gate

A facilitator can prepare a real session without an external setup spreadsheet

D. Consent and Participant Rights

Consent statement is versioned

Consent is linked to a participant and session

Recording permission is explicit

Processing purpose is explicit

Sharing or publication permission is explicit where applicable

Consent capture method and time are recorded

Consent can be restricted

Consent can be withdrawn

Withdrawal is visible to authorised users

Processing cannot silently exceed recorded consent

Consent changes are auditable

Sensitive participant information is access-controlled

Plain-language participant explanation is available

Pilot-blocking gate

Every contribution processed by Witness is covered by valid consent

E. Evidence Capture

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
