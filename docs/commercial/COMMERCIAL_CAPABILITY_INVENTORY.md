# Commercial Capability Inventory

**Owner:** Product and Engineering
**Status:** Code-evidenced baseline updated for manual settlement; production deployment unverified
**Inventory date:** 2026-09-01

## State rules

Each capability has exactly one state:

- `PRODUCTION_READY`: implemented, production-shaped, tested and supported by deployment/runbook
  evidence in this repository.
- `IMPLEMENTED_UNVERIFIED`: end-to-end code exists and has relevant tests, but production operation
  is not proven here.
- `PARTIAL`: some domain, persistence, API or UI layers exist, but the user outcome is incomplete.
- `DOCUMENTED_ONLY`: plans, templates or runbooks exist without corresponding product behavior.
- `ABSENT`: no material implementation or committed operational artifact was found.
- `DEPRECATED`: an implementation exists but is explicitly retired.
- `BLOCKED`: designed work has an explicit prerequisite that prevents safe use.

No capability qualified as `DEPRECATED`. `PRODUCTION_READY` is deliberately rare: tests do not prove
that a deployed environment is configured or operational.

## Evidence key

- **Schema:** `services/api-gateway/prisma/schema.prisma`; migrations under its adjacent `migrations/`.
- **Org:** `services/api-gateway/src/organisations`, `organisation-memberships`,
  `organisation-role-assignments`, `organisation-invitations`.
- **Commercial:** `services/api-gateway/src/commercial`, `packages/domain/src/commercial.ts`.
- **Invoices:** `services/api-gateway/src/invoices`, `packages/domain/src/invoice.ts`.
- **Identity/authz:** `services/api-gateway/src/authn`, `src/authz`, `packages/policy`.
- **Web:** `apps/web/src/app`; API client at `apps/web/src/lib/api.ts`.

The evidence column names source/API/model/test/UI/dependency/defect in that order where applicable.
A dash means no artifact exists.

## Organisation

| Capability | State | Implementation evidence and known gap |
|---|---|---|
| Organisation creation | `IMPLEMENTED_UNVERIFIED` | Org service/controller; `POST /api/v1/organisations`; `Organisation`, atomic AUD billing account/FREE subscription/admin membership; service tests; `/organisations/new`; requires platform admin and seeded FREE plan; production creation not verified |
| Organisation profile | `PARTIAL` | `Organisation.profile` and institutional profile domain/default templates; create API/UI and profile tests; only starting defaults, no full profile administration |
| Membership | `IMPLEMENTED_UNVERIFIED` | Organisation membership domain/service/controller; nested membership APIs; `OrganisationMembership`; service/authz tests; organisation detail UI; no RLS, production unverified |
| Roles | `IMPLEMENTED_UNVERIFIED` | RoleAssignment domain/services, policy/Casbin; nested role APIs; `RoleAssignment`; parity/scope tests; role controls in organisation/workspace UI; fixed role set only |
| Organisation switching | `PARTIAL` | `/organisations` membership-filtered list and URL navigation select context; current-user response exposes organisations/workspaces; no persisted/current-organisation switcher or session claim |
| Organisation administration | `PARTIAL` | Detail page manages members, invites, roles, usage/quota, consent templates and billing link; multiple APIs/models/tests; no complete Domains/Auth/Contracts/Hosting/Support/Audit sections |
| Organisation contacts | `ABSENT` | No model/API/test/UI; invoice customer snapshots are not reusable organisation contacts |
| Organisation domains | `ABSENT` | No organisation-domain model/API/UI; deployment hostname configuration is not customer domain ownership |
| Domain verification | `ABSENT` | No verification challenge/DNS workflow/model/test |

## Catalogue and entitlements

