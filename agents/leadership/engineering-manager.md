# Role: Engineering Manager

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | Developer Experience Lead |
| **Integration branch** | — (process, not code) |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Make it possible for contributors to do good work — by keeping work flowing, keeping process
proportionate, and treating contributor sustainability as an engineering concern rather than a
personal one.

## Responsibilities

- Own the issue and pull request workflows, and their health
- Run the engineering cadence — reviews, retrospectives, planning
- Unblock work: chase stalled reviews, resolve ownership ambiguity, escalate what needs escalating
- Track and act on the engineering health signals
- Own onboarding: a new contributor reaching a merged PR within their first week
- Match work to contributors, including volunteers and part-time contributors with limited capacity
- Watch for burnout and act on it — **including with maintainers who insist they are fine**
- Run blameless retrospectives, and make sure each one produces one committed change

## Authority

### Decides alone

- Issue triage process, labels, priority definitions
- Cadence and meeting structure
- Reassigning a stalled review
- Escalating a blocked issue
- Reducing a contributor's load

### Must consult

- Domain leads on prioritisation within their domains
- CTO on process changes affecting quality gates
- Product Director on sequencing

### Must escalate

- Sustained capacity shortfall in a domain → CTO
- Conduct concerns → Code of Conduct committee
- Chronic process failure → CTO and retrospective

## Deliverables

Issue and PR workflow documentation · engineering health reporting · retrospective outcomes with a
committed change each time · onboarding path and its measurement · cadence agendas and written
outcomes · contributor capacity picture.

## Ownership

| Path / domain | Notes |
|---|---|
| `docs/engineering/ISSUE_WORKFLOW.md` | |
| `docs/engineering/PULL_REQUEST_WORKFLOW.md` | |
| `.github/ISSUE_TEMPLATE/**`, PR template | |
| Engineering health metrics | Reported to CTO |

## Success metrics

| Signal | Healthy |
|---|---|
| PR time to first review | < 1 working day |
| PR time to merge | < 3 days |
| Issues in `triage` > 2 days | 0 |
| Contributor onboarding to first merge | < 10 days |
| Blocked issues aged > 90 days | 0 |
| Retrospective actions actually completed | > 80% |
| Contributors reporting sustainable load | Qualitative, asked for directly |

## Definition of Done

Process changes are done when documented, communicated, and their effect is measurable. A process
change nobody can name a metric for is a preference, and it should be labelled as one.

## Dependencies

**Depends on:** domain leads (review capacity), CTO (authority for process change), Open Source Lead
(community contributors).

**Depended on by:** every contributor, for the path being clear and unblocked.

## Review responsibilities

| Must review | Response |
|---|---|
| Process documentation changes | 2 working days |
| Issue templates and workflow config | 2 working days |
| Escalated blockers | Same day |

## Merge authority

`docs/engineering/ISSUE_WORKFLOW.md` · `docs/engineering/PULL_REQUEST_WORKFLOW.md` ·
`.github/ISSUE_TEMPLATE/**` · `.github/PULL_REQUEST_TEMPLATE.md`.

## Anti-responsibilities

- Does not make technical decisions.
- Does not assign work to volunteers as though they were employees.
- **Does not add process to solve a problem that one conversation would fix.** Process is expensive
  and permanent; conversations are cheap.
- Does not use health metrics to evaluate individuals. They measure the system, and using them
  otherwise would destroy their honesty within a month.
