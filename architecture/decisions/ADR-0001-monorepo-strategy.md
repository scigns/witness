# ADR-0001: Adopt a monorepo

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | CTO, Principal Architect, Developer Experience Lead |
| **Related** | ADR-0015 (branching), ADR-0016 (build system), ADR-0017 (versioning) |
| **Principles engaged** | P6 (decades), P7 (boring technology) |

## Context

Witness comprises a web application, an admin console, six or more backend services, five workers,
shared domain libraries, two SDKs, infrastructure code and extensive documentation. These need to
be organised across one or many repositories.

The decisive constraint is the **shared domain model**. The knowledge graph ontology, the consent
model and the provenance chain are used by every service, both SDKs, the workers and the frontend.
If those definitions live in a package that is versioned and released independently, the services
will drift — one service on ontology v2.1 while another is on v2.4, with subtly different notions of
what a `Commitment` is. That drift is not hypothetical; it is the normal outcome, and in a system
whose entire value proposition is a coherent knowledge graph it is fatal.

The second constraint is contributor capacity. Witness will have few full-time contributors for
years. Coordinating a change across nine repositories with nine pull requests, nine reviews and a
release ordering problem is a cost we cannot absorb.

## Decision

> We will use a single repository containing all Witness code, documentation, infrastructure and
> deployment configuration, managed as a pnpm workspace with Turborepo for task orchestration.

Exception: substantial independent artefacts with their own release cadence and consumer base may
be split out later — for example a standalone ontology specification intended for adoption outside
Witness. Any such split requires its own ADR.

## Options considered

### Option A — Monorepo *(chosen)*

**Pros:** atomic cross-cutting changes (a domain model change, its consumers and its tests in one
reviewable commit); one version of truth for shared types; single CI configuration; trivially
consistent tooling, linting and standards; a new contributor clones once and has everything;
refactoring across boundaries is possible rather than a coordination project.
**Cons:** repository grows large over a decade; CI must be smart about scope or every change runs
everything; access control is all-or-nothing at the repository level; unfamiliar to some
contributors.

### Option B — Polyrepo, one per service

**Pros:** clear ownership; independent release cadence; smaller clones; granular access control.
**Cons:** the shared domain model problem above, which is decisive. Also: cross-repo changes need
coordinated pull requests; dependency version skew becomes a standing tax; contributors must
discover and clone many repositories; CI configuration duplicated and divergent. Rejected.

### Option C — Hybrid — core monorepo plus separate SDK and infrastructure repositories

**Pros:** SDKs get an independent release cadence, which their consumers want.
**Cons:** SDKs are *generated from* the contracts; separating them means generation crosses a
repository boundary and can silently drift. We get the same benefit by publishing SDK packages from
the monorepo. Rejected, but this is the closest alternative and the most likely future revision.

### Option D — Monorepo with Nx instead of Turborepo

Considered as a variant. Nx is more capable — generators, dependency graph analysis, richer plugin
ecosystem. Turborepo chosen for lower conceptual overhead and a smaller configuration surface, which
matters more than power for a small team. See ADR-0016.

## Consequences

### Positive

- Ontology, consent and provenance definitions have exactly one authoritative version.
- Cross-cutting changes are one pull request, reviewed as one coherent unit.
- Consistent tooling by construction: one ESLint config, one Prettier config, one TypeScript base.
- Documentation lives next to what it documents, which is the only arrangement that survives.
- Onboarding is one clone and one `make bootstrap`.

### Negative

- CI must use affected-project detection or build times become unacceptable. This is real work.
- Clone size grows over a decade; shallow clone guidance will eventually be needed.
- Cannot grant a contributor write access to only one service — access is repository-wide, mediated
  by CODEOWNERS rather than by permissions. Acceptable for now; a genuine limitation if the
  contributor base becomes large and heterogeneous.
- Release tooling must handle independently versioned packages within one repository.

### Risks accepted

That the repository becomes unwieldy at a scale we have not yet reached. Signals to watch: CI time
above 15 minutes p95 after affected-detection; clone above 2 GB; contributors avoiding areas because
the repository is intimidating. Revisit if any of those trigger.

## Compliance and enforcement

- `pnpm-workspace.yaml` defines the workspace boundaries.
- Turborepo affected-detection scopes CI to changed projects.
- A dependency-boundary lint rule prevents forbidden imports across layers — for example, nothing in
  `packages/domain` may import from `services/*`.
- CODEOWNERS provides the ownership granularity that separate repositories would have provided
  through permissions.

## Reversal

Splitting a monorepo is mechanical but not cheap: `git filter-repo` preserves history per path, then
the shared packages must be published and versioned properly. Estimate: two to four weeks. The
trigger would be a genuinely independent artefact with a distinct consumer base and release cadence
— most plausibly the ontology specification, if it is adopted as a standard outside Witness.

## References

- [`docs/engineering/REPOSITORY_STRATEGY.md`](../../docs/engineering/REPOSITORY_STRATEGY.md)
- Kubernetes, Next.js, Prisma and Grafana all run monorepos at far larger scale than ours.
