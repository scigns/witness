#!/usr/bin/env bash
# No path is unowned. An unowned directory becomes an unowned defect queue.
set -euo pipefail

owners=".github/CODEOWNERS"
[ -f "$owners" ] || { echo "::error::CODEOWNERS is missing"; exit 1; }

grep -qE '^\*\s' "$owners" || { echo "::error::CODEOWNERS has no default (*) rule"; exit 1; }

uncovered=0
for dir in apps packages services workers sdk infrastructure deployments docs architecture agents scripts templates examples .ai .github; do
  [ -d "$dir" ] || continue
  if ! grep -qE "^/?$dir/" "$owners"; then
    echo "::warning::$dir/ has no explicit CODEOWNERS rule (falls back to the default)"
    uncovered=$((uncovered + 1))
  fi
done

echo "CODEOWNERS present with a default rule; $uncovered top-level path(s) rely on the fallback."
exit 0
