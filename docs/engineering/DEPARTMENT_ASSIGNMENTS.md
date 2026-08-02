# Department Assignments

**Owner:** Engineering Manager
**Status:** Active — assignment board
**Last updated:** 2026-08-01
**Related:** [`DEPARTMENTS.md`](DEPARTMENTS.md) ·
[`PHASE_EXECUTION_PLAN.md`](PHASE_EXECUTION_PLAN.md) ·
[`AGENT_HANDOFF_PROTOCOL.md`](AGENT_HANDOFF_PROTOCOL.md)

---

## How to use this board

Every row is one assignable unit of work. To assign it, replace `UNASSIGNED` in the **Owner** column
with a person or an agent identifier and open the branch named in **PR**.

`UNASSIGNED` is the honest default. **No name below is a real person**, and none will be invented —
the roles are role names from [`agents/`](../../agents/), which is deliberate: roles outlive people.

**Before starting any row**, read [`AGENT_HANDOFF_PROTOCOL.md`](AGENT_HANDOFF_PROTOCOL.md). It is
short, and it is what stops one contributor accidentally redesigning Witness.

**Status legend:** ⚪ available · 🟡 in progress · 🟢 done · 🔴 blocked · ⛔ gated (prerequisite unmet)

---

## Phase 1 — Architecture & research _(active)_

