#!/usr/bin/env bash
# Branch naming per docs/engineering/BRANCH_STRATEGY.md:
#   <type>/<domain>/<issue>-<slug>
set -euo pipefail

branch="${1:-}"
[ -z "$branch" ] && { echo "No branch name supplied; skipping."; exit 0; }

# Long-lived branches and release/hotfix lines are exempt.
exempt='^(main|develop|architecture|product|research|ux-design|frontend|backend|workers|authentication|knowledge-graph|ai-platform|meeting-capture|search|document-processing|integrations|security|governance|database|storage|infrastructure|deployment|observability|testing|performance|documentation|release)$'
if echo "$branch" | grep -qE "$exempt"; then
  echo "Long-lived branch '$branch' — exempt."; exit 0
fi
if echo "$branch" | grep -qE '^(release/|hotfix/|experiments/|claude/|dependabot/|renovate/)'; then
  echo "Branch '$branch' — exempt prefix."; exit 0
fi

if echo "$branch" | grep -qE '^(feat|fix|docs|refactor|test|perf|chore|spike)/[a-z0-9-]+/[0-9]+-[a-z0-9-]+$'; then
  echo "Branch name '$branch' is valid."
else
  echo "::warning::Branch '$branch' does not match <type>/<domain>/<issue>-<slug>."
  echo "See docs/engineering/BRANCH_STRATEGY.md. Not blocking."
fi
exit 0
