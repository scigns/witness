# Witness marketing — portable preview/production image.
#
# This image is intentionally separate from apps/web. It contains only the
# standalone marketing server and static assets, with no product, API, auth or
# database services. Cloudflare may front this origin when an approved preview
# project or future production route exists.

FROM node:22-bookworm-slim AS build

ARG WITNESS_MARKETING_SITE_URL=http://localhost:3002
ARG WITNESS_MARKETING_ENV=preview
ARG WITNESS_MARKETING_INDEXABLE=false
ENV WITNESS_MARKETING_SITE_URL=${WITNESS_MARKETING_SITE_URL}
ENV WITNESS_MARKETING_ENV=${WITNESS_MARKETING_ENV}
ENV WITNESS_MARKETING_INDEXABLE=${WITNESS_MARKETING_INDEXABLE}
ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/marketing/package.json apps/marketing/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @witness/marketing...

COPY apps/marketing apps/marketing

RUN pnpm --filter @witness/marketing build

FROM node:22-bookworm-slim AS runtime

ARG WITNESS_MARKETING_SITE_URL=http://localhost:3002
ARG WITNESS_MARKETING_ENV=preview
ARG WITNESS_MARKETING_INDEXABLE=false
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV WITNESS_MARKETING_SITE_URL=${WITNESS_MARKETING_SITE_URL}
ENV WITNESS_MARKETING_ENV=${WITNESS_MARKETING_ENV}
ENV WITNESS_MARKETING_INDEXABLE=${WITNESS_MARKETING_INDEXABLE}

WORKDIR /app

COPY --from=build /repo/apps/marketing/.next/standalone ./
COPY --from=build /repo/apps/marketing/.next/static ./apps/marketing/.next/static
COPY --from=build /repo/apps/marketing/public ./apps/marketing/public

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/marketing/server.js"]
