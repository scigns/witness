# Search Service

**Owner:** Backend Lead · AI Lead
**Status:** Phase 6

Hybrid retrieval: OpenSearch BM25 + pgvector, fused with Reciprocal Rank Fusion
([ADR-0018](../../architecture/decisions/ADR-0018-hybrid-search-architecture.md)).

**Permission and consent filtering happens inside the query, never as post-processing.**
Post-filtering leaks through result counts, pagination behaviour and timing.
