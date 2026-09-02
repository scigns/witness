# Witness 0.4 production acceptance programme

**Status:** Active

**Owner:** Product, Engineering, Security and Platform Operations

**Purpose:** Establish one authoritative short-horizon programme from the deployed 0.4 platform to a
controlled institutional pilot and first paid institutional customer. This document supplements, and
does not replace, the long-term Phase 0–8 roadmap.

## Current verified baseline

As of 2026-09-02:

- repository: `scigns/witness`;
- package version: `0.4.0`;
- current main SHA at programme creation: `a8a8b21d8b812df0ccba959aaaf6fc8d087623ad`;
- the same SHA has completed the governed production deployment workflow successfully;
- production deployment applied `20260901090000_manual_settlement_activation`;
- the deployment reported 32 Prisma migrations and completed API/web smoke checks;
- Keycloak and PostgreSQL reported healthy during deployment;
- PRs #187/#188 repaired the password-recovery OIDC/PKCE request and are included in production;
- PR #183 provides manual settlement and paid activation and is included in production;
- the latest formal GitHub release remains `v0.3.0` even though the deployed package version is
  `0.4.0`.

The production deployment must not be called fully accepted merely because deployment succeeded.
Human identity recovery, tenant/RBAC regression, synthetic commercial settlement, current commercial
recovery proof and facilitator acceptance remain separate gates.

## State vocabulary

Use these distinctions consistently:

- **IMPLEMENTED** — code exists on main;
- **CI VERIFIED** — required automated repository gates passed;
- **DEPLOYED** — the capability is present in the governed production deployment;
- **PRODUCTION ACCEPTED** — the real production path has been exercised safely with synthetic data;
- **HUMAN ACCEPTED** — an authorised human completed the required user-controlled step;
- **INSTITUTION READY** — the capability is sufficiently proven for a controlled external pilot.

Never use `implemented`, `deployed`, `accepted` or `ready` as synonyms.

## Gate 0 — repository and production truth

### Objective

No active planning document materially contradicts main or the deployed build.

### Required work

- reconcile `STATUS.md` with the deployed 0.4 build;
- reconcile the C3 state in `ROADMAP.md`;
- reconcile `docs/engineering/COMMERCIAL_IMPLEMENTATION_ROADMAP.md`;
- reconcile open issues against merged PRs and deployed migrations;
- preserve the distinction between package version 0.4.0 and latest formal release v0.3.0;
- verify independent-domain work separately from legacy PDC compatibility routes.

### Exit

Repository, deployment, issues and current-state documents tell the same story.

## Gate 1 — identity lifecycle

**Priority:** P0

The canonical controlled recovery identity is
`hello@buildwithwitness.com`. It is a Cloudflare Email Routing alias and not an independent mailbox.
Do not use `witness-test@buildwithwitness.com` unless it is explicitly provisioned in a future test
environment.

Verify:

1. registration;
2. email verification;
3. login;
4. logout;
5. forgot-password request;
6. generic non-enumerating response;
7. reset-email receipt through the `hello@` forwarding destination;
8. reset-link use;
9. password change;
10. login after reset;
11. old-password rejection where applicable;
12. reset-link replay rejection;
13. expiry/invalid-token handling;
14. invitation acceptance;
15. revoked-membership access denial;
16. no reset tokens, authorization codes or passwords in logs.

### Exit

A legitimate institutional user can enter, recover and regain access without engineering assistance.

## Gate 2 — tenancy and RBAC

**Priority:** P0

Use synthetic tenants only.

Required roles:

- Tenant A admin;
- Tenant A facilitator;
- Tenant A reviewer;
- Tenant A reader;
- Tenant B admin;
- Tenant B facilitator;
- platform operator.

Exercise UI and API reads/writes for organisation, workspace, session, participant, consent,
evidence, transcription, review, outcomes, reports, exports, billing, invoice, payment, subscription,
commercial request and entitlement surfaces.

Required expectations:

- unauthenticated requests return 401 where applicable;
- authenticated unauthorised requests return 403;
- identifier substitution cannot cross tenant boundaries;
- organisation administrators cannot become platform operators;
- organisation administrators cannot settle payments;
- revoked/suspended memberships cannot continue to act;
- last-platform-admin protection remains effective.

Any cross-tenant leakage or privilege escalation is P0.

## Gate 3 — commercial production acceptance

**Priority:** P0

The commercial domain, invoice persistence, immutable snapshots, authenticated invoice issuance,
manual settlement and paid activation are already implemented. Do not reimplement them.

Use a synthetic organisation and exercise:

pricing → FREE subscription → billing account → paid-plan request → PO/reference → invoice → invoice
render → synthetic exact bank-transfer evidence → platform-authorised settlement → invoice PAID →
request APPLIED → subscription ACTIVE → effective purchased entitlements → customer billing truth →
audit verification.

Required negative tests:

- duplicate settlement;
- concurrent settlement;
- wrong organisation;
- wrong invoice;
- wrong amount;
- wrong currency;
- partial payment;
- overpayment;
- void invoice;
- stale commercial request;
- unauthorised settlement;
- transaction failure and safe retry.

No real funds may be represented as moving during this acceptance.

### Exit

A synthetic institution can move from FREE to PAID exactly once using the supported invoice/manual
bank-transfer process without source changes.

## Gate 4 — governance and commercial recovery

**Priority:** P0

Existing recovery controls must be re-proven against current 0.4 commercial state.

