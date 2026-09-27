# Mobile release gates — Witness Participate

**Owner:** Engineering (Mobile release programme)
**Status:** Active — see the summary at the bottom for the current gate-by-gate state

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

**Status: PARTIAL** — Android build logic proven twice, independently, in
CI; Android physical acceptance and all of iOS remain blocked on external
dependencies this environment genuinely does not have.

### Android

| Item | Status | Evidence |
|---|---|---|
| Android CI compile | **PASS** | `.github/workflows/mobile-android.yml`, reproduced across three independent green runs on PR #254 (most recently [36308447009](https://github.com/scigns/witness/actions/runs/36308447009), head `098ce02`, merge-ref build) |
| Android debug APK | **PASS** | Same run — `witness-participate-62f4b93-debug-apk`. Downloaded via `gh run download`, extracted size 4,581,839 bytes, SHA-256 `e7a2b89c572b11a22caaa52a1ec5808a3669eb0ead40276a5b19dd5acf2c33c8` (computed locally, not copied from a log) |
| Android release AAB build logic | **PASS** (unsigned) | Same run — `witness-participate-62f4b93-release-unsigned-aab`, 3,257,815 bytes. "Compiles as a release bundle" and "signed, store-uploadable" are different claims; only the first is proven |
| Android release signing | **BLOCKED** | No keystore exists anywhere in this repository or in CI — see `docs/mobile/STORE_ACCOUNT_SETUP.md` and M7 |
| Android physical install | **BLOCKED** | `adb devices` returns an empty list — no physical Android device connected to this Mac. `platform-tools` (adb/fastboot only, ~30 MB via Homebrew cask) was installed to make this check possible without installing the Android SDK or Android Studio, per the governing instruction |
| Android physical journey | **BLOCKED** | Depends on the above — nothing in `MOBILE_ACCEPTANCE.md`'s native Android rows has been executed |
| Android verified App Link | **BLOCKED** | `assetlinks.json` still carries its `<SHA256_SIGNING_CERT_FINGERPRINT>` placeholder (no release keystore exists to produce a real one) — local intent-filter handling (`AndroidManifest.xml`'s `autoVerify` intent-filter) is configured, but domain-verified association cannot be proven until a real fingerprint is published |
| Google Play internal testing | **BLOCKED** | No Play Console account, no signed AAB — see `docs/mobile/STORE_ACCOUNT_SETUP.md` |

**What changed this cycle:** the Android CI proof from the previous cycle
was reproduced end-to-end — same commit's merge-ref build, downloaded and
independently checksummed. `platform-tools` was added locally (adb/fastboot
only) specifically to make the "no physical device" finding a checked fact
rather than an assumption. No physical Android device was available to
progress further.

### iOS

| Item | Status | Evidence |
|---|---|---|
| iOS project generated | **PASS** | `cap add ios` completed; real Xcode project at `apps/participant-mobile/ios/App`, bundle id `com.buildwithwitness.participate`, deployment target iOS 15.0, Swift 5.0, `CODE_SIGN_STYLE = Automatic` — read directly from `project.pbxproj` |
| iOS dependencies resolve | **NOT VERIFIED** | `CapApp-SPM/Package.swift` declares three Swift Package Manager dependencies (`capacitor-swift-pm` from GitHub, plus two local `node_modules` paths for the installed plugins) — no `Package.resolved` file exists anywhere in the project, meaning SPM has never actually run against it. Resolution requires `xcodebuild`/Xcode, which is unavailable (below) |
| iOS simulator/generic compile | **BLOCKED** | `xcodebuild -project App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator build` fails immediately: `xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory '/Library/Developer/CommandLineTools' is a command line tools instance`. This Mac has Command Line Tools only, not the full Xcode.app — CLI tools cannot build an iOS app target against the `iphonesimulator` SDK. **Genuine environment blocker, classified XCODE CONFIGURATION, not an application defect** — installing full Xcode was evaluated and not attempted: this Mac has 11 GB free disk, and Xcode.app alone (before any simulator runtime) typically requires well over that |
| iOS signing | **BLOCKED** | No Apple Developer account, Team ID, certificate, or provisioning profile — see `docs/mobile/STORE_ACCOUNT_SETUP.md` |
| iOS physical install | **BLOCKED** | No physical iPhone available, and no compiled build to install even if one were |
| iOS Universal Link — client config | **PARTIAL** | `App.entitlements` exists with the correct `com.apple.developer.associated-domains` content (`applinks:witness-prod-web.pacificdigitalconsultancy.org`, `applinks:app.buildwithwitness.com`) — **but it is not wired into the Xcode project**: `project.pbxproj` contains no `CODE_SIGN_ENTITLEMENTS` build setting referencing it at all, confirmed by direct `grep`, not assumed. The file has existed since the previous cycle but was never actually attached to a build target — doing so requires Xcode's Signing & Capabilities UI (or careful manual `.pbxproj` editing this session chose not to attempt blind, per that same caution from the prior cycle) |
| iOS Universal Link — AASA file template | **PASS** (template only) | `apps/web/public/.well-known/apple-app-site-association` exists with the correct `paths`/structure and an explicit `<TEAM_ID>` placeholder |
| iOS Universal Link — live verified association | **BLOCKED** | Requires a real Team ID, the entitlement actually wired into a signed build, and the AASA file published on a live host — none of which exist |
| TestFlight | **BLOCKED** | Depends on iOS signing and an App Store Connect app record, neither of which exists |

**What changed this cycle:** the iOS project's actual configuration was
read in full (bundle id, deployment target, Swift version, signing style,
SPM dependencies, entitlements content) rather than only noting "Xcode
unavailable" as before — and the entitlements-not-wired-into-the-project
gap was found and documented precisely, which the previous cycle's summary
did not distinguish from "entitlements file doesn't exist." The `xcodebuild`
failure itself is unchanged and remains a genuine external blocker: no
Xcode, and no reasonable path to installing it on 11 GB of free disk.

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

**Status: BLOCKED** — actively checked this cycle, not merely restated.
`adb devices` (via a freshly-installed `platform-tools` — adb/fastboot
only, not the Android SDK or Android Studio) returns an empty device list:
no physical Android device is connected to this Mac. No Xcode and no
physical iPhone exist for the iOS half either. A freshly-downloaded,
independently-checksummed debug APK
(`witness-participate-62f4b93-debug-apk`, SHA-256
`e7a2b89c572b11a22caaa52a1ec5808a3669eb0ead40276a5b19dd5acf2c33c8`) is
sitting ready in a scratch directory outside version control, and
`docs/testing/MOBILE_ACCEPTANCE.md`'s native-app rows are ready to run —
**zero rows have been executed**. A generated APK is not a substitute for a
human tapping a real recorder control on a real phone; per the governing
instruction, "do not call the programme store-ready based on compilation
alone."

**HUMAN ACTION REQUIRED:** connect an Android phone by USB (with USB
debugging enabled) to this Mac, or otherwise make one available, to
progress `MOBILE_ACCEPTANCE.md`'s native Android rows (N1-N14). Once
connected, `adb install <the downloaded APK>` is the next command — no
rebuild needed.

## M7 — Distribution

**Status: BLOCKED.**

None of the following exist in this environment, and none can be created
without a human's direct participation:

- An Apple Developer Program account/Team ID, a registered bundle
  identifier, a signing certificate, a provisioning profile, or an App
  Store Connect app record.
- A Google Play Console account/app record, a release keystore, or a Play
  App Signing enrollment. **Distinct from M3 now:** the Android *build
  logic* itself is proven (M3, above) — this line is specifically about
  the signing credential and store account, not "does it compile."
- Published `apple-app-site-association` / `assetlinks.json` files on a
  live host (`docs/mobile/DEEP_LINKING.md`'s HUMAN ACTION REQUIRED items).
- A completed App Store Privacy Nutrition Label or Play Data Safety form
  (M5 prepares the data for these; submitting them requires store-account
  access).

`docs/mobile/STORE_ACCOUNT_SETUP.md` is the concrete, itemised checklist
for all of the above — what exactly to create, in what order, and what
each unblocks. See the final checkpoint's HUMAN ACTION REQUIRED list for
the same items in summary form.

## Summary

| Gate | Status |
|---|---|
| M1 — Architecture | PASS |
| M2 — Core functionality | PASS |
| M3 — Native shell | PARTIAL — Android build logic PASS (real CI compile, verified debug APK + unsigned release AAB, reproduced twice); Android signing/physical-device/verified-App-Link and all of iOS (including a confirmed `xcodebuild` environment blocker) remain BLOCKED |
| M4 — Security | PASS (backend) / PARTIAL (native-specific physical proof) |
| M5 — Privacy & compliance prep | PARTIAL (HUMAN/LEGAL REVIEW REQUIRED items open) |
| M6 — Physical device verification | BLOCKED — actively checked: `adb devices` confirms no Android device connected; no Xcode/iPhone for iOS |
| M7 — Distribution | BLOCKED (no Apple/Google accounts, signing, or DNS in this environment) |

**STORE SUBMISSION = NO-GO.** M3, M6, and M7 are not PASS, and M4/M5 are not
fully PASS. Do not submit to Apple or Google on the strength of M1/M2 alone.
