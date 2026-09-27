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

**Status: PARTIAL** — Android compiles for real, in CI; iOS does not compile
anywhere yet.

| Item | Status | Evidence |
|---|---|---|
| Android source project | **PASS** | `cap add android` completed; real Android Studio project at `apps/participant-mobile/android`, plugins correctly wired |
| Android CI | **PASS** | `.github/workflows/mobile-android.yml` — real execution, not just valid YAML: [run 36302658382](https://github.com/scigns/witness/actions/runs/36302658382), `SUCCESS`, ~4 minutes, on a clean GitHub-hosted runner (see `docs/infrastructure/DEPLOYMENT_TOPOLOGY.md`'s CI-reproducibility proof) |
| Android debug APK | **PASS** | Produced by that run — `witness-participate-ce30f5b-debug-apk`, 4,220,977 bytes, verified as a genuine multi-dex APK with a real `AndroidManifest.xml` (downloaded and inspected directly, not assumed from the log) |
| Android release AAB | **PASS** (unsigned) | Same run — `witness-participate-ce30f5b-release-unsigned-aab`, 3,257,815 bytes. "Compiles as a release bundle" and "signed, store-uploadable" are different claims; only the first is proven |
| Android signing | **BLOCKED** | No keystore exists anywhere in this repository or in CI (governing instruction: never commit one, never fabricate a production key). See M7 |
| Android physical device | **BLOCKED** | No physical Android device or emulator in this environment — see M6 |
| iOS source project | **PASS** | `cap add ios` completed; real Xcode project at `apps/participant-mobile/ios/App`, plugins correctly wired |
| iOS local Xcode build | **BLOCKED** | No Xcode in this environment (CLI tools only — `xcodebuild` fails). Per the governing instruction, iOS stays Mac-first for this program — no GitHub macOS runner was substituted |
| iOS signing | **BLOCKED** | No Apple Developer account, Team ID, certificate, or provisioning profile exists — see M7 |
| iOS physical device | **BLOCKED** | No physical iPhone available in this environment — see M6 |
| TestFlight | **BLOCKED** | Depends on iOS signing and an App Store Connect app record, neither of which exists — see M7 |

**What changed this cycle:** Android compilation is no longer blocked on
this Mac having an SDK installed — it is proven, for real, in GitHub
Actions. Two genuine CI-configuration defects were found and fixed on the
way there (both are real toolchain facts, not guesses):

1. `pnpm --filter X lint/typecheck/test/build` does not build workspace
   dependencies first the way `turbo run` does — the first run failed with
   "cannot find module `@witness/contracts`/`@witness/participant-client`".
   Fixed by switching to `turbo run <task> --filter=...`, matching how
   `ci.yml`'s own `make lint`/`make typecheck` already work.
2. Capacitor 8's own Android library
   (`node_modules/@capacitor/android/capacitor/build.gradle`) requires JDK
   21 to compile (`sourceCompatibility`/`targetCompatibility
   JavaVersion.VERSION_21`) — distinct from AGP 8.13's own minimum JDK to
   *run* Gradle (17). The second run failed with `invalid source release:
   21` until this was corrected.

iOS remains exactly where it was: `cap add ios` produced a well-formed
project, and nothing further has been attempted, per the governing
instruction's explicit "do not attempt to replace Xcode/macOS in this
task."

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

**Status: BLOCKED** — but the Android path is closer than it was:
`docs/testing/MOBILE_ACCEPTANCE.md`'s "Native Witness Participate app"
section (28 rows across iOS and Android, plus a 6-item pre-testing setup
checklist) exists and is ready to run, and there is now a real,
CI-verified debug APK to install for it
(`witness-participate-ce30f5b-debug-apk`, from
[run 36302658382](https://github.com/scigns/witness/actions/runs/36302658382),
expires 2026-10-11 — a fresh one is one `workflow_dispatch` or PR away).
**Zero rows have still been executed** — this environment has no physical
Android device, and no Xcode/physical iPhone for the iOS half at all. A
generated APK is not a substitute for a human tapping a real recorder
control on a real phone; per the governing instruction, "do not call the
programme store-ready based on compilation alone." The preferred next step
for Android specifically is exactly `docs/infrastructure/DEPLOYMENT_TOPOLOGY.md`'s
"CI artifact → physical device" path (section 29 of the governing
instruction) — not installing an emulator merely to avoid finding a
physical device.

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

See the final checkpoint's HUMAN ACTION REQUIRED list for the exact,
itemised asks.

## Summary

| Gate | Status |
|---|---|
| M1 — Architecture | PASS |
| M2 — Core functionality | PASS |
| M3 — Native shell | PARTIAL — Android build logic PASS (real CI compile, verified debug APK + unsigned release AAB); Android signing/physical-device and all of iOS remain BLOCKED |
| M4 — Security | PASS (backend) / PARTIAL (native-specific physical proof) |
| M5 — Privacy & compliance prep | PARTIAL (HUMAN/LEGAL REVIEW REQUIRED items open) |
| M6 — Physical device verification | BLOCKED (no hardware/toolchain in this environment) |
| M7 — Distribution | BLOCKED (no Apple/Google accounts, signing, or DNS in this environment) |

**STORE SUBMISSION = NO-GO.** M3, M6, and M7 are not PASS, and M4/M5 are not
fully PASS. Do not submit to Apple or Google on the strength of M1/M2 alone.
