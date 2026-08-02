# Agent Registry

**Owner:** Engineering Manager
**Status:** Active — live status board
**Related:** [`00-INDEX.md`](00-INDEX.md) · [`agents/README.md`](../../../agents/README.md) ·
[`AGENT_STRUCTURE_RECONCILIATION.md`](../AGENT_STRUCTURE_RECONCILIATION.md)

---

## What this is, and what it is not

The 19 role charters in [`agents/`](../../../agents/) are **governance** — authority, escalation,
ownership. They do not change often and this registry does not restate them. What was missing is a
**live status board**: which of the 19 roles has an agent actively working under it right now, on
what, on which branch. That is what this file tracks.

**Statuses.** `AVAILABLE` · `ASSIGNED` · `IN PROGRESS` · `BLOCKED` · `IN REVIEW` ·
`AWAITING HUMAN MERGE` · `VERIFYING MAIN` · `COMPLETE`.

**Execution personas** ([`AGENT_STRUCTURE_RECONCILIATION.md`](../AGENT_STRUCTURE_RECONCILIATION.md))
remain explicitly subordinate to the charter of the same role. No persona may override an accepted
ADR, governance, a phase gate, department authority, CODEOWNERS or a security requirement — this is
unchanged by this registry.

## Roster

| Agent ID | Department | Role charter | Persona (if any) | Status | Current WP | Branch | PR |
|---|---|---|---|---|---|---|---|
| founder | — | [`agents/leadership/founder.md`](../../../agents/leadership/founder.md) | — | AVAILABLE | — | — | — |
| cto | D2 (cross-cutting) | [`agents/leadership/cto.md`](../../../agents/leadership/cto.md) | — | AVAILABLE | 1.10 sign-off pending | — | — |
| principal-architect | D2 | [`agents/leadership/principal-architect.md`](../../../agents/leadership/principal-architect.md) | `agents/architect.md` | **ASSIGNED** | 1.1 — C4 component views | `docs/architecture/c4-component-views` | pending |
| engineering-manager | — (cross-departmental) | [`agents/leadership/engineering-manager.md`](../../../agents/leadership/engineering-manager.md) | — | AVAILABLE | — | — | — |
| backend-lead | D3 | [`agents/engineering/backend-lead.md`](../../../agents/engineering/backend-lead.md) | `agents/backend.md` | AVAILABLE | — | — | — |
| frontend-lead | D3 | [`agents/engineering/frontend-lead.md`](../../../agents/engineering/frontend-lead.md) | `agents/frontend.md` | AVAILABLE | — | — | — |
| ai-lead | D5 | [`agents/engineering/ai-lead.md`](../../../agents/engineering/ai-lead.md) | — | AVAILABLE | — | — | — |
| knowledge-graph-lead | D5 | [`agents/engineering/knowledge-graph-lead.md`](../../../agents/engineering/knowledge-graph-lead.md) | — | AVAILABLE | — | — | — |
| infrastructure-lead | D7 | [`agents/platform/infrastructure-lead.md`](../../../agents/platform/infrastructure-lead.md) | — | AVAILABLE | — | — | — |
| security-lead | D6 | [`agents/platform/security-lead.md`](../../../agents/platform/security-lead.md) | `agents/security.md` | **ASSIGNED** | 1.7 — Threat model (STRIDE) & PIA | `docs/security/threat-model-pia` | pending |
| developer-experience-lead | D7 | [`agents/platform/developer-experience-lead.md`](../../../agents/platform/developer-experience-lead.md) | — | AVAILABLE | — | — | — |
| product-director | D1 | [`agents/product/product-director.md`](../../../agents/product/product-director.md) | — | AVAILABLE | — | — | — |
| ux-lead | D8 | [`agents/product/ux-lead.md`](../../../agents/product/ux-lead.md) | — | AVAILABLE | 1.9 sign-off pending | — | — |
| research-lead | D1 | [`agents/product/research-lead.md`](../../../agents/product/research-lead.md) | — | AVAILABLE | — | — | — |
| qa-lead | D9 | [`agents/quality/qa-lead.md`](../../../agents/quality/qa-lead.md) | `agents/qa.md` | AVAILABLE | — | — | — |
| release-manager | D9 | [`agents/quality/release-manager.md`](../../../agents/quality/release-manager.md) | — | AVAILABLE | — | — | — |
| documentation-lead | D10 | [`agents/community/documentation-lead.md`](../../../agents/community/documentation-lead.md) | — | AVAILABLE | 1.7/1.9 review capacity | — | — |
| governance-lead | D1 | [`agents/community/governance-lead.md`](../../../agents/community/governance-lead.md) | — | AVAILABLE | 1.8 blocked, external review | — | — |
| open-source-lead | D1 | [`agents/community/open-source-lead.md`](../../../agents/community/open-source-lead.md) | — | AVAILABLE | D-1 pending (human action) | — | — |

## How to read "ASSIGNED" here vs. `DEPARTMENT_ASSIGNMENTS.md`

`DEPARTMENT_ASSIGNMENTS.md`'s **Owner** column is the same fact from the work-package side. This
table is the same fact from the agent side. They must agree — if they don't, one of them is stale
and it is a defect in whichever update lagged, not a real conflict to resolve.
