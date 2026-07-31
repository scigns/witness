# Role: Founder

| | |
|---|---|
| **Reports to** | Steering Committee |
| **Deputy** | CTO |
| **Integration branch** | — |
| **Charter status** | Active — **time-limited by design** |
| **Last reviewed** | 2026-07-31 |

## Mission

Hold the mission steady while the project is too young to hold itself, secure the resources and
relationships it needs to exist, and **transfer authority away as fast as responsibly possible.**

The Founder's success condition is their own redundancy. A Witness that still depends on its founder
in 2036 has failed at being infrastructure, whatever else it achieved.

## Responsibilities

- Guard mission integrity — decline opportunities that would compromise principles P1–P8, however
  attractive
- Secure funding that does not compromise independence ([`GOVERNANCE.md`](../../GOVERNANCE.md))
- Build relationships with adopting institutions, funders, foundations and partner organisations
- Chair the Steering Committee
- Hold trademark and marks in Stage 1; transfer to a foundation at Stage 3
- Drive the governance transition through Stages 1 → 2 → 3
- Maintain the continuity plan — credential recovery, registry control, signing key succession
- Be the public voice when one is needed, and step back when it is not

## Authority

### Decides alone
- Whether to accept funding, within the constraints in `GOVERNANCE.md`
- External representation and public positioning
- Steering Committee agenda

### Must consult
- CTO on anything with technical consequences
- Governance Lead on anything touching community trust or Indigenous data governance
- Steering Committee on partnerships and commitments to institutions

### Must escalate
- Everything material → Steering Committee. The Founder's authority is **convening**, not deciding.
- Technical decisions → CTO. The Founder does not overrule technical judgement.
- **Anything affecting consent, sovereignty or Indigenous data governance → Governance Lead, whose
  veto binds the Founder.**

## Deliverables

Funding secured with disclosed conditions · foundation transition plan and its execution ·
Steering Committee minutes (public unless concerning an individual) · continuity plan, reviewed
six-monthly · partner and reference deployment relationships · public accountability material.

## Ownership

| Path / domain | Notes |
|---|---|
| `VISION.md`, `MISSION.md` | With Steering Committee |
| `GOVERNANCE.md` | With Steering Committee |
| `docs/governance/FUNDING.md` | Disclosure of funding and its conditions |
| `docs/governance/TRADEMARK.md` | Until Stage 3 transfer |

## Success metrics

| Signal | Target |
|---|---|
| **Decisions the Founder is required for** | Trending toward zero — the primary metric |
| Governance stage | Stage 2 within 3 years; Stage 3 within 7 |
| Organisations with merge authority | ≥ 3 by Stage 2 |
| Funding with conditions compromising independence | 0, always |
| Funding disclosed publicly | 100% above the materiality threshold |
| Continuity plan tested | Every 6 months |
| Reference deployments in production | 3 by Phase 8 |

## Definition of Done

A Founder decision is done when it is recorded in Steering Committee minutes with its reasoning, any
conflict of interest is declared, and the outcome is visible to contributors who were not present.

## Dependencies

**Depends on:** CTO (technical credibility), Governance Lead (legitimacy with communities), Open
Source Lead (community health), Steering Committee (accountability).

**Depended on by:** the project, for existing at all in Stage 1 — which is precisely the dependency
this role exists to dismantle.

## Review responsibilities

| Must review | Response |
|---|---|
| Changes to `VISION.md`, `MISSION.md`, `GOVERNANCE.md` | 5 working days |
| Funding and partnership proposals | As they arise |
| Steering Committee escalations | Next meeting or sooner |

## Merge authority

`VISION.md`, `MISSION.md` (with Steering Committee) · `GOVERNANCE.md` (with Steering Committee) ·
`docs/governance/FUNDING.md`, `TRADEMARK.md`.

**No technical merge authority.** This is deliberate: founder access to the trunk is how mission
drift becomes code.

## Anti-responsibilities

- **Does not make technical decisions.** Ever. That is the CTO's role and undermining it once is
  enough to destroy it.
- Does not overrule the Governance Lead.
- Does not hold merge authority over code.
- Does not become the single point of failure for any operational process — that is what the
  continuity plan is for.
- **Does not stay.** This charter is written expecting the role to shrink and eventually to end.
