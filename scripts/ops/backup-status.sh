#!/usr/bin/env bash
set -euo pipefail
#
# Reports on the backups scripts/ops/backup.sh has produced in a destination
# directory: the most recent one's age, size, and checksum validity, and
# every dump's checksum status. Exit code doubles as the health signal (0 ok,
# 1 stale or invalid, 2 none found) so this can feed scripts/ops/status.sh or
# any other operator-visibility tooling without parsing prose.
#
#   scripts/ops/backup-status.sh <backup-directory> [max-age-hours]
#
DESTINATION="${1:-}"
MAX_AGE_HOURS="${2:-25}" # daily cadence + 1h grace

if [[ -z "${DESTINATION}" ]]; then
  echo "usage: $0 <backup-directory> [max-age-hours]" >&2
  exit 2
fi

if [[ ! -d "${DESTINATION}" ]]; then
  echo "STATUS: NONE — ${DESTINATION} does not exist. No backup has ever been taken."
  exit 2
fi

shopt -s nullglob
dumps=("${DESTINATION}"/witness-*.dump)
shopt -u nullglob

if [[ ${#dumps[@]} -eq 0 ]]; then
  echo "STATUS: NONE — no backups found in ${DESTINATION}."
  exit 2
fi

overall_exit=0
latest=""
latest_mtime=0

echo "Backups in ${DESTINATION}:"
for dump in "${dumps[@]}"; do
  mtime="$(stat -f %m "${dump}" 2>/dev/null || stat -c %Y "${dump}")"
  size="$(du -h "${dump}" | cut -f1)"
  if [[ -f "${dump}.sha256" ]] && (cd "$(dirname "${dump}")" && sha256sum -c "$(basename "${dump}").sha256" >/dev/null 2>&1); then
    checksum_status="checksum ok"
  else
    checksum_status="CHECKSUM MISSING OR INVALID"
    overall_exit=1
  fi
  echo "  $(basename "${dump}")  ${size}  ${checksum_status}"
  if [[ "${mtime}" -gt "${latest_mtime}" ]]; then
    latest_mtime="${mtime}"
    latest="${dump}"
  fi
done

now="$(date +%s)"
age_hours=$(( (now - latest_mtime) / 3600 ))

echo
echo "Most recent: $(basename "${latest}") — ${age_hours}h ago"

if [[ "${age_hours}" -gt "${MAX_AGE_HOURS}" ]]; then
  echo "STATUS: STALE — last backup is older than ${MAX_AGE_HOURS}h. Check the schedule is still running."
  overall_exit=1
elif [[ "${overall_exit}" -eq 0 ]]; then
  echo "STATUS: OK"
else
  echo "STATUS: DEGRADED — recent backup exists but at least one dump failed its checksum."
fi

exit "${overall_exit}"
