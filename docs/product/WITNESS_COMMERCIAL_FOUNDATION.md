# Witness Commercial Foundation

**Status:** Discovery complete; Milestone C1 implemented
**Owner:** Product and Engineering
**Last reviewed:** 2026-08-25

## Purpose

Witness needs a provider-independent commercial layer that permits self-service free onboarding and
paid upgrades while retaining sovereign, institution-operated deployments and procurement by invoice,
purchase order, and bank transfer. Commercial controls supplement authorisation; they never replace
RBAC, consent, provenance, or deployment policy.

## Discovery and reconciliation

### Existing relevant architecture

- PostgreSQL is the authoritative write store. The API gateway uses Prisma and creates an
  organisation, its initial administrator, memberships, roles, and audit records in one transaction.
- `packages/domain` is a framework-free domain layer. Domain operations receive identifiers and time
  rather than importing infrastructure.
- Organisations are the implemented tenant boundary. Authentication uses Keycloak/OIDC adapters;
  Casbin-backed policy decisions and organisation/workspace role resolution remain authoritative.
- Audit records are append-only, per-subject hash chains. Domain operations return pending audit
  events and the application layer assigns identity, time, and hashes.
- Organisation storage use and an operator-set byte quota already exist. The usage API deliberately
  records quantities, not rates or currency.
- The default deployment is sovereign/on-premises and must make no outbound calls. Provider-backed
  payments therefore cannot be required to run or use Witness.
- The web application has organisation and program navigation but no public pricing or billing area.

### Reusable components

- Organisation creation transactions in `OrganisationsService` and `prisma/bootstrap.ts` are the two
  authoritative provisioning paths to extend with a FREE subscription.
- Existing audit primitives, actor resolution, hashing, and transaction helpers can record commercial
  transitions without creating a second audit system.
- Existing organisation usage and storage quota services provide the first metering input. They stay
  operationally authoritative until C5 deliberately connects allowance enforcement.
- Existing branded IDs, immutable domain outcomes, Prisma conventions, Vitest setup, and synthetic
  fixtures establish the implementation pattern.

### Gaps

- No plans, prices, entitlement definitions, plan entitlements, subscriptions, overrides, billing
  accounts, invoices, payments, purchase orders, usage allowances, or cost allocations exist.
- New organisations have no commercial lifecycle record.
- The fixed 5 GiB organisation storage default conflicts with the proposed FREE allowance of 1 GiB;
  C1 records the commercial allowance but does not silently replace the existing operational quota.
  C5 will reconcile enforcement through an explicit adapter and migration.
- There is no provider port, webhook receipt/idempotency store, remittance configuration, billing API,
  pricing route, billing navigation, or administrative reconciliation workflow.

### Proposed changes

1. Add provider-independent C1 domain types and an entitlement evaluator.
2. Add authoritative PostgreSQL tables for plans, prices, entitlement definitions, plan grants,
   billing accounts, subscriptions, and per-subscription overrides.
3. Seed stable FREE, TEAM, ORGANISATION, and INSTITUTIONAL catalogues in the migration, including the
   requested AUD prices and default entitlements.
4. Create a FREE subscription atomically in every organisation provisioning path.
5. Add a proposed ADR establishing payments as replaceable ports and Witness as commercial system of
   record.
6. Deliver customer UX, invoicing, provider adapters, usage accounting, and readiness only in C2-C6.

### Security implications

- Commercial rows are organisation-scoped where they represent customer state; catalogue rows are
  global and contain no customer data. Application queries must remain organisation-scoped.
- Entitlement checks are an additional allow/deny condition after identity, RBAC, tenant isolation,
  consent, and provenance checks. Payment never grants access outside those controls.
- No card, bank credential, remittance value, webhook secret, or provider token belongs in domain
  tables or audit metadata. Future remittance values come only from secure deployment configuration.
- Webhook work in C4 must verify signatures, use an idempotency key, reject replay, tolerate duplicate
  delivery, and preserve raw sensitive payloads only under an explicit retention policy.
- The sovereign profile must continue to start and operate without any external payment provider.

### Migrations required

- C1: additive commercial catalogue and organisation-commercial-state tables, constraints, indexes,
  deterministic catalogue seeds, and FREE backfill for existing organisations.
