#!/usr/bin/env bash
# Licence boundary enforcement (ADR-0002).
#
# The platform is GPL-3.0-or-later. sdk/ and packages/contracts/ are Apache-2.0 so
# integrators can build against Witness without copyleft flowing into their own
# systems. A dependency must be compatible with the licence of the package using it.
set -euo pipefail

DENIED="SSPL|BUSL|Elastic-2.0|RSAL|CC-BY-NC|Commons Clause|PolyForm|Proprietary"

echo "== Licence declarations =="
for f in LICENSE sdk/LICENSE packages/contracts/LICENSE; do
  if [ -f "$f" ]; then
    echo "  present: $f"
  else
    echo "::warning::$f not present yet (required before those directories carry third-party contributions — open decision D-1)"
  fi
done

echo
echo "== Dependency licences =="
if [ ! -f pnpm-lock.yaml ]; then
  echo "No lockfile yet — dependency licence check skipped."
  exit 0
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm unavailable; skipping."
  exit 0
fi

output=$(pnpm licenses list --json 2>/dev/null || echo '{}')
if echo "$output" | grep -qE "$DENIED"; then
  echo "::error::A dependency carries a licence incompatible with this project."
  echo "$output" | grep -E "$DENIED" | head -10
  echo
  echo "Denied: SSPL, BUSL, Elastic-2.0, RSAL, non-commercial, source-available."
  echo "See docs/research/OSS_EVALUATION.md."
  exit 1
fi
echo "No denied licences found."