| Capability | State | Implementation evidence and known gap |
|---|---|---|
| Products | `ABSENT` | No `Product`; single Witness catalogue makes it unnecessary today |
| Plans | `IMPLEMENTED_UNVERIFIED` | Commercial domain/catalogue API `GET /api/v1/plans`; `Plan`, `PlanPrice`, deterministic seed/migration; domain/API tests; `/pricing`; deployed catalogue state not verified |
| Capabilities | `IMPLEMENTED_UNVERIFIED` | `EntitlementDefinition` with typed dotted keys; migration/seed; domain and entitlement service tests; called “entitlements” in code |
| Plan capabilities | `IMPLEMENTED_UNVERIFIED` | `PlanEntitlement`; catalogue/evaluator; unique plan-definition constraint and persistence checks; pricing/billing UI displays grants |
| Organisation entitlements | `PARTIAL` | Organisation resolution exists through its current Subscription; no first-class agreement/effective-dated `OrganisationEntitlement` |
| Capability evaluation | `IMPLEMENTED_UNVERIFIED` | `evaluateEntitlements` and `CommercialEntitlementService.forOrganisation`; tests cover precedence/fail closed on suspended/cancelled; used in billing overview, not broadly enforced at feature entry points |
| Overrides | `PARTIAL` | `SubscriptionEntitlementOverride`, typed precedence and reason; domain/service tests; no mutation API/UI, actor/effective window or agreement source |
| Expiry/effective dates | `PARTIAL` | Subscription period/status affects availability; override has no effective dates; no general organisation-grant temporal evaluation |

## Commercial lifecycle

| Capability | State | Implementation evidence and known gap |
|---|---|---|
| Lead | `DOCUMENTED_ONLY` | Commercial programme/customer classification/design-partner documents; no model/API/UI |
| Opportunity | `ABSENT` | No opportunity aggregate or pipeline |
| Trial | `PARTIAL` | `TRIALING` subscription status and Trial package/docs/templates; no trial-start/expiry API, agreement or UI workflow |
| Pilot | `DOCUMENTED_ONLY` | Pilot packages, SOW/baseline/evaluation/go-no-go templates and operating process; no durable pilot aggregate |
| Subscription | `IMPLEMENTED_UNVERIFIED` | Commercial domain, FREE provisioning/backfill, overview/evaluator, and transactional paid activation from exact verified settlement; renewal remains absent and production activation is unverified |
| Renewal | `DOCUMENTED_ONLY` | Renewal template/customer-success docs and subscription period fields; no Renewal model/API/job/UI |
| Cancellation | `PARTIAL` | Validated/audited `CommercialChangeRequest` CANCEL intent and UI; does not apply cancellation to subscription |
| Upgrade/downgrade | `PARTIAL` | Change/request-quote intent API/UI, stale snapshot/idempotency/audit; an invoiced paid `CHANGE_PLAN` can activate on authorised settlement, but downgrade scheduling and quote/contract application remain incomplete |

## Billing

| Capability | State | Implementation evidence and known gap |
|---|---|---|
| Billing account | `IMPLEMENTED_UNVERIFIED` | `BillingAccount`, one per Organisation, created atomically; schema/migration/provisioning tests; no account-management API/UI |
| Invoices | `IMPLEMENTED_UNVERIFIED` | Invoice domain, issuance/get/render APIs, immutable snapshot models, number allocator, audit and unit/persistence tests; requires complete billing profile; no list/customer invoice UI or production proof |
| Invoice PDFs | `DOCUMENTED_ONLY` | Health explicitly says PDF absent; HTML download renderer exists and is tested |
| Payment recording | `IMPLEMENTED_UNVERIFIED` | Provider-neutral settlement service/operator API creates VERIFIED evidence in the activation transaction with database/application idempotency; no production exercise or correction operation |
| Stripe | `ABSENT` | No SDK, adapter, config, checkout or webhook; intentionally deferred by ADR-0022 |
| Bank transfer | `IMPLEMENTED_UNVERIFIED` | Manual transfer types, remittance snapshots, operator settlement API/UI and exact reconciliation/activation transaction; external receipt verification remains human and production operation is unverified |
| Purchase orders | `PARTIAL` | PO domain/table/constraints and optional invoice linkage; no PO application API/UI |
| Manual settlement | `IMPLEMENTED_UNVERIFIED` | Service, `POST .../invoices/:invoiceId/settlements`, minimal operator page, three audit events, exact-payment enforcement and replay/stale tests; partial/overpayment and corrections are deferred |
| Currencies | `PARTIAL` | ISO-like 3-letter constraints and money domain; billing account defaults AUD; public catalogue hardcodes response currency AUD; no currency admin/rate conversion |
| Tax | `PARTIAL` | Per-line basis-point tax and exact totals/tests; caller supplies rate; no jurisdiction/config/tax authority workflow |
| Payment terms | `PARTIAL` | Invoice due date is caller-supplied/validated; no reusable account terms/net-days policy |
| Overdue processing | `PARTIAL` | Domain transition and persisted status allow OVERDUE; no scheduler/service/API/UI to mark overdue |