- C3: invoice, line item, payment method, payment, purchase order, and reconciliation structures.
- C4: provider event/idempotency receipt structures.
- C5: usage records, allowances, attributable costs, and configurable allocation rules/results.

All migrations are expand-only. No current table, quota, role, audit event, or consent/provenance field
is removed or weakened.

### ADRs required

- ADR-0022, “Billing and payments as replaceable ports,” is proposed with C1.
- A later ADR is required before choosing a concrete hosted payment provider or materially changing
  webhook trust boundaries. Adding a provider adapter alone does not change domain rules.

### Implementation sequence

C1 is split into independently reviewable slices: catalogue/domain and tests; additive migration and
seed; FREE provisioning/backfill; validation and documentation. C2-C6 follow only after C1 passes the
complete repository suite. See the commercial implementation roadmap for atomic tasks.

## Commercial domain boundaries

Witness owns `Plan`, `PlanPrice`, `EntitlementDefinition`, `PlanEntitlement`, `Subscription`,
`SubscriptionEntitlementOverride`, `BillingAccount`, `Invoice`, `InvoiceLineItem`, `Payment`,
`PaymentMethod`, `PurchaseOrder`, `UsageRecord`, `UsageAllowance`, and `CostAllocation`.

Providers are adapters that initiate or confirm settlement. Provider references are opaque external
identifiers. They never determine plan access, invoice truth, or subscription state.

Entitlements use stable keys and typed values. Application policy asks for a capability or allowance;
it never branches on a plan name. The initial keys are:

- `users.max`, `active_projects.max`, `storage.gb`, `exports.level`, `ai.allowance.units`
- `session_capture.basic`, `institutional_memory.basic`, `audit.verify`, `workspace.organisation`
- `administration.level`, `api.enabled`, `sso.enabled`, `dedicated_deployment.enabled`
- `support.level`, `invoice_payment.enabled`

Future invoice and payment values use integer minor currency units. Usage quantities use integer base
units and an explicit metric. Percent allocations use basis points so calculations remain exact.

### Later-milestone model design

| Model | Authoritative fields and invariants |
| --- | --- |
| Invoice | Organisation/billing account, immutable issued supplier/customer snapshot, number, status (`DRAFT`, `OPEN`, `PAID`, `OVERDUE`, `VOID`, `REFUNDED`), issue/due dates, currency, subtotal/tax/total minor units, PO/reference; totals derive from line items |
| InvoiceLineItem | Invoice, description, quantity, unit amount, tax category/rate, subtotal/tax/total minor units; issued lines are immutable |
| Payment | Billing account, invoice, type, provider, status, amount/currency, opaque provider reference, received/reconciled timestamps; no credentials |
| PaymentMethod | Billing account, type (`CARD`, `BANK_DEBIT`, `BANK_TRANSFER`, `INVOICE`, `PURCHASE_ORDER`), provider, opaque token/reference and non-sensitive display summary |
| PaymentProvider | Stable code (`STRIPE`, `MANUAL_BANK_TRANSFER`, `PAYTO`, `BECS`, `CUSTOM`), configured capabilities and availability; never a subscription authority |
| PurchaseOrder | Billing account, customer PO/reference, authorised amount/currency, validity dates, document reference and state |
| UsageRecord | Organisation, subscription, metric (`storage`, `ai_processing`, `transcription`, `projects`, `users`), integer quantity/unit, period, source and idempotency key |
| UsageAllowance | Subscription, entitlement/metric, limit, consumed quantity, period and reset policy; consumption never comes from an untrusted client |
| CostAllocation | Versioned category, basis points, effective dates and optional organisation scope; configured rules must total 10,000 basis points |

The initial allocation configuration is infrastructure 15%, AI/API 10%, tax reserve 25%, product
development 15%, operations/support 10%, and business surplus 25%. These are editable defaults, not
tax advice or immutable rules. Allocation records describe internal reserves only and never trigger
a bank transfer. Unit economics will report settled customer revenue minus attributable storage,
compute, AI inference, email, object-storage, and other recorded costs as contribution margin.

## Tax and legal configuration

Witness records configured tax and supplier data; it does not determine legal or tax treatment.
Operators remain responsible for correct legal name, ABN/business identifier, tax rate, invoice text,
and remittance instructions in their jurisdiction.
