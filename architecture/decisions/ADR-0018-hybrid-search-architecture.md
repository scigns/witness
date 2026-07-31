# ADR-0018: Hybrid search architecture

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-31 |
| **Deciders** | Backend Lead, AI Lead, Knowledge Graph Lead |
| **Related** | ADR-0004, ADR-0011 |
| **Principles engaged** | P6, P8 |

## Context

Users search Witness in two distinct modes, and both must work.

**Known-item lexical search:** a clerk searching for "Section 14 water allocation" needs exact
matching. Semantic search will helpfully return conceptually similar passages that do not contain the
phrase — which for this user is a failure, not a feature.

**Conceptual search:** a policy officer asking "what concerns have communities raised about water
access?" needs to find discussions using entirely different vocabulary — "the bore ran dry", "we're
carting water again", "the pump's been broken since the wet".

Neither approach alone is sufficient, and getting this wrong makes the product feel unreliable in a
way users struggle to articulate but strongly feel.

A third constraint dominates both: **every result must be permission-filtered and consent-filtered
before it leaves the service.** A search result leaking the existence of a restricted meeting is a
disclosure even if the content is withheld — result counts and timing are themselves information.

## Decision

> We will implement hybrid search combining **OpenSearch BM25** for lexical matching with
> **pgvector** for semantic similarity, fused with **Reciprocal Rank Fusion**, and apply
> **permission and consent filtering inside the query**, never as a post-processing step.

Graph-aware ranking boosts results connected to entities the user is already exploring.

## Options considered

### Option A — Lexical only (OpenSearch)

**Pros:** predictable, explainable, fast, cheap; users understand why a result matched.
**Cons:** fails the conceptual search case entirely — and that case is a large part of the product's
value for policy officers.

### Option B — Semantic only (pgvector)

**Pros:** excellent conceptual recall; handles paraphrase and vocabulary mismatch.
**Cons:** poor at exact-match and known-item retrieval; embeddings drift when the model changes,
requiring re-embedding; harder to explain a match to a user; struggles with rare proper nouns, which
are everywhere in our corpus.

### Option C — Hybrid with RRF *(chosen)*

**Pros:** covers both modes; RRF is simple, robust, requires no score normalisation between
incomparable scales, and needs no training data — which matters because we have none at launch.
**Cons:** two indexes to maintain; two systems to keep consistent; higher latency than either alone;
relevance tuning is genuinely harder to reason about.

### Option D — Hybrid with a learned re-ranker

**Pros:** best relevance.
**Cons:** requires training data we do not have, adds a model to the query path (latency and
sovereignty implications), and is much harder to explain. **Deferred**, not rejected — revisit once
we have real usage data from Phase 6, and it would need its own ADR.

### Option E — Post-filtering results for permissions

Rejected on security grounds. Post-filtering leaks information through result counts, pagination
behaviour and timing. Filtering must be in the query.

## Consequences

### Positive

- Both search modes work well, which is what users need.
- RRF requires no training data and no score calibration — it works on day one.
- Permission filtering inside the query eliminates a whole class of information leak.
- `pgvector` avoids a fourth data store (ADR-0004).
- Graph-aware boosting makes search feel connected to the knowledge model rather than bolted beside
  it.

### Negative

- Two indexes to keep consistent; both are projections, so both can be rebuilt, but both can also lag.
- Higher query latency than a single-index approach. Target 800 ms p95, which is achievable but needs
  attention.
- **Re-embedding on model change is expensive** — every utterance must be re-embedded, which for a
  large deployment is hours of GPU time. Needs to be a planned, resumable, backgrounded operation, not
  an upgrade-time surprise.
- Relevance tuning with two systems and a fusion step is hard to reason about and hard to test.

### Risks accepted

- **Embedding model changes invalidate the entire vector index.** Mitigation: the embedding model
  identifier is recorded per vector; re-embedding runs incrementally in the background against a
  shadow index; the old index serves until the new one is complete.
- Relevance quality being poor at launch with no usage data to tune against. Mitigation: a curated
  relevance judgement set built during Phase 6 with real users, and measured with nDCG per release.

## Compliance and enforcement

- Permission and consent filters are applied as query clauses; an adversarial CI test asserts that no
  restricted document is reachable through any search path, including via result counts and
  pagination.
- Relevance regression suite with a judgement set; a drop beyond threshold fails the build.
- Search latency is an SLO with an alert.
- Both indexes are projections — application services hold read-only credentials (ADR-0011).
- Embedding model identity is stored per vector so a mixed-model index is detectable and repairable.

## Reversal

`SearchPort` allows collapsing to Postgres full-text plus `pgvector` — dropping OpenSearch entirely
— for the minimal deployment profile. This is a supported configuration, not merely a theoretical exit,
and it removes a service for small operators.

## References

- Cormack et al., [Reciprocal Rank Fusion](https://dl.acm.org/doi/10.1145/1571941.1572114) (2009)
- [OpenSearch](https://opensearch.org/) · [pgvector](https://github.com/pgvector/pgvector)
