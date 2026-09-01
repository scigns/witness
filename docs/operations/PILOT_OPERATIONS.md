# Pilot Operations

**Status:** Active
**Owner:** Infrastructure Lead with Engineering

The minimum needed to run a controlled internal pilot safely, and nothing more.
This is not an observability platform; it is the set of procedures somebody has
to be able to follow at 2am without reading the source.

For the target-state, full-scale operator experience see
[`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md). For a live incident see
[`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md).

---

## What is deployed

Five components, on one node:

| Component  | What it is                                              | Exposed                |
| ---------- | ------------------------------------------------------- | ---------------------- |
| `proxy`    | Caddy — terminates TLS, obtains and renews certificates | 80, 443                |
| `web`      | Next.js standalone server                               | via proxy only         |
| `api`      | NestJS API gateway                                      | via proxy only         |
| `keycloak` | The identity provider (ADR-0007)                        | via proxy only         |
| `postgres` | The system of record (ADR-0004)                         | **not exposed at all** |

The database publishes no port. It is reachable only from the compose network.
Publishing 5432 "just for a moment" is how an internal database becomes an
internet-facing one.

## Environment variables

Names only — every value comes from the operator's secret store.
[`deployments/cloud-managed/.env.example`](../../deployments/cloud-managed/.env.example)
is the full list scoped to this deployment, with commentary; these are the
ones it cannot start without:

`WITNESS_DEPLOYMENT_PROFILE`, `NODE_ENV`, `WITNESS_INSTANCE_NAME`,
`WITNESS_DATA_RESIDENCY`, `DATABASE_URL`, `OIDC_ISSUER`, `KEYCLOAK_CLIENT_ID`,
`JWT_AUDIENCE`, `WITNESS_WEB_ORIGIN`, `WITNESS_OIDC_REDIRECT_URI`,
`NEXT_PUBLIC_WITNESS_API_URL`, `NEXT_PUBLIC_WITNESS_PROFILE`,
`WITNESS_WEB_HOST`, `WITNESS_API_HOST`, `WITNESS_OIDC_HOST`,
`OIDC_PUBLIC_URL`, `WITNESS_ACME_EMAIL`, `POSTGRES_PASSWORD`,
`KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_DB_USER`,
`KEYCLOAK_DB_PASSWORD`, `WITNESS_REALM_SEED_PASSWORD`.

Outside the `development` profile the API **refuses to start** if the OIDC
values are missing, or if `WITNESS_WEB_ORIGIN` / `WITNESS_OIDC_REDIRECT_URI` is
absent, plaintext, or points at loopback. That is deliberate: both have a
localhost default that is right for a developer and silently wrong for a
deployment, and the resulting failure surfaces as something else — a CORS error,
an "invalid redirect_uri" from Keycloak.

## Deployment

```bash
docker compose -f deployments/cloud-managed/docker-compose.pilot.yml up -d --build
docker compose -f deployments/cloud-managed/docker-compose.pilot.yml \
  run --rm api pnpm --filter @witness/api exec prisma migrate deploy
curl -fsS https://$WITNESS_API_HOST/ready | jq '.status, .components'
```

`prisma migrate deploy` applies committed migrations and nothing else. Never use
`prisma db push` against a deployed database: it reshapes the schema to match the
current source with no migration history and no review.

Do **not** run `pnpm seed` against a deployed instance. It writes synthetic
fixtures that read like real institutional decisions.

## Continuous deployment

