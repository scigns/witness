# Indexing Worker

**Owner:** Backend Lead
**Status:** Phase 6

Maintains the OpenSearch lexical index and pgvector embeddings.

Both are projections — rebuildable, and deliberately **not** backed up. Embedding model identity is
stored per vector so a mixed-model index is detectable and repairable after a model change.
