# ADR-0023: Organisation as the commercial aggregate

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-09-01 |
| **Deciders** | CTO, Principal Architect, Product Lead |
| **Consulted** | Security Lead, Governance Lead, Operations Lead, Finance/Legal advisers |
| **Related** | ADR-0003, ADR-0004, ADR-0007, ADR-0009, ADR-0012, ADR-0013, ADR-0019, ADR-0022 |
| **Principles engaged** | P1 (digital sovereignty), P3 (provenance), P6 (replaceability), P7 (boring technology) |

## Context

Witness already stores organisations, memberships, scoped roles, plans, typed entitlement grants,
subscriptions, billing accounts, invoices, purchase orders and payments. The next stages add
agreements, organisation identity, deployment assertions, residency, retention, renewal, support and
onboarding.

Independent or provider-owned systems would make it impossible to answer which institution
authorised a capability, which agreement governs access, who may administer it, or which hosting and
retention obligations apply. A payment provider, IdP or plan name could accidentally become an
authorisation authority.

The repository also has terminology drift that this decision must not conceal. ADR-0013 describes a
`Tenant` boundary and universal RLS; the implementation uses `Organisation` and organisation-scoped
application enforcement. A separate superseding ADR must reconcile that drift before commercial
migrations depend on the isolation claim.

## Decision

> `Organisation` is the primary customer, tenant and commercial aggregate in Witness. Every
> customer-specific commercial, identity, deployment, billing, renewal, onboarding and support
> record is owned by or database-traceable to exactly one Organisation.

`Product`, `Plan` and capability definitions may be global Witness-owned catalogue data. A plan is a
bundle of typed capability grants, never an application branch. Access is evaluated through an
operation equivalent to `organisationCan(organisationId, capabilityKey)`. Entitlement may deny an
operation RBAC allows; it cannot grant authority denied by identity, RBAC, consent, cultural
restriction, tenant isolation, deployment policy or another governance control.

Paid access is traceable to a `CommercialAgreement` or explicitly recorded transitional authority.
Organisation grants and denials can modify plan defaults, are effective-dated, include an authorised
reason and source, and are audited. Existing subscription overrides are the predecessor of this
model and will be migrated rather than duplicated.

Organisation authentication remains behind ADR-0007's identity port. SSO is an organisation
capability and policy, not a global assumption. Customer deployment records describe contracted and
verified facts; they are distinct from process-wide runtime profiles.

Sensitive administration uses the existing hash-chained audit mechanism. Internal operators use
platform roles; customer administrators use organisation roles. Neither implicitly grants the
other. Payment providers, IdPs, document stores and mail systems are adapters; their objects do not
define commercial or hosting truth.

## Options considered

### Option A — Organisation is the primary commercial aggregate *(chosen)*

**Pros:** matches implementation; makes customer answers and exports coherent; preserves provider
independence; supports shared, dedicated, sovereign and customer-managed deployment; enables
database-enforced ownership.

**Cons:** the conceptual boundary is broad and needs careful sub-aggregate transactions; global
catalogue data needs an explicit exception; legacy state needs source reconciliation; organisation
transfer becomes consequential.

### Option B — Separate Customer and Tenant aggregates

**Pros:** naturally models resellers, holding companies, several buyers and one buyer with several
installations.

**Cons:** duplicates Organisation; every request must reconcile three identities; creates ambiguous
authority and migration work without evidence it is needed. Rejected now. Agreement parties can
later model multi-party contracting without replacing ownership.

### Option C — Provider-owned customer objects

**Pros:** faster initial integrations and less local modelling.

**Cons:** one organisation receives incompatible provider identities; sovereign/offline operation is
secondary; migration and outages affect authority; audit/export cannot provide complete history.
Rejected.

### Option D — Subscription as the aggregate

**Pros:** familiar SaaS model and direct recurring-billing mapping.

**Cons:** trials, pilots, implementation agreements, deployment, support and procurement can exist
outside recurring subscriptions; identity and retention survive cancellation. Rejected.

## Consequences

### Positive

- An organisation can retrieve a coherent account of agreements, access, invoices, identity,
  deployment, policies, support and exit rights.
- Capability checks remain stable when packages/prices change.
- Commercial state cannot broaden governance or security authority.
- Customer records reuse organisation isolation and audit.
- Manual and sovereign operation remain first-class.

### Negative

- Services must carry and validate organisation scope on every commercial operation.
- Composite same-organisation keys and adversarial tests add complexity.
- Agreement provenance requires migration of existing overrides.
- One owner does not directly model every reseller or multi-party contract.
- ADR-0013 reconciliation may delay schema work.

### Risks accepted

- **Aggregate breadth:** mitigate with separate bounded services/transactions while retaining
  organisation ownership.
- **Entitlement confused with authorisation:** mitigate through composed decisions and tests proving
  entitlements only restrict.
- **Unsupported hosting claims:** mitigate with requested/verified/active states and allowlisted
  product-facing values.
- **Legacy authority gaps:** use reviewed transitional records; never fabricate signatures.

## Compliance and enforcement

- Customer-specific tables require non-null organisation ownership and composite foreign keys where
  needed to prevent cross-organisation linkage.
- Adversarial tests cover cross-organisation access for every new API.
- Review/static search rejects plan-name feature branching; policy consumes capability keys.
- Capability decisions fail closed for unknown, expired, suspended or inconsistent state.
- Paid activation requires governing authority and cannot bypass RBAC, consent or deployment rules.
- Sensitive mutations persist an existing hash-chained `AuditEvent` in the same transaction. Audit
  metadata excludes secrets, payment credentials, documents and unnecessary PII.
- Platform and organisation role grants are separately reviewed and tested.
- Product-facing deployment/residency values require verified status and allowlisted support.
- No implementing migration may merge until a superseding tenancy ADR reconciles ADR-0013 with the
  implemented Organisation boundary and actual RLS posture.

## Reversal

A legal-customer hierarchy can later be added through agreement parties and an ownership layer above
Organisation. Moving authority to a provider would be a much larger reversal because audit, export
and sovereign guarantees would change. Capability keys and ports keep packaging and adapter changes
local.

## References

- [`COMMERCIAL_ARCHITECTURE_ASSESSMENT.md`](../../docs/commercial/COMMERCIAL_ARCHITECTURE_ASSESSMENT.md)
- [`WITNESS_COMMERCIAL_FOUNDATION.md`](../../docs/product/WITNESS_COMMERCIAL_FOUNDATION.md)
- [`COMMERCIAL_IMPLEMENTATION_ROADMAP.md`](../../docs/engineering/COMMERCIAL_IMPLEMENTATION_ROADMAP.md)
