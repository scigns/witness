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

Four separate, non-substitutable evidence levels — see
`docs/mobile/CLOUD_ANDROID_TESTING.md`'s framing. Cloud evidence never
silently marks a physical row PASS, and vice versa.

| Item | Status | Evidence |
|---|---|---|
| Android web mobile (Level A) | **PASS** | Browser-based mobile acceptance rows 1-22 in `docs/testing/MOBILE_ACCEPTANCE.md`, proving the responsive participant UX/API/consent/offline path independent of native packaging |
| Android CI build (Level B) | **PASS** | `.github/workflows/mobile-android.yml`, reproduced across **six** independent green runs on PR #254 (most recently [36318738995](https://github.com/scigns/witness/actions/runs/36318738995), head `967668e` — matches this branch's current HEAD exactly, not a stale build) |
| Android debug APK | **PASS** | Same run — `witness-participate-c4f335f-debug-apk`. Downloaded via `gh run download` to `/tmp/witness-android-acceptance` (outside the repository, never committed), size 4,581,839 bytes, SHA-256 `cf3974624e6aa2b9f52e63ffe6e92075116bfdd4a080584a87d78cf4df51c69a` (computed locally, not copied from a log) |
| Android release AAB build logic | **PASS** (unsigned) | Same run — `witness-participate-c4f335f-release-unsigned-aab`, 3,257,815 bytes. "Compiles as a release bundle" and "signed, store-uploadable" are different claims; only the first is proven |
| Android cloud install (Level C) | **BLOCKED** | `.github/workflows/mobile-android-cloud.yml` exists and its probe/skip path is proven in a real CI run, but the Firebase project + Workload Identity Federation setup it depends on has not been performed — see `docs/mobile/CLOUD_ANDROID_TESTING.md` and the HUMAN ACTION REQUIRED item. Zero cloud device evidence exists yet |
| Android cloud launch (Level C) | **BLOCKED** | Same — depends on the above |
| Android cloud participant flow (Level C) | **BLOCKED** | Same. Note even once cloud install/launch exist, only Robo (crash/navigation smoke evidence) is wired up — an authoritative JOIN→CONSENT→CAPTURE→SUBMISSION proof would need an instrumentation suite this repository does not yet have (`docs/mobile/CLOUD_ANDROID_TESTING.md`'s "Automated participant journey" section) |
| Android cloud security | **BLOCKED** | Same — no cloud run has ever executed |
| Android cloud audio | **BLOCKED** | Same. Even once available, cloud audio evidence is capped at "permission path / recorder init / no crash," never real microphone quality — see `CLOUD_ANDROID_TESTING.md` |
| Android physical install (Level D) | **BLOCKED** | `adb devices` returns an empty list — no physical Android device connected to this Mac. `platform-tools` (adb/fastboot only, ~30 MB via Homebrew cask) was installed to make this check possible without installing the Android SDK or Android Studio |
| Android physical participant flow (Level D) | **BLOCKED** | Depends on the above — nothing in `MOBILE_ACCEPTANCE.md`'s native Android rows has been executed |
| Android physical audio | **BLOCKED** | Same |
| Android signing | **BLOCKED** | No keystore exists anywhere in this repository or in CI — see `docs/mobile/STORE_ACCOUNT_SETUP.md` and M7 |
| Android verified App Link | **BLOCKED** | `assetlinks.json` still carries its `<SHA256_SIGNING_CERT_FINGERPRINT>` placeholder (no release keystore exists to produce a real one) — local intent-filter handling (`AndroidManifest.xml`'s `autoVerify` intent-filter) is configured, but domain-verified association cannot be proven until a real fingerprint is published |
| Google Play internal testing | **BLOCKED** | No Play Console account, no signed AAB — see `docs/mobile/STORE_ACCOUNT_SETUP.md` |
| Google Play production | **BLOCKED** | Depends on every row above |

**What changed this cycle:** re-verified from scratch, not assumed from the
previous checkpoint — PR #254 re-inspected fresh (19/19 checks green,
independently confirmed via the GitHub API), the latest Android CI run
matched against the current branch HEAD by SHA before treating its
artifact as current, and a fresh APK downloaded and independently
checksummed (the stale artifact from the prior cycle's HEAD was discarded,
per the governing instruction's explicit "do NOT use the stale APK").
`adb devices` was re-run and again returned no device.

Investigated and designed, but genuinely blocked on a human account-setup
step: cloud Android acceptance (Level C). Firebase Test Lab was verified —
against Google's own current documentation, not assumed — to support a
free, zero-billing, zero-payment-method path (Spark plan, 10 free
virtual-device test runs/day) and keyless CI authentication (Workload
Identity Federation, no long-lived service-account key). A new workflow,
`mobile-android-cloud.yml`, is written, committed, and its skip-when-
unconfigured path proven in a real GitHub Actions run. The setup itself has
been reduced to one irreducible console step (creating the Firebase
project — no CLI does this non-interactively) followed by one idempotent
script, `scripts/mobile/setup-firebase-test-lab.sh`, that creates the
service account (narrowest documented roles, verified against Firebase's
own IAM permissions page — an earlier draft incorrectly assumed a role
that does not exist) and the Workload Identity Pool/provider, printing the
three `vars.*` values to add — but **no human has run it yet**, no
Firebase/GCP project exists, and zero cloud-device evidence exists. See
`docs/mobile/CLOUD_ANDROID_TESTING.md` for the full design and the
checkpoint's HUMAN ACTION REQUIRED block for the exact steps.

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
  safely on malformed stored data (`secure-capture-session-store.test.ts`).
  This cycle, the plugin's genuine use of platform secure storage was
  re-verified from its actual **source code**, not merely its documentation
  as before — iOS: `Plugin.swift` imports `KeychainSwift`
  (`evgenyneu/keychain-swift`, a real, independent Keychain-Services
  wrapper), with no `UserDefaults` reference anywhere in the file; Android:
  `SecureStorage.java` references `"AndroidKeyStore"` directly. Neither
  claim has yet been confirmed by inspecting a real device's Keychain/
  Keystore contents directly — that still requires the blocked M6 physical
  acceptance. A sweep of `apps/participant-mobile/src` for any
  `console.log`/plain-`localStorage` use of the capture token found none.

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

**Status: BLOCKED** — re-checked this cycle, not carried forward as an
assumption. `adb devices` (platform-tools already installed from a
previous cycle — adb/fastboot only, not the Android SDK or Android Studio)
again returns an empty device list: no physical Android device is
connected to this Mac. No Xcode and no physical iPhone exist for the iOS
half either. A freshly-downloaded, independently-checksummed debug APK for
the current branch HEAD
(`witness-participate-c4f335f-debug-apk`, SHA-256
`cf3974624e6aa2b9f52e63ffe6e92075116bfdd4a080584a87d78cf4df51c69a`) is
sitting ready in `/tmp/witness-android-acceptance` outside version control,
and `docs/testing/MOBILE_ACCEPTANCE.md`'s native-app rows are ready to run
— **zero rows have been executed**. A generated APK is not a substitute for
a human tapping a real recorder control on a real phone; per the governing
instruction, "do not call the programme store-ready based on compilation
alone." **This cycle also designed (but could not execute) a cloud-Android
path** — see M3's Android table and `docs/mobile/CLOUD_ANDROID_TESTING.md`
— which, once a human completes its one-time Firebase setup, gives a
repeatable Level C smoke check that reduces uncertainty before physical
testing without ever substituting for it.

**HUMAN ACTION REQUIRED (two independent paths, either helps):**

1. Connect an Android phone by USB (with USB debugging enabled) to this
   Mac, or otherwise make one available, to progress
   `MOBILE_ACCEPTANCE.md`'s native Android rows (N1-N14) directly. Once
   connected, `adb install <the downloaded APK>` is the next command — no
   rebuild needed.
2. Complete the one-time Firebase/Workload Identity Federation setup in
   `docs/mobile/CLOUD_ANDROID_TESTING.md` to unlock Level C cloud
   acceptance via `mobile-android-cloud.yml` — faster to arrange than a
   physical device, but proves less (see that document's explicit "what
   this buys us, and what it does not").

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
| M3 — Native shell | PARTIAL — Android CI build logic PASS (real CI compile, verified debug APK + unsigned release AAB, reproduced across six independent runs including the current HEAD); Android cloud acceptance designed and its skip-path proven but BLOCKED on a human Firebase setup step; Android signing/physical-device/verified-App-Link and all of iOS (including a confirmed `xcodebuild` environment blocker) remain BLOCKED |
| M4 — Security | PASS (backend) / PARTIAL (native-specific physical proof — secure-storage plugin now verified from source on both platforms, not just documentation) |
| M5 — Privacy & compliance prep | PARTIAL (HUMAN/LEGAL REVIEW REQUIRED items open) |
| M6 — Physical device verification | BLOCKED — re-checked, not assumed: `adb devices` confirms no Android device connected; no Xcode/iPhone for iOS. Cloud Android acceptance (a distinct, non-substitutable evidence level) also BLOCKED pending human Firebase setup |
| M7 — Distribution | BLOCKED (no Apple/Google accounts, signing, or DNS in this environment) |

**STORE SUBMISSION = NO-GO.** M3, M6, and M7 are not PASS, and M4/M5 are not
fully PASS. Do not submit to Apple or Google on the strength of M1/M2 alone.
