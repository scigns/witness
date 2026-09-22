/**
 * Real-Neo4j suite for `Neo4jGraphRepository` (`KNOWLEDGE_GRAPH.md` §13,
 * ADR-0027, Gap A). `neo4j-graph-repository.test.ts` proves the Cypher text
 * and mapping logic against a fake driver; this file proves the same class,
 * unmodified, actually reads governance metadata back out of a real graph
 * shaped exactly like `workers/graph-projector` produces (fixtures here use
 * the identical `MERGE_ENTITY_CYPHER`/`MERGE_ASSERTION_CYPHER` shape by
 * hand, since this package has no dependency on the projector and should
 * not gain one just for a test).
 *
 * Skips itself (does not fail) when NEO4J_URI/NEO4J_USER (or
 * NEO4J_READONLY_USER)/NEO4J_PASSWORD (or NEO4J_READONLY_PASSWORD) are not
 * set or Neo4j is unreachable — run via
 * `pnpm --filter @witness/knowledge-graph test:live`. Every fixture lives
 * under one random `organisationId` per run; cleanup deletes exactly that
 * tenant's nodes, never the whole database.
 */

import { randomUUID } from 'node:crypto';

import neo4j, { type Driver } from 'neo4j-driver';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Neo4jGraphRepository } from './neo4j-graph-repository.js';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

const NEO4J_URI = optionalEnv('NEO4J_URI');
const NEO4J_USER = optionalEnv('NEO4J_READONLY_USER') ?? optionalEnv('NEO4J_USER');
const NEO4J_PASSWORD = optionalEnv('NEO4J_READONLY_PASSWORD') ?? optionalEnv('NEO4J_PASSWORD');

async function probeLiveInfra(): Promise<Driver | null> {
  if (NEO4J_URI === undefined || NEO4J_USER === undefined || NEO4J_PASSWORD === undefined) {
    // eslint-disable-next-line no-console
    console.log(
      '[neo4j-graph-repository.live] skipping: set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD to run this suite.',
    );
    return null;
  }
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  try {
    await driver.getServerInfo();
    return driver;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[neo4j-graph-repository.live] skipping: could not reach Neo4j.', error);
    await driver.close().catch(() => undefined);
    return null;
  }
}

const driver = await probeLiveInfra();

