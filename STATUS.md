# Status

**Last updated:** 2026-08-04 (Milestone 3)
**Updated by:** CTO
**Update rule:** every pull request that changes the state of a workstream updates this file.
Staleness here is a defect — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Executive summary

Witness is in **Phase 1 (Architecture & Research)**, and now ships a **Developer Preview (0.1.0)**
that runs.

Phase 0 is complete. The preview proves the architecture end to end on one narrow workflow —
capture a record, store it, display it, show its provenance, let a human accept or reject it — with
a hash-chained audit trail and a real authorisation boundary.

**The pipeline is still deliberately unbuilt.** No AI extraction, no transcription, no knowledge
graph, no consent service, no Keycloak. Consent, provenance and tenancy are cross-cutting
invariants; any assertion written before they are enforceable is permanently untrustworthy. The
running instance lists every missing capability at `/ready` and renders it on the dashboard, so the
gap is visible rather than inferred.

**Overall health:** 🟢 On track
**Biggest current risk:** R-01 — ontology design becoming an unbounded research project. Mitigation
is a hard time-box on ontology v0.1 and a commitment to versioned, evolvable schema rather than a
correct-first-time one. See [`docs/governance/RISK_REGISTER.md`](docs/governance/RISK_REGISTER.md).

---

## Phase status

| Phase | Name | State | Gate met |
|---|---|---|---|
| 0 | Engineering organisation | 🟢 Complete | ✅ |
| 1 | Architecture & research | 🟡 In progress | — |
| — | *Developer Preview 0.1.0* | 🟢 *Shipped 2026-08-01* | *n/a — not a phase gate* |
| 2 | Infrastructure & identity | ⚪ Not started | — |
| 3 | Core backend & data | ⚪ Not started | — |
| 4 | Knowledge graph | ⚪ Not started | — |
| 5 | AI platform & capture | ⚪ Not started | — |
| 6 | Search & experience | ⚪ Not started | — |
| 7 | Hardening | ⚪ Not started | — |
| 8 | v1.0 & reference deployments | ⚪ Not started | — |

Legend: 🟢 complete/healthy · 🟡 in progress · 🔴 blocked · ⚪ not started

---

## Workstream status

| Workstream | Branch | Owner | State | Notes |
|---|---|---|---|---|
| Architecture | `architecture` | Principal Architect | 🟡 | C4 context/container done; component views pending |
| Research | `research` | Research Lead | 🟡 | OSS evaluation complete for core stack; ASR benchmark pending |
| Documentation | `documentation` | Documentation Lead | 🟢 | Baseline complete; onboarding verified end-to-end; docs site not yet built |
| Product | `product` | Product Director | 🟡 | Personas and core journeys defined; PRDs pending |
| UX design | `ux-design` | UX Lead | ⚪ | Blocked on Phase 1 journeys |
| Governance | `governance` | Governance Lead | 🟡 | Consent framework drafted; Indigenous protocols need external review |
| Security | `security` | Security Lead | 🟡 | Threat model started; PIA not begun; Casbin-based, organisation/workspace-scoped authorisation shipped (ADR-0007); real identity is Phase 2 |
| Infrastructure | `infrastructure` | Infrastructure Lead | 🟡 | Compose stack running; observability overlay added, wiring pending |
| Backend | `backend` | Backend Lead | 🟡 | Domain, config, contracts and API gateway shipped in 0.1.0; Co-design Session lifecycle (Milestone 2) and Participant Management (Milestone 3) shipped |
| Knowledge graph | `knowledge-graph` | Knowledge Graph Lead | 🟡 | Ontology v0.1 in design |
| AI platform | `ai-platform` | AI Lead | ⚪ | Awaiting Phase 5; model policy drafted |
| Frontend | `frontend` | Frontend Lead | 🟡 | Preview web application shipped; co-design session (Milestone 2) and participant (Milestone 3) screens added; design system awaits Phase 6 |
| Testing | `testing` | QA Lead | 🟡 | 409 tests across all packages (235 API-gateway); invariant and adversarial suites live |
| Release | `release` | Release Manager | 🟢 | Strategy and versioning defined |

---

## Phase 1 deliverable tracker

| # | Deliverable | Owner | State |
|---|---|---|---|
| 1.1 | C4 architecture views | Principal Architect | 🟡 MERGED — SIGN-OFF REQUIRED (Principal Architect + CTO) — [`architecture/views/COMPONENT_VIEWS.md`](architecture/views/COMPONENT_VIEWS.md) |
| 1.2 | Domain model & bounded contexts | Principal Architect | 🟡 Drafted, PR open — [`architecture/domains/DOMAIN_MODEL.md`](architecture/domains/DOMAIN_MODEL.md) |
| 1.3 | Knowledge graph ontology v0.1 | Knowledge Graph Lead | 🟡 Draft in `architecture/KNOWLEDGE_GRAPH.md` |
| 1.4 | Event catalogue v0.1 | Backend Lead | 🟡 Draft in `architecture/EVENT_CATALOGUE.md` |
| 1.5 | API contract v0.1 | Backend Lead | ⚪ Not started |
| 1.6 | OSS evaluation | Research Lead | 🟢 Complete for core stack |
| 1.7 | Threat model & PIA | Security Lead | 🟡 MERGED — SIGN-OFF REQUIRED (2nd Security Lead + QA Lead) — [`docs/research/THREAT_MODEL.md`](docs/research/THREAT_MODEL.md); 7 CodeRabbit findings landed after merge, unaddressed |
| 1.8 | Consent framework spec | Governance Lead | 🔴 BLOCKED — needs external Indigenous governance review |
| 1.9 | Accessibility & i18n strategy | UX Lead | 🟡 MERGED — SIGN-OFF REQUIRED (UX Lead + D10) — [`docs/product/ACCESSIBILITY_I18N_STRATEGY.md`](docs/product/ACCESSIBILITY_I18N_STRATEGY.md); 2 CodeRabbit nitpicks outstanding |
| 1.10 | NFRs & SLOs | CTO | 🟡 MERGED — SIGN-OFF REQUIRED (Principal Architect + CTO) — [`architecture/NFR_SLO.md`](architecture/NFR_SLO.md) |

---

## What changed recently

### 2026-08-04 — Participant Management delivered (BUILD_ROADMAP.md Milestone 3), PR open

