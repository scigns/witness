# ADR-0026: Evidence knowledge graph — implementation reconciliation (Phases 1–2)

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-09-19 |
| **Deciders** | Knowledge Graph Lead, Backend Lead, Principal Architect |
| **Consulted** | Governance Lead (community validation and sensitivity provisions) |
| **Informed** | All contributors |
| **Supersedes** | none |
| **Related** | ADR-0004, ADR-0005, ADR-0007, ADR-0011, ADR-0012, ADR-0013, ADR-0019, ADR-0021 |
| **Principles engaged** | **P3 (provenance)**, **P4 (machine proposes, human disposes)**, P5 (Indigenous data sovereignty), P6 (decades) |

## Context

`architecture/KNOWLEDGE_GRAPH.md`, `architecture/DATA_MODEL.md`, ADR-0011 and ADR-0012 already
ratify a complete design for this feature: Postgres as sole system of record, Neo4j as a disposable
read-only projection, a thirteen-type closed ontology, and a hard `CandidateAssertion` /
`Assertion` split with non-nullable provenance. `ROADMAP.md` schedules the implementation as Phase 4
(graph projection, 2027-01) and Phase 5 (extraction) — not yet started, gated behind an event
backbone (Phase 3) that also does not exist as code.

A product request to build "an Evidence Knowledge Graph" arrived using its own vocabulary —
`KnowledgeAssertion`, `KnowledgeDomain`, `KnowledgeRelationship`, `CulturalConcept`, `Issue`,
`Proposal`, `Outcome` as node types, dotted-namespace permission strings — that does not match the
ratified names in several places, and asks for delivery now rather than on the documented schedule.
ADR-0021 established that this repository resolves exactly this kind of conflict — two descriptions
of the same thing sitting in the tree — through a decision record, not a silent pick. This ADR is
that record for the knowledge-graph feature specifically, plus the schedule question.

**Schedule.** Building ahead of `ROADMAP.md` Phase 4/5 is a deliberate, product-directed choice for
this work, not scope creep discovered after the fact — recorded here so a future reader does not
conclude the roadmap was silently abandoned. Scope for this pass is bounded to the roadmap's own
Phase 1 (domain, governance, permissions) and Phase 2 (graph projection) deliverables; Phase 3
(manual curation UX), Phase 4 UI, Phase 5 (AI extraction) and Phase 6 (community validation UX)
remain future work, tracked in `STATUS.md`/`ROADMAP.md` as pulled-forward-partially rather than
complete.

## Decision

> We implement to the **ratified ontology and provenance model**, not the incoming request's
> vocabulary where the two differ, and record every reconciliation point below rather than silently
> picking one.

1. **Tenancy naming.** `DATA_MODEL.md`'s aspirational `tenant` table is not introduced. The
   already-implemented `Organisation` → `Workspace` hierarchy (`schema.prisma`) is the tenant model;
   every new table scopes to `organisationId`/`workspaceId`, matching every existing table, not a
   parallel `tenant_id`.

