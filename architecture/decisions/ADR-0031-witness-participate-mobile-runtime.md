# ADR-0031: Witness Participate mobile runtime — Capacitor wrapping the existing participant client

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-27 |
| **Deciders** | Principal Architect, Staff Mobile Engineer, Security Engineer, Release Engineer |
| **Consulted** | Product Lead |
| **Informed** | All contributors |
| **Supersedes** | [ADR-0030](ADR-0030-mobile-participation-strategy.md) — partially: "no native companion is built" is superseded by an explicit product/distribution decision (below); ADR-0030's audit findings, native-trigger framework, and its two shipped fixes (OIDC `returnTo`, offline-queue error handling) remain valid and are carried forward unchanged. |
| **Related** | ADR-0030 (mobile participation strategy), ADR-0007 (identity/authorization), ADR-0024 (server-managed browser sessions), ADR-0028 (participant model) |
| **Principles engaged** | P1, P2, P6, P7, P8 |

## Context

ADR-0030 (2026-09-26) decided against a native companion, on the evidence that none of its eight
enumerated native triggers (iOS interruption data loss, offline storage-pressure loss, background-
upload necessity, repeat-user installed-experience demand, push-notification need, MDM procurement
requirement, fully-offline field deployment, measured storage-limit risk) had fired.

**None of those eight triggers has fired since.** This decision does not claim otherwise. What has
changed is a **ninth kind of justification ADR-0030 did not enumerate and does not itself
authorise**: a deliberate, deadline-driven business decision to give Witness a real App Store/Play
Store presence for a lightweight participant application — "Witness Participate" — pursued through
TestFlight and Google Play internal testing toward eventual public listing, per explicit governing
instruction. This is a product/distribution decision, not a technical one, and ADR-0030's own
"native triggers" framework was never meant to gate that kind of decision — it gated *technical*
necessity. Recording this honestly, as a supersession, rather than silently building native as if
ADR-0030 had said something different, is the point of this document existing at all.

A structured audit of the actual repository (`docs/mobile/WITNESS_PARTICIPATE_CURRENT_STATE.md`,
produced immediately before this ADR) found:

- **No native mobile tooling exists anywhere in the repository** — no Capacitor, Expo, React
  Native, Xcode project, or Gradle project. This is a genuinely clean slate, not a duplicate of
  something already started.
- The participant experience (`apps/web/src/app/capture/[sessionId]/page.tsx` and its supporting
  `lib/` modules — `api.ts`, `offline-queue.ts`, `capture-session.ts` — plus
  `components/audio-recorder.tsx`) is **plain React/Next.js code with no DOM API it uses that lacks
  a direct native-runtime equivalent**: `fetch`, `FormData`, `Blob`, `IndexedDB`, and `MediaRecorder`
  all either work unmodified inside a modern WKWebView/Android WebView, or have a thin,
  well-documented native-bridge replacement.
- The backend participant surface (`/api/v1/session-join/*`, `/api/v1/participant-capture/*`) is
  already narrow, already contract-typed (`@witness/contracts`), and already proven not to require a
  facilitator-capable client to function (`WITNESS_PARTICIPATE_CURRENT_STATE.md` §14).
- The governing instruction for this programme is explicit and repeated: **"strongly prefer reuse
  over rewriting"** and **"do not create speculative functionality."**

## Decision

> **Wrap the existing participant web experience in Capacitor**, extracted into a new, minimal
> participant-only web build (not the full institutional `apps/web`), rather than rewriting the
> participant journey in Expo/React Native or shipping a PWA alone. `packages/domain`,
> `@witness/contracts`, and the participant-specific client logic currently embedded in `apps/web`
> are reused as-is or lightly extracted into a shared package — never duplicated into a second,
> parallel implementation.

## Options considered

### Option A — Capacitor + existing participant React/Next implementation (chosen)

**Description.** Extract the participant-only routes/components/`lib` modules from `apps/web` into
a new, minimal Vite+React (or a trimmed Next.js) build — no facilitator/admin routes, no billing, no
knowledge graph — and wrap that build with Capacitor to produce real Xcode and Android Studio/Gradle
projects. Native plugins (`@capacitor/preferences`+Keychain/Keystore-backed secure storage,
`@capacitor/app` for deep links, `@capacitor/filesystem` if needed for large recordings) replace the
handful of browser-only APIs the participant flow cannot get natively for free.

**Scored:**

