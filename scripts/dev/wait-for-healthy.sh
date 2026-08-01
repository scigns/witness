#!/usr/bin/env bash
# Block until every container in the Witness stack reports healthy.
#
# Why this exists: `docker compose up -d` returns as soon as containers are
# *started*, not when they are *usable*. Running migrations against a Postgres
# that is still initialising produces a confusing failure that looks like a bug
# in the migration. This script closes that gap so `make dev` means what a new
# contributor assumes it means.
#
# Containers without a healthcheck are reported as "no healthcheck" rather than
# silently assumed good — an unverifiable claim is worse than an absent one.
set -uo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infrastructure/docker/docker-compose.yml}"
TIMEOUT_SECONDS="${WAIT_TIMEOUT:-300}"
POLL_SECONDS=3

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker and try again." >&2
  exit 1
fi

mapfile -t containers < <(compose ps -q 2>/dev/null)
if [ "${#containers[@]}" -eq 0 ]; then
  echo "No containers are running for this stack." >&2
  echo "Start it first:  make dev" >&2
  exit 1
fi

echo "Waiting for ${#containers[@]} container(s) to become healthy (timeout ${TIMEOUT_SECONDS}s)..."

deadline=$(( SECONDS + TIMEOUT_SECONDS ))
declare -A announced=()

while true; do
  pending=0
  failed=0
  summary=""

  for cid in "${containers[@]}"; do
    name=$(docker inspect --format '{{.Name}}' "$cid" 2>/dev/null | sed 's|^/||')
    [ -z "$name" ] && continue

    state=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null || echo unknown)
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo none)

    case "$state:$health" in
      running:healthy)
        if [ -z "${announced[$name]:-}" ]; then
          echo "  ✓ $name healthy"
          announced[$name]=1
        fi
        ;;
      running:none)
        if [ -z "${announced[$name]:-}" ]; then
          echo "  • $name running (no healthcheck defined — not verified)"
          announced[$name]=1
        fi
        ;;
      running:starting)
        pending=$(( pending + 1 ))
        summary+=" $name(starting)"
        ;;
      running:unhealthy)
        failed=$(( failed + 1 ))
        summary+=" $name(UNHEALTHY)"
        ;;
      *)
        failed=$(( failed + 1 ))
        summary+=" $name($state)"
        ;;
    esac
  done

  if [ "$pending" -eq 0 ] && [ "$failed" -eq 0 ]; then
    echo
    echo "Stack is ready."
    exit 0
  fi

  if [ "$SECONDS" -ge "$deadline" ]; then
    echo >&2
    echo "Timed out after ${TIMEOUT_SECONDS}s. Still not ready:${summary}" >&2
    echo >&2
    echo "Inspect with:" >&2
    echo "  docker compose -f $COMPOSE_FILE ps" >&2
    echo "  docker compose -f $COMPOSE_FILE logs --tail=50" >&2
    echo >&2
    echo "Most common cause: a required password is unset in .env — several services" >&2
    echo "refuse to start without one, deliberately. See .env.example." >&2
    exit 1
  fi

  # Unhealthy is not necessarily terminal; a service can recover during startup.
  # Keep polling until the deadline rather than failing on the first bad reading.
  sleep "$POLL_SECONDS"
done
