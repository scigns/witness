#!/usr/bin/env bash
# GitHub Actions must be pinned to a commit SHA, not a tag.
# A tag is mutable; a compromised upstream action with write access to our
# release pipeline is one of the highest-impact supply chain risks we carry.
set -euo pipefail

fail=0
for wf in .github/workflows/*.yml .github/workflows/*.yaml; do
  [ -e "$wf" ] || continue
  while IFS= read -r line; do
    ref=$(echo "$line" | sed -E 's/.*uses:[[:space:]]*//; s/[[:space:]]*#.*//')
    case "$ref" in
      ./*|docker://*) continue ;;
    esac
    sha=$(echo "$ref" | sed -E 's/.*@//')
    if ! echo "$sha" | grep -qE '^[0-9a-f]{40}$'; then
      echo "::error file=$wf::action not pinned to a commit SHA -> $ref"
      fail=1
    fi
  done < <(grep -E '^\s*-?\s*uses:' "$wf" || true)
done

[ "$fail" -eq 0 ] && echo "All actions are pinned to commit SHAs."
exit "$fail"
