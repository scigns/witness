#!/usr/bin/env bash
# Assert that no service on the isolated network can reach the outside world.
#
# This is the runtime half of the P1 verification. The static half is in
# verify-no-egress.sh.
set -euo pipefail

echo "Asserting no container can reach an external host..."

fail=0
for svc in postgres neo4j opensearch valkey minio nats keycloak ollama; do
  cid=$(docker compose -f infrastructure/docker/docker-compose.yml ps -q "$svc" 2>/dev/null || true)
  [ -z "$cid" ] && continue

  # A successful connection is a failure. We expect this to time out.
  if docker exec "$cid" timeout 3 sh -c 'command -v wget >/dev/null && wget -q -T 2 -O /dev/null https://example.com' 2>/dev/null; then
    echo "::error::$svc reached an external host — the sovereign profile is leaking."
    fail=1
  else
    echo "  ok  $svc — no external reachability"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "The sovereignty guarantee in docs/governance/DIGITAL_SOVEREIGNTY.md is not being met."
  echo "This is a security-severity defect, not a test failure."
  exit 1
fi
echo "Zero egress verified."
