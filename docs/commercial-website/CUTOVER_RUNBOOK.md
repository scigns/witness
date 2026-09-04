# Witness Commercial Domain Cutover Runbook

**Status:** Prepared; cutover not executed
**Owner:** Engineering, Operations and Product
**Last reviewed:** 2026-09-04

This runbook prepares the eventual move from the current product-served apex to an independent
marketing origin. It is a planning and verification document only. Cloudflare, DNS, Tunnel, Keycloak,
cookies, CORS/CSRF, production environment and indexing are not changed by this milestone.

## Canonical host policy

- Canonical public domain: `https://buildwithwitness.com`
- `www.buildwithwitness.com` is not a second site; it permanently redirects to the apex.
- Redirects preserve path and query, for example `/platform?source=campaign` remains the same path and
  query on the apex.
- Canonical authenticated application host: `https://app.buildwithwitness.com`
- API host: `https://api.buildwithwitness.com`
- Identity host: `https://id.buildwithwitness.com`
- `docs.` and `status.` remain reserved until separately provisioned and verified.

## Current topology (read-only verification, 2026-09-04)

| Surface | Current evidence | Confidence |
| --- | --- | --- |
| Apex | HTTP 200 Next.js product; body hash is identical to `app.` | Live HTTP plus repository route ownership |
| `app.` | HTTP 200 Next.js product; body hash is identical to apex | Live HTTP; full authenticated flow not exercised |
| `api.` | `/health` HTTP 200; CORS response names `https://app.buildwithwitness.com` | Live HTTP |
| `id.` | HTTPS responds and redirects `/` to `/admin/` | Live HTTP; realm/client values not inspected |
| `www.` | No A or CNAME answer; HTTP/HTTPS cannot resolve | Live DNS/HTTP |
| Cloudflare | Apex/app/API/id return Cloudflare edge addresses and `server: cloudflare`; repository operations describe Tunnel-backed Compose | Live edge plus repository evidence; effective dashboard routes still require human confirmation |

Repository evidence cannot prove current Cloudflare DNS, Redirect Rules, Universal SSL coverage,
Keycloak client settings, cookie headers or deployed image identifiers. Those items are explicitly
`REQUIRES HUMAN CLOUDFLARE VERIFICATION` or `REQUIRES HUMAN IDENTITY VERIFICATION` below.

The externally visible A answers for apex/app/API/id were Cloudflare anycast addresses with roughly
227–228 seconds remaining TTL when sampled. Because these records are proxied, the browser connects
to Cloudflare rather than the origin; dashboard route changes can take effect without waiting for an
origin-address DNS TTL. Record authoritative dashboard values at cutover and do not change TTL
without a demonstrated need.

## Pre-cutover checklist

- [ ] Freeze unrelated production changes and record the current apex/app/API/id DNS and route state.
- [ ] Record current marketing and product deployment image/version identifiers and rollback targets.
- [ ] Provision and smoke-test an isolated marketing preview; keep `noindex` and the marketing health
      route available.
- [ ] Verify `app.buildwithwitness.com` loads independently without an apex or `/witness` dependency.
- [ ] Verify API and identity health on their canonical hosts.
- [ ] Verify sign-in, Keycloak redirect, callback, session persistence and logout.
- [ ] Verify forgot-password entry, reset-password links, invitation links and auth-error redirects.
- [ ] Verify protected routes remain protected and the product does not redirect to marketing.
- [ ] Confirm CORS, CSRF trusted origins, WebSocket origins (if used), Secure/SameSite settings and
      host-scoped cookies.
- [ ] Confirm `www` DNS/proxy/certificate readiness and tested path/query-preserving redirect rule.
- [ ] Review marketing build with `WITNESS_MARKETING_INDEXABLE=false`.

## Cloudflare `www` plan (do not execute here)

1. In the `buildwithwitness.com` zone, provision `www` as the approved proxied DNS target for the
   redirect rule (a proxied placeholder record is sufficient when the Redirect Rule intercepts it);
   do not point it at the product origin as a second website.
2. Confirm Universal SSL or the approved custom certificate covers both apex and `www` before HTTPS
   testing. Cloudflare proxying normally terminates TLS, but coverage remains a dashboard check.
