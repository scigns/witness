# Agent Memory Policy

**Owner:** CTO
**Status:** Active
**Related:** [`00-INDEX.md`](00-INDEX.md) ·
[`AGENT_COMMUNICATION_PROTOCOL.md`](AGENT_COMMUNICATION_PROTOCOL.md)

---

## Why this exists

`memory/changelog.md`, removed by [ADR-0021](../../../architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md),
recorded five modules as built that had never existed. That was not malice — it was an agent
(or a session under time pressure) treating its own prior stated intention as equivalent to verified
fact, and a later reader trusting the record instead of checking. This policy exists to make that
mistake structurally harder, not just discouraged.

## What agents may treat as canonical

- Content actually present on current `origin/main`, verified by reading the file — not summarised
  from an earlier point in the same conversation.
- Accepted ADRs (`architecture/decisions/`, status `Accepted`).
- Resolved entries in `docs/governance/DECISIONS.md`.
- CI results and check-run status fetched fresh, not recalled from an earlier check.

## What agents may record

- What was actually done, with the command and its output as evidence — the pattern this session
  used throughout (`pnpm docs:lint` output pasted, not summarised as "lint passes").
- What was decided, with the reasoning and the rejected alternative — the ADR and `DECISIONS.md`
  format.
- What was deliberately deferred, with an owner and a phase gate — never a bare `TODO`.

## What agents must not infer

- That a deliverable is complete because a file with the right name exists. `04-WORK_PACKAGE_REGISTER.md`'s
  completion definition is the check, not file presence.
- That a PR being merged means it was reviewed. This session found exactly that gap on PR #11 and
  PR #12 — merged without recorded department sign-off — and recorded it as a tracker discrepancy
  rather than silently treating "merged" as "done."
- That a previous session's plan is still valid. Main moves. This session alone saw `main` move
  four times across roughly two hours of work; a plan formed against an earlier commit is a
  hypothesis to re-verify, not a fact to act on.

## How stale context is detected

- `git fetch` and compare against the commit a plan was made against, every time work resumes —
  not just at the start of a long session.
- `bash scripts/ci/check-context-freshness.sh` — already enforces that `STATUS.md` and `ROADMAP.md`
  are not stale relative to recent changes; run it, don't assume it would catch a problem
  automatically.
- A tracker (`STATUS.md`, `DEPARTMENT_ASSIGNMENTS.md`, `03-AGENT_REGISTRY.md`,
  `04-WORK_PACKAGE_REGISTER.md`) disagreeing with another is itself the detection signal — see
  `06-HANDOFF_MATRIX.md`'s note that disagreement means one side is stale, not that there are two
  valid truths.

## How agent handoffs survive session loss

Because nothing load-bearing lives only in a conversation. A fresh agent with zero memory of this
session must be able to reconstruct current state entirely from: `STATUS.md`, `DEPARTMENT_ASSIGNMENTS.md`,
`03-AGENT_REGISTRY.md`, `04-WORK_PACKAGE_REGISTER.md`, open PRs, and the handoff record on the most
recent PR touching the work package in question. If reconstruction requires "what the previous
session said," the handoff was incomplete — see
[`AGENT_COMMUNICATION_PROTOCOL.md`](AGENT_COMMUNICATION_PROTOCOL.md).

## Re-grounding checklist, before starting any work

1. `git fetch origin && git log --oneline -5 origin/main` — is this the commit I think it is?
2. Read the relevant row in `DEPARTMENT_ASSIGNMENTS.md` / `04-WORK_PACKAGE_REGISTER.md` — is this
   still assigned to me, still unblocked?
3. Check for open PRs touching the same files — has someone else already started this?
4. Only then read the work package's context pack and begin.

## How fictional implementation history is prevented

The specific failure `memory/changelog.md` produced. Prevented by: no agent writes "X is built" or
"X is complete" anywhere without the evidence chain in `04-WORK_PACKAGE_REGISTER.md`'s completion
definition — artefact, acceptance criteria, review, validation, merge, main verification, tracker
agreement. A status of `IN REVIEW` that has not cleared all seven is written as `IN REVIEW`, not
rounded up.
