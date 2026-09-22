#!/usr/bin/env bash
# Regression check for two real incidents this script exists to catch again:
#
#   1. Constructor-injected NestJS providers resolving to `undefined` at
#      runtime — every route maps, but the first request that touches an
#      injected service throws "Cannot read properties of undefined". This
#      is what happened under the old `tsx watch` dev script: esbuild (what
#      `tsx` uses) does not implement TypeScript's legacy
#      `emitDecoratorMetadata` transform — it cannot, without a real
#      type-checker, resolve a constructor parameter's type to a runtime
#      value across files — so Nest received no `design:paramtypes` at all
#      and quietly constructed providers with zero arguments. `dev` now
#      runs real `tsc` (see package.json), the same compiler `build` always
#      used; this check exists so nobody swaps it back for a
#      faster-looking, esbuild-based watcher without realising why that
#      regresses silently instead of with a clear error.
#   2. `DATABASE_URL` (and everything else in the root `.env`) never
#      reaching the process at all, because nothing in the documented
#      onboarding flow sources it — `prisma generate` quietly worked
#      anyway (its own bundled dotenv support masked the gap) while the
#      actual server failed one step later for a reason that looked
#      unrelated.
#
# This runs the exact `dist/main.js` a real deployment runs, with a
# deliberately CLEAN environment (no exported DATABASE_URL, no manual
# `source .env`) — the same starting condition a fresh contributor's shell
# is in — and proves a DI-dependent endpoint actually answers, not just that
# something bound to the port.
#
# Usage: bash scripts/dev/verify-api-dev-boot.sh
# Requires: the local Postgres container running (`make dev`), migrated.
set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1
API_DIR="services/api-gateway"
PORT="${WITNESS_API_PORT:-3001}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/v1/plans"
LOG_FILE="$(mktemp -t witness-api-boot-smoke.XXXXXX.log)"
TIMEOUT_SECONDS=45

echo "==> Building ${API_DIR} (real tsc — the same compiler production runs)"
if ! (cd "$API_DIR" && pnpm run build >"$LOG_FILE" 2>&1); then
  echo "FAIL: build itself failed. See $LOG_FILE" >&2
  tail -40 "$LOG_FILE" >&2
  exit 1
fi

echo "==> Starting dist/main.js with a clean, known-good environment"
# `env -i` strips everything, so nothing manually exported in *this* shell
# can mask a real env-loading regression. The three variables below are
# exported explicitly — not read from the repo-root `.env` — so this script
# gives the same answer on every machine regardless of what that operator's
# own `.env` happens to contain (an operator's `.env` legitimately carries
# real deployment-shaped values for other purposes; this test must not
# depend on it being development-shaped). `DATABASE_URL` may be overridden
# by the caller (`DATABASE_URL=... bash scripts/dev/verify-api-dev-boot.sh`)
# to target a differently-provisioned local Postgres.
TEST_DATABASE_URL="${DATABASE_URL:-postgresql://witness:change-me-in-every-environment@127.0.0.1:5432/witness?schema=public}"
(
  cd "$API_DIR" || exit 1
  exec env -i PATH="$PATH" HOME="$HOME" \
    DATABASE_URL="$TEST_DATABASE_URL" \
    WITNESS_DEPLOYMENT_PROFILE=development \
    S3_ENDPOINT="" S3_ACCESS_KEY_ID="" S3_SECRET_ACCESS_KEY="" \
    node --enable-source-maps dist/main.js
) >"$LOG_FILE" 2>&1 &
pid=$!

cleanup() {
  kill "$pid" >/dev/null 2>&1 || true
  wait "$pid" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Polling ${HEALTH_URL} (timeout ${TIMEOUT_SECONDS}s)"
deadline=$(( SECONDS + TIMEOUT_SECONDS ))
status=""
while [ "$SECONDS" -lt "$deadline" ]; do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "FAIL: the server process exited before it ever became ready." >&2
    echo "This is exactly the failure mode this script exists to catch — check for:" >&2
    echo "  - 'Cannot read properties of undefined' (decorator-metadata / DI regression)" >&2
    echo "  - 'DATABASE_URL: Required' (root .env stopped being auto-loaded)" >&2
    echo >&2
    tail -60 "$LOG_FILE" >&2
    exit 1
  fi
  status=$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    echo "==> ${HEALTH_URL} answered 200 — a real DI-injected controller resolved and ran."
    echo "PASS"
    exit 0
  fi
  sleep 1
done

echo "FAIL: timed out after ${TIMEOUT_SECONDS}s waiting for a 200 (last status: $status)." >&2
tail -60 "$LOG_FILE" >&2
exit 1
