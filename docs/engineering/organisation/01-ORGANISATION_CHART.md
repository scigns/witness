# Organisation Chart

**Owner:** CTO & Engineering Manager
**Status:** Active
**Related:** [`00-INDEX.md`](00-INDEX.md) · [`DEPARTMENTS.md`](../DEPARTMENTS.md)

---

## The chain

```text
Founder / Product Authority        product scope, funding, external commitments — human, always
        ↓
Engineering Executive              this control plane; coordinates departments, does not decide
        ↓                          product scope or override governance
Programme Control                  phase gates, delivery waves, integration order — STATUS.md,
        ↓                          PHASE_EXECUTION_PLAN.md, this directory
Department Leads                   the 19 role charters in agents/ — decision authority per
        ↓                          DEPARTMENTS.md
Specialist Agents                  execution personas (agents/*.md) or ad hoc sessions, acting
        ↓                          under a department lead's authority, never their own
Work Packages                      one row in DEPARTMENT_ASSIGNMENTS.md / 04-WORK_PACKAGE_REGISTER.md
        ↓
Independent Branches               cut from current main, one work package, one department
        ↓
Pull Requests                      opened against main directly — see D-9 in 00-INDEX.md
        ↓
Architecture / Security / QA Review    07-REVIEW_MATRIX.md — never the implementing agent alone
        ↓
Human Merge                        no agent merges its own PR, or any PR — 19-HUMAN AUTHORITY
        ↓
Verification on Main               re-run baseline checks after merge, not assumed from CI alone
        ↓
Phase Gate                         09-PHASE_CONTROL.md — verified by the named department
```

## What each layer may and may not do

| Layer | May | May not |
|---|---|---|
| Founder / Product Authority | Set product scope, approve licensing, approve external governance review, approve public deployment | Be substituted by an agent |
| Engineering Executive | Coordinate departments, sequence delivery waves, verify baselines, prepare recommendations | Decide product scope, accept an ADR, merge a PR, override a department's authority |
| Programme Control | Track phase gates, define wave composition, flag unsafe parallelism | Skip a phase gate, reassign departmental authority |
| Department Leads | Everything in their `DEPARTMENTS.md` **Authority** and **Owns** rows | Anything in another department's **Owns**, anything in their own **Prohibited** list |
| Specialist Agents | Implement one assigned work package, within its owning department's authority | Self-assign work, choose product scope, merge their own PR, act outside `DEPARTMENTS.md` |

## Chain of custody for one work package

1. Programme Control selects a work package from `DEPARTMENT_ASSIGNMENTS.md` for a wave
   ([`05-DELIVERY_WAVES.md`](05-DELIVERY_WAVES.md)).
2. A department lead (or an agent acting under that department's charter) is assigned via
   [`03-AGENT_REGISTRY.md`](03-AGENT_REGISTRY.md).
3. The agent reads its context pack (`agents/context-packs/<agent-id>.md`), branches from `main`,
   implements only the assigned scope.
4. The agent opens a PR, leaves a structured handoff record
   ([`06-HANDOFF_MATRIX.md`](06-HANDOFF_MATRIX.md)), and stops.
5. Reviewers named in [`07-REVIEW_MATRIX.md`](07-REVIEW_MATRIX.md) review. None of them is the
   implementing agent.
6. A human merges. Never an agent — see `19-HUMAN AUTHORITY` in the governing task and
   [`AGENT_HANDOFF_PROTOCOL.md`](../AGENT_HANDOFF_PROTOCOL.md) §10: *"Nobody merges their own pull
   request. Not the CTO, not the Founder."*
7. Programme Control re-verifies the baseline on `main` post-merge. Only then does the tracker read
   `COMPLETE` — see [`04-WORK_PACKAGE_REGISTER.md`](04-WORK_PACKAGE_REGISTER.md)'s completion
   definition.
