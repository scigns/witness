# Tenancy Reconciliation Recommendation

**Owner:** Principal Architect and Security Lead
**Status:** Recommendation for decision; no production change
**Date:** 2026-09-01
**Related:** ADR-0003, ADR-0004, ADR-0007, ADR-0009, ADR-0012, ADR-0013, ADR-0019,
ADR-0023

## Decision summary

Adopt **Option B: Organisation is both the tenant boundary and commercial aggregate**, subject to a
new ADR that supersedes the tenancy portion of ADR-0013. Keep deployment topology/runtime-profile
decisions from ADR-0013 unless the new ADR explicitly changes them. This recommendation does not
accept ADR-0023 and changes no behavior.

The choice does not weaken an implemented security guarantee: `Organisation` already is the effective
boundary. It does require an honest security correction. Repository filtering is the active isolation
layer; PostgreSQL RLS is planned, not implemented. Formal adoption must retain RLS as required
defence-in-depth or explicitly replace it with an equally reviewable database-level control.

## Evidence reviewed

- tenancy/identity/provenance decisions ADR-0003, ADR-0004, ADR-0007, ADR-0009, ADR-0012,
  ADR-0013, ADR-0019 and proposed ADR-0023;
- Prisma schema and all migrations through `20260828100000_invoice_issuance_idempotency`;
- Organisation, workspace, user, identity-link, session, membership and role-assignment domains;
- request guard, role resolution, Casbin policy, application services and controller route shapes;
- job recovery, transcript/summary jobs, object storage keys and report/search paths;
- audit schema/helper, isolation/authorization tests, health disclosures and deployment profiles.

## Explicit findings

### 1. Is Organisation the effective tenant boundary?

**Yes.** `Organisation` owns workspaces and almost all institutional and commercial roots.
Organisation/workspace routes resolve policy scope; memberships and role assignments are checked
against that scope. The web UI itself calls Organisation “the tenant boundary.”

### 2. Does a separate Tenant aggregate exist?

**No.** There is no Prisma `Tenant`, domain type, application service, API, migration or runtime
configuration object representing a tenant. `Tenant`/`tenant_id` appears in intended architecture and
historical planning documentation only.

### 3. Is PostgreSQL RLS implemented?

**Architecturally intended, not implemented.** No migration enables RLS, creates a policy or sets a
session tenant variable. The readiness response and internal-pilot release explicitly disclose that
RLS remains future work. Database constraints provide valuable same-organisation integrity for the
commercial graph, but constraints are not read isolation.

### 4. What currently prevents cross-organisation access?

The active layers are:

1. `AuthorizationGuard` requires every non-public route to declare an action and derives an
   organisation/workspace scope from route parameters or the create-workspace body.
2. `PolicyEnforcementService` fails closed and resolves roles from live membership/assignment rows.
3. Organisation scope requires a good-standing organisation membership; workspace scope accepts a
   good-standing workspace assignment/membership or a parent-organisation assignment/membership.
4. Controllers pass route scope to services; most services filter queries by organisation,
   workspace, session or parent ownership and validate related parents before mutation.
5. Commercial tables use non-null `organisation_id` and composite foreign keys, preventing a billing
   account, invoice, PO, payment method or payment from being cross-linked across organisations.
6. Object-storage keys start with `organisationId`; PostgreSQL-backed blobs inherit parent ownership.
7. Tests cover scoped role resolution, membership filtering, selected cross-organisation service
   paths and commercial authorization. Policy failure denies access.

This is meaningful protection, but it is not the two independent layers ADR-0013 claims.

### 5. Where are organisation IDs mandatory?

They are non-null on `Workspace`; commercial customer state (`BillingAccount`, `Subscription`,
`CommercialChangeRequest`, invoices/remittance/lines/counter, purchase orders, payment methods and
payments); and core institutional roots including sessions, participants, consent records/templates,
evidence/links, review/clarification, outcomes, reports and report sources.

Organisation membership is directly keyed by organisation. Organisation-scoped role assignments use
an organisation ID. Many tables also carry workspace/session IDs, allowing parent consistency to be
checked in services; not all use composite database keys for that consistency.

### 6. Where are organisation IDs optional or absent?

- `RoleAssignment.organisationId` is nullable by design for workspace and platform scopes.
- `ConsentTemplate.workspaceId` is nullable for organisation-wide templates, but its organisation ID
  remains mandatory.
- Global identity/provenance tables lack organisation ID: `User`, `IdentityLink`, `AuthSession`,
  `AuthLoginAttempt`, `Actor`, `Source`, `Record`, `AuditEvent`.
