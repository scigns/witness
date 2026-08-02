# Role: Knowledge Graph Lead

| | |
|---|---|
| **Reports to** | CTO |
| **Deputy** | Principal Architect |
| **Integration branch** | `knowledge-graph` |
| **Charter status** | Active |
| **Last reviewed** | 2026-07-31 |

## Mission

Own the ontology and the projection that produces the knowledge graph — the thing Witness actually
delivers — and guarantee that every node and edge in it traces back to something a human confirmed
about something a person said.

## Responsibilities

- Own the ontology: the thirteen core node types, the relationship taxonomy, and their versioning
- Own standards alignment — PROV-O, schema.org, CIDOC-CRM, SKOS
- Own the graph projector: idempotency, checkpointing, resumability, **rebuild-from-log correctness**
- Own **entity resolution** — the hardest and highest-risk problem in the system
- Own the temporal model in the graph: validity intervals and their semantics
- Own graph query safety: depth limits, result limits, timeouts, parameterisation
- Own the provenance chain API and its latency
- Own graph export in open formats — this is what makes exit real

## Authority

### Decides alone

- Ontology relationship types and their semantics
- Projector implementation and rebuild strategy
- Entity resolution scoring, blocking and thresholds
- Graph query patterns and safety limits
- Export format details

### Must consult

- Principal Architect on core node type changes — these are architectural
- AI Lead on candidate assertion schemas
- Backend Lead on projection event contracts
- Governance Lead on community restriction enforcement in the graph
- Research Lead on standards alignment

### Must escalate

- Adding or removing a **core node type** → Principal Architect and CTO, with an ADR
- Ontology major version → CTO
- Any change to entity merge authority thresholds → Governance Lead

## Deliverables

Ontology specification and its versioning · graph projector · entity resolution with human
adjudication · provenance chain API · graph query API with enforced limits · export in JSON-LD, RDF,
GraphML and CSV · rebuild-from-log verification test.

## Ownership

| Path / domain | Notes |
|---|---|
| `architecture/KNOWLEDGE_GRAPH.md` | With Principal Architect |
| `services/knowledge-graph/**` | |
| `workers/graph-projector/**` | |
| Ontology versioning | |

## Success metrics

| Signal | Target |
|---|---|
| **Nodes/edges with no confirmed assertion** | 0 — invariant INV-3, enforced |
| **Rebuild-from-log equivalence test** | Passing — this validates ADR-0011 |
| Full rebuild time (100k meetings) | < 6 hours, measured continuously |
| Entity resolution precision | > 0.98 — over-merging is worse than under-merging |
| Auto-merges later reversed | < 1% |
| Provenance chain retrieval | ≤ 3 calls, < 500 ms p95 |
| Unbounded traversal reachable from the API | 0 |
| Revocation propagation to the graph | < 5 min p99 |

## Definition of Done

Beyond the standard DoD: the projector is idempotent and replay-tested; the rebuild test passes;
provenance invariants hold; traversal limits are enforced; the ontology change is versioned and
forward-compatible; community restrictions are honoured in every query path.

## Dependencies

**Depends on:** Backend Lead (event contracts), AI Lead (candidate schemas), Principal Architect
(structure), Governance Lead (restriction semantics), Research Lead (standards).

**Depended on by:** Frontend Lead (graph views), search, the entire product proposition.

## Review responsibilities

| Must review | Response |
|---|---|
| `architecture/KNOWLEDGE_GRAPH.md` | 2 working days |
| Ontology changes | 2 working days |
| `services/knowledge-graph/**`, projector | 1 working day |
| Anything writing to a projection store | Same day — this should be impossible |

## Merge authority

`architecture/KNOWLEDGE_GRAPH.md` (with Principal Architect) · `services/knowledge-graph/**` ·
`workers/graph-projector/**` · ontology definitions.

## Anti-responsibilities

- **Does not auto-merge entities above the ambiguity threshold.** A graph that has fused two people
  is a trust catastrophe; a fragmented graph is merely inconvenient.
- **Never auto-merges Community entities.** Group identity is self-determination, not string
  similarity.
- Does not let the graph become authoritative. It is a projection; treating it otherwise breaks
  consent revocation, ontology evolution and disaster recovery simultaneously.
- Does not expose raw Cypher to users. An expressive query language on the internet is an
  exfiltration primitive.
- Does not extend the ontology to fit one deployment — that is what the namespaced extension range
  is for.
