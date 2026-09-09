# Phase 3C backup and rollback controls

**Owner:** Infrastructure Lead with Engineering
**Status:** Backup cron restored and isolated restore drill exercised 2026-09-06
(see "Isolated restore validation" and the incident note below); Cloudflare
control-plane rollback steps remain unexercised

This runbook establishes recoverability before any independent-domain cutover.
It does not change DNS, Cloudflare Tunnel routes, Keycloak clients, application
configuration, or production data. Production commands below are operator-only
and must be run with an approved change record.

## Backup inventory

Run `scripts/pilot/backup.sh <protected-backup-directory>` on the production
runner. It writes separate PostgreSQL custom-format dumps for the Witness
database (`witness-<UTC>.dump`) and the Keycloak database
(`keycloak-<UTC>.dump`), each with a sibling SHA-256 file. The destination is
created mode 700 and artifacts mode 600. Database names and credentials are
read from the protected `.env`; values are never printed or placed in a shell
argument. No dump is committed to GitHub or uploaded as an Actions artifact.

`scripts/ops/backup-status.sh` checks both dump families and their checksums.
The existing Witness backup remains compatible with `scripts/ops/restore.sh`.
Keycloak restore is a separate operator procedure and must never target the
production database without an approved recovery event.

## Keycloak configuration export

Run `scripts/pilot/export-keycloak-config.sh <protected-directory>` only from
the production Compose network. The script uses `kcadm.sh` with the admin
password supplied through the container environment and emits only allowlisted
realm settings and the `witness-api` client settings (redirect URIs, web
origins and safe client flags). It does not export users, credentials, tokens,
private keys, or client secrets. Export JSON and checksums are mode 600 and
must remain outside the repository.

If the command fails, classify the export as unproven; do not broaden the
fields or fall back to a full realm export.

## Environment rollback snapshot

Run `scripts/pilot/snapshot-env.sh <protected-directory>` with
`WITNESS_ENV_FILE` pointing at the authoritative `.env`. It creates a
timestamped mode-600 snapshot and SHA-256 checksum in a mode-700 directory,
printing paths only. To roll back, stop the planned change, verify the
checksum, restore the snapshot over the operator-managed `.env` with mode 600,
and restart/rebuild only the services that consume changed values. Never print
the snapshot or upload it to GitHub.

## Isolated restore validation

Performed 2026-09-06 after finding and fixing a real backup-cron failure (see
"Incident: backup cron silently failing" below). `pg_restore --list` confirmed
structural validity of both dumps (431 TOC entries in the witness dump, 440 in
the keycloak dump). A disposable `pgvector/pgvector:pg16` container on its own
isolated Docker network (`witness-restore-drill`, no shared network, no
published port) received a full `pg_restore` of both the fresh witness dump
(`witness-20260906T095039Z.dump`) and keycloak dump
(`keycloak-20260906T095039Z.dump`). Recovery was confirmed by querying actual
row counts — not just schema presence: 4 organisations, 15 evidence records, 1
decision, 195 audit events from the witness dump; 2 realms, 14 clients from the
keycloak dump. The disposable container and network were destroyed immediately
after (`docker rm -f restore-drill-pg && docker network rm
witness-restore-drill`); production was never touched by this drill.

## Incident: backup cron silently failing, 2026-08-31 through 2026-09-06

`scripts/pilot/backup.sh` invokes `docker compose exec`, which interpolates
the *entire* compose file before running, including `services.api.environment`
entries for `WITNESS_BUILD_ID` and `WITNESS_VERSION`
(`${WITNESS_BUILD_ID:?WITNESS_BUILD_ID must be set}` in
`deployments/cloud-managed/docker-compose.pilot.yml`). Those two values are
normally supplied only as transient environment variables at deploy time and
were never persisted to the production `.env`. Every cron invocation of
`backup.sh` since 2026-08-31 03:00 UTC failed at that interpolation step,
before `pg_dump` ever ran — six days with zero new backups, and zero Keycloak
backups had ever been produced (the keycloak-dump code path shares the same
`docker compose exec` call and was never reached).

Fixed 2026-09-06 by taking an environment snapshot
(`scripts/pilot/snapshot-env.sh`, stored under
`/home/witness/witness-backups/env-snapshots/`, mode 600) and appending the two
values already active in the running `witness-pilot-api-1` container
(`WITNESS_BUILD_ID=a0a0b0c90d7010392aa2c366a3e9d0475f98f51b`,
`WITNESS_VERSION=0.4.0`) to `.env`. Confirmed no container restart was
triggered and both were already-running values, not new configuration.
Re-ran `backup.sh` manually: it produced both a fresh witness dump and, for
the first time on record, a keycloak dump.
`scripts/ops/backup-status.sh` now reports `STATUS: OK`.

**Follow-up needed (not release-blocking, but should not recur silently):**
`backup.log` had been accumulating these interpolation errors for six days
with nothing alerting on it. Consider a `HUMAN ACTION REQUIRED` follow-up to
add alerting on `backup-status.sh` exit code, or to have the deploy pipeline
persist `WITNESS_BUILD_ID`/`WITNESS_VERSION` into `.env` automatically so this
class of drift can't reoccur after the next deploy changes those values.

## Cloudflare pre-change evidence

The sanitized pre-cutover state is recorded in
`docs/operations/PHASE3C_CLOUDFLARE_PRECHANGE_STATE.md`. It is historical
read-only evidence from the Phase 3B control-plane review; a fresh API refresh
was unavailable during this phase. No credentials are stored.

## Rollback order for a future domain cutover

1. Stop further cutover changes.
2. Restore the verified previous `.env` snapshot, then restart/rebuild every
   affected service so the restored values are active.
3. Restore the previous application configuration/build.
4. Restore Keycloak realm/client configuration if changed.
5. Restore Tunnel routes.
6. Restore DNS records.
7. Verify the legacy identity endpoint.
8. Verify the legacy API.
9. Verify the legacy Web application.
10. Verify login.
11. Record rollback evidence and checksums.

The domain change itself must not require a database migration or data rollback.
Image and configuration rollback remain documented but unproven until exercised
in an approved non-destructive rehearsal.

## Current limitations

Cloudflare API credentials were unavailable for a fresh Phase 3C snapshot, so
tunnel-ID correlation and current DNS state require operator verification
before Phase 3 resumes. Anonymous Docker volumes observed by diagnostics
remain untouched and their ownership is unknown. The Cloudflare-specific steps
in "Rollback order for a future domain cutover" (Tunnel routes, DNS records)
remain documented but unexercised — the database/application restore path is
now proven, the domain-cutover path is not.