`make pilot-deploy` (`scripts/pilot/deploy.sh`) does the same steps above plus
a health check and an automatic rollback of the running containers if it
fails — it is the one place the deploy sequence is defined, run identically by
a human or by CI (`docs/engineering/CI_CD.md`'s "no logic in YAML" rule).
Database migrations are forward-only and are **not** rolled back by this
script; a failed migration needs manual attention regardless of container
rollback.

`.github/workflows/deploy.yml` runs it automatically after `CI` passes on
`main`. It targets a **self-hosted** runner rather than reaching out from a
GitHub-hosted one, because the pilot host has no inbound port open — only the
Cloudflare Tunnel — and a polling runner keeps it that way. To activate it on
a host that doesn't have the runner yet:

```bash
# On the pilot host itself, one time:
# 1. GitHub → repo → Settings → Actions → Runners → New self-hosted runner,
#    label it "witness-pilot" in addition to the default "self-hosted" label.
# 2. Follow the displayed ./config.sh command, then install as a service:
./svc.sh install && ./svc.sh start
```

Until a runner is registered, `deploy.yml` simply has nothing to run on and
every push to `main` shows the deploy job queued/skipped — CI and merges are
unaffected either way. Repository variables `WITNESS_PILOT_API_URL` and
`WITNESS_PILOT_WEB_URL` (Settings → Environments → `pilot`) must be set to the
public hostnames before the first automated run.

The reference/pilot deployment this targets is Witness's own demo and trial
environment, operated by us — not a customer's infrastructure. It carries
synthetic data only (see "Environments" in `docs/engineering/CI_CD.md`); real
institutional engagements get their own self-hosted instance.

## First run

Deny-by-default goes all the way down: on a freshly migrated database nobody
holds an `admin` role, so no HTTP request can create the first organisation.
One command, once:

```bash
docker compose … run --rm \
  -e WITNESS_BOOTSTRAP_ORGANISATION_NAME="Your Institution" \
  -e WITNESS_BOOTSTRAP_ADMIN_EMAIL=… -e WITNESS_BOOTSTRAP_ADMIN_NAME="…" \
  api pnpm bootstrap
```

It refuses to run once any organisation exists.

## Onboarding a pilot user

Platform-scoped authority is managed separately; see
[`PLATFORM_ROLE_MANAGEMENT_RUNBOOK.md`](PLATFORM_ROLE_MANAGEMENT_RUNBOOK.md).

Two steps, in this order.

1. Create the person in Keycloak (or federate your directory to it) with a
   **verified** email address.
2. Invite them into the organisation:

```bash
docker compose … run --rm \
  -e WITNESS_INVITE_ORGANISATION="Your Institution" \
  -e WITNESS_INVITE_EMAIL=… -e WITNESS_INVITE_NAME="…" \
  -e WITNESS_INVITE_ROLE=contributor \
  api pnpm invite
```

The Witness account stays inert until that person signs in through the identity
provider with a verified email that matches. An invitation grants nothing to
anyone who cannot already authenticate.

Roles: `admin`, `facilitator`, `contributor`, `reviewer`, `participant`,
`reader`. Adding someone to a _workspace_ is done in the application, on the
workspace page, by an administrator.

## Secrets rotation

`scripts/ops/rotate-secrets.sh <postgres-app|postgres-keycloak|keycloak-admin|all>`
rotates a live credential in place: generates a new value, applies it through
the service's own admin interface (`ALTER ROLE` for the two Postgres roles,
`kcadm.sh` for the Keycloak admin password — an env var change alone does
nothing for an already-initialised instance, since the compose file's
`POSTGRES_PASSWORD`/`KEYCLOAK_ADMIN_PASSWORD` are consumed only on first-time
init), writes the new value into `.env`, restarts whatever consumes it, and
health-checks before returning. It never prints a generated secret. Run one
subcommand at a time and confirm health before the next; each is independent
and the script exits non-zero without overwriting `.env` if a step's health
check fails.

`WITNESS_REALM_SEED_PASSWORD` only backs the two disposable dev-test accounts
in the realm import (`witness-dev-tester`, `witness-dev-unknown`) — updating
it in `.env` is enough; it takes effect on the next fresh init and needs no
live action for a running instance.

**Not covered by the script** — needs a human with Cloudflare account access:
the tunnel credentials (`deployments/cloud-managed/cloudflared/credentials.json`).
Rotating those means issuing new tunnel credentials from the Cloudflare
dashboard or `cloudflared tunnel token`, which can take the tunnel briefly
offline if sequenced wrong — do it deliberately, not as part of a routine
rotation pass.

Real human accounts (anyone onboarded per the section above) hold their own
password with the identity provider and are unaffected by any of this.

## Backup

Pre-cutover backup, export and rollback controls are documented in
[Phase 3C backup and rollback controls](PHASE3C_BACKUP_AND_ROLLBACK.md).

```bash
make pilot-backup                    # writes to ~/witness-backups by default
BACKUP_DIR=/path scripts/pilot/backup.sh /path
```

`scripts/pilot/backup.sh` is `scripts/ops/backup.sh` adapted for this compose
topology: Postgres has no published port (reachable only from the compose
network, by design), so it runs `pg_dump` through `docker compose exec`
instead of a direct `DATABASE_URL` connection. It writes separate custom-format
Witness and Keycloak dumps, each with a SHA-256 checksum beside it. The Witness
pair remains compatible with the existing application backup/restore flow;
Keycloak restoration is a separate procedure and is not handled by
`scripts/ops/restore.sh`.

