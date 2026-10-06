#!/usr/bin/env bash
set -euo pipefail

# Deploys the current checkout to the pilot host: build -> migrate -> recreate
# -> health check -> smoke test, with an automatic rollback of the running
# containers if the health check fails after recreation. Database migrations
# are never reversed automatically. Release approval requires a rehearsal of
# previous-image compatibility with both the upgraded schema and candidate writes.
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
ENV_FILE="${WITNESS_ENV_FILE:-.env}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
API_URL="${WITNESS_PILOT_API_URL:?WITNESS_PILOT_API_URL must be set}"
WEB_URL="${WITNESS_PILOT_WEB_URL:?WITNESS_PILOT_WEB_URL must be set}"
HEALTH_TIMEOUT_SECONDS="${WITNESS_DEPLOY_HEALTH_TIMEOUT_SECONDS:-90}"
HISTORY_FILE="deployments/cloud-managed/.deploy-history.log"
COMMIT="$(git rev-parse HEAD)"
VERSION="$(python3 -c 'import json; print(json.load(open("package.json"))["version"])')"

# Fail closed before any host mutation. The release manager records the exact
# reviewed SHA in the existing pilot environment after acceptance gates pass.
if [[ "${WITNESS_APPROVED_RELEASE_SHA:-}" != "$COMMIT" ]]; then
  echo "Release approval is missing or does not match checkout SHA $COMMIT" >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Deployment requires a clean tracked checkout" >&2
  exit 1
fi

export WITNESS_VERSION="$VERSION"
export WITNESS_BUILD_ID="$COMMIT"

log() { echo "[deploy] $*"; }
record() { echo "$(date -u +%FT%TZ) commit=${COMMIT} result=$1" >>"$HISTORY_FILE"; }

capture_running_image() {
  local service="$1" container image
  container="$("${COMPOSE[@]}" ps -q "$service")"
  [[ -n "$container" && "$container" != *$'\n'* ]] || { log "expected one running $service container" >&2; return 1; }
  image="$(docker inspect --format '{{.Image}}' "$container")"
  [[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]] || { log "invalid running image for $service" >&2; return 1; }
  docker image inspect "$image" >/dev/null
  printf '%s' "$image"
}

write_image_override() {
  printf 'services:\n  api:\n    image: "%s"\n  web:\n    image: "%s"\n' "$1" "$2" > "$IMAGE_OVERRIDE"
}

wait_for_health() {
  local expected_build="$1"
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  while [ "$SECONDS" -lt "$deadline" ]; do
    local status
    status="$(curl -fsS --max-time 5 "${API_URL}/ready" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r.get("status","error") if r.get("buildId") == sys.argv[1] else "wrong_build")' "$expected_build" 2>/dev/null || echo error)"
    if [ "$status" = "ok" ]; then
      return 0
    fi
    sleep 3
  done
  return 1
}

rollback() {
  log "health check failed — rolling back api and web containers to the previous image"
  write_image_override "$PREVIOUS_API_IMAGE" "$PREVIOUS_WEB_IMAGE"
  export WITNESS_BUILD_ID="$PREVIOUS_BUILD"
  export WITNESS_VERSION="$PREVIOUS_VERSION"
  if ! "${RELEASE_COMPOSE[@]}" up -d --no-deps --no-build --force-recreate api web; then
    log "ROLLBACK RECREATION FAILED. Human recovery required."
    record "rollback_failed"
    exit 1
  fi
  if wait_for_health "$PREVIOUS_BUILD"; then
    log "rollback succeeded — service recovered on the previous image. The failed deploy was NOT applied. Investigate before retrying."
    record "rolled_back"
  else
    log "ROLLBACK ALSO FAILED HEALTH CHECK. Manual intervention required — see docs/operations/PILOT_OPERATIONS.md."
    record "rollback_failed"
  fi
  exit 1
}

log "capturing current healthy build identity"
PREVIOUS_IDENTITY="$(curl -fsS --max-time 10 "${API_URL}/ready")"
PREVIOUS_BUILD="$(printf '%s' "$PREVIOUS_IDENTITY" | python3 -c 'import json,sys; r=json.load(sys.stdin); assert r["status"] == "ok"; print(r["buildId"])')"
PREVIOUS_VERSION="$(printf '%s' "$PREVIOUS_IDENTITY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')"
[[ "$PREVIOUS_BUILD" =~ ^[0-9a-f]{40}$ ]] || { log "previous deployed SHA is invalid; rollback cannot be verified"; exit 1; }