The synthetic fixture must include governance evidence, object storage, identity configuration,
audit history and the complete commercial lifecycle through paid subscription/entitlement state.

After isolated destruction and restore verify:

- authentication;
- organisation/workspace/session history;
- object retrieval and hash integrity;
- consent-aware rendering;
- audit-chain integrity;
- invoice/payment history;
- active subscription;
- entitlements;
- settlement replay cannot apply twice.

Record observed backup/restore duration and gaps without fabricating universal RPO/RTO claims.

## Gate 5 — facilitator golden path

**Priority:** P1 after P0 security/integrity gates

A competent facilitator must complete the ordinary product path without needing to understand
infrastructure internals:

organisation → workspace/program → session → people → consent → evidence/document/audio →
transcription → correction → review → decisions/commitments/actions → summary → report → approval →
export → retrieve prior record → close/review pilot.

Record:

- time to first programme;
- time to first session;
- preparation time;
- developer-help requests;
- dead ends;
- confusing terminology;
- click burden;
- browser/mobile/accessibility blockers;
- transcript correction burden;
- report correction burden;
- session-to-approved-record duration.

Infrastructure terms such as Docker, Keycloak, Prisma, Cloudflare, R2 and GitHub must not be required
knowledge for ordinary facilitation.

## Gate 6 — product simplification

Fix evidence from the facilitator acceptance before major feature work.

Priorities:

- first-login clarity;
- invitation/access-request clarity;
- role explanation;
- single obvious session launch path;
- workflow/progress guidance;
- consent/review/report-readiness visibility;
- useful empty states;
- user-safe errors with preservation/next-action guidance and correlation IDs;
- commercial language distinguishing requested, invoiced, awaiting payment, paid and active.

Do not show `Pay now` while no hosted checkout exists.

## Gate 7 — pilot value and renewal

Issue #119 is implemented by the controlled value measurement method, existing baseline/evaluation
templates, the renewal-decision template and the synthetic three-archetype walkthrough. Close #119
once the documentation changes containing all of those artefacts merge and repository gates pass.

Capture a before/during/after baseline for each pilot. Include administrative effort, time to approved
record, evidence/decision retrieval, corrections, support effort, unresolved trust concerns and
whether the institution would repeat and pay for the workflow.

Renewal outcomes are:

- RENEW;
- EXPAND;
- CONTINUE CONDITIONALLY;
- PAUSE;
- END.

Do not fabricate ROI.

## Deliberately deferred

Do not start these merely because they exist in the long-term roadmap:

- Neo4j graph projection;
- graph-exploration UI;
- OpenSearch/vector search;
- speaker diarisation;
- native mobile applications;
- Stripe/card checkout;
- provider webhooks;
- automated renewal;
- Kubernetes;
- enterprise HA;
- major UI redesign.

Each requires customer, reliability or scale evidence.

## Current issue reconciliation starting point

Review acceptance criteria before changing issue state.

| Issue | Starting classification | Required evidence/action |
| --- | --- | --- |
| #107 | OPEN_AND_VALID | Keep as commercialisation umbrella until paid/renewal outcomes close |
| #108 | IMPLEMENTED_NEEDS_HUMAN_ACCEPTANCE | Confirm reusable commercial pack approval |
| #112 | STALE_SHOULD_CLOSE | Closed 2026-09-02 with implementation/migration evidence |
| #115 | IMPLEMENTED_NEEDS_VERIFICATION | Production-safe synthetic reconciliation proof remains |
| #116 | IMPLEMENTED_NEEDS_VERIFICATION | Production-safe exactly-once proof remains |
| #117 | IMPLEMENTED_NEEDS_VERIFICATION | Complete full commercial IDOR/role matrix |
| #118 | OPEN_AND_VALID | Re-prove recovery with current paid commercial state |
| #119 | IMPLEMENTED_NEEDS_VERIFICATION | Close after value/renewal documentation PR passes |
| #120 | FUTURE_ROADMAP | Do not implement provider until customer evidence triggers it |
| #128/#131/#133 | IMPLEMENTED_NEEDS_VERIFICATION | Verify independent-domain production acceptance |
| #140 | IMPLEMENTED_NEEDS_VERIFICATION | Reconcile parent issue against recovery/drill evidence |
| #191 | OPEN_AND_VALID | Complete identity lifecycle human acceptance |
| #192 | OPEN_AND_VALID | Complete full institutional tenant/RBAC regression |
| #193 | OPEN_AND_VALID | Complete facilitator golden-path rehearsal after P0 gates |

## Release decision

Do not create a formal v0.4.0 release solely to match `package.json`.

First prove:

- current deployed SHA;
- migration state;
- identity recovery;
- tenancy/RBAC acceptance;
- synthetic commercial settlement;
- exactly-once activation;
- current-state recovery;
- production health;
- no unresolved P0 integrity issue.

Then prepare a release evidence pack distinguishing IMPLEMENTED, DEPLOYED, PRODUCTION ACCEPTED and
DEFERRED capabilities.

## Programme success condition

Only report `CONTROLLED INSTITUTIONAL PILOT READY` when:

- identity recovery works end to end;
- tenant/RBAC regression passes;
- facilitator workflow works without ordinary developer intervention;
- consent/provenance/audit remain intact;
- current commercial migration is deployed;
- synthetic manual settlement activates paid access exactly once;
- commercial state survives isolated recovery;
- value/renewal evidence can be captured;
- current-state documentation agrees with repository and production.

Until then, report the blocking gate precisely rather than broadening the feature backlog.
