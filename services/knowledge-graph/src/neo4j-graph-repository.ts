/**
 * Neo4jGraphRepository — the one implementation of `GraphRepository` today.
 *
 * Graph shape written by `workers/graph-projector` (the only writer):
 *   (:KnowledgeEntity {id, organisationId, workspaceId, entityType, topicScheme,
 *                       canonicalLabel, sensitivityClass, status, ontologyVersion})
 *   (:KnowledgeEntity)-[:<RELATIONSHIP_TYPE> {id, assertionId, organisationId,
 *                       workspaceId, validFrom, validTo, strength}]->(:KnowledgeEntity)
 *   (:Assertion {id, provenanceChainId, sourceEvidenceIds, confirmedByDisplayName,
 *                 confirmedAt, extractionMethod, extractionModel,
 *                 extractionModelVersion, confidence, lifecycleState,
 *                 perspectiveTags, sensitivityClass, organisationId, workspaceId})
 *   (:KnowledgeEntity)-[:ASSERTED_BY]->(:Assertion)   -- for entity-attribute assertions
 *
 * A relationship edge carries its own `assertionId` property rather than an
 * `:ASSERTED_BY` edge to an `:Assertion` node (Neo4j relationships cannot
 * originate from another relationship), so `provenanceForEdge` looks the
 * assertion up by that property instead of a graph edge, and `neighbourhood`
 * uses a pattern comprehension (`[(a:Assertion {id: r.assertionId}) | a]`)
 * to attach each edge's governance state (`lifecycleState`/`perspectiveTags`)
 * without a second query round-trip.
 *
 * `KnowledgeEntity.status` is always `'active'` here — a merged/tombstoned
 * entity's node still physically exists (history is never deleted, only
 * superseded — ADR-0027) but every read query in this file filters
 * `status = 'active'`, so it can never surface as a current peer. The
 * endpoints of every projected relationship (both "from" and "to") are
 * themselves always the canonical (never-merged) entity, resolved at
 * projection time by `workers/graph-projector`'s `postgres-source.ts` —
 * never here; this class has no write access and does no resolution of
 * its own, only defensive filtering (ADR-0027, "Read-side defence in
 * depth").
 */

import neo4j, {
  type Driver,
  type ManagedTransaction,
  type Record as Neo4jRecord,
} from 'neo4j-driver';

import {
  GraphRepository,
  MAX_RESULT_NODES,
  MAX_TRAVERSAL_DEPTH,
  QUERY_TIMEOUT_MS,
  type GraphEdge,
  type GraphNode,
  type NeighbourhoodOptions,
  type ProvenanceRecord,
  type TenantScope,
} from './graph-repository.port.js';

export interface Neo4jGraphRepositoryConfig {
  readonly uri: string;
  readonly user: string;
  readonly password: string;
}

function str(p: Record<string, unknown>, key: string): string {
  return String(p[key]);
}

function strOrNull(p: Record<string, unknown>, key: string): string | null {
  const value = p[key];
  return value === null || value === undefined ? null : String(value);
}

function numOrNull(p: Record<string, unknown>, key: string): number | null {
  const value = p[key];
  return value === null || value === undefined ? null : Number(value);
}

function stringArray(p: Record<string, unknown>, key: string): string[] {
  const value = p[key];
  return Array.isArray(value) ? value.map(String) : [];
}

function toGraphNode(node: { properties: Record<string, unknown> }): GraphNode {
  const p = node.properties;
  return {
    id: str(p, 'id'),
    entityType: str(p, 'entityType'),
    topicScheme: strOrNull(p, 'topicScheme'),
    canonicalLabel: str(p, 'canonicalLabel'),
    sensitivityClass: str(p, 'sensitivityClass'),
    status: str(p, 'status'),
    ontologyVersion: str(p, 'ontologyVersion'),
  };
}

/**
 * `governance` is the edge's `Assertion` node, looked up by the caller and
 * passed in rather than fetched here — `null` when no such node exists
 * (should not happen for a confirmed relationship, but a defensive `null`
 * beats a crash if the projector and this query ever disagree) and also
 * used, via `canInspectGovernance`, to redact `community_restricted`
 * governance detail from a caller who only holds `knowledge_entity:read`
 * (`GraphEdge`'s doc comment explains why that one tag is the exception).
 */
