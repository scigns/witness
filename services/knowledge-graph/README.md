# Knowledge Graph Service

**Owner:** Knowledge Graph Lead
**Status:** Phase 4

Ontology, graph queries, entity resolution, provenance chain API.

Neo4j is a **projection, not a system of record**
([ADR-0011](../../architecture/decisions/ADR-0011-knowledge-graph-as-projection.md)). This service
holds **read-only** credentials; only the projector writes.

Invariant INV-3: every node and edge resolves to at least one confirmed assertion. Traversal is
capped at depth 6 and 1,000 nodes — an expressive query language exposed to the internet is an
exfiltration primitive.
