# Commercial Implementation Roadmap

**Status:** Active; C1 and C2 implemented
**Owner:** Product and Engineering
**Last reviewed:** 2026-08-25

Each task below is intended to be independently reviewed and merged. Every task preserves existing
RBAC, consent, provenance, audit, tenancy, export, and sovereign deployment behaviour.

## Milestone C1 — Commercial Domain Foundation

**State:** Implemented and validated on 2026-08-25.

### C1.1 — Define the commercial catalogue domain

- **Objective:** Model plans, prices, entitlement definitions, plan grants, subscriptions, overrides,
  and billing accounts without provider coupling.
- **Scope:** Pure immutable types, validation, status and interval rules, and stable entitlement keys.
- **Non-goals:** APIs, UI, invoices, payment providers, live quota enforcement.
- **Dependencies:** ADR-0003; implemented organisation boundary.
- **Likely files:** `packages/domain/src/commercial.ts`, domain exports and tests.
- **Data model:** No persistence in this task.
- **Security:** No credentials or personal billing data; organisation scope remains explicit.
- **Tests:** Invalid prices/statuses/periods; duplicate or malformed grants; override precedence.
- **Acceptance:** Domain tests prove entitlements derive from grants plus subscription overrides, never
  plan-name branches.
- **Documentation:** Commercial foundation model and ADR references.

### C1.2 — Add and seed commercial persistence

- **Objective:** Make PostgreSQL authoritative for the commercial catalogue and customer state.
- **Scope:** Additive Prisma models and migration; deterministic four-plan seed; existing-organisation
  FREE backfill.
- **Non-goals:** Invoice/payment/usage tables; provider SDKs; destructive quota changes.
- **Dependencies:** C1.1.
- **Likely files:** Prisma schema and one additive migration.
- **Data model:** Plan, PlanPrice, EntitlementDefinition, PlanEntitlement, BillingAccount,
  Subscription, SubscriptionEntitlementOverride.
- **Security:** Customer rows keyed by organisation; uniqueness and check constraints reject ambiguous
  state; no financial credentials.
- **Tests:** Prisma schema validation, migration review, seed consistency checks.
- **Acceptance:** Four plans and their requested AUD prices/entitlements are repeatably present; every
  pre-existing organisation has exactly one FREE subscription.
- **Documentation:** Migration/backfill and rollback/forward-fix notes.

### C1.3 — Provision FREE atomically

- **Objective:** Ensure every newly created organisation receives a billing account and FREE
  subscription without manual intervention.
- **Scope:** HTTP organisation creation and deployment bootstrap transactions; subscription-created
  audit event where the normal application audit chain is available.
- **Non-goals:** Checkout, paid upgrades, UI, changing operational storage quota.
- **Dependencies:** C1.2.
- **Likely files:** organisation service/tests, bootstrap script, audit action catalogue.
- **Data model:** One billing account per organisation; one current subscription; FREE status.
- **Security:** Provisioning stays inside existing authorised transaction; no entitlement can broaden
  RBAC.
- **Tests:** Creation is atomic, FREE is assigned, duplicate creation fails cleanly, bootstrap parity.
- **Acceptance:** Both creation paths produce an immediately evaluable FREE subscription.
- **Documentation:** Bootstrap/deployment implications.

### C1.4 — Validate and hand off C1

- **Objective:** Demonstrate C1 meets its exit condition without weakening the current product.
- **Scope:** Full repository validation, documentation links, status update, migration review.
- **Non-goals:** Starting C2.
- **Dependencies:** C1.1-C1.3.
- **Likely files:** `STATUS.md`, roadmap documents.
- **Data model:** Verify generated client and schema only.
- **Security:** Run invariant/adversarial gates included by repository validation.
- **Tests:** Format, lint, typecheck, all tests, build, docs lint/link checks where available.
- **Acceptance:** Validation passes and gaps are reported honestly.
- **Documentation:** Exact commands, risks, and next milestone.

