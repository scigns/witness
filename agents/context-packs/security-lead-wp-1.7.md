# Context Pack — security-lead / WP-1.7-01

**Sufficient to start work without reading the entire repository. Read the canonical documents
linked below for anything this pack summarises; it does not replace them.**

## 1. Identity

Agent acting under the **Security Lead** role charter
([`agents/platform/security-lead.md`](../platform/security-lead.md)), execution persona
[`agents/security.md`](../security.md) (subordinate to the charter — see
[`AGENT_STRUCTURE_RECONCILIATION.md`](../../docs/engineering/AGENT_STRUCTURE_RECONCILIATION.md),
which specifically notes `agents/security.md` lists Authentication under Responsibilities — that is
**not** in scope for this work package; see §16).

## 2. Department

**D6 — Security, Privacy & Sovereignty.** Per
[`DEPARTMENTS.md`](../../docs/engineering/DEPARTMENTS.md) §D6.

## 3. Role

Security Lead.

## 4. Mission

Complete the STRIDE threat model and privacy impact assessment to the point of formal sign-off.

## 5. Current phase

**Phase 1 — Architecture & research.**

## 6. Current work package

**WP-1.7-01** — roadmap deliverable 1.7, threat model (STRIDE) & PIA. Row in
[`DEPARTMENT_ASSIGNMENTS.md`](../../docs/engineering/DEPARTMENT_ASSIGNMENTS.md): no dependencies,
status 🟡 started (an existing STRIDE summary table already exists — see §7.2).

## 7. Canonical documents to read, in order

1. [`STATUS.md`](../../STATUS.md) — current state
2. [`architecture/SECURITY_ARCHITECTURE.md`](../../architecture/SECURITY_ARCHITECTURE.md) §10 —
   the existing STRIDE summary table this work extends to full sign-off; do not restart it from
   scratch
3. [`docs/governance/RISK_REGISTER.md`](../../docs/governance/RISK_REGISTER.md) — where mitigations
   for any newly identified risk are recorded
4. [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md) P1–P8, especially P1 (sovereignty) and P2
   (consent) — the threat model's boundary conditions

## 8. Relevant ADRs

May reference existing security-relevant ADRs (e.g. ADR-0007 identity, ADR-0013 deployment profiles)
without altering them. No new ADR expected from this work package.

## 9. Files owned

`architecture/SECURITY_ARCHITECTURE.md`, `docs/governance/RISK_REGISTER.md` (risk entries only) —
per D6's **Owns** in `DEPARTMENTS.md`.

## 10. Files forbidden

Anything under `services/`, `packages/`, `apps/` (D3/D2 territory) — no security control
implementation in this work package, that is Phase 2+.

## 11. Dependencies

None.

## 12. Acceptance criteria

Signed off; mitigations tracked in the risk register (per `DEPARTMENT_ASSIGNMENTS.md`'s existing
acceptance gate for row 1.7).

## 13. Required validation

```bash
bash scripts/ci/check-doc-headers.sh
bash scripts/ci/check-links.sh
bash scripts/ci/check-adrs.sh
pnpm docs:lint
```

## 14. Required reviewers

A second D6 reviewer or CTO (the Security Lead cannot be the sole reviewer of Security Lead work —
same principle as §14 of the architecture context pack); QA Lead (D9) for the PIA specifically, per
[`07-REVIEW_MATRIX.md`](../../docs/engineering/organisation/07-REVIEW_MATRIX.md).

## 15. Escalation rules

[`08-ESCALATION_MATRIX.md`](../../docs/engineering/organisation/08-ESCALATION_MATRIX.md). Sharpest
trigger for this role: egress permitted in the sovereign profile without mandatory review.

## 16. Stop conditions

- If completing the PIA requires a decision only the Governance Lead can make — as it does for 1.8,
  which is explicitly blocked for exactly this reason — **stop and flag**, do not decide it.
- **No authentication work.** `agents/security.md`'s persona lists Authentication under
  Responsibilities; `DEPARTMENTS.md` assigns identity to D6 but gates it behind Phase 2
  (`tasks/task-001-authentication.md` is `PHASE 2 / GATED / NOT STARTED`). This work package is the
  threat model *of* the current, unauthenticated Developer Preview — it does not implement
  authentication.

## 17. Branch

`docs/security/threat-model-pia`, cut directly from current `main`.

## 18. PR title

`docs(security): complete STRIDE threat model and PIA — Phase 1 deliverable 1.7`

## 19. Expected final report

A handoff record per
[`06-HANDOFF_MATRIX.md`](../../docs/engineering/organisation/06-HANDOFF_MATRIX.md), in the PR
description.
