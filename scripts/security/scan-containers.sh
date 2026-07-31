#!/usr/bin/env bash
set -euo pipefail
if ! command -v trivy >/dev/null 2>&1; then
  echo "trivy not installed — skipping container scan. See docs/engineering/SECURITY_REVIEW.md."
  exit 0
fi
images=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -i witness || true)
[ -z "$images" ] && { echo "No Witness images built locally."; exit 0; }
for img in $images; do
  echo "== $img =="
  trivy image --severity HIGH,CRITICAL --exit-code 1 "$img"
done