function toGraphEdge(
  rel: {
    type: string;
    startNodeElementId?: string;
    properties: Record<string, unknown>;
  },
  governance: { properties: Record<string, unknown> } | null,
  canInspectGovernance: boolean,
): GraphEdge {
  const p = rel.properties;
  const perspectiveTags =
    governance === null ? [] : stringArray(governance.properties, 'perspectiveTags');
  const restricted = perspectiveTags.includes('community_restricted') && !canInspectGovernance;
  return {
    id: str(p, 'id'),
    fromEntityId: str(p, 'fromEntityId'),
    toEntityId: str(p, 'toEntityId'),
    relationshipType: rel.type,
    assertionId: str(p, 'assertionId'),
    validFrom: str(p, 'validFrom'),
    validTo: strOrNull(p, 'validTo'),
    strength: numOrNull(p, 'strength'),
    lifecycleState:
      governance === null || restricted ? null : str(governance.properties, 'lifecycleState'),
    perspectiveTags: governance === null || restricted ? null : perspectiveTags,
  };
}

function toProvenanceRecord(node: { properties: Record<string, unknown> }): ProvenanceRecord {
  const p = node.properties;
  return {
    assertionId: str(p, 'id'),
    provenanceChainId: str(p, 'provenanceChainId'),
    sourceEvidenceIds: stringArray(p, 'sourceEvidenceIds'),
    confirmedByDisplayName: str(p, 'confirmedByDisplayName'),
    confirmedAt: str(p, 'confirmedAt'),
    extractionMethod: str(p, 'extractionMethod'),
    extractionModel: strOrNull(p, 'extractionModel'),
    extractionModelVersion: strOrNull(p, 'extractionModelVersion'),
    confidence: Number(p['confidence']),
    lifecycleState: str(p, 'lifecycleState'),
    perspectiveTags: stringArray(p, 'perspectiveTags'),
    sensitivityClass: str(p, 'sensitivityClass'),
  };
}

/** Clamp, never trust — see the port's doc comment on why this is embedded, not parameterised. */
function clampDepth(requested: number | undefined): number {
  const value = requested ?? 2;
  if (!Number.isInteger(value) || value < 1) return 1;
  return Math.min(value, MAX_TRAVERSAL_DEPTH);
}

export class Neo4jGraphRepository extends GraphRepository {
  private readonly driver: Driver;

  /**
   * Takes an already-constructed driver, not connection config — so a test
   * can inject a fake `Driver` (asserting on the Cypher/params a query
   * builds, or simulating a scoped result set) without a live Neo4j. Use
   * `Neo4jGraphRepository.connect(config)` for the real thing.
   */
  constructor(driver: Driver) {
    super();
    this.driver = driver;
  }

