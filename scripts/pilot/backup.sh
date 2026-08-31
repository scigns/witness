#!/usr/bin/env bash
set -euo pipefail
#
# Backs up the pilot's Witness and Keycloak Postgres databases via
# `docker compose exec`. The database has
# no published port (docker-compose.pilot.yml: "reachable only from this
# compose network") so scripts/ops/backup.sh's own DATABASE_URL-based pg_dump
# cannot reach it from the host directly — this produces the identical output
# shape (witness-<timestamp>.dump + .sha256 beside it) through the container.
# Keycloak is written as a separate keycloak-<timestamp>.dump artifact.
#
#   scripts/pilot/backup.sh [destination-directory]   # defaults to ~/witness-backups

cd "$(git rev-parse --show-toplevel)"

DESTINATION="${1:-$HOME/witness-backups}"
COMPOSE_FILE="deployments/cloud-managed/docker-compose.pilot.yml"
ENV_FILE=".env"

env_get() { grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }

mkdir -p "${DESTINATION}"
chmod 700 "${DESTINATION}"
umask 077

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WITNESS_ARCHIVE="${DESTINATION}/witness-${STAMP}.dump"
KEYCLOAK_ARCHIVE="${DESTINATION}/keycloak-${STAMP}.dump"

POSTGRES_USER="$(env_get POSTGRES_USER)"
POSTGRES_DB="$(env_get POSTGRES_DB)"
KEYCLOAK_DB_USER="$(env_get KEYCLOAK_DB_USER)"
KEYCLOAK_DB="$(env_get KEYCLOAK_DB)"
KEYCLOAK_DB="${KEYCLOAK_DB:-keycloak}"

[[ -n "${POSTGRES_USER}" && -n "${POSTGRES_DB}" ]] || { echo "Witness database identity is incomplete" >&2; exit 1; }
[[ -n "${KEYCLOAK_DB_USER}" && -n "${KEYCLOAK_DB}" ]] || { echo "Keycloak database identity is incomplete" >&2; exit 1; }

cleanup() {
  rm -f -- "${WITNESS_ARCHIVE}.tmp" "${KEYCLOAK_ARCHIVE}.tmp"
}
trap cleanup EXIT

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  --format=custom --no-owner >"${WITNESS_ARCHIVE}.tmp"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${KEYCLOAK_DB_USER}" -d "${KEYCLOAK_DB}" \
  --format=custom --no-owner >"${KEYCLOAK_ARCHIVE}.tmp"

mv -- "${WITNESS_ARCHIVE}.tmp" "${WITNESS_ARCHIVE}"
mv -- "${KEYCLOAK_ARCHIVE}.tmp" "${KEYCLOAK_ARCHIVE}"

sha256sum "${WITNESS_ARCHIVE}" >"${WITNESS_ARCHIVE}.sha256"
sha256sum "${KEYCLOAK_ARCHIVE}" >"${KEYCLOAK_ARCHIVE}.sha256"
chmod 600 "${WITNESS_ARCHIVE}" "${WITNESS_ARCHIVE}.sha256" "${KEYCLOAK_ARCHIVE}" "${KEYCLOAK_ARCHIVE}.sha256"

WITNESS_SIZE="$(du -h "${WITNESS_ARCHIVE}" | cut -f1)"
KEYCLOAK_SIZE="$(du -h "${KEYCLOAK_ARCHIVE}" | cut -f1)"
echo "Wrote ${WITNESS_ARCHIVE} (${WITNESS_SIZE})"
echo "Checksum ${WITNESS_ARCHIVE}.sha256"
echo "Wrote ${KEYCLOAK_ARCHIVE} (${KEYCLOAK_SIZE})"
echo "Checksum ${KEYCLOAK_ARCHIVE}.sha256"
