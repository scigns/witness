# ADR-0011: Knowledge graph as a projection

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Principal Architect, Knowledge Graph Lead, Backend Lead, CTO |
| **Related** | ADR-0004, ADR-0005, ADR-0008 |
| **Principles engaged** | **P3 (provenance)**, P6 (decades) |

> This is the load-bearing architectural decision of the project. If any single ADR is worth reading
> in full, it is this one.

## Context

Witness produces a knowledge graph. The obvious design is to make the graph database the system of
record: entities and relationships live in Neo4j, the application reads and writes them there.

That obvious design fails against four requirements, each individually decisive:

1. **Consent revocation.** When a subject revokes consent, every assertion derived from their words
   must disappear from every store within minutes, verifiably. With the graph as system of record,
   this is a cascading graph mutation with no transactional guarantee across the other stores, and no
   way to verify completeness.
2. **Ontology evolution.** We will get the ontology wrong. Changing entity types with the graph as
   system of record means an in-place migration of production graph data — the kind of operation
   that is risky, slow, and irreversible when it goes wrong at 3am.
3. **Model re-runs.** When extraction improves, we want to re-derive knowledge from existing
   transcripts. With the graph authoritative, that means reconciling new output against existing
   nodes with no clean way to distinguish "the model changed its mind" from "the world changed".
4. **Disaster recovery.** Four authoritative stores means four consistent snapshots. For a
   two-person IT team, this is where recovery quietly fails.

There is also a bitemporality requirement: an auditor asks "what did we believe on the date that
decision was made?" Property graphs model current state well and belief-over-time poorly.

## Decision

> We will treat **PostgreSQL as the sole system of record**, holding an append-only event log and a
> normalised write model. Neo4j, OpenSearch and pgvector are **projections** — derived, disposable,
> and rebuildable from the log at any time. They hold no authoritative data and are never written to
> except by their projectors.

Bitemporality lives in the write model: **valid time** (when true in the world) and **transaction
time** (when we believed it) as independent axes. The graph projects current belief about all
validity periods; historical belief is answered by replaying the log.

## Options considered

### Option A — Neo4j as system of record
**Pros:** one store for graph data; no projection lag; simpler mental model; natural fit for the
domain.
**Cons:** all four failures above. Additionally: Neo4j Community lacks clustering, making it a
single point of failure holding authoritative data; and it puts a single-vendor product on the
critical path for data we cannot lose. **Rejected.**

### Option B — Dual write to Postgres and Neo4j
**Pros:** both stores current; no lag.
**Cons:** dual write without distributed transactions guarantees eventual divergence — this is
well-established and there is no version of it that works. Rejected without further consideration.

### Option C — Postgres as system of record, graph as projection *(chosen)*
**Pros:** one backup, one recovery procedure, one consistency boundary; consent revocation is a
delete plus a rebuild, verifiable; ontology changes are a projector change plus a replay, with no
data migration; model re-runs are re-derivation without corrupting history; bitemporality is natural
in a relational model; projections can be rebuilt after corruption with no data loss; the graph is
free to be optimised purely for reads.
**Cons:** projection lag is user-visible; rebuild time grows with volume; projector code is a real
component with real complexity; conceptually less obvious to newcomers.

### Option D — Full event sourcing with aggregates rebuilt from events on load
**Pros:** maximal auditability; no separate write model to keep consistent.
**Cons:** snapshotting, event versioning and replay performance are substantial ongoing complexity.
We take the event log — which is where the value is — without paying for rebuild-on-every-load. A
pragmatic middle path.

## Consequences

### Positive
- **Consent revocation is tractable and verifiable**, which alone justifies the decision.
- Ontology evolution costs a projector change and a replay — we can afford to be wrong, which we
  will be.
- Extraction improvements can be applied retroactively without corrupting the historical record.
- Backup is one database and one object store. Projections are explicitly *not* backed up.
- A corrupted or lost projection is an inconvenience, not a data-loss event.
- Bitemporal queries are natural rather than contorted.
- Neo4j becomes replaceable — Apache AGE or another graph store is a projector change (open decision
  D-4). Nothing irreplaceable sits on the critical path.

### Negative
- **Projection lag is real and user-visible.** After confirming an assertion, a user may not see it in
  the graph for seconds. We must show honest processing status rather than pretending it is instant.
- **Rebuild time grows with data volume** — architectural risk A-2. At national scale a full rebuild
  could take hours. Mitigations designed in from the start: incremental and partitioned rebuild,
  shadow-store rebuild with atomic swap, continuously measured duration.
- Projector code is a genuine component requiring idempotency, checkpointing, ordering discipline and
  its own tests.
- Storage duplication across the write model and projections.
- Higher conceptual load. Contributors must understand that the graph is *derived*, and someone will
  eventually try to write to Neo4j directly.

### Risks accepted
- Rebuild exceeding the maintenance window at scale. Signal: measured rebuild duration approaching 6
  hours for 100k meetings. Response: invest in incremental rebuild before it becomes urgent.
- A projector bug producing a silently wrong graph. Mitigation: the CI test that drops and rebuilds
  all projections and asserts equivalence — if that test does not exist and pass, the central claim
  of this ADR is unverified.

## Compliance and enforcement

- **Application services hold read-only credentials on Neo4j and OpenSearch.** Only the projector
  holds write credentials. Writing to a projection from application code is structurally impossible,
  not merely forbidden.
- CI test: drop all projections, rebuild from the event log, assert equivalence with the pre-drop
  state.
- Projectors are idempotent (`MERGE`, never `CREATE`), checkpointed, and resumable.
- `projection_lag_events` is an alerted metric; lag is surfaced in the UI.
- Backup tooling deliberately excludes projection stores; documented so an operator does not "fix"
  the omission.

## Reversal

Effectively irreversible without re-architecting consent revocation, recovery and ontology evolution
— all three of which depend on it. This is a foundational commitment made deliberately and early,
which is why it is documented at this length.

## References

- [`ARCHITECTURE.md` §5.1](../ARCHITECTURE.md) · [`KNOWLEDGE_GRAPH.md` §8](../KNOWLEDGE_GRAPH.md) · [`DATA_MODEL.md` §4](../DATA_MODEL.md)
- Martin Fowler, [CQRS](https://martinfowler.com/bliki/CQRS.html) · Snodgrass, *Developing Time-Oriented Database Applications* (1999)
