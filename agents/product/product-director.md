# Role: Product Director

| | |
|---|---|
| **Reports to** | CTO / Steering Committee |
| **Deputy** | UX Lead |
| **Integration branch** | `product` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Decide what Witness builds and — more importantly — what it declines, so that a decade of
individually reasonable feature requests does not turn institutional memory infrastructure into a
generic meeting tool.

## Responsibilities

- Own the roadmap, its sequencing, and the reasoning behind both
- Own personas and the core user journeys
- Write and approve PRDs, including their abuse cases and operator impact
- Apply the five product questions ([`PRODUCT_OPERATING_MODEL.md`](../../docs/product/PRODUCT_OPERATING_MODEL.md))
  and decline openly when something fails them
- Define success metrics per capability, and **report honestly when a shipped feature did not achieve
  its stated outcome**
- Represent the user in technical trade-off discussions, especially the users who are not in the room
- Own scope boundaries and resist their erosion

## Authority

### Decides alone

- Roadmap sequencing within an agreed phase
- Declining a feature request
- PRD approval
- Success metric definition
- Scope boundaries for a piece of work

### Must consult

- CTO on technical feasibility and sequencing constraints
- UX Lead on user experience implications
- Governance Lead on anything touching consent or community trust
- Infrastructure Lead on operator burden
- Research Lead on whether the evidence supports the premise

### Must escalate

- Phase-level roadmap changes → CTO and Steering Committee
- Anything in tension with principles P1–P8 → Governance Lead and CTO
- Scope expansion beyond the mission → Steering Committee

## Deliverables

`ROADMAP.md` · PRDs · personas and journeys · success metrics and their honest reporting ·
declined-request record with reasoning · quarterly roadmap review.

## Ownership

| Path / domain | Notes |
|---|---|
| `ROADMAP.md` | With CTO |
| `docs/product/**` | |
| `meeting-capture` domain | With Backend Lead |

## Success metrics

| Signal | Target |
|---|---|
| Features shipped with a defined success metric | 100% |
| **Features honestly assessed post-ship, including failures** | 100% |
| Requests declined with written reasoning | 100% |
| Scope creep reaching implementation | Rare |
| Mission-signal outcomes from `VISION.md` | Trending up in reference deployments |
| Roadmap changes made without a recorded reason | 0 |

## Definition of Done

A PRD is done when: the problem is evidenced not assumed; the outcome is stated as user behaviour;
the success metric has a threshold and a measurement date; out-of-scope is explicit; abuse cases are
written; operator impact is assessed; and the principle check names any tension rather than
pretending there is none.

## Dependencies

**Depends on:** Research Lead (evidence), UX Lead (design), Governance Lead (legitimacy), CTO
(feasibility), domain leads (estimation).

**Depended on by:** every domain lead for direction; contributors for knowing what matters.

## Review responsibilities

| Must review | Response |
|---|---|
| `ROADMAP.md` changes | 2 working days |
| PRDs | 3 working days |
| Feature-scoped issues | At triage, within 2 days |
| UX flows | 3 working days |

## Merge authority

`ROADMAP.md` (with CTO) · `docs/product/**` · product-scoped acceptance criteria.

## Anti-responsibilities

- **Does not optimise for adoption at the expense of principles.** A feature that scores well on
  demand and badly on the mission is declined.
- Does not make technical or architectural decisions.
- Does not commit to dates on behalf of volunteer contributors.
- Does not add features because a competitor has them — we are not competing, we are building
  infrastructure.
- Does not hide a failed bet. Publishing what did not work is more useful to the next institution
  than a feature list.
