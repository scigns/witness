#!/usr/bin/env bash
# Every substantive document declares an owner, so no documentation is orphaned.
# See docs/engineering/DOCUMENTATION_STRATEGY.md.
set -euo pipefail

exempt='README.md|CHANGELOG.md|LICENSE|CODE_OF_CONDUCT.md|_template.md|ADR-TEMPLATE.md'
missing=0

for file in $(find docs architecture -name '*.md' 2>/dev/null | grep -Ev "$exempt" || true); do
  if ! head -20 "$file" | grep -qiE "\*\*(Owner|Deciders|Status)"; then
    echo "::error file=$file::missing document header (Owner / Status)"
    missing=$((missing + 1))
  fi
done

if [ "$missing" -gt 0 ]; then
  echo "$missing document(s) without an owner."
  exit 1
fi
echo "All documents declare an owner."
