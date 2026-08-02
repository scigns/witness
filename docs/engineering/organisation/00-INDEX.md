# Organisational Control Plane — Index

**Owner:** CTO & Engineering Manager
**Status:** Active
**Related:** [`DEPARTMENTS.md`](../DEPARTMENTS.md) ·
[`DEPARTMENT_ASSIGNMENTS.md`](../DEPARTMENT_ASSIGNMENTS.md) ·
[`AGENT_HANDOFF_PROTOCOL.md`](../AGENT_HANDOFF_PROTOCOL.md) ·
[`PHASE_EXECUTION_PLAN.md`](../PHASE_EXECUTION_PLAN.md)

---

## Why this directory exists, and what it is not

Witness already has a working governance model: ten departments
([`DEPARTMENTS.md`](../DEPARTMENTS.md)), an assignment board
([`DEPARTMENT_ASSIGNMENTS.md`](../DEPARTMENT_ASSIGNMENTS.md)), a phase sequence
([`PHASE_EXECUTION_PLAN.md`](../PHASE_EXECUTION_PLAN.md)) and a per-contributor handoff protocol
([`AGENT_HANDOFF_PROTOCOL.md`](../AGENT_HANDOFF_PROTOCOL.md)). This directory does **not** replace
any of them. Where a document below duplicates something those files already say, that is a defect —
report it.

What was genuinely missing, and what this directory adds:

- A **persistent agent roster** — the 19 role charters are governance (who decides), not a live
  status board (who is doing what, right now). [`03-AGENT_REGISTRY.md`](03-AGENT_REGISTRY.md) adds
  that.
- A **delivery-wave model** — `DEPARTMENT_ASSIGNMENTS.md` lists work; nothing previously grouped
  work into a coordinated, safely-parallel batch with an integration gate.
  [`05-DELIVERY_WAVES.md`](05-DELIVERY_WAVES.md) adds that.
- A **structured, machine-readable handoff record** — `AGENT_HANDOFF_PROTOCOL.md` tells an individual
  contributor how to behave; it does not define the record format one agent leaves for the next.
  [`06-HANDOFF_MATRIX.md`](06-HANDOFF_MATRIX.md) and
  [`AGENT_COMMUNICATION_PROTOCOL.md`](AGENT_COMMUNICATION_PROTOCOL.md) add that.
- A **change-type review matrix** — which departments must review which kind of change, independent
  of who wrote it. [`07-REVIEW_MATRIX.md`](07-REVIEW_MATRIX.md) adds that.
- A **memory and re-grounding policy** for agents that don't carry session state.
  [`AGENT_MEMORY_POLICY.md`](AGENT_MEMORY_POLICY.md) adds that.

## Authority index — which document governs what

| Question | Authoritative document | This directory's role |
|---|---|---|
| What can a department decide, and what can it not? | [`DEPARTMENTS.md`](../DEPARTMENTS.md) | None — read it directly |
| What work exists, who owns it, is it blocked? | [`DEPARTMENT_ASSIGNMENTS.md`](../DEPARTMENT_ASSIGNMENTS.md) | [`04-WORK_PACKAGE_REGISTER.md`](04-WORK_PACKAGE_REGISTER.md) adds the WP-ID convention only |
| What phase are we in, what's the exit gate? | [`PHASE_EXECUTION_PLAN.md`](../PHASE_EXECUTION_PLAN.md) | [`09-PHASE_CONTROL.md`](09-PHASE_CONTROL.md) adds the per-wave gate checklist |
| How does one contributor behave in a session? | [`AGENT_HANDOFF_PROTOCOL.md`](../AGENT_HANDOFF_PROTOCOL.md) | Binding, unchanged |
| Who is currently working on what? | *(did not exist)* | [`03-AGENT_REGISTRY.md`](03-AGENT_REGISTRY.md) |
| How do agents hand off to each other? | *(did not exist)* | [`06-HANDOFF_MATRIX.md`](06-HANDOFF_MATRIX.md), [`AGENT_COMMUNICATION_PROTOCOL.md`](AGENT_COMMUNICATION_PROTOCOL.md) |
| Who must review a given change type? | *(did not exist, in this form)* | [`07-REVIEW_MATRIX.md`](07-REVIEW_MATRIX.md) |
| What happens when something is unclear or contested? | [`AGENT_HANDOFF_PROTOCOL.md`](../AGENT_HANDOFF_PROTOCOL.md) §12–13 | [`08-ESCALATION_MATRIX.md`](08-ESCALATION_MATRIX.md) adds the review-network angle only |
| Branch naming and protection rules | [`BRANCH_STRATEGY.md`](../BRANCH_STRATEGY.md) | **Contradicts current practice — see D-9 below** |
| What ships in which release? | [`../../CHANGELOG.md`](../../../CHANGELOG.md), `ROADMAP.md` | [`10-RELEASE_CONTROL.md`](10-RELEASE_CONTROL.md) adds checkpoint definitions |

