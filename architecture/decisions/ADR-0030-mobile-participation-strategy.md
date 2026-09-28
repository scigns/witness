# ADR-0030: Mobile participation strategy — responsive web, PWA, and native companion

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-26 |
| **Deciders** | Principal Architect, Product Director, Security Lead |
| **Consulted** | Frontend Lead |
| **Informed** | All contributors |
| **Supersedes** | none (ratifies and completes an existing, previously undocumented posture) |
| **Related** | ADR-0007 (identity/authorization), ADR-0024 (server-managed browser sessions), ADR-0028 (participant model), ADR-0029 (development environment strategy) |
| **Principles engaged** | P1, P2, P6, P7, P8 |

## Context

Phase 6 asks for a mobile participation strategy for the core workshop loop —
`invitation/QR → session → consent → record → stop → submit` — and asks that it be decided from
the actual current implementation, not from a green-field assumption. It was not green-field.

An audit of the real code (not prior planning documents) found:

- **A real, working, hand-rolled PWA already exists.** `apps/web/src/app/manifest.ts` is a
  populated Next.js `MetadataRoute.Manifest` (name, icons, `start_url`/`scope`, `display:
  'standalone'`, theme/background colors) served at `/manifest.webmanifest`; `apps/web/public/sw.js`
  is a real, narrowly-scoped service worker (cache-first, same-origin, `/_next/static/` GET assets
  only, versioned cache, never touches cross-origin or cookie-authenticated requests);
  `apps/web/src/components/service-worker.tsx` registers it, skipped in the development profile;
  `layout.tsx` sets real `apple-touch-icon`/`appleWebApp` metadata. This is not a stub — it is
  Level 2 low-connectivity infrastructure, already built, previously undocumented by any ADR.