Under ADR-0011 the graph and search projections
are rebuildable from the event log; copying them costs storage and buys nothing.

That reasoning does **not** extend to evidence attachments (audio, document
and image bytes): they live in R2/S3-compatible object storage, not
Postgres, and are original source content — not a rebuildable projection.
The Postgres dump carries each attachment's key and SHA-256 checksum, which
lets a restore _verify_ the object storage side still holds the right
bytes; it does not itself contain those bytes. Restoring the dump onto a
fresh instance without also having the original bucket (or a copy of it)
available leaves every evidence attachment 404ing.

R2 itself is redundant across multiple facilities as part of the service
Cloudflare provides — this is not the same failure mode a self-hosted disk
has, and is why this pilot has not needed its own object-level backup job.
The operator action that remains, and needs a human with Cloudflare account
access (the same access already needed for tunnel-credential rotation,
above): turn on **bucket versioning** (or Object Lock, if the compliance
posture of a given client — MOJ in particular — calls for it) on the
production bucket before onboarding real institutional data, so a
credential compromise or an operator mistake that deletes or overwrites an
object is recoverable rather than final.

**Schedule it daily**, registered as a standing job on the pilot host's own
crontab. Call the script directly rather than through `make` — a minimal
pilot host has no `make` binary, and cron's own environment is too sparse to
find one on `$PATH` even where it is installed:

```cron
0 3 * * * cd /path/to/witness && /usr/bin/env bash scripts/pilot/backup.sh >> ~/witness-backups/backup.log 2>&1
```

Keep a copy off the node it came from, and encrypt it at rest — it contains
everything anyone said in a session.

## Backup status

```bash
make pilot-backup-status             # or: scripts/ops/backup-status.sh <dir> [max-age-hours]
```

Reports every backup's age, size and checksum validity, and an overall
`STATUS: OK|STALE|DEGRADED|NONE` — `STALE` if the newest one is older than 25
hours (a daily cadence plus an hour of grace), `DEGRADED` if any checksum
fails to verify. Exit code mirrors status (0 ok, 1 stale/degraded, 2 none
found) so it can be scripted into a health check or alert without parsing
prose.

## Operations status

```bash
make pilot-status                    # or: WITNESS_PILOT_API_URL=... scripts/ops/status.sh
```

