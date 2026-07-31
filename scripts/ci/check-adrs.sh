#!/usr/bin/env bash
# ADR governance (docs/engineering/ADR_PROCESS.md):
#   - status is one of the permitted values
#   - the Negative consequences section is not left as the template placeholder,
#     because an ADR with no costs is advocacy wearing the costume of a decision
#   - the ADR appears in the index
set -euo pipefail

dir="architecture/decisions"
index="$dir/README.md"
fail=0

for adr in "$dir"/ADR-*.md; do
  [ -e "$adr" ] || continue
  base=$(basename "$adr")

  if ! grep -qE '^\| \*\*Status\*\* \| (Proposed|Accepted|Rejected|Deprecated|Superseded)' "$adr"; then
    echo "::error file=$adr::missing or invalid Status"
    fail=1
  fi

  if ! grep -qiE '^### Negative' "$adr"; then
    echo "::error file=$adr::missing 'Negative' consequences section"
    fail=1
  elif grep -qi 'This section must not be empty' "$adr"; then
    echo "::error file=$adr::Negative section still contains the template placeholder"
    fail=1
  fi

  num=$(echo "$base" | grep -oE '[0-9]{4}' | head -1)
  if ! grep -q "ADR-$num" "$index"; then
    echo "::error file=$index::ADR-$num is not listed in the index"
    fail=1
  fi
done

[ "$fail" -eq 0 ] && echo "ADR governance checks passed."
exit "$fail"