2. **The thirteen-type ontology is closed, as `KNOWLEDGE_GRAPH.md` §11 requires.** We do not add
   `CulturalConcept`, `Issue` or `Proposal` as new core node types. `Topic` (already reserved as the
   ontology's SKOS-aligned "connective tissue" type, open question KG-1) carries a `topicScheme`
   attribute distinguishing cultural concepts, themes, issues and general concepts as *values within
   one controlled vocabulary field*, not distinct node types. This is a partial, provisional answer
   to KG-1 — it does not resolve whether `Topic` is the right thirteenth type, only that if it is,
   this is how it accommodates the request's broader taxonomy. A future ontology change to add a
   dedicated node type still requires Knowledge Graph Lead + Principal Architect sign-off and its own
   ADR, per `KNOWLEDGE_GRAPH.md` §11.

3. **`KnowledgeDomain` is a workspace-scoped governance grouping, not a graph node type.** It
   configures which entity/relationship traffic (Community, Governance, Needs, Problems, Ideas,
   Decisions, Cultural Knowledge, Outcomes, Commitments, or an operator-defined additional domain) is
   subject to which validation policy and visibility scope. It is Postgres write-model configuration
   consumed by the assertion lifecycle, never projected into Neo4j as a node.

4. **Terminology maps onto the ratified names:** the request's `KnowledgeAssertion` is
   `CandidateAssertion` (unconfirmed) and `Assertion` (confirmed) exactly as ADR-0012 requires — we
   do not introduce a third name. `KnowledgeRelationship` is the ratified `Relationship` write-model
   row.
   `KnowledgeAlias` is `EntityAlias`. `KnowledgeReview`/`KnowledgeValidation` are `ReviewDecision` plus
   lifecycle state on `Assertion` — a dedicated community-response aggregate is Phase 6 work and is
   *not* built in this pass beyond the lifecycle-state field it will eventually drive.
   `KnowledgeGraphVersion` is the existing bitemporal `validFrom`/`validTo` plus
   `ProjectionCheckpoint` — no separate version-numbered snapshot object is introduced yet; full
   facilitator-workflow snapshotting is Phase 7.

5. **The relationship type vocabulary is data, not an enum or a hardcoded union**, per the original
   request's own instruction and `KNOWLEDGE_GRAPH.md` §11's versioning/extensibility rule: a
   `RelationshipTypeDefinition` table (code, category, inverse, `isCore`, `ontologyVersion`), seeded
   with the union of `KNOWLEDGE_GRAPH.md` §4's categorised types and the request's explicit list
   (`MENTIONS`, `SUPPORTS`, `OPPOSES`, `CONTRADICTS`, `QUALIFIES`, `REQUIRES`, `DEPENDS_ON`,
   `PROPOSES`, `RESPONDS_TO`, `AFFECTS`, `DECIDED_BY`, `RESULTED_IN`, `EVIDENCED_BY`, `RAISED_BY`,
   `AGREED_BY`, `DISPUTED_BY`, `CONTESTED_IN`, and the ontology's own set). `Relationship.relationshipType`
   is a real foreign key against this table, so an invalid type cannot be inserted, and operators may
   add deployment-local types in the namespaced range `KNOWLEDGE_GRAPH.md` §11 already specifies.

6. **Disagreement and perspective are metadata on `Assertion`, not a collapsing mechanism.**
   `perspectiveTags` (`CONTESTED`, `MINORITY_PERSPECTIVE`, `CULTURALLY_SIGNIFICANT`, `UNRESOLVED`,
   `COMMUNITY_RESTRICTED`, `MACHINE_INFERRED`) is a string array, and an optional
   `groupAttributionId` records which community/group entity holds a given assertion, so "Group A
   supports / Group B opposes / contested in Session Y" is three separate `Assertion` rows plus a
   `CONTESTED_IN` relationship, never one system-merged conclusion. Community/Indigenous entities are
   never auto-merged (`KNOWLEDGE_GRAPH.md` §6), enforced in the domain layer's merge function, per P5.

7. **Permission naming.** The request's dotted `knowledge.aggregate.view` style is translated to this
   codebase's established `resource:verb` Casbin action convention (`knowledge_entity:read`, etc.) —
   introducing a second permission-string grammar alongside the one every other capability in
   `packages/policy/policy.csv` uses would be a worse outcome than translating names, and the
   capabilities requested are preserved one-for-one (see the accompanying permission table in the
   PR/commit description).

8. **Knowledge Steward is a scoped `WitnessRole`, not a global role**, assigned via the existing
   `RoleAssignment` mechanism at organisation or workspace scope exactly like every other role — this
   *is* "project-level responsibility" in this codebase's vocabulary, because `RoleAssignment` is
   never platform-scoped for ordinary use. No new scoping mechanism is introduced.

9. **Platform-admin/knowledge-authority separation requires no new mechanism.** Every `knowledge_*`
   action is resolved through `PolicyEnforcementService.scopedGrantTiers`, which requires a real
   `RoleAssignment` row scoped to the exact organisation or workspace in question. A platform-scope
   `RoleAssignment` (`organisationId`/`workspaceId` both null) does not satisfy that query — this is
   already true of every scoped action in the system and is not a new control, only a new adversarial
   test proving it holds for the new action set.

10. **A minimal transactional-outbox event backbone is built now**, scoped to unblock the graph
    projector, implementing exactly the "minimal profile: in-process polling dispatcher" branch
    ADR-0005 already specifies — not real NATS/JetStream. `EventLogEntry`, `Outbox`,
    `ProjectionCheckpoint` are named as ADR-0005/`DATA_MODEL.md` already name them (not
    knowledge-prefixed), because they are generic infrastructure this feature happens to need first.
    A real JetStream adapter behind the same `EventBusPort` is a future, additive change requiring no
    consumer rewrite.

## Options considered

### Option A — Extend the ontology with new core node types

**Pros:** matches the incoming request's vocabulary exactly (`CulturalConcept`, `Issue`,
`Proposal`, `Outcome` as new core node types); no translation layer.
**Cons:** directly contradicts `KNOWLEDGE_GRAPH.md` §2's "small and stable core" principle and §11's
governance gate (core-type changes need Knowledge Graph Lead + Principal Architect sign-off and an
ADR of their own — which this ADR is not attempting, since no such review has occurred). Would
invalidate the exit gate ("delete the graph, rebuild, byte-comparable") for reasons unrelated to this
feature. **Rejected** — this ADR does not carry the authority to change the ontology's core, only to
implement within it.

### Option B — Map the request's vocabulary onto the ratified ontology, translating names *(chosen)*

**Pros:** keeps the ontology, the ratified provenance model, and the event catalogue coherent with
everything already built and documented; every reconciliation point is named rather than silently
resolved; nothing forecloses a future, properly-reviewed ontology change.
**Cons:** the request's object names (`KnowledgeAssertion`, `KnowledgeAlias`, ...) do not appear
verbatim in code, which costs a reader unfamiliar with `ADR-0011`/`ADR-0012` a lookup.
**Why we chose it:** the ratified documents represent prior, considered, governed decisions;
overriding them casually because a new request phrased things differently is exactly the failure mode
ADR-0021 exists to prevent.

### Option C — Build a second, parallel schema matching the request's vocabulary

**Pros:** satisfies the letter of the request, separate from the ratified ontology, without
touching ratified names at all.
**Cons:** two ontologies for one graph is strictly worse than one with a translation table — it is
the `docs/vision.md` / `VISION.md` failure from ADR-0021 recreated inside a single feature.
**Rejected** without further consideration.

## Consequences

### Positive

- One ontology, one provenance model, one event catalogue — no fork of `KNOWLEDGE_GRAPH.md`.
- Every naming decision a future contributor might question is answered in one place.
- Nothing here requires Steering Committee approval: no bolded (P3/P4-primary) ADR is edited or
  weakened, only implemented and extended.

### Negative

- A reader arriving from the original feature request must map its vocabulary onto this ADR before
  the codebase makes sense — a real cost, mitigated only by this document existing.
- Building ahead of `ROADMAP.md`'s Phase 4/5 date means Phase 3 (manual curation UX) and Phase 5
  (extraction) still do not exist; the API surface landed here is deliberately minimal (enough to
  create and confirm assertions for the projector to have real input) rather than the full curated
  workflow — a second pass is required before this is facilitator-ready.

### Neutral

- `STATUS.md`/`ROADMAP.md` are updated to show Phase 1–2 deliverables landed, with Phase 3–8 still
  pending, rather than moving the whole knowledge-graph row to done.

### Risks accepted

- **Risk:** a future contributor reads the original feature request's language, does not find this
  ADR, and reintroduces a parallel `KnowledgeAssertion` type. **Mitigation:** this ADR is linked from
  `KNOWLEDGE_GRAPH.md` and from the new module's top-level doc comment.
- **Risk:** `Topic.topicScheme` turns out to be the wrong resolution of KG-1. **Signal:** the
  Knowledge Graph Lead's eventual review of KG-1 concludes a dedicated node type is needed.
  **Response:** an ontology-change ADR migrates `topicScheme` values to real node types; because the
  graph is a rebuildable projection (ADR-0011), this costs a projector change and a replay, not a
  data migration of authoritative state.

## Compliance and enforcement

- Invariant test: every `Relationship.relationshipType` resolves to a `RelationshipTypeDefinition`
  row (DB foreign key, not application-only).
- Adversarial test: a platform-scope-only `RoleAssignment` is denied every `knowledge_*` action.
- `KNOWLEDGE_GRAPH.md` and `DATA_MODEL.md` are updated with a pointer to this ADR rather than edited
  to match the request's vocabulary.

## Reversal

Points 1–9 are naming and mapping decisions; reversing any one is a rename, not a data migration,
because the graph itself is a disposable projection (ADR-0011). Point 10 (minimal outbox) is additive
and is superseded, not reversed, when a real NATS/JetStream adapter lands.

## References

- [`KNOWLEDGE_GRAPH.md`](../KNOWLEDGE_GRAPH.md) · [`DATA_MODEL.md`](../DATA_MODEL.md) ·
  [`EVENT_CATALOGUE.md`](../EVENT_CATALOGUE.md)
- [ADR-0011](ADR-0011-knowledge-graph-as-projection.md) ·
  [ADR-0012](ADR-0012-provenance-and-human-in-the-loop.md) ·
  [ADR-0021](ADR-0021-canonical-scope-and-architecture-reconciliation.md)
