# Witness Production Baseline for Marketing Cutover

**Owner:** Engineering and Operations
**Status:** Partially verified; human Cloudflare and host access required
**Last reviewed:** 2026-09-04

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
| Preview | No remote preview verified; no Cloudflare credentials are available locally |
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
| `preview` | Absent | N/A | None observed | None observed | Future marketing preview |

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

Read-only SSH to the documented production host failed with `Permission denied (publickey)` from the
current environment, so container image IDs and the rendered Tunnel ingress could not be recorded.
An authorised operator must run:

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
