#!/usr/bin/env bash
# Fail with a clear message, not a stack trace. A contributor blocked on their
# first morning by an unhelpful error is a contributor we may not see again.
set -uo pipefail

fail=0
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "  MISSING  $1 — $2"
    fail=1
  else
    echo "  ok       $1 ($(command -v "$1"))"
  fi
}

echo "Checking prerequisites (see docs/engineering/DEVELOPER_GUIDE.md)"
need node   "install Node 22 LTS — see .nvmrc"
need pnpm   "run: corepack enable"
need docker "install Docker 24+ with Compose v2"
need git    "install git 2.40+"

if command -v node >/dev/null 2>&1; then
  major=$(node -p "process.versions.node.split('.')[0]")
  if [ "$major" -lt 22 ]; then
    echo "  WARNING  Node $major detected; Witness targets Node 22 LTS."
  fi
fi

if command -v docker >/dev/null 2>&1; then
  mem=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)
  if [ "$mem" -gt 0 ] && [ "$mem" -lt 8000000000 ]; then
    echo "  WARNING  Docker has less than 8 GB of memory. Keycloak and OpenSearch will struggle."
  fi
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "Prerequisites missing. If these instructions did not work for you,"
  echo "that is a defect in our tooling — please open a type:bug issue."
  exit 1
fi
echo "All prerequisites present."
