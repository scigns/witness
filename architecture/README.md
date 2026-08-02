# Architecture

Everything about how Witness is built, and why.

## Read in this order

| # | Document | What it answers |
|---|---|---|
| 1 | [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md) | Who uses Witness, what it connects to, where the trust boundaries are (C4 L1) |
| 2 | [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the system is structured and which decisions carry the weight (C4 L1–L2) |
| 2a | [`views/COMPONENT_VIEWS.md`](views/COMPONENT_VIEWS.md) | The internal structure of selected containers (C4 L3) |
| 3 | [`TECH_STACK.md`](TECH_STACK.md) | Every technology, why it was chosen, and what would replace it |
| 4 | [`DATA_MODEL.md`](DATA_MODEL.md) | The write model — aggregates, bitemporality, tenancy, erasure |
| 4a | [`domains/DOMAIN_MODEL.md`](domains/DOMAIN_MODEL.md) | Every bounded context elaborated — invariants, commands, events, ownership, current vs. future implementation |
| 5 | [`KNOWLEDGE_GRAPH.md`](KNOWLEDGE_GRAPH.md) | The ontology and the projection that produces it |
| 6 | [`EVENT_CATALOGUE.md`](EVENT_CATALOGUE.md) | The event contracts between bounded contexts |
| 7 | [`SECURITY_ARCHITECTURE.md`](SECURITY_ARCHITECTURE.md) | Threat model, controls, and AI-specific attack surface |
| 8 | [`DEPLOYMENT_ARCHITECTURE.md`](DEPLOYMENT_ARCHITECTURE.md) | Profiles, topologies, sizing, recovery, upgrades |
| 9 | [`NFR_SLO.md`](NFR_SLO.md) | Latency, throughput, availability and recovery objectives — quantified where decided, gated where not |
| 10 | [`decisions/`](decisions/) | Twenty-one ADRs — the reasoning behind all of the above |

## The short version

If you read only three things:

1. **[ADR-0011](decisions/ADR-0011-knowledge-graph-as-projection.md)** — PostgreSQL is the system of
   record; Neo4j, OpenSearch and pgvector are disposable projections. This decision makes consent
   revocation, ontology evolution and disaster recovery tractable, and everything else follows from
it.
2. **[ADR-0008](decisions/ADR-0008-consent-as-a-domain-primitive.md)** — consent is enforced by the
   type system and the topology, so a processing path that bypasses it cannot be written.
3. **[ADR-0012](decisions/ADR-0012-provenance-and-human-in-the-loop.md)** — every assertion carries
   an
   unbroken chain to a source utterance and a named human who confirmed it. Model output is never
   institutional fact.

## Conventions

- **Diagrams are Mermaid, in-repo.** No binary formats, no external tooling, no image that drifts
  from the text beside it. Diagrams live in the document they explain; standalone ones go in
  [`diagrams/`](diagrams/).
- **C4 for structure** — context, container, component. We do not draw class diagrams.
- **Documents describe the current intended state.** History lives in git and in superseded ADRs.
- **Every architectural claim should be checkable** — by a test, a fitness function, or a CI gate.
  Claims that cannot be checked are marked as aspirations.

## Sub-directories

| Path | Contents |
|---|---|
| [`decisions/`](decisions/) | Architecture Decision Records |
| [`diagrams/`](diagrams/) | Standalone diagrams not embedded in a document |
| [`views/`](views/) | Architectural views for specific audiences (security assessor, operator, integrator) |
| [`domains/`](domains/) | Per-bounded-context detail as it is elaborated in Phase 1 |

## Contributing to architecture

Architectural changes go through the ADR process
([`docs/engineering/ADR_PROCESS.md`](../docs/engineering/ADR_PROCESS.md)). Changes to files in this
directory require **Principal Architect** and **CTO** approval.

Before proposing a change, check whether an existing ADR already decided it. If it did and you
disagree, write a superseding ADR with new evidence — that is a welcome and legitimate move. What we
do not do is change the architecture and leave the record saying something else.
