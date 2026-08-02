# Phase Control

**Owner:** CTO & Engineering Manager
**Status:** Active
**Related:** [`00-INDEX.md`](00-INDEX.md) ·
[`PHASE_EXECUTION_PLAN.md`](../PHASE_EXECUTION_PLAN.md)

---

## What this adds

`PHASE_EXECUTION_PLAN.md` is authoritative for each phase's objective, departments, deliverables, PR
sequence and exit gate. This file adds the operational link between that plan and the wave model
([`05-DELIVERY_WAVES.md`](05-DELIVERY_WAVES.md)): a checklist for confirming a wave is safe to run
*inside* a phase, and confirming a phase is actually closeable once its waves complete.

## Before launching a wave

1. Phase entry check met — `PHASE_EXECUTION_PLAN.md`'s **Prerequisites** for the current phase,
   verified against current `main`, not assumed from a previous session.
2. Every work package in the wave is `⚪ available` or `🟡` genuinely in progress in
   `DEPARTMENT_ASSIGNMENTS.md` — not `⛔ gated` or `🔴 blocked`.
3. Parallelisation conditions in `05-DELIVERY_WAVES.md` are checked, not assumed.
4. No work package in the wave belongs to a later phase — confirmed by checking its Dependencies
   column, not by title alone.

## Before closing a phase

The phase's own exit gate (`PHASE_EXECUTION_PLAN.md`) governs. In addition:

1. Every deliverable in the phase's table is `COMPLETE` per
   [`04-WORK_PACKAGE_REGISTER.md`](04-WORK_PACKAGE_REGISTER.md)'s definition — merged **and**
   reviewed **and** re-verified on `main`, not merely merged.
2. `STATUS.md`'s phase status table and `DEPARTMENT_ASSIGNMENTS.md` agree with
   `04-WORK_PACKAGE_REGISTER.md`.
3. The named verifying department(s) — per `PHASE_EXECUTION_PLAN.md`'s **Exit gate: Verified by**
   row — have actually signed off, with evidence (a PR review, a recorded decision), not merely a
   merge.

## Current phase status (evidence-checked this session)

**Phase 1 — Architecture & research.** Not closeable yet: 1.1, 1.2, 1.5 not started or not merged;
1.7 in progress; 1.8 blocked on external review; 1.9 and 1.10 merged but **not yet
department-signed-off** (see `04-WORK_PACKAGE_REGISTER.md`). Phase 2 additionally requires TD-001
closed and D-1 confirmed — both human-only actions, tracked in `docs/governance/DECISIONS.md` and
`docs/engineering/TECH_DEBT.md`, not re-decided here.