## Contracts

| Capability | State | Implementation evidence and known gap |
|---|---|---|
| Agreements | `DOCUMENTED_ONLY` | Licensing, SOW and procurement documents/templates; no `CommercialAgreement` model |
| Agreement versions | `ABSENT` | No version lineage/effective model |
| Agreement documents | `DOCUMENTED_ONLY` | Templates/evidence-room guidance says executed documents live outside public repo; no document reference/digest model |
| Signatures | `ABSENT` | No signature workflow/evidence |
| Signatories | `ABSENT` | No signatory model |
| Procurement requirements | `PARTIAL` | `PurchaseOrder` plus procurement checklist/workflow; no general requirement/response aggregate |
| Contract-to-entitlement linkage | `ABSENT` | Subscription/overrides have no agreement reference |

## Enterprise identity

| Capability | State | Implementation evidence and known gap |
|---|---|---|
| Organisation domains | `ABSENT` | No model/API/UI |
| DNS verification | `ABSENT` | Deployment DNS setup is operational, not organisation ownership verification |
| OIDC | `PRODUCTION_READY` | `IdentityProviderPort`, Keycloak OIDC adapter, auth/session APIs, PKCE/JWKS tests, non-development boot validation and deployment manifests/runbooks; one deployment-wide provider, not organisation SSO |
| Microsoft Entra | `DOCUMENTED_ONLY` | ADR-0007 says Keycloak can federate institutional systems; no Entra-specific config/test/runbook in product |
| SAML | `DOCUMENTED_ONLY` | Keycloak capability noted in ADR; no organisation SAML implementation |
| SCIM | `ABSENT` | No port/model/API |
| SSO enforcement | `PARTIAL` | Non-development requires deployment-wide OIDC; no organisation capability/policy/domain routing |
| Authentication policies | `ABSENT` | No organisation authentication-policy model, enforcement or admin UI |

## Hosting and sovereignty

| Capability | State | Implementation evidence and known gap |
|---|---|---|
| Runtime deployment profile | `PRODUCTION_READY` | Config `sovereign`/`hybrid`/`development`, startup refusal and invariant tests, health display and deployment docs; this is process-wide, not customer commercial state |
| Data residency | `PARTIAL` | Config value shown by readiness/public configuration and governance docs; self-declared, no organisation policy/verification/history |
| Dedicated databases | `DOCUMENTED_ONLY` | Commercial deployment options describe dedicated infrastructure; no organisation deployment record/provisioner |
| Dedicated tenants | `DOCUMENTED_ONLY` | Deployment/package docs only; no Tenant model or dedicated-tenant control |
| Regional deployment | `DOCUMENTED_ONLY` | Sovereignty/deployment options discuss regions; no supported-region catalogue/verified claim |
| Customer-managed deployment | `DOCUMENTED_ONLY` | Sovereign/on-prem deployment manifests and guides support operator deployment; no commercial/customer deployment lifecycle record |
| Retention | `DOCUMENTED_ONLY` | Governance/data-model/admin-console plans; no active retention policy/sweep for organisation content |
| Backup region | `ABSENT` | Backup operations exist, but no customer-scoped backup-location model/claim |
| Exit/export | `PARTIAL` | Session report HTML/Markdown/JSON/CSV export and sovereignty commitments; no full-organisation commercial/data export or termination workflow; PDF absent |

