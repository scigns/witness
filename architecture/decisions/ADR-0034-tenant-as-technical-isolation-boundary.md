# ADR-0034: Tenant is the technical isolation boundary; Organisation remains the commercial and governance identity

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-04 |
| **Deciders** | Engineering (this slice), pending Steering Committee / Governance Lead ratification |
| **Consulted** | `docs/architecture/TENANCY_RECONCILIATION_RECOMMENDATION.md` (2026-09-01) |
| **Informed** | Architecture, Security, Commercial |
| **Supersedes** | ADR-0013's tenancy-naming content only. ADR-0013's deployment-profile/topology content (sovereign/hybrid/development) is carried forward unchanged. |
| **Related** | ADR-0007, ADR-0013, ADR-0022, ADR-0023, ADR-0028 |
| **Principles engaged** | P1, P3, P6, P7 |

## Context

ADR-0013 used "Tenant" for the isolation boundary; ADR-0023 used "Organisation" for the commercial
aggregate. `docs/architecture/TENANCY_RECONCILIATION_RECOMMENDATION.md` found no persisted `Tenant`
concept exists anywhere — zero table, column, or runtime object — and recommended collapsing the two
into one ("Organisation is the tenant"). That recommendation was never ratified.

Commercial requirements have since sharpened the distinction the reconciliation doc's Option B
flattened away: a `DeploymentIsolation` entitlement (this slice) must express that *one organisation's
contracted isolation tier may someday require a distinct technical environment from another
organisation on the same plan* — dedicated database resources, a dedicated VM/VPC, or negotiated data
residency. Collapsing "the commercial customer" and "the technical isolation unit" into one identity
forecloses that without a schema change later, which is exactly the kind of premature narrowing an ADR
exists to avoid.

## Decision

> We will treat **Organisation** and **Tenant** as two related but distinct concepts, and introduce
> `Tenant` as a real, minimal, additive concept rather than ratifying ADR-0013/ADR-0023's prior
> collapse of them into one.

**Organisation** = commercial and governance identity: subscription, billing profile, people/users,
organisational governance, contracts, entitlements, institutional identity. Everything already built
on `Organisation` (RBAC scope resolution, the entire commercial domain, evidence/consent/provenance)
is unaffected — this ADR changes no persisted table's meaning and renames nothing.

**Tenant** = technical isolation boundary: runtime isolation, database/schema isolation, storage
isolation, resource allocation, deployment environment, infrastructure/security boundary.

An `Organisation` relates to a `Tenant` through a nullable `Organisation.tenant_id` foreign key.
**Today, every organisation's effective tenant is itself** — `organisation.tenantId ?? organisation.id`
is the one place this is resolved, so nothing downstream needs to know whether an explicit `Tenant` row
exists yet. This preserves the 1:1 reality the reconciliation doc found to be already true in practice,
while leaving the seam open for it to become N:1 (several organisations sharing one technical
environment) or 1:N (one organisation's workspaces split across environments) later, without a
backfill migration: assigning an explicit `tenantId` to any subset of organisations is additive.

## Options considered

### Option A — Ratify the 2026-09-01 reconciliation doc's Option B (Organisation is the tenant, full stop)

**Description.** Formally accept that recommendation as-is; no new `Tenant` concept.
**Pros:** Zero new schema. Matches what's actually enforced today exactly.
**Cons:** Forecloses the N:1/1:N evolution this slice's `DeploymentIsolation` concept needs to express
honestly. Would require a second ADR and a migration later to reopen the question, at exactly the point
a real institutional customer is asking for a dedicated environment.
**Why we did not choose it:** it solves last quarter's ambiguity but not this quarter's requirement.

### Option B — A full `Tenant` aggregate now, with isolation/resource state moved onto it

**Description.** Build out `Tenant` as a first-class aggregate owning resource allocation, isolation
tier, and deployment state directly, with `Organisation` referencing it non-nullably.
**Pros:** Conceptually cleanest end state.
**Cons:** Requires backfilling a `Tenant` row for every existing organisation now, touches every place
that currently reasons about deployment profile, and front-loads infrastructure-automation work this
slice does not need yet (`DeploymentIsolation` here is a *contracted entitlement*, not a provisioning
system).
**Why we did not choose it:** over-builds for what is currently needed; violates "do not over-engineer"
and "forward-safe migration" guidance for this slice.

### Option C — Minimal additive seam (chosen)

**Description.** As decided above: one new small `Tenant` table, one new nullable FK, implicit 1:1
default, no behaviour change to anything existing.
**Pros:** Zero backfill, zero renaming, zero risk to existing commercial/RBAC code, and the seam is
real (not just a comment) — a future PR can assign explicit `Tenant` rows without a schema migration.
**Cons:** `Tenant` is nearly empty today; its payoff is deferred.
**Why we chose it:** matches "preserve backwards compatibility... do not perform broad cosmetic
renaming... do not architect the system so this relationship can never evolve."

## Consequences

### Positive
A future dedicated/sovereign deployment for one institutional customer is a data change (assign a
`Tenant` row, point their `Organisation` at it), not a schema migration.

### Negative
Two names now exist for what is, in every deployment running today, the same boundary. Until a real
multi-organisation-per-tenant or split-tenant case exists, `Tenant` is speculative scaffolding.

### Neutral
No existing API, RBAC decision, or commercial resolution path changes. `organisation:read` /
`organisation:update` scoping is untouched.

### Risks accepted
Someone reading the schema before reading this ADR could assume `Tenant` is further along than it is.
Mitigated by this ADR's own explicit "today, every organisation's effective tenant is itself" statement
and by keeping `Tenant`'s columns minimal enough that there is nothing to misread.

## Compliance and enforcement
Enforced by code review and by this ADR's existence, not by a lint rule — there is no persisted
invariant to violate yet (the FK is nullable; any value or absence is valid). The resolution helper
(`effectiveTenantId(organisation)` in `packages/domain/src/tenant.ts`) is the single place this
fallback logic lives; a future reviewer should flag any code that re-derives "which tenant is this
organisation on" independently of that helper.

## Reversal
If no customer ever needs a non-1:1 mapping, `Tenant` can be dropped and `tenant_id` removed in a
later migration with zero data loss (nothing other than the FK itself depends on it). Revisit when the
first real negotiated dedicated-environment contract exists, or at the next deployment-isolation
architecture review, whichever comes first.

## References
`docs/architecture/TENANCY_RECONCILIATION_RECOMMENDATION.md`, ADR-0013, ADR-0022, ADR-0023.
