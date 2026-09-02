#!/usr/bin/env bash
set -euo pipefail

# Diagnose or reconcile the production Keycloak realm's recovery-email settings.
#
# Realm import does not overwrite an already-initialised realm, so production
# password recovery requires an explicit reconciliation path. SMTP secrets are
# never echoed, placed on the host command line, or written to a repository file.
#
# Usage:
#   bash scripts/pilot/reconcile-keycloak-email.sh check
#   bash scripts/pilot/reconcile-keycloak-email.sh apply

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

read_env() {
  local key="$1"
  if [[ -n "${!key-}" ]]; then
    printf '%s' "${!key}"
    return 0
  fi
  python3 - "$ENV_FILE" "$key" <<'PY'
import sys
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

TEST_EMAIL="$(read_env WITNESS_KEYCLOAK_RECOVERY_TEST_EMAIL)"
[[ -n "$TEST_EMAIL" ]] || TEST_EMAIL="hello@buildwithwitness.com"

# Authenticate from the container's existing bootstrap environment. Credentials
# stay inside the container process and stdout is suppressed.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T keycloak \
  sh -lc '/opt/keycloak/bin/kcadm.sh config credentials \
    --server http://keycloak:8080 --realm master \
    --user "$KC_BOOTSTRAP_ADMIN_USERNAME" \
    --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"' >/dev/null

REALM_SMTP_JSON="$({
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T keycloak \
    sh -lc "/opt/keycloak/bin/kcadm.sh get realms/$REALM --fields smtpServer";
})"

# Inspect only non-secret SMTP metadata. Never print the auth user/password.
printf '%s' "$REALM_SMTP_JSON" | python3 -c '
import json,sys
smtp=(json.load(sys.stdin).get("smtpServer") or {})
print("[keycloak-email] smtp_config_present=" + ("yes" if smtp else "no"))
if smtp:
    print("[keycloak-email] smtp_host=" + str(smtp.get("host", "missing")))
    print("[keycloak-email] smtp_port=" + str(smtp.get("port", "missing")))
    print("[keycloak-email] smtp_from=" + str(smtp.get("from", "missing")))
    print("[keycloak-email] smtp_starttls=" + str(smtp.get("starttls", "missing")))
    print("[keycloak-email] smtp_ssl=" + str(smtp.get("ssl", "missing")))
'
SMTP_PRESENT="$(printf '%s' "$REALM_SMTP_JSON" | python3 -c 'import json,sys; print("yes" if (json.load(sys.stdin).get("smtpServer") or {}) else "no")')"

# Keycloak deliberately returns a generic forgot-password response for unknown
# addresses. Check only the canonical exact address and never list arbitrary users.
USER_STATE="$({
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T keycloak \
    sh -lc "/opt/keycloak/bin/kcadm.sh get users -r '$REALM' -q exact=true -q email='$TEST_EMAIL' --fields enabled,emailVerified";
} | python3 -c 'import json,sys; u=json.load(sys.stdin); print("absent" if len(u)==0 else "ambiguous" if len(u)!=1 else "present_enabled_verified" if u[0].get("enabled") and u[0].get("emailVerified") else "present_not_ready")')"
echo "[keycloak-email] recovery_identity=$USER_STATE"

if [[ "$MODE" == "check" ]]; then
  [[ "$SMTP_PRESENT" == "yes" && "$USER_STATE" == "present_enabled_verified" ]]
  exit
fi

SMTP_HOST="$(read_env KEYCLOAK_SMTP_HOST)"
SMTP_PORT="$(read_env KEYCLOAK_SMTP_PORT)"
SMTP_FROM="$(read_env KEYCLOAK_SMTP_FROM)"
SMTP_FROM_NAME="$(read_env KEYCLOAK_SMTP_FROM_DISPLAY_NAME)"
SMTP_REPLY_TO="$(read_env KEYCLOAK_SMTP_REPLY_TO)"
SMTP_USER="$(read_env KEYCLOAK_SMTP_USER)"
SMTP_PASSWORD="$(read_env KEYCLOAK_SMTP_PASSWORD)"
SMTP_STARTTLS="$(read_env KEYCLOAK_SMTP_STARTTLS)"
SMTP_SSL="$(read_env KEYCLOAK_SMTP_SSL)"

# Preserve the Brevo secret names already used by Witness production operations.
[[ -n "$SMTP_USER" ]] || SMTP_USER="$(read_env BREVO_SMTP_LOGIN)"
[[ -n "$SMTP_PASSWORD" ]] || SMTP_PASSWORD="$(read_env BREVO_SMTP_KEY)"
[[ -n "$SMTP_HOST" ]] || SMTP_HOST="smtp-relay.brevo.com"
[[ -n "$SMTP_PORT" ]] || SMTP_PORT="2525"
[[ -n "$SMTP_STARTTLS" ]] || SMTP_STARTTLS="true"
[[ -n "$SMTP_SSL" ]] || SMTP_SSL="false"

missing=()
[[ -n "$SMTP_FROM" ]] || missing+=(KEYCLOAK_SMTP_FROM)
[[ -n "$SMTP_USER" ]] || missing+=(KEYCLOAK_SMTP_USER/BREVO_SMTP_LOGIN)
[[ -n "$SMTP_PASSWORD" ]] || missing+=(KEYCLOAK_SMTP_PASSWORD/BREVO_SMTP_KEY)
if ((${#missing[@]})); then
  echo "[keycloak-email] cannot apply; missing: ${missing[*]}" >&2
  echo "[keycloak-email] no realm change was attempted" >&2
  exit 1
fi

# Build the patch locally and stream it over stdin. The temporary container file
# is deleted even if kcadm fails; the JSON is never printed.
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

if [[ "$USER_STATE" != "present_enabled_verified" ]]; then
  echo "[keycloak-email] SMTP applied but recovery identity is not ready: $USER_STATE" >&2
  exit 1
fi

echo "[keycloak-email] verification=pass"
