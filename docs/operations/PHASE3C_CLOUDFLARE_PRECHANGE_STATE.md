# Phase 3C Cloudflare pre-change state (sanitized)

**Owner:** Infrastructure Lead
**Status:** Historical evidence; refresh required before cutover

Evidence source: read-only Cloudflare control-plane review performed during
Phase 3A/3B (historical; captured before Phase 3C). A fresh API refresh was not
available in this phase because Cloudflare authentication was unavailable.
This record is metadata only and contains no tunnel credentials or tokens.

| Item | Observed state |
| --- | --- |
| Product zone | `buildwithwitness.com` — active/full; no independent app/api/id records observed at review time |
| Legacy zone | `pacificdigitalconsultancy.org` — active/full; unchanged |
| Production tunnel | `witness-prod` — healthy; locally managed configuration |
| Historical tunnel | `witness-pilot` — down; locally managed configuration |
| Production route order | web, API, identity, then catch-all 404 |
| Production web route | `witness-prod-web.pacificdigitalconsultancy.org` → internal `web:3000` |
| Production API route | `witness-prod-api.pacificdigitalconsultancy.org` → internal `api:3001` |
| Production identity route | `witness-prod-id.pacificdigitalconsultancy.org` → internal `keycloak:8080` |
| Independent DNS records | none observed at review time |

Before a future cutover, an authorised operator must refresh this snapshot,
compare the local `CLOUDFLARE_TUNNEL_ID` with the `witness-prod` tunnel in the
Cloudflare account, and record route/DNS checksums in the change ticket. No
database hostname is part of the intended route set.
