# Deployment topology — build, run, route

**Owner:** Infrastructure Lead
**Status:** Active — reflects the current pilot topology as implemented, not a proposed change

Where Witness's four moving parts each live, and why they stay separate.
This is an infrastructure refinement to the Witness Participate mobile
programme, not a mobile product redesign or a re-platforming of Witness —
see `architecture/decisions/ADR-0031-witness-participate-mobile-runtime.md`
for the mobile architecture itself, unchanged by this document.

## The four responsibilities

```text
GitHub          builds the software (CI: lint/typecheck/test/build, Android compile)
DigitalOcean    runs the software (the pilot's Postgres/Keycloak/API/web, ADR-0013)
Cloudflare      protects and routes the software (DNS/TLS/WAF/tunnel)
Mac             is the Apple development and physical-device workstation
```

None of these collapse into another merely because one machine or provider
could technically do all four. Concretely:

- Android compilation runs in GitHub Actions (`.github/workflows/mobile-android.yml`),
  not on the Mac and not on the DigitalOcean pilot host — the Mac stays free
  of Android SDK/emulator disk growth, and the pilot host stays free of a
  build toolchain it has no other reason to carry.
- iOS compilation stays Mac-first (Xcode requires macOS; there is no change
  here — see "Apple workflow" below).
- Production Witness (`deployments/cloud-managed/docker-compose.pilot.yml`)
  stays on DigitalOcean, unchanged by this programme.
- Cloudflare stays the edge in front of that DigitalOcean host, unchanged.

## Target architecture

```text
                         GitHub
                            │
                  Source / Pull Requests
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ▼                             ▼
       GitHub Actions                Deployment CI
       (.github/workflows/            (.github/workflows/deploy.yml,
        mobile-android.yml)            self-hosted runner ON the pilot host)
             │                             │
       Android build                       │
             │                             │
       ┌─────┴─────┐                       ▼
       │           │                DigitalOcean
      APK         AAB                witness-prod-01
   (debug,     (release,                   │
    CI-only    unsigned —        ┌─────────┼─────────┐
    artifact)   signing           │         │         │
       │        BLOCKED,          ▼         ▼         ▼
       │        see M7)          API    Keycloak   Postgres
       ▼           ▼          (api-gateway) (auth)  (system of record)
   Internal      Google
    testing       Play                  ▲
  (once signed) (once signed)           │
                                 Cloudflare Tunnel (cloudflared)
                                 DNS / TLS / WAF / CDN — no inbound port
                                         │
                                         ▼
                                      Internet


Mac / Xcode
     │
     ├── iOS compile
     ├── iPhone physical testing
     ├── Apple signing
     └── TestFlight preparation
```

## Existing CI audit (done before creating anything new)

`.github/workflows/` before this programme's Android workflow was added:

| Workflow | Purpose | Trigger | Node | pnpm | JDK | Android | Caching | Artifacts | Secrets | Relevant to mobile |
|---|---|---|---|---|---|---|---|---|---|---|
| `ci.yml` | Main quality gate — docs, governance, lint/format/typecheck, unit+contract tests, invariant/adversarial suites, live Postgres+Neo4j integration, build, bundle-size budget | PR, push to `main`/`develop`, merge queue | 22 | via `pnpm/action-setup` | none | none | `.turbo` via `actions/cache` | none | none beyond `GITHUB_TOKEN` | Indirectly — `apps/participant-mobile` and `packages/participant-client` already run through its `static`/`test`/`build` jobs (Turborepo picks them up automatically); it has never built Android/iOS native code |
| `deploy.yml` | Deploy `main` to the pilot host after CI passes | `workflow_run` (after CI, on `main`), manual | — | — | — | — | — | — | pilot host's own untracked `.env`, `vars.WITNESS_PILOT_*` | Not applicable — this deploys the web/API pilot, never a mobile build |
| `security.yml` | Secret scanning, dependency review, licence compatibility, sovereign zero-egress check, action-pinning check | PR, push to `main`/`develop`, daily cron | — | — | — | — | — | — | `GITHUB_TOKEN` | Applies automatically to any new workflow/file this programme adds — no separate mobile security workflow needed |
| `codeql.yml` | Static analysis (CodeQL) | PR/push to `main`/`develop`, weekly cron | — | — | — | — | — | — | `GITHUB_TOKEN` (for `security-events: write`) | Applies to `apps/participant-mobile`'s TypeScript automatically; does not scan Kotlin/Java/Swift native code |
| `branch-sync.yml` | Detect long-lived domain-branch divergence (ADR-0015) | Weekday cron, manual | — | — | — | — | — | — | none | Not applicable |
| `cloudflare-email-routing.yml` | Inspect/apply Cloudflare email routing rules | Manual only | — | — | — | — | — | — | Cloudflare API token (implied by job; not inspected further here — out of scope for mobile CI) | Not applicable |
| `stale.yml` | Close inactive issues/PRs | Daily cron, manual | — | — | — | — | — | — | `GITHUB_TOKEN` | Not applicable |

