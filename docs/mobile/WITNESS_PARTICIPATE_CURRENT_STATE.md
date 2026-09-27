# Witness Participate — current-state audit

**Owner:** Engineering (Mobile release programme)
**Status:** Active — Phase 0 audit, produced before any mobile-runtime code was written

This is a Phase 0 repository audit, not a design document. Every assertion below is checked against
the actual repository at commit `33545e5` (branch `feat/mobile/witness-participate`, forked from
`phase6/customer-learning`) — file paths and line-level facts are cited so a reviewer can verify each
one independently. Where something could not be verified from the repository, it is marked so
explicitly rather than assumed.

## Classification key

| Label | Meaning |
|---|---|
| **IMPLEMENTED** | Exists, working, and verified by at least one automated test or a direct repository read. |
| **PARTIALLY IMPLEMENTED** | Real, working code exists but does not cover the full participant journey requested. |
| **MISSING** | No code exists for this yet. |
| **BLOCKED** | Cannot proceed without something outside this repository (credentials, accounts, physical hardware). |
| **NOT REQUIRED FOR V1** | Explicitly out of scope per the product boundary (§3 of the governing instruction). |

---

## 1. Existing mobile tooling — search result

**MISSING.** A repository-wide search found:

- No Capacitor (`grep -r capacitor` across the tree: zero hits; no `capacitor.config.*`).
- No Expo / React Native (`package.json` search for `"expo"`/`"react-native"` dependencies: zero
  real hits — the only string matches were `"exports"` field names, a false positive).
- No `.xcodeproj`/`.xcworkspace`, no `build.gradle`/`AndroidManifest.xml` anywhere in the tree.
- No `apple-app-site-association` or `assetlinks.json` (universal links / Android App Links).
- No deep-link parsing code anywhere in `apps/web/src`.

**IMPLEMENTED (PWA only):**

- `apps/web/src/app/manifest.ts` — a populated Next.js `MetadataRoute.Manifest` (name, icons,
  `start_url`/`scope`, `display: 'standalone'`, Brand Book theme/background colors).
- `apps/web/public/sw.js` — a real, narrowly-scoped service worker (cache-first, same-origin,
  `/_next/static/` GET assets only, versioned cache; never touches cross-origin or
  cookie-authenticated requests).
- `apps/web/src/components/service-worker.tsx` registers it, skipped in the development profile.

**Conclusion:** there is nothing to duplicate. Any native shell is a genuinely new addition, not a
parallel to an existing one. This matches ADR-0030's own audit finding from 2026-09-26 (see §11
below) — nothing has changed on this front since.

## 2. Participant backend — session-join

**File:** `services/api-gateway/src/session-join/session-join.service.ts` /
`session-join.controller.ts`, domain: `packages/domain/src/session-join-link.ts`.

**IMPLEMENTED:**

- `GET /api/v1/session-join/:token` — unauthenticated context lookup (session title, facilitator
  display name, governance mode, status, `expiresAt`, `requiresSignIn`, `requiresDisplayName`). Live
  test: `session-join.live.test.ts` (14 tests).
- `POST /api/v1/session-join/:token/join` — creates a `SessionParticipant` + `ParticipantCaptureToken`
  in one transaction, guarded by a Postgres advisory lock (`pg_advisory_xact_lock`) so a doubled
  request under retry can never create two participants for the same `clientRequestId` (idempotent
  replay: `session-join.service.ts:267-283`).
- Four governance modes (`SESSION_JOIN_GOVERNANCE_MODES`, `packages/domain/src/session-join-link.ts:59`):
  `invited_only`, `verified_guest`, `pseudonymous`, `anonymous`. `governanceMode` is read from the
  persisted `SessionJoinLink` row only, never from anything the joining client supplies — a governance
  mode cannot be tampered with by crafting a request.
- Join-link burst rate limit: 30 joins per 60-second window per link
  (`JOIN_RATE_LIMIT_MAX_PER_WINDOW`/`JOIN_RATE_LIMIT_WINDOW_MS`, `session-join.service.ts:80-81`,
  enforced in `assertRateLimitOk`). This is a burst guard on the join link specifically, **not** a
  general per-IP/per-device API rate limiter — see §9 (security boundary) for what this does and does
  not protect against.
- Token discipline: only `tokenHash` (SHA-256) is ever persisted for both the join link and the
  resulting capture token; the raw token exists only in the URL/QR image and the client's own storage
  (`session-join.service.ts`'s `newToken()`, mirrors `WorkspaceInvitation`'s discipline).

