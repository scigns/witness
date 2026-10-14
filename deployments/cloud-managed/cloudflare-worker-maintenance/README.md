# `app.buildwithwitness.com` maintenance fallback

**Status:** Prepared, not deployed, not routed to production.
**Context:** `docs/operations/witness-website-recovery-2026-10-14.md`.

## What this is

A small Cloudflare Worker that can serve a Witness-branded "temporarily
unavailable" page for `app.buildwithwitness.com` instead of Cloudflare's raw
edge error 1033, independent of the `witness-prod` Tunnel and the
DigitalOcean droplet it runs on. It never touches `api.` or `id.` — those
carry the real OIDC flow and are intentionally out of this Worker's route
pattern. See `src/index.js`'s header comment for the full design rationale.

## Why a toggle, not an always-on redirect

This is **not** a replacement for `app.buildwithwitness.com` and must never
redirect visitors away from it — that would send users looking for the
product somewhere else and make the outage look like a permanent removal.
Instead it answers directly on the same host, with HTTP 503 (a correct,
honest "temporarily unavailable," not a 200 pretending to be the app and not
a 404 pretending the app never existed) and a single link to the marketing
site for anyone who wants to read more while they wait.

## Prerequisites (not yet available in this environment)

- `CLOUDFLARE_API_TOKEN` with **Workers Scripts: Edit** and
  **Workers KV Storage: Edit**, plus `CLOUDFLARE_ACCOUNT_ID` — broader than
  the Pages-only token requested for PR #272's marketing deployment. Confirm
  with whoever issues the token whether one broadened token or two
  separately scoped tokens is preferred.
- A Workers KV namespace (`wrangler kv namespace create
  witness-maintenance-mode`), with its id pasted into `wrangler.toml`'s
  `[[kv_namespaces]]` block.

## Step 1 — deploy without touching production (safe, do this first)

With `wrangler.toml` exactly as committed (routes block commented out):

```sh
cd deployments/cloud-managed/cloudflare-worker-maintenance
wrangler deploy
```

This publishes the Worker only to its own `witness-maintenance.<account>
.workers.dev` URL. Nothing on `buildwithwitness.com` changes — no route is
bound yet. Verify there:

```sh
# Default mode is "off" (no KV key set yet) — this must pass the request
# through. Point this at a host you know answers 200, since the Worker's own
# domain has no "origin" of its own to pass through to; the real
# verification here is steps 2-4 below, not this one.

# Set maintenance mode and confirm the page itself:
wrangler kv key put --namespace-id=<id> MODE maintenance
curl -i https://witness-maintenance.<account>.workers.dev/
#   Expect: HTTP/1.1 503, Retry-After: 300, Cache-Control: no-store,
#   the Witness-branded HTML, a working link to https://www.buildwithwitness.com/,
#   and no mention of DigitalOcean, billing, or infrastructure internals.

# Confirm the toggle actually toggles:
wrangler kv key put --namespace-id=<id> MODE off
curl -i https://witness-maintenance.<account>.workers.dev/
#   Expect: no longer 503 — the Worker attempted a pass-through fetch.

# Return to a safe known state before step 2:
wrangler kv key put --namespace-id=<id> MODE off
```

## Step 2 — enabling the fallback on the production host (approval required)

This is the production-change boundary. Do not do this without explicit
sign-off, per `docs/operations/witness-website-recovery-2026-10-14.md`.

1. Uncomment the `[[routes]]` block in `wrangler.toml`.
2. `wrangler deploy` again — this binds the Worker to
   `app.buildwithwitness.com/*`. **Deploy with `MODE=off`** (confirm via
   `wrangler kv key get --namespace-id=<id> MODE` first) so the bind itself
   changes nothing observable: every request still passes straight through
   to the Tunnel-backed origin, which still returns 1033 exactly as it does
   today without this Worker.
3. Confirm pass-through really is a no-op:
   `curl -i https://app.buildwithwitness.com/` should still show Cloudflare's
   own `error code: 1033` page, unchanged from before this deploy.
4. Only then, flip the switch:
   `wrangler kv key put --namespace-id=<id> MODE maintenance`.
5. Confirm: `curl -i https://app.buildwithwitness.com/` now returns the
   Witness-branded 503, and `curl -i https://api.buildwithwitness.com/health`
   / `curl -i https://id.buildwithwitness.com/` are completely unaffected
   (this Worker's route never matches those hosts).

## Disabling (the moment `witness-prod` is confirmed healthy again)

```sh
wrangler kv key put --namespace-id=<id> MODE off
```

No redeploy needed — the KV read happens per-request. Confirm
`https://app.buildwithwitness.com/` serves the real application again, not
the maintenance page and not a stale cached 503 (the maintenance response is
sent with `Cache-Control: no-store`, so there should be nothing to purge).

To fully remove the Worker from the request path later, comment the
`[[routes]]` block out again and `wrangler deploy`, or `wrangler delete`.

## What this deliberately does not do

- Does not modify `api.` or `id.` routing, CORS, CSRF, cookies, or the OIDC
  redirect/callback contract in any way.
- Does not cache anything — neither the maintenance response (`no-store`)
  nor, in `off`/`auto` mode, the pass-through/origin response (the Worker
  does not use the Cache API and passes `auto` mode's origin fetch with
  `cacheTtl: 0`).
- Does not redirect `app.buildwithwitness.com` visitors to another host; the
  marketing link is a visible, optional, in-page anchor.
- Does not expose DigitalOcean, billing, account-lock, or Tunnel/error-code
  detail in the served page.