**Conclusion: extend, don't fork.** No existing workflow builds native Android
or iOS code, and none should — `ci.yml`'s job model (one job per concern,
gated behind a cheap `detect` job, `.turbo` cache, pinned actions) is the
right shape to extend, not replace. Rather than add Android steps to `ci.yml`
itself (which would make every unrelated PR — a docs fix, a backend-only
change — pay for an Android SDK setup and Gradle compile), a **new,
narrowly-triggered workflow** (`mobile-android.yml`) was added, path-filtered
to only run when mobile-relevant files change on a PR, and unconditionally
on `main`/`develop` pushes (the "release-candidate build" case) — the
smallest change that keeps the existing architecture's separation of
concerns (`security.yml` already covers every workflow; `codeql.yml` already
covers the TypeScript in `apps/participant-mobile`) rather than duplicating
either.

## Non-negotiable boundaries (as implemented)

### GitHub Actions

Builds `apps/participant-mobile`'s Android artifacts: SDK/JDK/Gradle setup,
compile, unit tests, debug APK, unsigned release AAB. See
`.github/workflows/mobile-android.yml`'s own header comment for the exact
version-sourcing discipline (compileSdk/targetSdk/minSdk/AGP/Gradle read from
the generated project, never guessed). No Android Studio, no emulator image —
this job compiles, it never runs the app.

### DigitalOcean

Runs the pilot's persistent services — `deployments/cloud-managed/docker-compose.pilot.yml`:
Postgres (system of record), Keycloak (identity), the API and web containers,
`cloudflared` (tunnel, no inbound port). See
`docs/infrastructure/PRODUCTION_SERVICE_INVENTORY.md` for what's required vs.
optional vs. development-only, and why. **No Android SDK, Android Studio,
emulator, or Gradle build environment exists on this host, and none should**
— confirmed by reading the pilot compose file directly: it defines
application containers, not a build toolchain.

### Cloudflare

Fronts the DigitalOcean host over a tunnel (`cloudflared`, already the
production topology per `docker-compose.pilot.yml`'s `cloudflare` profile and
`docs/operations/PILOT_OPERATIONS.md`) — DNS, TLS, WAF/DDoS, routing. Not
touched by this programme beyond the mobile association files
(`docs/mobile/DEEP_LINKING.md`'s `apple-app-site-association`/`assetlinks.json`
publication steps, both still HUMAN ACTION REQUIRED — no incorrect Team ID or
signing fingerprint has been published, because neither exists yet).
**Cloudflare Containers migration is explicitly out of scope for this
programme** — see "Explicitly not done" below.

### Mac

Stays the Xcode/iOS/physical-iPhone/Apple-signing/TestFlight workstation,
unchanged — see "Apple workflow" below. `apps/participant-mobile/android`'s
source, Gradle files, Capacitor config, manifests, and resources all remain
in the repository for local development if a contributor needs them; only
the routine build *execution* moved to CI. Nothing here removes local Android
capability, only stops depending on it.

## Production network boundary

```text
Internet
   │
Cloudflare (DNS, TLS, WAF, tunnel)
   │
DigitalOcean origin (witness-prod-01)
   │
cloudflared (dials out — no inbound port; already the case, see
             docker-compose.pilot.yml's `cloudflare` profile)
   │
api / web containers
   │
Postgres / Keycloak (no `ports:` published — reachable only on the
                      compose network, confirmed by reading the compose
                      file: neither service exposes a host port)
```

Neo4j (optional, off by default in the pilot — see the service inventory)
also publishes no port. No firewall change was made or is proposed here;
this section documents the boundary that already exists in
`docker-compose.pilot.yml`, verified by reading it, not assumed.

## Mobile → production architecture

```text
Witness Participate (apps/participant-mobile)
        │
       HTTPS only (runtime-config.ts fails closed on plain HTTP
                    outside the development profile)
        │
    Cloudflare
        │
        ▼
api.<pilot or future canonical domain>   (docs/mobile/DEEP_LINKING.md's
                                           host-allow-list discipline)
        │
        ▼
DigitalOcean — api container
        │
 @witness/participant-client's 11-method closed surface
 (session-join + participant-capture routes only — proven structurally
  incapable of calling anything else, packages/participant-client/src/
  api.test.ts's closed-method-surface test)
        │
 tenant/session/consent enforcement (AuthorizationGuard + the
 capture-token-specific containment proven in
 authorization.guard.test.ts / participant-capture.live.test.ts)
```

The mobile app never connects directly to Postgres, Keycloak admin, Neo4j, or
any object-storage admin interface, and contains no infrastructure
credential — only the capture/join tokens `docs/mobile/SECURE_TOKEN_STORAGE.md`
already documents. This was true before this infrastructure programme (the
mobile app was built against `@witness/participant-client` from the start)
and is restated here because it is the thing that makes "GitHub builds it,
DigitalOcean runs it" safe: the build artifact carries no secret that would
matter if it leaked.