**PARTIALLY IMPLEMENTED:**

- ~~A join link recovered from an expired state produces a raw `InvariantViolation` surfaced as an
  unhandled `500`~~ — reproduced live during this audit (`POST .../join` against an expired link on
  2026-09-27, see `packages/domain/src/session-join-link.ts:256`, `assertSessionJoinLinkUsable`), then
  **fixed the same day**: `SessionJoinController.join` now wraps the service call in the same
  `translateDomainErrors` pattern `participant-capture.controller.ts` already uses for the identical
  class of bug (MOBILE-002). 3 new tests (`session-join.controller.test.ts`); full gateway (785/785)
  and live (23/23 for this module) suites re-run clean.

## 3. Participant backend — participant-capture

**File:** `services/api-gateway/src/session-join/participant-capture.controller.ts` /
`.service.ts`.

**IMPLEMENTED**, all gated on `X-Witness-Capture-Token`, never `X-Witness-Dev-User` or a cookie
session:

| Route | Method | Purpose |
|---|---|---|
| `/api/v1/participant-capture/me` | GET | Context: session title, facilitator, identity mode, consent status summary, required categories |
| `/api/v1/participant-capture/consent` | POST | Record the participant's own consent decisions |
| `/api/v1/participant-capture/evidence` | POST | Capture text/audio-note evidence, idempotent on `clientRequestId` |
| `/api/v1/participant-capture/evidence/:evidenceId/attachment` | POST | Attach a file (multipart) to evidence this same token created |
| `/api/v1/participant-capture/feedback` | POST | Post-session product feedback (Track B) |
| `/api/v1/participant-capture/feedback/:feedbackId/testimonial-consent` | POST | Opt in/out of a public testimonial |
| `/api/v1/participant-capture/prompt` | GET | The session's current facilitator prompt (Track E) |
| `/api/v1/participant-capture/insights` | GET | Participant-safe "what we're hearing" featured-insight list (Track E) |
| `/api/v1/participant-capture/insights/:insightId/response` | POST | Governed community-validation response (Track E) |

Live-tested end to end in `participant-capture.live.test.ts` (9 tests) and
`session-featured-insights.live.test.ts` (12 tests): consent-gates-capture (never assumed from
joining), token expiry/revocation/withdrawal rejection, idempotent retry (same `clientRequestId`
never creates a second `Evidence` row — DB-enforced via `@@unique([sessionId, clientRequestId])`),
cross-participant forgery rejection (one token cannot attach a file to another participant's
evidence), and the governed insight-response path never mutating the canonical `KnowledgeAssertion`
it responds to.

**PARTIALLY IMPLEMENTED — attachment kinds vs. UI:**

- The domain/contract layer supports three attachment kinds (`ATTACHMENT_KINDS` =
  `['audio', 'document', 'image']`, `packages/domain/src/evidence-attachment.ts:37`) and the API
  endpoint accepts any of them.
- The current participant web page (`apps/web/src/app/capture/[sessionId]/page.tsx`) only exercises
  the **audio** path — there is no photo/document `<input type="file">` or camera capture anywhere in
  that file (verified by direct search: zero matches). Photo/document capture is therefore a backend
  capability with **no existing participant client to reuse** — item 10 of the product boundary
  ("attach permitted evidence if the existing supported participant contract safely allows this")
  is contract-level yes, UI-level not-yet-built.
