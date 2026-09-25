#!/usr/bin/env bash
# `make doctor` — a fast, read-only health check.
#
# Exists because a multi-hour local session can fail two minutes from the end
# with "no space left on device" and no earlier warning at all. This script's
# whole job is to say that out loud *before* a long operation starts, not
# diagnose it after. It changes nothing on disk; every check is a read.
#
# Thresholds are calibrated against measured Witness usage, not guessed:
# a single `pnpm install` in a fresh worktree is ~0 marginal disk (the pnpm
# store is content-addressed and shared), but `next build` cache, a Postgres
# migration, and pulling one more Docker image comfortably want a few hundred
# MB each, and a `dev-full` Docker Compose pull (Postgres + Neo4j + OpenSearch
# + Keycloak + MinIO + NATS + Ollama images) can be several GB in one shot.
set -uo pipefail

WARN_DISK_KB=$((5 * 1024 * 1024))   # 5 GiB — comfortable headroom for one more dev-full pull
STOP_DISK_KB=$((2 * 1024 * 1024))   # 2 GiB — below this, Docker/pnpm operations have failed outright in practice

status_ok=0
status_warn=1
status_fail=2
worst=$status_ok

report() {
  local level="$1" msg="$2"
  case "$level" in
    ok)   echo "  ok       $msg" ;;
    warn) echo "  WARNING  $msg"; [ "$worst" -lt "$status_warn" ] && worst=$status_warn ;;
    fail) echo "  FAIL     $msg"; worst=$status_fail ;;
  esac
}

echo "Witness environment check"
echo "=========================="

# ─── Disk ──────────────────────────────────────────────────────────────────
echo
echo "Disk"
avail_kb=$(df -Pk . | awk 'NR==2 {print $4}')
avail_human=$(df -Ph . | awk 'NR==2 {print $4}')
if [ "$avail_kb" -lt "$STOP_DISK_KB" ]; then
  report fail "only ${avail_human} free — Docker pulls, pnpm installs and Next builds have failed outright below this. Free space before starting anything heavy."
elif [ "$avail_kb" -lt "$WARN_DISK_KB" ]; then
  report warn "${avail_human} free — enough for normal work, but not for another dev-full Docker pull. Consider 'make disk-usage'."
else
  report ok "${avail_human} free"
fi

# ─── Toolchain ─────────────────────────────────────────────────────────────
echo
echo "Toolchain"
if command -v node >/dev/null 2>&1; then
  node_major=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
  if [ "$node_major" -ge 22 ]; then
    report ok "node $(node -v)"
  else
    report warn "node $(node -v) — Witness targets Node 22 LTS (see .nvmrc)"
  fi
else
  report fail "node not found"
fi

if command -v pnpm >/dev/null 2>&1; then
  report ok "pnpm $(pnpm -v)"
else
  report fail "pnpm not found — run: corepack enable"
fi

if command -v git >/dev/null 2>&1; then
  report ok "git $(git --version | awk '{print $3}')"
else
  report fail "git not found"
fi

# ─── Codespaces / remote detection ─────────────────────────────────────────
echo
echo "Environment"
if [ -n "${CODESPACES:-}" ]; then
  report ok "running inside a GitHub Codespace (${CODESPACE_NAME:-unknown name})"
elif [ -n "${REMOTE_CONTAINERS:-}" ] || [ -n "${DEVCONTAINER:-}" ]; then
  report ok "running inside a dev container"
else
  report ok "running on a local machine"
fi

# ─── .env ───────────────────────────────────────────────────────────────────
echo
echo "Configuration"
if [ -f .env ]; then
  report ok ".env present"
  # shellcheck disable=SC1091
  set -a; source .env; set +a
  if [ -n "${POSTGRES_PASSWORD:-}" ]; then
    report ok "\$POSTGRES_PASSWORD is set"
  else
    report warn "\$POSTGRES_PASSWORD is not set — see .env.example"
  fi
else
  report warn ".env missing — run: make bootstrap (or cp .env.example .env)"
fi

# ─── Docker (only evaluated if present — dev-lite does not require it) ────
echo
echo "Docker (only required for dev-integration / dev-full / dev-obs)"
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    report ok "Docker daemon reachable"
  else
    report warn "Docker CLI found but the daemon is not reachable — fine for dev-lite (Postgres-only) work, but 'make dev-integration'/'make dev-full' need it running"
  fi
else
  report warn "Docker not installed — fine for dev-lite; required for dev-integration/dev-full"
fi

# ─── Postgres reachability ──────────────────────────────────────────────────
echo
echo "Postgres"
pg_host="${POSTGRES_HOST:-localhost}"
pg_port="${POSTGRES_PORT:-5432}"
if command -v pg_isready >/dev/null 2>&1; then
  if pg_isready -h "$pg_host" -p "$pg_port" >/dev/null 2>&1; then
    report ok "reachable at ${pg_host}:${pg_port}"
  else
    report warn "not reachable at ${pg_host}:${pg_port} — run: make dev"
  fi
elif (exec 3<>"/dev/tcp/${pg_host}/${pg_port}") 2>/dev/null; then
  exec 3>&- 3<&-
  report ok "port ${pg_host}:${pg_port} open (pg_isready not installed — TCP check only)"
else
  report warn "not reachable at ${pg_host}:${pg_port} — run: make dev"
fi

# ─── Port conflicts ─────────────────────────────────────────────────────────
echo
echo "Ports"
check_port() {
  local port="$1" label="$2"
  if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
    exec 3>&- 3<&-
    report ok "$label ($port) is in use — expected if its service is already running"
  else
    report ok "$label ($port) is free"
  fi
}
check_port "${WITNESS_WEB_PORT:-3000}" "web"
check_port "${WITNESS_API_PORT:-3001}" "api"
check_port "${POSTGRES_PORT:-5432}" "postgres"

echo
echo "=========================="
case "$worst" in
  "$status_ok")   echo "All checks passed." ;;
  "$status_warn") echo "Some warnings above — review before starting a long operation." ;;
  "$status_fail") echo "At least one check failed — fix before continuing." ;;
esac
exit "$worst"
