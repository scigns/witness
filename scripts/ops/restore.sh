#!/usr/bin/env bash
#
# Restore the Witness system of record from a dump written by backup.sh.
#
# Refuses to run against a database that already has Witness tables unless
# WITNESS_RESTORE_CONFIRM is set to the exact database name. Restoring over a
# live instance is a data-loss event, and the guard against it should not be a
# habit of care.
#
#   DATABASE_URL=... scripts/ops/restore.sh /var/backups/witness/witness-….dump
#
set -euo pipefail

ARCHIVE="${1:-}"

if [[ -z "${ARCHIVE}" ]]; then
  echo "usage: DATABASE_URL=... $0 <dump-file>" >&2
  exit 2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 2
fi

if [[ ! -f "${ARCHIVE}" ]]; then
  echo "No such dump: ${ARCHIVE}" >&2
  exit 2
fi

if [[ -f "${ARCHIVE}.sha256" ]]; then
  echo "Verifying checksum…"
  (cd "$(dirname "${ARCHIVE}")" && sha256sum --check --status "$(basename "${ARCHIVE}").sha256")
  echo "Checksum matches."
else
  echo "WARNING: no checksum beside ${ARCHIVE}; restoring an unverified dump." >&2
fi

TARGET_DB="$(psql "${DATABASE_URL}" -tAc 'select current_database()')"
EXISTING="$(psql "${DATABASE_URL}" -tAc \
  "select count(*) from information_schema.tables where table_schema='public' and table_name='audit_event'")"

if [[ "${EXISTING}" != "0" && "${WITNESS_RESTORE_CONFIRM:-}" != "${TARGET_DB}" ]]; then
  cat >&2 <<MESSAGE
Refusing to restore: '${TARGET_DB}' already contains Witness tables.

This would overwrite institutional memory that people consented to have kept.
If that is genuinely what you intend — a recovery drill, or a restore after a
verified loss — re-run with:

  WITNESS_RESTORE_CONFIRM=${TARGET_DB} $0 ${ARCHIVE}
MESSAGE
  exit 1
fi

echo "Restoring ${ARCHIVE} into '${TARGET_DB}'…"

# --clean --if-exists so a re-restore is idempotent; --no-owner because the
# application role is not a superuser; --single-transaction so a failure
# leaves the database as it was rather than half-restored.
pg_restore \
  --dbname="${DATABASE_URL}" \
  --clean --if-exists \
  --no-owner \
  --single-transaction \
  "${ARCHIVE}"

echo
echo "Restored. Now verify, in this order:"
echo "  1. pnpm migrate                  — the schema is at the expected version"
echo "  2. curl -fsS \"\$WITNESS_API_URL/ready\"   — the application can reach it"
echo "  3. sign in and open one session  — the data is really there"
