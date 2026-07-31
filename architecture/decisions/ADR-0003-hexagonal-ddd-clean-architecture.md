# ADR-0003: Hexagonal architecture with domain-driven design

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Principal Architect, Backend Lead, CTO |
| **Related** | ADR-0004, ADR-0009, ADR-0011 |
| **Principles engaged** | P6 (decades), P7 (boring technology) |

## Context

Witness has a ten-year design lifetime. Over that period essentially every infrastructure choice we
make today will be replaced: the graph database, the ASR engine, the LLM runtime, probably the web
framework. What must **not** change is the meaning of a consent grant, a provenance chain or an
assertion.

Meanwhile the domain is genuinely difficult. Bitemporal assertions, revocable consent with
propagation guarantees, community-delegated authority, and entity resolution with reversible merges
are not CRUD. If that logic is entangled with an ORM and an HTTP framework, it becomes untestable in
practice, and untested consent logic is a privacy incident waiting for a date.

There is also a domain-language problem. Our stakeholders include archivists, clerks and Indigenous
data custodians who have precise existing vocabulary. If our code says `Record` where they say
`Assertion`, every conversation carries a translation cost and the translation eventually goes wrong.

## Decision

> We will structure every service using hexagonal architecture (ports and adapters) with a
> domain-driven core and Clean Architecture dependency rules. Dependencies point inward. The domain
> layer imports nothing but the standard library and other domain code.

```text
adapters (infrastructure) → application (use cases) → domain (pure)
```

`packages/domain` contains: aggregates, entities, value objects, domain events, invariants and
policies. It has **no** dependency on NestJS, Prisma, HTTP, the filesystem, the system clock or a
random source. Time and identity generation are injected as ports.

## Options considered

### Option A — Hexagonal + DDD + Clean layering *(chosen)*

**Pros:** infrastructure becomes replaceable without touching business rules — the single most
important property for a ten-year system; domain logic is testable in milliseconds with no
containers; ubiquitous language is enforced by the code itself; the structure teaches new
contributors where things belong.
**Cons:** more files and more indirection; mapping between domain models and persistence models is
real work; over-application to trivial contexts is a genuine and common failure mode.

### Option B — Conventional layered architecture (controller → service → repository)

**Pros:** familiar; less ceremony; fast for CRUD.
**Cons:** the "service" layer becomes a dumping ground; domain logic ends up in controllers and
entity classes; ORM entities become the domain model, which couples business rules to the database
schema forever. This is how most systems rot, and we would notice around year four.

### Option C — Transaction script / anaemic domain

**Pros:** simplest for genuinely simple domains.
**Cons:** ours is not simple. Consent, bitemporality and provenance invariants would be scattered
across procedures with no enforcement. Rejected.

### Option D — Event sourcing all the way down, with aggregates rebuilt from events

Partially adopted. We keep an authoritative event log (ADR-0011) but also maintain normalised
current-state tables, rather than rebuilding every aggregate from events on every load. Full event
sourcing adds meaningful operational complexity — snapshotting, versioning, replay performance —
for benefits we get more cheaply from the log plus projections.

## Consequences

### Positive

- Neo4j, Whisper, Ollama, OpenSearch and any LLM provider are swappable behind ports. This is what
  makes the exit strategies in `docs/research/OSS_EVALUATION.md` credible rather than aspirational.
- The domain test suite runs in seconds with no infrastructure, so contributors actually run it.
- Consent and provenance invariants live in one place and are enforced by types.
- The ubiquitous language is shared with archivists and custodians, reducing a whole class of
  requirements defects.

### Negative

- More code. A simple create-and-read feature touches four or five files instead of two.
- Mapping layers between domain and persistence must be written and maintained.
- Contributors unfamiliar with the pattern need onboarding — mitigated by `templates/service/`.
- Risk of dogmatism: applying full ceremony to a genuinely trivial context wastes effort. We
  explicitly permit thin implementations where a context has no meaningful invariants, and say so in
  the engineering guide, so nobody has to fight about it in review.

### Risks accepted

That the abstraction becomes ritual rather than useful — ports with exactly one implementation that
will never have another. Mitigation: a port is justified when it crosses a technology boundary we
might replace, not for every collaborator. Reviewed at each architecture review.

## Compliance and enforcement

- **Lint rule** (`eslint-plugin-boundaries`): `packages/domain` may not import from any adapter or
  framework package. This is a hard CI failure, not a convention.
- **Architecture fitness test** in CI asserts the dependency direction across all layers.
- `templates/service/` generates the correct structure so the easy path is the right one.
- Code review checklist item: "is this logic in the right layer?"
- Domain layer coverage requirement: 100% for new logic.

## Reversal

Abandoning the pattern would mean collapsing layers — mechanically easy but it would forfeit
replaceability, which is the point. More realistically we would relax it selectively for contexts
that turn out to be thin. That relaxation is already permitted and does not require reversing this
ADR.

## References

- Alistair Cockburn, [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- Eric Evans, *Domain-Driven Design* (2003); Vaughn Vernon, *Implementing DDD* (2013)
- Robert C. Martin, *Clean Architecture* (2017)
- [`docs/engineering/ENGINEERING_GUIDE.md`](../../docs/engineering/ENGINEERING_GUIDE.md)
