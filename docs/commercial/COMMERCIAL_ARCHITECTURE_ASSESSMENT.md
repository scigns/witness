# Commercial Architecture Assessment

**Status:** Phase 0 assessment complete; Milestone 1 architecture proposed
**Owner:** Product and Engineering
**Assessment date:** 2026-09-01
**Implementation boundary:** Documentation and proposed ADRs only; no migration or production-code
change is authorised by this milestone

## Executive finding

Witness is not starting from an empty commercial model. It already implements an
organisation-scoped catalogue, typed entitlements, subscriptions, billing accounts, upgrade intent,
invoices, purchase orders, payment methods and manual payment records. It also has organisation and
workspace membership, separate platform and organisation role scopes, OIDC behind an identity port,
hash-chained audit events and deployment-profile controls.

The minimum safe change is not a replacement subsystem. It is to establish `Organisation` as the
primary commercial aggregate, preserve the provider-neutral foundation, reconcile terminology and
architecture documents, and add missing lifecycle concepts incrementally. This assessment defines
Milestone 1 as architecture and ADR work only. Schema changes belong to later reviewed milestones.

## 1. Current relevant architecture

- `packages/domain` contains pure domain rules and pending audit events. Infrastructure, persistence
  and authorisation remain in application adapters under ADR-0003.
- PostgreSQL and Prisma are the implemented system of record. Organisation-scoped relations are
  explicit in the schema; projections are not commercial authorities.
- `Organisation` is the implemented outer tenant boundary. `Workspace` is subordinate, and
  organisation and workspace membership are deliberately separate.
- `User`, `IdentityLink`, `AuthSession` and `AuthLoginAttempt` represent local identity and its
  external-subject link. OIDC is behind `IdentityProviderPort`; Keycloak is the production adapter.
- Casbin and application enforcement distinguish platform roles from organisation/workspace roles.
  Internal Witness authority must not be represented as customer membership.
- `AuditEvent` is an organisation-scoped, sequence-numbered, hash-chained record. Commercial changes
  should extend it instead of creating a parallel audit system.

### Implemented commercial foundation

| Concern | Existing representation | Decision |
|---|---|---|
| Catalogue | `Plan`, `PlanPrice` | Reuse; price is configuration data |
| Capability | `EntitlementDefinition` | Reuse as the canonical capability definition |
| Plan bundle | `PlanEntitlement` | Reuse as the `PlanCapability` equivalent |
| Account | `BillingAccount` | Reuse; one-to-one with Organisation |
| Access lifecycle | `Subscription` | Reuse; organisation and account scoped |
| Exceptions | `SubscriptionEntitlementOverride` | Reuse, then migrate to agreement-backed organisation grants |
| Evaluation | `evaluateEntitlements`, `CommercialEntitlementService` | Reuse; no plan-name branches |
| Customer intent | `CommercialChangeRequest` | Reuse for plan/interval/cancellation requests |
| Receivables | `Invoice`, `InvoiceLineItem`, `InvoiceNumberCounter` | Reuse immutable issued snapshots |
| Procurement/payment | `PurchaseOrder`, `PaymentMethod`, `Payment` | Reuse provider-neutral records |
| Customer UI | public pricing and organisation billing pages | Reuse without unimplemented enterprise claims |

The current entitlement service resolves plan grants and subscription overrides for an organisation.
A policy-facing `organisationCan(organisationId, capabilityKey)` facade is desirable, but it must
compose with RBAC, consent, tenancy and deployment policy: entitlement may deny, never grant
otherwise-denied authority.

### Tenancy and hosting conflict

Runtime configuration distinguishes `sovereign`, `hybrid` and `development` profiles, while
deployment documentation covers cloud-managed and sovereign/on-prem topologies. These are runtime
facts, not durable customer deployment or contract records. `WITNESS_DATA_RESIDENCY` is configuration,
not an organisation policy or verified product claim.

ADR-0013 describes `Tenant -> Workspace`, universal `tenant_id` and RLS. The implemented schema uses
`Organisation -> Workspace`, `organisation_id` foreign keys and application scoping; it does not
implement universal RLS. This pre-existing architecture drift must be reconciled before further
customer-scoped tables rely on the ADR's isolation claims.

## 2. Existing functionality that can be reused

1. Use `Organisation` as tenant and commercial root; do not add `Tenant` or `Customer`.
2. Keep `EntitlementDefinition` and `PlanEntitlement`; a rename adds risk without new meaning.
3. Keep plans as configurable bundles, never authorisation branches.
4. Keep Witness-owned invoice, subscription and payment truth under ADR-0022.
5. Extend existing memberships and scoped roles; do not create parallel customer users/admins.
6. Extend `IdentityProviderPort` and Keycloak federation; do not build authentication in the
   commercial context.