- Child tables rely on parent traversal: `WorkspaceMembership`, `EvidenceAttachment`, `Transcript`,
  `SessionSummary`, `AgendaItem` and `Resource` do not carry organisation ID. Agenda/resource carry
  a workspace ID; attachment/transcript/summary carry evidence/session parents.
- Global catalogue data lacks organisation ID: `Plan`, `PlanPrice`, `EntitlementDefinition`,
  `PlanEntitlement`.

Most notably, legacy `Record` and `Source` are global and are not connected to Organisation. They are
institutionally sensitive but sit outside the newer session/evidence tenancy graph.

### 7. Are global tables organisation-sensitive?

**Yes.** `User` and identity/session tables contain global personal/security data; `Actor` contains
global attribution identities; `AuditEvent` contains activity metadata without an organisation
column; `Record`/`Source` can contain institutional content/provenance without organisation ownership.
Child blob/transcript/summary tables contain sensitive content but inherit ownership through parents.

Global catalogue tables are intentionally non-sensitive reference data. `AuthLoginAttempt` is global,
short-lived security state. Global does not mean public: these tables require strict application
access and, where appropriate, a platform-only or parent-derived database policy.

### 8. Are identities global and memberships organisation-scoped?

**Yes.** A unique email identifies one global `User`; `(provider, providerSubject)` identifies a
global identity link; sessions point to the global user. Organisation membership and roles provide
institutional context. This is compatible with one person administering several organisations but
requires careful IdP/provider-subject semantics when organisation-specific IdPs arrive.

### 9. Can a user belong to multiple organisations?

**Yes.** Uniqueness is per `(organisationId, userId)`, not per user. Organisation creation explicitly
reuses an existing user email and creates another membership/role. Tests cover unrelated
organisation workspaces not leaking through role cascade.

### 10. How is organisation context selected and enforced?

There is no persistent “current organisation” in an auth session. Context is selected by the URL/API
resource: `:organisationId`, `:workspaceId`, or body `organisationId`. The guard resolves the scope,
then role resolution checks live assignments and good-standing memberships. List endpoints derive
allowed organisations/workspaces from the authenticated user. The UI selects context by navigation;
there is no dedicated switcher state or tenant claim in the session/JWT.

### 11. Which paths could bypass isolation?

- Any service/query that loads a globally unique child ID without validating its parent scope.
  Numerous `findUnique({id})` calls are safe only because helpers subsequently compare parents.
- Global/no-scope actions and endpoints. `resolveScope` returns global when recognised parameters are
  absent; correctness depends on platform-role design and membership-filtered service results.
- The development header intentionally bypasses membership scoping and lists all organisations. It is
  configuration-restricted, but accidental exposure of a development deployment is severe.
- Background recovery scans every processing transcript/summary globally. It does not expose results
  to a caller, but parent-derived audit and storage behavior must remain correct and least-privileged.
- Search, report composition/export and polymorphic source lookups join several child tables and are
  high-risk for a missed parent predicate.
- `AuditEvent` has polymorphic subject IDs and no organisation ID/FK, so audit reads must begin from
  an already-authorized subject. The database cannot enforce this.
- `Record`/`Source` and global user-directory APIs have no organisation boundary. The UI already notes
  that organisation admins cannot access the global user directory.
- Direct Prisma use, raw SQL, operator scripts or compromised database credentials bypass repository
  checks because RLS is absent.
- Object storage protects key construction, but an adapter credential may access all prefixes;
  per-prefix IAM is not yet the enforcement layer.

### 12. Would formal adoption weaken security?

**No, if it describes reality and preserves/adds database defence-in-depth.** Renaming the effective
boundary from an unimplemented Tenant to Organisation removes ambiguity. It would weaken security if
used to discard ADR-0013's second-layer isolation promise, stop cross-tenant adversarial work, or
declare current repository checks sufficient. Acceptance must couple the terminology decision to an
explicit isolation-hardening plan.

## Alternatives