## Environment strategy

| Environment | Where | Secrets |
|---|---|---|
| Local | Contributor's machine (`make dev`/`make app`) | Contributor's own `.env`, never committed |
| CI | GitHub Actions | `GITHUB_TOKEN` only for the Android workflow (no deployment permission); pilot deploy secrets (`vars.WITNESS_PILOT_*`) are scoped to `deploy.yml`'s `pilot` environment and never available to `mobile-android.yml` |
| Staging | Not yet provisioned as a distinct environment — the pilot host currently serves as the only non-local environment | — |
| Production | DigitalOcean pilot host | Pilot host's own untracked `.env` (`docs/operations/PILOT_OPERATIONS.md`) |

Mobile build-time configuration, classified:

| Config | Classification | Where it lives |
|---|---|---|
| `VITE_WITNESS_API_URL` | PUBLIC BUILD CONFIG | Baked into the Vite build at CI build time — the API's public HTTPS origin, not a secret (the same origin a browser's DevTools Network tab already shows) |
| `VITE_WITNESS_BUILD_PROFILE` | PUBLIC BUILD CONFIG | Same as above |
| Capture token / join token | Neither — issued per-session at runtime, never a build-time config value | OS Keychain/Keystore on-device (`docs/mobile/SECURE_TOKEN_STORAGE.md`); never in CI, never in the repository |
| Android/iOS signing keystore, certificate, provisioning profile | STORE SIGNING SECRET | Not created yet — see `docs/mobile/MOBILE_RELEASE_GATES.md` M7 and the HUMAN ACTION REQUIRED list. When created: a dedicated secrets manager or GitHub encrypted secrets scoped to a release-only environment, never this repository, never CI logs |
| Pilot's Postgres/Keycloak/OIDC secrets | SERVER SECRET | The pilot host's own `.env`, never in a mobile build, never in CI for the Android workflow |

Android builds in CI require no server secret at all — `VITE_WITNESS_API_URL`
is the only mobile-relevant build input, and it names a public origin.

## Apple workflow remains Mac-first

Unchanged by this programme:

```text
Mac → Xcode → iPhone → Apple signing → TestFlight
```

GitHub-hosted macOS runners could in principle automate iOS CI later, but
that is a distinct, separately-justified decision (macOS runners cost
materially more than Linux ones, and the Mac already does this job) — not
required to prove Android CI, and not attempted here per the governing
instruction's "do not broaden this task unnecessarily."

## Mac disk strategy

No Android emulator system image and no Android Studio were installed on
this Mac for this programme. Command-line Android tooling status, inspected
rather than assumed:

- No `ANDROID_HOME`/`ANDROID_SDK_ROOT` set, no SDK at
  `~/Library/Android/sdk` — confirmed empty before this programme and still
  empty now.
- `gradlew tasks` was run once, online, against `apps/participant-mobile/android`
  during the prior session purely to prove the Gradle *configuration* itself
  resolves (it does — `BUILD SUCCESSFUL`); this did not require or install an
  Android SDK, since no compile task was invoked. No SDK, emulator, or
  Android Studio installation was performed or is proposed — Android
  compilation is GitHub Actions' job now, per this document's whole point.
- Homebrew's `android-commandlinetools` was evaluated (not installed) as an
  option for a genuine local compile; not pursued because local disk had
  only ~12 GB free at evaluation time, and installing the SDK plus
  build-tools plus Gradle's dependency cache would consume a meaningful
  fraction of it for a capability GitHub Actions now provides. This
  observation belongs in this document rather than being acted on
  unilaterally, since it affects the operator's own machine.

## Explicitly not done in this programme

- **No Cloudflare Containers migration.** Cloudflare remains DNS/TLS/WAF/tunnel
  only. Postgres, Keycloak, Neo4j, NATS, and MinIO stay exactly where they
  are (DigitalOcean, or unconfigured/off — see the service inventory). A
  future migration would need its own ADR with a cost comparison,
  persistent-storage analysis, backup/restore analysis, networking analysis,
  operational-complexity assessment, and a migration/rollback plan — none of
  which this document attempts, because none of it is the current objective.
- **No Kubernetes, no Terraform rewrite** (the existing `infrastructure/terraform/`
  directory remains an unused convenience module, per its own README), **no
  multi-region architecture, no service mesh, no autoscaling cluster, no
  per-customer Droplet, no managed Kafka, no new database technology, no
  elaborate observability stack.** The current scale is controlled pilots;
  `docs/infrastructure/PRODUCTION_SERVICE_INVENTORY.md` and
  `docs/infrastructure/LAUNCH_COST_BASELINE.md` size for that, not for
  hypothetical hyperscale.
- **No production DNS, firewall, or Cloudflare configuration change.** This
  document records the boundary that already exists; it changes nothing
  about how the pilot host is reached.
