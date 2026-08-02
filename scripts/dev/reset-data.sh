#!/usr/bin/env bash
# Wipe local databases and re-seed with synthetic fixtures.
#
# LOCAL DEVELOPMENT ONLY. This destroys data. It refuses to run against anything
# that does not look like a local machine, because "I ran the reset script against
# staging" is a story every engineering organisation eventually has, and the cost
# of preventing it here is about fifteen lines.
#
# Seed data is synthetic. Witness records real deliberation by real people; using
# production data in development would violate the consent framework the product
# exists to enforce (docs/governance/CONSENT_FRAMEWORK.md).
set -euo pipefail

cd "$(dirname "$0")/../.."

# Load .env WITHOUT clobbering the caller's environment. Sourcing it directly
# would let the file override an explicitly exported DATABASE_URL — which would
# defeat the safety checks below, since they would then always be inspecting the
# local development values regardless of what the operator actually set.
if [ -f .env ]; then
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"
    case "$key" in *[!A-Za-z0-9_]*|'') continue ;; esac
    if [ -z "${!key:-}" ]; then
      value="${line#*=}"
      value="${value%\"}"; value="${value#\"}"
      export "$key=$value"
    fi
  done < .env
fi

DATABASE_URL="${DATABASE_URL:-}"
NODE_ENV="${NODE_ENV:-development}"
PROFILE="${WITNESS_DEPLOYMENT_PROFILE:-development}"

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set. Copy .env.example to .env first." >&2
  exit 1
fi

# ─── Refuse anything that is not obviously local ──────────────────────────────
if [ "$NODE_ENV" = "production" ] || [ "$PROFILE" = "sovereign" ]; then
  echo "Refusing to reset data: NODE_ENV=$NODE_ENV, profile=$PROFILE." >&2
  echo "This script is for local development only." >&2
  exit 1
fi

case "$DATABASE_URL" in
  *@localhost:*|*@127.0.0.1:*|*@postgres:*) ;;
  *)
    echo "Refusing to reset data: DATABASE_URL does not point at localhost." >&2
    echo "  $(echo "$DATABASE_URL" | sed -E 's#://[^@]*@#://***@#')" >&2
    exit 1
    ;;
esac

if [ "${FORCE:-0}" != "1" ]; then
  echo "This will DESTROY all local Witness data and re-seed it."
  echo "  target: $(echo "$DATABASE_URL" | sed -E 's#://[^@]*@#://***@#')"
  echo
  read -r -p "Type 'reset' to continue: " confirm
  [ "$confirm" = "reset" ] || { echo "Aborted."; exit 1; }
fi

echo
echo "── Resetting PostgreSQL ─────────────────────────────────────────────────"
pnpm --filter @witness/api exec prisma migrate reset --force --skip-seed

echo
echo "── Seeding synthetic fixtures ───────────────────────────────────────────"
pnpm --filter @witness/api run seed

echo
echo "Reset complete."
echo "Projections (Neo4j, OpenSearch) are rebuildable and are not seeded — they"
echo "are rebuilt from the event log once the projector exists in Phase 4."
