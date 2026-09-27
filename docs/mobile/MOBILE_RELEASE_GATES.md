# Mobile release gates — Witness Participate

Tracks whether this programme is actually ready to submit to the App Store /
Play Store, gate by gate, with evidence for each status. **Compilation alone
never satisfies a gate** — several gates below are marked `PARTIAL` or
`BLOCKED` specifically because the only evidence available is "it builds,"
not "a human proved it on a real device."

**STORE SUBMISSION = GO only once every gate below is PASS.** As of this
document, that is not the case — see the summary at the bottom.

| Status | Meaning |
|---|---|
| **PASS** | Fully done, with evidence a human (not just a compiler) could check. |
| **PARTIAL** | Real progress exists, but a material piece is unverified or missing. |
| **BLOCKED** | Cannot proceed without a genuine external dependency (account, credential, hardware) this repository does not have. |
| **FAIL** | Attempted and found not to work. |

## M1 — Architecture

**Status: PASS.**

- ADR-0031 (`architecture/decisions/ADR-0031-witness-participate-mobile-runtime.md`)
  is Accepted, explicitly supersedes ADR-0030's no-native-companion clause,
  and states the reasoning against the alternatives considered (Expo/React
  Native full rewrite; PWA-only).
- Shared participant logic lives in exactly one place —
  `packages/participant-client` — consumed by both `apps/web` and
  `apps/participant-mobile`, not duplicated. `apps/web/src/lib/api.ts` was
  refactored to delegate to it rather than keep a parallel implementation
  (`refactor(capture): extract participant client`).
- `apps/participant-mobile` imports nothing from `apps/web`, `apps/api`
  (facilitator/admin surfaces), billing, or knowledge-graph code — verified
  by reading its own `package.json` dependency list and every import in
  `src/`, not merely by claiming narrow scope.

## M2 — Core participant functionality

**Status: PASS** (unit/build-verified) **— physical-device confirmation is
M6's job, not this gate's.**

