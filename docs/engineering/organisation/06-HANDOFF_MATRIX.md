# Handoff Matrix

**Owner:** Engineering Manager
**Status:** Active
**Related:** [`00-INDEX.md`](00-INDEX.md) ·
[`AGENT_HANDOFF_PROTOCOL.md`](../AGENT_HANDOFF_PROTOCOL.md) ·
[`AGENT_COMMUNICATION_PROTOCOL.md`](AGENT_COMMUNICATION_PROTOCOL.md)

---

## What this adds

[`AGENT_HANDOFF_PROTOCOL.md`](../AGENT_HANDOFF_PROTOCOL.md) governs how one contributor behaves
during a session — what to read, what authority they have, how to escalate. It does not define the
**record** one agent leaves for whoever picks up next, whether that is a human, the same agent in a
future session, or a different agent entirely. That record is what this file defines.

## The handoff record

Every completed or paused work package leaves one, in the PR description (for a finished piece of
work) or in a `STATUS.md` note (for a paused one — see
[`AGENT_MEMORY_POLICY.md`](AGENT_MEMORY_POLICY.md) on why a paused work package must not rely on
being remembered):

```text
FROM
TO
WORK PACKAGE
STATUS
WHAT CHANGED
FILES CHANGED
DECISIONS MADE
DECISIONS DEFERRED
TESTS RUN
RISKS
BLOCKERS
REQUIRED NEXT ACTION
EVIDENCE
PR
```

## Field definitions

| Field | Meaning | Example |
|---|---|---|
| FROM | The agent/role that did this handoff's work | `principal-architect` |
| TO | Who acts next — a specific role, or `HUMAN` if the next step is review/merge/decision | `HUMAN (review + merge)` |
| WORK PACKAGE | The WP-ID from `04-WORK_PACKAGE_REGISTER.md` | `WP-1.1-01` |
| STATUS | One of the statuses in `03-AGENT_REGISTRY.md` | `IN REVIEW` |
| WHAT CHANGED | One paragraph, not a diff restatement | — |
| FILES CHANGED | Exact paths | — |
| DECISIONS MADE | What was decided in-scope, with the reasoning | — |
| DECISIONS DEFERRED | What was deliberately not decided, and who owns deciding it | — |
| TESTS RUN | Exact commands, exact results — not "tests pass" | `pnpm docs:lint — 0 issues / 180 files` |
| RISKS | What could go wrong that this work package didn't fully close | — |
| BLOCKERS | What stops the next action, if anything | — |
| REQUIRED NEXT ACTION | One sentence, imperative | `Review and merge PR #13` |
| EVIDENCE | Links — PR, CI run, command output | — |
| PR | The PR URL, or `none yet` | — |

## Why this is separate from `AGENT_HANDOFF_PROTOCOL.md`

That document is a checklist for **one agent's own conduct** — steps 1 through 14 of "what do I do in
this session." This is the **artefact** that conduct produces for the next reader. Conflating them
would make the protocol document longer without making either easier to use for its actual purpose.
