# Billing profile and invoice snapshot runbook

**Status:** Controlled-pilot operator guidance; Revenue Gate B remains **UNAVAILABLE**.

## Configuration boundary

Billing configuration is optional. A deployment runs normally with no billing profile, but invoice
issuance must report unavailable. If any billing variable is supplied, the complete reviewed set is
required: `BILLING_LEGAL_NAME`, optional `BILLING_BUSINESS_IDENTIFIER`, `BILLING_ADDRESS`,
`BILLING_EMAIL`, `BILLING_BANK_ACCOUNT_NAME`, `BILLING_BANK_BSB`, and
`BILLING_BANK_ACCOUNT_NUMBER`. `BILLING_PAYMENT_INSTRUCTIONS` is optional.

Values are deployment secrets/configuration and must never be committed. Use placeholders in
operator systems, review supplier entity and remittance instructions with legal/tax/procurement
professionals, and do not infer tax jurisdiction or bank ownership from format validation.

## Classification and prohibition

Supplier name and business identifier are authenticated commercial facts. Address and billing email
are authenticated commercial facts. Account name, routing identifier and account number are
sensitive remittance. Online-banking usernames/passwords, MFA secrets, PINs, card PAN/CVV, bank API
secrets and provider webhook secrets are prohibited from billing profile and invoice snapshots.

## Rotation and absence

Rotate configuration through the deployment secret manager, then restart/reload according to the
deployment procedure. Rotation affects only future snapshots: an issued invoice retains its reviewed
supplier/customer facts and restricted remittance snapshot. To disable issuance, remove the profile;
partial or malformed configuration fails closed and never substitutes placeholders.

## Redaction and review

Remittance values must not appear in logs, errors, metrics, traces, audit metadata, public catalogue,
health/readiness responses or unauthenticated pages. Verify this with synthetic values during a
deployment review. Configuration presence is not professional approval; retain evidence of human
legal, tax, security and procurement review in the authorised evidence room.

Invoice rendering and authenticated remittance presentation are #114 scope. This milestone defines
the snapshot contract and storage boundary only; it does not process payments, reconcile settlement
or activate entitlements.
