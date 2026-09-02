# ADR-0024: Server-managed browser sessions

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-09-02 |
| **Deciders** | Identity, Security, Frontend Architecture |
| **Consulted** | Repository governance and automated security review |
| **Informed** | Witness operators and application users |
| **Supersedes** | None |
| **Related** | Issue #199; issue #198 |
| **Principles engaged** | P1, P6, P7 |

## Context

Production build `be3979442fdf9ebc98aed8985eb9662c01606f07` exposed the application
session token in an OIDC callback URL fragment and stored it in `sessionStorage`. Human testing
confirmed that Tab A remained authenticated while a newly opened Tab B rendered signed out.
`sessionStorage` is tab-scoped, so this was the designed consequence rather than a transient fault.

The model also made the bearer credential readable by any JavaScript executing in the application
origin. Server-side sessions were hashed, expiring and revocable, and authorisation remained
server-enforced, but the browser transport enlarged the XSS blast radius and made login, expiry and
logout presentation depend on per-tab client state.

## Decision

Browser sessions use the existing opaque Witness session credential in a host-only API cookie:

- name `witness_session`;
- `HttpOnly`;
- `Secure` in every deployed profile;
- `SameSite=Lax`, which permits the top-level OIDC return while withholding the cookie on
  cross-site subrequests;
- `Path=/`;
- no `Domain`, so the cookie belongs only to the API host;
- absolute expiry equal to the server-side `AuthSession.expiresAt`.

The OIDC callback continues to validate single-use state, PKCE and nonce before resolving the
Witness identity. It creates a new random application session, sets the cookie, and redirects to
the fixed application base URL. No session credential appears in the URL or frontend JavaScript.

The application and API are different origins but the same site in production. Browser fetches use
credentialed CORS restricted to the configured application origin. Every cookie-authenticated
`POST`, `PUT`, `PATCH` or `DELETE` additionally requires an exact matching `Origin`; missing and
foreign origins fail closed. SameSite is defence-in-depth, not the only CSRF control.

Bearer presentation remains supported as a separate transport for service/API clients. If both are
present, the explicit Bearer credential wins. Cookie transport does not alter session resolution,
tenant scoping, role resolution or policy enforcement.

Logout revokes the server row first, expires the cookie, and only then broadcasts a credential-free
`session-invalidated` UI signal. Tabs also query `/api/v1/me` at initialization and periodically,
so new tabs share login automatically and stale tabs converge after expiry or revocation.

The service worker caches only hashed static assets. It does not cache navigation HTML, callback,
logout, `/api/v1/me`, or API responses.

## Migration

This is a controlled cutover. Existing browser `sessionStorage` credentials are not imported into
the cookie or copied between tabs; affected users authenticate once again. The API may honour an
unexpired Bearer session for explicit clients until its normal expiry, but the browser code no
longer reads or sends it. There are not two indefinite browser authorities.

## Consequences

### Positive

- All tabs automatically present one server-managed browser session.
- JavaScript and cross-tab messages cannot read or transport the session credential.
- XSS can still act with the user's ambient authority while executing, but cannot exfiltrate the
  HttpOnly token for reuse elsewhere.

### Negative

- Cookie authentication requires credentialed CORS and maintained Origin checks.
- Keycloak SSO lifetime remains distinct from Witness application-session lifetime; RP-initiated
  Keycloak logout remains governed separately by issue #198.

### Neutral

- Local HTTP development uses the same host-only cookie without `Secure`; deployed profiles fail
  closed to HTTPS-only cookie transport.

### Risks accepted

- An XSS executing in the application origin can issue requests with ambient cookie authority,
  although it cannot read and export the credential. Content-security and input controls remain
  required independently of the session transport.

## Compliance and enforcement

CI enforces this decision through API session, CSRF, callback, adversarial browser-storage and
service-worker cache tests. Changes to browser authentication transport require an ADR update and
the normal security review gates.

## Reversal

Reversal requires a replacement server-managed browser-session mechanism that preserves shared
tab state, server revocation, credential confidentiality and CSRF protection. Reintroducing a
browser-readable bearer credential is not an acceptable rollback.

## Alternatives rejected

- `localStorage`: multi-tab capable but maximises credential persistence and XSS exposure.
- token transfer through `BroadcastChannel`: exposes a bearer credential to every same-origin
  execution context and creates synchronization/fixation complexity.
- parent-domain cookie: unnecessary; credentialed calls target the API host directly and a wider
  Domain would increase exposure across subdomains.
- Keycloak token in a browser cookie: couples application authority to provider credentials and
  increases impact if the cookie is misrouted.