log "capturing exact running rollback images"
PREVIOUS_API_IMAGE="$(capture_running_image api)"
PREVIOUS_WEB_IMAGE="$(capture_running_image web)"
# A healthy previous image is not necessarily compatible with the upgraded
# schema or new writes. Approval is specific to this candidate/image pair and
# must follow a successful rollback rehearsal; never infer it from /ready.
if [[ "${WITNESS_APPROVED_ROLLBACK_RELEASE_SHA:-}" != "$COMMIT" || \
      "${WITNESS_APPROVED_ROLLBACK_API_IMAGE:-}" != "$PREVIOUS_API_IMAGE" || \
      "${WITNESS_APPROVED_ROLLBACK_WEB_IMAGE:-}" != "$PREVIOUS_WEB_IMAGE" ]]; then
  log "rollback compatibility approval missing for candidate and running images; refusing build/migration/deployment" >&2
  exit 1
fi
EVIDENCE_DIR="${WITNESS_DEPLOY_EVIDENCE_DIR:-$HOME/witness-backups/releases/$COMMIT}"
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR"
umask 077
IMAGE_OVERRIDE="$(mktemp)"
trap 'rm -f -- "$IMAGE_OVERRIDE"' EXIT
RELEASE_COMPOSE=("${COMPOSE[@]}" -f "$IMAGE_OVERRIDE")
CANDIDATE_API_IMAGE="witness-release-api:$COMMIT"
CANDIDATE_WEB_IMAGE="witness-release-web:$COMMIT"
write_image_override "$CANDIDATE_API_IMAGE" "$CANDIDATE_WEB_IMAGE"

log "building immutable SHA-tagged api and web images"
"${RELEASE_COMPOSE[@]}" build api web
CANDIDATE_API_ID="$(docker image inspect --format '{{.Id}}' "$CANDIDATE_API_IMAGE")"
CANDIDATE_WEB_ID="$(docker image inspect --format '{{.Id}}' "$CANDIDATE_WEB_IMAGE")"
printf 'candidate_sha=%s\nprevious_sha=%s\nprevious_version=%s\nprevious_api_image=%s\nprevious_web_image=%s\ncandidate_api_image=%s\ncandidate_web_image=%s\n' \
  "$COMMIT" "$PREVIOUS_BUILD" "$PREVIOUS_VERSION" "$PREVIOUS_API_IMAGE" "$PREVIOUS_WEB_IMAGE" "$CANDIDATE_API_ID" "$CANDIDATE_WEB_ID" > "$EVIDENCE_DIR/manifest.txt"

# Preserve rollback preflight evidence without storing environment secrets.
"${COMPOSE[@]}" config --format json | python3 -c 'import json,sys; c=json.load(sys.stdin); [(s.update(environment={k:"[REDACTED]" for k in s.get("environment",{})})) for s in c.get("services",{}).values()]; json.dump(c,sys.stdout,indent=2)' > "$EVIDENCE_DIR/compose.redacted.json"
# shellcheck disable=SC2016 # Expand database identity inside the container only.
"${COMPOSE[@]}" exec -T postgres sh -c 'psql -X -A -t -F "|" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name"' > "$EVIDENCE_DIR/migrations.before.txt"
cp services/api-gateway/prisma/schema.prisma "$EVIDENCE_DIR/candidate-schema.prisma"
find services/api-gateway/prisma/migrations -name migration.sql -exec sha256sum {} + > "$EVIDENCE_DIR/candidate-migrations.sha256"

log "taking immediate Witness and identity database backups"
bash scripts/pilot/backup.sh "$EVIDENCE_DIR"
bash scripts/ops/backup-status.sh "$EVIDENCE_DIR" 1
# Object recovery and database restore proof are release gates required before
# WITNESS_APPROVED_RELEASE_SHA is recorded. These dumps do not protect R2.

log "applying database migrations (forward-only)"
"${RELEASE_COMPOSE[@]}" run --rm --no-deps --no-build api node node_modules/prisma/build/index.js migrate deploy

log "recreating api and web containers from the recorded image IDs"
write_image_override "$CANDIDATE_API_ID" "$CANDIDATE_WEB_ID"
"${RELEASE_COMPOSE[@]}" up -d --no-deps --no-build --force-recreate api web || rollback

log "waiting for health (up to ${HEALTH_TIMEOUT_SECONDS}s)"
wait_for_health "$COMMIT" || rollback

log "running smoke checks against ${API_URL} and ${WEB_URL}"
curl -fsS --max-time 10 "${API_URL}/ready" >/dev/null || rollback
if ! curl -fsS --max-time 10 "${WEB_URL}/api/build-identity" | python3 -c 'import json,sys; assert json.load(sys.stdin)["buildId"] == sys.argv[1]' "$COMMIT"; then
  log "web artifact identity does not match approved SHA"
  rollback
fi
curl -fsS --max-time 10 -o /dev/null -w '' "${WEB_URL}/" || rollback

log "deploy succeeded"
record "success"
