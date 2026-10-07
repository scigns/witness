# First real organisation onboarding

**Status:** Operator procedure prepared; production use blocked by release gates **Owner:** Platform
operations

Use this procedure only after
[production acceptance](../release/PRODUCTION_ACCEPTANCE_2026-10-05.md) passes and the release
manager approves the deployed SHA. Never onboard real confidential information to a candidate
environment. Test first with a clearly labelled synthetic organisation.

Before issuing an invoice, verify the reviewed supplier profile using the
[billing profile runbook](BILLING_PROFILE_RUNBOOK.md). Missing supplier configuration blocks onboarding.

No SQL or source edits are part of client origination. Initial platform bootstrap is a separate,
one-time deployment control; it must never grant a customer platform administrator authority.

## Operator procedure

1. **Organisation:** Sign in to `https://app.buildwithwitness.com` with an approved platform
   account. Open `/operator`, then **Create organisation**. Enter the institution name, profile and
   verified first administrator email/name. Record the returned organisation identifier. For an
   existing client, select it from the operator customer list instead of creating another identity.
2. **Billing identity:** Open **Commercial onboarding** for that organisation. Its server-created
   billing account is reused. Enter the customer's legal name, billing address and optional billing
   email. Issued invoices snapshot this identity; later edits must not rewrite an issued invoice.
3. **Plan:** Select an approved paid catalogue plan and monthly/annual interval. Review capabilities
   and desired isolation under **Allocation and usage**. A quoted plan or unavailable allocation
   blocks origination; do not substitute a cheaper plan without a commercial agreement.
4. **Negotiation:** Under **Allocation and usage**, apply only approved entitlement overrides with
   the agreement reference in the required reason. Use an explicit storage override only when
   negotiated; otherwise clear it so effective ResourceProfile allocation follows subscription
   changes. These are platform controls, never customer-admin privileges. Review customer
   billing/agreements at `/organisations/<organisation-id>/billing` to record supported agreement
   terms.
5. **Invoice:** Return to **Commercial onboarding**. Enter agreement/customer reference, future
   payment due date and approved tax basis points. Confirm subtotal/currency against the agreement,
   then **Issue invoice**. Subtotal is validated against the server catalogue. Retain the invoice
   identifier and number. Use existing invoice render/download controls for delivery; do not claim
   automated invoice email exists unless it has been verified.
6. **Payment:** After external funds are actually verified, open **Record received payment and
   activate subscription**. Confirm the immutable amount/currency, actual receipt time and unique
   bank/source reference. Submit once; retry the same attempt after a network failure. Never record
   an expected transfer as received funds. Retain the returned payment and receipt identifiers.
7. **Activation:** Verify invoice PAID, payment VERIFIED and subscription ACTIVE. Reopen commercial
   configuration to confirm effective entitlements and negotiated overrides. Failed settlement
   blocks access approval; never activate by direct database manipulation.
8. **Tenant:** Record the effective technical tenant separately from the organisation. An unassigned
   organisation resolves to its own technical tenant identifier under ADR-0034. Do not confuse this
   logical boundary with a dedicated physical deployment.
9. **ResourceProfile:** Confirm the resolved profile is active, matches the agreement and yields the
   intended storage allocation. Check committed + reserved bytes and available capacity. A legacy
   fixed quota may need an authorised operator correction to follow the profile.
10. **Provisioning:** Compare desired isolation/profile with verified observed allocation.
    DEDICATED, ISOLATED_DATA or SOVEREIGN commitments must not be approved from a plan enum alone.
    For supported SHARED profiles, use **Verify allocation and record evidence**. Require observed
    READY, matching desired profile/fingerprint, a current `shared-runtime` evidence reference and
    an `organisation.provisioning_verified` audit event. The adapter checks the serving database,
    tenant mapping and both storage namespaces. This attests shared-pool access; it does not promise
    dedicated compute or additional workers. Unsupported higher isolation remains NOT_PROVISIONED.
    Missing provider evidence or incomplete provisioning blocks client onboarding.
11. **First admin:** Ensure the named administrator can authenticate at the configured identity
    provider with the verified email. The organisation-created invited user activates through
    verified sign-in; operator creation does not prove an IdP account or delivered invitation
    exists. Verify controlled invitation/recovery delivery using the existing People/invitation
    workflow. No platform role is granted to the client administrator.
12. **Workspace:** Have the administrator sign in and open `/workspaces`. Confirm organisation
    context, create the first program and grant only the supported member roles required for the
    client's work.
13. **Quota:** Upload a small non-confidential acceptance resource. Verify committed usage increases
    by its bytes, reserved usage returns to zero, available storage decreases and the upload is
    readable only in its authorised program. Perform quota rejection tests in the synthetic
    organisation.
14. **Usage visibility:** Sign in as the organisation administrator and verify usage is visible
    for this organisation only, with used/reserved/available values matching the operator view.
15. **Support:** Give the client the approved support contact and contracted SupportLevel. Confirm
    the public contact route reaches the monitored support destination. Record the operator owner
    and escalation path; do not invent response-time guarantees.
16. **Audit trail:** Verify organisation creation, commercial changes, settlement, provisioning
    verification and upload events belong to the correct organisation and acting operator/member.
17. **Final check:** Reopen operator allocation/usage and billing: organisation, subscription,
    invoice, payment, receipt, entitlements, tenant, provisioning evidence and audit chain must
    agree. Confirm backup/recovery coverage, invite delivery and member access. Record deployed SHA
    and onboarding evidence. Archive synthetic work according to governance; retain immutable
    financial/audit history.

## Release condition

Use the latest [release reconciliation](../release/PRODUCTION_RECONCILIATION_2026-10-06.md)
for candidate identity and gate evidence. The earlier isolated restore, object recovery, migration
and rollback proofs remain recorded there. New runtime code must pass its own exact-candidate
validation; production acceptance and controlled external invitation/recovery delivery are required
before first-client onboarding. Catalogue-priced origination is supported; negotiated quote-priced
origination is not offered by this flow. Do not promise unsupported provisioning modes.
