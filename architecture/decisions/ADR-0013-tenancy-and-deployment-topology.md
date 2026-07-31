# ADR-0013: Tenancy and deployment topology

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Infrastructure Lead, Principal Architect, Security Lead |
| **Principles engaged** | P1 (sovereignty), P6 |

## Context

Two questions that are often conflated and must not be: **how many organisations share a deployment**,
and **who operates it**.

Witness's sovereignty commitment means an institution runs its own instance. But institutions are not
monolithic — a ministry with twelve departments, or a land council representing forty communities,
needs internal separation without forty separate installations that forty different people must patch.

We also need deployment *posture* to be enforceable. An operator who believes they are running an
air-gapped sovereign instance, but is not, has a false sense of safety that is worse than knowing.

## Decision

> We will build **multi-tenant-capable software with single-tenant deployment as the default and
> recommended topology**, and we will make the **deployment profile** a first-class architectural
> concept validated at startup.

**Tenancy:** `Tenant` → `Workspace` → resources. Every tenant-scoped table carries `tenant_id`
enforced by PostgreSQL row-level security, with repository-layer filtering as a second independent
layer. Cross-tenant references are structurally impossible.

**Profiles:** `sovereign` (default, no egress) · `hybrid` (allowlisted egress, per-tenant opt-in) ·
`development` (refused when `NODE_ENV=production`). The profile is validated at boot; an
inconsistent configuration **exits the process** rather than starting in a state the operator
misunderstands.

## Options considered

### Option A — Single-tenant only, no tenancy model
**Pros:** simplest; strongest isolation; no risk of a cross-tenant bug.
**Cons:** a ministry with twelve departments runs twelve installations, each needing patching, backup
and monitoring. Operationally worse for the operator we care most about. And retrofitting tenancy
later is a schema migration across every table — one of the most expensive changes available.

### Option B — Multi-tenant software, single-tenant deployment default *(chosen)*
**Pros:** one installation serves an institution's internal structure; tenancy is available where
needed without imposing shared hosting; the isolation model is built and tested from day one rather
than retrofitted.
**Cons:** every query carries tenancy concerns; cross-tenant leakage is a permanent class of bug
requiring permanent adversarial testing.

### Option C — Multi-tenant SaaS as the primary model
**Pros:** operationally efficient; lower barrier to adoption.
**Cons:** contradicts P1 directly, and would divert effort from making self-hosting excellent —
which is the entire proposition. Rejected. (If a *public-sector* operator wanted to offer shared
hosting to smaller agencies in its jurisdiction, the software supports it; that is their sovereignty
decision to make, not ours.)

### Option D — Namespace-per-tenant at the infrastructure layer
**Pros:** very strong isolation.
**Cons:** operational cost scales linearly with tenant count; overkill for departments within one
institution. Available to operators who want it; not our default.

## Consequences

### Positive
- One installation serves an institution's internal structure — the common real-world case.
- Isolation is built in and adversarially tested from the beginning, not bolted on.
- Deployment posture is enforced by the software, so an operator cannot be wrong about it silently.
- Air-gapped operation is a supported, CI-tested configuration rather than an aspiration.

### Negative
- Every query and every index carries a tenancy dimension — permanent cognitive and performance cost.
- Cross-tenant leakage remains a live risk class forever, requiring ongoing adversarial testing.
- Three profiles means three configurations to test.
- Row-level security adds query planning overhead; measurable, accepted.

### Risks accepted
- A cross-tenant leak through a code path bypassing both RLS and the repository filter — for example a
  raw query or an analytics job. Mitigation: adversarial CI suite covering every entry point; raw SQL
  requires explicit review; RLS is enabled by default on new tables via a migration lint check.
- Operators running `development` profile in production because it is easier. Mitigation: refused when
  `NODE_ENV=production`, and a prominent persistent UI banner.

## Compliance and enforcement

- `tenant_id NOT NULL` on every tenant-scoped table; RLS policy required — a migration adding a table
  without RLS fails a CI lint check.
- Adversarial CI suite attempts cross-tenant access through API, GraphQL, search, graph traversal and
  export paths.
- Startup validation asserts profile consistency; failure exits non-zero with a clear message.
- `make egress-test` verifies the sovereign profile makes zero external calls, in CI.
- Profile is displayed in the admin console and in `/healthz`, so an operator can always see it.

## Reversal

Removing tenancy would be a large simplification but would break institutions relying on internal
separation. Adding tenancy later, had we not built it now, would be far more expensive — which is the
argument for doing it up front. Profiles could be collapsed but would forfeit the enforcement
property.

## References

- [`DEPLOYMENT_ARCHITECTURE.md`](../DEPLOYMENT_ARCHITECTURE.md) · [`DATA_MODEL.md` §5](../DATA_MODEL.md)
