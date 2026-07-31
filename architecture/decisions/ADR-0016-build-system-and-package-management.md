# ADR-0016: Build system and package management

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Developer Experience Lead, Infrastructure Lead |
| **Related** | ADR-0001 |
| **Principles engaged** | P7 (boring technology) |

## Context

A monorepo (ADR-0001) with roughly twenty workspace packages needs a package manager and a task
orchestrator. The requirements are unglamorous but consequential over a decade: fast installs,
correct dependency isolation, incremental builds scoped to what changed, and — critically —
**identical behaviour locally and in CI**, because a build that only works in CI is a build nobody can
debug.

There is also an air-gap requirement: the offline install bundle must be buildable without network
access, which constrains how we handle lockfiles and caches.

## Decision

> We will use **pnpm** for package management and **Turborepo** for task orchestration, with all real
> logic in `Makefile` targets and `scripts/` so that local and CI execution are the same commands.

## Options considered

### Package manager

**Option A — pnpm *(chosen)*.** Content-addressed store with hard links: dramatically less disk and
faster installs than npm or Yarn. Strict `node_modules` layout that **prevents phantom dependencies**
— a package can only import what it declares. That strictness catches a real class of bug that
surfaces at deployment time under npm.
*Cons:* the strict layout occasionally breaks packages that rely on hoisting; requires
`node-linker` workarounds for a few tools.

**Option B — npm.** Universal, zero setup. *Cons:* slower, more disk, permits phantom dependencies,
weaker workspace support. The phantom dependency issue is the decisive one.

**Option C — Yarn Berry (PnP).** Fast, innovative. *Cons:* PnP has persistent tooling compatibility
friction; more configuration surface. Not worth the trouble.

**Option D — Bun.** Very fast. *Cons:* too young for a ten-year commitment; runtime compatibility
gaps. Revisit in a few years.

### Task orchestrator

**Option A — Turborepo *(chosen)*.** Content-hash-based caching with automatic affected-project
detection; minimal configuration (one `turbo.json`); low conceptual overhead.
*Cons:* fewer features than Nx; remote caching is a Vercel product, though the protocol is open and
self-hostable alternatives exist — we will self-host or go without, never depend on Vercel.

**Option B — Nx.** More powerful — generators, dependency graph visualisation, rich plugins, module
boundary enforcement. Genuinely the stronger tool.
*Cons:* significantly more configuration and conceptual surface. For a small team where any
contributor may need to debug the build, Turborepo's simplicity outweighs Nx's capability. This is a
close call and a defensible one to revisit.

**Option C — Make plus scripts only.** Simplest, zero dependencies. *Cons:* no caching, no affected
detection; full builds every time; CI times become unacceptable in a monorepo. **Partially adopted** —
`Makefile` remains the entry point, delegating to Turborepo.

**Option D — Bazel.** Correct, hermetic, superb caching. *Cons:* the learning curve and maintenance
burden would consume a large share of a small team's capacity. Wrong tool at our scale.

## Consequences

### Positive
- Installs are fast and disk-efficient; CI cache restores are quick.
- Phantom dependencies are impossible, catching a real bug class before deployment.
- Affected-project detection keeps CI proportional to the change, which ADR-0001 depends on.
- `make verify` runs exactly what CI runs — the most valuable property in the whole setup.
- Configuration is small enough that a contributor can read and understand the entire build.

### Negative
- pnpm's strict layout occasionally requires workarounds for tools assuming hoisting.
- Turborepo caching can mask a stale build if task inputs are declared incorrectly — a confusing
  failure mode. Mitigated by explicit input declarations and `--force` in release builds.
- Two tools to learn beyond plain npm.
- Turborepo's remote caching pushes toward a Vercel dependency we will not accept; we self-host or
  forgo it.

### Risks accepted
That Turborepo becomes under-maintained or pivots commercially. Mitigation: our `turbo.json` is
small, and migrating to Nx or plain scripts would be days, not weeks, because the real logic lives in
`Makefile` and `scripts/`. That separation is deliberate insurance.

## Compliance and enforcement

- `packageManager` field pins the pnpm version; CI uses Corepack so versions cannot drift.
- Lockfile committed; `--frozen-lockfile` in CI. A lockfile change without a manifest change fails.
- Every workspace package declares its own dependencies explicitly; no reliance on hoisting.
- `make verify` is the single entry point for all quality gates, used identically by contributors and
  by CI.
- Turborepo task inputs and outputs are declared explicitly so caching is correct.

## Reversal

Migrating to Nx: roughly one week. Dropping Turborepo for plain Make: about two days, at the cost of
CI time. pnpm to npm: a day, losing strictness. All cheap, by design.

## References

- [pnpm](https://pnpm.io/) · [Turborepo](https://turbo.build/repo) · [`docs/engineering/DEVELOPER_GUIDE.md`](../../docs/engineering/DEVELOPER_GUIDE.md)
