# ADR-0022: Billing and payments as replaceable ports

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-08-25 |
| **Deciders** | CTO, Principal Architect, Product Lead |
| **Consulted** | Security Lead, Operations Lead, Finance/Legal advisers |
| **Related** | ADR-0003, ADR-0004, ADR-0009, ADR-0013 |
| **Principles engaged** | P1 (digital sovereignty), P6 (replaceability), P7 (boring technology) |

**Board recommendation (2026-08-26):** keep this ADR Proposed. Consider acceptance after C3 proves
that Witness owns invoice/payment truth, exactly-once settlement-to-entitlement application is
demonstrated, and a C4.1 manual/fake provider port proves replaceability. A Stripe or other hosted
provider integration is not required for acceptance. C4 implementation remains demand-gated by real
customer evidence.

## Context

Witness must support self-service upgrades and institutional procurement without making a hosted
payment company part of the product's meaning or its sovereign operating baseline. Card processors,
bank-debit networks, PayTo/BECS providers, and regional Pacific providers differ by jurisdiction and
will change during Witness's design life. Some deployments cannot make any external call.

The dangerous shortcut is to treat a provider subscription or price object as the authority for what
an organisation may do. That would couple entitlement, invoice, and renewal rules to one vendor,
prevent offline/manual settlement, and make a provider outage an authorisation outage.

## Decision

> Witness owns all commercial state and rules. Payment providers are replaceable adapters that move
> money or confirm settlement; they never become the system of record for entitlement.

PostgreSQL stores plans, prices, entitlement definitions and grants, subscriptions, billing accounts,
invoices, payments, payment methods, purchase orders, usage, allowances, and cost allocations.
Commercial domain operations depend only on Witness identifiers and values.

Provider interaction crosses a `PaymentProviderPort` with capabilities equivalent to
`createCheckout`, `createMandate`, `requestPayment`, `verifyPayment`, `refundPayment`, and
`handleWebhook`. Provider-specific identifiers and payload mappings remain in adapters. No Stripe or
other provider SDK type may appear in domain entities, entitlement evaluation, subscription state
transitions, or invoice rules.

The manual-bank-transfer adapter is a first-class implementation. A sovereign deployment can issue an
invoice, receive funds outside Witness, and have an authorised operator reconcile settlement without
any external network call. Hosted adapters are opt-in and unavailable unless deployment policy and
configuration permit them.

Identity, RBAC, tenant isolation, consent, and provenance remain authoritative. An entitlement can
deny an otherwise authorised commercial capability; it can never grant a capability RBAC or another
governance control denies.

## Options considered

### Option A — Witness-owned commercial state behind provider ports *(chosen)*

**Pros:** supports manual invoices and sovereign deployments; providers remain replaceable; commercial
history survives provider changes; entitlement remains available during provider outages; regional
payment methods fit without rewriting domain rules.

**Cons:** Witness must implement and operate subscription, invoice, reconciliation, and webhook state
carefully; provider state must be reconciled rather than simply displayed; more domain and migration
work than delegating everything to a hosted platform.

### Option B — Make Stripe Billing the commercial system of record

**Pros:** mature checkout, invoicing, recurring billing, retries, customer portal, and webhook
ecosystem; less initial application code.

**Cons:** contradicts the sovereign no-egress baseline; excludes manual/offline procurement as an
equal path; leaks vendor concepts into entitlement rules; migration away from Stripe becomes a domain
migration rather than an adapter replacement. Rejected.

### Option C — Manual invoicing outside Witness only

**Pros:** quickest route to first institutional revenue; no payment SDK or webhook attack surface.

**Cons:** cannot provide self-service upgrades; commercial state becomes spreadsheets/email and drifts
from access; reconciliation is unauditable and operator-dependent. Rejected as the architecture,
retained as the first settlement adapter.

### Option D — Abstract only checkout, leave subscriptions at each provider

**Pros:** smaller local model while allowing multiple checkout vendors.

**Cons:** still makes provider state authoritative for access and produces inconsistent lifecycle
semantics across card, direct debit, invoice, and purchase-order paths. Rejected.

## Consequences

### Positive

- FREE subscriptions and entitlement evaluation work without any payment-provider configuration.
- Invoice/bank-transfer procurement is not a second-class exception.
- Adding Stripe, PayTo/BECS, or a regional provider changes adapters and configuration, not commercial
  domain rules.
- Customer commercial history is backed up with the same PostgreSQL system of record as Witness.
- Provider outages cannot broaden or erase entitlement state.

### Negative

- Witness owns the correctness burden for invoice totals, subscription transitions, reconciliation,
  and commercial audit history.
- Provider reconciliation needs explicit drift detection and operator tooling.
- Tax configuration and invoice requirements vary by jurisdiction and require qualified human review.
- The payment boundary introduces a high-value webhook and administration attack surface in later
  milestones.

### Risks accepted

- Local state may temporarily disagree with provider state. Settlement events are processed
  idempotently, discrepancies are surfaced, and entitlement changes occur only through Witness domain
  transitions.
- Manual reconciliation is susceptible to operator error. It is auditable and designed to be replaced
  by automated reconciliation without changing invoice or subscription rules.

## Compliance and enforcement

- Domain-purity checks prohibit provider/framework imports in `packages/domain`.
- Domain tests evaluate access from entitlement keys and overrides, with no plan-name branching.
- Adapter contract tests must run against every payment provider implementation.
- Sovereign profile tests must pass with only the manual provider registered and zero provider egress.
- Webhook endpoints must verify signatures before use, persist a unique provider event ID, resist
  replay, tolerate duplicate delivery, and redact secrets/payload credentials from logs and audit.
- Code review rejects provider SDK types outside adapter modules and provider-derived entitlement
  decisions.

## Reversal

Moving commercial authority to one provider would require migrating every plan, subscription,
invoice, payment, and entitlement plus changing sovereign deployment guarantees. Individual adapters
can be replaced or removed without reversing this decision.

## References

- [`WITNESS_COMMERCIAL_FOUNDATION.md`](../../docs/product/WITNESS_COMMERCIAL_FOUNDATION.md)
- [`COMMERCIAL_IMPLEMENTATION_ROADMAP.md`](../../docs/engineering/COMMERCIAL_IMPLEMENTATION_ROADMAP.md)
- [`Commercial programme`](../../docs/commercial/README.md)
