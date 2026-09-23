# Witness graph-projector — production image.
#
# The only process that writes to Neo4j (ADR-0011). Deliberately not a
# NestJS app (see src/config.ts's doc comment) and has zero workspace
# dependencies (package.json: only `neo4j-driver` and `pg`) — so unlike
# services/api-gateway/Dockerfile, there is no monorepo package graph to
# stage here, only this one workspace package.
#
#   docker build -f workers/graph-projector/Dockerfile -t witness-graph-projector .

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY workers/graph-projector/package.json workers/graph-projector/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @witness/graph-projector...

COPY workers/graph-projector workers/graph-projector

RUN pnpm --filter @witness/graph-projector... run build

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @witness/graph-projector...

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /repo

COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/workers/graph-projector ./workers/graph-projector

# Never root.
USER node

# No HTTP surface (main.ts is a poll loop, not a server) — liveness is
# "the process is still running", which Docker's own container-state
# already answers; a HEALTHCHECK here would just be reimplementing that.

WORKDIR /repo/workers/graph-projector
CMD ["node", "dist/main.js"]
