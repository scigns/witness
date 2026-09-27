# Cloud Android testing — Witness Participate

**Owner:** Engineering (Mobile release programme)
**Status:** Active — feasibility verified against official Google documentation; setup not yet
performed (requires a human Google account)

Investigates whether the existing CI-generated Witness Participate APK can be
executed against a real (virtual) Android device without installing Android
Studio, an emulator, or the Android SDK on any contributor's Mac, and without
this repository or CI ever holding a long-lived cloud credential unnecessarily.

This is **Level C** evidence in the four-level model this programme uses:

```text
Level A — Mobile web (browser)         proves the participant UX, not native packaging
Level B — Android CI (GitHub Actions)  proves the APK compiles — already achieved
Level C — Cloud Android                proves the APK installs and runs on Android
Level D — Physical Android             the final native acceptance gate before store release
```

**Cloud testing does not replace physical-device acceptance.** It reduces
uncertainty before physical testing, and gives a repeatable, CI-triggerable
smoke check that does not depend on a phone being physically connected to a
particular Mac.

## Provider: Firebase Test Lab

Chosen as the provider to investigate first, per this program's own
instruction — findings below, verified against Google's own published
documentation (not assumed), on 2026-09-27.

### Cost and billing — verified, not assumed

| Question | Answer | Source |
|---|---|---|
| Does Test Lab require the paid Blaze plan? | **No.** | "Firebase Test Lab and Android Device Streaming provide a Cloud API quota and a testing quota, which is included in the standard Spark and Blaze pricing plans" — [firebase.google.com/docs/test-lab/usage-quotas-pricing](https://firebase.google.com/docs/test-lab/usage-quotas-pricing) |
| Free daily quota on the Spark (free) plan? | **10 test runs per day on virtual devices.** | Same page |
| Does creating a Spark-plan Firebase project require a credit card? | **No.** "No payment method needed" is listed as a defining feature of Spark. | [firebase.google.com/pricing](https://firebase.google.com/pricing) |
| Physical devices in Test Lab? | Out of scope here — physical Test Lab devices are a Blaze-only, paid feature. This document only pursues the free virtual-device path. | Same pages |

**Conclusion: a Spark-plan Firebase project gives 10 free virtual-device
test runs per day, with zero billing account and zero payment method
required.** This satisfies the governing instruction's "do not create paid
resources, enable billing, enter credit-card details" constraint outright —
the free path is sufficient for this programme's minimum-proof goal and for
a conservative, manually-triggered acceptance cadence (see "Triggers"
below).

### Authentication for CI — verified, not assumed

Google's own `google-github-actions/auth` action supports two authentication
modes:

1. **Service account JSON key** (long-lived, must be stored as a secret,
   rotated manually) — **not used here**, per the governing instruction's
   preference for short-lived/federated authentication where feasible.
2. **Workload Identity Federation** (keyless — GitHub Actions' own OIDC
   token is exchanged for short-lived Google credentials, nothing long-lived
   ever stored anywhere) — "recommended over Service Account Keys as it
   obviates the need to export a long-lived credential"
   ([github.com/google-github-actions/auth](https://github.com/google-github-actions/auth)).

**This document specifies Workload Identity Federation.** No service account
JSON key is used, requested, or should ever be created for this purpose.

### What a human must set up (cannot be done by this repository or by Claude)

Exactly one step requires clicking through the Firebase console; everything
after it is scripted and idempotent
(`scripts/mobile/setup-firebase-test-lab.sh`). See the release checkpoint's
HUMAN ACTION REQUIRED block for the step-by-step version aimed at a
non-specialist.

1. **Console (irreducible — no CLI creates a Firebase project
   non-interactively without additional tooling this repository does not
   depend on):** at [console.firebase.google.com](https://console.firebase.google.com),
   create a new project, name it something identifying its purpose (e.g.
   "Witness Mobile Test Lab"), and **decline/skip Google Analytics** when
   offered (not needed for Test Lab, and keeps the project's permission
   surface smaller). Stay on the Spark (free) plan — no payment method is
   requested. Note the **Project ID** shown (not the display name) — it
   looks like `witness-mobile-test-lab-a1b2c3`.
2. **CLI, from here on (`gcloud auth login` first, with the Google account
   that owns that project):**

   ```bash
   gcloud config set project <PROJECT_ID>
   bash scripts/mobile/setup-firebase-test-lab.sh <PROJECT_ID>
   ```

   This single script:
   - enables exactly six APIs: `iam.googleapis.com`,
     `iamcredentials.googleapis.com`, `sts.googleapis.com`,
     `cloudresourcemanager.googleapis.com`, `testing.googleapis.com`,
     `toolresults.googleapis.com` — nothing broader;
   - creates one dedicated service account and grants it
     `roles/cloudtestservice.testAdmin` + `roles/firebase.analyticsViewer`
     — the narrowest combination Firebase's own documentation names for
     submitting Test Lab runs via `gcloud`
     ([firebase.google.com/docs/projects/iam/permissions](https://firebase.google.com/docs/projects/iam/permissions)'s
     "Test Lab" section) — **never** Owner or Editor. That page's own
     caveat, repeated honestly here: these roles can read *all* Cloud
     Storage buckets in the project, not just Test Lab's — acceptable only
     because this project is dedicated to mobile testing and holds no
     customer data by design;
   - creates a Workload Identity Pool and an OIDC provider, with an
     attribute condition scoped to **this repository's
     `mobile-android-cloud.yml` workflow specifically** (via GitHub's
     `job_workflow_ref` OIDC claim), not merely "any workflow in this
     repo" — tighter than the minimum Google's own guide recommends
     ("Always add an Attribute Condition to restrict entry"), and
     deliberately does not scope to one specific branch/ref, since the
     workflow is dispatched from whatever branch needs a release check;
   - creates **no downloadable credential of any kind** — prints the three
     `vars.*` values `mobile-android-cloud.yml` already expects
     (`FIREBASE_PROJECT_ID`, `FIREBASE_WORKLOAD_IDENTITY_PROVIDER`,
     `FIREBASE_SERVICE_ACCOUNT`) for the human to review and add as GitHub
     repository **variables** (not secrets — none of these three values is
     secret material; that is the entire point of Workload Identity
     Federation over a service account key), either via the GitHub UI or
     the `gh variable set` commands the script itself prints.

**No credential from this setup should ever be pasted into a chat
session** — and this setup produces none to paste; that is by design.
Steps 2-4 are performed directly in the Google Cloud/GitHub UI or via
`gcloud`/`gh` run by the human themselves.

### CLI commands — verified, not assumed

Robo test (automated exploration, no test code required — the default test
type if `--type` is omitted):

```bash
gcloud firebase test android run \
  --type robo \
  --app app-debug.apk \
  --device model=<MODEL_ID>,version=<API_LEVEL>,locale=en,orientation=portrait \
  --timeout 90s
```

Listing what's actually available (**required before the first real run** —
this document deliberately does not hard-code a device model, since neither
this repository's build environment nor Claude has credentials to query the
live catalog and confirm one exists):

```bash
gcloud firebase test android models list
gcloud firebase test android versions list
```

Results: "a basic summary of your test results is printed by the gcloud
tool," plus a link to the Firebase console; detailed artifacts (logs,
screenshots, video where captured) live in a Google Cloud Storage bucket the
console link resolves to.

## What this buys us, and what it does not

Cloud (virtual-device) execution can prove:

- the APK installs without error
- the native application launches
- the Capacitor WebView bootstraps and the participant shell renders
- the app does not crash on startup or basic navigation
- permission-request code paths execute without crashing

It cannot prove, and this document does not claim it proves:

- real microphone audio quality or field-recording behaviour
- real interruption handling (an actual incoming phone call, real Bluetooth
  headset pairing)
- performance/battery characteristics of a real handset
- anything about iOS — Firebase Android Test Lab has no bearing on the iOS
  gate, which remains exactly `Mac → full Xcode → native compile → signing
  → physical iPhone → TestFlight`, unchanged by this document

See `docs/mobile/MOBILE_RELEASE_GATES.md` for how cloud and physical
Android evidence are tracked as distinct, non-substitutable rows.

## Workflow design

`.github/workflows/mobile-android-cloud.yml` — see that file's own header
comment for the full rationale. Summary:

- **Does not rebuild the APK.** Downloads the artifact already produced by
  `mobile-android.yml` for a given run, preserving the provenance chain
  `source SHA → CI build → APK SHA → cloud test → result`.
- **`workflow_dispatch` only, for now** — not automatic on every PR/push.
  With a 10-run/day free quota shared across however many times this
  workflow fires, an automatic trigger on every mobile-relevant commit would
  risk exhausting the quota on ordinary development churn before a genuine
  release-candidate check needs it. Per the governing instruction's own
  "start with ONE Android configuration... expand only after evidence shows
  device fragmentation warrants it," the trigger cadence gets the same
  conservative treatment.
- **Skips gracefully, not a hard failure, when the required secrets are
  absent** — the same "probe first, warn loudly, record as tracked debt"
  pattern `security.yml`'s dependency-review job already uses in this
  repository for an equivalent "platform feature might not be configured
  yet" situation. This lets the workflow be committed and merged now
  without breaking anything, and light up the moment a human completes the
  setup above — no second pull request needed.
- **Robo test only, for v1** — no instrumentation test suite exists yet (see
  "Automated participant journey," below, for why that remains a documented
  option rather than something built in this pass).

## Automated participant journey — evaluated, not built this cycle

The governing instruction asked for investigation of the smallest
maintainable mechanism to automate `launch → join → consent → text capture
→ submit → confirmation` against a cloud device. Findings:

- **Robo testing** (already wired into the workflow above) explores the app
  automatically but is **not** authoritative proof of the governed
  participant journey — it can report a crash-free launch and basic
  navigation, nothing about whether a *specific* join link was followed,
  consent was actually granted, or a submission was actually confirmed by
  the real backend. This document does not claim otherwise, and the release
  gates document marks the distinction explicitly (see governing
  instruction: "Do not mark JOIN → CONSENT → CAPTURE → SUBMISSION PASS
  solely because Robo navigated around the application").
- **Android instrumentation (Espresso/UI Automator)** would be the correct
  mechanism to actually drive the golden journey deterministically, but
  **does not exist in this repository yet** — `apps/participant-mobile`
  has no `androidTest` source set beyond Capacitor's own generated
  boilerplate (`ExampleInstrumentedTest.java`, untouched). Writing a real
  instrumentation suite is a genuine, non-trivial engineering task (Espresso
  view matchers against a Capacitor WebView require `WebView`-specific
  Espresso extensions, e.g. `espresso-web`, to interact with DOM content
  inside the WebView rather than native Android views) — **not attempted in
  this cycle**, consistent with "do not introduce a large testing framework
  merely because it is popular" and "prefer the minimum solution." Recorded
  as a genuine follow-up, not solved now.
- **Conclusion for this cycle:** Robo testing is the only automated
  participant-journey mechanism actually wired up. It answers "does the app
  crash on launch" — Level C's minimum proof — and nothing more. Closing the
  gap to an automated, authoritative golden-journey proof against a cloud
  device is future work, tracked here rather than attempted now.

## Test API connectivity

A cloud Android device (real or virtual) reaching the Witness participant
API for a genuine join/consent/capture flow requires that API to be publicly
reachable over HTTPS — which the live pilot already is, through the
Cloudflare tunnel documented in `docs/infrastructure/DEPLOYMENT_TOPOLOGY.md`.
**No internal service (Postgres, Keycloak admin, Neo4j, MinIO admin, Docker)
is exposed by this design, and none should be** — the cloud device talks to
exactly the same `/api/v1/session-join/*` and `/api/v1/participant-capture/*`
boundary a real participant's phone would, nothing more.

**Synthetic test data only.** Any real join-link/session exercised by a
Robo or future instrumentation run must be created against a clearly-named
synthetic fixture (e.g. an organisation named for testing, a session named
"Cloud Android Acceptance") — never real institutional pilot data. This
document does not create such a fixture; it is the same discipline
`docs/mobile/STORE_REVIEW_RUNBOOK.md` already establishes for App
Store/Play Store reviewers, applied here too.

## Security

- The cloud-test job has no deployment permission (`permissions: contents:
  read`, same as every other workflow in this repository).
- No CI secret is embedded in the APK — the APK under test is the exact
  same artifact `mobile-android.yml` already produces and uploads, built
  with zero server secret (see `docs/infrastructure/DEPLOYMENT_TOPOLOGY.md`'s
  environment-strategy table: the mobile build's only input is a public API
  URL).
- The Firebase/GCP service account created for this purpose must be scoped
  to Test Lab execution only — not project-owner, not editor, not anything
  with access to unrelated GCP resources. This is a setup-time human
  decision recorded as a requirement here, not something this document can
  enforce after the fact.
- Cloud testing does not change, weaken, or bypass the participant/
  facilitator security boundary already proven in
  `services/api-gateway/src/authz/authorization.guard.test.ts` and
  `services/api-gateway/src/session-join/participant-capture.live.test.ts`
  — a cloud-run APK is still bound by the same backend-authoritative
  containment those suites prove, regardless of what device it runs on.

## Optional supplementary option — Appetize.io

Evaluated per the governing instruction's explicit allowance, not pursued
this cycle: Appetize.io offers browser-streamed Android/iOS emulation
suitable for interactive manual smoke testing without any local install.
**Not adopted as part of the automated CI evidence chain** — Firebase Test
Lab is preferred there, per the governing instruction's own preference,
because it integrates with `gcloud`/GitHub Actions natively and produces
retained, linkable CI evidence rather than an interactive session. Appetize
remains a reasonable option for a human wanting to manually poke at a build
in a browser before physical-device testing arrives, but this document does
not set it up, upload any binary to it, or make it part of the release
evidence chain — doing so would require separately reviewing its privacy/
retention terms for an uploaded proprietary binary, which has not been done.
