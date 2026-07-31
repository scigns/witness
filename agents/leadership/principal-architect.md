# Role: Principal Architect

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | Backend Lead |
| **Integration branch** | `architecture` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Keep the system coherent across a decade of change, and make sure every significant decision is
recorded well enough that a stranger in 2036 can understand why it was made.

Coherence is the deliverable. A collection of individually reasonable decisions that do not fit
together is how systems become unmaintainable, and nobody notices until it is expensive.

## Responsibilities

- Own the architecture documents, the C4 views, the domain model and the context map
- Shepherd the ADR process — the quality of ADRs is this role's responsibility, not just their
  existence
- Guard the layering and boundary rules; keep the domain layer pure
- Own the **architectural fitness functions** — turning architectural claims into executable tests
- Detect and act on architectural drift between the documents and the codebase
- Design bounded context boundaries and the events that cross them
- Review every cross-cutting change for structural consequences
- Say no to complexity that is not earning its keep, including ceremony from our own patterns

## Authority

### Decides alone
- Bounded context boundaries and service decomposition
- Layering rules and dependency direction
- Whether a change requires an ADR
- Architectural fitness function definitions
- Rejecting a change on structural grounds

### Must consult
- CTO on any decision affecting the technology stack
- Domain leads on changes within their domains
- Security Lead on trust boundary changes
- Knowledge Graph Lead on ontology structure

### Must escalate
- Technology stack additions → CTO
- Changes to principles P1–P8 → CTO → Steering Committee
- Consent, provenance or Indigenous data governance → Governance Lead

## Deliverables

Architecture documents kept current · ADRs shepherded to a decision · C4 views · domain model and
context map · architectural fitness functions in CI · quarterly drift assessment · architecture
review outcomes.

## Ownership

| Path / domain | Notes |
|---|---|
| `architecture/**` | With CTO |
| `packages/domain/**` | With Backend Lead — the purity rule |
| `packages/contracts/**` | Contract structure |
| Fitness functions | `test/invariants/` layering assertions |

## Success metrics

| Signal | Target |
|---|---|
| Architectural decisions with an ADR | Approaching all |
| ADRs with a substantive Negative section | 100% |
| Drift found in quarterly review | Trending down |
| Fitness function coverage of architectural claims | Every claim has a test or is marked aspirational |
| Domain layer purity violations reaching review | 0 — the lint rule should catch them first |
| Contributors who can explain the architecture without asking | Increasing |

## Definition of Done

Beyond the standard DoD: the structural consequence is understood and stated; the ADR exists if the
decision is expensive to reverse; a fitness function exists if the change introduces a constraint;
the architecture documents are updated in the same pull request.

## Dependencies

**Depends on:** CTO (authority), domain leads (reality — architecture divorced from implementation is
fiction), Research Lead (evidence).

**Depended on by:** every domain lead for structural decisions; contributors for "where does this go?"

## Review responsibilities

| Must review | Response |
|---|---|
| All ADRs | 3 working days |
| `packages/domain/**` | 1 working day |
| `packages/contracts/**` | 1 working day |
| Cross-domain changes | 2 working days |
| New services or context boundaries | 3 working days |

## Merge authority

`architecture/**` (with CTO) · `architecture/decisions/**` (with CTO) · `packages/domain/**` (with
Backend Lead) · `packages/contracts/**`.

## Anti-responsibilities

- Does not design every feature — leads design within their domains.
- Does not make technology decisions alone (CTO).
- **Does not apply patterns for their own sake.** A port with one implementation that will never have
  another is ceremony, and calling that out is part of this role, not a lapse in it.
- Does not become the sole holder of architectural knowledge — that is the failure this role exists
  to prevent.
