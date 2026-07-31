# ADR-0004: Polyglot persistence

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Principal Architect, Backend Lead, Infrastructure Lead |
| **Related** | ADR-0011 (projection model), ADR-0018 (search) |
| **Principles engaged** | P6, P7 |

## Context

Witness has four genuinely different data access patterns:

1. **Transactional writes** with strong consistency — consent grants, assertions, audit entries
2. **Graph traversal** — "what connects this community to this policy, at any depth"
3. **Lexical search** — "find every mention of 'water allocation' across 40,000 meetings"
4. **Semantic similarity** — "find discussions about this concept regardless of wording"

No single store does all four well. But every additional store is another thing a two-person
government IT team must back up, monitor, upgrade and recover — and operability is architectural
goal 4, above performance.

The tension is real and this ADR resolves it by constraining *what each store is allowed to be*.

## Decision

> We will use PostgreSQL as the sole system of record, and Neo4j, OpenSearch and pgvector as
> **rebuildable projections** holding no authoritative data. Object storage (MinIO/S3) holds media
> and documents. Redis/Valkey holds only ephemeral state.

| Store | Role | Authoritative? | Backed up? |
|---|---|---|---|
| **PostgreSQL 16** | Event log, write model, consent, audit | **Yes** | **Yes** |
| **pgvector** (in Postgres) | Embeddings | No — regenerable | No |
| **Neo4j 5** | Graph projection | No — rebuildable | No |
| **OpenSearch 2** | Lexical index | No — rebuildable | No |
| **MinIO / S3** | Media, documents | **Yes** — original artefacts | **Yes** |
| **Valkey / Redis** | Cache, locks, rate limits | No — ephemeral | No |

## Options considered

### Option A — Postgres-only
Postgres has JSONB, full-text search, `pgvector`, recursive CTEs, and Apache AGE for graph queries.
**Pros:** one store to operate, back up and recover. Dramatically simpler for the small-deployment
operator. Genuinely tempting.
**Cons:** recursive CTE traversal performance degrades badly beyond three or four hops on a
well-connected graph; Postgres full-text lacks the relevance tuning, faceting and multilingual
analysis that OpenSearch provides. We would be choosing operability over the core product capability
— and graph traversal *is* the product.
**Retained as a "minimal" deployment profile** for small institutions willing to accept the
limitations. This is not a rejected option so much as a deferred second profile.

### Option B — Polyglot with each store authoritative for its own domain
The conventional polyglot approach: Neo4j owns entities, Postgres owns transactions, OpenSearch owns
its documents.
**Pros:** each store used to its full strength; no projection lag.
**Cons:** distributed consistency across four stores; no single backup point; consent revocation must
succeed atomically across four systems or leave data behind — which is a privacy incident. Disaster
recovery requires four consistent snapshots. **Rejected decisively**; this is the option that would
quietly ruin us in year three.

### Option C — Polyglot with Postgres as system of record and everything else as projection *(chosen)*
**Pros:** one backup, one recovery procedure, one consistency boundary; projections rebuild after
corruption, schema change or ontology evolution; consent revocation is deleting from one place and
rebuilding; each store is still used to its strength for reads.
**Cons:** projection lag is a real user-visible phenomenon; rebuild time grows with data volume;
still four things to run, even if only one to back up.

### Option D — Add a dedicated vector database (Qdrant, Weaviate, Milvus)
**Pros:** better vector performance at very large scale; more index types.
**Cons:** a fifth store for a capability `pgvector` provides adequately at our scale (tens of
millions of vectors, not billions). Rejected on operability. Revisit only with measured evidence of a
`pgvector` bottleneck.

## Consequences

### Positive
- **One backup, one restore procedure.** The single largest operability win available to us.
- Ontology changes require a projector change and a replay, not a data migration.
- Consent revocation and erasure have a tractable, verifiable implementation.
- A corrupted or lost projection is an inconvenience, not a data-loss event.
- Each read pattern is served by a store that is good at it.

### Negative
- **Projection lag is real** and must be surfaced honestly in the UI, not hidden.
- Rebuild time grows with data volume — architectural risk A-2, tracked and measured.
- Four services to run even in the single-node profile, which is a meaningful operational load.
- Postgres becomes a hard single point of failure. Accepted deliberately; it is the one component we
  advise every non-trivial deployment to replicate.
- Some duplication of data across stores, and therefore storage cost.

### Risks accepted
That rebuild time eventually exceeds the maintenance window at national scale. Mitigations designed
in from the start: incremental and partitioned rebuilds, shadow-store rebuild with atomic swap,
continuously measured rebuild duration with an alert threshold. If a full rebuild ever exceeds 6
hours for 100k meetings, that is a signal to invest, not to discover.

## Compliance and enforcement

- Every store access is behind a port: `RepositoryPort`, `GraphPort`, `SearchPort`, `VectorPort`,
  `ObjectStorePort`, `CachePort`.
- **A projection store must never be written to except by its projector.** Enforced by per-service
  database credentials — application services hold read-only credentials on Neo4j and OpenSearch.
  Structural, not procedural.
- A CI test drops and rebuilds all projections from the event log and asserts equivalence. If this
  test does not pass, the central claim of this ADR is false.
- Backup tooling covers Postgres and object storage only, by design.

## Reversal

Moving to Postgres-only (Option A) is a supported future path — it means implementing `GraphPort`
over Apache AGE and `SearchPort` over Postgres FTS, with no data migration because the source of
truth does not move. This is roughly two to four weeks of work and is precisely the flexibility the
port boundaries are for. Open decision D-4 tracks the Neo4j/AGE evaluation.

Moving to Option B would require re-architecting consent revocation, backup and recovery. We would
not do it.

## References

- [`ARCHITECTURE.md` §5.1](../ARCHITECTURE.md) · [`DATA_MODEL.md`](../DATA_MODEL.md)
- [`docs/research/OSS_EVALUATION.md`](../../docs/research/OSS_EVALUATION.md)
