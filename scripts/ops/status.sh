#!/usr/bin/env bash
set -euo pipefail
#
# One-view operational status for the pilot deployment: deployed commit,
# component health, container uptime, failed background jobs, and backup
# freshness. Aggregates existing sources rather than tracking anything new —
# scripts/pilot/deploy.sh's history log, the API's own /ready, docker's
# container state, and scripts/ops/backup-status.sh.
#
#   scripts/ops/status.sh

cd "$(git rev-parse --show-toplevel)"

COMPOSE_FILE="deployments/cloud-managed/docker-compose.pilot.yml"
ENV_FILE=".env"
HISTORY_FILE="deployments/cloud-managed/.deploy-history.log"
BACKUP_DIR="${BACKUP_DIR:-$HOME/witness-backups}"
API_URL="${WITNESS_PILOT_API_URL:?WITNESS_PILOT_API_URL must be set}"

env_get() { grep -E "^${1}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2-; }

echo "═══ Witness pilot status — $(date -u +%FT%TZ) ═══"
echo

echo "── Deployed commit ──"
if [[ -f "${HISTORY_FILE}" ]]; then
  last_success="$(grep 'result=success' "${HISTORY_FILE}" | tail -1)"
  if [[ -n "${last_success}" ]]; then
    echo "  ${last_success}"
  else
    echo "  no successful automated deploy recorded yet"
  fi
else
  echo "  no deploy history yet (${HISTORY_FILE} does not exist)"
fi
echo "  running checkout: $(git rev-parse --short HEAD) ($(git log -1 --format=%cI))"
echo

echo "── Component health (${API_URL}/ready) ──"
ready_json="$(curl -sk --max-time 10 "${API_URL}/ready" || echo '{}')"
echo "${ready_json}" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("  UNREACHABLE")
    sys.exit(0)
overall = d.get("status", "unknown")
print(f"  overall: {overall}")
for name, comp in d.get("components", {}).items():
    status = comp.get("status")
    detail = comp.get("detail", "")
    print(f"    {name}: {status}  {detail}")
'
echo

echo "── Containers ──"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --format 'table {{.Name}}\t{{.Status}}' 2>/dev/null || echo "  docker compose ps failed"
echo

echo "── Failed background jobs ──"
failed_transcripts="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  psql -tA -U "$(env_get POSTGRES_USER)" -d "$(env_get POSTGRES_DB)" \
  -c "SELECT count(*) FROM transcript WHERE status = 'failed';" 2>/dev/null | tr -d '[:space:]')"
failed_summaries="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  psql -tA -U "$(env_get POSTGRES_USER)" -d "$(env_get POSTGRES_DB)" \
  -c "SELECT count(*) FROM session_summary WHERE status = 'failed';" 2>/dev/null | tr -d '[:space:]')"
echo "  transcription: ${failed_transcripts:-unknown}"
echo "  summaries: ${failed_summaries:-unknown}"
echo

echo "── Backups ──"
bash scripts/ops/backup-status.sh "${BACKUP_DIR}" 2>&1 | sed 's/^/  /' || true