3. Create a Dynamic Redirect Rule matching `http.host eq "www.buildwithwitness.com"` for HTTP and
   HTTPS requests. Set the target expression to
   `concat("https://buildwithwitness.com", http.request.uri.path)`, status 308 (or approved 301), and
   enable **Preserve query string**.
4. Ensure the rule runs before any origin route, does not match the apex host, and cannot loop.
5. Test `/`, `/example`, unknown paths and query strings over HTTP and HTTPS; expect one permanent
   redirect and the apex path/query unchanged.
6. Record rule identifier, prior DNS/route values and rollback action in the change ticket.

`REQUIRES HUMAN CLOUDFLARE VERIFICATION`: DNS record/proxy state, certificate coverage, rule
precedence, effective redirect status, propagation and rollback identifiers.

## Authenticated app and identity checklist

The desired app host is `https://app.buildwithwitness.com`. Before apex routing changes, a human with
the identity deployment access must verify:

- Keycloak valid redirect URI includes the API callback contract
  `https://api.buildwithwitness.com/api/v1/auth/callback`.
- Post-logout redirect, client root/home URL, frontend URL and Web Origins match the reviewed app/API
  arrangement, without adding the marketing apex unnecessarily.
- Forgot/reset-password and invitation-generated links resolve to the intended identity/app hosts.
- Realm frontend URL and proxy hostname settings use `id.buildwithwitness.com` where applicable.
- The callback returns to `app.buildwithwitness.com`, session persists, logout clears the session, and
  auth errors stay on the app host.

`REQUIRES HUMAN IDENTITY VERIFICATION`: effective Keycloak client/realm values and an end-to-end
browser login. Do not modify Keycloak in MKT-03G.

Read-only checks on 2026-09-04 verified that both `/api/v1/auth/login` and
`/api/v1/auth/forgot-password` begin with a 302 to the `id.buildwithwitness.com/realms/witness`
endpoints and encode the API callback
`https://api.buildwithwitness.com/api/v1/auth/callback`. This verifies entrypoint construction only;
callback completion, app-host return, session persistence, logout, reset email links and invitation
links remain unverified without an approved test account and mailbox.

## API, CORS/CSRF and cookie checklist

- Keep the allowed frontend origin restricted to `https://app.buildwithwitness.com`.
- Marketing apex should not call the protected API during the public homepage phase.
- Verify CSRF trusted origins, callback origins and WebSocket origins (if used) do not broaden merely
  because the apex changes.
- Repository operations evidence says the product session travels as an `Authorization: Bearer`
  value in browser session storage; no cross-subdomain cookie is required by that design.
- Confirm response `Set-Cookie` headers and session cookies are host-scoped to `app.` or identity
  hosts, Secure and appropriate SameSite. Do not use `Domain=.buildwithwitness.com` unless a separately
  approved requirement proves it necessary.

`REQUIRES HUMAN API/COOKIE VERIFICATION`: deployed headers, CORS preflight, CSRF behaviour and actual
cookie scope. Do not change CORS, CSRF or cookie domains in MKT-03G.

The 2026-09-04 live sample returned `Access-Control-Allow-Origin:
https://app.buildwithwitness.com` even when the request Origin was the marketing apex, so marketing
does not currently receive its own allowed origin. This is the intended narrow origin set. The same
response also returned `Access-Control-Allow-Credentials: true`, while current repository code sets
`credentials: false` for bearer-token sessions. Reconcile the deployed image/configuration with the
repository before cutover; do not broaden the origin as part of that investigation.

## Preview provisioning (future human action)

1. Approve `preview.buildwithwitness.com` (or a documented alternative) and a standalone marketing
   origin; it must not share the apex/app route.
2. Deploy the `apps/marketing/Dockerfile` image with
   `WITNESS_MARKETING_SITE_URL=https://preview.buildwithwitness.com`,
   `WITNESS_MARKETING_ENV=preview`, and `WITNESS_MARKETING_INDEXABLE=false`.
