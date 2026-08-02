# Agent and Prompt Structure Reconciliation

**Owner:** CTO
**Status:** ⚠️ Analysis complete — two items require the project owner's decision
**Date:** 2026-08-02
**Related:** [`DEPARTMENTS.md`](DEPARTMENTS.md) ·
[`AGENT_HANDOFF_PROTOCOL.md`](AGENT_HANDOFF_PROTOCOL.md) ·
[`agents/README.md`](../../agents/README.md) ·
[ADR-0021](../../architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md)

---

## Why this document exists

While the Developer Preview was on a branch, `main` independently gained a second set of agent
files, a set of prompt templates, an alternative engineering operating model, and a task file.

Nothing here has been deleted. This document establishes what each artefact is, where it overlaps
or contradicts the canonical structure, and what needs a human decision. It is the same discipline
[ADR-0021](../../architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md)
applied to the documentation overlap — and it exists because that pattern recurred.

---

## 1. Existing canonical agent structure

Nineteen **role charters** under [`agents/`](../../agents/), organised by function:

| Directory | Charters |
|---|---|
| `agents/leadership/` | CTO, Founder, Principal Architect, Engineering Manager |
| `agents/engineering/` | Backend Lead, Frontend Lead, AI Lead, Knowledge Graph Lead |
| `agents/platform/` | Infrastructure Lead, Security Lead, Developer Experience Lead |
| `agents/product/` | Product Director, UX Lead, Research Lead |
| `agents/quality/` | QA Lead, Release Manager |
| `agents/community/` | Documentation Lead, Governance Lead, Open Source Lead |

A charter defines **authority**: what the role decides, what it may not decide alone, who it
escalates to, and which paths it owns. Charters are the source
[`.github/CODEOWNERS`](../../.github/CODEOWNERS) is derived from, and
[`DEPARTMENTS.md`](DEPARTMENTS.md) groups them into ten departments with acceptance gates and
prohibited actions.

## 2. Newly introduced files

| File | Lines | Shape |
|---|---|---|
| `agents/architect.md` | 25 | Second-person persona — "You are the Chief Software Architect" |
| `agents/backend.md` | 19 | Responsibilities / Always / Never lists |
| `agents/frontend.md` | 19 | Responsibilities / Always / Never lists |
| `agents/qa.md` | 12 | Responsibilities / Never lists |
| `agents/security.md` | 16 | Responsibilities / review checklist |
| `prompts/implement.md` | — | Execution template: read X, implement one task, stop |
| `prompts/review.md` | — | Execution template: review only, no new features |
| `prompts/refactor.md` | — | Execution template: refactor, no behaviour change |
| `engineering/README.md` | — | Alternative operating model with its own priority order and directory layout |
| `tasks/task-001-authentication.md` | — | Task: implement JWT authentication |

## 3. Overlap

**The five agent files and the nineteen charters are different kinds of artefact.** The new files
are *execution personas* — instructions addressed to an AI agent about what to do and not do in a
session. The charters are *organisational governance* — who holds which decision rights.

They are not redundant, and neither is a straight replacement for the other. A persona tells an
agent how to behave; a charter tells the organisation who is accountable. Both are useful.

Name-level overlap:

| New file | Corresponding charter | Same scope? |
|---|---|---|
| `agents/architect.md` | `agents/leadership/principal-architect.md` | Broadly, yes |
| `agents/backend.md` | `agents/engineering/backend-lead.md` | Mostly — see contradiction below |
| `agents/frontend.md` | `agents/engineering/frontend-lead.md` | Yes |
| `agents/qa.md` | `agents/quality/qa-lead.md` | Yes |
| `agents/security.md` | `agents/platform/security-lead.md` | Yes |

The remaining fourteen charters have no persona counterpart.

## 4. Contradictions

### 4.1 Two files claim authentication — and one of them is wrong

`agents/backend.md` lists **Authentication** under Responsibilities. `agents/security.md` lists
**Authentication** and **Authorization** under Responsibilities.

They contradict each other, and `backend.md` contradicts the canonical structure:
[`DEPARTMENTS.md`](DEPARTMENTS.md) assigns identity and access control to **D6 Security, Privacy &
Sovereignty**, and explicitly prohibits D3 Application Engineering from *"building an authentication
system — identity is D6's, and ADR-0007 already decided it."*

This is not a filing quibble. It is the exact mechanism by which an agent reading `backend.md`
starts building a login system that
[ADR-0007](../../architecture/decisions/ADR-0007-identity-and-access.md) rejected.

### 4.2 The personas do not reference any binding constraint

None of the five mention principles P1–P8, any ADR, the phase model, consent, provenance, or an
escalation path. `agents/backend.md` says *"Always write production code"* with no phase gate.

An agent given only these files has no way to discover that it is in Phase 1, that consent is not
yet enforceable, or that some decisions are not its to make. That is the failure mode
[`AGENT_HANDOFF_PROTOCOL.md`](AGENT_HANDOFF_PROTOCOL.md) was written to prevent.

### 4.3 `engineering/README.md` describes a repository that does not exist

It instructs agents to read `engineering/vision/`, `engineering/architecture/`,
`engineering/standards/`, `engineering/memory/` and `engineering/tasks/`, and to update
`memory/completed-features.md` and `memory/architecture-log.md`.

