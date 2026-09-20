/**
 * GraphRepository — the read-only query boundary onto the Neo4j projection
 * (ADR-0011). `Neo4jGraphRepository` is the only implementation today; a
 * future Apache AGE adapter (open decision D-4 / KG-3) is a new file behind
 * this same interface, not a rewrite of every call site.
 *
 * Every method takes `organisationId` as a required, non-optional first
 * parameter — never inferred, never defaulted — because the graph has no
 * other tenant boundary of its own (`KNOWLEDGE_GRAPH.md` §9: "Permission
 * filtering — applied in the query, not post-hoc"). A caller cannot forget
 * to scope a query; the type signature will not compile without it.
 *
 * **Read-only by construction.** No method here returns anything other than
 * data; there is no `write`, `merge`, or `upsert` method on this interface
 * anywhere, and there never should be — see `graph-projector.ts` in
 * `workers/graph-projector` for the one place Neo4j is ever written to.
 * Neo4j Community Edition has no database-level RBAC to enforce this with a
 * second set of credentials (Enterprise or Apache AGE would); until one of
 * those is adopted (D-4), this interface boundary — not a DB grant — is the
 * enforcement mechanism, and it is named here rather than silently assumed.
 */

/** `KNOWLEDGE_GRAPH.md` §9 — non-negotiable limits, never configurable higher by a caller. */
export const MAX_TRAVERSAL_DEPTH = 6;
export const MAX_RESULT_NODES = 1000;
export const QUERY_TIMEOUT_MS = 5000;

export interface GraphNode {
  readonly id: string;
  readonly entityType: string;
  readonly topicScheme: string | null;
  readonly canonicalLabel: string;
  readonly sensitivityClass: string;
  readonly status: string;
  readonly ontologyVersion: string;
}

export interface GraphEdge {
  readonly id: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly relationshipType: string;
  readonly assertionId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly strength: number | null;
}

export interface ProvenanceRecord {
  readonly assertionId: string;
  readonly provenanceChainId: string;
  readonly sourceEvidenceIds: readonly string[];
  readonly confirmedByDisplayName: string;
  readonly confirmedAt: string;
  readonly extractionMethod: string;
  readonly extractionModel: string | null;
  readonly extractionModelVersion: string | null;
  readonly confidence: number;
  readonly lifecycleState: string;
  readonly perspectiveTags: readonly string[];
  readonly sensitivityClass: string;
}

export interface TenantScope {
  readonly organisationId: string;
  readonly workspaceId?: string;
}

export interface NeighbourhoodOptions extends TenantScope {
  readonly entityId: string;
  /** Clamped server-side to `MAX_TRAVERSAL_DEPTH`; never trusted as-is. */
  readonly depth?: number;
  readonly relationshipTypes?: readonly string[];
  readonly maxNodes?: number;
}

export abstract class GraphRepository {
  abstract getNode(scope: TenantScope, entityId: string): Promise<GraphNode | null>;

  abstract neighbourhood(
    options: NeighbourhoodOptions,
  ): Promise<{ nodes: readonly GraphNode[]; edges: readonly GraphEdge[] }>;

  /** The provenance query — `KNOWLEDGE_GRAPH.md` §5, "the single most important query in the product". */
  abstract provenanceForNode(
    scope: TenantScope,
    entityId: string,
  ): Promise<readonly ProvenanceRecord[]>;
  abstract provenanceForEdge(
    scope: TenantScope,
    relationshipId: string,
  ): Promise<readonly ProvenanceRecord[]>;

  abstract search(scope: TenantScope, query: string, limit?: number): Promise<readonly GraphNode[]>;

  abstract close(): Promise<void>;
}