3. Add a proxied preview hostname/route and confirm certificate coverage.
4. Check `/`, `/health`, `/robots.txt`, and `/sitemap.xml`; verify the canonical remains the apex,
   robots disallows crawling, and no product cookies or auth redirects are present.
5. Record deployment/image and route identifiers plus the removal/rollback procedure in the change
   ticket. No preview is currently provisioned.

## Cutover sequence (future approved change)

1. Freeze unrelated production changes.
2. Verify app, API and identity hosts.
3. Verify all authentication, reset, invitation and logout flows.
4. Verify isolated marketing preview and noindex controls.
5. Provision `www` and its permanent redirect.
6. Deploy the standalone marketing origin with `WITNESS_MARKETING_SITE_URL=https://buildwithwitness.com`,
   `WITNESS_MARKETING_ENV=production`, and `WITNESS_MARKETING_INDEXABLE=false`.
7. Change apex routing from the product origin to the marketing origin.
8. Smoke-test apex, `www`, app, API and identity; observe errors and redirects.
9. Keep indexing off. Enabling it is a later explicit human-approved action.

## Post-cutover smoke matrix

| Request | Expected |
| --- | --- |
| `https://buildwithwitness.com` | 200 marketing homepage |
| `https://buildwithwitness.com/robots.txt` | 200, noindex/disallow while launch is gated |
| `https://buildwithwitness.com/sitemap.xml` | 200, apex canonical URLs |
| `http://www.buildwithwitness.com/*` | Permanent redirect to equivalent HTTPS apex path/query |
| `https://www.buildwithwitness.com/*` | Permanent redirect to equivalent HTTPS apex path/query |
| `https://app.buildwithwitness.com` | Authenticated product |
| `https://api.buildwithwitness.com` | API health and reviewed CORS |
| `https://id.buildwithwitness.com` | Identity service and reviewed hostname |

## Rollback triggers and procedure

Triggers include app login/callback failure, reset or invite links breaking, API CORS/CSRF errors,
unexpected 5xx increase, apex unavailability, redirect loop, cookie scope leakage, or the marketing
origin serving protected product content.

Rollback is configuration-first: restore the recorded prior apex origin/route and marketing image or
origin identifier, disable/revert the new `www` rule if it contributes to the incident, then repeat
the apex, `www`, app, API, identity and authentication smoke matrix. Do not roll back the product
database for a marketing-origin change. Record timestamps, identifiers, observations and the decision
to reattempt only after review.

## Observation window

After any future approved cutover, observe for at least one business day (or the duration agreed in
the change ticket): marketing health/homepage, apex/www redirects, app login/logout, API health,
identity health, 4xx/5xx rates and redirect errors. No new observability platform is required.

## MKT-03G dry run

| Step | Classification | Evidence/next action |
| --- | --- | --- |
| Repository marketing build and browser QA | READY | Node 22 checks pass locally |
| Standalone marketing origin | HUMAN ACTION REQUIRED | Docker boundary exists; provision and verify remote preview |
| Apex current route | HUMAN ACTION REQUIRED | Confirm effective Cloudflare route and rollback target |
| `www` DNS, SSL and redirect | HUMAN ACTION REQUIRED | Provision and verify in Cloudflare |
| App/auth entry | HUMAN ACTION REQUIRED | Host and login/recovery start are live; callback/session/reset/invite/logout must be exercised |
| API host | BLOCKED | Health and app-only origin observed; reconcile credentials-header drift |
| Identity host | HUMAN ACTION REQUIRED | Host responds; effective realm/client values and auth flow are unverified |
| Keycloak client/realm | HUMAN ACTION REQUIRED | Verify redirect/logout/origin/link settings |
| CORS/CSRF/cookies | HUMAN ACTION REQUIRED | Inspect deployed headers and browser session |
| Production indexing | NOT APPLICABLE | Must remain off in this milestone |

**Dry-run score:** 1 of 9 executable readiness areas is `READY` (11.1%); seven require human
production access or an end-to-end authenticated session and one is blocked on deployed/repository
CORS reconciliation. Repository
preparation is complete, but the production cutover is **not ready to execute** until those checks are
recorded. Cutover status remains `NOT EXECUTED`; production changes made by MKT-03G: `NONE`.