## Customer success

| Capability | State | Implementation evidence and known gap |
|---|---|---|
| Onboarding | `DOCUMENTED_ONLY` | Implementation plan/design-partner/pilot operations; operator/Keycloak/invite steps, no OnboardingPlan |
| Onboarding checklist | `DOCUMENTED_ONLY` | Templates/checklists only |
| Training | `DOCUMENTED_ONLY` | Support/pilot materials mention enablement; no tracked sessions/content workflow |
| Support | `DOCUMENTED_ONLY` | `SUPPORT_MODEL.md`; no SupportRequest model/API/UI/mailbox |
| Customer health | `DOCUMENTED_ONLY` | Success/renewal metrics and executive dashboard; no computed/persisted health record |
| Account ownership | `DOCUMENTED_ONLY` | Commercial programme assigns human roles; no per-organisation account owner model |

## Internal operations

| Capability | State | Implementation evidence and known gap |
|---|---|---|
| Internal organisations view | `PARTIAL` | Customer web organisation list is membership-filtered; `apps/admin-console` is README only; platform bootstrap role exists; no operations console |
| Subscriptions view | `PARTIAL` | Per-organisation billing page only; no internal queue/list/control |
| Invoices operations | `PARTIAL` | Issue/get/render APIs plus direct internal settlement context/page for a known invoice; no operations queue, broad list or correction workflow |
| Payments operations | `PARTIAL` | Platform-authorised settlement service/API and minimal confirmation page; no payment queue, reversal/refund/correction or dual approval |
| Contracts operations | `ABSENT` | No product contract records |
| Renewals operations | `DOCUMENTED_ONLY` | Renewal templates only |
| Deployment management | `DOCUMENTED_ONLY` | Deployment scripts/runbooks, not organisation operations state/UI |
| Support operations | `DOCUMENTED_ONLY` | Support model; no case queue |
| Account management | `DOCUMENTED_ONLY` | Roles/process documents; no account-owner or opportunity UI |

## Email

| Capability | State | Implementation evidence and known gap |
|---|---|---|
| Transactional email | `DOCUMENTED_ONLY` | Notification worker README/phase placeholder; organisation invite explicitly creates state without sending mail |
| Billing email | `ABSENT` | Billing email exists only as supplier/customer invoice snapshot data |
| Invoice email | `ABSENT` | No sender/template/job/delivery evidence |
| Renewal email | `DOCUMENTED_ONLY` | Operational mailbox/process aspirations only |
| Support mailbox | `DOCUMENTED_ONLY` | Support contact/process docs; no integrated mailbox |
| Inbound processing | `ABSENT` | No mail adapter/parser/webhook |
| Organisation association | `ABSENT` | No correspondence model/link |
| Classification | `ABSENT` | No mail AI classifier or human review workflow |

## Knowledge and support

| Capability | State | Implementation evidence and known gap |
|---|---|---|
| Public knowledge base | `DOCUMENTED_ONLY` | Repository guides/product/operations docs; no customer-facing knowledge application/search index |
| Authenticated knowledge assistant | `ABSENT` | No assistant surface or support knowledge retrieval |
| Organisation-context-aware help | `ABSENT` | No help service using organisation/account state |
| Support escalation | `DOCUMENTED_ONLY` | Support/security escalation documents; no integrated escalation workflow |

## Baseline conclusions

The strongest reusable slice is Organisation/membership/RBAC, deployment-wide OIDC, provider-neutral
catalogue/subscription/entitlement evaluation, and invoice issuance primitives. The product does not
now includes the bridge from linked paid intent and OPEN invoice to exact verified manual settlement,
PAID invoice, ACTIVE subscription and evaluator-visible capabilities. This is implemented and tested
but not production-verified. Contracts, per-organisation enterprise identity, customer deployment
facts, support and most operations remain documents rather than product state.

The inventory does not certify production configuration. In particular, billing profile values,
deployed migration state, invoice rows and production identity/role assignments cannot be established
from source code alone.
