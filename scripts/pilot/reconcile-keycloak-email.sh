#!/usr/bin/env bash
set -euo pipefail

# Reconcile the production Keycloak realm's password-recovery email settings.
#
# Why this exists:
# - Keycloak realm imports do not overwrite an already-initialised realm.
# - SMTP belongs to the realm, not to the Witness API.
# - direct SMTP transport success does not prove Keycloak is configured to use it.
#
# Secrets are read from the deployment env file and sent to kcadm over stdin as
# JSON. They are never echoed, placed on the host command line, or written to a
# repository file.
#
# Supported deployment variables:
#   KEYCLOAK_SMTP_HOST
#   KEYCLOAK_SMTP_PORT
#   KEYCLOAK_SMTP_FROM
#   KEYCLOAK_SMTP_FROM_DISPLAY_NAME   (optional)
#   KEYCLOAK_SMTP_REPLY_TO            (optional)
#   KEYCLOAK_SMTP_USER                (or BREVO_SMTP_LOGIN)
#   KEYCLOAK_SMTP_PASSWORD            (or BREVO_SMTP_KEY)
#   KEYCLOAK_SMTP_STARTTLS            (default true)
#   KEYCLOAK_SMTP_SSL                 (default false)
#   WITNESS_KEYCLOAK_RECOVERY_TEST_EMAIL (optional exact identity check)
#
# Usage:
#   scripts/pilot/reconcile-keycloak-email.sh check
#   scripts/pilot/reconcile-keycloak-email.sh apply

cd "$(git rev-parse --show-toplevel)"

MODE="${1:-check}"
case "$MODE" in
  check | apply) ;;
  *) echo "usage: $0 [check|apply]" >&2; exit 2 ;;
esac

COMPOSE_FILE="deployments/cloud-managed/docker-compose.pilot.yml"
ENV_FILE="${WITNESS_ENV_FILE:-.env}"
REALM="${KEYCLOAK_REALM:-witness}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[keycloak-email] deployment env file not found: $ENV_FILE" >&2
  exit 1
fi

# Read dotenv values without sourcing arbitrary shell code. Existing process
# environment wins, allowing secret-manager injection to override the file.
read_env() {
  local key="$1"
  if [[ -n "${!key-}" ]]; then
    printf '%s' "${!key}"
    return 0
  fi
  python3 - "$ENV_FILE" "$key" <<'PY'
import os, sys
path, wanted = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as fh:
    for raw in fh:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() != wanted:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        print(value, end="")
        break
PY
}

SMTP_HOST="$(read_env KEYCLOAK_SMTP_HOST)"
SMTP_PORT="$(read_env KEYCLOAK_SMTP_PORT)"
SMTP_FROM="$(read_env KEYCLOAK_SMTP_FROM)"
SMTP_FROM_NAME="$(read_env KEYCLOAK_SMTP_FROM_DISPLAY_NAME)"
SMTP_REPLY_TO="$(read_env KEYCLOAK_SMTP_REPLY_TO)"
SMTP_USER="$(read_env KEYCLOAK_SMTP_USER)"
SMTP_PASSWORD="$(read_env KEYCLOAK_SMTP_PASSWORD)"
SMTP_STARTTLS="$(read_env KEYCLOAK_SMTP_STARTTLS)"
SMTP_SSL="$(read_env KEYCLOAK_SMTP_SSL)"
TEST_EMAIL="$(read_env WITNESS_KEYCLOAK_RECOVERY_TEST_EMAIL)"

# Backwards-compatible mapping for the production Brevo secret names already
# used by Witness operations. The provider remains replaceable.
[[ -n "$SMTP_USER" ]] || SMTP_USER="$(read_env BREVO_SMTP_LOGIN)"
[[ -n "$SMTP_PASSWORD" ]] || SMTP_PASSWORD="$(read_env BREVO_SMTP_KEY)"
[[ -n "$SMTP_HOST" ]] || SMTP_HOST="smtp-relay.brevo.com"
[[ -n "$SMTP_PORT" ]] || SMTP_PORT="2525"
[[ -n "$SMTP_STARTTLS" ]] || SMTP_STARTTLS="true"
[[ -n "$SMTP_SSL" ]] || SMTP_SSL="false"