| Dimension | Option A: retain Tenant and migrate | Option B: Organisation is tenant | Option C: Tenant and Organisation relationship |
|---|---|---|---|
| Security | Can implement clean RLS but introduces a second ID during migration and dangerous partial state | Matches active boundary; can add RLS on `organisation_id`; least semantic change | Strong separation possible, but relationship/selection rules create more authorization states |
| Tenant isolation | Eventually matches ADR-0013; currently requires broad backfill | Preserves current filtering and makes DB policy target explicit | Must isolate on Tenant while many APIs authorize Organisation; easy mismatch |
| Conceptual clarity | Tenant is technical, Organisation commercial; duplicates current meaning | One institutional boundary with clear subordinate workspaces | Useful only if hosting tenant and customer truly diverge; otherwise abstract overhead |
| Migration complexity | Very high: new aggregate/key on nearly every table, route and test | Low terminology migration; medium RLS and child-hardening work | Highest: new tables, cardinality, context selection, ownership and billing rules |
| Commercial compatibility | Requires mapping every subscription/agreement to Tenant and Organisation | Directly matches ADR-0023 and existing commercial FKs | Can model resellers/groups but requires choosing which object buys, pays and receives entitlements |
| Sovereign deployment | Works, but Tenant adds little in a single-institution installation | Natural: one or several Organisations per deployment | Can model deployment tenant above organisations; useful only with demonstrated operator need |
| SSO | Tenant-level IdP may conflict with legal organisation/domain ownership | Organisation domains/IdPs align with customer administration | Flexible shared IdP, but routing and policy inheritance become substantially harder |
| Multi-organisation users | Supported through tenant memberships after migration | Already supported through global User plus memberships | Supported, with additional tenant membership/inheritance decisions |
| Billing | Requires deciding whether customer or tenant owns account | Existing billing is already organisation-owned | Supports consolidated billing but requires payer/beneficiary and entitlement allocation models |
| Audit/provenance | Requires tenant backfill on polymorphic history | Can add/derive organisation without changing subject chains | Needs both tenant and organisation context or an explicit immutable mapping history |
| Operations | New tenant lifecycle and migration tooling | Lowest ongoing operational load | Highest: tenant creation, mapping, transfer, consolidation and split operations |
| Extensibility | Explicit hosting container, but premature | Agreement parties/deployment records can extend without another root | Most flexible for MSP/reseller scenarios, but pays complexity immediately |

## Recommendation

Choose **Option B**. Treat Organisation as:

- the isolation boundary used by application authorization and future RLS;
- the customer administration boundary;
- the commercial aggregate from ADR-0023;
- a deployable unit that may share or isolate infrastructure according to a separate deployment
  record/profile.

Do not conflate organisation with physical installation. Several organisations may share a deployment,
and one organisation may later have several deployments, without inventing a Tenant identity. If
future evidence requires consolidated payer/reseller structures, introduce agreement parties or an
account hierarchy rather than changing the resource isolation key.

## ADR action and approvals

ADR-0013 is Accepted and immutable except for a superseding status link. Create a new Proposed ADR
that supersedes **its tenancy model**, while carrying forward or explicitly revisiting its deployment
profile/topology decision. It must state:

- `Organisation -> Workspace -> resources` is canonical;
- which tables are organisation-owned, global reference, global identity or parent-derived;
- the required database isolation strategy and staged RLS rollout;
- how background/operator paths establish organisation context;
- how global users and multi-organisation memberships work;
- how deployment profile differs from organisation/customer deployment records.

Affected decisions/docs: ADR-0004 (PostgreSQL enforcement), ADR-0007 (identity and RLS statement),
ADR-0009 (sovereign profile), ADR-0012 (audit/provenance scoping), ADR-0019 (governed data location),
ADR-0023 (commercial ownership), `DATA_MODEL.md`, `DOMAIN_MODEL.md`, `SECURITY_ARCHITECTURE.md`,
`SYSTEM_CONTEXT.md`, identity service docs and health disclosures.

Required approvals follow the ADR process: minimum seven-day Proposed period; Principal Architect and
CTO decision; Security Lead review; Steering Committee review because P1/P3/P5 and isolation claims
are involved; Governance Lead veto applies if sovereignty, provenance or Indigenous data governance
is weakened. ADR-0023 remains Proposed and needs its own or coordinated approval.

## Work following acceptance

1. Inventory every table/query as global reference, global identity, direct organisation-owned or
   parent-derived.
2. Add executable migration lint for the chosen ownership category.
3. Design staged RLS with request/transaction-bound organisation context and safe platform/background
   policies; prove connection-pool context cannot leak.
4. Add organisation ownership to legacy `Record`/`Source` or formally retire their API path.
5. Harden child-ID services with reusable parent-scope assertions/composite keys where practical.
6. Add adversarial API and database tests across organisations, search, export, audit, background jobs
   and object storage.
7. Update health/readiness and architecture documents only when controls actually ship.

None of this work is performed by this recommendation.
