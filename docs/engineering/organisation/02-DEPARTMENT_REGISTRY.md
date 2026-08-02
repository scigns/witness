# Department Registry

**Owner:** CTO & Engineering Manager
**Status:** Active
**Related:** [`00-INDEX.md`](00-INDEX.md)

---

## Authoritative source

[`DEPARTMENTS.md`](../DEPARTMENTS.md) is authoritative for **Mission, Roles, Responsibilities,
Authority, Owns, May modify, Required reviewers, Depends on, Acceptance criteria and Prohibited** for
all ten departments. This registry does not restate any of that. It adds the four operational
dimensions the governing task asked for that `DEPARTMENTS.md` does not carry: **Inputs, Outputs,
Escalation triggers, Phase restrictions.** "Non-responsibilities" and "Forbidden paths" are already
fully covered by `DEPARTMENTS.md`'s **Prohibited** and **Owns/May modify** — read those directly
rather than here.

| Dept | Name | Inputs (derived from *Depends on*) | Outputs (condensed from *Responsibilities*) | Escalation trigger (the sharpest item in *Prohibited*/*Authority*) | Primary phase(s) |
|---|---|---|---|---|---|
| D1 | Product & Governance | Founder/Steering Committee direction | Product scope, consent policy, licensing decisions, PRDs | Product scope changing outside a decision record | 0, 1, 8 (lead) |
| D2 | Architecture | D1 (scope) | ADRs, C4 views, contracts, technical coherence review | A PR contradicting an accepted ADR | 1 (lead), 0 |
| D3 | Application Engineering | D2 (architecture) | Domain implementation, API gateway, web app, SDKs | Implementing outside accepted architecture | 2, 3, 6 |
| D4 | Data Engineering | D2 (data model), D1 (retention policy) | Schema, migrations, event log, projections, backup/restore | A migration making provenance unverifiable | 3 (lead), 4 |
| D5 | AI & Knowledge Engineering | D4 (storage/provenance), D6 (egress policy), D2 (ontology) | Model gateway, extraction, ontology, evaluation harness | External provider reachable in the sovereign profile | 4 (lead), 5 (lead) |
| D6 | Security, Privacy & Sovereignty | — (sets constraints others depend on) | Threat models, PIAs, egress boundary, identity/authz | Egress permitted in the sovereign profile without mandatory review | 0, 2, 3, 7 (lead) |
| D7 | DevOps, Platform & SRE | D6 (security constraints) | CI/CD, infrastructure, observability, Helm/Terraform | A gate disabled to make CI pass | 0, 2 (lead) |
| D8 | UX & Accessibility | D1 (journeys), D3 (data to render) | Design system, accessibility, i18n/RTL, usability testing | A WCAG 2.2 AA failure merged | 1, 6 (lead) |
| D9 | QA & Verification | Every department (verifies their output) | Test strategy, invariant/adversarial suites, release verification | A weakened invariant assertion | 2, 3, 7 |
| D10 | Documentation & Knowledge Management | Every department (documents their output) | Technical docs, onboarding, decision indexes | Documentation left stale by a merged PR | 0 (ongoing, every phase) |

## Reading this table

- **Inputs** answers "what must exist before this department can start its next deliverable" — it is
  `DEPARTMENTS.md`'s **Depends on** column, restated as a direction of flow rather than a dependency
  list, because that is what a scheduling tool (a delivery wave) needs.
- **Escalation trigger** is deliberately singular per department, not exhaustive — it is the one
  condition most likely to require [`08-ESCALATION_MATRIX.md`](08-ESCALATION_MATRIX.md). The full
  list is `DEPARTMENTS.md`'s **Prohibited** section.
- **Primary phase(s)** is drawn from [`PHASE_EXECUTION_PLAN.md`](../PHASE_EXECUTION_PLAN.md)'s
  **Departments** row per phase. A department not listed for a phase can still contribute — this
  marks lead/primary involvement, not exclusivity.
