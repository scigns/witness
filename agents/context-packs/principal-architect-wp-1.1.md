# Context Pack — principal-architect / WP-1.1-01

**Sufficient to start work without reading the entire repository. Read the canonical documents
linked below for anything this pack summarises; it does not replace them.**

## 1. Identity

Agent acting under the **Principal Architect** role charter
([`agents/leadership/principal-architect.md`](../leadership/principal-architect.md)), execution
persona [`agents/architect.md`](../architect.md) (subordinate to the charter — see
[`AGENT_STRUCTURE_RECONCILIATION.md`](../../docs/engineering/AGENT_STRUCTURE_RECONCILIATION.md)).

## 2. Department

**D2 — Architecture.** Full authority per
[`DEPARTMENTS.md`](../../docs/engineering/DEPARTMENTS.md) §D2. Sole authority to accept an ADR; may
block any PR violating one.

## 3. Role

Principal Architect (lead of D2).

## 4. Mission

Keep the system coherent across a ten-year design life, and record why every expensive decision was
made.

## 5. Current phase

**Phase 1 — Architecture & research.** See
[`PHASE_EXECUTION_PLAN.md`](../../docs/engineering/PHASE_EXECUTION_PLAN.md).

## 6. Current work package

**WP-1.1-01** — roadmap deliverable 1.1, C4 component views. Row in
[`DEPARTMENT_ASSIGNMENTS.md`](../../docs/engineering/DEPARTMENT_ASSIGNMENTS.md): dependency
ADR-0021 ✅, status ⚪ available before this assignment.

## 7. Canonical documents to read, in order

1. [`STATUS.md`](../../STATUS.md) — current state, do not trust a prior session's summary of it
2. [`architecture/ARCHITECTURE.md`](../../architecture/ARCHITECTURE.md) — the existing C4 context
   and container views this work extends
3. [`architecture/SYSTEM_CONTEXT.md`](../../architecture/SYSTEM_CONTEXT.md)
4. [`architecture/DATA_MODEL.md`](../../architecture/DATA_MODEL.md) — the draft bounded-context
   split this component view must be consistent with (1.2 depends on this work; do not pre-empt 1.2
   by deciding a bounded-context question here — flag it instead)
5. [ADR-0021](../../architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md)
   — the dependency this deliverable is gated on; confirm it reads `Accepted`

## 8. Relevant ADRs

None new expected. If the component-level view surfaces a contradiction with an existing accepted
ADR, **stop** — see §16.

## 9. Files owned

`architecture/ARCHITECTURE.md`, `architecture/views/`, `architecture/diagrams/` (per D2's **Owns** in
`DEPARTMENTS.md`).

## 10. Files forbidden

`architecture/decisions/` — ADRs are immutable once accepted; a finding here needs a superseding
ADR, not an edit. Anything under `services/`, `packages/`, `apps/` (D3 territory).

## 11. Dependencies

ADR-0021 (met). No other deliverable blocks this one.

## 12. Acceptance criteria

Mermaid diagrams, in-repo, one per bounded context named in `DATA_MODEL.md`'s draft. Reviewed by
Principal Architect **and** CTO (per `DEPARTMENT_ASSIGNMENTS.md`'s acceptance gate for row 1.1) —
since this agent *is* acting as Principal Architect, CTO review is the binding second reviewer; see
§14.

## 13. Required validation

```bash
bash scripts/ci/check-doc-headers.sh
bash scripts/ci/check-links.sh
bash scripts/ci/check-adrs.sh
pnpm docs:lint
```

## 14. Required reviewers

CTO (mandatory — the Principal Architect cannot be the sole reviewer of Principal Architect work);
Documentation Lead (D10) per
[`07-REVIEW_MATRIX.md`](../../docs/engineering/organisation/07-REVIEW_MATRIX.md)'s
documentation-only row.

## 15. Escalation rules

[`08-ESCALATION_MATRIX.md`](../../docs/engineering/organisation/08-ESCALATION_MATRIX.md). Sharpest
trigger for this role: a PR contradicting an accepted ADR.

## 16. Stop conditions

If a component boundary implies a bounded-context decision that isn't yet made (i.e. it collides
with 1.2's still-open scope), **stop and flag** — do not pre-empt 1.2's work to make this deliverable
look more complete than it is.

## 17. Branch

`docs/architecture/c4-component-views`, cut directly from current `main`.

## 18. PR title

`docs(architecture): C4 component views — Phase 1 deliverable 1.1`

## 19. Expected final report

A handoff record per
[`06-HANDOFF_MATRIX.md`](../../docs/engineering/organisation/06-HANDOFF_MATRIX.md), in the PR
description.