- Session join (all four governance modes' context/copy), consent, text
  contribution, audio contribution (reusing `apps/web`'s proven
  `MediaRecorder` codec-negotiation logic unchanged), the offline queue, and
  the live prompt/insights companion panel are all implemented in
  `apps/participant-mobile/src/screens/*.tsx`.
- `WITNESS_PARTICIPATE_V1_SCOPE.md`'s IN list is fully implemented; its OUT
  list (photo/document capture UI) is deliberately absent, tracked as
  GitHub issue #236, with the backend contract left completely unchanged.
- 37 unit tests pass in `apps/participant-mobile` (deep-link parsing,
  runtime config, the app-level state machine, the secure-storage adapter),
  36 in `packages/participant-client`, and the full `apps/web` regression
  suite (30 tests, typecheck, lint, production build) passed unchanged after
  the extraction — see the commit history on this branch.

## M3 — Native shell

**Status: PARTIAL.**

- `apps/participant-mobile` builds a real, deployable static bundle
  (`vite build` — 258 KB gzipped to ~81 KB) that Capacitor's `webDir`
  points at.
- `cap add ios` and `cap add android` both completed successfully — real
  Xcode and Android Studio projects exist at
  `apps/participant-mobile/ios/App` and `apps/participant-mobile/android`,
  with `@aparajita/capacitor-secure-storage` and `@capacitor/app` correctly
  detected and wired into both native projects by Capacitor's own tooling.
- **Not verified:** an actual native compile. This environment has no
  Xcode (only command-line tools — `xcodebuild` fails) and no Android SDK
  (`ANDROID_HOME` unset, no `sdkmanager`/`adb`/`gradle`). "The project
  structure Capacitor generated is well-formed" and "this compiles to a
  running app on a device or simulator" are different claims, and only the
  first is proven here. **BLOCKED** on Xcode + a macOS environment with it
  installed (for iOS) and the Android SDK/Gradle toolchain (for Android) —
  see the HUMAN ACTION REQUIRED list in the checkpoint report.

## M4 — Security

**Status: PASS** for the backend-authoritative invariants;
**PARTIAL** for native-specific verification.

Backend-authoritative (proven against real Postgres or via the guard's own
unit tests, not merely by client-side route omission — the governing
instruction's explicit bar):

- A capture token alone is `UNAUTHENTICATED` against organisation,
  facilitator, billing, and platform actions
  (`authorization.guard.test.ts`'s new "capture token grants nothing here"
  suite).
- A join-link token and a capture token cannot substitute for each other
  (`participant-capture.live.test.ts`'s two new tests, run against real
  Postgres: 11/11 passing).
- Cross-participant isolation: one participant's token cannot read or
  attach evidence to another's, cannot forge attribution, and an idempotent
  retry never creates duplicate evidence (`participant-capture.live.test.ts`,
  pre-existing, re-verified: 11/11 passing).
- Expired tokens and withdrawn participants are rejected even with an
  otherwise-valid token row present (same file, pre-existing).
- The four files that handle raw tokens log nothing at all, proven
  statically rather than assumed (`token-logging.adversarial.test.ts`).
- `@witness/participant-client`'s own method surface is closed — exactly
  the 11 participant routes, structurally incapable of calling anything
  else, proven by asserting its exact method list
  (`packages/participant-client/src/api.test.ts`).

Native-specific, **PARTIAL** — real, but not yet physically proven:

- The deep-link parser rejects every malformed/wrong-host/wrong-path case
  tested (`deep-link.test.ts`, 12 tests) — but this is proven against
  hand-constructed URL strings, not yet against a real Universal Link /
  App Link handoff from iOS/Android (M6).
- The secure-storage adapter's shape-validation (`isCaptureSession`) fails
  safely on malformed stored data (`secure-capture-session-store.test.ts`)
  — but the underlying claim that this plugin genuinely uses Keychain/
  Keystore is verified from the plugin's own documentation
  (`SECURE_TOKEN_STORAGE.md`), not from inspecting a real device's Keychain
  directly.

## M5 — Privacy & compliance preparation

**Status: PARTIAL.**

- `docs/mobile/STORE_PRIVACY_DATA_MAP.md` inventories every data category
  this app actually handles, with no analytics/advertising/crash-reporting
  SDK anywhere in the dependency tree.
- Permissions requested are minimal and justified: microphone only: no
  camera (QR joining uses the OS Camera app + a Universal/App Link instead),
  no location, no contacts, no Bluetooth, no advertising identifier, no
  background microphone, no broad storage — verified directly from
  `AndroidManifest.xml` and `Info.plist`, not merely claimed.
- **HUMAN/LEGAL REVIEW REQUIRED** (listed explicitly in
  `STORE_PRIVACY_DATA_MAP.md`): the exact wording of the microphone usage
  descriptions, and whether session context / consent decisions need a
  store-form disclosure despite not being client-persisted. Neither store's
  actual Privacy/Data Safety form has been filled in — that requires a
  human with access to the App Store Connect / Play Console listings this
  repository has no account for.

## M6 — Physical device verification

**Status: BLOCKED.**

`docs/testing/MOBILE_ACCEPTANCE.md`'s new "Native Witness Participate app"
section (28 rows across iOS and Android, plus a 6-item pre-testing setup
checklist) exists and is ready to run, but **zero rows have been executed**
— this environment has no Xcode, no Android SDK, and no physical device
connection. This is the same honest limitation `ADR-0030`'s own acceptance
sheet already documented for the browser/PWA rows, now extended to the
native build specifically. Nothing in M1-M5 substitutes for this gate; per
the governing instruction, "do not call the programme store-ready based on
compilation alone."

## M7 — Distribution

**Status: BLOCKED.**

None of the following exist in this environment, and none can be created
without a human's direct participation:

- An Apple Developer Program account/Team ID, a registered bundle
  identifier, a signing certificate, a provisioning profile, or an App
  Store Connect app record.
- A Google Play Console account/app record, a release keystore, or a Play
  App Signing enrollment.
- Published `apple-app-site-association` / `assetlinks.json` files on a
  live host (`docs/mobile/DEEP_LINKING.md`'s HUMAN ACTION REQUIRED items).
- A completed App Store Privacy Nutrition Label or Play Data Safety form
  (M5 prepares the data for these; submitting them requires store-account
  access).

See the final checkpoint's HUMAN ACTION REQUIRED list for the exact,
itemised asks.

## Summary

| Gate | Status |
|---|---|
| M1 — Architecture | PASS |
| M2 — Core functionality | PASS |
| M3 — Native shell | PARTIAL (BLOCKED on Xcode/Android SDK for a real compile) |
| M4 — Security | PASS (backend) / PARTIAL (native-specific physical proof) |
| M5 — Privacy & compliance prep | PARTIAL (HUMAN/LEGAL REVIEW REQUIRED items open) |
| M6 — Physical device verification | BLOCKED (no hardware/toolchain in this environment) |
| M7 — Distribution | BLOCKED (no Apple/Google accounts, signing, or DNS in this environment) |

**STORE SUBMISSION = NO-GO.** M3, M6, and M7 are not PASS, and M4/M5 are not
fully PASS. Do not submit to Apple or Google on the strength of M1/M2 alone.