**None of those paths exist**, in either structure. Its priority order — Vision, Architecture,
Standards, Decisions, Tasks — is compatible in spirit with the precedence order in
[`AGENT_HANDOFF_PROTOCOL.md`](AGENT_HANDOFF_PROTOCOL.md) §2, but it points at a layout nobody has
built. An agent following it literally would fail at step one.

### 4.4 `prompts/implement.md` reads four superseded documents

It instructs: read `agents/backend.md`, `docs/architecture.md`, `docs/coding-standards.md`,
`memory/decisions.md`.

The last three were superseded by ADR-0021 and are removed by this reconciliation. `implement.md` is
otherwise sound — *"implement only that task, update status, explain what changed, stop"* is good
discipline. Its references have been updated to the canonical equivalents; nothing else changed.

`prompts/review.md` and `prompts/refactor.md` contradict nothing and needed no change.

### 4.5 Two assignment mechanisms

`tasks/task-001-authentication.md` implies a `tasks/` directory as the work queue.
[`DEPARTMENT_ASSIGNMENTS.md`](DEPARTMENT_ASSIGNMENTS.md) is already the assignment board, with
dependencies, phase gates and acceptance criteria per row.

Two queues means work can be assigned that the phase model has gated — which is precisely what
happened here (see §6).

## 5. Recommended canonical structure

**Retain both, with the persona layer explicitly subordinate.**

```text
agents/<function>/<role>-lead.md    Governance. Authority, decision rights, escalation.
                                    Source of CODEOWNERS. Canonical.

agents/<role>.md                    Execution persona. How an agent behaves in a session.
                                    Subordinate to the charter of the same role.

prompts/*.md                        Task-shaped execution templates. Compatible.

docs/engineering/AGENT_HANDOFF_PROTOCOL.md
                                    Binding on both layers. Read first.
```

Rationale: deleting the personas would discard genuinely useful operating instructions, and
deleting the charters would discard the entire authority model that CODEOWNERS and DEPARTMENTS.md
depend on. They answer different questions and can coexist — provided the persona layer cannot be
read as overriding governance.

## 6. What has been retained, and what changed

| Artefact | Action taken | Why |
|---|---|---|
| 19 charters | Unchanged | Canonical governance |
| 5 persona files | **Retained.** Header added to each naming its charter, the handoff protocol, and the current phase | Non-destructive; removes the ambiguity without deciding their fate |
| `agents/backend.md` | Header additionally states that authentication belongs to D6 and is gated | Neutralises §4.1 without editing the owner's responsibility list |
| `prompts/review.md`, `prompts/refactor.md` | Unchanged | Compatible; nothing to fix |
| `prompts/implement.md` | References to the three superseded documents replaced with canonical equivalents | The files it named no longer exist |
| `engineering/README.md` | **Retained.** Header records that its directory layout does not exist and that the canonical operating model is `docs/engineering/` | Adopting or deprecating it is a governance decision — §8 |
| `tasks/task-001-authentication.md` | **Retained.** Status changed `Pending` → `PHASE 2 / GATED / NOT STARTED`, with the ADR-0007 conflict recorded | Prevents the task being picked up; see §7 |

No file was deleted. No responsibility list was rewritten.

## 7. Authentication — gated, and architecturally contested

`tasks/task-001-authentication.md` specifies *"secure JWT authentication — Login, Logout, Refresh
Token, Password Hashing."*

Two separate problems:

1. **It is Phase 2 work.** Witness is in Phase 1. Identity is roadmap items 2.5 and 2.6, gated
   behind the Phase 1 exit gate and TD-001.
2. **It contradicts ADR-0007.** That ADR selects **Keycloak** federating to whatever identity
   provider the institution already runs, with **Casbin** as the policy decision point. Password
   hashing and refresh-token issuance inside Witness would make Witness its own identity provider —
   which ADR-0007 considered and rejected, because a government that already runs an IdP should not
   be asked to maintain a second set of credentials.

The task file is retained with its status made explicit. **It has not been implemented, and no
authentication code exists in this branch.** If the intent is genuinely to build a self-contained
JWT identity system, that requires an ADR superseding ADR-0007 — not a task file.

## 8. Requires a human decision

Two items. Both are governance, and neither is mine to settle.

### D-7 — Adopt or deprecate the persona layer

The recommendation in §5 is to keep both layers with the personas subordinate. The alternatives are
to fold the personas into the charters, or to drop the charters in favour of the lighter persona
set. The second would mean rebuilding CODEOWNERS and DEPARTMENTS.md around five roles instead of
nineteen — a real option if the nineteen-role structure has proven too heavy, and a significant loss
of the authority model if not.

**Owner:** CTO with Product Director. **Needed by:** before Phase 2 assigns work to agents.

### D-8 — Adopt, relocate or deprecate `engineering/README.md`

It proposes a repository layout (`engineering/vision/`, `engineering/architecture/`, …) that does
not exist. Three options: build that layout and migrate to it; treat it as an early draft of what
became `docs/engineering/` and deprecate it; or rewrite it to point at the actual paths.

Deciding requires knowing whether the layout was an aspiration or a proposal. **Owner:** CTO.
**Needed by:** before Phase 2, because agents read it.

### Why nothing else needs a decision

Every other difference was resolvable from an already-accepted decision:

- The superseded documents were superseded by ADR-0021, which is accepted and states its reasoning.
- Authentication ownership is settled by ADR-0007 and DEPARTMENTS.md.
- `prompts/review.md` and `refactor.md` contradict nothing.
- The CodeQL action bump and the markdownlint version are dependency maintenance, not governance;
  both of main's values were preserved.