## MKT-03H gate-closure record

### CORS root cause and expected policy

The MKT-03G discrepancy was a source-alignment error, not evidence of reverse-proxy injection.
Production reports build `6afc203238aa9ed2058dfbc819aca021107ff3d5`, from the newer
server-managed browser-session lineage on `origin/main`. That source deliberately configures:

- `Access-Control-Allow-Origin: https://app.buildwithwitness.com`;
- credentialed browser requests and `Access-Control-Allow-Credentials: true`;
- host-only API cookie authentication; and
- exact-Origin CSRF rejection for cookie-authenticated unsafe methods.

This working branch is behind `origin/main` and contains the superseded bearer/session-storage model,
which sets `credentials: false`. Caddy and the checked-in Tunnel configuration do not inject CORS
headers. Expected and deployed production policy therefore agree. Remediation is not a production
policy change: rebase/merge the commercial work onto current `main` through normal review before it
can become a cutover commit. Do not port only the CORS flag; the cookie transport, client fetch mode,
CSRF middleware, callback and tests are one atomic security design.

### Authenticated-host reference audit

| Reference class | Occurrences and conclusion |
| --- | --- |
| Correct app host | Independent-domain environment contract, config tests, runtime tests, identity runbook and marketing sign-in all use `https://app.buildwithwitness.com` |
| Correct marketing host | `WITNESS_PUBLIC_URL`, marketing canonical/metadata/robots/sitemap and public email domain correctly use `https://buildwithwitness.com` |
| Legacy/requires change | This branch's callback test expects an app URL fragment carrying a bearer token; it is superseded by `origin/main`'s host-only API cookie and app-root redirect |
| Documentation only | Architecture and operations documents describe the public/product namespace; `WITNESS_PUBLIC_URL` is product identity, not an authenticated redirect target |
| Test fixture | Config and marketing tests intentionally assert the split host contract; malformed bare-domain cases are negative fixtures |

No authenticated application runtime URL was found that deliberately returns a signed-in browser to
the marketing apex. API calls use `NEXT_PUBLIC_WITNESS_API_URL`; callback, auth error and invitation
destinations derive from `WITNESS_WEB_BASE_URL`, which must be the app origin.

### Authentication and Keycloak production values

Read-only requests verify login and forgot-password entrypoints generate state, nonce, PKCE S256 and
the exact API callback. Current `origin/main` validates the single-use state/nonce/PKCE attempt, sets
the API-host session cookie, redirects success to `WITNESS_WEB_BASE_URL`, and redirects failure to
`auth/error` under the same base. Application logout revokes the Witness session and clears that
cookie; it does not currently perform RP-initiated Keycloak logout.

Before cutover, inspect the effective Keycloak client and realm values. Realm import does not update
an already-created realm:

| Keycloak field | Required production value |
| --- | --- |
| Client ID | `witness-api` (or the recorded effective `KEYCLOAK_CLIENT_ID`) |
| Root URL | `https://app.buildwithwitness.com/` |
| Home URL | `https://app.buildwithwitness.com/` |
| Valid Redirect URIs | exactly `https://api.buildwithwitness.com/api/v1/auth/callback` |
| Valid Post Logout Redirect URIs | `https://app.buildwithwitness.com/*` only if RP logout is enabled |
| Web Origins | exactly `https://app.buildwithwitness.com` |
| Admin URL | blank unless an implemented back-channel feature requires it |
| Keycloak hostname | `https://id.buildwithwitness.com` through `KC_HOSTNAME`/`OIDC_PUBLIC_URL` |
| Realm frontend URL | `https://id.buildwithwitness.com` if explicitly configured; otherwise verify hostname-derived value |
| Password reset | provider link stays on `id.`, uses the API callback, then returns to app |
| Invitation | application email contains `https://app.buildwithwitness.com/activate`; no token is embedded |

Avoid wildcard callback URIs. The post-logout wildcard is unnecessary until Keycloak logout is
implemented and should not be broadened to the marketing apex.

### Cookie model

Current production-source contract creates one application cookie:

| Attribute | Value |
| --- | --- |
| Name | `witness_session` |
| Issuer/host | API callback on `api.buildwithwitness.com` |
| Domain | absent (host-scoped to API) |
| Path | `/` |
| SameSite | `Lax` |
| Secure | true in every deployed profile |
| HttpOnly | true |
| Expiry | absolute `AuthSession.expiresAt`; default session TTL is 480 minutes |

No `Domain=.buildwithwitness.com` configuration exists in current production source. The marketing
apex therefore does not receive the Witness session cookie. The architecture is cutover-safe, but an
approved browser login must still inspect the deployed `Set-Cookie` before the production gate closes.

### Preview deployment plan

Use the existing standalone Node container; do not convert it to Pages. On the approved Docker host:

```sh
docker build -f apps/marketing/Dockerfile \
  --build-arg WITNESS_MARKETING_SITE_URL=https://preview.buildwithwitness.com \
  --build-arg WITNESS_MARKETING_ENV=preview \
  --build-arg WITNESS_MARKETING_INDEXABLE=false \
  -t witness-marketing:preview-<commit> .
docker run -d --name witness-marketing-preview --restart unless-stopped \
  -p 127.0.0.1:3002:3000 witness-marketing:preview-<commit>
```

If the existing connector runs in the Witness Compose network, prefer adding the preview container to
that network and route its dedicated Tunnel public hostname directly to
`http://witness-marketing-preview:3000`; otherwise route a separately approved connector to
`http://127.0.0.1:3002`. In Cloudflare Zero Trust → Networks → Tunnels → the selected tunnel → Public
Hostnames, add `preview.buildwithwitness.com` with service type HTTP and the reviewed origin above.
Confirm the generated proxied DNS record and Universal SSL coverage. Removal/rollback is to delete the
preview public hostname/DNS record, then `docker stop witness-marketing-preview` and
`docker rename witness-marketing-preview witness-marketing-preview-retired-<timestamp>` until the
change record permits deletion.

Run `/`, `/health`, `/robots.txt`, `/sitemap.xml` and:

```sh
WITNESS_MARKETING_E2E_BASE_URL=https://preview.buildwithwitness.com \
  pnpm --filter @witness/marketing test:e2e
```

Do not call the preview ready until these real HTTPS checks pass.

### Exact `www` human configuration

1. Cloudflare Dashboard → `buildwithwitness.com` → **DNS → Records** → Add record.
2. Type: `A`; Name: `www`; IPv4 address: `192.0.2.1` (documentation-only placeholder); Proxy status:
   **Proxied**; TTL: **Auto**. The proxied placeholder must never be exposed as DNS-only.
3. Confirm **SSL/TLS → Edge Certificates** covers `www.buildwithwitness.com` before testing HTTPS.
4. Go to **Rules → Redirect Rules** → Create rule → Single Redirect.
5. Name: `www to canonical apex`; custom filter:
   `http.host eq "www.buildwithwitness.com"`.
6. Dynamic target URL:
   `concat("https://buildwithwitness.com", http.request.uri.path)`.
7. Status code: **308**; Preserve query string: **Enabled**.
8. Place it before origin-dependent rules. Test HTTP and HTTPS `/`, `/foo`, and
   `/platform?source=campaign`; each must make one hop to the equivalent HTTPS apex URL.
9. Record the DNS and rule IDs. Roll back by disabling the rule and removing the `www` placeholder
   record; this never restores `www` as a second site.

### Marketing release candidate RC1

- Base main: `a361a4f29fbff687faa0c42d6466452377a6e782`.
- Source commit: `efba8b7` on `feat/commercial-site-launch-readiness`.
- Image: `witness-marketing:efba8b7`.
- Local content-addressable image ID:
  `sha256:3a4d8696d7b4f72f9ecb666db358bb3c17ffd1f0f39e84348754a48d48253190`.
- Registry digest: not available because RC1 has not been pushed; record it if preview deployment
  publishes the image to an approved registry.