- **Quick Capture (Phase 5) is genuinely mobile-first**, not a shrunk desktop UI: the participant
  capture page (`apps/web/src/app/capture/[sessionId]/page.tsx`) is phone-width-constrained
  (`max-w-md`, `min-h-dvh`), the record button is a `h-32 w-32` touch target with tap feedback, and
  it renders outside the admin navigation shell entirely (`shell.tsx`'s `BARE_ROUTE_PREFIXES`).
- **The offline contribution queue is IndexedDB-backed** (not `localStorage` — a deliberate choice
  for Blob storage), survives a browser restart, flushes on mount and on the `online` event, and is
  backed by a real, DB-enforced idempotency guarantee (`@@unique([sessionId, clientRequestId])`,
  tested live in `participant-capture.live.test.ts`). One real defect was found in this path (see
  Consequences → Negative) and is fixed alongside this ADR.
- **The capture-token flow is cryptographically sound.** A token resolves to exactly one
  participant/session; cross-participant forgery, expiry, revocation and withdrawal are all checked
  and covered by live tests; no route exposes another participant, session, or piece of unrelated
  evidence; anonymous/pseudonymous identity never leaks toward a real name.
- **The audio codec fallback chain (`pickRecordingMimeType`, `audio-recorder.tsx`) tries
  WebM/Opus first, then WebM, then Ogg/Opus, then MP4/AAC.** iOS Safari does not support WebM or
  Ogg, so a real iPhone falls through to the *last* candidate in the list. This is plausible,
  standards-based behaviour, but **it has never been exercised against a real iOS device, or any
  automated mobile-browser test** — there is no Playwright/e2e suite in `apps/web` at all, and zero
  test files reference `audio-recorder.tsx`, `offline-queue.ts`, or `capture-session.ts`. This is
  the single largest source of real uncertainty in this decision, and this ADR does not pretend
  otherwise.
- **The OIDC callback has a confirmed, already-acknowledged gap.** `AuthenticationController
  .callback` always redirects to a fixed generic origin on success — never back to the specific
  invitation or session link the person arrived from. Two frontend pages
  (`join/[token]/page.tsx`, `workspace-invitations/[token]/page.tsx`) already carry code comments
  documenting this as a known limitation ("a signed-out invitee... must return to this same link
  afterward"). This only affects the `verified_guest`/`invited_only` governance modes — anonymous
  and pseudonymous joining never touch Keycloac at all — but it is real and is fixed alongside this
  ADR (see Consequences → Positive).
- **The basePath/`window.location` navigation bug** (raw browser navigation bypassing Next's
  `basePath`, breaking path-based deployments) that a prior audit flagged is confirmed **already
  fixed** (commit `cb7271d`), and no longer needs tracking.
- Zero physical-device testing has ever been performed for Quick Capture on any real phone — this
  was already an open, named risk in the Phase 5 final report, and remains open today. Nothing in
  this sandboxed environment (no device farm, no browser-automation extension available in this
  session) can close it; §"Physical device acceptance" below produces the manual sheet a human
  must actually run.

Witness has zero onboarded customers as of this decision. No mobile app has ever shipped. There is
no App Store or Play Store developer account, no release pipeline, no push-notification
infrastructure, and no operational capacity to run one yet.

## Decision

> **Responsive web / PWA is the mobile participation strategy now. No native companion is built in
> this phase.** The existing hand-rolled PWA is completed (brand-correct manifest colors, explicit
> viewport/theme-color metadata) rather than replaced, the two concrete defects found in the audit
> above are fixed, and explicit, falsifiable triggers (§ Native triggers) are recorded for when a
> native companion becomes justified — not "we may build native later" as an unexamined hedge.

This ratifies, rather than invents, the direction the codebase was already built in.

## Options considered

### Option A — Responsive web only (no installability)

**Description.** Keep Quick Capture as a responsive web page; remove or never complete the
existing manifest/service worker.

**Pros:** Simplest possible surface; nothing to maintain beyond ordinary web app concerns.

**Cons:** Throws away real, working PWA infrastructure that already exists and costs nothing
further to keep; loses the "add to home screen" enhancement for repeat facilitators/participants at
zero marginal engineering cost, for no benefit.

**Why not chosen:** There is no reason to delete working code to arrive at a strictly worse
position. Rejected.

### Option B — PWA now (this decision)

**Description.** Complete the existing manifest/service worker to production quality; fix the two
concrete defects found in the audit (offline-queue error handling, OIDC return-path); keep the
capture-token flow as the low-friction default for anonymous/pseudonymous participants; document
physical-device verification honestly as not yet performed.

**Pros:** Reuses one backend, one domain, one contracts package, one auth model — no new mobile
API, database, or user type (P6, P7: boring, proven, decades-not-quarters). No app-store review
cycle standing between a fix and a facilitator's phone. QR → contribute needs zero install. Nearly
all of the work is *already done*; the marginal cost to finish it is small and well-scoped.

**Cons:** A PWA on iOS Safari has real, documented platform constraints (no Web Push until
relatively recent iOS versions and only for installed PWAs, background sync support is weaker than
Android Chrome, storage can be evicted under pressure) that this ADR does not paper over — see
§Native triggers. The single largest cons: the audio-codec fallback chain that matters most for iOS
has never been verified on a real device.

**Why chosen:** It is the only option that matches the codebase's actual maturity, the product's
actual customer count (zero), and the actual operating capacity (one contributor, no store
pipeline). It also happens to already be mostly built.

### Option C — PWA now, Expo/React Native later

**Description.** Same as B, plus stand up an `apps/mobile` Expo skeleton now, dormant until needed.

**Pros:** Slightly faster start if native ever is needed.

**Cons:** A dormant native app skeleton with no users and no store listing is pure maintenance
cost (dependency updates, Expo SDK upgrades, CI matrix) for a hypothetical need. Nothing about
Expo/React Native is faster to *start* later than it is to start when actually triggered — this
buys nothing real.

**Why not chosen now:** No trigger in §Native triggers has fired. Building the skeleton anyway
would be optimising for prestige over reliability, which this phase's own governing instruction
explicitly rules out. Revisit the moment a trigger fires — see §C18 in the originating instruction
for the intended initial native scope if that happens.

### Option D — Native (Expo/React Native) now

**Description.** Build a native companion app for iOS/Android as the primary mobile surface.

**Pros:** Full native `MediaRecorder`-equivalent APIs, guaranteed background recording/upload,
push notifications, no browser-vendor codec uncertainty.

**Cons:** Requires an Apple Developer account, Play Console account, code-signing, store review
cycles, and ongoing release engineering the project has never had and cannot presently staff.
Duplicates authentication, session-join, consent, and capture UI in a second codebase against the
same backend. Installing an app is *more* friction for a one-off workshop participant, not less —
directly contrary to the stated objective of minimising friction for the primary use case.
Solves problems (background recording reliability, push) that have not been demonstrated to be
real problems yet, at a cost the business cannot presently carry.

**Why not chosen:** Optimises for a hypothetical need over the actual, current one. None of the
native triggers below have fired.

## Native triggers

Native is reconsidered — not automatically built, reconsidered — the moment any of these becomes
true, with the evidence that would demonstrate it:

1. **iOS Safari loses or corrupts a recording under a realistic interruption** (app-switch, screen
   lock, incoming call) during real device testing. Evidence: a failed row in
   `docs/testing/MOBILE_ACCEPTANCE.md`'s interruption tests, reproduced twice.
2. **A long offline recording cannot be safely preserved** (IndexedDB eviction under storage
   pressure loses a pending contribution before it uploads). Evidence: a reproduced storage-pressure
   test failure, or a real support report of lost evidence.
3. **Background upload becomes operationally necessary** (participants routinely background the
   tab mid-upload and the upload does not survive it, measured, not assumed).
4. **Repeat users materially need a stronger installed experience** than "add to home screen"
   provides (measured by more than a handful of anecdotal requests — e.g. a customer's own IT
   policy requiring MDM-distributed apps).
5. **Push notifications become operationally important** (e.g. facilitators need to be paged when
   a session needs attention) and web push proves insufficient on the customer's actual device mix.
6. **A customer requires MDM-distributed native apps** as a procurement condition.
7. **Field/fully-offline deployments become a core use case** (multi-day offline capture with no
   connectivity at all, beyond what a PWA's storage APIs can be shown to guarantee).
8. **Browser storage limits are shown to cause measurable evidence risk** at real recording
   lengths/volumes in the acceptance sheet or in production telemetry.

None of these have fired as of this decision. Recording them here, rather than leaving "maybe
native later" unexamined, is the point of this ADR.

## Consequences

### Positive

- **OIDC return-path fixed.** `AuthenticationService.startLogin` now accepts and signs a same-origin
  `returnTo` path through the OIDC `state` parameter; `AuthenticationController.callback` verifies
  the signature and redirects there instead of the generic app root. A `verified_guest`/
  `invited_only` participant who signs in from an invitation now lands back on that invitation, not
  a dashboard they have no context for. Anonymous/pseudonymous joining is unaffected (it never
  touches Keycloak).
- **Offline-queue defect fixed.** `enqueue()` in `offline-queue.ts` previously had no error
  handling; a quota-exceeded or IndexedDB-unavailable failure during enqueue surfaced as an
  unhandled promise rejection instead of a message the participant could act on. It now catches
  that failure and surfaces a clear "could not save this offline — try again while connected"
  state rather than failing silently or crashing.
- **Manifest brought into the actual Brand Book**, replacing placeholder colors that matched no
  documented token, and the Metadata API now declares an explicit `viewport`/`themeColor` rather
  than relying on Next's implicit default.
- Zero new backend surface, zero new auth model, zero new mobile-specific data model — the existing
  API/domain/contracts remain the one and only backend for web, PWA, and any future native
  companion (see the layering this ADR preserves, below).
- A manual "Retry now" action was added to the offline-queue status line so a participant is never
  purely dependent on the `online` event firing correctly.

### Negative

- iOS Safari's real behaviour for the codec fallback chain, long recordings, and interruption
  recovery remains **unverified by this ADR** — closing that gap requires an actual iPhone, which
  this decision does not have access to. `docs/testing/MOBILE_ACCEPTANCE.md` is the executable
  sheet a human must run; until it is run, "mobile-ready" is asserted with a documented limitation,
  not proven.
- The authenticated admin app's navigation remains CSS-wrap/horizontal-scroll only, with no
  hamburger/drawer pattern. This is an accepted gap, not an oversight: per this ADR's own user-type
  split, organisation admin/billing/Knowledge Steward/platform-operator work is explicitly a
  web-first, not mobile-first, surface (see the originating instruction's C1). Revisit only if a
  facilitator's *secondary* mobile needs (open/close session, monitor contributions) are shown to
  need more than the existing responsive pages provide.
- No maskable PWA icon variant exists yet. Adding one correctly requires a real design asset (safe
  padding for adaptive icon masking on Android), not a code change — flagged as a follow-up for
  whoever owns brand assets, not fabricated here from the existing flat icon.

### Neutral

- The capture-token flow (Track B's own finding, re-confirmed here) remains the lowest-friction
  entry point for anonymous/pseudonymous mobile participants and needs no change — it was already
  correctly scoped, expiring, non-enumerable, and identity-preserving before this ADR.
- Installation remains an enhancement, never a gate: no code path in this decision requires a
  participant to install anything before `QR → contribute` works.

### Risks accepted

- Shipping "PWA is the mobile strategy" without physical-device proof is an accepted, time-boxed
  risk given zero current customers and zero device-farm access in this environment — the same
  category of accepted risk ADR-0029 already recorded for Codespaces/OIDC. It is not accepted
  indefinitely: §Native triggers and the acceptance sheet define what would end it.

## Architecture preserved

```text
                Witness API (services/api-gateway) + one domain (packages/domain)
                                        ^
                    ________________________________________
                   |                    |                    |
                  web                  PWA            future native companion
           (apps/web, desktop)   (apps/web, installed)   (apps/mobile, if triggered)
```

No mobile API gateway, mobile database, mobile user type, mobile `Evidence` model, or mobile
consent model is introduced by this ADR, and none should be introduced by any future work in this
area without its own ADR demonstrating a hard technical requirement.
