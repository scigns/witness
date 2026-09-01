# Production Commercial Path

**Owner:** Product and Engineering
**Status:** Implemented-code journey; controlled production deployment not yet performed
**Date:** 2026-09-01

## Journey result

Witness now supports the central paid revenue gate from reviewed commercial intent through invoice,
manual external settlement confirmation and capability activation. Contract formation, external
money movement, onboarding, support and renewal still require human processes outside Witness.

| Transition | Current performer | Works? | Human intervention | Transition evidence | Missing |
|---|---|---|---|---|---|
| Website/enquiry → Organisation | Public `/pricing`; platform operator uses organisation creation UI/API | Partial | Yes: enquiry handled outside Witness; platform admin creates customer | plan catalogue read; `organisation.created`, billing account, FREE subscription/admin membership | lead/enquiry capture, qualification, self-service trial start, contact/domain records |
| Organisation → Trial or proposal | Customer admin can submit quote/plan change intent; pilot templates used externally | Partial | Yes | `CommercialChangeRequest` with actor, source subscription snapshot and audit event; external proposal documents | trial start/expiry workflow, proposal aggregate/version, accountable owner |
| Trial/proposal → Contract | Commercial/legal process outside product | No product transition | Yes, entirely | executed documents stored outside repository according to guidance | agreement, parties/signatories, versions, document digest/reference, status/audit |
| Contract → Subscription | FREE subscription is provisioned; paid `CHANGE_PLAN` intent snapshots the source subscription | Partial | Yes: agreement remains external | request row, source subscription/time and audit | first-class agreement authority link |
| Subscription → Invoice | Admin-only issuance requires one linked pending institutional `CHANGE_PLAN`; subtotal must equal the active catalogue price | Works in tests | Yes | immutable invoice/link/snapshots, number and issue audit | issuance UI/email and canonical billing contact |
| Invoice → Payment | Customer can read remittance only if given render endpoint; transfer occurs externally | Partial | Yes, entirely | bank instruction snapshot; external bank evidence | payment initiation/checkout, customer invoice UI/email, evidence intake |
| Payment → Entitlement activation | Platform operator verifies external receipt and submits the settlement API/UI | Works in code/tests; production unverified | Yes: money-arrival verification is intentionally human | VERIFIED Payment, PAID Invoice, APPLIED request, ACTIVE Subscription, three audit events and evaluator result | controlled staging/production exercise; automated provider evidence intentionally absent |
| Activation → Organisation admin | Existing admin membership/role and organisation page | Works for existing access in tested code | Operator initially creates/invites admin | membership, role assignment, session identity, audit events | comprehensive commercial/contracts/domain/auth/hosting/support admin IA |
| Organisation admin → Deployment | Deployment is operated from manifests/runbooks, not customer state | Operationally documented | Yes, operator | runtime config/health and external infrastructure records | organisation DeploymentProfile, verified topology/location/operator/backup facts |
| Deployment → Identity | Non-development deployment uses one Keycloak/OIDC configuration | Works deployment-wide | Yes, IdP/Keycloak operator | IdentityLink, AuthSession, login attempts, OIDC configuration | organisation domains, per-org IdP/policy, discovery, SSO capability gate |
| Identity → Onboarding | Organisation invite and operational pilot instructions | Partial | Yes | user/membership/role records and invite audit/state | onboarding plan/checklist, training evidence, completion/account owner |
| Onboarding → Support | Support model and contacts outside product | No product transition | Yes | external correspondence/tickets only | support plan/request/SLA, organisation association, escalation UI |
| Support → Renewal | Renewal/evaluation templates and subscription period fields | No product transition | Yes | external renewal review; current period dates | Renewal aggregate, notices, proposal/agreement linkage, explicit decision/audit |
| Renewal → continued access or exit | Subscription statuses/domain export formats exist separately | No end-to-end transition | Yes | possible manual subscription/database changes; report exports | renewal application, cancellation/termination, full organisation export, retention/exit attestation |

## Control observations

- A `CommercialChangeRequest` intentionally records intent only and never claims payment or access.
- Invoice issuance correctly refuses operation when billing supplier/remittance configuration is
  absent. That is a deployment prerequisite, not a substitute for a payment lifecycle.
- Existing invoice issuance snapshots customer details supplied by the caller; there is no canonical
  organisation billing contact/address to derive or review.
- The plan picker offers only BANK_TRANSFER and INVOICE. Neither selection proves payment.
- Only `payment:settle`, held through a verified platform role, consumes paid intent. Organisation
  administrator authority alone cannot declare funds received.
- Organisation-scoped uniqueness, invoice locking, stale-source validation and one transaction
  prevent replay and double activation.
- Organisation administration works independently of paid commercial state because every new
  organisation receives FREE. That is safe but not a paid-customer journey.

## Honest customer-facing statement

Witness can run a controlled institutional paid activation: humans agree terms, issue the linked
invoice, independently verify bank receipt, and a Witness operator records settlement to activate the
purchased bundle. Witness still cannot claim card checkout, automated/provider settlement, in-product
contract management, organisation SSO administration, renewal or full exit workflow.
