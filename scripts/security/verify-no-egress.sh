#!/usr/bin/env bash
# Principle P1 made checkable.
#
# The sovereign deployment profile must make ZERO outbound connections. This is
# the difference between sovereignty as a marketing claim and sovereignty as a
# property. When the stack exists (Phase 2), this runs it in a network namespace
# with no route and asserts full function.
#
# Until then it performs the static half of the check: no source file may contain
# a hard-coded external endpoint that could be reached at runtime.
set -euo pipefail

echo "== Static egress check =="

# Endpoints that must never appear outside documentation, examples or config templates.
forbidden='api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.cohere\.ai|telemetry\.|analytics\.|sentry\.io|\.datadoghq\.com|api\.mixpanel\.com|google-analytics\.com'

hits=0
if [ -d apps ] || [ -d services ] || [ -d workers ] || [ -d packages ]; then
  while IFS= read -r f; do
    if grep -qE "$forbidden" "$f"; then
      echo "::error file=$f::hard-coded external endpoint found"
      grep -nE "$forbidden" "$f" | head -3
      hits=$((hits + 1))
    fi
  done < <(find apps services workers packages sdk -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.py' \) -not -path '*/node_modules/*' 2>/dev/null || true)
fi

if [ "$hits" -gt 0 ]; then
  echo
  echo "$hits file(s) contain a hard-coded external endpoint."
  echo "External providers are configured per-tenant and routed through the LiteLLM"
  echo "gateway, never hard-coded. See ADR-0009."
  exit 1
fi
echo "No hard-coded external endpoints in source."

echo
echo "== Runtime egress check =="
if [ ! -f infrastructure/docker/docker-compose.yml ] \
   || [ ! -f infrastructure/docker/docker-compose.airgap.yml ] \
   || ! command -v docker >/dev/null 2>&1 \
   || [ ! -f .env ]; then
  echo "Stack, Docker or .env unavailable — runtime check skipped."
  echo "The runtime half of this check requires a configured environment; run"
  echo "'make bootstrap' first. The static check above has already run."
  echo "::notice::Runtime zero-egress verification activates with the Phase 2 stack."
  exit 0
fi

# Phase 2+: run the sovereign profile with no route and assert it still works.
#
# --env-file is required: compose resolves `.env` relative to the compose FILE's
# directory, not the working directory. Without it every mandatory variable fails
# to interpolate even when the contributor has set them all correctly.
echo "Running sovereign profile under network isolation..."
WITNESS_DEPLOYMENT_PROFILE=sovereign \
  docker compose --env-file .env \
                 -f infrastructure/docker/docker-compose.yml \
                 -f infrastructure/docker/docker-compose.airgap.yml \
  --profile full up -d --wait
trap 'docker compose --env-file .env -f infrastructure/docker/docker-compose.yml --profile full down -v' EXIT
bash scripts/security/assert-no-outbound.sh
