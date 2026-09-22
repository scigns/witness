# Search Service

**Owner:** Backend Lead · AI Lead
**Status:** Reserved — Phase 6. Not built, not deployed, no active development. This directory
contains only this planning document; there is no `src/`. Neither OpenSearch nor pgvector is wired
into the running application today (STATUS.md: "Hybrid/vector search — Deferred"). The knowledge
graph's own `search` query exists (`services/knowledge-graph`), but is a simple label-match
lookup, not the hybrid BM25+vector retrieval this document plans.

Hybrid retrieval: OpenSearch BM25 + pgvector, fused with Reciprocal Rank Fusion
([ADR-0018](../../architecture/decisions/ADR-0018-hybrid-search-architecture.md)).

**Permission and consent filtering happens inside the query, never as post-processing.**
Post-filtering leaks through result counts, pagination behaviour and timing.
