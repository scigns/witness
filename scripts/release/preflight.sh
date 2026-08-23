#!/usr/bin/env bash
# Pre-release deterministic local checks. Run before tagging.
#
# This does not tag, push or publish anything.
#
# It verifies only controls that can be established locally and deterministically.
# It does not, by itself, prove deployment success, GitHub CI status, human
# approval, migration or recovery drills, SBOM/signing, provenance attestation,
# offline-bundle verification, or LTS backport completion.
#
# See docs/engineering/RELEASE_STRATEGY.md.

set -uo pipefail

cd "$(dirname "$0")/../.."

fail=0
warn=0

pass() {
  echo "  ✓ $1"
}

fatal() {
  echo "  ✗ $1"
  fail=$((fail + 1))
}

caution() {
  echo "  ! $1"
  warn=$((warn + 1))
}

version=$(node -p "require('./package.json').version" 2>/dev/null || echo "")

if [ -n "${RELEASE_CLASS:-}" ]; then
  release_class="$RELEASE_CLASS"
elif [[ "$version" == 0.* ]]; then
  release_class="institutional-pilot"
else
  release_class="stable"
fi

case "$release_class" in
  institutional-pilot|stable|lts|patch|hotfix)
    ;;
  *)
    echo "Unknown RELEASE_CLASS '$release_class'."
    echo "Expected one of:"
    echo "  institutional-pilot"
    echo "  stable"
    echo "  lts"
    echo "  patch"
    echo "  hotfix"
    exit 1
    ;;
esac

echo "══ Witness release preflight ═══════════════════════════════════════════"
echo "Release class: $release_class"
echo

# ─── 1. Repository state ──────────────────────────────────────────────────────

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

if git rev-parse '@{u}' >/dev/null 2>&1; then
  if [ "$(git rev-parse HEAD)" = "$(git rev-parse '@{u}')" ]; then
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

if [ "$release_class" = "institutional-pilot" ]; then
  if [[ "$version" == 0.* ]]; then
    pass "pre-1.0 version is compatible with Institutional Pilot class"
  else
    caution "Institutional Pilot selected for non-0.x version $version"
  fi
fi

# ─── 3. Quality gates ─────────────────────────────────────────────────────────

echo
echo "── Quality gates"

run_gate() {
  local label="$1"
  shift

  if "$@" >/tmp/witness-preflight.log 2>&1; then
    pass "$label"
  else
    fatal "$label — output: /tmp/witness-preflight.log"
  fi
}

run_gate "documentation links" \
  bash scripts/ci/check-links.sh

run_gate "document ownership" \
  bash scripts/ci/check-doc-headers.sh

run_gate "ADR governance" \
  bash scripts/ci/check-adrs.sh

run_gate "CODEOWNERS coverage" \
  bash scripts/ci/check-codeowners-coverage.sh

run_gate "configuration syntax" \
  bash scripts/ci/check-config-syntax.sh

run_gate "action pinning" \
  bash scripts/security/check-action-pinning.sh

run_gate "licence boundary" \
  bash scripts/security/check-licenses.sh

run_gate "secret scan" \
  bash scripts/security/scan-secrets.sh

if [ -f pnpm-lock.yaml ]; then
  run_gate "typecheck" pnpm -s typecheck
  run_gate "lint" pnpm -s lint
  run_gate "tests" pnpm -s test
  run_gate "build" pnpm -s build
else
  caution "no lockfile — code gates skipped"
fi

# ─── 4. Release documentation ─────────────────────────────────────────────────

echo
echo "── Release documentation"

[ -f CHANGELOG.md ] \
  && pass "CHANGELOG.md present" \
  || fatal "CHANGELOG.md missing"

[ -f STATUS.md ] \
  && pass "STATUS.md present" \
  || fatal "STATUS.md missing"

[ -f ROADMAP.md ] \
  && pass "ROADMAP.md present" \
  || fatal "ROADMAP.md missing"

[ -f docs/engineering/RELEASE_STRATEGY.md ] \
  && pass "release strategy present" \
  || fatal "release strategy missing"

if [ "$release_class" = "institutional-pilot" ]; then
  [ -f docs/operations/PILOT_1_READINESS.md ] \
    && pass "pilot readiness decision present" \
    || fatal "docs/operations/PILOT_1_READINESS.md missing"
fi

status_date=$(
  grep -m1 '^\*\*Last updated:\*\*' STATUS.md 2>/dev/null \
    | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' \
    || echo ""
)

if [ -n "$status_date" ]; then
  last_commit_date=$(git log -1 --format=%cs)

  if [ "$status_date" \< "$last_commit_date" ]; then
    caution "STATUS.md last updated $status_date; most recent commit $last_commit_date"
  else
    pass "STATUS.md is current"
  fi
fi

# ─── 5. Release-class scope ───────────────────────────────────────────────────

echo
echo "── Release-class scope"

case "$release_class" in
  institutional-pilot)
    echo "  Institutional Pilot is a controlled pre-1.0 evaluation release."
    echo "  This script does not authorise sensitive institutional data."
    echo "  Deployment-specific PILOT_1_READINESS remains authoritative."
    ;;

  stable)
    echo "  Stable release selected."
    caution "Stable compliance requires additional migration, recovery, supply-chain and deployment evidence not proven by this script"
    ;;

  lts)
    echo "  LTS release selected."
    caution "LTS compliance requires all Stable evidence plus LTS upgrade, backport and support evidence"
    ;;

  patch|hotfix)
    echo "  $release_class release selected."
    caution "Patch/hotfix compliance inherits the requirements of its target release line"
    ;;
esac

# ─── Result ───────────────────────────────────────────────────────────────────

echo
echo "════════════════════════════════════════════════════════════════════════"

if [ "$fail" -gt 0 ]; then
  echo "NOT READY — $fail blocking issue(s), $warn warning(s)."
  exit 1
fi

if [ "$warn" -gt 0 ]; then
  echo "READY WITH WARNINGS — $warn warning(s)."
  echo "This result applies only to the checks explicitly reported above."
  exit 0
fi

echo "READY — deterministic local checks passed for release class '$release_class'."
echo "Release Manager go/no-go and required external evidence remain separate."
