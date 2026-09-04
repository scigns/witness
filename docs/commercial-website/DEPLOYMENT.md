# Witness Commercial Website Deployment

**Owner:** Engineering, Operations and Product
**Status:** MKT-01D repository hardening complete; isolated preview provisioning pending
**Last reviewed:** 2026-09-04

## Selected architecture

The marketing application uses the existing portable Next.js standalone output, packaged as
`apps/marketing/Dockerfile`. This is the least disruptive option for the current system: it keeps the
public site independent from `apps/web`, requires no product API or database, and can run as a small
Node origin behind the existing Cloudflare edge. Cloudflare Pages and Workers were not selected because
the repository has no existing project, adapter, credentials contract or preview workflow for this
Next.js application.

The image contains only the marketing standalone server, static assets and public files. Its health
probe is `GET /health`, and it has no migration or persistent-data rollback concerns.

## Environment model

| Environment                      | Deployment URL                 | Canonical URL                  | Indexing        | Product/API | Secrets                             |
| -------------------------------- | ------------------------------ | ------------------------------ | --------------- | ----------- | ----------------------------------- |
| Local                            | `http://localhost:3002`        | `https://buildwithwitness.com` | Off             | None        | None                                |
| Preview                          | Isolated approved hostname     | `https://buildwithwitness.com` | Off             | None        | None                                |
| Production before launch         | Approved marketing origin      | `https://buildwithwitness.com` | Off             | None        | None                                |
| Production after approved launch | `https://buildwithwitness.com` | Same                           | Explicit opt-in | None        | Only if later features require them |

Indexing requires `WITNESS_MARKETING_INDEXABLE=true`, `WITNESS_MARKETING_ENV=production`, and an
exact deployment-origin match. Preview configuration must never set all three conditions.

## Build and package

```sh
pnpm --filter @witness/marketing lint
pnpm --filter @witness/marketing typecheck
pnpm --filter @witness/marketing test
pnpm --filter @witness/marketing build
docker build -f apps/marketing/Dockerfile -t witness-marketing:preview .
```

The repository bundle check now evaluates `apps/web` and `apps/marketing` explicitly. It no longer
selects the first `.next` directory found.

The three indexing variables are non-secret build arguments for the static Next.js metadata routes.
The preview image must retain their defaults. A future production launch image must pass
`WITNESS_MARKETING_SITE_URL=https://buildwithwitness.com`, `WITNESS_MARKETING_ENV=production` and
`WITNESS_MARKETING_INDEXABLE=false` for the initial controlled cutover. Enabling indexing is a later,
separate human-approved launch action.

## Preview deployment and smoke test

MKT-01D does not provision external infrastructure. A preview requires a Cloudflare project or an
approved isolated hostname and origin, plus the repository's existing deployment credential process.
After provisioning, the deployment gate must run:

```text
GET /
GET /health
GET /robots.txt
GET /sitemap.xml
```

The checks must assert HTTP success, the Witness title, semantic shell, canonical metadata pointing
to `https://buildwithwitness.com`, `noindex`, disallowing robots, a canonical sitemap URL and the
stable health payload. No product cookies, auth redirect or customer data may be present.

MKT-03H retains the standalone container architecture and specifies
`preview.buildwithwitness.com` → Cloudflare Tunnel → isolated marketing container. The exact build,
container, Tunnel public-hostname, HTTPS smoke, remote browser and reversible removal steps are in
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md). No preview hostname has been provisioned.

The current-main production/noindex RC1 passed `/`, `/health`, `/robots.txt`, `/sitemap.xml` and the
six-width browser suite in its container. The image is `witness-marketing:efba8b7`, with local image
ID `sha256:3a4d8696d7b4f72f9ecb666db358bb3c17ffd1f0f39e84348754a48d48253190`.
An approved registry push or equivalent preview-host build must record the registry digest. See
[`CURRENT_PRODUCTION_BASELINE.md`](CURRENT_PRODUCTION_BASELINE.md) for the production restoration
worksheet.

## Caching and headers

Static marketing output may be cached by Cloudflare. Do not cache future form submissions, personalised
responses or authentication/API traffic under this origin. The Next.js boundary sets baseline
`Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options` and `Permissions-Policy` headers. A
content-security policy remains deferred until the final asset and runtime inventory is known.

## Rollback

Record the image/deployment identifier and the previously serving identifier for every preview or future
production deployment. Rollback means restoring the previous identifier, then repeating `/health`, `/`,
`/robots.txt` and `/sitemap.xml` smoke checks. No database rollback is required because the marketing
application owns no persistent production data.

## Production cutover checklist — human approval required

`HUMAN ACTION REQUIRED: YES` before any item below:

1. Provision and verify an isolated preview hostname and origin.
2. Review the Cloudflare route/DNS change that moves `buildwithwitness.com` from the current product
   origin to the marketing origin.
3. Preserve `app.buildwithwitness.com` on the authenticated product origin.
4. Verify Keycloak redirect URIs, callback/return paths, invitation links and password-reset links.
5. Verify API CORS, CSRF, cookie scope and application redirects.
6. Configure and test `www.buildwithwitness.com` → `https://buildwithwitness.com`.
7. Confirm rollback identifiers and Cloudflare cache invalidation behaviour.
8. Only after content, trust and operational review, explicitly enable production indexing.

Do not change DNS, Worker routes, tunnel ingress, authentication configuration, production URL
environment values or indexing as part of MKT-01D.

## WWW / canonical host policy

The canonical public domain is `https://buildwithwitness.com`. `www.buildwithwitness.com` is not a
second canonical site; after an approved Cloudflare change it must return a permanent 301/308 redirect
to the equivalent HTTPS apex path while preserving the query string. The future rule must cover both
HTTP and HTTPS, run before origin routing, avoid apex matches and prevent loops. Confirm proxied DNS,
Universal SSL/custom certificate coverage, rule precedence, propagation and rollback in Cloudflare.

The intended topology is apex → marketing, `app.` → authenticated product, `api.` → API and `id.` →
Keycloak. Current effective DNS, Tunnel routes, certificate coverage and Redirect Rules require human
Cloudflare verification; repository templates are not proof of live state. See
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) for the dry run, auth/API/cookie checklist and rollback.

Initial production deployment values are review-only:

```text
WITNESS_MARKETING_SITE_URL=https://buildwithwitness.com
WITNESS_MARKETING_ENV=production
WITNESS_MARKETING_INDEXABLE=false
```

## MKT-03J operator handoff

The preview remains absent. An authorised operator must deploy the immutable RC1 (or an immutable
registry build from source `efba8b7`) as `witness-marketing-preview` on the existing application
network, with only the three documented preview variables, then add only
`preview.buildwithwitness.com` to the existing Tunnel with service
`http://witness-marketing-preview:3000`. Record the container/image/digest/network, DNS record ID,
Tunnel/public-hostname IDs, SSL state and removal command. Do not edit apex, app, API, identity or
`www`. Run the documented HTTPS probes and remote browser command only after DNS and TLS are active.