- Plain **text** evidence submission (distinct from an audio note's placeholder text) also has no
  dedicated UI path today — the web page always submits `evidenceType: 'audio_note'`. A text-only
  contribution is a real gap against product-boundary item 8.

## 4. Participant consent

**Files:** `packages/domain/src/consent-template.ts`, `consent-decision.ts`,
`participant-consent-record.ts`; `services/api-gateway/src/participant-consent-records/`.

**IMPLEMENTED:**

- 17 well-known consent categories (`CONSENT_CATEGORIES`, `consent-template.ts:49`), of which a
  session's `SessionConsentConfiguration` declares which are required/optional for it — never
  invented client-side.
- `requiredConsentCategoryForCapture` (`packages/domain/src/evidence.ts`) unconditionally requires a
  quotation category (`attributed_quotation`/`anonymous_quotation`, chosen by identity mode) for any
  non-sourceless evidence capture, regardless of what the template marks optional.
- `evidence_submission` and `audio_recording` are enforced as **distinct** categories —
  `evidence-attachment.service.ts` asks `ConsentPolicyService.mayRecordAudio` for an audio attachment
  and `maySubmitEvidence` for document/image, and `evidence_submission` alone does not authorise audio
  capture. This exact boundary was the root cause of MOBILE-002 (a test-fixture gap, not a governance
  gap) and is now fixture-verified correct.
- Consent is captured once per participant per session via `POST
  /api/v1/participant-capture/consent`; capture is gated on it (never assumed from joining alone) —
  proven in `participant-capture.live.test.ts`'s first test, explicitly named as a threat case.
- No withdrawal endpoint exists on the participant-capture surface itself (a facilitator-side
  `participant-consent-records` withdrawal path exists for authenticated staff use, not for the
  participant's own token) — **product-boundary item 16's "withdraw where supported" therefore
  currently means "not supported for a participant acting on their own token," which must be stated
  plainly in the mobile consent UI, not implied.**

## 5. Audio recording

**File:** `apps/web/src/components/audio-recorder.tsx`.

**IMPLEMENTED:** `MediaRecorder`-based capture with a codec fallback chain
(`pickRecordingMimeType`): WebM/Opus → WebM → Ogg/Opus → MP4/AAC. iOS Safari supports none of the
first three, so a real iPhone falls through to the last candidate — this is standards-based, expected
behaviour.

**NOT VERIFIED (repeating ADR-0030's own finding, unchanged since):** zero automated test file
references `audio-recorder.tsx` anywhere in the repository (confirmed by search — no
`audio-recorder.test.ts`/`.test.tsx` exists). The only verification of this component's real-world
behaviour is the physical-device rows in `docs/testing/MOBILE_ACCEPTANCE.md`, most of which remain
**blank** (see §10). This is the single largest source of real technical risk in the entire mobile
programme — a native shell around a `MediaRecorder` call inherits exactly this same unverified
surface unless the chosen runtime replaces it with a native recording API.

## 6. Offline queue

**File:** `apps/web/src/lib/offline-queue.ts`.

**IMPLEMENTED:** IndexedDB-backed (not `localStorage` — deliberate, for `Blob` storage), survives a
browser restart, flushes on mount and on the `online` event, has a manual "Retry now" action. Backed
by the same DB-enforced idempotency guarantee as direct submission
(`@@unique([sessionId, clientRequestId])`). `enqueue()`'s own failure path (IndexedDB
quota-exceeded/unavailable) is caught and surfaced as a clear message rather than an unhandled
rejection (fixed under ADR-0030).

**NOT VERIFIED:** same as audio — zero test file references `offline-queue.ts`. No test exercises
airplane-mode/mobile-data-change/API-timeout/429/token-expiry-mid-flight scenarios; these exist only
as rows in `MOBILE_ACCEPTANCE.md`, not as automated coverage.

## 7. API client

**File:** `apps/web/src/lib/api.ts` (participant-relevant methods around lines 861-950 and
1097-1130).

**IMPLEMENTED:** every participant-capture call is a direct browser `fetch()` to
`NEXT_PUBLIC_WITNESS_API_URL` — there is **no server-side proxy layer** between the browser and the
API (confirmed: `request()`, `apps/web/src/lib/api.ts:265`, is called from client components only).
`authHeaders()` (`api.ts:223`) attaches `X-Witness-Dev-User` only when a facilitator `ActingUser` is
passed and the build is a development build; every participant-capture call passes `user: null` and
therefore never sends that header — participant traffic and the unverified dev-header mechanism are
structurally disjoint paths already, independent of the LAN-containment fix in commit `33545e5`.

**Relevant for the mobile-runtime decision (§ Architecture Decision below):** this client is plain
`fetch`+JSON, contract-typed against `@witness/contracts`, with no DOM/browser-only API dependency
beyond `fetch`, `FormData`, and `Blob` — all of which have direct native-runtime equivalents.

## 8. Governance modes in mobile terms

| Mode | Sign-in required | Identity shown to facilitator | Consent still required | Mobile implication |
|---|---|---|---|---|
| `anonymous` | No | No display name at all | Yes | Fully supported by capture-token flow; the primary mobile path. |
| `pseudonymous` | No | A chosen display name, no account | Yes | Same as anonymous, plus a name-entry step (`requiresDisplayName`). |
| `verified_guest` | Yes (real OIDC) | Real identity | Yes | Requires completing sign-in — see §11's OIDC `returnTo` note; mobile must round-trip through the system browser (`ASWebAuthenticationSession`/Chrome Custom Tabs), not an embedded webview, per both platforms' store policies for OAuth. |
| `invited_only` | Yes (real OIDC, pre-provisioned) | Real identity | Yes | Same as `verified_guest`, plus the invitee must already exist as a `User` row. |

**No new identity system is required or recommended.** `verified_guest`/`invited_only` already use
real OIDC (Keycloak in production; the development identity-provider double only in the `development`
profile, itself now loopback-only per commit `33545e5`) — a native shell reuses this via the
system-browser OAuth pattern, not a rewritten auth stack.

## 9. Authorization boundary (the security invariant this programme depends on)

**IMPLEMENTED and now hardened** (commit `33545e5`, this session):

- `X-Witness-Dev-User` is read only by `AuthorizationGuard`
  (`services/api-gateway/src/authz/authorization.guard.ts:114`) — never by
  `ParticipantCaptureController` or `SessionJoinController`, which use `X-Witness-Capture-Token`
  exclusively. A capture token is therefore **structurally incapable** of reaching any
  `@Requires(...)`-guarded facilitator/admin/billing/platform route: that guard doesn't recognise the
  header at all, so such a request resolves to `401 UNAUTHENTICATED`, proven live during the previous
  session (`curl` from a genuine non-loopback address, documented in
  `docs/testing/LIVE_WORKSHOP_ACCEPTANCE_RUNBOOK.md`).
- As of `33545e5`, a dev-header-resolved principal (the unverified local-iteration mechanism) is
  additionally refused on every guarded route from anywhere but loopback —
  `401 DEVELOPMENT_ACCESS_LOCAL_ONLY` — closing the LAN-exposure gap found during physical testing.
  This is a **development-profile-only** concern; it does not describe production's security model.
- **Production's actual mobile security model does not yet exist as a tested artifact.** Everything
  above proves the *development* profile's boundary. §9 of the governing instruction (participant →
  admin/facilitator/billing/organisation/platform/another-session/another-tenant, expired/revoked/
  malformed/modified token, replay, duplicate submission) needs its own test suite run against
  production-equivalent (`sovereign`/`hybrid`) configuration, most of which already exists as
  live-Postgres tests (cross-participant forgery, expiry, revocation — see §3) but has never been
  assembled into one adversarial suite scoped explicitly to "what can a capture token do." **This is
  the correct next deliverable, not a rewrite of the mechanism itself** — see the P0 list in the
  checkpoint.

## 10. Physical-device acceptance

**File:** `docs/testing/MOBILE_ACCEPTANCE.md`.

**PARTIALLY IMPLEMENTED / MOSTLY BLOCKED:**

- iPhone 13 / iOS 26.6.1 / Safari: rows 1-4 (join, guest entry, consent rendering) are
  **PHYSICAL PASS**, recorded with real defect fixes (MOBILE-001, MOBILE-002) along the way. Rows
  5-22 (record/upload/interruption/duplicate-submit/photo/document/backgrounding/lock/PWA-install) are
  **blank — not yet run.**
- The new "Track E — live workshop flow" table (rows 23-47: prompt-aware capture, receipt lifecycle,
  emerging understanding, community validation, session close) is **entirely PHYSICAL PENDING** —
  none of it has been run on a device yet, per this repository's own explicit terminology
  (`AUTOMATED PASS`/`PHYSICAL PASS`/`PHYSICAL PENDING`/`BLOCKED`/`NOT APPLICABLE`, introduced this
  session).
- **Android: every row is blank.** No Android device has ever touched this product. The table
  structure exists (`## Android`, mirroring the iPhone table) but has zero recorded results.
- **BLOCKED, not merely missing:** no environment available to Claude has physical iOS/Android
  hardware or a device-farm connection — every physical row requires a human operator, stated
  explicitly in this file's own header since it was first written.

## 11. Phase 5/6 reports and prior architecture decisions

- **ADR-0030** (`architecture/decisions/ADR-0030-mobile-participation-strategy.md`, Accepted,
  2026-09-26) **explicitly decided against building a native companion now**, on the evidence that
  zero of its eight enumerated "native triggers" had fired (iOS interruption data loss, offline
  storage-pressure loss, background-upload necessity, repeat-user installed-experience demand,
  push-notification need, MDM procurement requirement, fully-offline field deployment, measured
  storage-limit risk). **As of this audit, none of those eight triggers has newly fired either** — no
  repository evidence (test failure, incident report, telemetry) demonstrates one has. The governing
  instruction for *this* programme is a distinct, ninth kind of justification not enumerated in
  ADR-0030 — a deliberate business/distribution decision to pursue store presence — which ADR-0030
  did not anticipate and does not itself authorise. **This must be recorded as an explicit
  supersession, not a silent override** — see the new ADR.
- **Phase 5 final report** and **Phase 6 final report** (`docs/release/PHASE6_FINAL_REPORT.md`) both
  independently name the same open item: mobile is "**YES, WITH DOCUMENTED LIMITATIONS**" pending a
  physical-device pass that has still, as of this audit, only partially happened (§10).
- **`docs/release/PHASE6_MOBILE_REPORT.md`** is Track C's own report; its Track E addendum (added this
  session) already states the participant capture page was reshaped into a prompt-aware, receipt-
  driven flow — relevant because a mobile-runtime port must reuse *that* shape, not the pre-Track-E
  upload-form shape.