## Files in this directory

| # | File | Adds |
|---|---|---|
| 01 | [`01-ORGANISATION_CHART.md`](01-ORGANISATION_CHART.md) | The reporting/authority chain from Founder to work package |
| 02 | [`02-DEPARTMENT_REGISTRY.md`](02-DEPARTMENT_REGISTRY.md) | Inputs, outputs, escalation triggers and phase restrictions per department — the four fields `DEPARTMENTS.md` doesn't carry |
| 03 | [`03-AGENT_REGISTRY.md`](03-AGENT_REGISTRY.md) | Live status roster over the 19 charters |
| 04 | [`04-WORK_PACKAGE_REGISTER.md`](04-WORK_PACKAGE_REGISTER.md) | WP-ID convention over `DEPARTMENT_ASSIGNMENTS.md` |
| 05 | [`05-DELIVERY_WAVES.md`](05-DELIVERY_WAVES.md) | The delivery-wave model and the wave register |
| 06 | [`06-HANDOFF_MATRIX.md`](06-HANDOFF_MATRIX.md) | Structured handoff record format |
| 07 | [`07-REVIEW_MATRIX.md`](07-REVIEW_MATRIX.md) | Required reviewers by change type |
| 08 | [`08-ESCALATION_MATRIX.md`](08-ESCALATION_MATRIX.md) | Escalation triggers by review-network failure mode |
| 09 | [`09-PHASE_CONTROL.md`](09-PHASE_CONTROL.md) | Per-wave phase-gate checklist |
| 10 | [`10-RELEASE_CONTROL.md`](10-RELEASE_CONTROL.md) | Release checkpoint definitions, 0.1.x → 1.0.0 |
| — | [`AGENT_COMMUNICATION_PROTOCOL.md`](AGENT_COMMUNICATION_PROTOCOL.md) | How agents hand off without relying on conversational memory |
| — | [`AGENT_MEMORY_POLICY.md`](AGENT_MEMORY_POLICY.md) | What is canonical, what may not be inferred, how agents re-ground |

## D-9 — Branch strategy contradicts current practice

[`BRANCH_STRATEGY.md`](../BRANCH_STRATEGY.md) (ADR-0015) documents `main → develop → domain →
working` with a `develop` branch and long-lived domain branches. **No `develop` branch has ever
existed in this repository**, and every merged pull request to date (#10, #11, #12) branched
directly from `main` and targeted `main` directly. This directory's branch model
([`01-ORGANISATION_CHART.md`](01-ORGANISATION_CHART.md), work-package branches) follows the
**actually-practiced** direct-to-`main` model, matching this repository's real history, not the
undeployed ADR-0015 model.

This is a genuine, unresolved contradiction between an accepted ADR and actual practice — the exact
condition [`AGENT_HANDOFF_PROTOCOL.md`](../AGENT_HANDOFF_PROTOCOL.md) §1 says to stop and flag rather
than silently pick a side. Recorded as open decision **D-9** in
[`docs/governance/DECISIONS.md`](../../governance/DECISIONS.md). **Owner:** CTO & Release Manager.
Until resolved, branches in this control plane go directly from `main` to `main`, because that is
what has actually happened and reversing it would be a disruptive, out-of-scope architecture change
this control plane does not have authority to make.
