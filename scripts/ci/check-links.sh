#!/usr/bin/env bash
# Verify every relative markdown link resolves.
#
# A broken link in operator documentation is a real failure: the operator is often
# air-gapped and cannot search for the page we forgot to write.
set -uo pipefail

failures=0

while IFS= read -r file; do
  dir=$(dirname "$file")
  targets=$(grep -oE '\]\([^)#][^)]*\)' "$file" 2>/dev/null | sed -E 's/^\]\(//; s/\)$//' || true)
  [ -z "$targets" ] && continue

  while IFS= read -r target; do
    [ -z "$target" ] && continue
    case "$target" in
      http://*|https://*|mailto:*|'#'*) continue ;;
    esac
    clean="${target%%#*}"
    [ -z "$clean" ] && continue
    if [ ! -e "$dir/$clean" ]; then
      echo "::error file=$file::broken link -> $clean"
      failures=$((failures + 1))
    fi
  done <<< "$targets"
done < <(find . -name '*.md' -not -path './node_modules/*' -not -path './.git/*')

if [ "$failures" -gt 0 ]; then
  echo
  echo "$failures broken internal link(s)."
  exit 1
fi
echo "All internal links resolve."
