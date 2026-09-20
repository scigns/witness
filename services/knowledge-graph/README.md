# Knowledge Graph

**Owner:** Knowledge Graph Lead
**Status:** Phase 2 — implemented (`@witness/knowledge-graph`)

Read-only query layer onto the Neo4j projection: `getNode`, `neighbourhood`,
`provenanceForNode`/`provenanceForEdge`, `search`. Bounded per
[`KNOWLEDGE_GRAPH.md`](../../architecture/KNOWLEDGE_GRAPH.md) §9 (depth ≤ 6,
≤ 1,000 result nodes, 5s timeout, parameterised queries only).

Neo4j is a **projection, not a system of record**
([ADR-0011](../../architecture/decisions/ADR-0011-knowledge-graph-as-projection.md)).
This package holds only read methods — there is no write/merge/upsert method
on `GraphRepository` anywhere, and there never should be. Only
[`workers/graph-projector`](../../workers/graph-projector) writes to Neo4j.

Invariant INV-3: every node and edge resolves to at least one confirmed
assertion. Traversal is capped at depth 6 and 1,000 nodes
(`graph-repository.port.ts`).

**Known gap:** Neo4j Community Edition (the deployed image, `neo4j:5-community`)
has no database-level RBAC, so "read-only credentials" is enforced by this
package's interface surface (no write method exists) rather than by a
database grant. True database-enforced separation needs Neo4j Enterprise or
Apache AGE — tracked as open decision D-4 / KG-3 in `KNOWLEDGE_GRAPH.md` §12.

See `src/neo4j-graph-repository.ts`'s file header for the exact graph shape
this package's queries assume — it must stay in sync with
`workers/graph-projector`'s writes.
