# Role: Open Source Lead

| | |
|---|---|
| **Reports to** | Founder / Steering Committee |
| **Deputy** | Engineering Manager |
| **Integration branch** | — (community, cross-cutting) |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Build a community that could carry Witness forward without us — which means growing contributors with
real authority, not just accepting patches.

A project with one organisation's contributors is a product with a public repository. Infrastructure
needs more than that.

## Responsibilities

- Own the contributor experience end to end: first visit, first issue, first PR, first merge
- Own licensing compliance and the GPL-3.0 / Apache-2.0 boundary
- Own the DCO process and contribution provenance
- Own community health: Code of Conduct enforcement coordination, discussions, responsiveness
- Own the **maintainer pathway** — identifying, mentoring and nominating new maintainers
- Own external relationships: Digital Public Goods Alliance, foundations, adjacent projects
- Own attribution and credit — contributors named in release notes and the contributors file
- Advocate for contributors inside the project

## Authority

### Decides alone
- Contributor experience process and community documentation
- Community communication and channels
- Curation standards for `good first issue` and `help wanted`
- Nominating a contributor for maintainer status

### Must consult
- CTO on maintainer appointments and merge authority
- Steering Committee on external partnerships and foundation relationships
- Code of Conduct committee on conduct matters
- Legal counsel, where available, on licensing questions

### Must escalate
- **Licensing changes → Steering Committee and all copyright holders**
- Foundation relationship decisions → Founder and Steering Committee
- Governance changes affecting contributors → Steering Committee

## Deliverables

`CONTRIBUTING.md` and community documentation · licence compliance including the SDK/contracts
Apache-2.0 boundary · **resolution of open decision D-1** (confirming permissive licensing with
copyright holders before Phase 2) · DCO enforcement · contributors file and credit · maintainer
pathway and nominations · DPGA submission · community health reporting.

## Ownership

| Path / domain | Notes |
|---|---|
| `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` | Conduct enforcement is the committee's |
| `LICENSE` files and SPDX headers | With Steering Committee for changes |
| `docs/governance/CONTRIBUTORS.md` | |
| `.github/` community files | With Engineering Manager |

## Success metrics

| Signal | Target |
|---|---|
| **Contributors from outside the founding organisation** | Growing — the core health metric |
| **Organisations with merge authority** | ≥ 3 by governance Stage 2 |
| First-time contributor to merged PR | < 10 days |
| First-time contributors who contribute again | > 30% |
| Licence compliance violations | 0 |
| D-1 resolved | **Before Phase 2** |
| Issues and discussions unanswered > 5 days | 0 |
| Maintainers nominated per year | ≥ 2 once the community exists |

## Definition of Done

Community work is done when: the path is documented, a newcomer can follow it unaided, the response
commitment is met in practice, and credit is given accurately.

## Dependencies

**Depends on:** Engineering Manager (contributor flow), Documentation Lead (onboarding docs), CTO
(maintainer authority), Founder (external relationships).

**Depended on by:** the project's long-term survival. This role's failure mode is invisible for years
and then terminal.

## Review responsibilities

| Must review | Response |
|---|---|
| `CONTRIBUTING.md`, community documentation | 2 working days |
| Licence and SPDX changes | 2 working days |
| New dependencies, for licence compatibility | 2 working days |
| First-time contributor PRs | **Same day acknowledgement**, even if only to say when review will come |

That last commitment matters more than it looks. A first PR that sits unacknowledged for four days
usually produces no second PR.

## Merge authority

`CONTRIBUTING.md` · `CODE_OF_CONDUCT.md` · `LICENSE` files (with Steering Committee) ·
`docs/governance/CONTRIBUTORS.md` · community files.

## Anti-responsibilities

- Does not lower the technical bar to grow contributor numbers. Community health is measured by
  contributors with authority, not by patch volume.
- **Does not treat the community as a marketing channel.** Contributors are colleagues.
- Does not accept a contribution whose provenance is unclear.
- Does not let the founding organisation retain permanent effective control while describing the
  project as community-governed. That gap, tolerated quietly, is how open governance becomes theatre.
