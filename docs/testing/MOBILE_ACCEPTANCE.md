# Mobile participation — physical-device acceptance sheet

Phase 6, Track C (ADR-0030). This is an **executable manual test sheet**, not a
report of results — no automated environment used to build Witness (including the one that wrote
this document) has physical iOS/Android hardware or a device-farm connection. Every row below must
be run by a human, on real hardware, before "mobile-ready" can be claimed as proven rather than
"designed to work, unverified against real devices" — see `ADR-0030`'s own Consequences → Negative
for why that distinction matters and is not being quietly dropped.

**Do not fill in a result you did not personally observe.** A blank row is honest. A guessed row is
not.

## How to run this

1. Get a real invitation/QR link into a real co-design session (ask an engineer to create a test
   session with `anonymous` or `pseudonymous` governance mode — no real participant data).
2. Work through each row on each device/browser combination below, in order.
3. Record the exact result, not a summary — "recorded 5:03, uploaded, playback confirmed" beats
   "worked".
4. If a step fails, stop that device's run at the failure, file it as a defect (link it in the
   table), and continue with the *next* device rather than the next step on the same one.
5. Update this file directly with results — it is the record, not a separate spreadsheet.

## iPhone

| Field | Value |
|---|---|
| Device model | iPhone 13 |
| iOS version | 26.6.1 |
| Browser | Safari |
| Browser version | (system Safari, iOS 26.6.1) |
| Tester | dreamercoat |
| Date | 2026-09-26 |

### Browser flow (no install)

