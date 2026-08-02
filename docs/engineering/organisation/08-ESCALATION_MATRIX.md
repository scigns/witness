# Escalation Matrix

**Owner:** Engineering Manager
**Status:** Active
**Related:** [`00-INDEX.md`](00-INDEX.md) ·
[`AGENT_HANDOFF_PROTOCOL.md`](../AGENT_HANDOFF_PROTOCOL.md) §12–13 (authoritative for architectural
conflicts and what nobody may decide alone) · [`07-REVIEW_MATRIX.md`](07-REVIEW_MATRIX.md)

---

## What this adds

`AGENT_HANDOFF_PROTOCOL.md` §12 already defines the escalation procedure for an architectural
conflict (stop, state the conflict, escalate Principal Architect then CTO, write a superseding ADR if
warranted), and §13 already lists what nobody may decide alone. This file does not repeat either. It
adds the escalation triggers specific to the **review network** — what happens when the process
defined in [`07-REVIEW_MATRIX.md`](07-REVIEW_MATRIX.md) itself breaks down.

## Review-network escalation triggers

| Trigger | Escalates to | This session's example |
|---|---|---|
| A required reviewer named in `07-REVIEW_MATRIX.md` is unavailable and blocking a merge | Engineering Manager, to reassign or waive with a recorded reason | — |
| A PR merges without its named required reviewers having reviewed | CTO — this is a process defect, not a code defect | PR #11 and PR #12 were both merged directly; recorded as a tracker gap in `04-WORK_PACKAGE_REGISTER.md`, not silently accepted as "done" |
| Two departments' required reviewers disagree and neither withdraws | The department whose authority is engaged wins per `AGENT_HANDOFF_PROTOCOL.md` §11: *"their objection stands until they withdraw it"* | — |
| A work package's file ownership turns out to overlap with a parallel package's, discovered mid-wave | Engineering Manager — the wave's parallelisation plan was wrong and needs correcting, not worked around | — |
| An agent discovers its assigned scope requires touching a file outside its department's `Owns`/`May modify` | Stop; escalate to the owning department per `AGENT_HANDOFF_PROTOCOL.md` §2: *"If a file is not in your department's Owns or May modify list, you do not change it"* | — |
| A branch strategy or process document contradicts actual repository practice | CTO — recorded as an open decision, not silently resolved either way | D-9, `00-INDEX.md` |

## What this file does not do

It does not create a new decision-rights hierarchy. Every row above resolves to an authority already
named in `DEPARTMENTS.md` or `AGENT_HANDOFF_PROTOCOL.md`. This file exists only because "who reviews
what" (`07-REVIEW_MATRIX.md`) needed its own escalation path once the wave model
(`05-DELIVERY_WAVES.md`) made cross-department parallel work routine rather than exceptional.
