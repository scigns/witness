#!/usr/bin/env bash
set -euo pipefail

# Deploys the current checkout to the pilot host: build -> migrate -> recreate
# -> health check -> smoke test, with an automatic rollback of the running
# containers (not the database — migrations are additive-only, see
# docs/architecture/decisions, and are never rolled back automatically) if the
# health check fails after recreation.
#
# Run identically by a human operator on the pilot host or by
# .github/workflows/deploy.yml on the self-hosted runner registered there
# (docs/operations/PILOT_OPERATIONS.md) — this script is the one place the
# steps are defined, per docs/engineering/CI_CD.md's "no logic in YAML" rule.
#
# Required environment: the repo-root .env (see
# deployments/cloud-managed/.env.example) plus WITNESS_PILOT_API_URL and
# WITNESS_PILOT_WEB_URL pointing at the public hostnames.

cd "$(git rev-parse --show-toplevel)"

COMPOSE_FILE="deployments/cloud-managed/docker-compose.pilot.yml"
COMPOSE=(docker compose --env-file .env -f "$COMPOSE_FILE")
API_URL="${WITNESS_PILOT_API_URL:?WITNESS_PILOT_API_URL must be set}"
WEB_URL="${WITNESS_PILOT_WEB_URL:?WITNESS_PILOT_WEB_URL must be set}"
HEALTH_TIMEOUT_SECONDS="${WITNESS_DEPLOY_HEALTH_TIMEOUT_SECONDS:-90}"
HISTORY_FILE="deployments/cloud-managed/.deploy-history.log"
COMMIT="$(git rev-parse HEAD)"
VERSION="$(node -p "require('./package.json').version")"

export WITNESS_VERSION="$VERSION"
export WITNESS_BUILD_ID="$COMMIT"

log() { echo "[deploy] $*"; }
record() { echo "$(date -u +%FT%TZ) commit=${COMMIT} result=$1" >>"$HISTORY_FILE"; }

tag_rollback_candidate() {
  local image="$1"
  if docker image inspect "${image}:latest" >/dev/null 2>&1; then
    docker tag "${image}:latest" "${image}:rollback"
  else
    log "no existing ${image}:latest — nothing to roll back to if this deploy fails"
  fi
}

wait_for_health() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  while [ "$SECONDS" -lt "$deadline" ]; do
    local status
    status="$(curl -sk --max-time 5 "${API_URL}/ready" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status","error"))' 2>/dev/null || echo error)"
    if [ "$status" = "ok" ]; then
      return 0
    fi
    sleep 3
  done
  return 1
}

rollback() {
  log "health check failed — rolling back api and web containers to the previous image"
  for image in witness-pilot-api witness-pilot-web; do
    if docker image inspect "${image}:rollback" >/dev/null 2>&1; then
      docker tag "${image}:rollback" "${image}:latest"
    fi
  done
  "${COMPOSE[@]}" up -d --force-recreate api web
  if wait_for_health; then
    log "rollback succeeded — service recovered on the previous image. The failed deploy was NOT applied. Investigate before retrying."
    record "rolled_back"
  else
    log "ROLLBACK ALSO FAILED HEALTH CHECK. Manual intervention required — see docs/operations/PILOT_OPERATIONS.md."
    record "rollback_failed"
  fi
  exit 1
}

log "tagging current images as rollback candidates"
tag_rollback_candidate witness-pilot-api
tag_rollback_candidate witness-pilot-web

log "building api and web images"
"${COMPOSE[@]}" build api web

log "applying database migrations (forward-only)"
"${COMPOSE[@]}" run --rm api pnpm --filter @witness/api exec prisma migrate deploy

log "recreating api and web containers"
"${COMPOSE[@]}" up -d --force-recreate api web

log "waiting for health (up to ${HEALTH_TIMEOUT_SECONDS}s)"
wait_for_health || rollback

log "running smoke checks against ${API_URL} and ${WEB_URL}"
curl -skf --max-time 10 "${API_URL}/ready" >/dev/null
curl -skf --max-time 10 -o /dev/null -w '' "${WEB_URL}/" || rollback

log "deploy succeeded"
record "success"
