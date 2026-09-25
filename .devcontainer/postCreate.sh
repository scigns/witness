#!/usr/bin/env bash
# Runs once per Codespace/devcontainer creation. Idempotent: safe to re-run
# by hand (`bash .devcontainer/postCreate.sh`) if something needs retrying.
#
# Generates a fresh, random `.env` for this Codespace only — never reuses or
# writes a value that also protects a real deployment. Nothing here reads
# from or writes to production.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "==> Setting up Witness development environment"

# ─── .env: fresh random secrets, service-name hosts ────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo "==> Created .env from .env.example"

  random_secret() { openssl rand -hex 20; }
  pg_password="$(random_secret)"

  # Each `sed -i` targets one line by its exact key, never a blanket
  # find-and-replace across the file — a later addition of another
  # "change-me-in-every-environment" placeholder must not silently pick up
  # someone else's secret value.
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${pg_password}/" .env
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://witness:${pg_password}@postgres:5432/witness?schema=public#" .env
  sed -i "s/^POSTGRES_HOST=.*/POSTGRES_HOST=postgres/" .env
  sed -i "s/^NEO4J_PASSWORD=.*/NEO4J_PASSWORD=$(random_secret)/" .env
  sed -i "s#^NEO4J_URI=.*#NEO4J_URI=bolt://neo4j:7687#" .env
  sed -i "s/^KEYCLOAK_ADMIN_PASSWORD=.*/KEYCLOAK_ADMIN_PASSWORD=$(random_secret)/" .env
  sed -i "s/^S3_SECRET_ACCESS_KEY=.*/S3_SECRET_ACCESS_KEY=$(random_secret)/" .env
  sed -i "s/^GRAFANA_ADMIN_PASSWORD=.*/GRAFANA_ADMIN_PASSWORD=$(random_secret)/" .env
  sed -i "s/^OPENSEARCH_PASSWORD=.*/OPENSEARCH_PASSWORD=$(random_secret)/" .env

  echo "==> Generated fresh random development secrets (unique to this Codespace)"
  echo "==> NOTE: KEYCLOAK_URL/OIDC_ISSUER still point at localhost:8080 — that is"
  echo "    correct for a browser reaching Keycloak through the forwarded port, but"
  echo "    api-gateway calling out to Keycloak *from inside this container* needs"
  echo "    the service name instead. Real-Keycloak auth flows are dev-integration/"
  echo "    dev-full territory and have NOT been verified working through Codespaces'"
  echo "    port forwarding yet — see docs/engineering/DEVELOPMENT_ENVIRONMENTS.md."
  echo "    The default X-Witness-Dev-User header path (WITNESS_DEPLOYMENT_PROFILE="
  echo "    development, already set) needs none of this and covers most work."
else
  echo "==> .env already exists — leaving it untouched"
fi

echo "==> Enabling corepack (pins pnpm to the version in package.json)"
corepack enable

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Generating the Prisma client"
pnpm --filter @witness/api exec prisma generate

if pg_isready -h "${POSTGRES_HOST:-postgres}" -p 5432 >/dev/null 2>&1; then
  echo "==> Applying database migrations"
  pnpm --filter @witness/api exec prisma migrate deploy
  echo "==> Seeding synthetic development fixtures"
  pnpm --filter @witness/api run seed || echo "    (seed failed or not yet runnable — run 'make seed' manually)"
else
  echo "==> Postgres not reachable yet — run 'make migrate && make seed' once it is"
fi

echo
echo "==> Done. Next:"
echo "    pnpm dev            # start the API and web app"
echo "    make doctor         # check environment health any time"