## 12. CI/CD

**MISSING (mobile-specific):** `.github/workflows/ci.yml` has jobs for `detect`, `docs`, `governance`,
`static`, `test`, `invariants`, `integration`, `build`, `gate` — no job builds, typechecks, or tests
anything under a future `apps/participant-mobile` or equivalent, because nothing there exists yet.
The existing `static`/`test`/`build` jobs are `pnpm`/`turbo`-driven and would need either an additive
job or an addition to the existing `turbo.json` pipeline once a mobile package exists — **the CI
design principle already documented** ("no logic lives in this file... calls a `make` target or
script a contributor runs identically," `ci.yml`'s own header comment) applies unchanged to mobile.

## 13. Deployment architecture / production domains

**IMPLEMENTED (web/API only, not mobile-specific):** the institutional pilot is served over
Cloudflare Tunnel (`docs/operations/PILOT_OPERATIONS.md` §"Cloudflare topology") at
`witness-prod-{web,api,id}.pacificdigitalconsultancy.org` (per this project's own memory of the live
pilot) — no ports are exposed publicly; Cloudflare terminates TLS. **This means a mobile app's
production API base URL is a real, already-provisioned HTTPS origin**, not something this programme
needs to provision — it needs to be *configured into* the mobile build, never hard-coded to a LAN or
localhost address (see the LAN-vs-production distinction the governing instruction itself draws).

## 14. Explicitly out of scope, confirmed absent from the participant surface already

Verified, not assumed: `ParticipantCaptureController` and `SessionJoinController` expose **no**
organisation/billing/invoice/platform/report/knowledge-graph/session-creation/facilitator-control
routes — the entire participant-capture controller file is ~230 lines covering exactly the nine
routes in §3, nothing else. The narrow attack surface the product boundary (§3 of the governing
instruction) asks for **already exists at the route level**; a mobile client built only against
`/api/v1/session-join/*` and `/api/v1/participant-capture/*` inherits that narrowness for free,
provided it is never given a facilitator-capable client library or credential.

---

## Summary table

| Area | Status |
|---|---|
| Session-join (context, join, governance modes, rate limit) | IMPLEMENTED, one defect found and fixed same day (§2) |
| Participant-capture (consent, evidence, prompt, insights, response) | IMPLEMENTED (text/photo/document UI: PARTIALLY) |
| Consent enforcement (categories, audio-vs-evidence separation) | IMPLEMENTED |
| Consent withdrawal (participant's own token) | MISSING |
| Audio recording (codec fallback) | IMPLEMENTED, UNVERIFIED on real hardware |
| Offline queue (IndexedDB, idempotent retry) | IMPLEMENTED, UNVERIFIED under real network conditions |
| API client (fetch-based, contract-typed, no dev-header on participant calls) | IMPLEMENTED |
| Authorization boundary (dev-only mechanisms loopback-only) | IMPLEMENTED for development; production adversarial suite MISSING |
| Native mobile tooling (Capacitor/Expo/RN/Xcode/Gradle) | MISSING (clean slate) |
| PWA (manifest, service worker) | IMPLEMENTED |
| Deep linking / universal links / App Links | MISSING |
| Physical iPhone acceptance | PARTIALLY IMPLEMENTED (rows 1-4 only) |
| Physical Android acceptance | MISSING (BLOCKED on hardware) |
| Mobile CI | MISSING |
| Production HTTPS domains | IMPLEMENTED (pilot already live) |
| Store privacy/compliance material | MISSING |
| Facilitator/admin/billing/platform routes on participant surface | NOT REQUIRED FOR V1 (and already absent) |