- Built: `2026-09-04T07:53:03Z`, Linux arm64, Node 22 Bookworm runtime.
- Build configuration: canonical production URL, production environment, indexing off.
- Container: `witness-marketing-rc1`, tested on loopback port 3019 and then stopped.
- Homepage, health, robots and sitemap: `PASS`.
- Canonical/noindex/no-auth-redirect/no-cookie checks: `PASS`.
- RC1 browser QA at 320, 375, 430, 768, 1024 and 1440: `PASS`.
- Remote browser QA: `BLOCKED` pending preview provisioning.

RC1 is reproducible from a clean source commit and immutable local image ID. It has not been pushed
or deployed and is not authorised for the production apex.

### MKT-03H dry run

| Area | Classification | Evidence/next gate |
| --- | --- | --- |
| Repository marketing build | READY | Production/noindex standalone build and local smoke pass |
| Remote preview | HUMAN ACTION REQUIRED | Provision hostname/container/Tunnel and run remote suite |
| Apex rollback baseline | HUMAN ACTION REQUIRED | Complete dashboard and production-host worksheet |
| App host | HUMAN ACTION REQUIRED | Host works; complete authenticated browser flow |
| API/CORS | READY | Live policy matches current production source and app-only origin |
| Identity | READY | Host, discovery path and API readiness verified |
| Keycloak config | HUMAN ACTION REQUIRED | Inspect effective existing realm/client values |
| Cookies/auth | HUMAN ACTION REQUIRED | Source is safe; inspect deployed cookie and complete flows |
| `www` | HUMAN ACTION REQUIRED | Exact configuration prepared; DNS/rule absent |
| Final change approval | HUMAN ACTION REQUIRED | No approval requested or granted |

Repository readiness is 9 of 10 MKT-03H preparation requirements (90%); the missing remote preview is
external. Production cutover readiness is 3 of 10 areas `READY` (30%). MKT-03H repository work can be
verified complete, but cutover remains not ready and not executed.

### MKT-03I dry run

| Gate | Classification | Evidence/next gate |
| --- | --- | --- |
| Current-main clean source | READY | Fresh branch from `a361a4f`; stale auth edits excluded |
| Immutable marketing RC1 | READY | Tagged image and content-addressable ID recorded |
| Local RC1 QA | READY | HTTP, headers and six-width browser suite pass |
| Remote preview | HUMAN ACTION REQUIRED | No Cloudflare credentials, Tunnel access or server SSH available |
| Remote browser QA | BLOCKED | Requires the HTTPS preview |
| Apex rollback baseline | HUMAN ACTION REQUIRED | External state recorded; exact dashboard/server IDs remain |
| App independent operation | HUMAN ACTION REQUIRED | Repository contract passes; synthetic browser login required |
| API CORS/CSRF | READY | Current-main source and focused tests pass; live headers agree |
| Identity/Keycloak | HUMAN ACTION REQUIRED | Health and entrypoints pass; effective client values require access |
| Auth/cookie flow | HUMAN ACTION REQUIRED | Source/tests pass; deployed cookie requires browser inspection |
| Password reset | HUMAN ACTION REQUIRED | Construction/tests pass; synthetic mailbox flow required |
| Invitation flow | HUMAN ACTION REQUIRED | App activation URL/tests pass; synthetic mailbox flow required |
| `www` readiness | READY | Exact DNS/rule/SSL/rollback instructions prepared; not executed |
| SSL | HUMAN ACTION REQUIRED | Existing hosts work; preview and `www` coverage absent/unverified |
| Final production approval | HUMAN ACTION REQUIRED | Not requested or granted |

Readiness scores after MKT-03I:

- Repository release readiness: 100% (clean current-main source, full verification and immutable RC1).
- Remote marketing readiness: 25% (deployment path/runner ready; hostname, HTTPS and remote QA absent).
- Auth cutover readiness: 50% (source, tests and live entrypoints ready; effective config and synthetic
  end-to-end flows remain).
- Production cutover readiness: 5 of 15 gates `READY` (33.3%).

Production apex changes: `NONE`. Indexing: `OFF`. Cutover status: `NOT EXECUTED`.

### MKT-03J external gate matrix

