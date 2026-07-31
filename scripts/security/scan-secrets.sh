#!/usr/bin/env bash
# Local secret scan. CI runs gitleaks across full history; this is the fast
# pre-push equivalent.
set -euo pipefail

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --no-banner --redact
else
  echo "gitleaks not installed — falling back to a coarse pattern scan."
  patterns='(api[_-]?key|secret|password|token|BEGIN [A-Z ]*PRIVATE KEY)[[:space:]]*[=:][[:space:]]*["'"'"'][^"'"'"']{12,}'
  if git grep -InE "$patterns" -- ':!*.example' ':!docs/**' ':!*.md' 2>/dev/null; then
    echo "::error::Possible secret found. Review the matches above."
    exit 1
  fi
  echo "No obvious secrets found. Install gitleaks for a real scan."
fi
