#!/usr/bin/env bash
set -euo pipefail
#
# Backs up the pilot's Postgres via `docker compose exec`. The database has
# no published port (docker-compose.pilot.yml: "reachable only from this
# compose network") so scripts/ops/backup.sh's own DATABASE_URL-based pg_dump
# cannot reach it from the host directly — this produces the identical output
# shape (witness-<timestamp>.dump + .sha256 beside it) through the container
# instead, so scripts/ops/backup-status.sh and scripts/ops/restore.sh work on
# the result unmodified.
#
#   scripts/pilot/backup.sh [destination-directory]   # defaults to ~/witness-backups

cd "$(git rev-parse --show-toplevel)"

DESTINATION="${1:-$HOME/witness-backups}"
COMPOSE_FILE="deployments/cloud-managed/docker-compose.pilot.yml"
ENV_FILE=".env"

env_get() { grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }

mkdir -p "${DESTINATION}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="${DESTINATION}/witness-${STAMP}.dump"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$(env_get POSTGRES_USER)" -d "$(env_get POSTGRES_DB)" \
  --format=custom --no-owner >"${ARCHIVE}"

sha256sum "${ARCHIVE}" >"${ARCHIVE}.sha256"

SIZE="$(du -h "${ARCHIVE}" | cut -f1)"
echo "Wrote ${ARCHIVE} (${SIZE})"
echo "Checksum ${ARCHIVE}.sha256"
