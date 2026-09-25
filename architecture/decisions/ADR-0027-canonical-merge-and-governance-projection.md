# ADR-0027: Canonical merge resolution and governance-state projection

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-22 |
| **Deciders** | Knowledge Graph Lead, Backend Lead, Principal Architect |
| **Consulted** | Governance Lead (disagreement/perspective-tag visibility) |
| **Informed** | All contributors |
| **Supersedes** | none |
| **Related** | ADR-0011, ADR-0012, ADR-0013, ADR-0019, ADR-0026 |
| **Principles engaged** | **P3 (provenance)**, P5 (Indigenous data sovereignty), P6 (decades) |

## Context

Phase 3 manual curation (ADR-0026's follow-on) shipped concept merging (`KnowledgeEntitiesService
.merge`) and a Cytoscape graph explorer before either was tested against a live Neo4j with real
merge and disagreement data. Doing so surfaced two read-model gaps:

**Gap A — governance metadata invisible on the graph.** `KnowledgeAssertion.lifecycleState` and
`.perspectiveTags` (`contested`, `minority_perspective`, `culturally_significant`, `unresolved`,
`community_restricted`, `machine_inferred` — `packages/domain/src/knowledge-assertion.ts`) were
already written onto each relationship's `:Assertion` node by the projector
(`neo4j-projector.ts`'s `MERGE_ASSERTION_CYPHER` has always done this — it was never a
write-side gap), but `Neo4jGraphRepository.neighbourhood`'s read query never fetched them back
onto the `GraphEdge` it returns. A contested relationship and a settled one were indistinguishable
in the graph view without an extra click into "why is this here?" for every single edge.

**Gap B — a merged concept could remain a live graph peer.** `mergeKnowledgeEntities`
(`packages/domain/src/knowledge-entity.ts`) correctly tombstones the losing entity
(`status: 'merged'`, `mergedIntoId` set) and never touches `KnowledgeRelationship`/
`KnowledgeEntityAttribute` rows — by design, per this same ADR's decision below, history is
tombstoned, never rewritten. But nothing told the graph-projector a merge had happened at all (no
outbox event existed for it), so a relationship confirmed before the merge kept citing the merged
entity's *original* id forever in Neo4j — the current graph would show two disconnected people
where a steward had just said "these are one person."

Both gaps are read-side. PostgreSQL's own state (ADR-0011: sole system of record) was correct in
both cases; the projection had not caught up.

## Decision

> **The current graph must show the current governed interpretation of the evidence, while Witness
> retains the full historical path by which that interpretation was reached.**
> PostgreSQL's `KnowledgeRelationship`/`KnowledgeEntityAttribute`/`KnowledgeEntity` rows are never
> rewritten to simplify the read model. The graph-projector resolves and re-derives; it does not
> ask the write model to change shape on its behalf.

### Gap A — project governance state onto the edge, redact by existing permission, not a new one

`Neo4jGraphRepository.neighbourhood` now looks up each edge's `:Assertion` node in the same query
(a Cypher pattern comprehension, not a second round-trip) and returns `lifecycleState` and
`perspectiveTags` on `GraphEdge`. No new Neo4j write path, no duplicate governance concept — this
is the same `Assertion` node `provenanceForEdge` has always read, just also read here.

**Redaction, reusing an existing gate, not inventing one.** `community_restricted` is the one
`PerspectiveTag` whose entire point is community-only visibility; every other tag is exactly as
visible as the edge itself already is. Rather than design a new sensitivity-clearance system (no
such system exists anywhere else in this codebase — inventing one here, under a consistency-fix
pass, would be exactly the "parallel model" this project's standing instruction on architectural
conflicts forbids), `community_restricted` detail is gated on `knowledge_provenance:inspect` — the
permission that already exists specifically to distinguish "can see the graph's shape" from "can
see evidence/governance detail" (`KnowledgeGraphQueryController`'s file header, unchanged since
ADR-0026). The controller now calls `PolicyEnforcementService.decide` a second time, in-process,
for this one permission, and passes the boolean down; it does not change what `@Requires
('knowledge_entity:read')` allows.

**What this deliberately does not fix.** No general sensitivity-clearance model exists for
`confidential`/`restricted` `KnowledgeEntity`/`KnowledgeAssertion` rows — `sensitivityClass` is
informational everywhere in this codebase today, gating nothing. That is a real, larger,
pre-existing gap (present since ADR-0026, not introduced here), and it is out of scope for this
ADR. It must be resolved by its own ADR before AI-assisted extraction (Phase 5) materially
increases the volume of sensitive material the graph holds — see Consequences.

### Gap B — read-time canonical resolution at the projector, never a Postgres rewrite

Two options were considered for making the *current* graph resolve `B merged into A` as `A`:

**Option A — rewrite `KnowledgeRelationship.fromEntityId`/`toEntityId` on merge.** Rejected. This
mutates a row that is part of a confirmed assertion's permanent record — exactly what ADR-0012's
provenance guarantee and this project's "never rewrite history" convention (already established for
candidate corrections, `KnowledgeReviewDecision.correctedPayload`) both forbid. It would also make
`KnowledgeRelationship` rows lie about what was actually confirmed at the time.

**Option B — resolve canonically at projection time** *(chosen)*. `workers/graph-projector/src/
postgres-source.ts` gained `resolveCanonicalEntity`, which walks `KnowledgeEntity.mergedIntoId`
chains (structurally acyclic — merge targets must be `active`, and a merge sets the loser to
`merged`, so a later attempt to merge back through it fails `MERGE_REQUIRES_ACTIVE_ENTITIES`; a
50-hop cap exists only as a defensive backstop, not the real safety mechanism) to the terminal,
never-merged entity. `loadAssertionProjection` — the one function both the live per-event path and a
full `rebuild.ts` replay share — calls it for every entity/fromEntity/toEntity before projecting, so
neither path can disagree with the other about which entity a relationship currently resolves to.
This is squarely "a projector change plus a replay" — the exact evolution mechanism ADR-0011
prescribes, not an exception to it.

A merge on its own previously produced no outbox event at all (only an audit event). It now also
emits `org.witness.knowledge.entity.merged.v1` (`{survivingEntityId, mergedEntityId}`,
`EVENT_CATALOGUE.md` §2 naming). The graph-projector's poll loop, on receiving it, re-loads and
re-projects every assertion that directly cited the merged entity (`fetchAssertionIdsReferencingEntity`)
— each one now resolves through the canonical chain onto the survivor — and only then removes the
merged entity's own Neo4j node (`removeMergedEntityNode`, `DETACH DELETE`). The removal running last
is load-bearing: reversing the order would leave a relationship without an endpoint for the window
between the two steps.

**Defence in depth.** Every current-graph read query (`neighbourhood`, `getNode`, and — already, since
before this ADR — `search`) additionally filters `status = 'active'` on every returned
`KnowledgeEntity` node. This means a merged entity cannot surface as an active peer even if the
projector's re-projection step were ever buggy or incomplete — the read side enforces the invariant
independently of whether the write side got it right, matching this codebase's established "defence
in depth" convention (ADR-0013, applied there to tenant scoping).

### Duplicate and conflicting relationships

If, before a merge, both `A -[SUPPORTS]-> X` and `B -[SUPPORTS]-> X` exist as separately-confirmed
assertions, re-projecting `B`'s relationship after `B` merges into `A` produces **two** distinct
Neo4j relationships between `A` and `X` — not one collapsed edge. This is a deliberate choice, not
an accepted flaw:

- Each retains its own `id`, `assertionId` and therefore its own independent `provenanceForEdge`
  result. Collapsing them into one edge would have to pick a winner's `id` (destroying the other's
  addressability) or invent a synthetic aggregate edge with no assertion of its own — a new,
  unrequested concept.
- This is not new behaviour introduced by merging. Two *reviewers independently confirming the same
  fact from two different sessions* already produced two parallel Neo4j edges before this ADR, for
  the identical reason (`KnowledgeRelationship` rows are assertion-keyed, and Cypher's `MERGE`
  pattern here is keyed on the relationship's own `id`, not on `(from, type, to)`). Merging two
  entities is only a new *path* to the same pre-existing situation, not a new situation.
- "Multiple evidence items support the same graph relationship" is explicitly a case this schema
  was built to represent, not an anomaly to suppress (`KNOWLEDGE_GRAPH.md` §5).

Two parallel identically-typed edges is therefore not "a misleading duplicate" — each is
independently inspectable, and a reviewer expects "click this connection" to mean *this specific
edge's* evidence, not an ambiguous blend of several. The UI is responsible for making two edges
between the same pair legible (the graph explorer already draws them as separate curved lines by
Cytoscape's default bundling), not the projection for hiding the fact that two exist.

Where `A -[SUPPORTS]-> X` and `B -[OPPOSES]-> X` exist and `B` merges into `A`, both resolve onto
`A` and both remain — `SUPPORTS` and `OPPOSES` are different relationship types, so Cypher's
type-qualified `MERGE` pattern can never conflate them. Disagreement recorded before a merge is
disagreement recorded after it; a merge changes who holds a position, never how many positions
exist. Preserving this required no additional code — it falls out of resolving entity ids without
touching relationship types.

## Consequences

### Positive

- A contested, unresolved, minority-perspective or culturally-significant relationship is visible
  in the graph explorer itself (dotted amber edge + ⚑ label + accessible list-view text), not only
  after clicking through to its provenance — closes `KNOWLEDGE_GRAPH.md` §12's KG-2 for the
  relationship case (the entity-attribute case remains served by the Concept detail page's existing
  "History & disagreement" section).
- A merged concept can no longer appear as a live peer in the current graph, in either the live
  per-event path or a full rebuild, and both paths share one resolution function so they cannot
  drift from each other.
- Chained merges (`C` into `B` into `A`) resolve to `A` in one call, no matter how many hops.
- Disagreement recorded before a merge (opposing relationships from two now-merged concepts)
  survives the merge unchanged.
- No new authorization concept, no new Neo4j write path, no rewritten history.

### Negative

- `neighbourhood`'s query is measurably more expensive (a pattern comprehension per edge, plus the
  extra `status = 'active'` predicate on both traversal endpoints). Not benchmarked at scale in this
  pass — flagged as a risk below, not treated as resolved.
- A merge is no longer "just" a Postgres transaction from the caller's perspective — it also depends
  on the graph-projector eventually consuming its outbox event. Projection lag (already an accepted,
  documented consequence of ADR-0011) now applies to merges too: for a window after confirming a
  merge, the graph may still show the pre-merge shape.
- Two parallel edges for independently-confirmed identical claims (merge-induced or not) place the
  burden of legibility on the UI. A future dense graph with many such pairs may need an explicit
  "N supporting assertions" affordance; not built here.

### Risks accepted

- **Sensitivity-based access control does not exist.** `confidential`/`restricted` entities and
  assertions are visible to anyone holding `knowledge_entity:read`, unchanged by this ADR. This was
  already true before Gap A/B and remains true after. **Signal:** any plan to admit
  machine-generated candidates at volume (Phase 5) without this resolved first.
  **Response:** a dedicated ADR defining a clearance model before that phase begins — not
  something to retrofit under a "consistency fix."
- **Re-projection on merge is not yet load-tested.** An entity with a very large number of
  referencing assertions makes a merge's graph-side catch-up proportionally slower.
  **Signal:** merge latency complaints, or `projection_lag_events` spiking after a merge at scale.
  **Response:** batch the re-projection, or move it off the request path entirely (it already is —
  it runs in the projector's own poll loop, not synchronously with the merge API call — but a very
  large batch could still starve other pending events in the same poll tick).

## Compliance and enforcement

- `Neo4jGraphRepository.neighbourhood`/`getNode` filter `status = 'active'` in Cypher, not only in
  application code, so no call path can accidentally skip the filter.
- `resolveCanonicalEntity` is the single function both `main.ts`'s live handler and `rebuild.ts`'s
  full replay call through — there is no second, divergent resolution path to keep in sync.
- Unit tests: `postgres-source.test.ts` (chain resolution, including a defensive-cap regression for
  a cycle that should be structurally impossible), `neo4j-graph-repository.test.ts` (governance
  metadata surfacing and `community_restricted` redaction, `status = 'active'` present in the
  Cypher text for both affected queries), `neo4j-projector.test.ts` (`removeMergedEntityNode`),
  `knowledge-entities.service.test.ts` (merge emits the outbox event with both entity ids).
- Live verification against a real Neo4j + PostgreSQL + running api-gateway is recorded in this
  feature's closing report, naming exactly which invariants were exercised live versus by unit test
  with a fake driver/pool — per this project's standing rule never to claim live coverage that was
  not actually executed.

## Reversal

Gap A's redaction rule is a one-line policy change (which permission gates
`community_restricted`), reversible without a migration. Gap B's resolution logic lives entirely in
the disposable projector (ADR-0011); reversing it is a projector change plus a rebuild, not a data
migration, exactly as ADR-0011 promises for ontology-adjacent changes.

## References

- [`KNOWLEDGE_GRAPH.md` §13](../KNOWLEDGE_GRAPH.md) ·
  [ADR-0011](ADR-0011-knowledge-graph-as-projection.md) ·
  [ADR-0012](ADR-0012-provenance-and-human-in-the-loop.md) ·
  [ADR-0013](ADR-0013-tenancy-and-deployment-topology.md) ·
  [ADR-0026](ADR-0026-evidence-knowledge-graph-implementation.md)
