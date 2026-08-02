# Services

**Owner:** Backend Lead
**Status:** Phase 3 deliverable

Backend services, one per bounded context, built with NestJS on a hexagonal structure.

| Service | Bounded context | Key invariant |
|---|---|---|
| [`api-gateway/`](api-gateway/) | Edge — GraphQL BFF + versioned REST | Every endpoint declares its authorisation requirement |
| [`identity/`](identity/) | Identity & tenancy | A request acts within exactly one tenant |
| [`consent/`](consent/) | **Consent & legal basis** | No processing without an active grant covering the purpose |
| [`ingestion/`](ingestion/) | Sessions & media | Media is bound to a session with cleared consent before processing |
| [`knowledge-graph/`](knowledge-graph/) | Knowledge graph | Every node and edge resolves to a confirmed assertion |
| [`ai-orchestrator/`](ai-orchestrator/) | Model gateway & extraction | Egress policy enforced; every call attributable |
| [`search/`](search/) | Search & retrieval | No result the caller may not see — including via result counts |

## Rules

- **Services never import each other.** They communicate through the API or through events. A direct
  import creates a compile-time coupling that silently defeats the context boundary — and a monorepo
  makes that shortcut easy, which is why there is a lint rule.
- Structure: `domain/` → `application/` → `adapters/{inbound,outbound}/`. Dependencies point inward.
- Every service is generated from [`templates/service/`](../templates/service/), which produces a
  service passing every gate on creation.
- **Application services hold read-only credentials on Neo4j and OpenSearch.** Only projectors write
  to projections ([ADR-0011](../architecture/decisions/ADR-0011-knowledge-graph-as-projection.md)).
