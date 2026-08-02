#!/usr/bin/env bash
# Domain branches are integration lanes, not forks (ADR-0015).
# Warn beyond 50 commits behind develop; fail beyond 200.
set -euo pipefail

base="origin/develop"
git rev-parse --verify "$base" >/dev/null 2>&1 || { echo "No develop branch yet; nothing to check."; exit 0; }

domains="architecture product research ux-design frontend backend workers authentication knowledge-graph ai-platform meeting-capture search document-processing integrations security governance database storage infrastructure deployment observability testing performance documentation release"
fail=0

for d in $domains; do
  git rev-parse --verify "origin/$d" >/dev/null 2>&1 || continue
  behind=$(git rev-list --count "origin/$d..$base")
  if [ "$behind" -gt 200 ]; then
    echo "::error::Branch '$d' is $behind commits behind develop — resync required."
    fail=1
  elif [ "$behind" -gt 50 ]; then
    echo "::warning::Branch '$d' is $behind commits behind develop."
  else
    echo "$d: $behind behind."
  fi
done
exit "$fail"
