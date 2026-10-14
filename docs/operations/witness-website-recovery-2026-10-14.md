# Witness Website Recovery — 2026-10-14

**Owner:** Infrastructure/Engineering (incident response)
**Status:** Diagnosis complete; recovery implementation pending credential/approval decision
**Incident context:** Simultaneous Cloudflare Tunnel disconnections, 2026-10-13, also affecting
Integrate Pasifika tunnels (handled by a separate session/worktree; not touched here).

## 1. Diagnosis

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

## 5. Blocker found — explicit, not worked around

**No Cloudflare API credentials are available in this environment or this repository's GitHub Actions
secrets.** Checked and confirmed empty/absent:

- No `CLOUDFLARE_*` variable in the local shell environment.
- `gh secret list` on `scigns/witness` returns no secrets at all (only three unrelated Firebase
  `gh variable list` entries for mobile CI exist).
- No existing GitHub Actions workflow deploys anything to Cloudflare Pages/Workers (only
  `cloudflare-email-routing.yml`, which manages departmental email forwarding and is unrelated).

This means I can prepare the static build and the deployment workflow, and verify the build locally,
but **cannot actually create or push to a Cloudflare Pages project** without either:

1. A scoped `CLOUDFLARE_API_TOKEN` (Pages:Edit on the account) and `CLOUDFLARE_ACCOUNT_ID`, added as
   GitHub Actions secrets or supplied for a local `wrangler pages deploy`, or
2. A human operator doing the equivalent action directly in the Cloudflare dashboard using a build
   artifact I produce.

I have not attempted any workaround (no credential guessing, no reuse of unrelated tokens, no
destructive retries). This is reported as the exact blocker per the task's own instruction to do so
rather than repeatedly retrying.

## 6. Remaining application restoration work (out of scope here)

- The `witness-prod` Tunnel itself coming back up (owned by the incident investigation referenced in
  this task's context — not touched by this worktree).
- Once the tunnel is restored, the existing product/API/identity/preview routes should return to their
  pre-incident (already-imperfect) state: product app on apex/app, stale marketing preview on
  `preview.`, `www` still effectively serving through the same single point of failure.
- Separately from this incident: the marketing preview is stale by two feature waves (MKT-05/06/09
  missing) and the full production cutover (apex→marketing, Keycloak/CORS/cookie verification)
  remains gated on human Cloudflare/Keycloak access per `CUTOVER_RUNBOOK.md` — unrelated to today's
  outage, but worth closing out once the independent Pages deployment proves itself.

## 7. Next steps (pending your decision)

See the question posed alongside this report.
