# Independent Domain Cutover Runbook

**Owner:** Infrastructure Lead
**Status:** Planned; coexistence only
**Last reviewed:** 2026-08-30

This runbook describes a future controlled cutover to the independent Witness domain. It does not
perform a DNS change and does not replace the existing Pacific Digital Consultancy site.

## Pre-cutover contract

The target map is:

| Surface      | Host                                                         |
| ------------ | ------------------------------------------------------------ |
| Product      | `buildwithwitness.com`                                       |
| Web app      | `app.buildwithwitness.com`                                   |
| API          | `api.buildwithwitness.com`                                   |
| Identity     | `id.buildwithwitness.com`                                    |
| Docs         | `docs.buildwithwitness.com`                                  |
| Trust centre | `trust.buildwithwitness.com` (reserved publication surface)  |
| Status       | `status.buildwithwitness.com` (reserved; no service claimed) |

The current operator is Dreamers-Media Pacific. Cloudflare is an ingress provider, not the owner of
Witness application or commercial state. PostgreSQL remains private and is never assigned a public
DNS record.

## Coexistence sequence

1. Verify ownership and certificate readiness for the new hostnames without changing existing DNS.
2. Render a deployment-specific environment from the reviewed secret store. Never commit `.env` or
   tunnel credentials.
3. Set `WITNESS_PUBLIC_URL`, `WITNESS_WEB_ORIGIN`, `WITNESS_WEB_BASE_URL`,
   `NEXT_PUBLIC_WITNESS_API_URL`, `OIDC_ISSUER`, and `WITNESS_OIDC_REDIRECT_URI` to the independent
   map. Keep `NEXT_PUBLIC_WITNESS_BASE_PATH` empty for the dedicated application hostname.
4. Register the new OIDC redirect/logout origins and verify cookies, CORS, proxy headers, health,
   readiness, login, logout, and API calls using synthetic data.
5. Add new tunnel/ingress rules alongside historical routes. Do not rename the existing
   `witness-pilot` Compose project, volumes, runner labels, or tunnel ID in this operation.
6. Exercise the new hosts and retain the old route as a rollback path.
7. Communicate the verified canonical URL to pilot users.
8. Retire legacy routes only through a separately approved change with a tested rollback.

## Acceptance checks

- `https://app.buildwithwitness.com/` loads without a `/witness` prefix.
- The configured `/witness` base-path deployment still passes its existing build and callback tests.
- CORS accepts only the reviewed application origin.
- OIDC issuer, callback, logout, and cookie behaviour all use the new identity host.
- API and readiness endpoints do not expose database or secret configuration.
- PostgreSQL has no public listener or DNS record.
- Sovereign deployment still starts without Cloudflare or external egress.
- Existing PDC routes remain available until explicit retirement approval.

## Rollback

Rollback is configuration-first: restore the last verified hostname, OIDC, CORS, tunnel, and web
build values; leave database data and migrations untouched. Do not delete DNS records, volumes,
tunnel credentials, or historical routes as part of rollback.

The independent domain is a product-identity transition, not a payment, entitlement, subscription,
or data migration. Revenue Gate B remains unavailable.