| # | Gate | Classification | Evidence / exact next action |
| --- | --- | --- | --- |
| 1 | Clean current-main source | READY | Clean release branch based on `a361a4f` |
| 2 | Immutable RC1 | READY | `witness-marketing:efba8b7`, local image ID recorded |
| 3 | Local RC1 QA | READY | Local HTTP and six-width browser QA passed |
| 4 | Preview deployed | HUMAN ACTION REQUIRED | Deploy isolated RC1 container; record immutable digest |
| 5 | Preview HTTPS | BLOCKED | Requires preview deployment, Tunnel hostname and DNS |
| 6 | Remote browser QA | BLOCKED | Run remote suite only after HTTPS succeeds |
| 7 | Preview SSL | BLOCKED | Confirm Universal SSL after proxied hostname exists |
| 8 | Apex rollback baseline | HUMAN ACTION REQUIRED | Record exact DNS/Tunnel/Worker/origin IDs |
| 9 | Production server baseline | HUMAN ACTION REQUIRED | Run the read-only commands in the baseline document |
| 10 | App independent operation | HUMAN ACTION REQUIRED | Complete approved synthetic end-to-end browser test |
| 11 | API CORS/CSRF | READY | Live CORS is app-only/credentialed; aligned source tests pass |
| 12 | Effective Keycloak config | HUMAN ACTION REQUIRED | Export/read client values and compare exact values below |
| 13 | Login | HUMAN ACTION REQUIRED | Synthetic account required |
| 14 | Cookie scope | HUMAN ACTION REQUIRED | Inspect authenticated `witness_session` in browser |
| 15 | Logout | HUMAN ACTION REQUIRED | Synthetic authenticated session required |
| 16 | Password reset | HUMAN ACTION REQUIRED | Approved synthetic mailbox required |
| 17 | Invitation | HUMAN ACTION REQUIRED | Synthetic organisation/user and mailbox required |
| 18 | `www` DNS/rule readiness | READY | Exact design and rollback prepared; not executed |
| 19 | `www` SSL readiness | BLOCKED | DNS absent; confirm certificate before rule activation |
| 20 | Apex SSL | READY | Public HTTPS returned `200` through Cloudflare |
| 21 | Final production approval | HUMAN ACTION REQUIRED | Separate MKT-03K approval not requested |

Readiness: repository release 100%; remote marketing 25%; auth cutover 50%; rollback 25%; production
cutover 6/21 (28.6%). `CUTOVER RECOMMENDATION: NO-GO`.

#### Exact privileged handoff

1. On the approved server, deploy `witness-marketing-preview` from an immutable registry digest built
   from `efba8b7`, attach it to the existing Tunnel-reachable network, expose only container port 3000,
   and verify its internal `/health`. Supply no database, API or Keycloak secrets.
2. In Cloudflare Dashboard → `buildwithwitness.com` → Zero Trust → Networks → Tunnels → the existing
   production Tunnel → Public Hostnames, add hostname `preview`, domain `buildwithwitness.com`, type
   `HTTP`, URL `witness-marketing-preview:3000`. Confirm the generated proxied DNS record and Universal
   SSL; record DNS record ID, Tunnel ID, public-hostname ID and origin service. Do not touch other hosts.
3. In Cloudflare Dashboard → DNS → Records and Workers & Pages/Routes, record apex/app/API/id record
   IDs, types, targets, proxy, TTL and Worker routes. In the Tunnel public-hostname view record Tunnel
   ID and origin services. Capture the current apex restoration target verbatim.
4. In Keycloak realm `witness` → Clients → `witness-api`, record Root/Home URL, exact redirect URI,
   Web Origin and logout settings. Expected app URLs are `https://app.buildwithwitness.com/`, callback
   `https://api.buildwithwitness.com/api/v1/auth/callback`, with no marketing Web Origin or wildcard.
5. With an approved synthetic account/mailbox, execute login, cookie inspection, logout, reset and
   invitation checks. Record outcomes only—never credentials or tokens.

After preview TLS is active, verify `/`, `/health`, `/robots.txt` and `/sitemap.xml`, then run:

```sh
WITNESS_MARKETING_E2E_BASE_URL=https://preview.buildwithwitness.com \
  pnpm --filter @witness/marketing test:e2e
```