missing=()
[[ -n "$SMTP_HOST" ]] || missing+=(KEYCLOAK_SMTP_HOST)
[[ -n "$SMTP_PORT" ]] || missing+=(KEYCLOAK_SMTP_PORT)
[[ -n "$SMTP_FROM" ]] || missing+=(KEYCLOAK_SMTP_FROM)
[[ -n "$SMTP_USER" ]] || missing+=(KEYCLOAK_SMTP_USER/BREVO_SMTP_LOGIN)
[[ -n "$SMTP_PASSWORD" ]] || missing+=(KEYCLOAK_SMTP_PASSWORD/BREVO_SMTP_KEY)
if ((${#missing[@]})); then
  echo "[keycloak-email] configuration incomplete: ${missing[*]}" >&2
  echo "[keycloak-email] no realm change was attempted" >&2
  exit 1
fi

# Authenticate kcadm using the existing Keycloak container bootstrap environment.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T keycloak \
  sh -lc '/opt/keycloak/bin/kcadm.sh config credentials \
    --server http://keycloak:8080 --realm master \
    --user "$KC_BOOTSTRAP_ADMIN_USERNAME" \
    --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"' >/dev/null

# Report only whether the realm already has an SMTP map; never export the map,
# because it contains the password.
SMTP_PRESENT="$({
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T keycloak \
    sh -lc "/opt/keycloak/bin/kcadm.sh get realms/$REALM --fields smtpServer";
} | python3 -c 'import json,sys; d=json.load(sys.stdin); print("yes" if d.get("smtpServer") else "no")')"
echo "[keycloak-email] realm=$REALM smtp_config_present=$SMTP_PRESENT"

# An exact user check is useful because Keycloak deliberately gives a generic
# forgot-password response for unknown addresses. Never list arbitrary users.
if [[ -n "$TEST_EMAIL" ]]; then
  USER_COUNT="$({
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T keycloak \
      sh -lc "/opt/keycloak/bin/kcadm.sh get users -r '$REALM' -q exact=true -q email='$TEST_EMAIL' --fields id,enabled,emailVerified";
  } | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
  case "$USER_COUNT" in
    1) echo "[keycloak-email] recovery_identity=present" ;;
    0) echo "[keycloak-email] recovery_identity=absent" ;;
    *) echo "[keycloak-email] recovery_identity=ambiguous count=$USER_COUNT"; exit 1 ;;
  esac
fi

if [[ "$MODE" == "check" ]]; then
  [[ "$SMTP_PRESENT" == "yes" ]] || exit 1
  exit 0
fi

# Construct the realm patch locally, pass it over stdin, and remove the
# container-side temporary file even if kcadm fails. The JSON is never printed.
python3 - "$SMTP_HOST" "$SMTP_PORT" "$SMTP_FROM" "$SMTP_FROM_NAME" \
  "$SMTP_REPLY_TO" "$SMTP_USER" "$SMTP_PASSWORD" "$SMTP_STARTTLS" "$SMTP_SSL" <<'PY' |
import json, sys
host, port, sender, sender_name, reply_to, user, password, starttls, ssl = sys.argv[1:]
smtp = {
    "host": host,
    "port": port,
    "from": sender,
    "auth": "true",
    "user": user,
    "password": password,
    "starttls": starttls.lower(),
    "ssl": ssl.lower(),
}
if sender_name:
    smtp["fromDisplayName"] = sender_name
if reply_to:
    smtp["replyTo"] = reply_to
json.dump({"smtpServer": smtp}, sys.stdout)
PY
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T keycloak \
    sh -lc 'set -eu; f="$(mktemp)"; trap "rm -f \"$f\"" EXIT; cat >"$f"; /opt/keycloak/bin/kcadm.sh update realms/'"$REALM"' -f "$f" >/dev/null'

echo "[keycloak-email] realm SMTP configuration reconciled"

# Verify presence only. Do not print the resulting SMTP map.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T keycloak \
  sh -lc "/opt/keycloak/bin/kcadm.sh get realms/$REALM --fields smtpServer" |
  python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if d.get("smtpServer") else 1)'

echo "[keycloak-email] verification=pass"
