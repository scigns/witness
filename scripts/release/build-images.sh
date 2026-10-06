#!/usr/bin/env bash
# GitHub-hosted CI only. Build once, validate and retain these exact image bytes.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
SHA="$(git rev-parse HEAD)"
VERSION="$(python3 -c 'import json; print(json.load(open("package.json"))["version"])')"
OUT="${WITNESS_ARTIFACT_DIR:-release-artifacts}"
mkdir -p "$OUT"
API_URL="$(python3 -c 'import json; print(json.load(open("scripts/release/image-build.json"))["web"]["NEXT_PUBLIC_WITNESS_API_URL"])')"
PROFILE="$(python3 -c 'import json; print(json.load(open("scripts/release/image-build.json"))["web"]["NEXT_PUBLIC_WITNESS_PROFILE"])')"
BASE_PATH="$(python3 -c 'import json; print(json.load(open("scripts/release/image-build.json"))["web"]["NEXT_PUBLIC_WITNESS_BASE_PATH"])')"
docker build --platform linux/amd64 --build-arg WITNESS_BUILD_ID="$SHA" --build-arg WITNESS_VERSION="$VERSION" \
  -f services/api-gateway/Dockerfile -t "witness-artifact-api:$SHA" .
docker build --platform linux/amd64 --build-arg WITNESS_BUILD_ID="$SHA" --build-arg WITNESS_VERSION="$VERSION" \
  --build-arg NEXT_PUBLIC_WITNESS_API_URL="$API_URL" --build-arg NEXT_PUBLIC_WITNESS_PROFILE="$PROFILE" \
  --build-arg NEXT_PUBLIC_WITNESS_BASE_PATH="$BASE_PATH" -f apps/web/Dockerfile -t "witness-artifact-web:$SHA" .
python3 scripts/release/artifacts.py create "$OUT/build-manifest.json"
# Prove installed migration CLI/engine works offline: no Corepack/download fallback.
docker run --rm --network none --entrypoint node "witness-artifact-api:$SHA" node_modules/prisma/build/index.js --version
# Start the exact standalone web image without any route to production.
WEB_CONTAINER="$(docker run -d --network none "witness-artifact-web:$SHA")"
trap 'docker rm -f "$WEB_CONTAINER" >/dev/null' EXIT
for attempt in {1..30}; do
  # shellcheck disable=SC2016 # Container evaluates its own healthcheck base path.
  if docker exec "$WEB_CONTAINER" node -e 'fetch("http://127.0.0.1:3000"+process.env.WITNESS_HEALTHCHECK_PATH.replace(/\/signin$/, "")+"/api/build-identity").then(async r=>{const b=await r.json();if(b.buildId!==process.argv[1])process.exit(1)}).catch(()=>process.exit(1))' "$SHA"; then
    break
  fi
  [[ "$attempt" != 30 ]] || exit 1
  sleep 2
done
docker save "witness-artifact-api:$SHA" "witness-artifact-web:$SHA" | gzip > "$OUT/images.tar.gz"
(cd "$OUT" && sha256sum images.tar.gz build-manifest.json > SHA256SUMS)