| # | Step | Expected | Result | Defect ref |
|---|---|---|---|---|
| 1 | Open the invitation/QR link | Session context (title, facilitator, governance mode) loads before any action is required | **PASS** (re-test, 2026-09-26). First attempt FAILED with "Something went wrong on the server. Try again in a moment." — diagnosed and fixed (MOBILE-001). Re-test on the same iPhone 13/iOS 26.6.1/Safari confirmed: programme `Knowledge Graph Test Program`, session `Mobile Acceptance Test Session`, workspace `Bore Maintenance Program`, facilitator `Test Admin`, mode "Open to anyone — no name or sign-in needed" all rendered correctly. | MOBILE-001 (resolved) |
| 2 | Authentication/guest entry (per governance mode) | `anonymous`/`pseudonymous`: no sign-in; `verified_guest`/`invited_only`: real Keycloak sign-in | **PASS** — `anonymous` mode, no sign-in prompt shown, consistent with the governance mode. | |
| 3 | Session return after sign-in (only for modes that sign in) | Lands back on the same invitation, not the generic app root (ADR-0030's `returnTo`) | **N/A** — anonymous mode never signs in, so this row does not apply to this run. Not proven or disproven here; still unverified for `verified_guest`/`invited_only` modes. | |
| 4 | Consent | Required categories shown in plain language before recording is available | **FAIL → fix applied, re-test pending.** Consent screen rendered correctly (title, facilitator, "Contributing as Anonymous participant", three checkboxes, Continue button) but pressing Continue intermittently produced "Something went wrong on the server." — see MOBILE-002 below. Root cause fixed at both the code and the test-fixture level and verified via direct HTTP calls; **not yet re-confirmed on the physical device.** A **new session and join link were required** (see MOBILE-002) — continue testing from the fresh URL given below, not the original one. | MOBILE-002 |
| 5 | Microphone permission | iOS permission prompt appears; granting it enables the record control | | |
| 6 | Record 10 seconds | Timer visible, large tap target, no visual glitch | | |
| 7 | Record 5 minutes | Recording continues without silent failure; elapsed timer stays accurate | | |
| 8 | Playback | The `<audio controls>` preview plays back what was actually recorded | | |
| 9 | Upload | Submits and shows a clear success/queued state | | |
| 10 | Network interruption mid-recording | Turn on Airplane Mode mid-recording, then off before stopping — recording is not lost | | |
| 11 | Network interruption during upload | Turn on Airplane Mode after pressing Submit — item queues rather than silently failing | | |
| 12 | Reconnect | Turn Airplane Mode off — queued item sends automatically, or via "Retry now" | | |
| 13 | Duplicate submit | Press Submit twice quickly (or retry after a slow response) — exactly one contribution appears, never two | | |
| 14 | Photo upload | A photo can be attached/submitted as evidence | | |
| 15 | Document upload | A document (PDF or similar) can be attached/submitted as evidence | | |
| 16 | Switch app during recording | Background Safari mid-recording (e.g. check another app), return — recording state and `beforeunload`-style protection behave sensibly | | |
| 17 | Lock device during recording | Lock the screen mid-recording, unlock — confirm whether the recording survived or was lost | | |
| 18 | Incoming call/interruption (if safely testable) | An incoming call during recording does not silently corrupt or lose the recording | | |
| 19 | Close/reopen Safari with a pending offline item | Force-close Safari with an item still queued, reopen the link — the queued item is still there and still sendable | | |

### Installed PWA flow

| # | Step | Expected | Result | Defect ref |
|---|---|---|---|---|
| 20 | Install ("Add to Home Screen") | Correct name, icon, and splash color (Brand Book ink/paper, not the old placeholder blue) | | |
| 21 | Launch from home screen | Opens standalone (no Safari chrome), lands on the intended page | | |
| 22 | Repeat steps 5-15 inside the installed PWA | Same behaviour as the browser flow | | |

## Android

| Field | Value |
|---|---|
| Device model | |
| Android version | |
| Browser | Chrome |
| Browser version | |
| Tester | |
| Date | |

### Browser flow (no install)

| # | Step | Expected | Result | Defect ref |
|---|---|---|---|---|
| 1 | Open the invitation/QR link | Session context loads before any action is required | | |
| 2 | Authentication/guest entry | Per governance mode, as above | | |
| 3 | Session return after sign-in | Lands back on the same invitation | | |
| 4 | Consent | Required categories shown before recording is available | | |
| 5 | Microphone permission | Chrome permission prompt appears; granting it enables recording | | |
| 6 | Record 10 seconds | Timer visible, large tap target | | |
| 7 | Record 5 minutes | No silent failure over the longer duration | | |
| 8 | Playback | Preview plays back correctly | | |
| 9 | Upload | Clear success/queued state | | |
| 10 | Network interruption mid-recording | Toggle Airplane Mode mid-recording — not lost | | |
| 11 | Network interruption during upload | Toggle Airplane Mode after Submit — queues rather than fails silently | | |
| 12 | Reconnect | Queued item sends automatically or via "Retry now" | | |
| 13 | Duplicate submit | Exactly one contribution, never two | | |
| 14 | Photo upload | Works | | |
| 15 | Document upload | Works | | |
| 16 | Switch app during recording | Recent-apps switch mid-recording, return — sensible state | | |
| 17 | Lock device during recording | Lock/unlock — confirm survival or loss | | |
| 18 | Incoming call/interruption (if safely testable) | No silent corruption/loss | | |
| 19 | Close/reopen Chrome with a pending offline item | Queued item survives a real app-close, not just a tab switch | | |

### Installed PWA flow

| # | Step | Expected | Result | Defect ref |
|---|---|---|---|---|
| 20 | Install ("Add to Home Screen" / native install prompt) | Correct name, icon (maskable-safe on Android's adaptive-icon system), theme color | | |
| 21 | Launch from home screen | Opens standalone, lands on the intended page | | |
| 22 | Repeat steps 5-15 inside the installed PWA | Same behaviour as the browser flow | | |

## Known, already-flagged risks to watch for specifically

These are not blind spots — they are the exact things the accompanying audit (ADR-0030) could not
verify without this sheet, so pay particular attention to them:

- **Row 6-8 (iPhone), audio codec.** `audio-recorder.tsx`'s codec fallback chain tries WebM/Opus
  first (iOS Safari does not support it) and only reaches `audio/mp4` last. If playback sounds
  wrong, is silent, or the file is unexpectedly large/small, that is this exact risk surfacing —
  file it as a defect referencing `ADR-0030`, don't just note "audio seemed off."
- **Row 16-17, interruption recovery.** No automated test anywhere exercises this. A lost recording
  here is not a minor bug — see ADR-0030's Native Trigger #1.
- **Row 13, duplicate submission.** The idempotency guarantee is real and DB-enforced
  (`@@unique([sessionId, clientRequestId])`) — a genuine duplicate here would be a serious defect,
  not a cosmetic one.
- **Shared-device note (not a row above, check manually if testing on a shared/kiosk device):** the
  offline-queue status line ("N waiting to send") is scoped by session, not by the individual
  capture token — on a device two different participants use one after another in the *same*
  session, the second person may see a leftover count from the first. No contribution *content* is
  exposed by this, only a count. Documented, not yet fixed — see the Track C mobile report.

## Defect log

### MOBILE-001 — join page failed on first physical-device attempt (RESOLVED)

- **Device/context:** iPhone 13, iOS 26.6.1, Safari, real physical hardware (not emulated), tunnel
  entry URL `https://tax-andale-lookup-stranger.trycloudflare.com/join/EPEkFKJqQDO8xywANyt5j1wrhVBQg_-66D7bTM_ZONU`,
  session `85e05e82-189a-402b-8f83-5cf769943b72` ("Mobile Acceptance Test Session"), synthetic
  `SessionJoinLink` `b13ef555-1b25-44e4-aa24-a130124f117e`.
- **Observed:** generic "Something went wrong on the server. Try again in a moment." on first load,
  before any action was taken.
- **Root cause (proven from server logs, not guessed):** the API gateway process's own log
  (`/tmp/api_mobile_test.log`) shows `PrismaClientKnownRequestError: Can't reach database server at
  localhost:5432`, thrown inside `SessionJoinService.findByToken` → `getContext` — exactly the
  unauthenticated join-context lookup `/join/[token]` calls. `docker ps -a` at diagnosis time showed
  `witness-postgres-1` had exited (code 0) minutes earlier, and the Docker daemon itself was briefly
  unreachable, consistent with Docker Desktop stopping on the host machine during the test window.
  This is an **infrastructure/environment event on the local development host, not a Phase 6 code
  defect** — no Safari-specific, cookie, CORS, tunnel-routing, or SSR-configuration cause was found
  or is implicated; the stack trace names the cause unambiguously.
- **Fix applied:** restarted Docker Desktop, restarted `witness-postgres-1` (named volume
  `witness_postgres-data`, confirmed healthy after restart). Verified the seeded synthetic
  `SessionJoinLink` and `CoDesignSession` rows survived the restart intact (direct `psql` query,
  values unchanged). The API gateway process (PID 43742) was never restarted — its Prisma
  connection pool reconnected on its own once Postgres came back, confirmed by a subsequent
  successful query.
- **Re-verification before asking for retest:** `GET /api/v1/session-join/<token>` returns HTTP 200
  with the correct session payload both directly (`localhost:3001`) and through the Cloudflare API
  tunnel, including with a Safari-13-style `Origin`/User-Agent. The web tunnel's `/join/[token]`
  page also returns HTTP 200 with no error text in the response body.
- **Known limitation of this re-verification:** browser automation (`claude-in-chrome`) was not
  available in this environment (extension not connected), so the client-side hydration + fetch
  behaviour that actually populates the session name in the rendered page could not be confirmed
  by an automated browser — only by direct HTTP checks of the same endpoints the page calls.
- **No regression test added.** Judged, and recorded here rather than silently skipped: this was a
  local Docker Desktop / Postgres availability event on the test host, not a defect in
  `SessionJoinService` or any Phase 6 code path — there is nothing in the application's own logic to
  add a regression test against. If this recurs during acceptance testing, that would itself be a
  signal worth escalating (e.g. flakiness in the local dev topology), not assumed away a second time.
- **Resolved:** confirmed by the physical iPhone 13 (iOS 26.6.1, Safari) successfully rendering the
  session context on re-test, 2026-09-26. See Row 1 above.

### MOBILE-002 — intermittent server error during participant consent flow (diagnosed and fixed; re-test pending)

- **Device/context:** iPhone 13, iOS 26.6.1, Safari, physical hardware. Consent page rendered
  correctly (`Mobile Acceptance Test Session`, `Facilitated by Test Admin`, `Contributing as
  Anonymous participant`, three consent checkboxes, Continue button). One screenshot, taken around
  10:34 local device time, showed "Something went wrong on the server. Try again in a moment."
  inside the consent card; a subsequent view showed the same page with no error.
- **Correlated from server logs (not guessed):** the API gateway log shows four occurrences at
  10:34:23, 10:34:27, 10:34:30, and 10:34:42 (26/09/2026) of:
  ```
  ERROR [ExceptionsHandler] Category 'anonymous_quotation' is not part of this session's consent configuration.
  InvariantViolation: Category 'anonymous_quotation' is not part of this session's consent configuration.
      at assertCategoryDecisions (.../packages/domain/dist/participant-consent-record.js:84:19)
      at captureParticipantConsent (.../packages/domain/dist/participant-consent-record.js:130:31)
      at ParticipantConsentRecordsService.capture (.../participant-consent-records.service.js:137:25)
      at async ParticipantCaptureService.captureConsent (.../session-join/participant-capture.service.js:168:9)
      at async ParticipantCaptureController.captureConsent (.../session-join/participant-capture.controller.js:82:9)
  ```
  This is the failing request: `POST /api/v1/participant-capture/consent` — persisting the
  participant's consent decisions. **Not the previous Docker/Postgres problem** — Postgres had been
  continuously healthy for the preceding ~15 minutes with zero restarts at the time this was
  investigated; the infrastructure explanation was checked and ruled out with evidence, not assumed.
- **Which consent operation failed (Step 2):** persisting participation consent — specifically, the
  frontend (`apps/web/src/app/capture/[sessionId]/page.tsx`'s `consentCategoriesFor`) always adds an
  `anonymous_quotation`/`attributed_quotation` decision on top of whatever categories the session
  declares as required, because the domain's `requiredConsentCategoryForCapture`
  (`packages/domain/src/evidence.ts`) unconditionally requires quotation consent for any non-
  sourceless participant regardless of what a template marks optional. The backend's
  `assertCategoryDecisions` correctly rejects any category the session's own configuration doesn't
  list. The two disagreed for this specific synthetic test session.
- **Two distinct causes, both real, neither a Safari/tunnel/cookie issue:**
  1. **Test-fixture defect (this session's synthetic data, not production code):** the
     `SessionConsentConfiguration` seeded for `Mobile Acceptance Test Session`
     (`85e05e82-189a-402b-8f83-5cf769943b72`) had `required_categories: [participation,
     evidence_submission]` — it never included `anonymous_quotation` (even though the attached
     `ConsentTemplate` listed it as required) and never included `audio_recording` at all.
  2. **Real code gap (pre-existing, predates Phase 6 — confirmed by diffing against `main`):**
     `ParticipantCaptureController.captureConsent` — the unauthenticated participant-facing consent
     endpoint every real mobile participant uses — never translated a domain `DomainError` into an
     HTTP response. Its authenticated sibling, `participant-consent-records.controller.ts`, already
     wraps the equivalent call in a `translateDomainErrors` helper that turns a `DomainError` into a
     clean `400 Bad Request`; this controller did not, so Nest's default handler returned a raw,
     unhandled `500` for what is actually an ordinary, well-understood business-rule mismatch. This
     means *any* session with a similar template/configuration drift — not just this synthetic one —
     would have shown the same generic, unhelpful error to a real participant in production.
- **Consent semantics check (Step 4 — audio vs. document/photo consent):** confirmed from the real
  code, not assumed: `evidence-attachment.service.ts` asks two different, independent questions
  depending on the attachment's kind — `audio` asks `ConsentPolicyService.mayRecordAudio`
  (`audio_recording` category); `document`/`image` ask `maySubmitEvidence` (`evidence_submission`
  category). These are genuinely separate consent bases already implemented in the governance model
  — `evidence_submission` alone does **not** authorise audio capture, and the model was correct to
  keep them separate. The mobile acceptance test's synthetic session simply never declared
  `audio_recording` as a category at all, so Quick Capture's voice recording would have failed this
  check even if the earlier `anonymous_quotation` mismatch had not existed first. No production
  code or consent wording was changed for this — it was a test-fixture gap, not a governance gap.
- **Fixes applied:**
  1. **Fixture fix:** created a fresh, correctly-configured `ConsentTemplate` ("Mobile Acceptance
     Test Consent v2", `388c4034-7101-4cfb-b49d-447f1a775ed1`) declaring all four categories
     (`participation`, `audio_recording`, `evidence_submission`, `anonymous_quotation`, all
     required), through the real `consent-templates` API (not hand-written rows). A fresh
     `CoDesignSession` ("Mobile Acceptance Test Session v2", `d5d8b9d7-980f-456b-a9dd-5191265a64de`)
     was created and its consent configured with all four categories while still `draft` (an open
     session's consent configuration cannot be changed by design — `reconfigureSessionConsent`'s own
     `assertConfigurable` rule — so a fresh session was required, not a patch to the old one), then
     opened. A new `SessionJoinLink` was seeded as synthetic data exactly as before (same hashing
     discipline, same governance mode, bound to the new session).
  2. **Code fix:** `services/api-gateway/src/session-join/participant-capture.controller.ts` now
     wraps `captureConsent`'s call to the service in the same `translateDomainErrors` pattern already
     used by `participant-consent-records.controller.ts`, so a `DomainError` becomes a `400` with a
     clear `{ code, message }` body instead of an unhandled `500`.
- **Regression test added:** `services/api-gateway/src/session-join/participant-capture.controller.test.ts`
  — reproduces the exact failure (a `DomainError` thrown by the service must become a
  `BadRequestException`, not propagate), fails against the pre-fix code, passes after the fix.
  Full `session-join` unit and live-Postgres suites re-run clean (23/23 live, no regressions).
- **Verified before asking for a physical retest (Step 11):** confirmed via direct HTTP calls
  through the API tunnel that (a) a throwaway participant on the new session can submit all four
  consent categories successfully (`201 captured`), and (b) deliberately submitting a category the
  session doesn't declare now returns a clean `400 CATEGORY_NOT_CONFIGURED` instead of a raw `500`.
  Browser automation was still unavailable in this environment, so the client-side rendering of the
  fresh consent screen itself has not been confirmed by an automated browser — only by the
  underlying HTTP endpoints it calls. This is why the Result cell above says "re-test pending."
- **Not yet done:** physical-device confirmation. The original join link/session
  (`85e05e82-...`) is now retired for this test — continue from the new URL below.

## Do not claim success for a row not executed

An empty "Result" cell means "not run," not "assumed fine." The final Phase 6 mobile report quotes
this table directly — do not backfill optimistic results after the fact.
