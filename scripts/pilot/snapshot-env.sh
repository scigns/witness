#!/usr/bin/env bash
set -euo pipefail

# Create a protected, timestamped copy of the operator-managed environment.
# This intentionally emits paths and a checksum only; it never prints values.
cd "$(git rev-parse --show-toplevel)"

ENV_FILE="${WITNESS_ENV_FILE:-.env}"
DESTINATION="${1:-$HOME/witness-backups/config}"
[[ -f "${ENV_FILE}" ]] || { echo "Environment file not found: ${ENV_FILE}" >&2; exit 1; }

umask 077
mkdir -p "${DESTINATION}"
chmod 700 "${DESTINATION}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAPSHOT="${DESTINATION}/witness-env-${STAMP}.snapshot"

install -m 600 "${ENV_FILE}" "${SNAPSHOT}"
sha256sum "${SNAPSHOT}" > "${SNAPSHOT}.sha256"
chmod 600 "${SNAPSHOT}.sha256"

echo "Environment snapshot: ${SNAPSHOT}"
echo "Checksum: ${SNAPSHOT}.sha256"
