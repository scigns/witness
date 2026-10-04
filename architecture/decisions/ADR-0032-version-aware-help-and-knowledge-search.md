# ADR-0032: Version-aware help and knowledge search

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-10-04 |
| **Deciders** | CTO, Product Lead, Backend Lead |
| **Consulted** | Security Lead |
| **Informed** | Documentation Lead, Frontend Lead |
| **Supersedes** | none |
| **Related** | ADR-0004, ADR-0006, ADR-0007, ADR-0017, ADR-0018 |
| **Principles engaged** | P1 (digital sovereignty), P2 (consent), P6 (decades), P7 (boring technology) |

## Context

Witness has no in-product help surface. `apps/docs-site` and `services/search` are placeholder
directories ("Reserved — Phase 6. Not built, not deployed."). Documentation only exists as
repository markdown (`docs/guides`, `docs/product`, etc.) that a signed-in user — including
institutional staff on an air-gapped sovereign deployment with no internet access — cannot reach
from the application at all.

Institutions run specific, often old, versions of Witness for long stretches (ADR-0017: Stable
every six weeks, LTS for 24 months). A help answer written for the current `main` can be actively
wrong for a user on an LTS build from a year ago — wrong instructions in an institutional-memory
product are worse than no instructions, because they cost trust the product exists to protect.

Witness also enforces strict role/entitlement boundaries (ADR-0007, the Casbin policy in
`packages/policy`, the entitlement evaluator in `services/api-gateway/src/commercial`). A help
system that answers "what can my role do?" by describing capabilities the asking user cannot
reach is itself a disclosure — the same principle ADR-0018 already states for evidence search:
permission filtering happens inside the query, never as post-processing, because result counts and
timing leak information even when content is withheld.