7. Use the hash-chained audit transaction path for sensitive mutations.
8. Reuse sovereign no-egress validation as a constraint on future deployment records.
9. Preserve issued invoice/remittance snapshots and integer minor-unit amounts.

## 3. Incomplete or paused functionality

- ADR-0022 remains Proposed. Invoice/payment truth exists, but exactly-once
  settlement-to-entitlement activation and a proven payment provider port are incomplete.
- Entitlements are subscription overrides, not organisation grants tied to an agreement, procurement
  authority or effective window.
- Payment records exist, but card processing, webhooks, refunds and automated reconciliation are
  intentionally absent.
- There is no first-class `Renewal` or agreement-driven renewal process.
- Billing/general organisation contacts and verified organisation domains are absent.
- Commercial agreements, signed document references, signatories and general procurement
  requirements are absent (purchase orders exist).
- Per-organisation IdP configuration and authentication policy are absent.
- Customer deployment, residency, backup, isolation, retention, export and exit records are absent.
- Support plans/requests, onboarding plans, leads/opportunities and account ownership are absent.
- Operational email relationships are absent.

Commercial templates for quotations, SOWs, procurement, pilots and renewals are operational assets,
not database state, APIs or automated workflows. Deployment guides do not constitute customer-facing
hosting commitments, and the UI must not infer a supported region from free text.

## 4. Proposed domain model

```text
Organisation
├── contacts, verified domains, memberships and scoped roles
├── commercial agreements ── procurement requirements
├── subscriptions ── plan capability grants
│   └── organisation entitlement grants/denials
├── billing account ── invoices ── payments
├── renewals
├── identity providers ── authentication policy
├── deployment profiles
│   ├── data residency policy
│   └── retention/export/exit policy
├── onboarding plan
└── support plan ── support requests
```

- Every customer-specific row has `organisationId` or a database-enforced same-organisation path.
- Global catalogue entities are the exception: `Product`, `Plan` and capability definitions are
  Witness-owned reference data. Customer state using them remains organisation-scoped.
- Paid access is governed by `CommercialAgreement`. Pre-signature state may be provisional, not
  active. A trial uses explicitly recorded trial authority.
- `OrganisationEntitlement` is an effective-dated, auditable grant or denial over plan defaults. Its
  source is an agreement, authorised trial decision or explicit correction. Existing overrides
  should migrate into it rather than coexist indefinitely.
- A customer `DeploymentProfile` is distinct from process-wide runtime configuration. It records
  verified facts and cannot imply support for arbitrary regions.
- Keep current role policy/reference data unless customer-defined roles become a real requirement.
- Internal opportunities/account ownership live in an internal operations context but link to
  Organisation when associated. Platform and customer role scopes remain distinct.

Capability evaluation returns allow/deny, source, effective interval and an audit-safe reason. A
protected operation proceeds only when identity, tenant scope, RBAC/consent/security and commercial
capability all allow it. Unknown, expired, suspended or malformed capability state fails closed.

## 5. Proposed database changes

No database change is part of Milestone 1. Later migrations should be additive and bounded:

| Group | Additions/reconciliation | Principal constraints |
|---|---|---|
| Organisation | `OrganisationContact`, `OrganisationDomain` | normalised unique domain; verification history; no token at rest |
| Capability | `OrganisationEntitlement`; migrate overrides | typed grant/deny, source, reason, effective dates |
| Agreement | `CommercialAgreement`, documents, signatories, `ProcurementRequirement` | document digest; state machine; same-organisation FKs |
| Renewal | `Renewal` linked to agreement/subscription | one active cycle per governed term; explicit outcome |
| Identity | `IdentityProvider`, `AuthenticationPolicy` | capability/domain gates; secret references only |
| Hosting | customer `DeploymentProfile`, `DataResidencyPolicy`, `RetentionPolicy` | reviewed states; effective dates; allowlisted claims |
| Success | `OnboardingPlan`, `SupportPlan`, `SupportRequest` | organisation scope; SLA snapshot; accountable owner |
| Operations | lead/opportunity/account owner | platform-role access; PII minimisation; Organisation link |

Introduce `Product` only when Witness sells more than one independently managed product. Adding it
now would be speculative. Similarly, defer a separate `OrganisationRole` table until custom roles
are required; current scoped role assignments are stronger existing terminology.

## 6. Proposed ADRs