## Milestone C2 — Pricing and Self-Service Upgrade UX

**State:** Implemented and validated on 2026-08-26.

### C2.1 — Publish plan catalogue API and `/pricing`

- **Objective:** Let an unauthenticated visitor compare the four plans and start FREE.
- **Scope:** Read-only safe catalogue DTO, accessible/translated pricing page and required actions.
- **Non-goals:** Bank details, checkout, activation of paid service.
- **Dependencies:** C1.
- **Likely files:** contracts, API catalogue controller/service, web pricing route/navigation.
- **Data model:** Read only.
- **Security:** Expose only public catalogue fields; no customer or remittance data.
- **Tests:** Contract, API, component/accessibility, low-bandwidth rendering.
- **Acceptance:** All plans, frequencies, prices and actions render from catalogue data.
- **Documentation:** Pricing copy and operator catalogue maintenance.

### C2.2 — Add authenticated billing overview

- **Objective:** Show current plan, status, frequency, resolved entitlements, usage, and upgrade choices.
- **Scope:** Organisation-admin billing route and APIs.
- **Non-goals:** Invoice settlement and provider checkout.
- **Dependencies:** C2.1 and existing usage API.
- **Likely files:** contracts, billing controller/application service, web settings routes.
- **Data model:** Read subscription/catalogue; no new table required.
- **Security:** RBAC plus organisation scoping; never expose another tenant's billing data.
- **Tests:** Cross-tenant denial, entitlement display, empty/error/accessibility states.
- **Acceptance:** An administrator can reach a clear monthly/annual upgrade and payment-method choice.
- **Documentation:** User/admin guides.

### C2.3 — Record upgrade/downgrade/cancel intent

- **Objective:** Persist customer-selected commercial changes without pretending payment settled.
- **Scope:** Valid state transitions, effective dates, cancellation controls, audit events.
- **Non-goals:** Automatic money movement.
- **Dependencies:** C2.2.
- **Likely files:** domain, contracts, application service, UI controls.
- **Data model:** Add scheduled change fields/table if reconciliation proves necessary.
- **Security:** Organisation-admin only; CSRF/replay-safe mutation semantics.
- **Tests:** Transition matrix, idempotency, RBAC, audit redaction.
- **Acceptance:** Requested changes are explicit, reviewable, and cannot activate unpaid access.
- **Documentation:** Lifecycle rules.

## Milestone C3 — Invoice and Direct Bank Transfer

### C3.1 — Model invoices, line items, payments, methods, and purchase orders

- **Objective:** Add provider-neutral receivables and procurement state.
- **Scope:** Domain, migration, invoice numbering and exact money/tax configuration.
- **Non-goals:** Tax advice, card storage, payment processing.
- **Dependencies:** C2.3.
- **Likely files:** domain, Prisma, config schema, tests.
- **Data model:** Invoice, InvoiceLineItem, Payment, PaymentMethod, PurchaseOrder.
- **Security:** No credentials; billing contacts minimised; invoice numbers concurrency-safe.
- **Tests:** totals, tax rounding, status transitions, uniqueness and concurrency.
- **Acceptance:** A valid OPEN invoice can be generated with all required institutional fields.
- **Documentation:** Config and jurisdiction disclaimer.

### C3.2 — Generate and securely display invoices

- **Objective:** Deliver printable/downloadable invoices and authenticated remittance instructions.
- **Scope:** Invoice API/page/document, `.env.example` placeholders, PO/reference entry.
- **Non-goals:** Public bank details or hardcoded values.
- **Dependencies:** C3.1.
- **Likely files:** config, API, web invoice routes, deployment examples.
- **Data model:** Invoice issue/due dates and immutable issued snapshot.
- **Security:** Remittance details authenticated and secret-backed; output escaping and access checks.
- **Tests:** configuration absence, cross-tenant denial, rendering and accessibility.
- **Acceptance:** Eligible customer receives an accurate invoice without source modification.
- **Documentation:** Billing profile/remittance runbook.

