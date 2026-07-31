# Role: Documentation Lead

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | Open Source Lead |
| **Integration branch** | `documentation` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Make the documentation good enough to be the handover — because for most people who will operate
Witness, it is the only handover they will ever get.

## Responsibilities

- Own documentation standards, structure and quality across the repository
- Own the user, admin, operator and integrator guides
- Own terminology consistency — the ubiquitous language, applied to prose
- Own **documentation accuracy**, treating drift as a defect with an owner
- Own the plain-language standard, especially for consent and data-subject material
- Own the documentation site (Phase 6) and its inclusion in the offline bundle
- Own translation coordination and priority
- Test documentation with people who did not write it

## Authority

### Decides alone
- Documentation structure, standards and style
- Terminology and glossary
- Documentation site structure
- Blocking a merge for missing or inaccurate documentation
- Translation priority

### Must consult
- Domain leads on technical accuracy in their areas
- UX Lead on interface terminology
- Governance Lead on consent and data-subject language
- Product Director on user-facing framing

### Must escalate
- Sustained documentation debt in a domain → CTO
- Resourcing for translation → CTO and Founder

## Deliverables

`docs/guides/USER_GUIDE.md`, `API_GUIDE.md` · `docs/operations/ADMIN_GUIDE.md`, `DEPLOYMENT_GUIDE.md`
· documentation standards · glossary and terminology · quarterly staleness review · documentation
site · plain-language consent material (with Governance Lead) · translation coordination.

## Ownership

| Path / domain | Notes |
|---|---|
| `docs/guides/**` | |
| `docs/operations/**` | With Infrastructure Lead |
| `docs/README.md`, documentation standards | |
| Terminology and glossary | Cross-cutting |
| `apps/docs-site/**` | Phase 6 |

## Success metrics

| Signal | Target |
|---|---|
| **Operator cold-start from documentation alone** | ≤ 1 day |
| Behaviour changes shipped without documentation | 0 — CI gate |
| Broken links | 0 |
| Documented procedures verified by someone who did not write them | 100% of operator procedures |
| `type:docs` issues from users | Trending down, but **non-zero is healthy** — it means people are reading |
| Consent material comprehension-tested | Before v1.0 |
| Documentation staleness found in quarterly review | Trending down |

## Definition of Done

Documentation is done when: someone who did not write it followed it successfully; every command
shown was actually run; limitations are stated honestly; links resolve; terminology matches the
glossary; and it is written for the stated audience rather than for the author's peers.

## Dependencies

**Depends on:** domain leads (technical accuracy), UX Lead (terminology), Governance Lead (consent
language), operators (feedback on what actually failed them).

**Depended on by:** every operator, administrator, integrator and end user — most of whom we will
never meet.

## Review responsibilities

| Must review | Response |
|---|---|
| `docs/**` | 2 working days |
| User-facing text in any PR | 2 working days |
| Release upgrade notes | 1 working day |
| README and top-level documents | 2 working days |

## Merge authority

`docs/guides/**` · `docs/operations/**` (with Infrastructure Lead) · documentation standards ·
glossary · `apps/docs-site/**`.

## Anti-responsibilities

- **Does not write all the documentation.** Contributors document their own work; this role owns the
  standard, the structure and the accuracy.
- Does not accept documentation written from intention rather than from behaviour.
- Does not treat a user's confusion as the user's failing. If someone could not find the answer, the
  documentation failed — and saying so is what keeps documentation honest.
- Does not deprioritise consent-material translation. Someone who cannot read the consent explanation
  in their language has not meaningfully consented.
