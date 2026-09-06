# Witness Production Baseline for Marketing Cutover

**Owner:** Engineering and Operations
**Status:** Host/SSH access restored 2026-09-05; preview live but stale (pre-MKT-04/05/06);
Cloudflare dashboard access (DNS record IDs, Worker routes) still requires a human operator
**Last reviewed:** 2026-09-05

This worksheet records the restoration target before the marketing apex cutover. It is not authority
to change production. Copy the completed values into the approved change ticket immediately before
cutover because dashboard state can change after this repository record is reviewed.

## Verified external baseline

| Surface | Verified state |
| --- | --- |
| Apex | Cloudflare-proxied; HTTP 200; byte-identical product HTML to `app.` |
| App | Cloudflare-proxied; HTTP 200 authenticated product surface |
| API | Cloudflare-proxied; `/health` and `/ready` HTTP 200 |
| Identity | Cloudflare-proxied; HTTPS responds and Keycloak is healthy through API readiness |
| `www` | No A/CNAME answer |
| Preview | **Superseded 2026-09-05 — see "MKT-06 pre-flight re-verification" below.** This row is the 2026-09-04 snapshot: no remote preview verified, no Cloudflare credentials locally. Now live, on a stale build. |
| API build | `0.4.0`, build `6afc203238aa9ed2058dfbc819aca021107ff3d5` |
| API profile | `hybrid`; instance `Witness Production (witness-prod-01)` |

The production build matches the server-managed browser-session lineage on `origin/main`: credentialed
CORS is deliberate for the API-host cookie. It does not match this branch's older bearer-only source.

## Cloudflare current-state worksheet

In Cloudflare Dashboard → `buildwithwitness.com`, complete every blank before approving cutover.

| Host | DNS record/target | Proxied | Worker route | Tunnel public hostname/route | Origin service |
| --- | --- | --- | --- | --- | --- |
| Apex | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | Observed yes | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | Current product web |
| `app` | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | Observed yes | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | Current product web |
| `api` | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | Observed yes | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | API gateway |
| `id` | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | Observed yes | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` | Keycloak |
| `www` | Absent | N/A | None observed | None observed | Permanent redirect only |
| `preview` | `REQUIRES HUMAN CLOUDFLARE VERIFICATION` for the exact DNS record ID | Observed yes (`server: cloudflare` on live responses) | None observed | `preview.buildwithwitness.com → witness-marketing-preview:3000`, read directly from the host's `cloudflared/config.yml` 2026-09-05 — not dashboard-verified, but the source config itself | `witness-marketing-preview` container, stale `efba8b7` build — see "MKT-06 pre-flight re-verification" below |

Dashboard path: **DNS → Records** for record/target/proxy state; **Rules → Redirect Rules** for rule
IDs and precedence; **Zero Trust → Networks → Tunnels → Public Hostnames** for effective Tunnel
mapping; **Workers & Pages → Overview** and the zone's Worker Routes for any Worker interception;
**SSL/TLS → Edge Certificates** for hostname coverage.

## Rollback identifiers

Record all values immediately before the change:

- [ ] Current apex DNS record ID, type, target, proxy state and TTL.
- [ ] Current apex Worker route and deployed Worker version, or explicit `NONE`.
- [ ] Current apex Tunnel ID and public-hostname mapping, or explicit `NONE`.
- [ ] Current reverse-proxy target for apex.
- [ ] Running product web image ID/digest and container name.
- [ ] Running API image ID/digest and container name.
- [ ] Current known-good product deployment commit and workflow/run ID.
- [ ] Marketing candidate image digest and deployment identifier.
- [ ] `www` DNS record and Redirect Rule IDs once created.
- [ ] Preview DNS/Tunnel/deployment identifiers and removal command.

**Superseded 2026-09-05.** SSH to the documented production host now succeeds (was
`Permission denied (publickey)`) — see "MKT-06 pre-flight re-verification" below, which already
recorded the checked-out repo commit, the running container list, the marketing preview's exact
image digest, and the rendered Tunnel ingress from that access. Still outstanding from the list
above: exact `witness-pilot-web`/`witness-pilot-api` image digests (only their image names were
recorded, not `docker image inspect` output), and every Cloudflare-dashboard-only fact (DNS record
IDs, Worker route/version, TTL) — those still need a human operator with Cloudflare access, not
just SSH. The original commands remain correct for capturing what's still missing:

```sh
cd /home/witness/witness
git rev-parse HEAD
docker compose --env-file .env -f deployments/cloud-managed/docker-compose.pilot.yml ps
docker image inspect witness-pilot-web:latest witness-pilot-api:latest \
  --format '{{.RepoTags}} {{.Id}} {{.Created}}'