| Criterion | Score | Why |
|---|---|---|
| Reuse | **High** | `api.ts`, `offline-queue.ts`, `audio-recorder.tsx`'s codec-negotiation logic, `capture-session.ts`, and every domain/contract type are reused verbatim or near-verbatim. |
| Security | **High** | Same TLS/HTTPS API surface as the web client; capture-token discipline unchanged; Capacitor's `@capacitor/preferences` backs onto Keychain/Keystore for the one thing that needs upgrading (secure token storage — see §16 of the governing instruction). |
| Delivery speed | **High** | No UI rewrite. The dominant remaining work is native shell configuration (bundle ID, permissions, icons, signing) and a handful of plugin integrations, not re-authoring a participant journey that already works. |
| Audio recording | **Medium-High** | `MediaRecorder` works inside a modern WKWebView (iOS 14.3+) and Android WebView; the existing codec-fallback chain is reused unchanged. Genuinely native `AVAudioRecorder`/`MediaRecorder` (Android) APIs remain available later via a Capacitor plugin if the WebView path proves insufficient — not required to ship v1. |
| Offline behaviour | **High** | IndexedDB is available inside a Capacitor WebView on both platforms; the existing idempotency contract (`clientRequestId` + DB unique constraint) needs no change. |
| Deep linking | **High** | Capacitor has first-class, documented support for iOS Universal Links and Android App Links (`@capacitor/app`'s `appUrlOpen` event), which is exactly what §11 of the governing instruction asks for. |
| Secure token storage | **High** | `@capacitor/preferences` (iOS: Keychain; Android: `EncryptedSharedPreferences`/Keystore-backed) is a maintained, first-party plugin — not a bespoke native module. |
| Native permissions | **High** | `@capacitor/microphone`/native permission prompts map directly onto the two permissions this product actually needs (microphone; camera only if photo capture ships). |
| App Store viability | **High** | Capacitor apps are ordinary compiled iOS/Android apps from Apple/Google's perspective — no additional review risk beyond any WebView-based app (a long-established, accepted category). |
| Google Play viability | **High** | Same reasoning; Android additionally benefits from Trusted Web Activity familiarity in review teams. |
| Maintainability | **High** | One participant implementation, one set of tests, one place to fix the audio-codec/offline-queue defects already tracked. |
| Duplicated code | **Low (good)** | The explicit goal — see Target Repository Structure below. |
| Testability | **High** | Existing Vitest suites for the extracted logic keep working unchanged; Capacitor adds a thin native-shell layer that is tested separately (native build validation, not logic re-testing). |

### Option B — Expo / React Native using shared TypeScript domain/API packages

**Description.** Re-author the participant UI in React Native, sharing `packages/domain` and
`@witness/contracts` (already framework-agnostic TypeScript) but rebuilding every component:
`MediaRecorder` → `expo-av`/`react-native-audio-recorder-player`; IndexedDB → `expo-sqlite` or
`AsyncStorage`; `fetch`+`FormData` mostly transfers, but multipart upload semantics need
re-verification; every JSX component using DOM-specific styling (`min-h-dvh`, Tailwind classes) needs
re-authoring in React Native's `StyleSheet` model.

**Scored:** reuse **Low** (UI layer is a full rewrite; only domain/contracts types survive
unchanged), security **High** (native storage/permissions are first-class in Expo too), delivery
speed **Low** (a genuine rewrite under a hard deadline), audio recording **High** (true native
APIs, no WebView codec uncertainty), offline behaviour **High**, deep linking **High** (Expo Router
supports this well), secure token storage **High** (`expo-secure-store`), native permissions
**High**, App Store/Play viability **High**, maintainability **Medium** (a second, materially
different codebase to keep in sync with the web participant experience going forward — every future
participant-flow change is authored twice), duplicated code **High (bad)**, testability **Medium**
(RN component testing has more friction than the existing Vitest+React setup).

**Why not chosen:** directly contradicts "strongly prefer reuse over rewriting" for a deadline-driven
programme. The audio/native-permission advantages are real but do not fire any of ADR-0030's own
native triggers today — they are a hedge against a risk (WebView `MediaRecorder` insufficiency) that
has not been demonstrated, at the cost of a full UI rewrite now. Revisit if physical-device testing
(§ Native triggers, ADR-0030, unchanged) actually demonstrates the WebView audio path is insufficient
— Capacitor does not foreclose this; a native-audio Capacitor plugin is a smaller subsequent step
than migrating everything to RN would be today.

### Option C — PWA first, native distribution later

**Description.** Continue ADR-0030's PWA-only path; defer any native shell until a trigger fires.

**Why not chosen now:** does not satisfy the governing instruction's explicit, immediate deliverable
— a signed iOS release candidate, a signed Android release candidate, a TestFlight pass, and a
Google Play internal-test pass. A PWA alone cannot produce any of those four artifacts. This option
would have been correct advice *before* the business decision to pursue store distribution was made
(ADR-0030 made exactly this call, correctly, at the time); it is not correct advice *after* that
decision, which this ADR exists to record.

## What is reused unchanged vs. what is new

**Reused unchanged (imported, not copied):**

- `packages/domain` — every domain type/invariant the participant flow depends on.
- `@witness/contracts` — every request/response schema, so a drift check (mirroring
  `contracts-drift.test.ts`'s existing discipline) catches a mobile client and the API disagreeing,
  the same way it already catches the web client and the API disagreeing.
- The consent-category, governance-mode, and evidence-idempotency **semantics** — never reinvented,
  only re-hosted.

**Extracted into a shared package (new, but not duplicated once done):**

- `packages/participant-client` — `api.ts`'s participant-relevant methods (`getParticipantCaptureContext`,
  `captureParticipantEvidence`, `captureParticipantSelfConsent`, `getParticipantPrompt`,
  `getParticipantInsights`, `submitParticipantInsightResponse`, etc.), `offline-queue.ts`'s
  idempotent-retry logic (storage backend made pluggable — IndexedDB in the browser, a Capacitor
  `Preferences`/SQLite-backed adapter natively), and `capture-session.ts`'s token-lifecycle helpers.
  `apps/web`'s existing capture page imports from here too, so a fix lands once for both clients —
  directly satisfying "participant logic should not be duplicated unnecessarily between web and
  native clients" (§7 of the governing instruction).

**New:**

- `apps/participant-mobile` — the Capacitor shell: a minimal Vite+React build containing only the
  join/consent/capture/prompt/insights screens, plus the `ios/`/`android/` native projects Capacitor
  generates. No facilitator, admin, billing, or knowledge-graph route is ever imported into this
  build — the narrow attack surface the product boundary requires is enforced by what the build
  simply does not include, not by hiding navigation.

This is not built mechanically merely because an example structure was suggested — it is the direct
consequence of "participant logic should not be duplicated," given that logic currently lives inside
`apps/web` with no existing shared abstraction for a second client to import.

## Consequences

### Positive

- The single largest source of schedule risk (rewriting a working, if physically-unverified,
  participant flow) is avoided entirely.
- `packages/participant-client`'s extraction is itself a forcing function to finally add the unit
  test coverage ADR-0030 flagged as missing (`audio-recorder.tsx`, `offline-queue.ts` — zero test
  references today) — the extraction cannot be done responsibly without writing tests for the code
  being moved.
- The web participant experience gets **more** reliable as a side effect (bugs found while extracting
  shared logic get fixed once, for both clients), not less — satisfying "do not break existing
  product."

### Negative

- A WebView-hosted `MediaRecorder` is not verified against real iOS/Android hardware any more than
  the existing browser path is — this ADR does not close that gap, it inherits it. Physical-device
  acceptance (§19 of the governing instruction) is still the thing that closes it, not this decision.
- Capacitor introduces a genuinely new build/release surface (Xcode project, Gradle project, CocoaPods/
  SPM dependencies, native plugin versions) that the project has never operated before — real, if
  bounded, new maintenance cost.

### Risks accepted

- Shipping toward TestFlight/Play internal testing before physical-device audio/offline verification
  is complete is an explicit, time-boxed acceptance — identical in kind to the risk ADR-0030 already
  recorded for the PWA path, now extended to the native shell wrapping it. §19's physical-device
  matrix is the thing that closes this, and store submission remains **NO-GO** until it does (see
  `docs/mobile/MOBILE_RELEASE_GATES.md`).

## Architecture preserved (extends ADR-0030's diagram)

```text
                Witness API (services/api-gateway) + one domain (packages/domain)
                                        ^
                    ________________________________________________
                   |                    |                    |                     |
                  web                  PWA          packages/participant-client    |
           (apps/web, desktop)   (apps/web, installed)         ^                   |
                                                    apps/participant-mobile (Capacitor: iOS + Android)
```

No mobile-specific API gateway, database, user type, `Evidence` model, or consent model is introduced
by this ADR — identical constraint to ADR-0030, now also covering the native shell.
