# Internal Pilot Release

**Status:** Active
**Owner:** Founder / Product Lead with Engineering and Infrastructure

**Date:** 2026-08-09
**Scope:** taking the human-led MVP (Milestones 1–8) from "verified over HTTP"
to "usable by a person, in a browser, against a real identity provider".

---

## Verdict

**READY TO DEPLOY — NOT YET PUBLICLY DEPLOYED.**

Everything that can be closed from inside the repository is closed. The whole
workflow has been driven through the built web application in a real browser,
over HTTPS, signed in through a real Keycloak, against a persistent PostgreSQL
with every migration applied. What remains is not engineering: it is a domain
name, a host to run on, and a certificate authority that the public internet
trusts. Those need decisions and credentials that belong to the operator.

See [Blocked on](#blocked-on) for exactly what is needed and what happens next.

## Deployment architecture

The smallest thing that is honestly production, per ADR-0013: single-node Docker
Compose, five services, one TLS terminator.

```text
            ┌───────── Caddy ─────────┐   TLS, ACME renewal, HSTS
            │  pilot.<domain>  → web  │
            │  api.pilot.<domain> → api
            │  id.pilot.<domain>  → keycloak
            └───────────┬─────────────┘
                        │  (loopback network only)
        ┌───────────────┼────────────────┬──────────────┐
       web             api           keycloak       postgres
   Next.js         NestJS           ADR-0007      ADR-0004
   standalone      dist/main.js     realm-as-code  no published port
```

Deployment artefacts, all new in this release:

- [`deployments/cloud-managed/docker-compose.pilot.yml`](../../deployments/cloud-managed/docker-compose.pilot.yml)
- [`deployments/cloud-managed/Caddyfile`](../../deployments/cloud-managed/Caddyfile)
- [`services/api-gateway/Dockerfile`](../../services/api-gateway/Dockerfile)
- [`apps/web/Dockerfile`](../../apps/web/Dockerfile)

Nothing was added that the pilot does not use. Neo4j, OpenSearch, MinIO, NATS
and Ollama stay switched off, as they are in the development stack, because
starting services an application does not call suggests they are integrated.

## What was verified, and how

The verification environment ran every component for real: Keycloak 26.0.7 in
production mode against its own PostgreSQL database, the compiled API in the
`sovereign` profile with `NODE_ENV=production`, the Next.js standalone build,
and a TLS terminator on `:443` with HTTP redirected. The hostnames were
`pilot.witness.local`, `api.pilot.witness.local` and `id.pilot.witness.local`,
and the certificate came from a private CA created for the run.

That is a complete deployment in every respect except one: the certificate is
not publicly trusted and the names are not in public DNS.

### Authentication

Real OIDC, end to end. Authorization code with PKCE, no client secret (the
realm's client is public, as it has always been), ID token signature and
audience verified against the realm's JWKS.

| Requirement | Result |
|---|---|
| Real login through the identity provider | Verified in a browser |
| Callback and session establishment | Verified — token stored, `GET /api/v1/me` succeeds |
| Logout | Verified — the session is refused immediately afterwards |
| User identity linking | Verified — first sign-in links the provider subject to the invited account by verified email |
| Account-state enforcement | Suspended and deactivated accounts are refused (`AuthenticationService`) |
| Role resolution and Casbin authorisation | Verified live across four principals |
| Session expiration | `WITNESS_SESSION_TTL_MINUTES`, enforced server-side |
| Unauthenticated requests rejected | Verified — 401 with no token, a malformed token, or an unknown token |
| Development auth impossible in production | Verified — the header is refused, the development IdP route returns `DEV_IDP_NOT_ACTIVE`, and the header is not advertised in CORS |
| Fails closed without OIDC configuration | Verified — the process exits 78 before binding a port |

### Database

| Requirement | Result |
|---|---|
| Persistent storage | Named volume; data checksums enabled at initdb |
| TLS | `ssl = on`; the application connects with `sslmode=require` — verified TLSv1.3 |
| Non-public exposure | `listen_addresses = 'localhost'`; the compose file publishes no port |
| Application-specific credentials | `witness_app`, not a superuser, no CREATEDB/CREATEROLE |
| Migrations | 14 migrations applied with `prisma migrate deploy` |
| Backup | [`scripts/ops/backup.sh`](../../scripts/ops/backup.sh) — custom-format dump plus SHA-256 |
| Restore | [`scripts/ops/restore.sh`](../../scripts/ops/restore.sh) — **drill performed**, restored into a scratch database and row counts matched exactly across `audit_event`, `evidence`, `report` and `participant_consent_record` |
| Health verification | `/ready` reports PostgreSQL and the identity provider |

### Browser walkthrough

[`scripts/pilot/browser-walkthrough.mjs`](../../scripts/pilot/browser-walkthrough.mjs)
drives the deployed application in Chromium. **33 of 33 steps pass**, covering
the brief's whole workflow: sign in; select the organisation and workspace; join
the workspace; create a session; add named, pseudonymous and anonymous
participants; configure consent; capture mixed consent decisions; open the
session; capture and submit evidence; assign a reviewer; request and answer a
clarification; validate; reject a second piece; propose and confirm a decision on
validated evidence; propose and activate a commitment; create, start, progress
and complete an action; close the session; cite the evidence; send the report for
review; approve; publish internally; and export HTML, Markdown, JSON and CSV.

No step is substituted with an API call or a database write. Each transition is
asserted on the actual HTTP response, not on a success message, so a screen that
merely says the right words cannot pass.

### Accessibility

[`scripts/pilot/accessibility-audit.mjs`](../../scripts/pilot/accessibility-audit.mjs)
runs axe-core (WCAG 2.1 A and AA) plus a keyboard walk on five core screens.
**No blocking findings.** Focus is visible on every screen, every screen is
reachable by keyboard, and none overflows horizontally at 360px.

One real failure was found and fixed: in dark mode the accent colour inverts to a
light blue, and `text-white` on it measured **2.21:1** — a WCAG AA failure on
every primary button in the application, for every user whose system is set to
dark. A `--color-accent-contrast` token now carries the right foreground for each
scheme.

### Security smoke test

[`scripts/pilot/security-smoke.mjs`](../../scripts/pilot/security-smoke.mjs)
signs in as four principals and asks the deployed instance 31 questions.
**31 pass, 0 fail.**

- **Authentication** — unauthenticated, malformed and unknown tokens refused;
  the development header refused; the development IdP inactive; logout immediate.
- **Authorisation** — a reader cannot create a workspace, a session or a consent
  template; neither a reader nor a contributor can approve a report; a
  contributor cannot assign a reviewer; no principal can reach a workspace or an
  organisation they hold no role in, administrators included.
- **Privacy** — anonymous participants expose no identifying name; pseudonymous
  participants expose no linked identity; reports summarise participants by count
  and never name them; citations the audience has no consent for are excluded and
  counted, and the numbers reconcile; all four export formats carry no withheld
  content and name no non-named participant.
- **HTTP and runtime** — HTTPS with HSTS; CORS refuses a foreign origin; errors
  carry a code and no stack frame or filesystem path; readiness leaks no
  connection string; the client bundle ships no server configuration; the
  application log contains no password, session token or connection string.

## Defects found and fixed

Every one of these was reachable only by running the application as a deployed,
signed-in user. None was visible to the test suite.

1. **The frontend could not call the API at all.** It sent the development
   `X-Witness-Dev-User` header on every request; a deployed API does not
   advertise that header, so CORS refused the preflight before anything reached
   Witness. It now sends the real bearer session and only falls back to the
   header in a development build.
2. **Report exports answered 401.** They were plain `<a href>` links, and a
   navigation cannot carry an `Authorization` header. Exports are now fetched
   with the session attached and saved from memory.
3. **A report could never cite anything.** The page could remove a citation but
   had no control to add one, so Milestone 8's traceable, version-frozen
   citations were unreachable through the UI.
4. **An organisation's administrator was locked out of their own lists.** The
   global tier resolution dropped `admin` entirely, denying `organisation:read`,
   `workspace:read` and `record:read` — all membership-filtered — so every list
   page and picker was empty. An `admin` assignment now counts as `reader`
   globally; it still never grants the admin tier, so `organisation:create` and
   `user:create` remain out of reach.
5. **The reviewer picker was always empty.** It listed the global user
   directory, which needs the administrative `user:read`. It now lists the
   workspace's members — which is also more correct, since a reviewer from
   outside the workspace could not read what they were assigned.
6. **White on the dark-mode accent failed contrast** (see above).
7. **A deployment could start with localhost URLs.** `WITNESS_WEB_ORIGIN` and
   `WITNESS_OIDC_REDIRECT_URI` both fall back to a port-derived localhost value.
   Outside development they are now required, and required to be non-loopback
   HTTPS.
8. **The readiness endpoint lied about the build**, listing consent management
   and Casbin authorisation as unimplemented long after they shipped.

## Known limitations

Non-blocking for a controlled internal pilot, and stated rather than hidden.

- **Not publicly deployed.** See [Blocked on](#blocked-on).
- **The container images have not been built.** No Docker daemon was available
  in the verification environment; the application ran from the same compiled
  output the images package (`dist/main.js` and Next's standalone server), but
  `docker build` itself is unexercised. Build both images once before the first
  real deployment.
- **Creating a user has no HTTP route.** `user:create` has no scope to resolve
  in, so it stays unreachable to every real session until a
  platform-administrator concept exists. Onboarding is `pnpm invite`, run by an
  operator. Fine for a pilot of tens of people; not for self-service.
- **Consent fails closed, and the pilot's fixture data shows it.** Evidence
  whose participant has not granted the category an audience needs is excluded
  from the rendering entirely and counted in `redactedCount`. This is correct,
  and it means a report can legitimately render nothing.
- **PDF export is not implemented.** HTML, Markdown, JSON and CSV are.
- **No rate limiting on the API.** `RATE_LIMIT_PER_MINUTE` exists in the
  environment contract but nothing enforces it yet. Acceptable behind an
  invitation-only identity provider; not acceptable on a public instance.
- **Database row-level security is not in place.** Tenant isolation is enforced
  in the repository layer and verified live; the second, independent
  database-level layer is still Phase 3 work.
- **One session, one browser.** The session token lives in `sessionStorage`, so
  it does not survive closing the tab. That is a deliberate trade (see
  `lib/auth.tsx`), not an oversight.

## Pilot user onboarding

1. An administrator creates the person in Keycloak — or federates the
   institution's directory — with a **verified** email address.
2. An operator runs `pnpm invite` with that email, their name, and a role.
3. The person visits the pilot URL and chooses **Sign in**. They authenticate at
   the identity provider; Witness links the account on first sign-in.
4. An administrator adds them to a workspace on the workspace page.

Roles: `admin`, `facilitator`, `contributor`, `reviewer`, `participant`,
`reader`. `facilitator` and `contributor` currently carry the same permissions;
`participant` and `reader` likewise.

Tell pilot users two things plainly: the banner says **Internal pilot** because
what they enter is real institutional memory, and every entry is recorded with
who made it and when.

## Blocked on

Three things, none of them engineering:

1. **A hostname.** Three DNS A/AAAA records pointing at the pilot host —
   `pilot.<existing-domain>`, `api.pilot.<existing-domain>`,
   `id.pilot.<existing-domain>`. No new domain needs to be bought if one exists.
2. **A host to run on.** Any Linux node with Docker and a public IP. The pilot
   sizing in [`DEPLOYMENT_GUIDE.md`](../operations/DEPLOYMENT_GUIDE.md) is 8
   vCPU / 32 GB / 500 GB SSD, and that is generous for tens of users.
3. **Ports 80 and 443 reachable from the internet**, so Caddy can complete the
   ACME challenge and obtain a publicly trusted certificate.

With those in place the deployment is:

```bash
cp .env.example .env      # fill in from the secret store; see PILOT_OPERATIONS.md
docker compose -f deployments/cloud-managed/docker-compose.pilot.yml up -d --build
docker compose … run --rm api pnpm --filter @witness/api exec prisma migrate deploy
docker compose … run --rm -e WITNESS_BOOTSTRAP_… api pnpm bootstrap
```

then re-run the three verification scripts against the public URL.

## Release gate

Run once, at the end of this work:

| Gate | Result |
|---|---|
| `pnpm verify` (format, lint, typecheck, test, build) | Pass |
| `pnpm test:invariants` | Pass |
| `pnpm test:adversarial` | Pass |
| Domain purity (`scripts/ci/check-domain-purity.sh`) | Pass |
| `pnpm docs:lint`, `pnpm docs:links`, `pnpm docs:headers` | Pass |
| Licence and egress gates | Pass |
| Deployed browser walkthrough | 33/33 |
| Deployed accessibility audit | 5/5 screens, no blocking findings |
| Deployed security smoke test | 31/31 |

The numbers above are from the run recorded in this release's pull request.
