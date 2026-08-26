# C3 invoice and procurement domain

**Owner:** Principal Architect & Backend Lead
**Status:** Issue #111 domain implementation; persistence and application effects not implemented
**Review:** Architecture and security review before merge; revisit in issues #112, #115, and #116

This document records the provider-neutral commercial rules implemented by issue #111. Witness
represents receivable and settlement evidence; it does not move money, verify a bank account, or
become an accounting ledger. Revenue Gate B remains unavailable until the complete C3 evidence and
approval requirements in the [procurement workflow](../commercial/PROCUREMENT_WORKFLOW.md) exist.

## Requirement evidence

| Requirement | Baseline before #111 | #111 domain change | Test/evidence |
|---|---|---|---|
| Exact money | Plan prices used integer minor units | `Money` uses non-negative `bigint` minor units and explicit three-letter currency | Exact totals, validation and half-up rounding tests |
| Invoice truth | Target-state documentation only | Organisation-owned invoice and derived line totals | Construction and total tests |
| Lifecycle | No invoice state machine | Fail-closed `DRAFT`, `OPEN`, `OVERDUE`, `PAID`, `VOID`, `REFUNDED` rules | Legal and illegal transition tests |
| Issued meaning | Target-state documentation only | Lines and issue identity can change only in `DRAFT`; issued snapshots are immutable domain outcomes | Draft-edit and snapshot-retention tests |
| Procurement | Commercial request references only | Organisation-owned purchase order with authority, currency, coverage and validity checks | PO issue-boundary tests |
| Manual settlement | Payment preference only | `MANUAL_BANK_TRANSFER` method and non-secret payment evidence | Evidence lifecycle and assessment tests |
| Ambiguous amounts | No rule | Partial and overpayment are explicit non-eligible manual-review outcomes | Assessment matrix |
| Tenant ownership | Organisation is the existing tenant boundary | Invoice, PO, method and payment carry organisation and billing-account ownership | Cross-owner rejection tests |
| Provider independence | ADR-0022 Proposed | No provider SDK, webhook or hosted-provider type in the domain | Domain-purity and dependency checks |

## Domain model

- `Money`: explicit currency and non-negative integer minor units. Floating point is never an
  authoritative amount.
- `InvoiceLineItem`: positive whole-unit quantity, configured unit amount and configured tax rate in
  basis points. Subtotal, tax and total are derived. Tax uses explicit half-up minor-unit rounding.
- `Invoice`: organisation and billing-account owner, currency, derived totals, lifecycle, optional
  customer/PO reference and immutable issue identity.
- `PurchaseOrder`: organisation and billing-account owner, customer reference, authorised amount,
  currency, validity and state.
- `PaymentMethod`: only the first-class `MANUAL_BANK_TRANSFER` domain method in #111. It contains
  ownership and method identity only, not remittance details or credentials.
- `Payment`: non-secret evidence observed outside Witness, including stable source reference,
  invoice/tenant ownership, amount, currency, received time and verification lifecycle.

The model does not infer tax jurisdiction. Tax rate and customer/supplier meaning are
human-reviewed inputs. Fractional line-item quantities, credit notes, multiple partial-payment
aggregation and allocation across invoices are not supported by #111.

## Invoice state machine

| From | To | Required evidence/rule |
|---|---|---|
| `DRAFT` | `OPEN` | Unique number supplied later by persistence; valid issue/due dates; referenced PO is authorised, current, same-owner, same-currency and sufficient |
| `DRAFT` | `VOID` | Non-empty reason |
| `OPEN` | `OVERDUE` | Evaluation time is later than due time |
| `OPEN` | `PAID` | Exact, verified, same-invoice, same-owner payment evidence |
| `OPEN` | `VOID` | Non-empty reason |
| `OVERDUE` | `PAID` | Exact, verified, same-invoice, same-owner payment evidence |
| `OVERDUE` | `VOID` | Non-empty reason |
| `PAID` | `REFUNDED` | Reversed payment evidence for the same invoice and owner, plus reason |

`VOID` and `REFUNDED` are terminal in #111. All unlisted transitions fail closed. Marking an invoice
`PAID` is a domain eligibility rule only; #111 has no controller, database transaction,
reconciliation authority, subscription transition or entitlement effect.

## Settlement assessment

Payment evidence begins `UNVERIFIED`. An authorised application in a later issue may record
`VERIFIED` or `REJECTED`; verified evidence may later become `REVERSED`. Only `VERIFIED` evidence for
an `OPEN` or `OVERDUE` invoice with exact owner, billing account, invoice, currency and total is
eligible for reconciliation.

`PARTIAL`, `OVERPAYMENT`, currency mismatch, wrong owner, wrong invoice, unverified evidence, and
non-receivable invoice are explicit non-eligible outcomes. #111 does not guess whether to allocate,
credit, refund or activate access.

The stable evidence identity is organisation + method + source reference. Issue #112 must enforce
that identity durably. Issues #115 and #116 must prove transactional reconciliation and exactly-once
commercial/entitlement effects; an in-memory domain key alone is not that proof.