- **Second capability in the "WITNESS — CO-DESIGN MVP BUILD COMPLETION" sequence.** With Co-design
  Session Management merged (PR #26), an authorised facilitator can now add and manage participants
  within a session: named, pseudonymous, anonymous, registered, and non-registered participation are
  all first-class, and a participant is never required to hold a Witness user account.
- **`SessionParticipant` domain aggregate** (`packages/domain/src/session-participant.ts`): identity
  is modelled on two independent axes — `identityMode` (`named`/`pseudonymous`/`anonymous`) and
  registration (`linkedUserId`, optional and orthogonal to identity mode, so a registered user can
  still participate pseudonymously and a non-registered person can still be named). `addParticipant`
  enforces anonymity by construction: an `anonymous` participant's `displayName` is forced to a fixed
  generic label and every other identifying field (`preferredName`/`pronouns`/`affiliation`) is
  cleared regardless of what the caller passed, and `linkedUserId` is rejected outright for that
  mode — "anonymous participation must not create fake personal details" is a domain invariant, not
  a UI convention. `participantType` is a free-form, organisation-supplied string, the same
  `sessionType` reasoning as Milestone 2: "interpreter" and "community representative" are not a
  closed set, and are explicitly not a system authorisation role (`role.ts`'s own doc comment).
  `consentStatusSummary` mirrors `CoDesignSession.consentConfigurationState`'s precedent — stored,
  defaulted to `not_configured`, no mutator until Milestone 4 (Consent) exists to set it.
- **Server-side privacy enforcement, not UI hiding.** `ParticipantsService` makes an imperative,
  in-service Casbin decision (`participant:manage_restricted`) — new to this codebase, because a
  single `GET` can legitimately return two different bodies for two different callers (a reader sees
  a redacted participant, a contributor sees the full record), which a route-level `@Requires(...)`
  boolean gate cannot express. `SessionParticipantSummary` has no `linkedUserId`/`facilitatorNotes`
  field at all — not merely `null` when hidden, but structurally absent from the list projection, so
  a server-side mistake cannot leak either through that type. `SessionParticipantDetail` includes
  both only when permitted (`linkedUserId` additionally for any `named` participant, whose account
  link is not restricted information); a `pseudonymous` participant's `linkedUserId` is retained
  internally but never returned by an ordinary read. The redacted export endpoint
  (`GET .../participants/export`) always applies the unprivileged redaction, regardless of the
  caller's own tier — an export artifact leaves the application's trusted context, so it never
  reflects the exporter's elevated view.
- **Session-lifecycle-gated participant changes.** Adding a participant or making an ordinary detail
  change is permitted in `draft`/`scheduled`/`open` (a facilitator registering a walk-in participant
  during a live session is a realistic need the milestone's floor rules do not forbid) and rejected
  in `closed`/`archived`. Attendance recording is permitted in `scheduled`/`open`/`closed` (marking
  final attendance after a session wraps up is routine) and rejected in `draft`/`archived`.
  Withdrawal/restoration is permitted in every status except `archived` — honouring a withdrawal
  request should not have to wait for the session to reopen.
- **Optimistic concurrency**, same conditional-`updateMany`-plus-audit-in-one-transaction pattern
  Milestone 2 established: every update/transition carries `expectedVersion`, and a stale write is a
  `409 STALE_VERSION` with nothing persisted.
- **Authorisation reuses the existing Casbin scope-tier boundary exactly.** Four new actions
  (`participant:read`/`create`/`update`/`manage_restricted`) at the same reader/contributor/
  reviewer/admin tiers `session:*` already uses — no new mechanism, no per-session or
  per-participant ownership check (same named gap Milestone 2 documented for sessions, extended
  here: any contributor/admin in a workspace's scope may manage any participant there).
  `packages/policy/policy.csv`'s header comment records the reasoning.
- **Frontend**: participant list (privacy-safe by construction — nothing to redact client-side
  because the server never sends restricted fields to an unprivileged caller), add-participant flow
  with independent registered/non-registered and named/pseudonymous/anonymous controls, participant
  detail with invitation/attendance/identity-visibility controls, a restricted facilitator-notes
  editor that renders only when the loaded record actually carries the `facilitatorNotes` key,
  withdrawal/restoration, redacted JSON export, and history — all under
  `/workspaces/:id/sessions/:sessionId/participants`.
- **Known limitations, named rather than hidden:** no per-session/per-participant ownership check
  (see above); no self-service view for a participant who is also a signed-in registered user to see
  only their own record (`participant:manage_restricted`/`participant:read` are workspace-scoped
  tiers, not row-level ownership — the same limitation Milestone 2 accepted for sessions); export
  format is JSON only (CSV/other formats deferred); no live Postgres or Docker was available in this
  sandbox, so the migration is hand-authored SQL (validated via `prisma validate`/`generate`, not
  applied against a live database) and the full workflow could not be walked through in a browser —
  same constraint every prior milestone was built under.
- **Verification:** `pnpm verify` (format, lint, typecheck, 409 tests across all packages — 137
  domain, 12 contracts, 25 config, 235 API-gateway — build) all green. `pnpm test:invariants`
  (20/20) and `pnpm test:adversarial` (30/30) unchanged, still green. `scripts/ci/check-domain-purity.sh`
  passes.

### 2026-08-04 — Co-design Session Management delivered (BUILD_ROADMAP.md Milestone 2), PR open

- **First core product capability after identity and access management.** With Authentication (PR
  #22/#23) and Authorisation Hardening (PR #25) both merged, this is the first milestone in the
  "WITNESS — CO-DESIGN MVP BUILD COMPLETION" sequence: a facilitator can now create, schedule, open,
  manage, close, archive, and reopen a co-design session within an organisation and workspace, with
  every action authorised through the existing Casbin scope-tier boundary — no new authorisation
  mechanism invented for this milestone.
- **`CoDesignSession` domain aggregate** (`packages/domain/src/co-design-session.ts`): an explicit
  five-state lifecycle (`draft → scheduled → open → closed → archived`, plus `scheduled → draft` and
  an audited, reasoned `closed → open` reopen) — mirrors `review.ts`'s "reopening emits an audit
  event, so the previous state is never lost" reasoning. Archived sessions are read-only, enforced
  in the domain layer (`assertNotArchived`), not just the UI. `sessionType` is a free-form,
  organisation-supplied string rather than a closed enum — "talanoa," "formal proceeding," and
  "community consultation" carry distinct protocol expectations a fixed list would either flatten or
  perpetually chase; `packages/contracts` ships a suggested set for the frontend picker only.
  `evidenceCaptureState` from the milestone brief is deliberately NOT a stored field — it is fully
  determined by `status` (`canCaptureEvidence()`), so Milestone 5 (Evidence Capture) will call that
  function rather than read a value that could drift from the state it describes.
  `consentConfigurationState` IS stored (`not_configured` at creation) because Milestone 4 (Consent)
  will need to set it independently of lifecycle status, but gets no mutator of its own yet — a
  named, deliberate gap, not an oversight.
- **Optimistic concurrency, new to this codebase.** Every update and transition of an existing
  session carries a client-supplied `expectedVersion`; the persistence-layer write is a single
  conditional `updateMany({ where: { id, version: expectedVersion } })`, and zero rows matched is a
  `409 STALE_VERSION` — the entire
  transaction, including the audit event, rolls back rather than silently overwriting a change the
  client never saw. `sessions.service.test.ts` verifies the case that actually matters: a client
  acting on a version it read *before* someone else's write landed is rejected identically whether
  the conflicting write happened during this exact request or five minutes earlier.
- **Authorisation reuses the existing Casbin boundary exactly, with two named simplifications.**
  Four new actions (`session:read`/`session:create`/`session:update`/`session:transition`) were
  added to `packages/policy/policy.csv` and the deprecated dev-header fallback table
  (`role-grants.ts`), granted to the `contributor` tier (which `facilitator` collapses onto via
  `RoleResolutionService.ROLE_TO_TIER` — unchanged from Milestone 1.4). Two things this creates,
  named rather than hidden: (1) a plain `contributor` WitnessRole can create and manage sessions too,
  not only `facilitator` — splitting them onto separate tiers was judged out of scope; (2) there is
  no per-session "only the assigned facilitator may manage this specific session" ownership check —
  any contributor- or admin-tier holder in the session's organisation or workspace may manage *any*
  session there. Every session route nests under `:workspaceId`
  (`/api/v1/workspaces/:workspaceId/sessions/...`), which is what makes `AuthorizationGuard`'s
  existing scope resolution (Milestone 1.4) correctly Casbin-scope every session action without any
  change to the guard itself.
- **API**: `list`/`get`/`create`/`update`/`transition`/`history` under
  `/api/v1/workspaces/:workspaceId/sessions`, mirroring `RecordsController`'s
  parse-authorise-delegate-serialise shape; lifecycle transitions
  (schedule/unschedule/open/close/reopen/archive) are bundled behind one `session:transition`
  permission on `POST :sessionId/transition`, the same shape `record:review` uses for its own
  submit/confirm/correct/reject/reopen family. Lifecycle history reuses the existing polymorphic
  `AuditEvent` table filtered to lifecycle-action types — no new history table.
- **Frontend**: `/workspaces/[id]/sessions` (list + create link), `/workspaces/[id]/sessions/new`
  (create form — session-type picker with a free-text "Other" fallback, facilitator picker scoped to
  workspace members), and `/workspaces/[id]/sessions/[sessionId]` (detail, inline edit, lifecycle
  controls rendered from the server-computed `permittedTransitions` list, schedule/reopen sub-forms,
  and lifecycle history) — plus a "Co-design sessions →" link added to the existing workspace detail
  page. A distinct `staleUpdate` UI state (not folded into the generic error banner) handles
  `409 STALE_VERSION` with a "someone else changed this — reload" prompt, and a distinct `forbidden`
  state handles a 403 separately from "not found."
- **Known limitation, stated plainly**: this milestone's frontend, like every existing
  organisation/workspace/membership management page, drives the API through the unverified
  `X-Witness-Dev-User` header, not a real session — unchanged scope decision from Milestone 1.4, not
  reopened here.
- **No live Postgres or Docker was available in this sandbox** (unchanged from every prior
  milestone), so this could not be walked through end-to-end in a browser against a live database.
  Verification here is: 32 new domain tests (`co-design-session.test.ts`) covering every lifecycle
  transition and its adversarial rejections; 15 new service tests
  (`sessions.service.test.ts`) covering creation, scoping 404s, transitions, archived immutability,
  and optimistic concurrency against an in-memory Prisma double; 4 new policy-engine tests against
  the real, on-disk Casbin policy data; a hand-authored SQL migration (no live DB to generate a diff
  against, matching the same constraint every prior milestone's migration was written under) plus a
  successful `prisma generate`/`prisma validate`; and a full Next.js production build that
  type-checks and statically renders every new route. A live-database, live-browser manual
  walkthrough remains unverified — stated as such, not claimed.
- **Tests**: 331 tests across all packages (up from 276) — 94 domain (up from 62), 200 API-gateway
  (up from 177). `test:invariants` 20/20 and `test:adversarial` 30/30 unchanged. Full `pnpm verify`
  (format, lint, typecheck, test, build) green.

### 2026-08-04 — Authorisation Hardening delivered (BUILD_ROADMAP.md Milestone 1.4), PR open

- **Continuous Product Delivery mode**: verified before starting — PR #24 (CI regression hotfix,
  discovered while confirming PR #23 was actually green on `main`) merged; `main`'s CI green.
  Branched `feat/authz/authorisation-hardening` from `fix/auth/ci-regression`'s tip rather than a
  stale `main` — one clean, CI-green commit ahead of `main` at branch time, disclosed here rather
  than silently deviating from "branch from main."
- **Casbin is now a genuine policy decision point (ADR-0007), not a second framework bolted beside
  the existing role-grants table.** `packages/policy/model.conf` and `packages/policy/policy.csv`
  are the single, versioned source of truth for what a request-time grant tier (`reader` /
  `contributor` / `reviewer` / `admin`) may do — ported 1:1 from the pre-existing `role-grants.ts`
  table, which now exists only as the deprecated fallback for the unverified development header.
  `PolicyEngineService` loads them once via a real Casbin `Enforcer`; `PolicyEngineService.test.ts`
  runs against that real, on-disk policy data rather than a fake — and caught a real bug doing so
  (Casbin's CSV adapter only skips `#`-prefixed comment lines, not `;`-prefixed ones; the policy
  file's original header used `;` and every enforcement call silently failed to load).
- **The organisation/workspace scoping gap left open since Authentication (Milestone 1.3) is
  closed.** `RoleResolutionService` now answers two distinct questions from the same
  `RoleAssignment` rows: `globalGrantTiers` (unscoped actions — `record:*`, `user:*`, `role:read` —
  `admin` excluded, unchanged from Milestone 1.3) and `scopedGrantTiers` (a specific organisation or
  workspace — `admin` included, only within that exact scope, and only when the backing
  `OrganisationMembership`/`WorkspaceMembership` is in good standing; a workspace scope also honours
  an assignment on the workspace's *parent* organisation). The workspace/organisation split is a
  compile-time guarantee, not a runtime convention: `scopedGrantTiers`'s scope parameter type
  excludes `'global'` entirely, so `admin` cannot leak into an unscoped decision by a later edit
  forgetting a branch.
- **`AuthorizationGuard` now resolves a request's organisation/workspace scope and calls the new
  `PolicyEnforcementService.decide(principal, action, scope)`** instead of
  `AuthorizationPort.decide()` directly. Scope comes from the route's `organisationId`/`workspaceId`
  path parameter when present, else a creation body's `organisationId` (`workspace:create`), else
  the global scope. The unverified `X-Witness-Dev-User` path is untouched: a principal whose
  `subject` does not start with `user:` falls straight through to the pre-existing, unscoped
  `AuthorizationPort.decide()` — scoping is a property of real, session-backed identity, and there
  is no membership set to scope a header nobody has verified to.
- **`GET /api/v1/organisations` and `GET /api/v1/workspaces` are no longer full-catalog reads for a
  real session.** Both previously returned every row regardless of caller — authorised per-record
  by nothing, since neither route resolved a scope. `OrganisationsService.list` now filters to
  organisations the caller has a membership row in; `WorkspacesService.list` filters to workspaces
  the caller is a member of directly, or that sit under an organisation the caller is a member of
  (mirroring the `RoleResolutionService` cascade). The unverified dev-header path keeps seeing
  everything, exactly as before.
- **`GET /api/v1/me` now reports the role held in each organisation and workspace**, not just which
  ones the caller belongs to. `CurrentUserView`'s `organisations`/`workspaces` entries gained a
  `role: WitnessRole | null` field (`null` is a distinct, honest state — a membership predating its
  role assignment, per Milestone 1.2's "role assignment never happens implicitly" — not an error).
  The dashboard's existing "Your access" section now renders a role badge (or "No role assigned
  yet") next to each organisation and workspace. This is a display convenience only; the server
  re-derives the same answer independently via `PolicyEnforcementService` on every request, so a
  stale or manipulated client value can never grant anything.
- **Known limitation, stated plainly and deliberately not fixed this milestone**: the existing
  organisation/workspace/membership CRUD pages (`/organisations/[id]`, `/workspaces/[id]`, and
  their member-management flows) still call the API through the unverified dev-header path, not a
  real session — migrating them was judged out of scope for an authorisation-hardening milestone
  and would have doubled its surface area. The dashboard's "Your access" section is an additive
  extension for real sessions; the management UI itself remains dev-header-only until a later
  milestone migrates it.
- **`record:*` and `user:*` actions remain unscoped, on purpose.** `Record`/`Source` carry no
  `organisationId`/`workspaceId` foreign key in the Prisma schema, and `User` is not
  organisation-scoped — inventing a scoping model for either was out of scope ("speculative
  infrastructure" this milestone does not need to build). `organisation:create`/`user:create` stay
  admin-only in the *global* tier resolution, which never includes `admin` for a real session — the
  same fail-closed boundary Milestone 1.3 documented and explicitly re-deferred, not resolved, here.
- **Tests**: 177 API-gateway tests (up from 153 at PR #24's merge) — new coverage for
  `RoleResolutionService.scopedGrantTiers` (organisation scope, workspace scope, the parent-org
  cascade, and five adversarial cases: cross-organisation leakage, cross-workspace leakage, a role
  assignment with no backing membership, a suspended membership, a nonexistent workspace),
  `PolicyEngineService` against the real on-disk policy data, `PolicyEnforcementService.decide`
  (grant/deny composition, the dev-header fallback, and fail-closed behaviour when role resolution
  or the policy engine itself throws), and list-visibility scoping for both
  `OrganisationsService.list` and `WorkspacesService.list`. All pre-existing tests preserved and
  passing; `test:invariants` 20/20 and `test:adversarial` 30/30 unchanged. Full `pnpm verify`
  (format, lint, typecheck, test, build) green.
- **Not done this milestone, named rather than left implicit**: the milestone's full "current-context
  panel" UI (hide/disable actions, distinct states for forbidden-org/forbidden-workspace/
  insufficient-permission beyond what the additive dashboard extension above covers) was scoped down
  given the CRUD-page dev-header limitation above — there is little value in building rich
  forbidden-state UI for pages that do not yet authenticate the user they would be describing.

### 2026-08-03 — Authentication Hardening delivered, PR open

- **Continuous Product Delivery mode**: verified before starting — PR #22 (Authentication,
  Milestone 1.3) merged to `main`, no overlapping open PR. Scope: address the legitimate
  unresolved CodeRabbit review findings from PR #22, attempt real Keycloak verification, and leave
  the authentication boundary ready for Authorisation hardening — explicitly not that next
  capability itself.
- **Current-user error mapping corrected.** `GET /api/v1/me` previously collapsed every failure
  into `UNAUTHENTICATED`; a suspended or deactivated account with a still-technically-valid session
  token was silently served its full `CurrentUserView` — a real gap, not merely a UX one. Now
  distinguishes `UNAUTHENTICATED` (no/unknown session), `SESSION_EXPIRED`, `ACCOUNT_SUSPENDED` /
  `ACCOUNT_DEACTIVATED` (403 — the account, not the session, is the problem), and `UNKNOWN_ACCOUNT`
  (defensive). The frontend (`apps/web/src/lib/auth.tsx`) only discards the stored session token
  for the first two — a transient server failure or an account-state denial no longer forces an
  unnecessary full OIDC round trip, and the Shell now renders a distinct message for each case.
  Verified against a real database: suspending an already-signed-in account now correctly denies
  `/me` with `ACCOUNT_SUSPENDED` instead of serving the view.
- **Login-state consumption is now atomic.** The previous `findUnique` then separate `delete`
  left a real window where two concurrent callbacks carrying the same `state` could both read the
  row before either deleted it. Replaced with a single atomic `delete` — the delete itself is the
  claim; a losing concurrent caller or a replay gets Prisma's "record not found," identical to
  "never existed." A new concurrency test proves exactly one of two simultaneous callbacks for the
  same state succeeds.
- **`AuthLoginAttempt` no longer grows without bound.** `startLogin` (unauthenticated,
  `GET /api/v1/auth/login`) now opportunistically purges expired rows on every call — no external
  scheduler required for basic operation. Verified against a real database: an expired attempt
  inserted directly is gone after the next sign-in start; active attempts are preserved.
- **OIDC discovery hardened**: a 5-second timeout (`AbortSignal.timeout`) on both the discovery and
  token-exchange fetches (previously unbounded — a stalled Keycloak could hold every sign-in
  request open indefinitely); concurrent discovery requests on a cold adapter now share one
  in-flight fetch instead of each issuing their own; the discovery document's required fields are
  validated before use rather than assumed; a failed discovery is not cached, so the next call
  retries; a successful discovery is now re-fetched after one hour rather than cached forever.
  None of this weakens verification — a failed or incomplete discovery still fails closed.
- **OIDC configuration values are now trimmed** (`oidcIssuer`, `oidcClientId`, `oidcClientSecret`,
  `jwtAudience`) before being stored — previously only `webOrigin` and `oidcRedirectUri` were,
  meaning trailing whitespace in an operator's `.env` value would have silently broken the
  discovery-document fetch and every ID-token audience check.
- **A development-only open redirect closed.** `dev-idp/authorize`'s `redirect_uri` query parameter
  is now validated against the configured callback URI before use — the route is
  development-profile-only, so the blast radius was always a local dev machine, but the file's own
  header comment promised no caller-supplied redirect target, and this was the one exception.
- **N+1 query removed** from `SessionAuthenticator.effectiveRoleGrantTiers` — `AuthorizationGuard`
  calls this on every guarded request, so a user with N role assignments previously cost N
  sequential membership lookups before any handler ran. Now two batched `findMany` calls regardless
  of assignment count, with a regression test asserting exactly one query per scope type for three
  assignments across three organisations.
- **Three attack tests in the development identity-provider double's suite were passing for the
  wrong reason** — each verified a token signed by a *different* key, so `jwtVerify` rejected on
  signature before the issuer/audience/expiry claim under test was ever evaluated; if the adapter
  had dropped those checks entirely, the tests would still have passed. `DevelopmentIdentityProviderAdapter`
  now accepts an optional shared key pair (test-only — production code never supplies one), and the
  three tests were rewritten to share a key pair and assert on the specific `jose` claim-validation
  error code (`ERR_JWT_CLAIM_VALIDATION_FAILED` / `ERR_JWT_EXPIRED`) rather than any throw.
- **Real Keycloak was not verified** — no container runtime is available in this sandbox (unchanged
  from PR #22; confirmed again, not assumed). Added
  [`docs/engineering/KEYCLOAK_INTEGRATION_VERIFICATION.md`](docs/engineering/KEYCLOAK_INTEGRATION_VERIFICATION.md),
  a step-by-step procedure (exact commands, exact checks) to run once Docker is available, and
  `infrastructure/docker/init/keycloak/witness-realm.json`, a reproducible realm-import file (realm
  `witness`, public PKCE client `witness-api`, two test users) for the `keycloak` compose service's
  existing `--import-realm` — declarative configuration, not yet imported into a running instance,
  stated as such in both the file's own status line and this entry. **This remains a pilot-blocking
  gate**, unchanged from before this PR.
- **Development identity boundary re-reviewed, no gaps found.** `DevelopmentAuthorizationAdapter`
  and `DevelopmentIdentityProviderAdapter` both still throw at construction outside the development
  profile; `SessionBackedAuthorizationAdapter`'s dev-header fallback returns `null` unconditionally
  outside development (now covered by a dedicated test,
  `session-backed.adapter.test.ts`); `AuthorizationGuard` tries a real session before the dev
  header (now covered by `authorization.guard.test.ts`, including a forged-admin-header-alongside-
  a-real-session case). Added a development-profile-only notice on `/signin` naming the local
  identity double explicitly, so the bypass is visible at the point someone is about to use it, not
  only on the dashboard's health panel.
- **TD-002 and TD-003 reassessed**, as instructed, for whether Authentication makes either directly
  exploitable. Neither is newly exploitable by this PR specifically — TD-003
  (`docs/engineering/TECH_DEBT.md`) already accounted for `AuthenticationService` reusing the
  unfixed `resolveActor` helper when Milestone 1.3 landed; its risk-scope description there was
  corrected in this PR (see below), but the underlying exposure and its 2026-11-03 deadline, tied to
  Milestone 1.4 or any external pilot, are unchanged.
- **Documentation corrections**: `docs/engineering/TECH_DEBT.md`'s TD-003 entry had a stale
  `2026-10-03` review date surviving alongside a corrected `2026-11-03` one, and its "examined at
  the trigger" note incorrectly claimed the collision risk was narrower after Authentication landed
  — `resolveActor` matches only on `(displayName, kind)`, never on `IdentityLink.providerSubject`,
  so two unrelated identities sharing a display name remain exactly as exposed as before; both
  fixed. `docs/MVP_CHECKLIST.md`'s pilot-blocking gate description overclaimed request-time
  workspace authorization when the actual evidence was membership-based visibility; reworded.
  `docs/engineering/DEVELOPER_ONBOARDING.md`'s invited-user bootstrap step named an admin action
  a real signed-in session cannot perform (session principals never carry the global admin grant);
  corrected to name the dev-header path explicitly.
- **Tests**: 145 API-gateway tests (up from 109 at PR #22's merge) — new coverage for atomic state
  consumption under concurrency, login-attempt retention and cleanup, OIDC discovery timeout/cache/
  dedup/validation (`keycloak-oidc.adapter.test.ts`, new), current-user error mapping
  (`authentication.controller.test.ts`, new), session precedence over the dev header
  (`authorization.guard.test.ts`, new), development-bypass containment for the session-backed
  adapter (`session-backed.adapter.test.ts`, new), the N+1 regression, and trimmed/empty-after-trim
  OIDC configuration (config package, 25 tests, up from 21). All pre-existing tests preserved and
  passing; `test:invariants` 20/20 and `test:adversarial` 30/30 unchanged.
- **The pre-existing `Documentation` CI failure is now fixed, narrowly.**
  `governance/PRODUCT_CONSTITUTION.md` has carried no Owner/Status header since before PR #17,
  recorded each time as a known, deliberately-unfixed gap "this branch has no authority to
  decide" (STATUS.md's PR #20 entry). Per this task's explicit narrow permission, added
  `PRODUCT_CONSTITUTION.md` to `scripts/ci/check-doc-headers.sh`'s existing foundational-document
  exemption list (alongside `README.md`, `LICENSE`, `CODE_OF_CONDUCT.md`) — the same treatment
  those documents already get, not an invented Owner/Status header for a constitution that has
  neither by design.
- **Known limitations, stated plainly**: live Keycloak sign-in remains unverified — a pilot-blocking
  gate, see `KEYCLOAK_INTEGRATION_VERIFICATION.md`. No centralised Casbin policy-engine enforcement
  (Authorisation hardening, still the next capability). TD-002/TD-003 remain open on their existing
  schedules, both due 2026-11-03. Rate-limiting the unauthenticated `GET /api/v1/auth/login`
  endpoint (named alongside the login-attempt-purge finding in the PR #22 review) was not added —
  out of scope for this pass; the purge itself bounds table growth independent of a rate limit.

### 2026-08-03 — Authentication (BUILD_ROADMAP.md Milestone 1.3) delivered, PR open

- **Continuous Product Delivery mode**: verified before starting — `main` at the merged Roles and
  Permission Assignment commit (PR #21), no overlapping open PR, `main` green.
- **Authentication** (Milestone 1.3) delivered as a vertical slice, per the accepted identity
  decision ([ADR-0007](architecture/decisions/ADR-0007-identity-and-access.md)): OIDC
  authorization-code-with-PKCE against Keycloak. `IdentityProviderPort` is the reversal seam;
  `KeycloakOidcAdapter` uses the standard OIDC discovery document rather than Keycloak-specific
  paths, so any spec-compliant provider (Zitadel, Authentik — both named acceptable in ADR-0007)
  can replace it without a domain or API change.
- **No live Keycloak container is available in this sandbox** (no container runtime — `docker ps`
  fails, nested containerization is not permitted here). This is a sandbox limitation on *manual*
  verification, not a technical-impossibility finding against ADR-0007: the real
  `KeycloakOidcAdapter` is built and shipped exactly as specified. A protocol-faithful
  `DevelopmentIdentityProviderAdapter` — the same port, a locally generated RSA keypair, real
  `jose` `SignJWT`/`jwtVerify` calls — lets the full PKCE flow and JWT/JWKS verification be
  genuinely exercised end to end in development and in tests, never a "trust an unverified header"
  shortcut.
- **Identity mapped by verified provider subject, never email as the ongoing key.**
  `IdentityLink.provider` + `.providerSubject` (unique together) is the permanent link; email is a
  one-time bootstrap lookup at first sign-in only. First sign-in activates an account only when it
  is currently `invited` and the provider confirms `email_verified` — never onto an already-active,
  suspended, or deactivated account without an existing link, and never by auto-creating a user.
  Suspended/deactivated denial, and the activation itself, are audited
  (`authentication.denied`, `identity_link.created`, `user.activated`).
- **Session delivery: bearer token, not a cookie.** Chosen because the existing architecture already
  has the browser calling the API cross-origin directly (`main.ts`'s CORS configuration) — a
  cross-origin cookie would need `SameSite=None; Secure`, which doesn't fit local development
  without disproportionate complexity. The token travels once, in the callback URL's fragment
  (`/auth/callback#token=...`, never sent to any server), then lives in `sessionStorage` and is
  sent as `Authorization: Bearer`. The server stores only its SHA-256 hash, never the raw token —
  the same "store the hash, not the secret" treatment as a password.
- **Deliberate, documented authorisation boundary — not full hardening.** A signed-in principal's
  roles are computed by flattening every held `RoleAssignment` into the pre-existing
  `reader`/`contributor`/`reviewer` grant tiers, but the scope-relative `admin` `WitnessRole` never
  maps to the global admin grant through a session
  (`services/api-gateway/src/authz/session-authenticator.ts`) — no session-derived principal can
  reach an admin-gated action. This is the deliberate, fail-closed edge Authorisation hardening
  (the next capability) is expected to resolve; it is not silently assumed solved.
- The pre-existing `X-Witness-Dev-User` dev-header path is untouched and still development-profile-
  only, but a real session now takes priority over it whenever both are present on a request — a
  forged dev header can no longer widen what an authenticated caller may do.
- Web UI: `/signin`, `/auth/callback`, `/auth/error` (plain-language per-reason denial messages);
  the shell header shows **Signed in as `<name>`** / **Sign out** once authenticated (additive to,
  not replacing, the existing "Acting as" role switcher); the dashboard's new **Your access**
  section lists only the organisations and workspaces the signed-in user actually belongs to.
- Health/readiness (`GET /ready`) now performs a real, time-bounded reachability check of the
  identity provider's OIDC discovery document for non-development profiles, replacing the previous
  static `not_configured` label.
- **Tests**: 109 API-gateway tests (up from 60), including 16 tests exercising real cryptographic
  JWT/JWKS verification against the development identity-provider double (tampered signature, wrong
  key, wrong issuer/audience, expired token, nonce mismatch, PKCE mismatch, redirect-URI mismatch,
  replayed/unknown code), 13 covering the full authentication service (first-sign-in activation, no
  duplicate link/user on repeat sign-in or email change, unknown-identity/suspended/deactivated
  denial with audit, single-use state, sign-out revocation), and 11 covering session-to-principal
  resolution including the admin-tier exclusion attack case. 62 domain tests (up from 54). Verified
  against a real local PostgreSQL 16 database, not only service-level fakes: first sign-in, repeat
  sign-in, suspension denial, sign-out invalidation, and a forged-dev-header-alongside-a-real-
  session privilege-escalation attempt (denied), each confirmed against actual database rows,
  through a real browser (Chromium), and via the running API.
- **`docs/MVP_CHECKLIST.md`** — the six Authentication items and the pilot-blocking gate under §B
  Trusted Access marked ready pending merge; per the checklist's own rule, an open PR does not
  count as complete.
- **Known limitations, stated plainly**: no centralised Casbin policy-engine enforcement yet
  (Authorisation hardening is the next capability); live Keycloak sign-in has not been manually
  verified in this environment (no container runtime available); the `X-Witness-Dev-User` header
  remains a separate, unverified development convenience, unchanged by this PR. See the PR for the
  full account.

### 2026-08-03 — Roles and Permission Assignment (BUILD_ROADMAP.md Milestone 1.2) shipped

- **Continuous Product Delivery mode**: verified before starting — `main` at the merged Users and
  Memberships (PR #19) and documentation-baseline (PR #20) commits, no overlapping open PR, `main`
  green. Also restored the pre-existing `Documentation`/aggregate `CI gate` baseline failure in PR
  #20 (markdownlint violations in four documents committed directly to `main` outside the lint-gated
  PR flow) before starting this capability.
- **Roles and Permission Assignment** (Milestone 1.2) shipped: a new, deliberately separate concept
  from membership. Membership (`organisation-membership.ts`/`workspace-membership.ts`) answers "does
  this user belong here"; `packages/domain/src/role.ts` and `role-assignment.ts` answer "what may
  they do here". Six canonical roles — `admin`, `facilitator`, `contributor`, `reviewer`,
  `participant`, `reader` — preserving the existing `reader`/`contributor`/`reviewer`/`admin` names
  from `DevelopmentAuthorizationAdapter` rather than renaming them, and adding `facilitator`/
  `participant` as new. Each role maps to an explicit, least-privilege permitted-actions list
  (`ROLE_PERMISSIONS_BY_ROLE`) in the vocabulary of the one capability that exists today (records) —
  no role inheritance, no hierarchy.
- One role assignment per (user, scope): assigning where none exists creates it, assigning where one
  already exists replaces it (`changeRoleAssignment`), refusing a no-op "change" to the role already
  held (duplicate-assignment prevention). A role assignment can never create membership implicitly —
  it is always resolved from an *existing* membership row, and requires that membership (and, for a
  workspace-scoped assignment, the *parent organisation* membership, re-checked at assignment time
  rather than assumed from the workspace membership having once been valid) to be in good standing.
  Real foreign keys throughout; one `role_assignment` table with mutually-exclusive nullable
  `organisationId`/`workspaceId` columns, a CHECK constraint enforcing that exclusivity, and two
  `@@unique` constraints that give independent "one row per (organisation, user)" and "one row per
  (workspace, user)" using Postgres's NULL-never-equals-NULL semantics rather than a partial index.
- API: `GET /api/v1/roles` (the static catalog); `GET`/`PUT`/`DELETE
  /api/v1/{organisations,workspaces}/{scopeId}/memberships/{membershipId}/role`. All four new
  actions (`role:read`, `role_assignment:{read,write,delete}`) admin-only except `role:read`, which
  is broadly granted — understanding what a role permits is useful to everyone, unlike managing
  assignments. Self-promotion prevention is enforced today only as a corollary of "role-assignment
  management is admin-only, full stop" — there is no real identity yet (Milestone 1.3) for the domain
  to compare "assigner" against "assignee" directly; recorded as a known limitation, not silently
  assumed solved.
- Web UI: a `RoleAssignmentControl` extends the existing membership tables on `/organisations/[id]`
  and `/workspaces/[id]` with a "Role" column — current role (or "No role assigned"), a role picker
  with a plain-language label and description per option, and assign/change/remove actions. No new
  page; no generic administration console.
- Audit: `role_assignment.created`/`.changed`/`.removed`, hash-chained through the existing
  mechanism, same as every other subject type. Verified against a real local PostgreSQL 16 database
  (not just service-level fakes) — all 17 manual-verification steps in the PR, including cross-
  organisation and cross-workspace manipulation attempts (denied `MEMBERSHIP_NOT_FOUND`, matching the
  existing membership-service pattern) and a non-admin dev-header caller's assignment attempt (denied
  `FORBIDDEN`).
- **Tests**: 12 new domain tests (54 total — up from 42), 19 new API-gateway service tests (60
  total — up from 41), 4 new adversarial tests (30 total — up from 26). All existing tests preserved
  and passing.
- **`docs/MVP_CHECKLIST.md`** — the Roles and Authorisation items under §B Trusted Access marked
  ready pending merge; per the checklist's own rule, an open PR does not count as complete.
- **Known limitations, stated plainly**: no production authentication, no Keycloak, no centralised
  Casbin enforcement, current development identity remains temporary (`X-Witness-Dev-User`,
  unverified), no delegated administration beyond the flat admin/non-admin split. See the PR for the
  full account, including the two inherited concurrency risks (audit tail-read race,
  actor-resolution TOCTOU) now formally logged in `docs/engineering/TECH_DEBT.md` rather than only
  mentioned in review threads.

### 2026-08-03 — Baseline markdownlint failures fixed (PR #20)

- The `Documentation` CI check (and the aggregate `CI gate` it feeds) had been red since
  `docs/PRODUCT_ROADMAP.md` was committed directly to `main` outside the lint-gated PR flow —
  flagged and left as an out-of-scope, pre-existing failure on PRs #17, #18, and #19. Fixed here:
  the same root cause (documents committed straight to `main`) also broke `BUILD_ROADMAP.md`,
  `MVP_CHECKLIST.md`, and `governance/PRODUCT_CONSTITUTION.md`, so all four were corrected with the
  same mechanical, meaning-preserving treatment — collapsed multiple blank lines, escaped periods on
  plain-text numbered section headings CommonMark was mis-parsing as ordered-list continuations,
  word-wrapped over-length lines, bolded existing Owner/Status header fields. Verified with a
  word-boundary diff against `origin/main`: the only content-level change anywhere is 29 escaped
  periods — everything else is whitespace/line-wrap only.
- `governance/PRODUCT_CONSTITUTION.md` still has no Owner/Status metadata at all (not just
  unbolded); left as a known, deliberately unfixed gap rather than inventing governance metadata
  this branch has no authority to decide.

### 2026-08-03 — Users and Memberships (BUILD_ROADMAP.md Milestone 1.1) shipped

- **Continuous Product Delivery mode**: `docs/BUILD_ROADMAP.md` was restructured around milestones
  toward a usable MVP (`docs/PRODUCT_ROADMAP.md` and `docs/MVP_CHECKLIST.md` also added); Organisations
  and Workspaces (Release 0.2 items 1–2, PRs #17/#18) are the completed baseline this milestone builds
  on. Verified before starting: `main` green (lint, typecheck, test, build, `test:invariants` 20/20,
  `test:adversarial` 23/23), no overlapping open PR.
- **Users and Memberships** (Milestone 1.1) shipped: user registration
  (`packages/domain/src/user.ts`, email normalised and deduplicated), a shared membership state
  machine (`packages/domain/src/membership.ts`: `invited → active ⇄ suspended`, `revoked` terminal)
  reused by both `organisation-membership.ts` and `workspace-membership.ts`. A workspace membership
  cannot be created without an *organisation* membership in good standing for that workspace's
  specific parent organisation — enforced in the domain from a state the service reads and passes in,
  which is what stops standing in one organisation being used to justify workspace access under
  another. Real foreign keys and unique constraints throughout (`witness_user`,
  `organisation_membership`, `workspace_membership` — no polymorphic references, unlike `AuditEvent`,
  because none of these relationships are genuinely polymorphic). All five new mutations
  (`user.created`, `organisation_membership.created`/`.state_changed`,
  `workspace_membership.created`/`.state_changed`) are hash-chained through the existing audit
  mechanism. Every new action (`user:read`/`:create`, `organisation_membership:*`,
  `workspace_membership:*`) is admin-only — this capability is explicitly administrative
  (`BUILD_ROADMAP.md`: "an organisation administrator needs to..."), so reader/contributor/reviewer
  get none of it, not even read.
- Web UI: `/users` + `/users/new`, and membership management added to `/organisations/[id]` and
  `/workspaces/[id]` (add member, activate/suspend/revoke, all server-computed `permittedActions`
  the same way `RecordDetail` already works). No page claims an invitation email was sent — Witness
  does not deliver email yet, and every "invited" label says so.
- **Tests**: 42 domain tests (up from 29 — user/membership creation, email normalisation,
  transition rules, cross-organisation and cross-workspace rejection), 40 API-gateway tests (up from
  20 — three new service test files against an in-memory Prisma double, since no live Postgres was
  available in this environment; see "Known limitations" in PR for what that does and doesn't cover),
  `test:invariants` 20/20 unchanged, `test:adversarial` 26/26 (up from 23 — administrator-permitted,
  reviewer-denied and invented-role-denied cases for every new action).
- **`docs/MVP_CHECKLIST.md`** — the seven Users and Memberships items under §B Trusted Access marked
  ready pending merge (user domain model, organisation membership, workspace membership, admin can
  add a user, duplicate membership prevented, membership changes audited, user list and membership
  state visible in UI) — per the checklist's own rule that an open PR does not count as complete, they
  read READY rather than DONE until this merges. Roles/Authentication items in the same section remain
  unchecked — out of scope for this PR.

### 2026-08-03 — Workspaces (BUILD_ROADMAP.md Release 0.2, item 2) shipped

- **Product Delivery Execution Mode**: continuing directly from the merged Organisations PR (#17),
  per the standing instruction to select the next incomplete `BUILD_ROADMAP.md` capability, implement
  it as one vertical slice, open one PR, and stop.
- **Workspaces** shipped: `packages/domain/src/workspace.ts` (`createWorkspace`, with domain unit
  tests — the previous PR shipped `createOrganisation` without any, a gap not backfilled here to keep
  this PR scoped to workspaces), a real foreign-key `workspace` table (unlike `AuditEvent`'s
  necessarily-polymorphic association, a workspace always belongs to exactly one organisation, so
  referential integrity is enforced by Postgres, not the application layer), contracts, an
  authorised `WorkspacesController`/`WorkspacesService` that 404s creation against a
  non-existent `organisationId`, and `/workspaces` + `/workspaces/new` in the web app (the create
  form lists organisations to choose from, since a workspace cannot exist without one). `admin` gains
  `workspace:create`; all four roles get `workspace:read`, matching the least-privilege shape already
  established for organisations.
- All checks green: lint, typecheck, build, full test suite (29 domain tests, up from 26), `pnpm
  test:invariants` (20/20), `pnpm test:adversarial` (23/23, one new "reviewer cannot create a
  workspace" case). As with Organisations, no live Postgres was available in this environment — the
  migration is schema-validated but not executed against a real database.
- **Open discrepancies from the previous PR remain unresolved** (not this capability's job to fix):
  ADR-0022 still does not exist; `Tenant` vs `Organisation` naming is still split between
  `DATA_MODEL.md` and `ARCHITECTURE.md`.

### 2026-08-03 — Implementation authorised; Organisations (BUILD_ROADMAP.md Release 0.2, item 1) shipped

- **`docs/BUILD_AUTHORIZATION.md`, `docs/BUILD_ROADMAP.md` and `docs/governance/PRODUCT_CONSTITUTION.md`
  added to `main`** (direct commits, Founder-approved). `BUILD_AUTHORIZATION.md` declares the
  planning phase complete and implementation authorised; outstanding Phase 1 deliverables (1.3–1.5,
  1.8) continue in parallel and do not block. This entry records two open discrepancies rather than
  silently resolving them: **ADR-0022**, cited by the authorising instruction, does not exist in
  `architecture/decisions/` (ADR-0000–0021 do); and the instruction to "use ROADMAP.md" is read here
  as `docs/BUILD_ROADMAP.md` — the only document with a concrete, ordered capability list — rather
  than the pre-existing root `ROADMAP.md`, which has none.
- **Organisations** (`BUILD_ROADMAP.md` Release 0.2, item 1 — the first item on the new roadmap with
  nothing yet built) shipped as a full vertical slice: `packages/domain/src/organisation.ts`
  (`createOrganisation`), a `subject_type`/`subject_id` migration generalising the audit hash-chain
  from record-only to polymorphic (so the same tamper-evident mechanism serves any future aggregate,
  not just `Record`), contracts, an authorised `OrganisationsController`/`OrganisationsService`, and
  `/organisations` + `/organisations/new` in the web app. A new `admin` role gates
  `organisation:create` under least privilege — `reader`/`contributor`/`reviewer` get
  `organisation:read` only. `make verify`-equivalent (format, lint, typecheck, test, build) and
  `test:invariants` / `test:adversarial` all pass; no database was available to run the migration
  live, so it is unexecuted-but-reviewed pending a real Postgres instance.

### 2026-08-02 — Sign-off status reconciled; Phase 1 deliverable 1.2 (domain model) drafted

- **Sign-off reconciled for 1.1, 1.7, 1.9, 1.10.** All four are merged to `main`; none has a
  recorded human department review. Trackers corrected from stale "PR open" / unqualified "merged"
  text to `MERGED — SIGN-OFF REQUIRED`, naming the exact reviewers each needs. CodeRabbit posted
  automated findings on PR #12 (1.9, 2 nitpicks) and PR #15 (1.7, 7 findings — landed after merge,
  a race between the human merge and the review finishing); neither is human sign-off, both are
  recorded as outstanding rather than silently dropped.
- **D-10 recorded**: whether a deliverable's formal sign-off (not merge) is required before a
  *dependent* deliverable may start. Interim reading — no, only phase-gate closure requires it —
  already acted on to start 1.2, since `DEPARTMENT_ASSIGNMENTS.md`'s own dependency column and
  status (`⚪ available`, not `⛔ gated`) already reflected that reading before this decision made it
  explicit.
- **`architecture/domains/DOMAIN_MODEL.md`** (deliverable 1.2) elaborates all twelve bounded
  contexts from `ARCHITECTURE.md` §3 and `DATA_MODEL.md` §2 to the depth
  `DEPARTMENT_ASSIGNMENTS.md`'s acceptance gate requires, and maps every context against actual
  0.1.0 code. Finding: no undocumented drift — every gap between the model and shipped code already
  traces to a dated decision (a schema comment, a roadmap sequence item, a threat-model entry).

### 2026-08-02 — Persistent multi-agent organisation established; Delivery Wave 1 launched

- **Organisational control plane** established in `docs/engineering/organisation/` — agent
  registry, work-package register, delivery-wave model, review and escalation matrices, agent
  communication and memory policies. Extends existing canonical documents (`DEPARTMENTS.md`,
  `DEPARTMENT_ASSIGNMENTS.md`, `AGENT_HANDOFF_PROTOCOL.md`) rather than duplicating them.
- **D-9 recorded**: `BRANCH_STRATEGY.md` (ADR-0015) describes a `develop`/domain-branch model that
  has never actually been used — every merged PR to date branched from and targeted `main` directly.
- **Stacked PRs now prohibited by default** in `PULL_REQUEST_WORKFLOW.md`, after this session found
  that PR #11's own documented retarget plan was not followed when PR #10 remained open.
- **Delivery Wave 1** launched: two independently-owned Phase 1 work packages, each on its own
  branch from `main`, neither stacked on the other — `architecture/views/COMPONENT_VIEWS.md`
  (deliverable 1.1, D2) and the threat model/PIA completion (deliverable 1.7, D6).

### 2026-08-02 — Phase 1 deliverable 1.7 (threat model & PIA) drafted

- **`docs/research/THREAT_MODEL.md`** created — `SECURITY_ARCHITECTURE.md` §10 has referenced this
  file as "in progress" since Phase 0; it did not exist. Expands the existing ten-threat STRIDE
  summary to full detail (asset, attack vector, mitigation — built or planned — verification,
  residual risk) and adds the Privacy Impact Assessment `DEPARTMENT_ASSIGNMENTS.md` bundles into the
  same deliverable.
- Two new risks found during the pass, added to `docs/governance/RISK_REGISTER.md`'s Top risks
  table: **R-17** (erasure incomplete in backup after a right-to-erasure request) and **R-18**
  (re-identification via entity resolution merging a pseudonymous subject with a named entity).
- **Not self-certified.** Marked 🟡 drafted, pending Security Lead (second reviewer) and QA Lead
  (PIA) sign-off.

### 2026-08-02 — PR #10 and PR #11 merged; Phase 1 deliverable 1.9 (Accessibility & i18n) drafted

- **PR #10** (Developer Preview reconciliation) and **PR #11** (deliverable 1.10, merged into PR #10's
  branch before PR #10 merged) both landed on `main`. Verified by ancestor check, not assumed: both
  commits are ancestors of `main`, and every Developer Preview path
  (`packages/domain`, `packages/config`, `packages/contracts`, `services/api-gateway`, `apps/web`,
  `pnpm-lock.yaml`, the Prisma schema/migration/seed, ADR-0021, the department docs) is present.
- **Canonical `main` re-verified from a clean checkout**: `make verify` (format, lint, typecheck,
  test, build), `pnpm test:invariants` (20/20), `pnpm test:adversarial` (21/21), all governance and
  security gates, `make migrate` and `make seed` against PostgreSQL 16, and the application run
  end-to-end — capture, submit, confirm, hash-chained audit trail, 401/403 authorisation boundary —
  all through the running API, not just static checks.
- **`docs/product/ACCESSIBILITY_I18N_STRATEGY.md`** (deliverable 1.9) consolidates the WCAG 2.2 AA
  merge-gate, RTL and low-bandwidth requirements already decided in `PROJECT_CONTEXT.md` P8 and
  ADR-0020, and explicitly gates five not-yet-decided objectives (audit tooling, first-supported
  languages, i18n infrastructure, external audit timing, per-language extraction quality) with an
  owner and phase gate.
- **1.10's tracker rows corrected** — they still read "PR open" after PR #11 merged; now read
  "merged to main, pending Principal Architect + CTO sign-off," since a human merging a PR is not the
  same as the named department completing its review.

### 2026-08-02 — Phase 1 deliverable 1.10 (NFRs & SLOs) drafted

- **[`architecture/NFR_SLO.md`](architecture/NFR_SLO.md)** consolidates the latency, throughput,
  availability and recovery objectives already decided piecemeal in `DEPLOYMENT_ARCHITECTURE.md`,
  `CI_CD.md` and the risk register, and explicitly gates six not-yet-decided objectives (API latency,
  write throughput, review queue throughput, projection rebuild time, extraction latency, concurrent
  capacity at scale) with an owning department and the phase gate that must produce each number.
- Chosen from the Phase 1 backlog because it was the only deliverable that was simultaneously
  unblocked (no dependencies), assignable to a single department (D2), and directly named on the
  critical path to the Phase 2 exit gate in `docs/engineering/PHASE_EXECUTION_PLAN.md`.
- **Not self-certified.** Marked 🟡 drafted, pending Principal Architect and CTO review — the exit
  gate for 1.10 is verified by the named department, not the implementer.

### 2026-08-02 — Developer Preview reconciled into main

- **The Developer Preview was not on `main`.** PR #1 merged the architecture branch into `main` at
  03:07:08; PR #2 merged the preview into that same branch at 03:07:53 — 45 seconds after it had
  already been merged away. All 84 files were stranded on `f1dce48`. This was a consequence of the
  stacked-PR structure: PR #2 could only reach `main` through PR #1's branch, and merging #1 first
  closed that path.
- **Reconciled** on `reconcile/developer-preview-to-main`, branched from current `main` and merged
  with `f1dce48`. No Git conflicts.
- **Preserved from `main`:** the CodeQL action bump to v4.37.4 (a security update — `f1dce48` had
  only reformatted a comment in that file), the Dependabot markdownlint bump (which matched the
  branch's value exactly), and all ten files added to `main` independently.
- **Applied from the branch:** the full Developer Preview, and the ADR-0021 deletions that had
  never landed — including `memory/changelog.md`, the fictional implementation history.
- **Reconciled structures:** five agent personas, three prompt templates, an alternative operating
  model and one task file. Nothing deleted. Recorded in
  [`AGENT_STRUCTURE_RECONCILIATION.md`](docs/engineering/AGENT_STRUCTURE_RECONCILIATION.md), with
  D-7 and D-8 raised for the owner.
- **`tasks/task-001-authentication.md` gated** as PHASE 2 / GATED / NOT STARTED. It specified JWT
  login with password hashing, which would make Witness its own identity provider — the option
  ADR-0007 considered and rejected. No authentication code was written.

### 2026-08-01 — Developer Preview 0.1.0

- **D-6 resolved** ([ADR-0021](architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md)).
  `VISION.md` is the canonical product definition; ADR-0000–0020 are the canonical architecture. Four
  overlapping documents from `main` superseded, their content preserved in the ADR appendix.
  `memory/changelog.md` removed — it recorded five modules as built, none of which existed.
- **Repository foundation repaired.** Seven referenced-but-missing scripts and compose files created
  and verified. Two defects fixed that would have hit every new contributor's first `make dev`:
  `.env.example` was missing a mandatory variable, and Compose never loaded the root `.env` at all.
- **Toolchain activated.** Lockfile committed; the dormant CI code gates (build, test, lint,
  invariants) now run for real.
- **Developer Preview shipped.** `packages/domain` (pure), `packages/config` (profile enforcement),
  `packages/contracts` (Apache-2.0), `services/api-gateway` (NestJS + Prisma), `apps/web` (Next.js).
  110 tests across six suites.
- **Department model established.** Ten departments with ownership and prohibited actions; phase
  execution plan; assignment board; agent handoff protocol; verified developer onboarding.
- **D-1 structurally resolved.** Apache-2.0 boundary documented and enforced; one written
  affirmation from the copyright holder remains outstanding.

**Verified, not assumed:** migrations applied against PostgreSQL 16, fixtures seeded, records created
through the browser, review transitions performed, provenance and audit trail rendered, zero console
errors. Tamper detection confirmed by altering an audit row directly in the database and watching the
chain fail — then restoring it and watching it pass.

### 2026-07-31 — Foundation established

- Repository scaffolded to the full enterprise structure.
- Complete documentation baseline: context, vision, mission, roadmap, governance, engineering
  operating model, product operating model, all process documents.
- ADRs 0000–0020 drafted; core architectural stance recorded and open to challenge.
- 19 role charters defined in [`agents/`](agents/), with explicit authority boundaries.
- Branch strategy defined for 30 long-lived branches with owners and merge rules.
- CI/CD, security review and AI development workflow established.
- OSS evaluation dossier produced for the full core stack, with an exit strategy per dependency.
- Governance framework: consent, digital sovereignty, Indigenous data sovereignty, risk register.
- CODEOWNERS mapping every path to an owning role; no path is unowned.
- **Executable governance gates** in `scripts/ci` and `scripts/security`, wired into CI: link
  integrity, document ownership, ADR completeness, CODEOWNERS coverage, action pinning, branch
  divergence, licence boundary, and static zero-egress verification. All pass on this commit.

**Known gaps, stated plainly:**

- The *runtime* half of zero-egress verification activates with the Phase 2 stack. Only the static
  half runs today.
- Deployment, admin, user and API guides describe the **target** experience, not a shipped one. They
  are published early so operators can tell us they are wrong before we build them.
- Personas are hypotheses from desk research, not findings from interviews (Phase 1 research).
- ADR-0019 (Indigenous data sovereignty) carries a **hard external review gate** before Phase 4.
  Nothing in that area should be implemented until it is met.

---

## Open decisions needing resolution

| # | Decision | Owner | Needed by | Notes |
|---|---|---|---|---|
| D-1 | Confirm SDK/contracts permissive licensing with copyright holders | Open Source Lead | Phase 2 | 🟡 **Structurally resolved; one human action outstanding.** The full Apache-2.0 boundary is implemented, documented in [`docs/governance/LICENSING.md`](docs/governance/LICENSING.md) and mechanically enforced by `check-licenses.sh`. Attribution uses the collective placeholder "The Witness Contributors" rather than an invented legal entity. **Remaining:** the copyright holder must affirm the boundary in writing — see LICENSING.md §D-1 for the exact three-step action. No software change can complete this |
| D-2 | Event transport: NATS JetStream vs Postgres-only for small deployments | Backend Lead | Phase 3 | ADR-0005 proposes profile-based; needs load evidence |
| D-3 | ASR engine: faster-whisper vs whisper.cpp vs WhisperX composition | AI Lead | Phase 5 | Blocked on benchmark against target languages |
| D-4 | Graph store: confirm Neo4j Community vs Apache AGE for constrained deployments | Knowledge Graph Lead | Phase 4 | Licensing/footprint trade-off, ADR-0004 |
| D-5 | Foundation host for long-term stewardship | Founder | Phase 8 | Candidates under consideration |
| D-7 | Agent persona layer: adopt subordinate, fold into charters, or replace charters | CTO & Product Director | Before Phase 2 | `main` gained five execution personas (`agents/architect.md` etc.) alongside the 19 role charters. They are different artefacts — personas describe behaviour, charters describe authority — and both are retained with the personas explicitly subordinate. Whether that is the end state is a governance call. See [`AGENT_STRUCTURE_RECONCILIATION.md`](docs/engineering/AGENT_STRUCTURE_RECONCILIATION.md) §8 |
| D-8 | `engineering/README.md`: build the layout it describes, rewrite it, or deprecate it | CTO | Before Phase 2 | It directs agents to `engineering/vision/`, `engineering/standards/` and four other paths that do not exist. Retained with a banner; an agent following it literally fails at step one |
| D-9 | `docs/engineering/BRANCH_STRATEGY.md` (ADR-0015) describes `main → develop → domain → working`; no `develop` branch has ever existed and every merged PR (#10, #11, #12) branched from and targeted `main` directly | CTO & Release Manager | Before the next delivery wave scales past two parallel agents | Recorded in [`docs/governance/DECISIONS.md`](docs/governance/DECISIONS.md) and [`docs/engineering/organisation/00-INDEX.md`](docs/engineering/organisation/00-INDEX.md). Until resolved, the organisational control plane follows the actually-practiced direct-to-`main` model, not ADR-0015 |
| D-10 | Does a Phase 1 deliverable need its formal department sign-off (not just a merge) before a *dependent* deliverable can start — e.g. must 1.1 be signed off before 1.2 begins? | CTO & Principal Architect | Confirm before Phase 1 exit | **Interim reading, already acted on:** no. `DEPARTMENT_ASSIGNMENTS.md`'s Dependencies column names the prior deliverable (`1.1`), not its sign-off state, and 1.2's own row already read `⚪ available` rather than `⛔ gated` once 1.1 merged. The phase-level exit gate (`PHASE_EXECUTION_PLAN.md`: "verified by the named department, not self-certified") still requires every deliverable's sign-off before *Phase 1* closes — this decision is narrower, about starting dependent *work*, not about closing the *phase* |
| D-6 | Product and architecture reconciliation | CTO & Founder | **Phase 1 — resolved 2026-08-01** | ✅ **Resolved** by [ADR-0021](architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md). `VISION.md` is canonical product scope; ADR-0000–0020 are the canonical architecture. `docs/vision.md`, `docs/architecture.md`, `docs/coding-standards.md` and `memory/decisions.md` are superseded; `memory/changelog.md` (fictional implementation history) removed. Sector material preserved as explicitly non-canonical in [`docs/product/SECTOR_APPLICATIONS.md`](docs/product/SECTOR_APPLICATIONS.md). **Reversible via a superseding ADR if the multi-sector framing reflects a stakeholder commitment the engineering organisation is not party to** |

---

## What we are deliberately not doing right now

- AI extraction, transcription, or anything that produces a candidate assertion (Phase 5)
- The knowledge graph projection (Phase 4)
- The consent service (Phase 3) — and therefore not enforcing P2 yet
- Real authentication (Phase 2) — the preview's authorisation boundary is real; its authentication
  is deliberately absent rather than faked
- Building a docs website (content first, presentation later)
- Any live-transcription work (deferred, see roadmap)
- Any cloud-hosted multi-tenant offering (contradicts sovereignty default)