  static connect(config: Neo4jGraphRepositoryConfig): Neo4jGraphRepository {
    return new Neo4jGraphRepository(
      neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password)),
    );
  }

  private async readQuery<T>(
    scope: TenantScope,
    work: (tx: ManagedTransaction) => Promise<Neo4jRecord[]>,
    mapRecords: (records: Neo4jRecord[]) => T,
  ): Promise<T> {
    if (!scope.organisationId) {
      // Belt and braces: TypeScript already requires this field, but a
      // caller could still pass an empty string. An empty-string tenant
      // filter would match nothing in Neo4j (safe), never everything — but
      // failing loudly here is cheaper than debugging a silent empty result.
      throw new Error('organisationId is required for every graph query.');
    }
    const session = this.driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const records = await session.executeRead(work, { timeout: QUERY_TIMEOUT_MS });
      return mapRecords(records);
    } finally {
      await session.close();
    }
  }

  /** Current-graph lookup — invariant 4 (§13), same as `neighbourhood`/`search`. */
  async getNode(scope: TenantScope, entityId: string): Promise<GraphNode | null> {
    return this.readQuery(
      scope,
      (tx) =>
        tx
          .run(
            `MATCH (n:KnowledgeEntity {id: $entityId, organisationId: $organisationId, status: 'active'})
             RETURN n LIMIT 1`,
            { entityId, organisationId: scope.organisationId },
          )
          .then((r) => r.records),
      (records) => {
        const first = records[0];
        return first === undefined ? null : toGraphNode(first.get('n'));
      },
    );
  }

  async neighbourhood(
    options: NeighbourhoodOptions,
  ): Promise<{ nodes: readonly GraphNode[]; edges: readonly GraphEdge[] }> {
    const depth = clampDepth(options.depth);
    const maxNodes = Math.min(options.maxNodes ?? 200, MAX_RESULT_NODES);
    const canInspectGovernance = options.canInspectGovernance ?? false;
    // `depth` is a server-clamped integer, never caller-controlled beyond
    // that clamp — Cypher does not support parameterising a variable-length
    // relationship pattern's bound (`[*1..$depth]` is not valid Cypher),
    // which is why it is embedded rather than bound. Relationship *type*
    // filtering below IS parameterised, because that is an ordinary WHERE
    // predicate, not a pattern-length bound.
    //
    // `n.status = 'active' AND m.status = 'active'` is graph-integrity
    // invariant 4: a merged/tombstoned concept is history, never a peer in
    // the current graph (`KNOWLEDGE_GRAPH.md` §13's Gap B) — enforced here,
    // not only by the projector no longer creating edges to one, so a
    // stale or malformed edge can never surface one either. The governance
    // `Assertion` lookup is `UNWIND` + `OPTIONAL MATCH`, not a pattern
    // comprehension nested inside the outer list comprehension — Neo4j
    // 5.26's Cypher parser rejects a pattern comprehension (`[(a) | a]`)
    // nested inside another comprehension's `|` as a syntax error ("Invalid
    // input '|': expected an expression"), confirmed against a real server;
    // pairing each relationship with its assertion in one `collect({rel,
    // assertion})` also sidesteps ever relying on two separately-collected
    // lists staying index-aligned.
    const cypher = `
      MATCH path = (n:KnowledgeEntity {id: $entityId, organisationId: $organisationId})-[*1..${depth}]-(m:KnowledgeEntity)
      WHERE m.organisationId = $organisationId
        AND n.status = 'active' AND m.status = 'active'
        AND ($relationshipTypes IS NULL OR all(r IN relationships(path) WHERE type(r) IN $relationshipTypes))
      WITH path LIMIT $maxNodes
      UNWIND relationships(path) AS rel
      WITH path, rel
      UNWIND nodes(path) AS node
      WITH collect(DISTINCT node) AS nodes, collect(DISTINCT rel) AS rels
      UNWIND rels AS rel
      OPTIONAL MATCH (a:Assertion {id: rel.assertionId})
      RETURN nodes, collect({rel: rel, assertion: a}) AS relPairs
    `;
    return this.readQuery(
      options,
      (tx) =>
        tx
          .run(cypher, {
            entityId: options.entityId,
            organisationId: options.organisationId,
            relationshipTypes: options.relationshipTypes ? [...options.relationshipTypes] : null,
            maxNodes: neo4j.int(maxNodes),
          })
          .then((r) => r.records),
      (records) => {
        const first = records[0];
        if (first === undefined) return { nodes: [], edges: [] };
        const nodes = (first.get('nodes') as { properties: Record<string, unknown> }[]).map(
          toGraphNode,
        );
        const relPairs = first.get('relPairs') as {
          rel: { type: string; properties: Record<string, unknown> };
          assertion: { properties: Record<string, unknown> } | null;
        }[];
        const edges = relPairs.map((pair) =>
          toGraphEdge(pair.rel, pair.assertion, canInspectGovernance),
        );
        return { nodes, edges };
      },
    );
  }

  async provenanceForNode(
    scope: TenantScope,
    entityId: string,
  ): Promise<readonly ProvenanceRecord[]> {
    return this.readQuery(
      scope,
      (tx) =>
        tx
          .run(
            `MATCH (n:KnowledgeEntity {id: $entityId, organisationId: $organisationId})-[:ASSERTED_BY]->(a:Assertion)
             RETURN a`,
            { entityId, organisationId: scope.organisationId },
          )
          .then((r) => r.records),
      (records) => records.map((r) => toProvenanceRecord(r.get('a'))),
    );
  }

  async provenanceForEdge(
    scope: TenantScope,
    relationshipId: string,
  ): Promise<readonly ProvenanceRecord[]> {
    return this.readQuery(
      scope,
      (tx) =>
        tx
          .run(
            `MATCH (:KnowledgeEntity {organisationId: $organisationId})-[r {id: $relationshipId}]-(:KnowledgeEntity {organisationId: $organisationId})
             MATCH (a:Assertion {id: r.assertionId, organisationId: $organisationId})
             RETURN DISTINCT a`,
            { relationshipId, organisationId: scope.organisationId },
          )
          .then((r) => r.records),
      (records) => records.map((r) => toProvenanceRecord(r.get('a'))),
    );
  }

  async search(scope: TenantScope, query: string, limit = 25): Promise<readonly GraphNode[]> {
    const cappedLimit = Math.min(limit, MAX_RESULT_NODES);
    return this.readQuery(
      scope,
      (tx) =>
        tx
          .run(
            `MATCH (n:KnowledgeEntity {organisationId: $organisationId})
             WHERE toLower(n.canonicalLabel) CONTAINS toLower($query)
               AND ($workspaceId IS NULL OR n.workspaceId = $workspaceId)
               AND n.status = 'active'
             RETURN n LIMIT $limit`,
            {
              organisationId: scope.organisationId,
              workspaceId: scope.workspaceId ?? null,
              query,
              limit: neo4j.int(cappedLimit),
            },
          )
          .then((r) => r.records),
      (records) => records.map((r) => toGraphNode(r.get('n'))),
    );
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
