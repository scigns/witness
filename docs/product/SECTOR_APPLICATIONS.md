# Sector Applications — contextual, not canonical

**Owner:** Product Director
**Status:** ⚠️ **Contextual material — NOT product scope.** Preserved under ADR-0021
**Review by:** 2027-02-01 — delete if still unreferenced by a funded commitment

---

## Read this first

**Nothing in this document is in scope.** It is not a roadmap, not a backlog, and not a
justification for any feature.

The canonical product definition is [`VISION.md`](../../VISION.md): Witness turns conversations and
institutional records into attributable, reviewable, human-confirmed knowledge with provenance,
governance and sovereign deployment characteristics. Scope changes go through
[`ROADMAP.md`](../../ROADMAP.md) and the governance process in
[`GOVERNANCE.md`](../../GOVERNANCE.md) — never through this file.

**A pull request that cites this document as justification is rejected on that basis alone.**
That rule exists because a "future directions" document with no gate attached is the most common way
a project's scope quietly doubles.

This material was preserved rather than deleted because it may reflect stakeholder framing that the
engineering organisation is not party to. If it does, the correct response is to supersede ADR-0021
under governance — not to build toward this document.

---

## Preserved material

From the superseded `docs/vision.md`, recorded under [ADR-0021](../../architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md).

### Framing

A Digital Public Infrastructure platform helping governments, communities, NGOs, faith organisations
and humanitarian agencies collect, verify, govern and act upon trusted community knowledge —
combining AI, secure identity, geospatial intelligence, offline-first technology and human
verification.

### Candidate sectors

| Sector | Relationship to canonical scope |
|---|---|
| Disaster response | **Adjacent.** Would require geospatial entities and real-time ingestion; neither exists in the ontology |
| Humanitarian coordination | **Adjacent.** Cross-organisation federation is a post-v1.0 candidate already listed in `ROADMAP.md` |
| Education | **Compatible.** Institutional memory of curriculum and policy decisions needs no new capability |
| Health | **Adjacent.** Adds regulatory surface (clinical data) far beyond the current threat model |
| Agriculture | **Out of scope.** No identified overlap with conversation-derived institutional memory |
| Environmental monitoring | **Out of scope.** Sensor telemetry is a different data model entirely |
| Pacific regional focus | **Compatible as a deployment priority, not as scope.** `VISION.md` names three reference deployments without geographic restriction |

### Why geospatial is the load-bearing difference

Geospatial intelligence is the one item that cannot be accommodated without architectural change. It
has no entity type in [`architecture/KNOWLEDGE_GRAPH.md`](../../architecture/KNOWLEDGE_GRAPH.md), no
domain event in [`architecture/EVENT_CATALOGUE.md`](../../architecture/EVENT_CATALOGUE.md), no store
in [ADR-0004](../../architecture/decisions/ADR-0004-polyglot-persistence.md) and no ADR of its own.

Adding it is a legitimate future decision. It is not a small one, and it does not happen by
implication.

### Principles that needed no preservation

The superseded document listed: human-first AI, digital public goods, open standards, privacy by
design, Indigenous data sovereignty, offline-first, accessibility, security by default.

Every one is already covered, and covered more strongly, by principles **P1–P8** in
[`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md). No content was lost.

---

## If you want to act on this

1. Identify the named institutional stakeholder and the funded commitment.
2. Write an ADR superseding [ADR-0021](../../architecture/decisions/ADR-0021-canonical-scope-and-architecture-reconciliation.md).
3. Take it through the Steering Committee per [`GOVERNANCE.md`](../../GOVERNANCE.md).
4. Update [`VISION.md`](../../VISION.md), the ontology and the roadmap **before** any implementation.

Step 4 is not bureaucracy. The ontology is what makes provenance verifiable; widening it after
assertions exist means the early assertions cannot be validated against the wider schema.
