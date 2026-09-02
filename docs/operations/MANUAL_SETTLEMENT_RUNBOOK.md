# Manual Invoice Settlement Runbook

**Owner:** Witness Commercial Operations
**Status:** Implemented; requires controlled deployment and verified platform operator access
**Last reviewed:** 2026-09-01

## Purpose

This runbook records an externally verified institutional bank receipt and applies reviewed
commercial intent. Entering a reference, choosing invoice/bank transfer, or issuing an invoice is
never proof of payment. The operator must independently verify cleared funds first.

## Preconditions

- The Organisation, billing account and current subscription exist.
- A PENDING paid `CHANGE_PLAN` request records the requested plan, interval, institutional method and
  source-subscription snapshot.
- One OPEN or OVERDUE invoice is linked to that request and exactly matches its active catalogue
  price/currency.
- The operator has a verified session and platform-scoped role granting `payment:settle`.
  Organisation-admin access is insufficient.
- No banking credentials, secret remittance text, tokens or passwords are copied into Witness.

## Procedure

1. Independently verify money has arrived in the authoritative external banking record.
2. Open `/operations/organisations/{organisationId}/invoices/{invoiceId}/settle`.
3. Review the customer, invoice status/total, requested plan and commercial intent.
4. Enter the received date/time and a safe, non-secret transaction/reference identifier.
5. Review the confirmation and select **Confirm settlement** once.
6. If the request times out, retry the same form submission; its idempotency key is retained. Never
   invent a second reference for the same receipt.
7. Confirm Payment recorded, Invoice PAID, Subscription ACTIVE, resolved plan and effective time.
8. Where required, inspect audit history for `payment.settled`, `invoice.paid` and
   `subscription.activated`.

## Failure handling

- Wrong organisation, currency, amount, duplicate reference, PAID/VOID invoice, missing/non-pending
  intent or stale snapshot is a hard refusal. Do not edit the database to bypass it.
- Any activation/audit failure rolls back payment, invoice, request and subscription changes.
- Partial payments and overpayments are unsupported. Escalate for an approved receivables workflow.
- Corrections, reversals and refunds are not implemented. Preserve evidence and escalate.

## Implementation boundary

- **IMPLEMENTED:** provider-neutral manual settlement, exact-payment reconciliation, paid activation,
  entitlement evaluation, idempotency and audit history.
- **MANUAL:** independent verification that external money actually arrived.
- **NOT IMPLEMENTED:** card checkout, Stripe, provider webhooks, automated bank reconciliation,
  partial/overpayment allocation, reversal/refund/correction workflows and dual approval.
