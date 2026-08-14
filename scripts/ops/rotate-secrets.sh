#!/usr/bin/env bash
set -euo pipefail

# Rotates the pilot deployment's live secrets in place: generates a new value,
# applies it to the running service via that service's own admin interface
# (ALTER ROLE for Postgres, kcadm.sh for Keycloak — an env var alone does
# nothing for an already-initialised instance, see postgres-init/ and
# docker-compose.pilot.yml's comments), writes the new value into .env, then
# restarts and health-checks whatever consumes it.
#
# Never prints a generated secret. Run one subcommand at a time and check the
# health output before moving to the next; each is independent.
#
# Usage: scripts/ops/rotate-secrets.sh <postgres-app|postgres-keycloak|keycloak-admin|all>

cd "$(git rev-parse --show-toplevel)"

ENV_FILE=".env"
COMPOSE_FILE="deployments/cloud-managed/docker-compose.pilot.yml"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
API_URL="${WITNESS_PILOT_API_URL:?WITNESS_PILOT_API_URL must be set}"

log() { echo "[rotate] $*"; }

new_secret() { python3 -c 'import secrets; print(secrets.token_urlsafe(32))'; }

env_get() { grep -E "^${1}=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }

env_set() {
  local key="$1" value="$2"
  # In place, no backup file left with the old secret in it.
  python3 - "$ENV_FILE" "$key" "$value" <<'PY'
import re, sys
path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    lines = f.readlines()
pattern = re.compile(rf'^{re.escape(key)}=.*$')
found = False
for i, line in enumerate(lines):
    if pattern.match(line):
        lines[i] = f"{key}={value}\n"
        found = True
if not found:
    lines.append(f"{key}={value}\n")
with open(path, 'w') as f:
    f.writelines(lines)
PY
}

wait_for_health() {
  local deadline=$((SECONDS + 90))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ "$(curl -sk --max-time 5 "${API_URL}/ready" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status","error"))' 2>/dev/null || echo error)" = "ok" ]; then
      return 0
    fi
    sleep 3
  done
  return 1
}

rotate_postgres_app() {
  log "rotating the witness application role password"
  local new; new="$(new_secret)"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$(env_get POSTGRES_USER)" -d "$(env_get POSTGRES_DB)" \
    -c "ALTER ROLE \"$(env_get POSTGRES_USER)\" WITH PASSWORD '${new}';"
  env_set POSTGRES_PASSWORD "$new"
  env_set DATABASE_URL "postgresql://$(env_get POSTGRES_USER):${new}@postgres:5432/$(env_get POSTGRES_DB)?schema=public"
  log "restarting api with the new credential"
  "${COMPOSE[@]}" up -d --force-recreate api
  wait_for_health && log "postgres-app rotation OK" || {
    log "FAILED health check after postgres-app rotation — api cannot reach postgres. Check logs."
    exit 1
  }
}

rotate_postgres_keycloak() {
  log "rotating the keycloak role password"
  local new; new="$(new_secret)"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$(env_get POSTGRES_USER)" -d "$(env_get POSTGRES_DB)" \
    -c "ALTER ROLE \"$(env_get KEYCLOAK_DB_USER)\" WITH PASSWORD '${new}';"
  env_set KEYCLOAK_DB_PASSWORD "$new"
  log "restarting keycloak with the new credential"
  "${COMPOSE[@]}" up -d --force-recreate keycloak
  wait_for_health && log "postgres-keycloak rotation OK" || {
    log "FAILED health check after postgres-keycloak rotation — keycloak cannot reach its database. Check logs."
    exit 1
  }
}

rotate_keycloak_admin() {
  log "rotating the keycloak bootstrap admin password"
  local old new realm=master
  old="$(env_get KEYCLOAK_ADMIN_PASSWORD)"
  new="$(new_secret)"
  local kc=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T keycloak)
  "${kc[@]}" /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm "$realm" \
    --user "$(env_get KEYCLOAK_ADMIN)" --password "$old" >/dev/null
  "${kc[@]}" /opt/keycloak/bin/kcadm.sh set-password -r "$realm" \
    --username "$(env_get KEYCLOAK_ADMIN)" --new-password "$new" >/dev/null
  # Confirm the new password actually works before writing over the old one.
  "${kc[@]}" /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm "$realm" \
    --user "$(env_get KEYCLOAK_ADMIN)" --password "$new" >/dev/null
  env_set KEYCLOAK_ADMIN_PASSWORD "$new"
  log "keycloak-admin rotation OK — verified sign-in with the new password"
}

case "${1:-}" in
  postgres-app) rotate_postgres_app ;;
  postgres-keycloak) rotate_postgres_keycloak ;;
  keycloak-admin) rotate_keycloak_admin ;;
  all)
    rotate_postgres_app
    rotate_postgres_keycloak
    rotate_keycloak_admin
    ;;
  *)
    echo "Usage: $0 <postgres-app|postgres-keycloak|keycloak-admin|all>" >&2
    exit 2
    ;;
esac
