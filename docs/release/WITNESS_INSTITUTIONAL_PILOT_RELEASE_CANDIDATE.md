# Witness Institutional Pilot — Release Candidate

**Status:** In progress — technical gates partially verified, client-journey gates require a human
**Owner:** Founder / Product Lead with Engineering
**Declared:** 2026-09-06
**Companion to:** [`WITNESS_INSTITUTIONAL_PILOT_RELEASE_FREEZE.md`](WITNESS_INSTITUTIONAL_PILOT_RELEASE_FREEZE.md)

## Why some gates say "HUMAN ACTION REQUIRED" instead of a result

Gates 5-11 below require creating an account and signing in with a password to actually exercise the
flow. Both are actions an operating rule for this agent prohibits performing itself, regardless of
how the request is framed — not a technical limitation, and not something this document works
around by testing indirectly (e.g. querying the database to infer a session exists without ever
creating one). Each of those gates below has the exact steps a human operator needs, so this isn't
lost work — it's handed off precisely instead of guessed at or silently skipped.

## Release source and candidate images

**Release source SHA:** `259da738c2e3aa8ddd5bb66c636ef044a31fbbfd` (`main`, PR #216 merge)

Built locally from this exact commit, clean working tree, no build-time secrets (verified against
`docker-compose.pilot.yml` — the API needs none at build time; the web/marketing apps take only
non-secret public URLs as build args):

| Image | Digest | Local smoke result |
| --- | --- | --- |
| `witness-marketing:rc-259da73` | `sha256:6e6c036cfa1a545679727e56f79a84a6673b4252926ca52709efca7208674734` | `/`, `/health`, `/platform`, `/demo` all `200`; `/robots.txt` disallows all — confirms this image actually contains MKT-04/05/06, unlike the live preview |
| `witness-api:rc-259da73` | `sha256:34bfed36dd31058ec1d159b706286000f61f2576ab990a20c4a3bc1ab6d82ba2` | Started, correctly refused to run without `DATABASE_URL` ("Refusing to start. See .env.example and ADR-0013") — fail-closed as designed. Not a full integration test; no database or Keycloak was connected |
| `witness-web:rc-259da73` | `sha256:307c81eff0c4805361d031a593fa7822bab311b7dcb8b6e890d730f51e4b4859` | Built successfully; not smoke-tested standalone (it depends on a running API, per `docker-compose.pilot.yml`'s `depends_on`) |

None of these three images has been pushed to a registry or deployed anywhere. Building them locally
required no privileged access; deploying any of them does.

## PR #216

Merged into `main` after two real findings from CodeRabbit review were fixed (preview
"isolated" language corrected to name the shared `witness-pilot` Docker network; stale
`CURRENT_PRODUCTION_BASELINE.md` rows given inline "superseded" markers rather than relying only on
a note elsewhere in the document). All 16 required CI checks passed before merge. See the PR for the
full MKT-06 synthetic demo and preview-state reconciliation content.

## Release Acceptance Matrix

| # | Gate | Status | Evidence / next action |
| --- | --- | --- | --- |
| 1 | Release source clean | READY | Built from `main` post-#216 merge; no dirty working tree used |
| 2 | Website preview current | HUMAN ACTION REQUIRED | Preview is live but serves the pre-MKT-04 `efba8b7` build; redeploy needed — see below |
| 3 | Brand review | READY | MKT-04/05/06 verified against the Brand Book by construction (shared, already-reconciled components only); grep-audited for forbidden voice/claims |
| 4 | Public routes | READY | `/`, `/platform` (+3 children), `/how-it-works`, `/why-witness`, `/solutions` (+4 children), `/demo` all real, tested at six widths |
| 5 | Invitation | HUMAN ACTION REQUIRED | Needs an approved synthetic account — see "Client journey verification" below |
| 6 | Login | HUMAN ACTION REQUIRED | Same |
| 7 | Cookie/session | HUMAN ACTION REQUIRED | Same |
| 8 | Logout | HUMAN ACTION REQUIRED | Same |
| 9 | Password reset | HUMAN ACTION REQUIRED | Same |
| 10 | Core workflow | HUMAN ACTION REQUIRED | Same |
| 11 | Tenant isolation | HUMAN ACTION REQUIRED | Same |
| 12 | Client emails | PARTIAL | Keycloak email theme rebranded and live-tested against an isolated Keycloak instance (see `docs/brand/EMAIL_SYSTEM.md`); not yet confirmed against the actual production Keycloak/Brevo path with a real send |
| 13 | App/API/id independent | READY | Confirmed via Cloudflare Tunnel config read on the host: separate ingress rules, separate origin services, no shared routing |
| 14 | Backup/rollback | PARTIAL | See "Backup and rollback" below — inventory confirmed, restore drill not re-run this cycle |
| 15 | Client pilot runbook | READY | [`CLIENT_PILOT_RUNBOOK.md`](CLIENT_PILOT_RUNBOOK.md) |
| 16 | Final human release approval | HUMAN ACTION REQUIRED | Not requested |

**Technical release readiness: 6 of 16 gates READY, 2 PARTIAL, 8 HUMAN ACTION REQUIRED — not a
percentage this document will round up.**

## Redeploy the preview (gate 2)

The exact already-approved pattern, unchanged from the MKT-03J handoff, now with current `main`:

```sh
ssh witness@167.172.72.70
cd /home/witness/witness && git fetch origin && git rev-parse origin/main  # record as the RC SHA
docker build -f apps/marketing/Dockerfile -t witness-marketing:preview-<sha> \
  --build-arg WITNESS_MARKETING_SITE_URL=https://preview.buildwithwitness.com \
  --build-arg WITNESS_MARKETING_ENV=preview \
  --build-arg WITNESS_MARKETING_INDEXABLE=false .
docker stop witness-marketing-preview && docker rename witness-marketing-preview witness-marketing-preview-retired-$(date +%s)
docker run -d --name witness-marketing-preview --restart unless-stopped \
  --network witness-pilot witness-marketing:preview-<sha>
curl -s https://preview.buildwithwitness.com/health
curl -s https://preview.buildwithwitness.com/platform -o /dev/null -w '%{http_code}\n'
```

Then re-run remote six-width QA:

```sh
WITNESS_MARKETING_E2E_BASE_URL=https://preview.buildwithwitness.com \
  pnpm --filter @witness/marketing test:e2e
```

Do not remove the retired container until the new one is confirmed healthy — that's the rollback.

## Client journey verification (gates 5-11) — exact steps for a human operator

Use only an approved synthetic organisation/account. Never a real client account.

1. **Invitation**: Follow [`CLIENT_ONBOARDING_RUNBOOK.md`](../operations/CLIENT_ONBOARDING_RUNBOOK.md)
   §1 and §4 to create a synthetic organisation and invite one synthetic user. Confirm exactly one
   invitation record is created (no duplicate membership), the correct organisation and initial role
   are attached, and the activation link points at `https://app.buildwithwitness.com/activate` with
   no marketing-apex dependency. Test resend via
   `POST /organisations/:organisationId/users/:userId/invitation/resend`.
2. **Login**: Complete the real OIDC flow — app → api → id → callback → app. Confirm state, nonce
   and PKCE are used (network tab), no token appears in the URL, and the browser cannot read the
   session token from JavaScript (`document.cookie` must not expose `witness_session`).
3. **Cookie/session**: Inspect `witness_session` in DevTools → Application → Cookies. Expected:
   Host `api.buildwithwitness.com`, **Domain absent** (not `.buildwithwitness.com`), Path `/`,
   `Secure` true, `HttpOnly` true, `SameSite` Lax. **If Domain is set to
   `.buildwithwitness.com`, stop — that's a release `NO-GO`,** it would mean the cookie is
   readable/sendable across every subdomain including the public marketing site.
4. **Reload/second-tab**: Reload the app tab — session persists. Open a second tab to the app —
   already signed in.
5. **Logout**: Confirm the server-side session is revoked (not just the client-side cookie cleared),
   a previously protected page is no longer reachable, reload does not restore the session, and the
   second tab converges to signed-out on its next request.
6. **Password reset**: Use an approved synthetic mailbox only. Forgot password → Keycloak's branded
   email (per `docs/brand/EMAIL_SYSTEM.md`) → reset page → new password → sign in with it → land back
   in the correct app state. Never record the password or the reset token/URL — PASS/FAIL and a
   timestamp only.
7. **Core workflow**: In the synthetic organisation, capture one evidence item, confirm its
   provenance (source/actor/time), confirm a decision where the domain model supports it
   (`proposed`→`confirmed`, per `packages/domain/src/decision.ts` — do not test an unsupported
   "finding" or "recommendation" persistence, per the MKT-06 truth-matrix finding that neither is a
   stored record), create a commitment/action item, reload and confirm the same record is retrievable.
8. **Tenant isolation**: With a second synthetic organisation and account, confirm it cannot read the
   first organisation's data — expect `401`/`403` as appropriate, not a silent empty result that
   could also mean "no data."

Record only PASS/FAIL and safe correlation identifiers for each step — never credentials,
authorization codes, reset tokens, or full session cookie values.

## Backup and rollback (gate 14)

Confirmed present via the read-only re-verification in
[`CURRENT_PRODUCTION_BASELINE.md`](../commercial-website/CURRENT_PRODUCTION_BASELINE.md): running
containers for web/api/keycloak/postgres, the Tunnel config, and
[`PHASE3C_BACKUP_AND_ROLLBACK.md`](../operations/PHASE3C_BACKUP_AND_ROLLBACK.md)'s documented
backup inventory. **Not re-confirmed this cycle**: an actual restore drill (last one on record
predates this release candidate) and exact `witness-pilot-web`/`witness-pilot-api` image digests
(only image names were recorded via `docker ps`, not `docker image inspect`). Both are read-only
checks a human with the same SSH access used for this document can complete in minutes; neither
requires Cloudflare dashboard access.

## Production apex cutover precheck (release readiness only — not executed)

`app.buildwithwitness.com`, `api.buildwithwitness.com` and `id.buildwithwitness.com` remain
independent, confirmed via the Tunnel ingress config (separate hostname rules, separate origin
services, no shared routing). The apex/`www` cutover itself
([`INDEPENDENT_DOMAIN_CUTOVER.md`](../operations/INDEPENDENT_DOMAIN_CUTOVER.md),
[`CUTOVER_RUNBOOK.md`](../commercial-website/CUTOVER_RUNBOOK.md)) is explicitly out of scope for this
release candidate and requires its own separate human approval — nothing in this document changes
that gate.

## Release recommendation

**NO-GO** on the current state of this document — eight gates are `HUMAN ACTION REQUIRED`, not
verified. This is not a weakened gate to force a `GO`: sections 5-11 genuinely cannot be executed by
this agent (see "Why some gates say..." above), and gate 2 (stale preview) is real and unresolved.
Once a human operator completes the preview redeploy and the client-journey verification above with
an approved synthetic account, and this table is updated with real PASS/FAIL results (not
re-optimistic re-classification), revisit this recommendation.

Do not switch the apex, create `www`, enable indexing, invite a real client, or modify live client
data based on this document alone.