One view, aggregating what already exists rather than tracking anything new:
the last automated deploy (`scripts/pilot/deploy.sh`'s history log) and the
currently-checked-out commit, `/ready`'s component health, `docker compose
ps`, a count of failed transcription/summary jobs, and backup status. Reach
for this first when checking whether the pilot is healthy — everything below
in this document is what to do once it says something isn't.

## Restore

```bash
DATABASE_URL=… scripts/ops/restore.sh /var/backups/witness/witness-….dump
```

The script verifies the checksum and then **refuses** to restore over a database
that already holds Witness tables unless `WITNESS_RESTORE_CONFIRM` names that
database exactly. Restoring over a live instance destroys institutional memory
people consented to have kept; the guard against it should not be a habit of
care.

Afterwards, in this order: `prisma migrate deploy`, then `/ready`, then sign in
and open one session. An untested backup is a hypothesis — run a restore drill
into a scratch database quarterly.

## Data portability (tenant export)

Witness's tenancy model is one deployment per customer: `organisation:create`
is a one-time bootstrap step (`services/api-gateway/prisma/bootstrap.ts`)
that refuses to run against a database that already holds an organisation, so
a live deployment never holds more than one customer's data. That makes the
backup above _also_ the tenant-export mechanism — there is no per-organisation
filtering step to build, because the whole database already is the tenant's
data, nothing else.

"Your data is yours" is provable, not just claimed: `scripts/ops/backup.sh`'s
dump can power a second, fully independent Witness instance with zero
dependency on the original deployment. Verified 2026-08-13 by restoring a
live pilot dump into an isolated Postgres container on its own Docker
network, pointing a freshly built `api` image at it (nothing shared with the
source deployment — different network, different container, different
Postgres instance), and confirming `GET /api/v1/organisations` and
`GET /api/v1/workspaces` returned the real, restored organisation and
program data. A customer moving to their own infrastructure, or Witness
standing up a dedicated deployment for them, is this same restore procedure
against a new host.

## Rollback

Roll the application back, not the database. Migrations in this repository are
additive within a release, so the previous image runs against the current schema:

```bash
docker compose … up -d --no-deps api web   # with the previous image tags
```

If a release contains a migration that the previous version genuinely cannot
run against, the rollback is: stop the API, restore the pre-deployment backup,
deploy the previous images. That is a data-loss window equal to the time since
the backup, so take one immediately before any deployment that migrates.

## Logs

Outside the development profile the API writes one JSON object per line to
stdout, carrying `timestamp`, `level`, `message`, `context`, `service`,
`version`, `buildId` and `profile`. Read them with the platform's own log
collection — `docker compose logs -f api` during the pilot.

Refused requests are logged at `warn` with the principal, the action and the
reason. Request bodies, session tokens and connection strings are never logged;
the live security smoke test asserts this against the running instance.

## Health

- `GET /health` — liveness. Does no I/O, so a database blip cannot cause a
  restart loop across every replica.
- `GET /ready` — readiness. Checks PostgreSQL and the identity provider, and
  names the capabilities this build does _not_ implement.

Neither exposes a secret. Alert on `/ready` reporting `down`, not on `/health`.

## Incident basics

1. **Is it up?** `curl -fsS https://$WITNESS_API_HOST/ready`. A `down`
   PostgreSQL component with a healthy process means the database, not the app.
2. **Is it authentication?** Sign-in failures with a healthy API usually mean
   Keycloak, its database, or a redirect URI that no longer matches the client.
   `/ready` reports the identity provider as a component for exactly this reason.
3. **Is it a bad release?** Roll the application back first, diagnose second.
4. **Is it data?** Stop writes before restoring. A restore during live use loses
   whatever was written after the dump.

Anything involving personal data, consent or a suspected disclosure follows
[`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md), which is a governance procedure
rather than a technical one.

## Verification you can run against the deployment

```bash
node scripts/pilot/browser-walkthrough.mjs    # the whole workflow, in a browser
node scripts/pilot/accessibility-audit.mjs    # axe plus a keyboard walk
node scripts/pilot/security-smoke.mjs         # auth, authz, privacy, transport
```

Each needs `WITNESS_PILOT_WEB_URL`, `WITNESS_PILOT_API_URL`,
`WITNESS_PILOT_USERNAME` / `WITNESS_PILOT_PASSWORD` and a Chromium path. They
write to the environment they run against — point them at the pilot, never at
an instance holding real deliberation you cannot afford to add test rows to.

## Cloudflare topology

An alternative to the direct topology above, for a host with no public IP and
no open ports. Cloudflare terminates TLS and a Cloudflare Tunnel connector
dials out from the pilot node, so nothing dials in.

```bash
docker compose -f deployments/cloud-managed/docker-compose.pilot.yml \
  --profile cloudflare up -d --build
```

The `proxy` (Caddy) service is not started in this profile and must not be:
it exists to obtain certificates over ACME, and an ACME challenge cannot reach
a host with no inbound ports. `--profile direct` is the other way round.

**Three public hostnames, and only three.** The web application, the API and
Keycloak each get an ingress rule in
[`cloudflared/config.yml`](../../deployments/cloud-managed/cloudflared/config.yml).
PostgreSQL gets none, so it has no public hostname at all — and the catch-all
rule at the bottom refuses anything not explicitly named, so a DNS record
pointed at the tunnel without a matching rule reaches nothing.

**Serving Witness under a path.** When the application lives at
`/witness` on a domain whose `/` belongs to another site, three things follow
and all three are required:

- the frontend is _built_ with `NEXT_PUBLIC_WITNESS_BASE_PATH=/witness`, because
  every asset URL and route carries the prefix and that is decided at build time;
- the API is given `WITNESS_WEB_BASE_URL` including the path, or the OIDC
  callback sends signed-in browsers to the other site's root;
- `WITNESS_WEB_ORIGIN` stays the bare origin. An `Origin` header never has a
  path, so the CORS policy and Keycloak's web origin are unchanged by any of this.

**The path route.** A Cloudflare Worker
([`cloudflare-worker/`](../../deployments/cloud-managed/cloudflare-worker/))
is bound to `pacificdigitalconsultancy.org/witness` and `/witness/*` and
forwards to the tunnel's web hostname. Worker routes are path-scoped: `/` and
every other path on the zone continue to reach the existing origin untouched.
The Worker rewrites nothing, because the application is already built to expect
the prefix.

**Backups are unchanged.** The tunnel carries no database traffic; run
`scripts/ops/backup.sh` on the host as before.