describe.skipIf(driver === null)('Neo4jGraphRepository (live Neo4j)', () => {
  const organisationId = randomUUID();
  const workspaceId = randomUUID();
  const repo = new Neo4jGraphRepository(driver as Driver);

  async function mergeEntity(id: string, status: string): Promise<void> {
    const session = (driver as Driver).session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite((tx) =>
        tx.run(
          `MERGE (n:KnowledgeEntity {id: $id})
           SET n.organisationId = $organisationId, n.workspaceId = $workspaceId,
               n.entityType = 'person', n.topicScheme = null, n.canonicalLabel = $id,
               n.sensitivityClass = 'internal', n.status = $status, n.ontologyVersion = '0.1.0'`,
          { id, organisationId, workspaceId, status },
        ),
      );
    } finally {
      await session.close();
    }
  }

  async function mergeAssertion(params: {
    id: string;
    lifecycleState: string;
    perspectiveTags: string[];
  }): Promise<void> {
    const session = (driver as Driver).session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite((tx) =>
        tx.run(
          `MERGE (a:Assertion {id: $id})
           SET a.organisationId = $organisationId, a.workspaceId = $workspaceId,
               a.provenanceChainId = $id, a.sourceEvidenceIds = [$id], a.extractionMethod = 'human_manual',
               a.extractionModel = null, a.extractionModelVersion = null,
               a.confirmedByDisplayName = 'Live Test Reviewer', a.confirmedAt = '2026-09-22T00:00:00Z',
               a.confidence = 1.0, a.lifecycleState = $lifecycleState, a.perspectiveTags = $perspectiveTags,
               a.sensitivityClass = 'internal'`,
          { ...params, organisationId, workspaceId },
        ),
      );
    } finally {
      await session.close();
    }
  }

  async function mergeRelationship(params: {
    id: string;
    fromId: string;
    toId: string;
    type: string;
    assertionId: string;
  }): Promise<void> {
    const session = (driver as Driver).session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite((tx) =>
        tx.run(
          `MATCH (f:KnowledgeEntity {id: $fromId}), (t:KnowledgeEntity {id: $toId})
           MERGE (f)-[r:${params.type} {id: $id}]->(t)
           SET r.assertionId = $assertionId, r.organisationId = $organisationId, r.workspaceId = $workspaceId,
               r.fromEntityId = $fromId, r.toEntityId = $toId, r.validFrom = '2026-09-22T00:00:00Z',
               r.validTo = null, r.strength = null`,
          {
            id: params.id,
            fromId: params.fromId,
            toId: params.toId,
            assertionId: params.assertionId,
            organisationId,
            workspaceId,
          },
        ),
      );
    } finally {
      await session.close();
    }
  }

  const entityA = randomUUID();
  const entityContested = randomUUID();
  const entityRestricted = randomUUID();
  const merged = randomUUID();
  const contestedAssertionId = randomUUID();
  const restrictedAssertionId = randomUUID();
  const contestedRelationshipId = randomUUID();
  const restrictedRelationshipId = randomUUID();

  beforeAll(async () => {
    if (driver === null) return;
    await mergeEntity(entityA, 'active');
    await mergeEntity(entityContested, 'active');
    await mergeEntity(entityRestricted, 'active');
    await mergeEntity(merged, 'merged');

    await mergeAssertion({
      id: contestedAssertionId,
      lifecycleState: 'approved',
      perspectiveTags: ['contested', 'minority_perspective'],
    });
    await mergeRelationship({
      id: contestedRelationshipId,
      fromId: entityA,
      toId: entityContested,
      type: 'SUPPORTED_BY',
      assertionId: contestedAssertionId,
    });

    await mergeAssertion({
      id: restrictedAssertionId,
      lifecycleState: 'community_validated',
      perspectiveTags: ['community_restricted', 'culturally_significant'],
    });
    await mergeRelationship({
      id: restrictedRelationshipId,
      fromId: entityA,
      toId: entityRestricted,
      type: 'SUPPORTED_BY',
      assertionId: restrictedAssertionId,
    });
  });

  afterAll(async () => {
    if (driver === null) return;
    const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite((tx) =>
        tx.run(`MATCH (n {organisationId: $organisationId}) DETACH DELETE n`, { organisationId }),
      );
    } finally {
      await session.close();
    }
    await driver.close();
  });

  describe('governance metadata projection and redaction', () => {
    it('surfaces non-restricted perspective tags and lifecycle state to any caller', async () => {
      const { edges } = await repo.neighbourhood({
        organisationId,
        entityId: entityA,
        depth: 1,
        canInspectGovernance: false,
      });
      const contestedEdge = edges.find((e) => e.id === contestedRelationshipId);
      expect(contestedEdge?.lifecycleState).toBe('approved');
      expect(contestedEdge?.perspectiveTags).toEqual(['contested', 'minority_perspective']);
    });

    it('redacts community_restricted governance detail from a caller without knowledge_provenance:inspect', async () => {
      const { edges } = await repo.neighbourhood({
        organisationId,
        entityId: entityA,
        depth: 1,
        canInspectGovernance: false,
      });
      const restrictedEdge = edges.find((e) => e.id === restrictedRelationshipId);
      expect(restrictedEdge).toBeDefined();
      expect(restrictedEdge?.lifecycleState).toBeNull();
      expect(restrictedEdge?.perspectiveTags).toBeNull();
    });

    it('reveals community_restricted governance detail to a caller with knowledge_provenance:inspect', async () => {
      const { edges } = await repo.neighbourhood({
        organisationId,
        entityId: entityA,
        depth: 1,
        canInspectGovernance: true,
      });
      const restrictedEdge = edges.find((e) => e.id === restrictedRelationshipId);
      expect(restrictedEdge?.lifecycleState).toBe('community_validated');
      expect(restrictedEdge?.perspectiveTags).toEqual([
        'community_restricted',
        'culturally_significant',
      ]);
    });
  });

  describe('tombstoned concepts and tenant isolation (invariant 4)', () => {
    it('getNode returns null for a merged (tombstoned) entity', async () => {
      const node = await repo.getNode({ organisationId }, merged);
      expect(node).toBeNull();
    });

    it('getNode returns the entity when active', async () => {
      const node = await repo.getNode({ organisationId }, entityA);
      expect(node?.id).toBe(entityA);
    });

    it('neighbourhood never returns nodes or edges from a different organisation', async () => {
      const { nodes, edges } = await repo.neighbourhood({
        organisationId: randomUUID(),
        entityId: entityA,
        depth: 2,
      });
      expect(nodes).toEqual([]);
      expect(edges).toEqual([]);
    });

    it('search never returns nodes from a different organisation', async () => {
      const results = await repo.search({ organisationId: randomUUID() }, entityA);
      expect(results).toEqual([]);
    });
  });
});
