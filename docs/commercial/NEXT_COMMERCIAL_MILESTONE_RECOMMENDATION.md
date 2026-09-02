# Next Commercial Milestone Recommendation

**Owner:** Product, Engineering, Security and Operations
**Status:** Implemented in repository on 2026-09-01; no subsequent milestone authorised
**Date:** 2026-09-01

## Exactly one next milestone

This recommendation was accepted. Its application service, migration, internal API/UI, truthful
customer status display, audit events and tests are now implemented. Production deployment remains
excluded, and this update neither recommends nor starts a subsequent milestone.

**Complete provider-neutral manual invoice settlement and paid subscription activation.**

### Objective

Allow an authorised Witness platform operator to reconcile reviewed manual bank-transfer or approved
institutional settlement evidence against an OPEN/OVERDUE invoice and atomically:

1. record an immutable Payment;
2. mark the invoice PAID exactly once;
3. apply the already-requested plan/subscription transition;
4. make the purchased capabilities evaluable; and
5. append attributable audit events.

### Why this is next

It closes the largest false seam in existing functionality: Witness can capture upgrade intent and
issue an invoice, and already has domain/persistence rules for payment, but cannot turn verified
settlement into access. Completing this path reuses existing models, supports institutional and
sovereign operation without a provider, and provides the evidence ADR-0022 requires before hosted
payments. Starting contacts, contracts, SSO or a Stripe adapter first would leave the immediate paid
path broken.

Implementation is gated on approval of the tenancy reconciliation ADR or an explicit architectural
waiver confirming that the milestone may use existing organisation-scoped composite constraints and
repository enforcement. The recommendation itself grants neither.

### Included scope

- application service/port for reviewed manual settlement evidence;
- idempotent reconciliation keyed by organisation, method and source reference;
- exact invoice/payment currency and amount rules, including explicit partial/overpayment behavior;
- stale commercial-change protection using the captured source subscription version/timestamp;
- atomic payment, invoice, change-request and subscription transition;
- platform-operator reconciliation API and minimal internal operations UI/command;
- organisation-admin read-only invoice/payment status/list UI;
- auditable correction/forward-fix path for rejected duplicate or mismatched evidence;
- production runbook and non-secret readiness/diagnostic signal.

### Explicitly excluded

- Stripe/card checkout, webhooks, refunds automation or bank APIs;
- new agreements/contracts, contacts/domains, renewal, tax advice or accounting ledger;
- per-organisation SSO, hosting/residency or operational email;
- automatic entitlement approval from email/AI;
- changes to tenancy behavior or RLS rollout;
- direct production data migration during implementation review.

### Affected domain models

Reuse `BillingAccount`, `Invoice`, `PaymentMethod`, `Payment`, `Subscription`,
`CommercialChangeRequest`, plan grants and entitlement evaluation. Extend domain transition results
only where needed to express one reviewed settlement outcome; do not introduce parallel invoice,
payment or entitlement models.

### Migrations required

Prefer **none** until a schema gap is proven. Existing tables already carry payment evidence,
organisation composite FKs, invoice states and source uniqueness. If exactly-once application needs
a durable receipt/application marker not expressible by existing rows, propose one additive migration
after tenancy ADR approval, with a unique organisation-scoped idempotency key and no backfill that
changes customer state.

### APIs affected

- add platform-operator settlement/reconciliation mutation;
- add organisation-scoped invoice list and payment-status reads;
- keep existing issue/get/render and change-request contracts compatible;
- no provider/webhook endpoint.

### UI affected

- minimal internal reconciliation queue/form showing safe invoice totals/references and explicit
  confirmation;
- organisation billing page gains invoice/payment status/history and accurate manual-payment copy;
- CARD must be hidden or clearly unavailable until a provider exists;
- no broad operations-console redesign.

### Authorization changes

- introduce narrowly named platform actions such as payment reconciliation/read, separate from
  organisation admin invoice reads;
- require real authenticated sessions; never permit development-header reconciliation;
- derive and verify Organisation on every invoice/payment/change/subscription row;
- entitlement remains a restriction and cannot override RBAC/consent/tenancy.

### Provenance requirements

- actor, organisation, invoice, payment, source-reference digest/safe identifier, amount/currency,
  reviewed reason and before/after state are recorded in existing hash-chained audit transactions;
- bank credentials, raw bank statements, signed documents and unnecessary customer data are excluded
  from audit metadata;
- AI may suggest a match but cannot confirm settlement or activate access.

### Test requirements

- domain transition matrix: exact, partial, duplicate, overpayment, wrong currency, void/paid/refunded,
  stale change, cancelled/suspended subscription;
- application transaction rollback at every write boundary;
- concurrent duplicate evidence changes state at most once;
- cross-organisation invoice/account/method/change rejection at API and database levels;
- platform/customer role separation and fail-closed policy tests;
- audit chain/action/redaction assertions;
- migration/persistence probe if a migration is approved;
- UI accessibility/error/loading/duplicate-submit tests;
- full repository, invariant and adversarial suites.

### Production deployment implications

- apply no provider secret or egress requirement; sovereign operation remains valid;
- billing profile must be complete and reviewed for invoice issuance;
- deploy additive code before enabling operator action; verify migrations/schema compatibility and
  current commercial row counts without exposing customer data;
- provide reconciliation permissions to a minimal platform role and train authorised operators;
- observe audit and idempotency outcomes, not payment content.

### Rollback approach

Disable the reconciliation mutation/UI while retaining immutable Payment/Invoice/audit history.
Never delete or rewrite an issued invoice/payment to roll back code. If a subscription transition was
incorrect, use a reviewed forward correction with its own audit event. Any additive receipt column or
table remains tolerated by the previous build and is removed only in a later reviewed migration.

### Acceptance criteria

1. One reviewed manual settlement activates the intended paid subscription/capabilities exactly once.
2. Duplicate/concurrent delivery produces the same result without a second payment or activation.
3. Wrong organisation, currency, amount, invoice state, stale intent or unauthorized actor fails
   without partial writes.
4. Organisation admins can see invoice/payment status but cannot reconcile it.
5. Platform reconciliation cannot use development identity and produces a complete redacted audit
   chain.
6. Sovereign profile operates with zero payment-provider egress.
7. Repository, invariant, adversarial, documentation and production-shaped persistence tests pass.
8. No claim is made that card checkout, contracts, renewal or automated banking exists.
