# Phase 3C backup and rollback controls

**Owner:** Infrastructure Lead with Engineering
**Status:** Planned; operator controls not yet exercised

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

Keycloak dump restorability is **documented but unproven** until an operator
restores a newly-created dump into a disposable PostgreSQL instance. Use
`pg_restore --list` (and, where approved, restore into an isolated database)
to verify structural validity without querying customer or identity data.
Never overwrite production for this test.

## Cloudflare pre-change evidence

The sanitized pre-cutover state is recorded in
`docs/operations/PHASE3C_CLOUDFLARE_PRECHANGE_STATE.md`. It is historical
read-only evidence from the Phase 3B control-plane review; a fresh API refresh
was unavailable during this phase. No credentials are stored.

## Rollback order for a future domain cutover

1. Stop further cutover changes.
2. Restore the previous application configuration/build.
3. Restore Keycloak realm/client configuration if changed.
4. Restore Tunnel routes.
5. Restore DNS records.
6. Verify the legacy identity endpoint.
7. Verify the legacy API.
8. Verify the legacy Web application.
9. Verify login.
10. Record rollback evidence and checksums.

The domain change itself must not require a database migration or data rollback.
Image and configuration rollback remain documented but unproven until exercised
in an approved non-destructive rehearsal.

## Current limitations

The production application and Keycloak databases are known to persist in the
shared PostgreSQL service, but a separate Keycloak backup has not yet been
created in this repository context. Cloudflare API credentials were unavailable
for a fresh Phase 3C snapshot, so tunnel-ID correlation and current DNS state
require operator verification before Phase 3 resumes. Anonymous Docker volumes
observed by diagnostics remain untouched and their ownership is unknown.
