# Repository Strategy

**Owner:** CTO
**Status:** Active
**Decision record:** [ADR-0001](../../architecture/decisions/ADR-0001-monorepo-strategy.md)

---

## One repository

`scigns/witness` contains all code, documentation, infrastructure and deployment configuration.

The decisive reason is the **shared domain model**: the ontology, the consent model and the
provenance chain are used by every service, both SDKs, the workers and the frontend. Split across
repositories with independent release cycles, they drift — one service on ontology v2.1 while another
is on v2.4, with subtly different notions of what a `Commitment` is. In a system whose value is a
coherent knowledge graph, that is fatal.

## Layout

| Path | Contains | Published? |
|---|---|---|
| `.ai/` | Machine-readable context and guardrails for AI contributors | No |
| `agents/` | Role charters — the organisation as specification | No |
| `architecture/` | Architecture documents, views, domain models, ADRs | No |
| `docs/` | Engineering, product, governance, operations, research | Rendered site (Phase 6) |
| `apps/` | Deployable applications — web, admin console, docs site | Container images |
| `packages/` | Shared libraries — domain, contracts, UI, policy, observability | `contracts` to npm |
| `services/` | Bounded-context backend services (NestJS) | Container images |
| `workers/` | Async processors | Container images |
| `infrastructure/` | Docker, Kubernetes, Helm, Terraform, observability | Helm chart |
| `deployments/` | Composed deployment topologies | Release assets |
| `sdk/` | Client SDKs | npm, PyPI |
| `examples/` | Worked examples with synthetic data | No |
| `scripts/` | Repository automation | No |
| `templates/` | Scaffolding templates | No |
| `.github/` | CI/CD, issue and PR workflow, CODEOWNERS | No |

## Boundaries

Enforced by `eslint-plugin-boundaries` in CI, not by convention:

| Layer | May import |
|---|---|
| `packages/domain` | **Nothing** but the standard library and other domain code |
| `packages/contracts` | Nothing (type definitions only) |
| `packages/*` (other) | `domain`, `contracts`, external dependencies |
| `services/*` | `packages/*` — **never another service** |
| `workers/*` | `packages/*` — **never a service** |
| `apps/*` | `packages/*`, `sdk/*` — **never a service or worker** |
| `sdk/*` | `packages/contracts` only |

**Services never import each other.** They communicate through the API or through events. A direct
import would create a compile-time coupling that silently defeats the bounded context boundary — and
it is exactly the shortcut a monorepo makes easy, which is why the lint rule exists.

## Package naming and versioning

Internal packages: `@witness/<name>`, versioned `0.0.0` with `workspace:*` references — they are
never published individually.

Published packages version independently via Changesets:

| Package | Registry | Licence |
|---|---|---|
| `@witness/contracts` | npm | Apache-2.0 |
| `@witness/sdk` | npm | Apache-2.0 |
| `witness-sdk` | PyPI | Apache-2.0 |

The Apache-2.0 boundary is deliberate ([ADR-0002](../../architecture/decisions/ADR-0002-licensing-strategy.md))
— integrators must be able to build against Witness without copyleft obligations flowing into their
own systems.

## Ownership

[`.github/CODEOWNERS`](../../.github/CODEOWNERS) maps every path to an owning role. **No path is
unowned**; a CI check fails if a file matches no CODEOWNERS rule.

In a polyrepo, ownership would be expressed through repository permissions. Here it is expressed
through CODEOWNERS — which is more granular but does mean a contributor has read access to
everything. Accepted; the code is public anyway.

## What does not belong here

| Not in the repository | Where instead |
|---|---|
| Secrets, credentials, keys | Secret manager; scanned on every push and across history |
| Real recordings, transcripts, personal data | Nowhere near us — synthetic fixtures only |
| Model weights | Object storage; checksum-pinned; offline bundle for air-gapped installs |
| Large binaries | Release assets |
| Generated code that can be regenerated | Generated in CI, except SDKs which are committed for reviewability |
| Personal notes and scratch work | Your machine |

## Growth

Monorepos have a size ceiling. Ours is far away, but the signals to watch are named so we notice
rather than adapt gradually:

| Signal | Threshold | Response |
|---|---|---|
| CI p95 with affected detection | > 15 min | Investigate; consider remote caching |
| Clone size | > 2 GB | Shallow clone guidance; audit large files |
| Contributors avoiding areas | Qualitative | Documentation and onboarding problem, not a repository problem |
| A component with a genuinely independent consumer base | Qualitative | Consider a split, via ADR |

The most likely future split is the **ontology specification**, if it is adopted as a standard
outside Witness. That would be a good problem to have.

## Mirroring

The canonical repository is on GitHub. Because a public-infrastructure project that exists only on
one commercial platform is not credibly sovereign:

- A full mirror to an independent forge is a **Phase 7 deliverable**
- All CI logic lives in `scripts/` and `Makefile`, so the pipeline is portable
- Release artefacts are published to multiple registries
- The offline bundle contains everything needed to build and run without any network

Anyone can fork and continue without us ([`GOVERNANCE.md`](../../GOVERNANCE.md)). We consider that a
feature and we make it practical rather than nominal.