sed -n '1,180p' deployments/cloud-managed/cloudflared/config.yml
```

Do not copy secrets or the full production environment into the change ticket.

## MKT-03I release baseline

| Item | Value |
| --- | --- |
| Base main | `a361a4f29fbff687faa0c42d6466452377a6e782` |
| Marketing source | `efba8b7` |
| Image tag | `witness-marketing:efba8b7` |
| Local image ID | `sha256:3a4d8696d7b4f72f9ecb666db358bb3c17ffd1f0f39e84348754a48d48253190` |
| Image created | `2026-09-04T07:53:03Z` |
| Architecture | Linux arm64; Node 22 Bookworm |
| Registry digest | Not available; image was not pushed |
| Local RC1 | Verified and stopped; no production routing |
| Preview identifiers | `HUMAN ACTION REQUIRED` |

No Cloudflare/DigitalOcean credential variables were available in the local environment. Production
SSH was not retried after the known public-key failure. Consequently no DNS, Tunnel, Worker or server
identifier in the worksheet is inferred or fabricated.

## MKT-03J public observation — 2026-09-04

| Host | Public result | SSL | Privileged identifiers |
| --- | --- | --- | --- |
| `buildwithwitness.com` | Cloudflare-proxied HTTPS `200`; current product | ACTIVE | HUMAN ACTION REQUIRED |
| `app.buildwithwitness.com` | Cloudflare-proxied HTTPS `200`; current product | ACTIVE | HUMAN ACTION REQUIRED |
| `api.buildwithwitness.com` | HTTPS active; `/` `404`; app-only credentialed CORS | ACTIVE | HUMAN ACTION REQUIRED |
| `id.buildwithwitness.com` | HTTPS `302` to admin; realm discovery valid | ACTIVE | HUMAN ACTION REQUIRED |
| `preview.buildwithwitness.com` | DNS absent | NOT PROVISIONED | HUMAN ACTION REQUIRED |
| `www.buildwithwitness.com` | DNS absent | NOT PROVISIONED | Not authorised |

Access inventory: Cloudflare `NO`; DigitalOcean/production server `NO`; SSH `NO` (known key rejection,
not retried); Keycloak admin `NO`; approved synthetic account `NO`; synthetic mailbox `NO`. The local
`cloudflared` binary is not control-plane authorization. Exact apex rollback remains unavailable and
the cutover recommendation is `NO-GO`.

## MKT-06 pre-flight re-verification — 2026-09-05

**Access has changed since MKT-03J (2026-09-04) above.** Re-verified directly before assuming
either state, per standing instruction not to assume:

- SSH to `witness@167.172.72.70` now succeeds (was `Permission denied (publickey)`). Read-only
  commands only were run — no production mutation.
- `git -C /home/witness/witness rev-parse HEAD` → `d39b293f6477d3ecb9799862e39efef2a17acf51`
  (`Merge pull request #181`), 67 commits behind current `main`. This is the checked-out repo
  commit, not the running API's own build version (`0.4.0`, build `6afc203...`, recorded above) —
  the two can differ when a container hasn't been rebuilt since a later checkout, which is what
  this is.
- `docker ps` on the host (bypassing `docker compose ps`, which fails locally on two undefined env
  vars the deploy pipeline sets at deploy time, not present in a static checkout):

  | Container | Image | Status |
  | --- | --- | --- |
  | `witness-pilot-web-1` | `witness-pilot-web` | healthy |
  | `witness-pilot-api-1` | `witness-pilot-api` | healthy |
  | `witness-pilot-keycloak-1` | `quay.io/keycloak/keycloak:26.0` | healthy |
  | `witness-marketing-preview` | `witness-marketing:preview-efba8b7` | healthy, up since 2026-09-04T14:49:16Z |
  | `witness-pilot-postgres-1` | `pgvector/pgvector:pg16` | healthy |
  | `witness-pilot-cloudflared-1` | `cloudflare/cloudflared:latest` | up |
  | `witness-pilot-ollama-1` | `ollama/ollama:latest` | healthy |

- `witness-marketing-preview` image digest:
  `sha256:5bd75298c879de0fa381464104053f0281d9a3123f145a6dd88636b537b05bc8`; env
  `NODE_ENV=production`, `WITNESS_MARKETING_SITE_URL=https://preview.buildwithwitness.com`,
  `WITNESS_MARKETING_ENV=preview`, `WITNESS_MARKETING_INDEXABLE=false`; network `witness-pilot`
  (the existing application network — no new network created).
- Cloudflare Tunnel ingress (`deployments/cloud-managed/cloudflared/config.yml` on the host, tunnel
  `35391ae3-9882-4f35-8f47-e1c1b3f31fb7`) routes `preview.buildwithwitness.com` to
  `http://witness-marketing-preview:3000` only, with an explicit deny-by-default catch-all rule
  after it. No other hostname's rule was changed to add this one.
- External checks (from outside the host, ordinary HTTPS): `/` → `200`, `/health` → `200`,
  `/sitemap.xml` → `200`, `/robots.txt` → `Disallow: /`. `/platform`, `/solutions` and
  `/how-it-works` → `404` (the deployed `efba8b7` build predates all three).
- Cloudflare dashboard-only facts (DNS record IDs, Worker routes, exact SSL certificate coverage)
  remain `HUMAN ACTION REQUIRED` — SSH and `docker`/`git` access do not substitute for Cloudflare
  API/dashboard access, and none was used or assumed here.

**Updated access inventory:** SSH `YES` (read-only used); Docker on host `YES` (read-only used);
Cloudflare dashboard/API `NO`; Keycloak admin API `NOT RE-TESTED`; approved synthetic account `NO`;
synthetic mailbox `NO`. This does not change the `NO-GO` cutover recommendation — apex cutover
depends on gates unrelated to SSH/Docker access (Keycloak config verification, synthetic auth
flows, `www` provisioning, final MKT-03K approval), none of which this re-verification touched.
