#!/usr/bin/env bash
# Performance budget (ADR-0020): <= 200 KB gzipped initial JavaScript.
#
# The budget protects users on the worst connections. Exceeding it to improve the
# experience on fast connections helps precisely the people who need it least.
#
# What "initial JavaScript" means here: the JS a browser must download to render
# ONE route. It is measured per route, and the worst route is what counts —
# because the user who lands on the heaviest page is the one the budget exists to
# protect, and they do not download the other routes' chunks.
#
# This previously summed every file under .next/static/chunks, which is the total
# JavaScript across the whole application. That number grows with every route
# added and bears no relationship to what any single user downloads. It reported
# 252 KB for an application whose heaviest route is 110 KB, so the gate failed on
# route count rather than on weight — and the natural response to a gate that
# fails for the wrong reason is to raise its budget, which is how a performance
# budget stops meaning anything.
#
# The budget itself is unchanged.
set -euo pipefail

BUDGET_KB=200

built=$(find apps -name '.next' -type d 2>/dev/null | head -1 || true)
if [ -z "$built" ]; then
  echo "No frontend build output yet — budget check skipped."
  exit 0
fi

manifest="$built/app-build-manifest.json"
if [ ! -f "$manifest" ]; then
  echo "::warning::$manifest not found — cannot measure per-route initial JS."
  echo "Budget check skipped. This is a gap, not a pass."
  exit 0
fi

# Emits "<route> <gzipped-bytes>" per route.
report=$(python3 - "$manifest" "$built" <<'PY'
import gzip, json, os, sys

manifest_path, build_dir = sys.argv[1], sys.argv[2]
manifest = json.load(open(manifest_path))
pages = manifest.get("pages", {})

# The root layout ships with every route; Next lists it as its own entry.
shared = set(pages.get("/layout", []))

for page, files in sorted(pages.items()):
    if page == "/layout":
        continue

    total = 0
    for rel in sorted(shared | set(files)):
        if not rel.endswith(".js"):
            continue
        path = os.path.join(build_dir, rel)
        if not os.path.isfile(path):
            continue
        with open(path, "rb") as handle:
            total += len(gzip.compress(handle.read(), 6))

    print(f"{page} {total}")
PY
)

worst_route=""
worst_bytes=0

echo "Gzipped initial JS per route:"
while read -r route bytes; do
  [ -z "$route" ] && continue
  printf '  %-32s %s KB\n' "$route" "$((bytes / 1024))"
  if [ "$bytes" -gt "$worst_bytes" ]; then
    worst_bytes=$bytes
    worst_route=$route
  fi
done <<< "$report"

kb=$((worst_bytes / 1024))
echo
echo "Worst route: ${worst_route} — ${kb} KB gzipped / ${BUDGET_KB} KB budget"

if [ "$kb" -gt "$BUDGET_KB" ]; then
  echo "::error::Bundle budget exceeded on ${worst_route}. See ADR-0020."
  echo
  echo "Do not raise the budget. It exists for users on intermittent, metered"
  echo "connections — principle P8. Reduce the route's payload instead:"
  echo "  - dynamic import for anything not needed on first paint"
  echo "  - check whether a dependency was pulled into a client component"
  echo "  - move work to a server component"
  exit 1
fi

echo "Within budget."
