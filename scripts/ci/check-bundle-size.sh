#!/usr/bin/env bash
# Performance budget (ADR-0020): <= 200 KB gzipped initial JavaScript.
# The budget protects users on the worst connections. Exceeding it to improve
# the experience on fast connections helps precisely the people who need it least.
set -euo pipefail

BUDGET_KB=200
built=$(find apps -name '.next' -type d 2>/dev/null | head -1 || true)
if [ -z "$built" ]; then
  echo "No frontend build output yet — budget check skipped."
  exit 0
fi

total=0
while IFS= read -r f; do
  size=$(gzip -c "$f" | wc -c)
  total=$((total + size))
done < <(find "$built/static/chunks" -name '*.js' -not -name '*.map' 2>/dev/null | head -50)

kb=$((total / 1024))
echo "Initial JS (gzipped): ${kb} KB / ${BUDGET_KB} KB budget"
if [ "$kb" -gt "$BUDGET_KB" ]; then
  echo "::error::Bundle budget exceeded. See ADR-0020."
  exit 1
fi
