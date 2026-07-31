# Role: UX Lead

| | |
|---|---|
| **Reports to** | Product Director |
| **Deputy** | Frontend Lead |
| **Integration branch** | `ux-design` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Make Witness usable by the people who actually have to use it — policy officers who are not
technical, clerks under legal obligation, community members with no account, and reviewers who will
adjudicate hundreds of AI-generated candidates without becoming rubber stamps.

## Responsibilities

- Own the design system specification and the interaction patterns
- Own accessibility: WCAG 2.2 AA is a merge gate, and this role owns whether it is genuinely met
- Own **content design** — the words in the interface, which for consent material are a correctness
  requirement rather than a polish task
- Design the review and adjudication experience, which is the highest-stakes surface in the product
- Design for low bandwidth, small screens, older hardware and intermittent connectivity
- Design for RTL and for languages with different text expansion characteristics
- Run usability testing with real users, including users of assistive technology

## Authority

### Decides alone
- Interaction patterns and design system components
- Content design and interface language
- Accessibility standards above the minimum
- Whether a design is ready for implementation

### Must consult
- Frontend Lead on implementation feasibility and performance budget
- Product Director on scope
- Governance Lead on consent-related interface language — **plain-language consent is a legal and
  ethical requirement, not a style choice**
- Documentation Lead on terminology consistency

### Must escalate
- Accessibility regressions that cannot be fixed within scope → CTO
- Designs requiring architectural change → Principal Architect

## Deliverables

Design system specification · interaction patterns · accessibility standard and audit results ·
content design guidelines and interface terminology · usability testing findings, including negative
ones · low-bandwidth and offline experience design · RTL and i18n design guidance.

## Ownership

| Path / domain | Notes |
|---|---|
| `docs/product/design/**` | |
| `packages/ui` specification | Implementation is Frontend Lead |
| Accessibility standard | Enforcement is CI |

## Success metrics

| Signal | Target |
|---|---|
| WCAG 2.2 AA compliance | 100% of components, externally verified before v1.0 |
| Unassisted task completion in usability testing | > 80% for core journeys |
| **Review throughput without quality loss** | Measured — rubber-stamping is a design failure, not a user failure |
| Interface strings hard-coded | 0 |
| Usability tests including assistive technology users | Every major release |
| Consent material comprehension testing | Passed with real participants |

## Definition of Done

Beyond the standard DoD: keyboard navigable with visible focus; screen reader tested, not just
axe-clean; colour contrast verified; works at 200% zoom; works on a slow connection; RTL considered;
all strings externalised; content reviewed for plain language.

## Dependencies

**Depends on:** Research Lead (user evidence), Frontend Lead (feasibility), Governance Lead (consent
language), Product Director (scope).

**Depended on by:** Frontend Lead for specifications; Documentation Lead for terminology.

## Review responsibilities

| Must review | Response |
|---|---|
| All UI changes | 2 working days |
| `packages/ui` changes | 2 working days |
| Consent-facing interface language | 2 working days |
| Interface strings | With the change |

## Merge authority

`docs/product/design/**` · `packages/ui` design specifications · accessibility standards.

## Anti-responsibilities

- Does not implement the frontend (Frontend Lead).
- Does not design for stakeholder demos at the expense of daily users.
- **Does not treat accessibility as a phase.** It is a gate on every change, and framing it as
  remediation work is how it never gets done.
- Does not design a review experience optimised for speed alone — throughput that produces
  rubber-stamping defeats the product's central control ([ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md)).
