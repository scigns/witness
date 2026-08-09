#!/usr/bin/env bash
#
# Back up the Witness system of record.
#
# Only PostgreSQL is backed up, and that is the whole point of ADR-0011: the
# graph and search projections are rebuildable from the event log, so copying
# them would cost storage and buy nothing. If this file restores, Witness
# restores.
#
# Writes a custom-format dump (compressed, and restorable table by table) plus
# a SHA-256 checksum beside it. A backup nobody can verify is a hypothesis.
#
#   DATABASE_URL=... scripts/ops/backup.sh /var/backups/witness
#
set -euo pipefail

DESTINATION="${1:-}"

if [[ -z "${DESTINATION}" ]]; then
  echo "usage: DATABASE_URL=... $0 <destination-directory>" >&2
  exit 2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required. Take it from the deployment's secret store, never a file in the repository." >&2
  exit 2
fi

mkdir -p "${DESTINATION}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="${DESTINATION}/witness-${STAMP}.dump"

# --format=custom so a restore can be selective and parallel.
# --no-owner so the dump restores under whatever role the target uses; the
# pilot's application role is not a superuser and should not have to be.
pg_dump "${DATABASE_URL}" \
  --format=custom \
  --no-owner \
  --file="${ARCHIVE}"

sha256sum "${ARCHIVE}" > "${ARCHIVE}.sha256"

SIZE="$(du -h "${ARCHIVE}" | cut -f1)"
echo "Wrote ${ARCHIVE} (${SIZE})"
echo "Checksum ${ARCHIVE}.sha256"
echo
echo "A backup is not a backup until it has been restored. See scripts/ops/restore.sh"
echo "and the quarterly recovery drill in docs/operations/PILOT_OPERATIONS.md."