### C3.3 — Reconcile manual bank transfers

- **Objective:** Let an authorised administrator record settlement and activate/renew service.
- **Scope:** Manual adapter, reconciliation command/UI, payment history, transactional state changes.
- **Non-goals:** Bank API integration or physical fund splitting.
- **Dependencies:** C3.2.
- **Likely files:** payment application service, admin route, audit catalogue.
- **Data model:** Payment references and reconciliation metadata, no bank credentials.
- **Security:** Privileged action, dual-review option documented, no secrets in audit.
- **Tests:** partial/duplicate/overpayment, atomic invoice/payment/subscription transition, audit chain.
- **Acceptance:** Recorded receipt marks invoice PAID and activates entitlements exactly once.
- **Documentation:** Reconciliation and correction runbook.

## Milestone C4 — Payment Provider Port

### C4.1 — Define payment provider port and registry

- **Objective:** Isolate settlement transports from commercial rules.
- **Scope:** `createCheckout`, `createMandate`, `requestPayment`, `verifyPayment`, `refundPayment`,
  `handleWebhook`; capability-based provider registry and fakes.
- **Non-goals:** Selecting Stripe as a dependency or changing subscription rules.
- **Dependencies:** C3.
- **Likely files:** application ports, adapters, provider registry/tests.
- **Data model:** Opaque provider references only.
- **Security:** Provider allowlist; sovereign profile works with manual adapter only.
- **Tests:** Contract suite for manual/fake adapters and unavailable-provider failure.
- **Acceptance:** A fake alternative provider plugs in without modifying domain code.
- **Documentation:** Adapter authoring guide.

### C4.2 — Add webhook receipt and idempotency architecture

- **Objective:** Safely accept future asynchronous settlement confirmations.
- **Scope:** Signature-verification boundary, event receipt store, replay window and duplicate handling.
- **Non-goals:** Unverified production provider endpoint.
- **Dependencies:** C4.1.
- **Likely files:** provider webhook controller/port, Prisma migration, tests.
- **Data model:** Unique `(provider, external_event_id)` receipt and processing outcome.
- **Security:** Verify before parse/use; bounded payload; secret rotation; redact logs.
- **Tests:** invalid signature, duplicate, replay, reordered events, transient retry.
- **Acceptance:** Duplicate delivery changes commercial state at most once.
- **Documentation:** Threat model and incident handling.

### C4.3 — Scaffold regional provider boundaries

- **Objective:** Prove Stripe, PayTo/BECS, and Pacific providers remain optional adapters.
- **Scope:** Capability declarations and disabled scaffolds only where useful.
- **Non-goals:** Fake operational claims or SDK dependency without evaluation.
- **Dependencies:** C4.2.
- **Likely files:** adapter directories/config and OSS evaluation if a dependency is added.
- **Data model:** No domain change.
- **Security:** Disabled by default; no egress in sovereign profile.
- **Tests:** Startup profile validation and registry selection.
- **Acceptance:** Provider addition requires adapter/config changes, not invoice/subscription changes.
- **Documentation:** Provider readiness matrix.

## Milestone C5 — Usage, Cost Allocation, and Unit Economics

### C5.1 — Record usage and enforce allowances

- **Objective:** Meter storage, AI, transcription, projects, and users through commercial allowances.
- **Scope:** UsageRecord/UsageAllowance, metering port, atomic consumption and remaining allowance.
- **Non-goals:** Live cloud billing imports.
- **Dependencies:** C1 evaluator and existing usage/quota services.
- **Likely files:** domain, Prisma, usage services, creation/invite/export/API/AI gates.
- **Data model:** Metric, period, quantity, source/idempotency key.
- **Security:** RBAC/consent run first; client cannot assert usage; deny external compute when exhausted.
- **Tests:** concurrency, rollover, override, denial ordering, duplicate meter events.
- **Acceptance:** Required `can*` and `remainingAllowance` answers are enforced without plan-name checks.
- **Documentation:** Meter definitions and operational reconciliation.

