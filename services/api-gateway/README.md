# API Gateway

**Owner:** Backend Lead
**Status:** Phase 3

Edge service: GraphQL backend-for-frontend plus the versioned REST API.

**REST is the stable public contract** (`/api/v1`); **GraphQL is a BFF** and evolves with our own
applications ([ADR-0006](../../architecture/decisions/ADR-0006-api-strategy.md)).

Every endpoint declares its authorisation requirement — one without it fails a fitness test.

## Local development

```bash
pnpm dev
```

runs real `tsc -b --watch` (incremental) alongside `node --watch dist/main.js` — a file change
triggers a fast incremental recompile, then Node restarts the process automatically. This is
deliberately **not** `tsx watch` or any other esbuild-based runner: esbuild does not implement
TypeScript's `emitDecoratorMetadata` transform (it has no cross-file type-checker to resolve a
constructor parameter's type to a runtime value), so NestJS's implicit type-based dependency
injection silently receives no `design:paramtypes` and constructs every provider with zero
arguments — every route still maps, but the first request that touches an injected service throws
"Cannot read properties of undefined". If `pnpm dev` ever needs to change tooling again, whatever
replaces it must go through real `tsc` (or another tool that genuinely implements decorator
metadata, e.g. `@swc/core` with `keepClassNames`/decorator support enabled and verified) — not
esbuild. `bash scripts/dev/verify-api-dev-boot.sh` (run from the repo root) is the regression check
for this class of failure: it builds, boots `dist/main.js` from a deliberately clean environment,
and confirms a DI-dependent endpoint actually answers.

`DATABASE_URL` and everything else needed to boot is read automatically from the repo root's
`.env` (`src/infrastructure/load-root-env.ts`, gap-filling only — a real deployment's own
platform-set environment variables always win). Nothing needs to be manually exported or sourced
first.