Milestone 1 creates ADR-0023, **Organisation as the commercial aggregate**, covering ownership,
capability-based access, agreement traceability, audit reuse and internal/customer authority
separation. It remains Proposed for the repository's review period.

Before the relevant implementation, further ADRs must:

- reconcile `Organisation -> Workspace` and actual isolation with ADR-0013's Tenant/RLS design;
- define agreement/entitlement authority, precedence, effective dates and correction semantics;
- extend ADR-0007 for per-organisation IdPs, domain discovery, policy precedence, break-glass access,
  SAML/SCIM boundaries and secrets;
- separate customer deployment/residency claims from runtime posture and define approval authority;
- define agreement/subscription/renewal transitions and exactly-once settlement application.

## 7. Tenancy and security implications

- Entitlement is never privilege escalation; RBAC, consent, cultural restrictions, tenancy and
  deployment policy continue to deny independently.
- Sensitive mutations persist actor, organisation, action, subject, safe change metadata, time and
  chain position through existing audit transactions. Secrets, documents, credentials and
  unnecessary PII stay out of audit metadata.
- Composite database keys prevent cross-organisation relations. APIs derive organisation scope from
  authenticated authority and verify the target belongs to it.
- Domain tokens, IdP secrets and signing keys use secret references/encryption and never enter normal
  DTOs, logs or audit records.
- Contracts, invoices and support attachments require object-level authorisation and export rules.
- Platform operators and customer admins use separate roles. Support access does not imply
  impersonation.
- Residency/deployment changes use requested, verified and active states with effective dates.
- Retention must surface conflicts among consent, legal hold, contract and Indigenous data governance
  for authorised human resolution rather than erase automatically.

## 8. Dependency map

```text
Organisation + membership + scoped RBAC + audit
├── contacts/domains ──> organisation identity/auth policy
├── catalogue/subscription ──> agreement-backed entitlements ──> renewal/activation
├── agreements/procurement ──> invoices/payments and onboarding/support
└── customer deployment ──> residency/backup/isolation and retention/export/exit

all branches ──> customer administration + internal operations views
all mutations ──> existing hash-chained AuditEvent
```

Operational email depends on organisation, agreement, invoice, renewal, opportunity and support IDs.
AI may propose classification and summaries; humans with explicit authority approve commercial,
financial, contractual, identity and security actions.

## 9. Migration risks

| Risk | Impact | Mitigation |
|---|---|---|
| Duplicate concepts | conflicting authority | map names to existing models; extend rather than replace |
| ADR-0013 drift | false isolation claim | superseding ADR plus executable isolation tests |
| Override migration | access loss/gain | shadow comparison, deterministic precedence, reconciliation report |
| Agreement backfill | paid state lacks authority | reviewed legacy authority; never fabricate signatures |
| Cross-organisation link | data leak/corruption | composite keys and adversarial tests |
| Invoice mutation | changed history | preserve issued snapshots; additive links only |
| Identity cutover | lockout | verified proof, staged policy, break-glass recovery |
| Residency overclaim | misrepresentation | allowlisted claims and requested/verified/active states |
| Sensitive data growth | breach impact | minimisation, object access, encryption, retention |
| Large migration | unsafe recovery | expand/backfill/verify/enforce one aggregate at a time |

## 10. Recommended implementation sequence

1. **Milestone 1 — architecture and ADRs (this change):** publish this assessment, propose ADR-0023,
   record tenancy drift, and make no schema/API/UI change.
2. **Organisation foundation:** contacts, verified domains and customer administrator responsibility,
   after tenancy ADR reconciliation.
3. **Capabilities and provenance:** agreement-backed organisation entitlements and an
   `organisationCan` facade; migrate overrides; add audit and adversarial tests.
4. **Commercial lifecycle/contracts:** agreements, procurement and renewal; paid activation requires
   governing authority and signed-document digests.
5. **Billing completion:** corrections, settlement paths, provider port and exactly-once application;
   manual bank transfer remains first-class.
6. **Enterprise identity:** organisation IdP records, domains and authentication policy behind the
   existing port; OIDC/Entra first, SAML/SCIM only when demanded.
7. **Hosting and sovereignty:** verified deployment, residency, backup, isolation, operator,
   retention, export and exit rules without unsupported region claims.
8. **Onboarding/support/administration:** bounded aggregates followed by minimum customer and platform
   operations views with strict role separation.
9. **Operational email and knowledge integration:** link correspondence only after target aggregates
   exist; retain human approval gates.

Milestone 1 stops here. The foundation is too substantial, and tenancy drift too important, to
justify an immediate migration. Production schema work begins only after ADR-0023 review and tenancy
reconciliation are explicitly resolved.
