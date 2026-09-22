# Indexing Worker

**Owner:** Backend Lead
**Status:** Reserved — Phase 6. Not built, not deployed, no active development. This directory
contains only this planning document; there is no `src/`. Depends on `services/search`
(also reserved) — neither OpenSearch nor pgvector is wired into the running application today.

Maintains the OpenSearch lexical index and pgvector embeddings.

Both are projections — rebuildable, and deliberately **not** backed up. Embedding model identity is
stored per vector so a mixed-model index is detectable and repairable after a model change.
