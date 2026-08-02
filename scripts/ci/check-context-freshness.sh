#!/usr/bin/env bash
# STATUS.md and ROADMAP.md are canonical context (PROJECT_CONTEXT.md working rules 2-3).
# Staleness here is a defect: a contributor reading a stale STATUS.md makes decisions
# on a picture of the project that is no longer true.
set -euo pipefail

warn=0
now=$(date +%s)

for f in STATUS.md ROADMAP.md; do
  [ -f "$f" ] || { echo "::error::$f is missing"; exit 1; }
  last=$(git log -1 --format=%ct -- "$f" 2>/dev/null || echo "$now")
  days=$(( (now - last) / 86400 ))
  if [ "$days" -gt 90 ]; then
    echo "::warning file=$f::not updated in $days days — is it still accurate?"
    warn=1
  else
    echo "$f updated $days day(s) ago."
  fi
done

# A warning, not a failure: staleness needs a human judgement, not a blocked merge.
exit 0
