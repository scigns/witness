#!/usr/bin/env bash
# Read-only inspection of what Witness's own Docker resources and worktrees
# are using, plus the exact commands to remove each one safely — never an
# automatic prune of anything not clearly owned by this project.
#
# Deliberately does NOT call `docker system prune`, `docker volume prune`, or
# any other blanket command: those affect every project on the machine, not
# just Witness, and this repository does not get to decide that trade-off for
# a developer's other work.
set -uo pipefail

echo "Witness disk usage"
echo "==================="

echo
echo "This checkout"
du -sh . 2>/dev/null | awk '{print "  " $1 "\t" $2}'
for dir in node_modules apps/*/node_modules apps/*/.next services/*/node_modules packages/*/node_modules .turbo; do
  # shellcheck disable=SC2086
  for match in $dir; do
    [ -d "$match" ] || continue
    size=$(du -sh "$match" 2>/dev/null | cut -f1)
    printf '  %s\t%s\n' "$size" "$match"
  done
done

if command -v git >/dev/null 2>&1; then
  echo
  echo "Git worktrees for this repository"
  git worktree list 2>/dev/null | while read -r line; do echo "  $line"; done
  echo "  Remove one you no longer need with:"
  echo "    git worktree remove <path>"
fi

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo
  echo "Docker is not running — skipping Docker resource inspection."
  exit 0
fi

echo
echo "Docker — overall (every project on this machine, not just Witness)"
docker system df 2>/dev/null | sed 's/^/  /'

echo
echo "Docker — Witness-owned resources only"
echo "  Containers (project=witness, from infrastructure/docker/docker-compose.yml):"
docker ps -a --filter "label=com.docker.compose.project=witness" \
  --format '    {{.Names}}\t{{.Status}}\t{{.Size}}' 2>/dev/null

echo "  Volumes (project=witness):"
docker volume ls --filter "label=com.docker.compose.project=witness" --format '    {{.Name}}' 2>/dev/null

echo
echo "Safe cleanup, scoped to Witness only:"
echo "  Stop the stack, keep data:        make down"
echo "  Stop the stack, delete its data:  make clean   (asks for confirmation, 5s to abort)"
echo "  Remove one stale worktree:        git worktree remove <path>"
echo "  Remove one unused image:          docker image rm <image-id>   (find with: docker images)"
echo
echo "Deliberately not offered here: 'docker system prune' / 'docker volume prune' — those"
echo "affect every project on this machine, not just Witness's."
