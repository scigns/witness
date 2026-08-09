# Witness web — production image.
#
# Uses Next's standalone output (see next.config.mjs, which explains why that
# is a commitment rather than a preference): the runtime layer is a plain Node
# server with no Next CLI and no build toolchain.
#
# Two values are compiled into the client bundle at build time and therefore
# have to be build arguments rather than runtime environment:
#
#   NEXT_PUBLIC_WITNESS_API_URL   the address the *browser* uses for the API
#   NEXT_PUBLIC_WITNESS_PROFILE   the deployment profile, which decides whether
#                                 the development impersonation header may be
#                                 sent at all
#
# Neither is a secret — `NEXT_PUBLIC_` values are readable by anyone with the
# page open. Never put a credential behind that prefix.
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_WITNESS_API_URL=https://api.pilot.example.org \
#     --build-arg NEXT_PUBLIC_WITNESS_PROFILE=sovereign \
#     -t witness-web .

FROM node:22-bookworm-slim AS build

ARG NEXT_PUBLIC_WITNESS_API_URL
ARG NEXT_PUBLIC_WITNESS_PROFILE=sovereign
ENV NEXT_PUBLIC_WITNESS_API_URL=${NEXT_PUBLIC_WITNESS_API_URL}
ENV NEXT_PUBLIC_WITNESS_PROFILE=${NEXT_PUBLIC_WITNESS_PROFILE}
ENV NEXT_TELEMETRY_DISABLED=1

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @witness/web...

COPY packages/contracts packages/contracts
COPY apps/web apps/web

RUN pnpm --filter @witness/web... run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# Standalone output carries its own minimal node_modules; static assets and
# public files are not included in it and have to be placed alongside.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/signin').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