## Threat model and control disposition

`Planned` below means the control is not implemented by #111.

| Threat | Prevent | Detect | Audit | Recover |
|---|---|---|---|---|
| Duplicate settlement notification | Stable evidence identity; durable uniqueness planned in #112 | Duplicate-key conflict planned | One receipt plus duplicate observation planned | Re-query canonical receipt; no second effect (#115/#116) |
| Replayed settlement evidence | Same identity as original; replay store planned | Duplicate/replay metric planned | Record replay without a second payment claim | Operator review; retain original evidence |
| Settlement attached to wrong invoice | Payment carries invoice ID; exact match required | `INVOICE_MISMATCH` | Rejection fact planned | Correct through a new authorised evidence record, never rewrite history |
| Invoice attached to wrong organisation | Organisation and billing-account ownership are explicit | Owner mismatch fails domain validation | Attempt/rejection planned | Correct draft or void/supersede issued invoice |
| Cross-tenant invoice access | Application authorization and scoped query required in later API issue | Adversarial suite #117 | Denied-access audit where policy permits | Incident response; no domain transition |
| Cross-tenant settlement access | Same-owner method/payment/invoice rules plus later authorization | `TENANT_MISMATCH`; #117 tests | Denied mutation/reconciliation planned | Reject evidence; investigate attempted access |
| Currency mismatch | Exact currency equality | `CURRENCY_MISMATCH` | Assessment/rejection planned | Manual review or new correct evidence |
| Amount mismatch | Exact total required | `PARTIAL` or `OVERPAYMENT` | Assessment planned | Hold for manual review; no automatic allocation/refund |
| Partial settlement | Not eligible for normal reconciliation | Explicit `PARTIAL` | Evidence retained later | Allocation policy requires separate design |
| Overpayment | Not eligible for normal reconciliation | Explicit `OVERPAYMENT` | Evidence retained later | Credit/refund policy requires human decision and later design |
| Void invoice settlement | Only `OPEN`/`OVERDUE` is receivable | `INVOICE_NOT_RECEIVABLE` | Exception planned | Manual correction; never normal activation |
| Settlement reversal/refund | `PAID → REFUNDED` requires same-owner payment evidence with status `REVERSED`, plus a reason | Illegal/mismatched reversal fails | Reversal/refund facts planned | Later subscription policy must decide access; #111 does not |
| Issued invoice mutation | Draft-only line replacement; issued identity/totals retained across transitions | Illegal transition | Issue/void/supersession facts planned | Void and issue replacement; never rewrite issued meaning |
| Manual operator error | Domain validation; later least privilege and confirmation | Reconciliation exception and review planned | Actor and reason required later | Correction workflow in #115; append, do not erase |
| Provider outage | No hosted provider or network dependency in #111 | Adapter health belongs to demand-gated C4 | Provider incidents later | Manual path remains provider-independent |
| Malicious provider payload | No provider payload boundary in #111 | Signature/schema/replay controls belong to C4 | Verified event receipt later | Reject/quarantine without commercial effect |
| Entitlement activation before settlement | #111 has no entitlement operation; exact verified evidence is only eligibility | #116 invariant suite | Transition/application audit planned | Atomic forward-fix in #116 |
| Duplicate entitlement application | No entitlement operation; durable applicator identity required in #116 | Concurrency/invariant tests planned | One canonical application event planned | Idempotent replay of canonical application |
| Reconciliation race | No reconciliation operation; database constraint/transaction required later | Concurrency tests in #112/#115/#116 | Winning/duplicate attempts planned | Reload canonical state; no second effect |
| Commercial audit deletion/mutation | Existing append-only hash-chain architecture; commercial events not added in #111 | Chain verification | Future invoice/payment/reconciliation subjects/actions | Restore and incident process; never silently reconstruct claims |

## Future audit facts

Later application issues must use the existing append-only audit architecture for invoice creation,
issue, overdue/void/refund transitions, payment evidence receipt and verification/rejection/reversal,
reconciliation, commercial transition and entitlement application. Metadata may contain stable IDs,
status, currency and non-sensitive reason codes. It must not contain bank details, credentials, card
data, provider secrets or raw confidential payloads.

## Explicitly remaining

- #112: Prisma schema/migration, foreign keys, invoice numbering and durable idempotency uniqueness.
- #113: billing profile and immutable supplier/customer issue snapshots.
- #114: authenticated issuance/rendering and secret-backed remittance presentation.
- #115: authorised manual reconciliation and correction workflow.
- #116: atomic exactly-once settlement-to-subscription/entitlement application.
- #117: persisted/API commercial tenant-isolation adversarial suite.
- #120/C4 evidence gate: decide whether provider automation is justified; no hosted integration is
  implied.

ADR-0022 remains **Proposed**. #111 demonstrates provider-free domain rules, but not persisted
invoice/payment truth, exactly-once application, or manual/fake port replaceability.
