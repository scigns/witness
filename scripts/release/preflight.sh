#!/usr/bin/env bash
# Pre-release checklist. Run before tagging.
#
# This does not tag, push or publish anything. It answers one question — "is this
# tree in a state that deserves a version number?" — and reports every failure it
# finds rather than stopping at the first, so a release manager gets one list
# instead of a sequence of surprises.
#
# See docs/engineering/RELEASE_STRATEGY.md.
set -uo pipefail

cd "$(dirname "$0")/../.."

fail=0
warn=0
pass() { echo "  ✓ $1"; }
fatal() { echo "  ✗ $1"; fail=$(( fail + 1 )); }
caution() { echo "  ! $1"; warn=$(( warn + 1 )); }

echo "══ Witness release preflight ═══════════════════════════════════════════"
echo

# ─── 1. Working tree ──────────────────────────────────────────────────────────
echo "── Repository state"
if [ -n "$(git status --porcelain)" ]; then
  fatal "working tree is dirty — commit or stash before releasing"
else
  pass "working tree clean"
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" = "main" ]; then
  pass "on main"
else
  caution "on '$branch', not main — releases are normally cut from main"
fi

if git rev-parse @{u} >/dev/null 2>&1; then
  if [ "$(git rev-parse HEAD)" = "$(git rev-parse @{u})" ]; then
    pass "synchronised with upstream"
  else
    fatal "local branch differs from upstream — push or pull first"
  fi
else
  caution "no upstream tracking branch"
fi

# ─── 2. Version consistency ───────────────────────────────────────────────────
echo
echo "── Version"
version=$(node -p "require('./package.json').version" 2>/dev/null || echo "")
if [ -z "$version" ]; then
  fatal "cannot read version from package.json"
else
  pass "package.json version: $version"

  if grep -q "\[$version\]" CHANGELOG.md 2>/dev/null; then
    pass "CHANGELOG.md has an entry for $version"
  else
    fatal "CHANGELOG.md has no entry for $version"
  fi

  if git rev-parse "v$version" >/dev/null 2>&1; then
    fatal "tag v$version already exists — bump the version first"
  else
    pass "tag v$version is available"
  fi
fi

# ─── 3. Quality gates ─────────────────────────────────────────────────────────
echo
echo "── Quality gates"
run_gate() {
  local label="$1"; shift
  if "$@" >/tmp/witness-preflight.log 2>&1; then
    pass "$label"
  else
    fatal "$label — output: /tmp/witness-preflight.log"
  fi
}

run_gate "documentation links"   bash scripts/ci/check-links.sh
run_gate "document ownership"    bash scripts/ci/check-doc-headers.sh
run_gate "ADR governance"        bash scripts/ci/check-adrs.sh
run_gate "CODEOWNERS coverage"   bash scripts/ci/check-codeowners-coverage.sh
run_gate "configuration syntax"  bash scripts/ci/check-config-syntax.sh
run_gate "action pinning"        bash scripts/security/check-action-pinning.sh
run_gate "licence boundary"      bash scripts/security/check-licenses.sh
run_gate "secret scan"           bash scripts/security/scan-secrets.sh

if [ -f pnpm-lock.yaml ]; then
  run_gate "typecheck"           pnpm -s typecheck
  run_gate "lint"                pnpm -s lint
  run_gate "tests"               pnpm -s test
  run_gate "build"               pnpm -s build
else
  caution "no lockfile — code gates skipped (pre-implementation)"
fi

# ─── 4. Release documentation ─────────────────────────────────────────────────
echo
echo "── Release documentation"
[ -f CHANGELOG.md ] && pass "CHANGELOG.md present" || fatal "CHANGELOG.md missing"
[ -f STATUS.md ]    && pass "STATUS.md present"    || fatal "STATUS.md missing"

status_date=$(grep -m1 '^\*\*Last updated:\*\*' STATUS.md 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || echo "")
if [ -n "$status_date" ]; then
  last_commit_date=$(git log -1 --format=%cs)
  if [ "$status_date" \< "$last_commit_date" ]; then
    caution "STATUS.md last updated $status_date; most recent commit $last_commit_date"
  else
    pass "STATUS.md is current"
  fi
fi

# ─── Result ───────────────────────────────────────────────────────────────────
echo
echo "════════════════════════════════════════════════════════════════════════"
if [ "$fail" -gt 0 ]; then
  echo "NOT READY — $fail blocking issue(s), $warn warning(s)."
  exit 1
fi
if [ "$warn" -gt 0 ]; then
  echo "READY WITH WARNINGS — $warn warning(s). Read them before tagging."
  exit 0
fi
echo "READY — all checks passed."
