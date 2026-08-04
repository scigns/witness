# Keycloak integration verification (Authentication, Milestone 1.3)

**Owner:** Backend Lead
**Status:** NOT YET RUN — no container runtime is available in the development sandbox that
authored this plan (`docker ps` fails with "Cannot connect to the Docker daemon"; nested
containerization is not permitted there). This is a statement of what has **not** been verified,
not a claim that it has.

**This is a pilot-blocking gate.** `KeycloakOidcAdapter` (`services/api-gateway/src/authn/keycloak-oidc.adapter.ts`)
is built exactly to ADR-0007's specification and is covered by unit tests against a mocked HTTP
layer (`keycloak-oidc.adapter.test.ts` — discovery caching, timeout, deduplication, response
validation), and the identical authorization-code-with-PKCE + JWT/JWKS verification code path is
exercised end to end against a protocol-faithful double
(`development-identity-provider.adapter.test.ts`). Neither of those substitutes for running the
adapter against a real Keycloak. **Do not treat this plan as evidence that real Keycloak sign-in
works — treat it as the exact procedure to run once a container runtime is available, before any
external pilot.**

## What is already prepared

- `infrastructure/docker/init/keycloak/witness-realm.json` — a realm-import file for Keycloak's
  `--import-realm` (already wired into `infrastructure/docker/docker-compose.yml`'s `keycloak`
  service). Declares:
  - Realm `witness`.
  - Client `witness-api` — public (PKCE, no client secret), `standardFlowEnabled`, redirect URI
    `http://localhost:3001/api/v1/auth/callback`, web origin `http://localhost:3000`,
    `pkce.code.challenge.method: S256`.
  - Two test users: `witness-dev-tester` (email `roletest@example.com`, verified) for the
    successful-sign-in case, and `witness-dev-unknown` (email `unregistered@example.com`, verified)
    for the unknown-identity denial case.
  - **This file has not been imported into a running Keycloak in this sandbox.** Its JSON shape
    follows Keycloak's documented realm-export format, but it is unverified data, not tested
    configuration, until step 2 below actually runs it.

## Procedure

Run from a repository checkout with Docker available.

1. **Start Postgres and Keycloak** (the `full` compose profile, not the default one Developer
   Preview onboarding uses):

   ```bash
   docker compose --env-file .env -f infrastructure/docker/docker-compose.yml --profile full up -d postgres keycloak
   docker compose --env-file .env -f infrastructure/docker/docker-compose.yml logs -f keycloak
   ```

   Wait for the health check to pass (`docker compose ... ps` shows `keycloak` as `healthy`).

2. **Confirm the realm imported.** Visit
   `http://localhost:8080/realms/witness/.well-known/openid-configuration` — a 200 with a JSON
   discovery document confirms `witness-realm.json` imported correctly. If it 404s, the import
   failed; check the Keycloak container logs for the reason before continuing.

3. **Point Witness at real Keycloak** — in `.env`:

   ```bash
   WITNESS_DEPLOYMENT_PROFILE=sovereign   # or hybrid — anything but development
   OIDC_ISSUER=http://localhost:8080/realms/witness
   KEYCLOAK_CLIENT_ID=witness-api
   KEYCLOAK_CLIENT_SECRET=                # empty — witness-api is a public PKCE client
   JWT_AUDIENCE=witness-api
   ```

   Restart the API (`make app` or `node dist/main.js`) and confirm `GET /ready`'s `keycloak`
   component reports `ok` with a latency, not `not_configured` or `down` — this alone proves the
   discovery document is reachable before attempting a full sign-in.

4. **In Witness**, create an `invited` user matching the realm's test identity: sign in with the
   `X-Witness-Dev-User` dev header is not available outside the development profile at this point,
   so use `POST /api/v1/users` directly (e.g. via `curl`) with an operator credential appropriate to
   this environment, email `roletest@example.com`, leaving it `invited`.

5. **Run the full sign-in flow through a real browser:**
   - Visit `http://localhost:3000/signin`, select **Sign in**. Confirm the redirect lands on
     Keycloak's own hosted login page (not a Witness page) — this is the first proof the adapter
     is really delegating to Keycloak rather than something local.
   - Sign in as `witness-dev-tester` / the password in `witness-realm.json`.
   - Confirm the browser returns to `http://localhost:3000/` with the header reading **Signed in as
     Dev Tester**, and the dashboard's **Your access** section renders correctly.
   - `GET /api/v1/me` with the issued bearer token returns the expected `CurrentUserView`.

6. **Sign out** and confirm the same bearer token is rejected (401) on a subsequent `GET /api/v1/me`.

7. **Replay protection:** capture the callback URL's `code`/`state` (browser dev tools network
   tab) and re-issue the same callback request. Confirm it is rejected — the login attempt was
   already consumed.

8. **Unknown identity:** sign in as `witness-dev-unknown` (no matching Witness user). Confirm
   `/auth/error?reason=unknown_identity`.

9. **Suspended user:** suspend the `roletest@example.com` Witness account (`POST
   .../memberships/.../status` equivalent, or a direct `UPDATE` for this test only), sign in again
   with `witness-dev-tester`. Confirm `/auth/error?reason=account_suspended` and an
   `authentication.denied` audit event.

10. **Expired/invalid token:** call `GET /api/v1/me` with a syntactically plausible but unissued
    bearer token. Confirm `401 UNAUTHENTICATED`, not a 500.

11. **Record the outcome.** Update this file's **Status** line with the date, the exact Keycloak
    image tag used, and either "PASSED — see PR #<n>" or the specific step that failed and why.
    Update `STATUS.md` and `docs/MVP_CHECKLIST.md`'s Authentication pilot-blocking gate only after
    this file's Status line says PASSED.

## Known gaps this plan does not close

- This plan verifies the **happy path and the denial paths already covered by the development
  double's unit tests**, now against a real IdP. It does not add new scenario coverage — the
  scenarios are the same ones already unit-tested; only the identity provider is real.
- Realm-import correctness (`witness-realm.json`) is unverified data until step 2 passes. If
  Keycloak rejects the import, fix the file and re-run from step 1 — do not hand-configure the
  realm through the admin console and leave the file stale, per this repository's "reproducible
  configuration over undocumented manual console steps" preference.
