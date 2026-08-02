# Agent Communication Protocol

**Owner:** Engineering Manager
**Status:** Active
**Related:** [`00-INDEX.md`](00-INDEX.md) · [`06-HANDOFF_MATRIX.md`](06-HANDOFF_MATRIX.md) ·
[`AGENT_MEMORY_POLICY.md`](AGENT_MEMORY_POLICY.md)

---

## The rule

**Agents communicate through structured, repository-visible records — never through informal
conversational memory.** A conversation between a human and an agent is not a durable record. The
repository and GitHub are.

This matters specifically because this project has already lived the failure mode it prevents: PR #2
recorded work that a later reader (main, then everyone reading `main`) had no way to discover, because
the only record of its relationship to PR #1 was in a chat transcript, not in git history. ADR-0021's
whole existence is the cost of that failure.

## What counts as a communication

| Event | Record | Where |
|---|---|---|
| Work package assigned | A row in `DEPARTMENT_ASSIGNMENTS.md` / `04-WORK_PACKAGE_REGISTER.md` | Repository, committed |
| Work in progress | Agent status in `03-AGENT_REGISTRY.md` | Repository, committed |
| Work handed off, paused, or completed | A handoff record per `06-HANDOFF_MATRIX.md` | PR description, or a `STATUS.md` note if paused mid-work |
| A decision made | An ADR (architecture) or a `docs/governance/DECISIONS.md` entry (process/governance) | Repository, committed |
| A decision deferred | An explicit `TBD` with owner and phase gate — see `NFR_SLO.md` §6 for the pattern | Wherever the deliverable lives |
| A blocker | A row in `docs/engineering/TECH_DEBT.md` (technical) or `DECISIONS.md` (process) | Repository, committed |
| A review finding | A PR review comment, resolved or explicitly disputed | GitHub |

## What agents may not do

- Rely on "the previous session already decided this" without a repository citation. If it isn't
  written down, it wasn't decided in a way another agent can trust — see
  [`AGENT_MEMORY_POLICY.md`](AGENT_MEMORY_POLICY.md).
- Treat a chat message, including this one, as authorising work beyond what is recorded in
  `DEPARTMENT_ASSIGNMENTS.md`. A human can authorise a work package; only the register makes that
  authorisation discoverable to the next agent.
- Skip the handoff record because the work "isn't finished yet." A paused work package with no
  handoff record is indistinguishable from an abandoned one to whoever looks next.
