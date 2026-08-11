# Witness API — production image.
#
# Multi-stage so the runtime layer carries the compiled output, the generated
# Prisma client and production dependencies, and nothing else: no source, no
# toolchain, no test fixtures.
#
# Built from the repository root, because this is a pnpm workspace and the API
# depends on three local packages:
#
#   docker build -f services/api-gateway/Dockerfile -t witness-api .

# ── Local speech-to-text (Phase 3, ADR-0009) ────────────────────────────────
# Compiled and its model downloaded once, here, at build time — the only
# network access this capability ever needs. The runtime stage below copies
# just the binary and the model file; at request time, transcription is a
# local subprocess with no network access at all, which is what lets it run
# in the `sovereign` profile.
FROM node:22-bookworm-slim AS whisper

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential cmake git curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /whisper

# Pinned tag — a moving `master` would make this image's build nondeterministic.
RUN git clone --depth 1 --branch v1.7.4 https://github.com/ggerganov/whisper.cpp.git .
# GGML_NATIVE=OFF: ggml's CPU-feature auto-detection composes an -mcpu value
# (e.g. `native+nodotprod+noi8mm+nosve`) that this GCC on aarch64 rejects.
# Building for a generic target is the portable, cross-host-reproducible
# choice anyway — this image is not compiled separately per deployment
# machine.
# BUILD_SHARED_LIBS=OFF: a shared-library build leaves `whisper-cli` needing
# libwhisper.so/libggml*.so at runtime, which the slim runtime stage below
# does not have — copying just the CLI binary is the whole point of this
# multi-stage build. Static linking means the one binary is self-contained.
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DBUILD_SHARED_LIBS=OFF \
 && cmake --build build --config Release -j"$(nproc)"

# Multilingual "base" — CPU-fast enough for a single-laptop pilot, and
# meaningfully more accurate than "tiny". `WITNESS_WHISPER_MODEL` in
# local-whisper.adapter.ts must agree with whichever name is downloaded here.
RUN bash ./models/download-ggml-model.sh base

FROM node:22-bookworm-slim AS build

# Without this, `prisma generate` can't detect the build stage's real OpenSSL
# version, silently assumes 1.1.x, and generates a query engine the runtime
# stage's actual 3.0.x can't load — a startup crash, not a build failure.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable

WORKDIR /repo

# Manifests first, so a dependency install is cached until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
# packages/policy is Casbin config (model.conf, policy.csv), not a pnpm
# workspace package — it has no package.json. It still reaches the image via
# the full `COPY packages packages` below.
COPY services/api-gateway/package.json services/api-gateway/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @witness/api...

COPY packages packages
COPY services/api-gateway services/api-gateway

RUN pnpm --filter @witness/api... run build

# Prune to production dependencies before copying into the runtime stage.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @witness/api...

FROM node:22-bookworm-slim AS runtime

# `prisma migrate deploy` runs from this image during a controlled deployment,
# and pg_isready is what the healthcheck and the runbook use. `ffmpeg` is
# `LocalWhisperAdapter`'s only way to turn whatever format a browser recorded
# into the 16kHz mono PCM WAV whisper.cpp requires — a local binary, no
# network access, same category as `postgresql-client`.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl postgresql-client ca-certificates ffmpeg \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable

WORKDIR /repo

# --chown so `node` — not root — owns everything below: `prisma migrate deploy`
# and the bootstrap script both run `prisma generate` again via `docker compose
# run`, which needs to rewrite the generated client in place.
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/package.json ./package.json
COPY --from=build --chown=node:node /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/services/api-gateway ./services/api-gateway

COPY --from=whisper --chown=node:node /whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper --chown=node:node /whisper/models/ggml-base.bin /opt/whisper/ggml-base.bin

# Never root. A compromised process should not be able to rewrite its own image.
USER node

EXPOSE 3001

# Liveness only — it never touches the database, so a database blip does not
# cause an orchestrator to restart an application that is working. See
# src/health/health.controller.ts.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.WITNESS_API_PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /repo/services/api-gateway
CMD ["node", "dist/main.js"]
