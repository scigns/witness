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

/**
 * `lifecycleState` and `perspectiveTags` are the assertion's own governed
 * state (`ASSERTION_LIFECYCLE_STATES` / `PERSPECTIVE_TAGS`,
 * `@witness/domain`), projected onto the edge so a caller does not have to
 * make a second `provenanceForEdge` call just to know whether a
 * relationship is contested — every edge already carries an `Assertion`
 * node with these properties (`neo4j-projector.ts`'s `MERGE_ASSERTION_CYPHER`
 * has always written them); this type just started reading them back.
 *
 * Both fields are `null` when the caller lacks `knowledge_provenance:inspect`
 * *and* the assertion carries the `community_restricted` perspective tag —
 * the one tag whose entire point is that only the community and reviewers
 * see it, not "confirmed knowledge is visible, but who contests it is not"
 * for every other tag. `Neo4jGraphRepository.neighbourhood` performs this
 * redaction; it is not the caller's responsibility to apply it, so there is
 * exactly one place a mistake could leak it, not one per consumer.
 */
export interface GraphEdge {
  readonly id: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly relationshipType: string;
  readonly assertionId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly strength: number | null;
  readonly lifecycleState: string | null;
  readonly perspectiveTags: readonly string[] | null;
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
  /**
   * Whether the caller separately holds `knowledge_provenance:inspect` —
   * decided once by the caller (the API layer, which has the `Principal`;
   * this package does not) and passed down, never re-derived here.
   * Governs only whether `community_restricted` edges' governance fields
   * are redacted (see `GraphEdge`'s doc comment); every other perspective
   * tag is visible to anyone who can see the edge at all. Defaults to
   * `false` — the safer default when a caller forgets to pass it.
   */
  readonly canInspectGovernance?: boolean;
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
