#!/usr/bin/env bash
set -euo pipefail

# Export only reviewed, non-secret realm/client configuration for rollback.
# Credentials are supplied from the Keycloak container's existing bootstrap
# environment and are never placed on the host command line or printed. The
# Keycloak 26 kcadm shipped in production does not support --password:env, so
# expansion is kept inside the container shell and stdout remains suppressed.
cd "$(git rev-parse --show-toplevel)"

COMPOSE_FILE="deployments/cloud-managed/docker-compose.pilot.yml"
ENV_FILE="${WITNESS_ENV_FILE:-.env}"
DESTINATION="${1:-$HOME/witness-backups/keycloak-config}"
mkdir -p "${DESTINATION}"
chmod 700 "${DESTINATION}"
umask 077
STAMP="$(date -u +%Y%m%dT%H%M%S)-$$"
REALM_EXPORT="${DESTINATION}/witness-realm-${STAMP}.json"
CLIENT_EXPORT="${DESTINATION}/witness-api-client-${STAMP}.json"

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T keycloak \
  sh -lc '/opt/keycloak/bin/kcadm.sh config credentials \
    --server http://keycloak:8080 --realm master \
    --user "$KC_BOOTSTRAP_ADMIN_USERNAME" \
    --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"' >/dev/null

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T keycloak \
  sh -lc '/opt/keycloak/bin/kcadm.sh get realms/witness \
  --fields realm,enabled,sslRequired,frontendUrl,attributes,accessTokenLifespan,ssoSessionIdleTimeout,ssoSessionMaxLifespan \
  -o' > "${REALM_EXPORT}.tmp"

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T keycloak \
  sh -lc '/opt/keycloak/bin/kcadm.sh get clients -r witness -q clientId=witness-api \
  --fields id,clientId,enabled,publicClient,redirectUris,webOrigins,attributes,standardFlowEnabled,directAccessGrantsEnabled \
  -o' > "${CLIENT_EXPORT}.tmp"

mv -- "${REALM_EXPORT}.tmp" "${REALM_EXPORT}"
mv -- "${CLIENT_EXPORT}.tmp" "${CLIENT_EXPORT}"
chmod 600 "${REALM_EXPORT}" "${CLIENT_EXPORT}"
sha256sum "${REALM_EXPORT}" > "${REALM_EXPORT}.sha256"
sha256sum "${CLIENT_EXPORT}" > "${CLIENT_EXPORT}.sha256"
chmod 600 "${REALM_EXPORT}.sha256" "${CLIENT_EXPORT}.sha256"

echo "Realm configuration export: ${REALM_EXPORT}"
echo "Client configuration export: ${CLIENT_EXPORT}"
