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
 * assertion up by that property instead of a graph edge.
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

function toGraphEdge(rel: {
  type: string;
  startNodeElementId?: string;
  properties: Record<string, unknown>;
}): GraphEdge {
  const p = rel.properties;
  return {
    id: str(p, 'id'),
    fromEntityId: str(p, 'fromEntityId'),
    toEntityId: str(p, 'toEntityId'),
    relationshipType: rel.type,
    assertionId: str(p, 'assertionId'),
    validFrom: str(p, 'validFrom'),
    validTo: strOrNull(p, 'validTo'),
    strength: numOrNull(p, 'strength'),
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

  async getNode(scope: TenantScope, entityId: string): Promise<GraphNode | null> {
    return this.readQuery(
      scope,
      (tx) =>
        tx
          .run(
            `MATCH (n:KnowledgeEntity {id: $entityId, organisationId: $organisationId})
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
    // `depth` is a server-clamped integer, never caller-controlled beyond
    // that clamp — Cypher does not support parameterising a variable-length
    // relationship pattern's bound (`[*1..$depth]` is not valid Cypher),
    // which is why it is embedded rather than bound. Relationship *type*
    // filtering below IS parameterised, because that is an ordinary WHERE
    // predicate, not a pattern-length bound.
    const cypher = `
      MATCH path = (n:KnowledgeEntity {id: $entityId, organisationId: $organisationId})-[*1..${depth}]-(m:KnowledgeEntity)
      WHERE m.organisationId = $organisationId
        AND ($relationshipTypes IS NULL OR all(r IN relationships(path) WHERE type(r) IN $relationshipTypes))
      WITH path LIMIT $maxNodes
      UNWIND relationships(path) AS rel
      WITH path, rel
      UNWIND nodes(path) AS node
      RETURN collect(DISTINCT node) AS nodes, collect(DISTINCT rel) AS rels
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
        const edges = (
          first.get('rels') as { type: string; properties: Record<string, unknown> }[]
        ).map(toGraphEdge);
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
