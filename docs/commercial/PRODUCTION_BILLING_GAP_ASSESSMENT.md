# Production Billing Gap Assessment

**Owner:** Product, Engineering and Operations
**Status:** Original diagnosis updated after implementation; no deployment/provider change
**Date:** 2026-09-01

## Finding

The reported failure was primarily **unfinished application orchestration**. The repository now
contains provider-neutral manual settlement and paid activation, but production remains unchanged
until the migration/code are deliberately deployed and a platform operator role is assigned.

Checkout failure is not plausibly a Stripe-secret or webhook-routing defect because no
Stripe/provider adapter, checkout endpoint or webhook endpoint exists. Invoice issuance and manual
settlement now exist and are tested, but issuance is API-only and requires a complete billing profile.
Source inspection cannot establish whether production has
the required non-secret configuration or migrated data, so those remain verification items rather
than asserted causes.

## Trace

### Invoice creation

- Route: `POST /api/v1/organisations/:organisationId/invoices`.
- Authorization: `invoice:create`; real session resolves the route Organisation and live scoped role.
  Development-header invoice access is localhost-only.
- Input: billing account ID, idempotency UUID, customer snapshot, currency, due date, optional PO and
  exact line/tax values.
- Service: validates complete `billingProfile`, same-organisation billing account/PO and currency;
  allocates a per-organisation number; creates DRAFT + lines + supplier/customer/remittance snapshot;
  atomically opens it and appends `invoice.issued` audit.
- Tests: service idempotency/config/isolation behavior, renderer escaping and domain/persistence
  constraints. No controller E2E against a production database is present.
- Failure modes: `BILLING_UNAVAILABLE` when profile is absent; missing account/PO; currency mismatch;
  migration/function/trigger absent; unauthorized caller; request construction errors.

### Invoice retrieval

- Routes: `GET .../invoices/:invoiceId` and `GET .../:invoiceId/render`.
- Retrieval requires matching `organisationId` and non-DRAFT status. Render additionally requires a
  remittance snapshot and returns an HTML attachment, not PDF.
- No list endpoint, invoice-centre UI or link from the billing page exists. A user cannot discover an
  invoice ID through the product UI. No invoice email is sent.

### Checkout/payment

- There is no checkout endpoint, payment-provider port implementation, Stripe SDK/configuration,
  hosted payment page or client call.
- The billing UI records `paymentMethod: CARD | BANK_TRANSFER | INVOICE` only on a
  `CommercialChangeRequest`. Its copy explicitly says paid service is not activated.
- Therefore “card checkout does nothing” is expected from current code, not a deployment fault.

### Provider configuration and webhooks

- Billing configuration contains supplier identity and manual bank remittance snapshot values only.
- No provider credentials or webhook secret schema exists.
- No webhook controller/receipt table/signature validation/replay handling exists.
- ADR-0022 remains Proposed and C4/provider work is demand-gated.

### Settlement (implemented, production unverified)

- Domain functions model verified payment evidence, settlement, overdue/refund and invoice state.
- Schema/migrations model `PaymentMethod` (currently `MANUAL_BANK_TRANSFER`) and `Payment`, with
  composite organisation constraints and duplicate source-reference prevention.
- The settlement service, authenticated internal route and minimal operator page now write exact
  VERIFIED evidence, mark the invoice PAID, apply the subscription change and append audit history
  atomically. Duplicate evidence and stale snapshots fail closed.
- The persistence CI probe inserts synthetic payment rows directly to test constraints; it is not a
  production settlement path.

### Entitlement/subscription activation (implemented, production unverified)

- New organisations atomically receive FREE; the evaluator reads current plan grants and overrides.
- Upgrade/quote requests remain PENDING intent and preserve the source subscription timestamp.
- Settlement consumes only a linked PENDING paid change, updates its source subscription to the
  requested plan/interval and ACTIVE state, preserves overrides, and returns the existing evaluator
  result. Failed activation rolls back payment and invoice mutations.

## Cause classification

| Candidate | Finding |
|---|---|
| Unfinished implementation | **Original confirmed cause; manual reconciliation/activation is now implemented in code, awaiting controlled deployment** |
| Configuration | **Possible invoice-only cause:** a missing/partial billing profile makes issuance unavailable/refuses startup; production values not inspected |
| Missing environment secrets | **Not a payment-provider cause:** no provider secrets are defined; supplier/remittance values are configuration, not payment credentials |
| Provider integration | **Confirmed absent by design:** no adapter/SDK/port implementation |
| Webhook routing | **Not implemented:** no route to misroute |
| Deployment difference | **Possible invoice-only factor:** deployed revision/migrations/profile may differ; not provable from repository state |
| Database state | **Possible invoice-only factor:** account/FREE backfill, invoice migrations and billing profile-dependent request data must exist; production DB was not queried |
| UI wiring | **Partially resolved:** customer billing lists truthful states and an internal direct settlement page exists; an operations queue remains absent |
| Intentionally deferred | **Still true for checkout/providers/webhooks; no longer true for manual settlement/activation** |

## Safe production verification checklist

An authorised operator can distinguish the remaining invoice-only factors without exposing values:

1. Verify deployed revision includes invoice controllers/migrations.
2. Verify all commercial migrations are applied by migration name/status, not by dumping data.
3. Verify billing profile is reported internally as complete/available without printing its fields.
4. Verify target Organisation has one billing account and one current subscription using counts/IDs
   only under approved database access.
5. Exercise invoice issuance with synthetic reviewed customer data and an idempotency key in a
   non-production environment first; verify OPEN status and audit-chain append.
6. Exercise one exact synthetic settlement in staging using a verified platform operator; confirm the
   payment, invoice, request, subscription, entitlement and audit results. Do not expect checkout or
   webhook behavior.

No secrets, production configuration values or customer billing details were read or copied during
this assessment.

## Known defects and limitations

- HTML is labeled/downloaded as an invoice document; PDF is not implemented.
- No invoice listing means issued invoices are operationally hard to retrieve.
- Customer billing identity is supplied per issuance rather than selected from reviewed Organisation
  contacts.
- Partial payments, overpayments, corrections, reversals and refunds have no supported application
  workflow and must not be represented through this endpoint.
- Manual verification that funds arrived remains an operator responsibility; a reference is evidence
  identity, never self-authenticating proof of money movement.
- RLS is absent. Commercial composite keys prevent cross-organisation relational linkage, while API
  reads still rely on repository/authorization enforcement.