| Department | Role                 | Deliverable                             | Owner        | Dependencies       | Status       | PR                              | Acceptance gate                                                                   |
| ---------- | -------------------- | --------------------------------------- | ------------ | ------------------ | ------------ | ------------------------------- | --------------------------------------------------------------------------------- |
| D8         | UX Lead              | 1.9 Accessibility & i18n strategy       | agent (D8)   | none                | 🟡 MERGED — SIGN-OFF REQUIRED (UX Lead + D10; 2 CodeRabbit nitpicks outstanding) | _(merged, PR #12)_ | WCAG 2.2 AA plan, RTL approach, low-bandwidth budget; UX Lead + D10               |
| D2         | CTO                  | 1.10 NFRs & SLOs                        | agent (D2)   | none                | 🟡 MERGED — SIGN-OFF REQUIRED (Principal Architect + CTO) | _(merged, PR #11)_ | Latency, throughput, availability, recovery quantified; CTO + Principal Architect |
| D6         | Security Lead        | 1.7 Threat model (STRIDE) & PIA         | agent (D6)   | none                | 🟡 MERGED — SIGN-OFF REQUIRED (2nd Security Lead + QA Lead; 7 CodeRabbit findings outstanding, landed after merge) | _(merged, PR #15)_ | Signed off; mitigations in the risk register; Security Lead                       |
| D1         | Governance Lead      | 1.8 Consent framework — external review | `UNASSIGNED` | external reviewers | 🔴 blocked   | `docs/consent-framework-review` | Indigenous governance review complete; Governance Lead veto authority             |
| D2         | Principal Architect  | 1.1 C4 component views                  | agent (D2)   | ADR-0021 ✅        | 🟡 MERGED — SIGN-OFF REQUIRED (Principal Architect + CTO) | _(merged, PR #14)_ | Mermaid in-repo, reviewed; Principal Architect + CTO                              |
| D2         | Principal Architect  | 1.2 Domain model & bounded contexts     | agent (D2)   | 1.1 (merged, not gated on its sign-off — see D-10) | 🟡 drafted, PR open — pending review | `docs/architecture/domain-bounded-contexts` | Aggregates, invariants, context map; Principal Architect                          |
| D3         | Backend Lead         | 1.5 API contract v0.1                   | `UNASSIGNED` | 1.2                | ⚪ available | `feat/api-contract-v0.1`        | OpenAPI + SDL, spec only, round-trip tested; D2 + D3                              |
| D3         | Backend Lead         | 1.4 Event catalogue v0.1                | `UNASSIGNED` | 1.2                | ⚪ available | `feat/event-catalogue-v0.1`     | AsyncAPI for all domain events; Backend Lead + Principal Architect                |
| D5         | Knowledge Graph Lead | 1.3 Ontology v0.1                       | `UNASSIGNED` | 1.2                | ⚪ available | `docs/ontology-v0.1`            | 13 entity types, CIDOC-CRM/PROV-O alignment; KG Lead + Principal Architect        |

**Start here.** The first three rows have no dependencies at all and can be picked up today.

---

## Phase 2 — Infrastructure & identity _(next)_

| Department | Role                | Deliverable                             | Owner        | Dependencies     | Status              | PR                          | Acceptance gate                                                                                     |
| ---------- | ------------------- | --------------------------------------- | ------------ | ---------------- | ------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| D7         | Infrastructure Lead | Close TD-001 — enable Dependency graph  | `UNASSIGNED` | **repo admin**   | 🔴 blocked on admin | `chore/close-td-001`        | Dependency review runs for real; Security Lead                                                      |
| D7         | Infrastructure Lead | 2.4 Observability wiring                | `UNASSIGNED` | Phase 1 gate     | ⛔ gated            | `feat/otel-instrumentation` | Traces span HTTP → service → DB; Infrastructure Lead                                                |
| D6         | Security Lead       | 2.5 Keycloak realm-as-code              | `UNASSIGNED` | Phase 1 gate     | ⛔ gated            | `feat/keycloak-realm`       | Login works; realm reproducible from source; Security Lead                                          |
| D6         | Security Lead       | 2.6 Casbin authorisation model          | `UNASSIGNED` | 2.5              | ⛔ gated            | `feat/casbin-policy`        | Deny-by-default proven adversarially; Security Lead                                                 |
| D6         | Security Lead       | 2.5/2.6 Replace the development adapter | `UNASSIGNED` | 2.5, 2.6         | ⛔ gated            | `feat/remove-dev-authz`     | `DevelopmentAuthorizationAdapter` deleted; no unauthenticated path; Security Lead **non-delegable** |
| D7         | Infrastructure Lead | 2.2 Full local stack healthy            | `UNASSIGNED` | none technically | ⚪ available        | `chore/dev-full-stack`      | `make dev-full` → every service healthy                                                             |
| D7         | Infrastructure Lead | 2.7 Helm chart & Terraform skeleton     | `UNASSIGNED` | 2.2              | ⛔ gated            | `feat/helm-and-terraform`   | Installs on kind; `terraform validate` clean                                                        |
| D6         | Security Lead       | 2.8 Secrets management runbook          | `UNASSIGNED` | 2.5              | ⛔ gated            | `docs/secrets-runbook`      | Rotation tested, not described; Security Lead                                                       |

**The one to plan around** is `feat/remove-dev-authz`. It deletes the preview's unauthenticated
header, so every test and script depending on `X-Witness-Dev-User` must migrate to real tokens in the
same PR. Splitting that across two PRs leaves a window where the API has no working authorisation at
all.

---

## Phase 3 — Core backend & data

| Department | Role                | Deliverable                          | Owner        | Dependencies | Status   | PR                        | Acceptance gate                                                                            |
| ---------- | ------------------- | ------------------------------------ | ------------ | ------------ | -------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| D4         | Backend Lead        | 3.3 Event log & transactional outbox | `UNASSIGNED` | Phase 2 gate | ⛔ gated | `feat/event-log-outbox`   | At-least-once delivery proven; D4 + D2                                                     |
| D6         | Governance Lead     | 3.4 Consent service                  | `UNASSIGNED` | 3.3          | ⛔ gated | `feat/consent-service`    | Bypass impossible by construction; **Governance Lead veto**                                |
| D6         | Governance Lead     | 3.4 Revocation propagation           | `UNASSIGNED` | 3.4          | ⛔ gated | `feat/consent-revocation` | Propagates within SLO; Governance Lead                                                     |
| D4         | Backend Lead        | 3.4 `consent_grant_id` NOT NULL      | `UNASSIGNED` | 3.4          | ⛔ gated | `feat/consent-required`   | **D1 must first decide the disposition of pre-consent records**; D4 + D1 + Governance Lead |
| D6         | Security Lead       | 3.5 Tenant model with RLS            | `UNASSIGNED` | 3.3          | ⛔ gated | `feat/tenant-isolation`   | Cross-tenant read impossible, adversarially tested; Security Lead                          |
| D4         | Backend Lead        | 3.7 Audit append-only trigger        | `UNASSIGNED` | 3.3          | ⛔ gated | `feat/audit-append-only`  | `UPDATE`/`DELETE` rejected at the database; D4 + D6                                        |
| D3         | Backend Lead        | 3.6 GraphQL BFF                      | `UNASSIGNED` | 1.5, 3.3     | ⛔ gated | `feat/graphql-bff`        | Contract tests pass; breaking-change detection in CI                                       |
| D7         | Infrastructure Lead | 3.8 Backup & restore runbook         | `UNASSIGNED` | 3.3          | ⛔ gated | `docs/backup-restore`     | Full restore performed and timed, not described                                            |

**Row 4 is not a database task.** Making `consent_grant_id` NOT NULL requires deciding what happens
to records captured before the consent service existed. That is a governance decision belonging to
D1 and the Governance Lead. A migration author who picks a default here has made a policy decision
they had no authority to make.

---

## Phases 4–8

Not yet broken down to row level. Doing so now would produce assignments against interfaces that do
not exist, which is planning theatre rather than planning.

Each phase is decomposed at its entry check, by the lead department named in
[`PHASE_EXECUTION_PLAN.md`](PHASE_EXECUTION_PLAN.md):

| Phase                   | Lead department | Decompose when                                                  |
| ----------------------- | --------------- | --------------------------------------------------------------- |
| 4 — Knowledge graph     | D5              | Phase 3 exit gate met **and** ADR-0019 external review complete |
| 5 — AI platform         | D5              | Phase 4 exit gate met                                           |
| 6 — Search & experience | D8              | Phase 5 exit gate met                                           |
| 7 — Hardening           | D6              | Phase 6 exit gate met                                           |
| 8 — v1.0                | D1              | Phase 7 exit gate met                                           |

---

## Standing work — not phase-bound

| Department | Role               | Deliverable                                              | Owner        | Status                        | Notes                                                                                  |
| ---------- | ------------------ | -------------------------------------------------------- | ------------ | ----------------------------- | -------------------------------------------------------------------------------------- |
| D10        | Documentation Lead | Keep `STATUS.md` current                                 | `UNASSIGNED` | 🟡 ongoing                    | Staleness is a defect, not a chore                                                     |
| D9         | QA Lead            | Extend the invariant suite as invariants become testable | `UNASSIGNED` | 🟡 ongoing                    | INV-7 → Phase 3, INV-9 → Phase 4                                                       |
| D6         | Security Lead      | Quarterly technical-debt audit                           | `UNASSIGNED` | ⚪ due 2026-10-31             | TD-001 review date                                                                     |
| D1         | Open Source Lead   | **D-1 — confirm licensing**                              | `UNASSIGNED` | 🔴 needs the copyright holder | See [`LICENSING.md`](../governance/LICENSING.md); no software change can complete this |

---

## Blocked and why

| Item                  | Blocked on                                     | Who can unblock               | Cost of delay                                                                           |
| --------------------- | ---------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| TD-001                | Repository admin enabling Dependency graph     | Repository owner              | Rises sharply at Phase 2 — the first real dependencies arrive with no supply-chain gate |
| D-1 licensing         | Written confirmation from the copyright holder | Repository owner              | Becomes effectively irreversible once `sdk/` accepts an outside contribution            |
| 1.8 consent framework | External Indigenous governance review          | Governance Lead to commission | Blocks all of Phase 4 — ADR-0019 is a hard gate                                         |
| Phase 2 onward        | Phase 1 exit gate                              | Principal Architect + CTO     | Compounds: implementing against undecided contracts means rewriting                     |

Three of these four need a human decision rather than engineering work. They are listed here so that
nobody spends a week discovering it.