ADR-0018 already chose OpenSearch + pgvector hybrid search for *evidence* content, and explicitly
marked it Deferred (`services/search` README confirms: "Neither OpenSearch nor pgvector is wired
into the running application today"). Help content is a different corpus with different
requirements: it is small (low thousands of chunks, not an open-ended evidence corpus), mostly
exact-phrase and "how do I" lookups rather than conceptual semantic recall, and must run inside a
sovereign/air-gapped deployment with zero additional infrastructure (P1, P7) — the same deployment
profile that makes Keycloak and Postgres the only guaranteed-present dependencies (ADR-0013). Stage
0 (an internal evaluation of Meilisearch against this requirement) found no case in this corpus
size and query shape that justifies running and securing a second stateful service when Postgres,
already the system of record (ADR-0004), has first-class full-text search.

We need this decision now because any schema or indexing choice made here determines how
documentation provenance, version-pinning and permission-filtering are modelled, and getting the
shape wrong means a second migration later rather than an additive one.

## Decision

> We will build Help & Knowledge as a server-enforced, permission-filtered Postgres full-text
> search over versioned documentation snapshots, modelled as
> **Application Release → Documentation Snapshot → Search Index Version**, with no new
> infrastructure dependency and no AI/LLM dependency in this phase.

Each deployed application version activates exactly one documentation snapshot. Each snapshot's
chunks are indexed using Postgres `tsvector`/`ts_rank`. Every query is scoped, inside the SQL query
itself, to: the chunks belonging to the caller's active snapshot, and the chunks whose declared
minimum role/entitlement the caller's resolved role and entitlement set actually satisfy. A chunk
restricted above the caller's level is excluded from the candidate set before ranking, not filtered
from a returned list — so it cannot affect result count, order, or timing.

The architecture is built so an optional LLM/RAG layer could later sit on top of this same
permission-filtered retrieval layer as a re-ranker or answer-synthesiser, without changing the
schema or the authorization boundary. No such layer is built now.

## Options considered

### Option A — Postgres full-text search *(chosen)*

**Description.** `tsvector` columns on a `DocumentationChunk` table, GIN index, `ts_rank` for
relevance, permission predicate in the same `WHERE` clause as the rank.
**Pros:** zero new infrastructure; works identically in the sovereign/on-prem/air-gapped profile
and the cloud-managed profile (ADR-0013); one database to back up, secure and reason about;
permission filtering is a native SQL predicate, so there is no second system that could fall out
of sync with the authorization model; corpus size (documentation, not evidence) is small enough
that FTS relevance is adequate.
**Cons:** no semantic/conceptual recall — "how do I..." phrased very differently from the docs'
wording will miss; weaker relevance tuning than a dedicated engine; will need re-evaluation if the
corpus grows by an order of magnitude or conceptual recall proves necessary.

### Option B — Meilisearch

**Description.** Self-hosted open-source search engine, typo-tolerant, fast to stand up.
**Pros:** materially better out-of-the-box relevance and typo tolerance than Postgres FTS; the
brief's own suggested starting point.
**Cons:** a new stateful service to deploy, secure, upgrade and back up in *every* deployment
profile including sovereign/air-gapped, where every additional dependency is a real operational
and procurement cost (P1, P7); permission filtering would have to be re-implemented in Meilisearch's
filter syntax and kept in lockstep with the Casbin policy, duplicating an authorization boundary
that today lives in exactly one place; not justified by the current corpus size or query shape.
**Why not chosen:** the brief asks us to evaluate Meilisearch first, and this ADR records that
evaluation and the reason it loses to Option A for this corpus — not that it is a bad engine in
general. Revisit under Reversal below.

### Option C — OpenSearch + pgvector hybrid (reuse ADR-0018's evidence-search stack)

**Description.** Route help search through the same hybrid stack planned for evidence.
**Pros:** one less architecture to maintain long-term if evidence search is ever built.
**Cons:** ADR-0018's stack is itself Deferred and unbuilt; coupling an achievable Phase 6 slice to
an unbuilt, heavier dependency would block Help & Knowledge on evidence search's timeline for no
benefit — the two corpora have different consistency and recall requirements and don't need to
share infrastructure just because they are both "search."
**Why not chosen:** couples two unrelated roadmaps and adds infrastructure dependency for no
measured benefit over Option A at this corpus size.

## Consequences

### Positive

- No new infrastructure to deploy, patch, back up or secure in any deployment profile, including
  the sovereign/air-gapped one where that cost is highest.
- Permission filtering is one SQL predicate next to the rank, inside the same transaction as the
  query — there is no second place it can drift from the Casbin policy.
- A version mismatch between what a user sees and what their deployed build actually does becomes
  structurally impossible: the snapshot is selected by deployed version, not by "latest."
- An LLM/RAG layer, if ever justified, has a stable, already-permission-safe retrieval API to sit
  behind.

### Negative

- Relevance quality is materially worse than a dedicated search engine for paraphrased or
  conceptual queries ("what does this mean" style questions that don't share vocabulary with the
  docs). Users doing exact-phrase/"how do I X" lookups will do fine; users asking broad conceptual
  questions may get weak results and conclude the feature doesn't work.
- Re-indexing a new documentation snapshot is a synchronous write path we now own and must keep
  fast enough not to block a release.
- If the documentation corpus grows substantially (e.g., full API reference, many sector-specific
  guides), this decision will need revisiting before it degrades silently.

### Neutral

- Does not preclude later introducing Meilisearch for a different corpus (e.g., evidence) where
  its tradeoffs land differently.

### Risks accepted

- We are knowingly shipping weaker conceptual search than a dedicated engine would give, in
  exchange for zero new infrastructure. The signal that this was wrong: sustained user complaints
  that help search "doesn't find anything" for queries that are topically relevant but
  lexically distant from the indexed text, measured via zero-result query logging.

## Compliance and enforcement

- A test asserts that a chunk whose declared minimum role/entitlement exceeds a test caller's
  resolved access never appears in that caller's result set, count, or total — mirroring the
  cross-tenant/role-leakage tests already required by ADR-0018's equivalent evidence-search rule.
- A test asserts that a caller pinned to documentation snapshot N never receives a chunk belonging
  to snapshot N+1, and vice versa.
- Code review checklist item: any new help-search query must filter permissions inside the SQL
  predicate, never in application code after rows are fetched.

## Reversal

Migrating from Postgres FTS to Meilisearch later is additive, not destructive: the
`DocumentationChunk` provenance fields (source document, document version, application version,
indexed timestamp, last-updated timestamp) are reusable as the payload documents for any future
external index; only the query path changes. Revisit if: zero-result query logging shows
sustained conceptual-query failure, or the documentation corpus grows beyond what FTS relevance
can reasonably rank (rough threshold: tens of thousands of chunks or multi-language stemming needs
beyond Postgres's built-in dictionaries).

## References

- `architecture/decisions/ADR-0018-hybrid-search-architecture.md` — the equivalent decision and
  permission-filtering rule for evidence search.
- `architecture/decisions/ADR-0017-versioning-and-release-strategy.md` — the release-class model
  this ADR's snapshot-activation design depends on.
- `services/search/README.md` — prior-art status note confirming no search infrastructure is
  wired in today.
