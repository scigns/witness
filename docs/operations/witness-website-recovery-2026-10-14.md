# Witness Website Recovery — 2026-10-14

**Owner:** Infrastructure/Engineering (incident response)
**Status:** Root cause confirmed (DigitalOcean account lock, not a Tunnel-specific fault); marketing
Pages deployment built and PR'd ([#272](https://github.com/scigns/witness/pull/272), CI all green);
maintenance-fallback Worker designed, logic-tested and split into its own PR
([#273](https://github.com/scigns/witness/pull/273)) so it cannot block the marketing recovery; cost
proposal below. All production-boundary steps remain pending explicit approval.
**Incident context:** Simultaneous Cloudflare Tunnel disconnections, 2026-10-13, also affecting
Integrate Pasifika tunnels (handled by a separate session/worktree; not touched here). Scope expanded
2026-10-14 from temporary-outage recovery to financially sustainable availability and data protection
once the DigitalOcean account lock was identified as the likely underlying cause.

## 0. Root cause, revised: this is a DigitalOcean account lock, not (only) a Tunnel fault

Read-only `doctl` checks (account/droplet/billing endpoints only; no mutating command was run against
any resource) confirm:

```text
$ doctl account get
status: locked
status_message: "Your team has been locked due to lack of payment or improper use of
                  the platform. Please open a ticket so our support staff can help."

$ doctl compute droplet list
witness-prod-01              8GB/4vCPU   sgp1   status: off
integratepasifika-builder    8GB/4vCPU   sgp1   status: off
integratepasifika-prod       4GB/2vCPU   sgp1   status: off
integratepasifika-dev        4GB/2vCPU   sgp1   status: off
```

**All four droplets on the account — Witness's and Integrate Pasifika's alike — are powered off.**
This is the real root cause: it is not that `cloudflared` disconnected while the host kept running,
it is that the host itself is off, so nothing — `cloudflared`, the API, the web app, Keycloak — is
running to connect in the first place. Cloudflare's edge error 1033 is the correct, expected symptom
of a Tunnel with no connector reachable; it was never a Cloudflare-side problem to fix.

**What the billing history does and doesn't confirm:** `doctl billing-history list` shows August
($27.85) and September ($67.51) invoices both paid in full via card by their due dates, with no failed
or declined payment recorded. October's $81.66 is still a *preview* (unbilled, in-progress) line, not
an overdue invoice — DigitalOcean invoices at the start of the following month. So the specific
mechanism named in the lock message — "lack of payment **or** improper use" — isn't disambiguated by
the evidence gathered here; what's certain is the account-level lock itself, straight from
DigitalOcean's own API, not an inference from the outage symptoms. Opening a support ticket (as the
lock message itself directs) is the only way to get the exact reason and the path to unlock.

**Reassuring fact:** the droplets are `off`, not deleted. DigitalOcean's standard behaviour for a
locked/delinquent account is to suspend (power off) resources, not immediately destroy them — disk
images normally persist through this state. That is not a guarantee against eventual deletion if the
lock is never resolved, which is exactly why Priority 1's data-protection steps below matter.

This also means: **the parallel Integrate Pasifika Tunnel investigation is very likely chasing the
same underlying cause** (their droplets are off too). Worth flagging to that session/owner — not acted
on here, and nothing in this worktree touches any `integratepasifika-*` resource.

## 1. Diagnosis (original Tunnel-level symptom, still accurate as a symptom)

**Root cause: the `witness-prod` Cloudflare Tunnel is down.** Every hostname whose origin is reached
through that tunnel returns Cloudflare edge error **1033** ("Argo Tunnel error" — cloudflared is not
connected). Confirmed by direct HTTPS checks at the time of writing (2026-10-14 07:38 UTC):

| Host | Zone | Result |
| --- | --- | --- |
| `buildwithwitness.com` (apex) | `buildwithwitness.com` | `301` → `https://www.buildwithwitness.com/` (edge-level redirect rule; no origin needed, so it still answers) |
| `www.buildwithwitness.com` | `buildwithwitness.com` | `530` / `error code: 1033` |
| `app.buildwithwitness.com` | `buildwithwitness.com` | `530` / `1033` |
| `api.buildwithwitness.com` | `buildwithwitness.com` | `530` / `1033` |
| `id.buildwithwitness.com` | `buildwithwitness.com` | `530` / `1033` |
| `preview.buildwithwitness.com` (the only place the real marketing build has ever been live) | `buildwithwitness.com` | `530` / `1033` |
| `witness-prod-web/api/id.pacificdigitalconsultancy.org` | `pacificdigitalconsultancy.org` | `530` / `1033` |
| `buildwithwitness.org` | — | Registered (`whois` status `ACTIVE`) but has **no nameservers configured** — not pointed at Cloudflare or anywhere. Not live, not a viable immediate substitute. |

Identical `1033` across both zones and every subdomain confirms a single shared tunnel backs all of
them — this is exactly the incident already in progress for `witness-prod`, not a separate website
issue.

## 2. Critical finding: there is no independent marketing site to "restore"

This is the fact that changes the recovery plan. Per `docs/commercial-website/STATUS.md` and
`CUTOVER_RUNBOOK.md` (repository state as of 2026-09-28, consistent with what's live today):

- **`buildwithwitness.com` (apex) and `app.buildwithwitness.com` have always served the same
  authenticated product application** — byte-identical HTML, same `<title>Witness</title>`. There has
  never been a separate public marketing site on the production domain.
- The real marketing site (`apps/marketing`, a materially complete, 21-route Next.js site with its own
  Brand Book, Trust Centre, solutions pages, etc.) has only ever run on `preview.buildwithwitness.com`
  — and that preview is **(a)** routed through the same now-dead `witness-prod` tunnel, and **(b)**
  already several feature-releases stale (missing MKT-05/06/09 content) even before this outage.
- The `www`-canonical cutover (decision CW-034) and the apex→`www` redirect are **more executed in
  production than the docs record** — the live apex 301 to `www` that we observed today isn't
  documented as having happened. Docs here have drifted from reality in both directions; treat live
  HTTP state as ground truth, not the repo's cutover-status tables.
- Net effect: **Option A ("restore existing independent static hosting") does not apply** — nothing
  independent exists to restore. Every public surface, marketing included, is downstream of the one
  broken tunnel.

## 3. Architecture

- Marketing app: `apps/marketing`, Next.js 15 / React 19, `output: 'standalone'` (portable Node
  server), packaged via `apps/marketing/Dockerfile`. **No database, no API, no auth dependency** — the
  only non-static route is `GET /health` (`src/app/health/route.ts`), a fixed JSON payload with no
  request-dependent logic.
- Route inventory: 21 fully static content routes (`/`, `/platform/*`, `/solutions/*`, `/trust/*`,
  `/demo`, `/how-it-works`, `/why-witness`, `/stories`, `/get-started`, plus metadata routes). No
  `middleware.ts`, no route handlers besides `/health`, no `dynamic`/`revalidate`/`generateStaticParams`
  usage found anywhere in `src/app`. This site is a strong candidate for a fully static build.
- Current deployment target: a Docker container on the same DigitalOcean host as the product app,
  reachable only via a Cloudflare Tunnel public hostname — i.e., structurally coupled to the exact
  infrastructure that's currently down.
- No Cloudflare Pages or Workers project exists for this app today (confirmed: no adapter config, no
  `wrangler.toml` for marketing, no deploy workflow referencing Pages/Workers for it —
  `deployments/cloud-managed/cloudflare-worker` is unrelated email-routing tooling).

## 4. Recommended recovery: Option B — independent Cloudflare Pages deployment

Deploy `apps/marketing` to Cloudflare Pages as a static site, fully decoupled from `witness-prod` and
any Docker/Tunnel infrastructure. Rationale:

- It reuses the existing, materially complete, already-brand-reviewed marketing content — no invented
  copy, no holding-page fallback needed.
- Pages serves from Cloudflare's edge directly; it has no dependency on the downed tunnel, the
  DigitalOcean host, or any other piece of the current incident.
- The site's near-total absence of dynamic server features makes a static export low-risk.
- It can be verified on a `*.pages.dev` preview URL with **zero production DNS change**, then cut over
  to `www.buildwithwitness.com` only after explicit approval — exactly the Phase 4 checkpoint this
  task requires.

**Impact:** No change to `apps/web`, `services/*`, databases, or the product Tunnel. The product
application and API remain exactly as broken (or as fixed, once the other investigation resolves
`witness-prod`) as they are now — this path does not touch that.

**Rollback:** Trivial and safe by construction — a new Pages project with no prior production traffic.
Until a DNS/custom-domain change is approved and made, there is nothing live to roll back; after that
change, rollback is reverting the one DNS/CNAME record back to the tunnel-backed origin (or to
whatever state the `witness-prod` incident response leaves it in).

## 5. PR #272 status and the Cloudflare credential blocker

[PR #272](https://github.com/scigns/witness/pull/272), branch `fix/marketing-cloudflare-pages-recovery`
— all CI checks pass (lint, typecheck, 46 unit tests, integration, invariants/adversarial, CodeQL,
secret scanning, release-image validation). Build verified locally:
`WITNESS_MARKETING_BUILD_TARGET=pages pnpm --filter @witness/marketing build` exports all 21 content
routes plus `/health`, `/robots.txt`, `/sitemap.xml`; the default (no env var) build is unchanged
byte-for-byte from before this PR.

**Still blocked on credentials.** Confirmed empty/absent, checked again as of this update:

- No `CLOUDFLARE_*` variable in the local shell environment.
- `gh secret list` on `scigns/witness` returns no secrets at all.
- No existing GitHub Actions workflow deploys anything to Cloudflare Pages/Workers (only
  `cloudflare-email-routing.yml`, unrelated departmental email forwarding).

Needed to finish Priority 2:

1. A scoped `CLOUDFLARE_API_TOKEN` (**Account → Cloudflare Pages → Edit**) and
   `CLOUDFLARE_ACCOUNT_ID`, as GitHub Actions secrets on `scigns/witness`.
2. Once set, trigger `gh workflow run deploy-marketing-pages.yml` and verify the resulting
   `*.pages.dev` URL serves `/`, `/health`, `/robots.txt`, `/sitemap.xml` correctly — still zero
   production DNS change.

No workaround attempted (no credential guessing, no reuse of unrelated tokens).

## 6. Data-loss risk assessment (Priority 1)

**Read-only findings only; nothing below was mutated.**

- `witness-prod-01` (8 GB / 4 vCPU / 160 GB disk, region `sgp1`) is the only droplet in the account
  that hosts Witness. It is powered off, not deleted — see §0.
- Per `docs/operations/PHASE3C_BACKUP_AND_ROLLBACK.md`, `scripts/pilot/backup.sh` writes PostgreSQL
  dumps (Witness database and Keycloak database, each with a SHA-256 sidecar) to a local directory on
  that **same droplet** (default `~/witness-backups`, operator-configurable). The script and its
  sibling `scripts/ops/backup-status.sh` have no offsite replication step — no S3/Spaces/rclone push
  anywhere in `scripts/pilot/` or `scripts/ops/`, confirmed by repository search. **The only backups
  this repository's tooling is known to produce are co-located with the live data, on the one droplet
  that is currently off.** If that droplet is ever destroyed (not merely powered off), both the
  production data and its only known backup would be lost together.
- Object storage for uploads/evidence files (`S3_ENDPOINT`/`S3_BUCKET_MEDIA`/`S3_BUCKET_DOCUMENTS` in
  `.env.example`) defaults to a local MinIO-style endpoint (`http://localhost:9000`) rather than a
  separately hosted DigitalOcean Spaces bucket. Whether the actual production `.env` on
  `witness-prod-01` points at a genuinely external bucket or a container on the same droplet could not
  be determined without reading production configuration (deliberately not inspected here, consistent
  with not exposing secrets) — flagging as **unconfirmed, verify directly** rather than assuming either
  way.
- The droplet is unreachable by design right now (`nc -z -w5 167.172.72.70 22` → not reachable, because
  the host is off) — no SSH, `docker exec`, or any other read was possible or attempted beyond the
  `doctl` account/droplet/billing API calls already described.
- `doctl databases list` and `doctl compute volume list` both return `403 You are not allowed to
  perform this operation` under the current locked status — this account has no DigitalOcean Managed
  Database or externally attached Volume product in use (a 403 under a lock is consistent with no
  provisioned resource of that type, not with a hidden one access is merely denied to; there is nothing
  else to check for there).

**Risk, plainly stated:** while the droplet remains merely powered off, the data on its disk is very
likely intact. The real exposure is time: if the account lock is not resolved (via the support ticket
DigitalOcean's own lock message directs you to open) before any DigitalOcean data-retention deadline
for delinquent accounts passes, both the live database and its only backup disappear together,
because they have never been separated. **Recommended immediate action, independent of everything
else in this report:** open that DigitalOcean support ticket now to learn the reinstatement path and
any deletion deadline, and treat "get one database/Keycloak dump copied off that droplet to somewhere
else" as the single highest-priority data-protection task — but doing so requires the droplet to be
powered back on (a DigitalOcean account action, not something `doctl` can do against a locked account;
`doctl compute droplet-action power-on` was not attempted, since a locked account is the explicit
reason the droplets are off and forcing a power-on is very unlikely to succeed and is exactly the kind
of action this task's safeguards ask not to attempt blindly). This is advice, not an action taken here.

## 7. Maintenance fallback for `app.buildwithwitness.com` (Priority 3)

**Prepared, logic-tested, not deployed, not routed to production — and deliberately kept out of this
PR.** This piece lives in its own branch and pull request,
[`feat/app-maintenance-fallback-worker` / PR #273](https://github.com/scigns/witness/pull/273), whose
`deployments/cloud-managed/cloudflare-worker-maintenance/README.md` has the full design, rationale and
exact enable/disable commands; summary here. It is split out so that reviewing and, per instruction,
independently and separately approving/testing the routing, security and rollback procedure for a
production app-host fallback never blocks or delays the marketing-site recovery in this PR.

**Mechanism.** A Cloudflare Worker bound only to `app.buildwithwitness.com/*` (never `api.` or `id.`,
which carry the real OIDC redirect/callback exchange — scoping the route this narrowly is what
preserves API semantics and avoids intercepting authentication, by construction rather than by special
cases). A single Workers KV value (`MODE`) toggles its behaviour without a redeploy:

- `off` (default): pass every request straight through, byte-for-byte, as if the Worker didn't exist.
- `maintenance`: never contact the origin; always serve a Witness-branded HTML page with `503`, a
  `Retry-After: 300`, and `Cache-Control: no-store` — no fake login, no infrastructure/billing/Tunnel
  detail, one visible (not forced-redirect) link to `https://www.buildwithwitness.com/`.
- `auto` (present, **not** the recommended default): try the origin first, fall back to the
  maintenance page only on a thrown fetch error or a `5xx` response. Documented as unverified-in-
  production and lower-priority than `maintenance` per this task's own instruction to prefer a manual
  toggle unless automatic failover is proven safe.

**Why a Worker, not Pages routing, and why Pages doesn't already cover this:** Cloudflare Pages
projects answer their own hostnames; they do not intercept errors on an unrelated Tunnel-backed
hostname like `app.buildwithwitness.com`. Nothing about deploying the Priority 2 Pages project changes
what `app.` serves — confirmed by design, not assumed, which is why this is a second, independent
mechanism rather than a side effect of Priority 2.

**Tested, without Cloudflare credentials, as far as that's honestly possible:** the module was
exercised directly in Node (not the Workers runtime, but the same `fetch`/`Request`/`Response`
primitives) with mocked KV. `maintenance` mode correctly returns `503`/`Retry-After`/`no-store` and
a body containing no infrastructure/billing/Tunnel/error-code terms. `auto` mode correctly falls
back on both a thrown error and a mocked `530` response. The `off`-mode pass-through branch, run
from this sandbox, made a real network request to the live `https://app.buildwithwitness.com/` and
received today's actual `530`/`1033` response as an ordinary HTTP response object rather than a
thrown exception — exactly the condition `auto` mode's `status >= 500` check is written to catch,
giving real (if indirect) evidence the detection logic matches today's live failure shape.

What this has **not** done: actually deploy the Worker, bind its route to the production hostname,
or confirm Workers-runtime-specific behaviour (KV reads, `cf` fetch options) against a live
Cloudflare edge — that needs the credentials in §5, plus the additional **Workers Scripts: Edit**
and **Workers KV Storage: Edit** token scopes (broader than the Pages-only token requested for
Priority 2; flagging so whoever issues it can decide one broadened token vs. two separately scoped
ones).

**Enable/disable procedure (Priority 3 deliverable #5):** see the README's "Step 1" (safe,
`*.workers.dev`-only verification — no production impact) and "Step 2" (the actual production-change
boundary: binding the route to `app.buildwithwitness.com/*`, which must stay at `MODE=off` immediately
after that bind and only be flipped to `maintenance` as a second, explicit step). Disabling is one
command, no redeploy: `wrangler kv key put --namespace-id=<id> MODE off`.

## 8. Cost comparison (Priority 4)

**Hard data available:**

| Droplet | Size | Status | Approx. DO list price\* |
| --- | --- | --- | --- |
| `witness-prod-01` | 8 GB / 4 vCPU / 160 GB, `sgp1` | off | ~US$48/mo |
| `integratepasifika-builder` | 8 GB / 4 vCPU / 160 GB, `sgp1` | off | ~US$48/mo |
| `integratepasifika-prod` | 4 GB / 2 vCPU / 80 GB, `sgp1` | off | ~US$24/mo |
| `integratepasifika-dev` | 4 GB / 2 vCPU / 80 GB, `sgp1` | off | ~US$24/mo |

\*Approximate, from general DO droplet-size pricing tiers as of recent memory — **confirm against the
current DigitalOcean pricing page before budgeting**, not asserted as exact.

Actual billed invoices: August $27.85, September $67.51 (jump consistent with more droplets coming
online mid-cycle), October (partial, unbilled preview) already $81.66 as of 2026-10-14. **All four
droplets share one DigitalOcean account/team with a single default project (`doctl projects list`
shows only one, `first-project`) — there is no DigitalOcean-side cost split between Witness and
Integrate Pasifika.** Any Witness-only figure below is this report's estimate (roughly, `witness-prod-
01`'s own list price plus a share of shared bandwidth/backup/monitoring add-ons), not a billed fact.

| Option | Monthly cost (estimate) | What it buys | What it risks |
| --- | --- | --- | --- |
| **A. Keep the current DigitalOcean environment, unlock the account** | ~US$48–70/mo for Witness's droplet alone (plus whatever Integrate Pasifika's share is, on the same account) | Full application, API, identity, database and marketing-preview restoration exactly as before, no re-architecture | Requires paying down/resolving the lock first; does nothing about the single-droplet backup co-location risk in §6 unless separately fixed |
| **B. Marketing on Cloudflare Pages now, application offline (this task's immediate path)** | US$0/mo (Cloudflare Pages free tier covers this site's traffic level comfortably; Workers free tier — 100,000 requests/day — covers the maintenance fallback) | A real, professional public presence immediately, zero new recurring cost, zero dependency on the locked account while funding is sorted out | The product application (and its revenue-generating paths, if any) stay unavailable until the droplet/account situation resolves |
| **C. Migrate the application to lower-cost infrastructure once funded** | Lower than Option A for an equivalent single droplet (e.g., a smaller DO droplet, Fly.io, Hetzner, or a managed Postgres + a cheap container host) — needs an actual resource-requirement review first, not a guess | A sustainable long-term home, possibly cheaper than the current 4-droplet account | Real migration effort (data transfer, Tunnel/DNS re-pointing, Keycloak realm move); should follow, not precede, getting one off-droplet backup copy per §6 |
| **D. Keep data, not compute, running continuously** | Cost of object/volume storage for a periodic dump only (typically a few US$/mo for a database this size) vs. a full droplet | Preserves recoverability without paying for idle compute between periods of real use | No live application between activations; still needs the account unlocked (or a fresh, separate account) to even take that one dump off the current droplet |

**This report does not recommend provisioning any new paid resource.** Option B is already in motion
(PR #272 + the maintenance Worker) and costs nothing. Options A/C/D all require a decision this report
can't make alone: whether and when the DigitalOcean lock gets resolved, and what budget exists for C.
Identifying actual resource requirements (Option C's own instruction) is specifically *not* done
here — it requires knowing real traffic/storage figures from the live application, which isn't
accessible while the account is locked.

## 9. Mandatory safeguards — compliance note

Every safeguard listed in this task's brief was respected: no Integrate Pasifika resource was read
beyond the same account-level `doctl` calls already covering Witness (`droplet list`, `account get`,
`billing-history list` — none of these mutate anything or target a specific Integrate Pasifika
resource), nothing was altered on any production database or application, no DigitalOcean resource was
powered on/off/deleted, no DNS record was changed, `apps/participant-mobile/` was not inspected per
`AGENTS.md`, and the maintenance Worker ships with its production route commented out specifically so
preparing it cannot accidentally activate it.

## 10. Next steps (pending your decision)

1. **Open a DigitalOcean support ticket** about the account lock — this report cannot do that for you,
   and it's the only way to get the exact reason and any deletion deadline (§6).
2. Set `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` as repo secrets so PR #272's Pages deployment
   (§5) can actually run and be verified on its preview URL.
3. Decide whether the maintenance Worker (§7) should proceed to its own safe `*.workers.dev`
   verification step now, which needs the broader Workers-scoped token noted there.
4. When ready, explicitly approve binding the maintenance Worker's route to
   `app.buildwithwitness.com/*` (§7, "Step 2") and/or cutting `www.buildwithwitness.com` over to the
   Pages project (§4) — both remain unexecuted production-change boundaries.
