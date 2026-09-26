# Live workshop physical acceptance — operator runbook

**Owner:** Engineering (Phase 6, Track E)
**Status:** Active — physical iPhone pass not yet performed

Exact, copy-pasteable steps for running the Track E ("close the co-design loop") physical-device
pass in `docs/testing/MOBILE_ACCEPTANCE.md`'s "Track E — live workshop flow" table. This assumes the
Mac and the phone are on the same local network, or the tunnel step below is used.

## 1. Start the local environment

```bash
cd ~/witness-phase6-learning   # or wherever this worktree lives
make dev                       # starts Postgres only — already running if you did this earlier today
make app                       # starts both the API (port 3001) and the web app (port 3000)
```

`make app` runs both processes in the foreground with interleaved logs. Leave this terminal open for
the duration of the test; `Ctrl-C` stops both.

## 2. Verify services are healthy

In a second terminal:

```bash
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml ps   # postgres: healthy
curl -s http://localhost:3001/health | head -c 200; echo                    # API responds
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000              # web app responds (200)
```

## 3. Build (or refresh) the test fixture

```bash
cd services/api-gateway
pnpm exec tsx prisma/seed-live-workshop-acceptance.ts
```

This is idempotent — re-running it is safe and will not duplicate agenda items or the featured
assertion; it does mint a **new** join link every time, so re-run it once, right before you start
testing, and use the URL it just printed (not one from an earlier run or from this document).

It prints a block like:

```text
─── Live workshop acceptance fixture ready ───────────────────────────
organisationId:        ed773bac-46c1-4b0a-9ee7-de446b558bb5
workspaceId:           c9aefbb7-aff1-48a9-8c0f-cb9e9983399f
sessionId:             d5d8b9d7-980f-456b-a9dd-5191265a64de
current agenda item:   7337c466-838a-438c-b7b6-bd529fca0c37
featurable assertion:  624fc44e-143b-451d-8655-92b29e43bfa4
facilitator sign-in:   dev@example.com (via /signin, default dev identity)
facilitator live URL:  /workspaces/c9aefbb7-aff1-48a9-8c0f-cb9e9983399f/live
participant join path: /join/<a fresh token>
join link expires:     12 hours from now
────────────────────────────────────────────────────────────────────────
```

Use **your own run's output**, not the example above — the workspace/session ids are stable across
runs (this fixture extends the existing MOBILE_ACCEPTANCE.md session), but the join token changes
every time.

## 4. The two URLs

| Role | URL (on the Mac, `localhost`) | Notes |
|---|---|---|
| Facilitator | `http://localhost:3000/workspaces/<workspaceId>/live` | Sign in first — see step 5. |
| Participant | `http://localhost:3000/join/<the fresh token>` | No sign-in — this is the link a real participant's QR code/invitation would open. |

**If the iPhone needs to reach this over the internet** (not the same Wi-Fi/LAN as the Mac), the
established approach already used for this exact fixture (see `MOBILE_ACCEPTANCE.md`'s MOBILE-001
defect log) is a Cloudflare Quick Tunnel — no account or config needed:

```bash
cloudflared tunnel --url http://localhost:3000    # gives you a *.trycloudflare.com URL for the web app
cloudflared tunnel --url http://localhost:3001    # a second one for the API
```

If you use the API tunnel, the web app must be told about it before it will accept it — create
`apps/web/.env.local` (git-ignored) with:

```dotenv
NEXT_PUBLIC_WITNESS_API_URL=https://<the api tunnel hostname>
NEXT_PUBLIC_WITNESS_ALLOW_REMOTE_DEV_API=true
```

and restart `make app` so the web build picks it up. Use the **web** tunnel URL's `/join/<token>`
path on the phone either way — the API tunnel is only needed if the phone and Mac are not on the
same network.

## 5. Sign in as the facilitator (on the Mac)

1. Open `http://localhost:3000/signin` in a browser on the Mac (not the phone).
2. Click **Sign in**. The development identity-provider double signs you in as `dev@example.com`
   automatically — no password, no picking an identity.
3. The fixture script already granted this exact email an organisation-admin role that cascades to
   the fixture workspace, so you should land signed in with facilitator access. If you instead see
   `/auth/error?reason=unknown_identity`, the fixture script has not been run yet in this database —
   go back to step 3.
4. Navigate to the facilitator live URL from step 4's table.

You should see: the current agenda item ("What are we experiencing?"), the People/Consent/
Contributions/Outcomes panels, and a "What we're hearing" panel with a "Feature an insight" button
(the fixture's one confirmed assertion, "Bore access delays," is available there — not yet featured
until you click it).

## 6. What to do on the Mac as facilitator

- **Feature the insight** before the participant reaches that part of the flow: on the Live page's
  "What we're hearing" panel, click **Feature an insight**, then **Feature** next to "Bore access
  delays — reported_frequency: weekly". It should now show a response tally of all zeros.
- **Advance the prompt** when the participant is ready for Row 33/34 in the acceptance sheet: click
  **Start** on "Why is this happening?" in the Next list (or on the Agenda page).
- **Remove the featured insight** for Row 42: click **Remove** next to it and confirm the
  participant's view drops it.
- **Close the session** for Row 46: use the session detail page's lifecycle control
  (`/workspaces/<id>/sessions/<sessionId>`) to transition it to Closed.

## 7. What to do on the iPhone as participant

Open the participant URL from step 4 in Safari and work through
`MOBILE_ACCEPTANCE.md`'s "Track E — live workshop flow" table, rows 23-47, in order — the table's
"Expected" column states exactly what to look for at each row, and the runbook above tells you when
to switch back to the Mac to advance the facilitator side (rows 33, 42, 46 specifically need a
facilitator action first).

## 8. Pass/fail at each step

Use `MOBILE_ACCEPTANCE.md`'s own Result terminology (**PHYSICAL PASS** / **PHYSICAL PENDING** /
**BLOCKED** / **NOT APPLICABLE** — never "AUTOMATED PASS" for anything you did on the phone
yourself). Concretely:

- **PHYSICAL PASS** — the row's "Expected" column happened exactly as stated. Write down what you
  actually observed (a timestamp, an exact screen state), not just "worked."
- **FAIL** — write down the exact observed behaviour and correlate it against the API log in your
  `make app` terminal before filing a defect (same discipline MOBILE-001/002 already used) — most
  "something went wrong" screens name a real cause in that log.
- **BLOCKED** — an earlier row in the same sequence failed; note which row blocked it and move to
  the next device/section rather than guessing forward.
- Update `docs/testing/MOBILE_ACCEPTANCE.md` directly with your results — it is the record.

## Credentials note

No real credentials are involved anywhere in this runbook. `dev@example.com` is the development
identity-provider double's fixed default identity (unverified, development-profile-only, refuses to
construct outside `development` — see `services/api-gateway/src/authn/development-identity-provider.adapter.ts`).
The participant join token is a random, single-purpose, time-limited (12-hour) capability token
minted by the fixture script — it is not a password and is not reused across runs. Nothing in this
document or the fixture script touches production or real participant data.