### C5.2 — Configure allocation rules and snapshots

- **Objective:** Record internal allocation of settled revenue without moving funds.
- **Scope:** Six default percentage categories, admin configuration, exact basis-point calculations.
- **Non-goals:** Banking transfers or general-ledger replacement.
- **Dependencies:** C3 payments.
- **Likely files:** domain, Prisma, admin APIs/UI.
- **Data model:** Versioned CostAllocation rules and immutable payment allocation results.
- **Security:** Admin-only; changes audited; totals constrained to 10000 basis points.
- **Tests:** AUD 699 example, rounding/remainder, effective dating, audit.
- **Acceptance:** Allocations sum exactly to settled revenue and are reportable.
- **Documentation:** Accounting boundary and defaults.

### C5.3 — Report per-customer unit economics

- **Objective:** Show revenue, attributable costs, reserves, and contribution margin per organisation.
- **Scope:** Cost attribution port, manual/importable estimates, admin report/dashboard.
- **Non-goals:** Real-time provider billing integrations or accounting advice.
- **Dependencies:** C5.1-C5.2.
- **Likely files:** application reporting service, contracts, admin UI/export.
- **Data model:** Attributable cost entries with source, period, metric, and confidence.
- **Security:** Platform-admin only; organisation isolation; bounded exports.
- **Tests:** calculation, missing estimates, currency mismatch, cross-tenant access.
- **Acceptance:** Administrator can explain each margin figure from source records.
- **Documentation:** Cost methodology and limitations.

## Milestone C6 — Commercial Pilot Readiness

### C6.1 — Complete legal/onboarding/procurement content

- **Objective:** Make customer expectations and procurement steps clear.
- **Scope:** Terms/privacy links or placeholders, onboarding, pricing docs, institutional workflow.
- **Non-goals:** Inventing legal advice or contractual terms.
- **Dependencies:** C2-C5.
- **Likely files:** web content, user/admin guides and runbooks.
- **Data model:** No change unless procurement reconciliation requires it.
- **Security:** No public remittance data; content ownership and review named.
- **Tests:** Link, accessibility and content configuration checks.
- **Acceptance:** A procurement user can complete the documented route without developer help.
- **Documentation:** The deliverable itself; legal review remains explicit.

### C6.2 — Create synthetic commercial pilot fixtures and sample invoice

- **Objective:** Provide reproducible operator training and acceptance data.
- **Scope:** Synthetic test customer/subscription/invoice and sample output.
- **Non-goals:** Real customer or bank information.
- **Dependencies:** C6.1.
- **Likely files:** non-production seed/fixtures, sample documentation.
- **Data model:** Uses production models; seed refuses production.
- **Security:** Synthetic only; secrets absent.
- **Tests:** Seed guard, deterministic fixture, sample render verification.
- **Acceptance:** A clean test deployment reproduces the entire commercial journey.
- **Documentation:** Fixture reset and use.

### C6.3 — Verify, review, and release the commercial pilot

- **Objective:** Prove the ten-step external-organisation journey end to end.
- **Scope:** Browser verification, security review, backup/restore, deployment and release checklist.
- **Non-goals:** Unsupported provider certification.
- **Dependencies:** C6.1-C6.2.
- **Likely files:** e2e tests, security/deployment/runbook/status documents.
- **Data model:** Backup/restore coverage for all commercial tables.
- **Security:** Human security review required; signature/idempotency and secret handling rechecked.
- **Tests:** Full suite plus browser journey, migration/backup restore and sovereign no-egress test.
- **Acceptance:** All ten requested customer steps succeed without source changes; failures and human
  approvals are documented.
- **Documentation:** Release checklist, residual risks and support ownership.
