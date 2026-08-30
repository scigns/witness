# Witness Independent Product Identity

**Owner:** Product and Infrastructure Leads
**Status:** Configuration contract — no production cutover
**Last reviewed:** 2026-08-30

## Identity boundary

| Concern                   | Current declaration                                                               |
| ------------------------- | --------------------------------------------------------------------------------- |
| Product                   | Witness                                                                           |
| Canonical product domain  | `https://buildwithwitness.com`                                                    |
| Authenticated application | `https://app.buildwithwitness.com`                                                |
| API                       | `https://api.buildwithwitness.com`                                                |
| Identity issuer           | `https://id.buildwithwitness.com`                                                 |
| Documentation             | `https://docs.buildwithwitness.com`                                               |
| Trust centre              | `https://trust.buildwithwitness.com` (planned publication surface)                |
| Status                    | `https://status.buildwithwitness.com` reserved; no operational service is claimed |
| Current legal operator    | Dreamers-Media Pacific                                                            |
| Infrastructure provider   | Deployment-specific; currently Cloudflare plus portable compute and PostgreSQL    |

Witness is the product. Dreamers-Media Pacific is the current legal operator; Witness is not a
separate company. Public product copy must not describe the product as “Dreamers-Media Witness”,
“Pacific Digital Consultancy Witness”, or “Witness Pty Ltd” unless a later reviewed legal transition
changes that fact.

The legal operator and infrastructure provider are deployment metadata, not domain-model identity.
Core resource names therefore remain product-neutral (`witness-web`, `witness-api`, and so on).

## Configuration contract

Existing runtime variables remain authoritative for service behaviour:

| Purpose                    | Variable                        | Scope                                                   |
| -------------------------- | ------------------------------- | ------------------------------------------------------- |
| Product landing URL        | `WITNESS_PUBLIC_URL`            | Public metadata; server configuration                   |
| Browser application origin | `WITNESS_WEB_ORIGIN`            | Server-only input used for explicit CORS                |
| Application base URL       | `WITNESS_WEB_BASE_URL`          | Server-only callback/navigation configuration           |
| Browser API URL            | `NEXT_PUBLIC_WITNESS_API_URL`   | Build-time browser-visible value                        |
| OIDC issuer                | `OIDC_ISSUER`                   | Server configuration; public issuer URL, never a secret |
| OIDC callback              | `WITNESS_OIDC_REDIRECT_URI`     | Server configuration                                    |
| Optional path deployment   | `NEXT_PUBLIC_WITNESS_BASE_PATH` | Build-time browser-visible value                        |

For the independent hosted deployment the reviewed values are:

```text
WITNESS_PUBLIC_URL=https://buildwithwitness.com
WITNESS_WEB_ORIGIN=https://app.buildwithwitness.com
WITNESS_WEB_BASE_URL=https://app.buildwithwitness.com
NEXT_PUBLIC_WITNESS_API_URL=https://api.buildwithwitness.com
NEXT_PUBLIC_WITNESS_BASE_PATH=
OIDC_ISSUER=https://id.buildwithwitness.com/realms/witness
WITNESS_OIDC_REDIRECT_URI=https://api.buildwithwitness.com/api/v1/auth/callback
```

`WITNESS_TRUST_URL` and `WITNESS_STATUS_URL` are publication-plan metadata, not application
dependencies. The status URL is reserved only; no status service is implied.

Production origins remain explicit and HTTPS-only. Authenticated CORS must never use `*`. The API
continues to validate callback origin relationships and does not derive trust from an arbitrary
Host header.

## Portability and Cloudflare boundary

Cloudflare currently provides DNS, the TLS edge, tunnel ingress, and optional CDN/security controls.
It does not own Witness commercial state, authentication semantics, authorization policy, database,
audit evidence, provenance, or domain rules. The web and API services remain runnable behind a
different ingress or on customer-controlled infrastructure. No Workers-only, D1, or proprietary
database migration is part of this contract.

PostgreSQL remains private. Public traffic terminates at an approved ingress and reaches application
services over the private deployment network; no database hostname or port is published.

## Legacy coexistence

Existing Pacific Digital Consultancy routes and hostnames are historical/internal compatibility
surfaces during migration. This PR does not redirect, delete, or change DNS for them. The new
canonical identity is `buildwithwitness.com`; the old product page may remain a referral surface and
the old application hostname may remain a temporary compatibility route where operationally needed.

Retirement requires separately verified DNS, OIDC, CORS, cookie, monitoring, customer-communication,
and rollback evidence. A cutover must be reversible by restoring the previously verified hostname
configuration.

## Transferability

The product domain, repository, deployment configuration, credentials, and operational resources
should be transferable to a future Witness legal entity without rewriting application code. This is
a technical transferability objective, not a legal conclusion about ownership or assignment.

## Claim boundary

Witness remains a **Controlled Institutional Pilot**. This document does not claim general
availability, certification, compliance, SLA coverage, or an operational status service. Revenue
Gate B remains **UNAVAILABLE** and ADR-0022 remains **PROPOSED**.
