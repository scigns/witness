/**
 * Real-Neo4j-and-PostgreSQL graph integrity suite (`KNOWLEDGE_GRAPH.md` §13,
 * ADR-0027). Everything in `postgres-source.test.ts`/`neo4j-projector.test.ts`
 * proves the projector's *logic* against a fake driver/pool; this file
 * proves the actual Cypher and SQL round-trip against real databases —
 * specifically the invariants a mock cannot stand in for: that `MERGE`
 * really is idempotent, that a real recursive CTE really does compute a
 * merge subtree, and that `DETACH DELETE` really does remove exactly what
 * it should and nothing else.
 *
 * Skips itself (does not fail) when DATABASE_URL/NEO4J_URI/NEO4J_USER/
 * NEO4J_PASSWORD are not set or the databases are unreachable — run via
 * `pnpm --filter @witness/graph-projector test:live` with those exported
 * (e.g. from `.env`) against `make dev-full`'s stack. Never run against a
 * shared database: every fixture lives under one random `organisationId`
 * generated per test run, and cleanup deletes exactly that tenant's rows —
 * `rebuild.ts`'s real `MATCH (n) DETACH DELETE n` (whole-database wipe) is
 * deliberately never invoked here; the tenant-scoped wipe/replay below
 * exercises the identical `loadAssertionProjection`/`projectAssertion`
 * functions `rebuild.ts` calls, without risking unrelated dev data.
 */

import { randomUUID } from 'node:crypto';

import neo4j, { type Driver } from 'neo4j-driver';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { projectEntityMerge } from './main.js';
import { isProjectable, projectAssertion, removeMergedEntityNode } from './neo4j-projector.js';
import { fetchMergeSubtreeIds, loadAssertionProjection } from './postgres-source.js';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

const DATABASE_URL = optionalEnv('DATABASE_URL');
const NEO4J_URI = optionalEnv('NEO4J_URI');
const NEO4J_USER = optionalEnv('NEO4J_PROJECTOR_USER') ?? optionalEnv('NEO4J_USER');
const NEO4J_PASSWORD = optionalEnv('NEO4J_PROJECTOR_PASSWORD') ?? optionalEnv('NEO4J_PASSWORD');

async function probeLiveInfra(): Promise<{ pool: pg.Pool; driver: Driver } | null> {
  if (
    DATABASE_URL === undefined ||
    NEO4J_URI === undefined ||
    NEO4J_USER === undefined ||
    NEO4J_PASSWORD === undefined
  ) {
    // eslint-disable-next-line no-console
    console.log(
      '[graph-integrity.live] skipping: set DATABASE_URL, NEO4J_URI, NEO4J_USER, ' +
        'NEO4J_PASSWORD (matching workers/graph-projector/src/config.ts) to run this suite.',
    );
    return null;
  }
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  try {
    await pool.query('SELECT 1');
    await driver.getServerInfo();
    return { pool, driver };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[graph-integrity.live] skipping: could not reach PostgreSQL/Neo4j.', error);
    await pool.end().catch(() => undefined);
    await driver.close().catch(() => undefined);
    return null;
  }
}

const live = await probeLiveInfra();

describe.skipIf(live === null)('graph integrity (live PostgreSQL + Neo4j)', () => {
  const pool = live?.pool as pg.Pool;
  const driver = live?.driver as Driver;

  const organisationId = randomUUID();
  const workspaceId = randomUUID();
  const actorId = randomUUID();

  async function insertActor(): Promise<void> {
    await pool.query(
      `INSERT INTO actor (id, kind, display_name) VALUES ($1, 'human', 'Live Test Reviewer')`,
      [actorId],
    );
  }

  async function insertOrganisation(): Promise<void> {
    await pool.query(
      `INSERT INTO organisation (id, name, storage_quota_bytes, profile)
       VALUES ($1, $2, 5368709120, 'general')`,
      [organisationId, `graph-integrity-live-${organisationId}`],
    );
  }

  async function insertWorkspace(): Promise<void> {
    await pool.query(
      `INSERT INTO workspace (id, name, organisation_id, updated_at)
       VALUES ($1, 'Live Test Workspace', $2, now())`,
      [workspaceId, organisationId],
    );
  }

  async function insertEntity(overrides: {
    id: string;
    label: string;
    status?: string;
    mergedIntoId?: string | null;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO knowledge_entity
         (id, organisation_id, workspace_id, entity_type, canonical_label, status, merged_into_id, ontology_version, created_by_id)
       VALUES ($1, $2, $3, 'person', $4, $5, $6, '0.1.0', $7)`,
      [
        overrides.id,
        organisationId,
        workspaceId,
        overrides.label,
        overrides.status ?? 'active',
        overrides.mergedIntoId ?? null,
        actorId,
      ],
    );
  }

  async function mergeEntity(mergedId: string, survivorId: string): Promise<void> {
    await pool.query(
      `UPDATE knowledge_entity SET status = 'merged', merged_into_id = $2 WHERE id = $1`,
      [mergedId, survivorId],
    );
  }

  /** Inserts a confirmed relationship assertion directly (bypassing the API layer, which is out of scope here). */
  async function insertRelationshipAssertion(params: {
    assertionId: string;
    relationshipId: string;
    fromEntityId: string;
    toEntityId: string;
    relationshipType: string;
    lifecycleState?: string;
    perspectiveTags?: string[];
  }): Promise<void> {
    const provenanceChainId = randomUUID();
    await pool.query(
      `INSERT INTO knowledge_provenance_chain
         (id, source_evidence_ids, extraction_method, confirmed_by_actor_id, confirmed_at)
       VALUES ($1, $2, 'human_manual', $3, now())`,
      [provenanceChainId, [randomUUID()], actorId],
    );
    await pool.query(
      `INSERT INTO knowledge_assertion
         (id, organisation_id, workspace_id, assertion_type, provenance_chain_id, confidence,
          lifecycle_state, perspective_tags, valid_from, created_by_id)
       VALUES ($1, $2, $3, 'relationship', $4, 1.0, $5, $6, now(), $7)`,
      [
        params.assertionId,
        organisationId,
        workspaceId,
        provenanceChainId,
        params.lifecycleState ?? 'approved',
        params.perspectiveTags ?? [],
        actorId,
      ],
    );
    await pool.query(
      `INSERT INTO knowledge_relationship
         (id, organisation_id, workspace_id, from_entity_id, to_entity_id, relationship_type,
          assertion_id, valid_from, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)`,
      [
        params.relationshipId,
        organisationId,
        workspaceId,
        params.fromEntityId,
        params.toEntityId,
        params.relationshipType,
        params.assertionId,
        actorId,
      ],
    );
  }

  async function projectByAssertionId(assertionId: string): Promise<void> {
    const projection = await loadAssertionProjection(pool, assertionId);
    expect(projection).not.toBeNull();
    const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      if (projection !== null) await projectAssertion(session, projection);
    } finally {
      await session.close();
    }
  }

  async function edgesBetween(
    fromId: string,
    toId: string,
  ): Promise<{ type: string; id: string }[]> {
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.executeRead((tx) =>
        tx.run(
          `MATCH (f:KnowledgeEntity {id: $fromId})-[r]->(t:KnowledgeEntity {id: $toId}) RETURN r`,
          { fromId, toId },
        ),
      );
      return result.records.map((rec) => {
        const rel = rec.get('r') as { type: string; properties: Record<string, unknown> };
        return { type: rel.type, id: String(rel.properties['id']) };
      });
    } finally {
      await session.close();
    }
  }

  async function nodeExists(id: string): Promise<boolean> {
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.executeRead((tx) =>
        tx.run(`MATCH (n:KnowledgeEntity {id: $id}) RETURN n LIMIT 1`, { id }),
      );
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  async function activeNodeExists(id: string): Promise<boolean> {
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.executeRead((tx) =>
        tx.run(
          `MATCH (n:KnowledgeEntity {id: $id, organisationId: $organisationId, status: 'active'}) RETURN n LIMIT 1`,
          { id, organisationId },
        ),
      );
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  beforeAll(async () => {
    if (live === null) return;
    await insertOrganisation();
    await insertActor();
    await insertWorkspace();
  });

  afterAll(async () => {
    if (live === null) return;
    // Tenant-scoped Neo4j cleanup — never a whole-database wipe.
    const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite((tx) =>
        tx.run(`MATCH (n {organisationId: $organisationId}) DETACH DELETE n`, { organisationId }),
      );
    } finally {
      await session.close();
    }
    // Postgres cleanup, children before parents (FKs are RESTRICT).
    await pool.query(`DELETE FROM knowledge_relationship WHERE organisation_id = $1`, [
      organisationId,
    ]);
    await pool.query(`DELETE FROM knowledge_assertion WHERE organisation_id = $1`, [
      organisationId,
    ]);
    await pool.query(`DELETE FROM knowledge_provenance_chain WHERE confirmed_by_actor_id = $1`, [
      actorId,
    ]);
    await pool.query(`DELETE FROM knowledge_entity WHERE organisation_id = $1`, [organisationId]);
    await pool.query(`DELETE FROM workspace WHERE organisation_id = $1`, [organisationId]);
    await pool.query(`DELETE FROM organisation WHERE id = $1`, [organisationId]);
    await pool.query(`DELETE FROM actor WHERE id = $1`, [actorId]);
    await pool.end();
    await driver.close();
  });

  describe('canonical merge resolution (Gap B)', () => {
    it('resolves a relationship through the surviving entity after a merge, and removes the tombstoned node from the current graph', async () => {
      const survivor = randomUUID();
      const merged = randomUUID();
      const target = randomUUID();
      const relationshipId = randomUUID();
      const assertionId = randomUUID();

      await insertEntity({ id: survivor, label: 'Survivor A' });
      await insertEntity({ id: merged, label: 'Merged B' });
      await insertEntity({ id: target, label: 'Target X' });
      await insertRelationshipAssertion({
        assertionId,
        relationshipId,
        fromEntityId: merged,
        toEntityId: target,
        relationshipType: 'SUPPORTED_BY',
      });
      await projectByAssertionId(assertionId);

      expect(await edgesBetween(merged, target)).toEqual([
        { type: 'SUPPORTED_BY', id: relationshipId },
      ]);
      expect(await edgesBetween(survivor, target)).toEqual([]);

      await mergeEntity(merged, survivor);
      const reprojected = await projectEntityMerge(pool, driver, survivor, merged);

      expect(reprojected).toBe(1);
      expect(await edgesBetween(survivor, target)).toEqual([
        { type: 'SUPPORTED_BY', id: relationshipId },
      ]);
      expect(await nodeExists(merged)).toBe(false);
      expect(await activeNodeExists(survivor)).toBe(true);
    });

    it('resolves a chained merge (C into B into A) even when the merges happen as separate events', async () => {
      const a = randomUUID();
      const b = randomUUID();
      const c = randomUUID();
      const target = randomUUID();
      const cRelationshipId = randomUUID();
      const cAssertionId = randomUUID();

      await insertEntity({ id: a, label: 'Chain A' });
      await insertEntity({ id: b, label: 'Chain B' });
      await insertEntity({ id: c, label: 'Chain C' });
      await insertEntity({ id: target, label: 'Chain Target' });
      await insertRelationshipAssertion({
        assertionId: cAssertionId,
        relationshipId: cRelationshipId,
        fromEntityId: c,
        toEntityId: target,
        relationshipType: 'SUPPORTED_BY',
      });
      await projectByAssertionId(cAssertionId);
      expect(await edgesBetween(c, target)).toHaveLength(1);

      // First merge event: C into B.
      await mergeEntity(c, b);
      await projectEntityMerge(pool, driver, b, c);
      expect(await edgesBetween(b, target)).toEqual([
        { type: 'SUPPORTED_BY', id: cRelationshipId },
      ]);
      expect(await nodeExists(c)).toBe(false);

      // Second, separate merge event: B into A. Without subtree resolution,
      // C's relationship (still cited by C in Postgres) would be silently
      // dropped when B's node is detach-deleted.
      await mergeEntity(b, a);
      const reprojected = await projectEntityMerge(pool, driver, a, b);

      expect(reprojected).toBeGreaterThanOrEqual(1);
      expect(await edgesBetween(a, target)).toEqual([
        { type: 'SUPPORTED_BY', id: cRelationshipId },
      ]);
      expect(await nodeExists(b)).toBe(false);
      expect(await nodeExists(c)).toBe(false);
    });

    it('re-running the same merge projection is idempotent (repeated merge event)', async () => {
      const survivor = randomUUID();
      const merged = randomUUID();
      const target = randomUUID();
      const relationshipId = randomUUID();
      const assertionId = randomUUID();

      await insertEntity({ id: survivor, label: 'Idempotent Survivor' });
      await insertEntity({ id: merged, label: 'Idempotent Merged' });
      await insertEntity({ id: target, label: 'Idempotent Target' });
      await insertRelationshipAssertion({
        assertionId,
        relationshipId,
        fromEntityId: merged,
        toEntityId: target,
        relationshipType: 'SUPPORTED_BY',
      });
      await projectByAssertionId(assertionId);
      await mergeEntity(merged, survivor);

      await projectEntityMerge(pool, driver, survivor, merged);
      await projectEntityMerge(pool, driver, survivor, merged);
      await projectEntityMerge(pool, driver, survivor, merged);

      expect(await edgesBetween(survivor, target)).toEqual([
        { type: 'SUPPORTED_BY', id: relationshipId },
      ]);
    });
  });

  describe('duplicate and conflicting relationships after a merge', () => {
    it('keeps two independently-confirmed equivalent relationships as distinct edges, not one collapsed edge', async () => {
      const survivor = randomUUID();
      const merged = randomUUID();
      const target = randomUUID();
      const survivorRelId = randomUUID();
      const mergedRelId = randomUUID();
      const survivorAssertionId = randomUUID();
      const mergedAssertionId = randomUUID();

      await insertEntity({ id: survivor, label: 'Dup Survivor' });
      await insertEntity({ id: merged, label: 'Dup Merged' });
      await insertEntity({ id: target, label: 'Dup Target' });
      await insertRelationshipAssertion({
        assertionId: survivorAssertionId,
        relationshipId: survivorRelId,
        fromEntityId: survivor,
        toEntityId: target,
        relationshipType: 'SUPPORTED_BY',
      });
      await insertRelationshipAssertion({
        assertionId: mergedAssertionId,
        relationshipId: mergedRelId,
        fromEntityId: merged,
        toEntityId: target,
        relationshipType: 'SUPPORTED_BY',
      });
      await projectByAssertionId(survivorAssertionId);
      await projectByAssertionId(mergedAssertionId);

      await mergeEntity(merged, survivor);
      await projectEntityMerge(pool, driver, survivor, merged);

      const edges = await edgesBetween(survivor, target);
      expect(edges).toHaveLength(2);
      expect(edges.map((e) => e.id).sort()).toEqual([mergedRelId, survivorRelId].sort());
    });

    it('preserves disagreement (SUPPORTED_BY and CONTRADICTED_BY) as two distinct edges after a merge', async () => {
      const survivor = randomUUID();
      const merged = randomUUID();
      const target = randomUUID();
      const supportRelId = randomUUID();
      const contradictRelId = randomUUID();
      const supportAssertionId = randomUUID();
      const contradictAssertionId = randomUUID();

      await insertEntity({ id: survivor, label: 'Disagree Survivor' });
      await insertEntity({ id: merged, label: 'Disagree Merged' });
      await insertEntity({ id: target, label: 'Disagree Target' });
      await insertRelationshipAssertion({
        assertionId: supportAssertionId,
        relationshipId: supportRelId,
        fromEntityId: survivor,
        toEntityId: target,
        relationshipType: 'SUPPORTED_BY',
        perspectiveTags: ['contested'],
      });
      await insertRelationshipAssertion({
        assertionId: contradictAssertionId,
        relationshipId: contradictRelId,
        fromEntityId: merged,
        toEntityId: target,
        relationshipType: 'CONTRADICTED_BY',
        perspectiveTags: ['contested', 'minority_perspective'],
      });
      await projectByAssertionId(supportAssertionId);
      await projectByAssertionId(contradictAssertionId);

      await mergeEntity(merged, survivor);
      await projectEntityMerge(pool, driver, survivor, merged);

      const edges = await edgesBetween(survivor, target);
      expect(edges.map((e) => e.type).sort()).toEqual(['CONTRADICTED_BY', 'SUPPORTED_BY']);
    });
  });

  describe('tenant isolation', () => {
    it('a merge subtree lookup never crosses organisations', async () => {
      const otherOrgEntity = randomUUID();
      // Deliberately not tied to `organisationId` — inserted, then queried
      // by id alone to prove `fetchMergeSubtreeIds` (id-keyed, no
      // organisation filter of its own) still cannot be used to leak
      // cross-tenant structure: the caller (`projectEntityMerge`) only ever
      // resolves assertions it already found via a same-organisation entity,
      // and Neo4j reads remain organisation-filtered independently
      // (`Neo4jGraphRepository`, covered in its own live suite).
      await insertEntity({ id: otherOrgEntity, label: 'Unrelated' });
      const subtree = await fetchMergeSubtreeIds(pool, otherOrgEntity);
      expect(subtree).toEqual([otherOrgEntity]);
    });
  });

  describe('tenant-scoped wipe and rebuild (rebuild.ts equivalence, without a whole-database wipe)', () => {
    it("wiping this tenant's projection and replaying from PostgreSQL reproduces the same active graph", async () => {
      const a = randomUUID();
      const b = randomUUID();
      const target = randomUUID();
      const relationshipId = randomUUID();
      const assertionId = randomUUID();

      await insertEntity({ id: a, label: 'Rebuild A' });
      await insertEntity({ id: b, label: 'Rebuild B' });
      await insertEntity({ id: target, label: 'Rebuild Target' });
      await insertRelationshipAssertion({
        assertionId,
        relationshipId,
        fromEntityId: b,
        toEntityId: target,
        relationshipType: 'SUPPORTED_BY',
      });
      await projectByAssertionId(assertionId);
      await mergeEntity(b, a);
      await projectEntityMerge(pool, driver, a, b);

      const before = await edgesBetween(a, target);
      expect(before).toEqual([{ type: 'SUPPORTED_BY', id: relationshipId }]);

      // Tenant-scoped wipe (never the whole database) — same MERGE-based
      // replay `rebuild.ts` performs for every confirmed assertion.
      const wipeSession = driver.session({ defaultAccessMode: neo4j.session.WRITE });
      try {
        await wipeSession.executeWrite((tx) =>
          tx.run(`MATCH (n {organisationId: $organisationId}) DETACH DELETE n`, { organisationId }),
        );
      } finally {
        await wipeSession.close();
      }
      expect(await nodeExists(a)).toBe(false);

      await projectByAssertionId(assertionId);

      const after = await edgesBetween(a, target);
      expect(after).toEqual(before);
      expect(await nodeExists(b)).toBe(false);

      // Replaying the same assertion a second time (idempotent rebuild).
      await projectByAssertionId(assertionId);
      expect(await edgesBetween(a, target)).toEqual(before);
    });
  });

  describe('rejected and retracted assertions never enter the active graph', () => {
    it('does not project a rejected-lifecycle assertion, and removes one that becomes retracted', async () => {
      const from = randomUUID();
      const to = randomUUID();
      const relationshipId = randomUUID();
      const assertionId = randomUUID();

      await insertEntity({ id: from, label: 'Lifecycle From' });
      await insertEntity({ id: to, label: 'Lifecycle To' });
      await insertRelationshipAssertion({
        assertionId,
        relationshipId,
        fromEntityId: from,
        toEntityId: to,
        relationshipType: 'SUPPORTED_BY',
      });

      const projection = await loadAssertionProjection(pool, assertionId);
      expect(projection).not.toBeNull();
      expect(projection !== null && isProjectable(projection)).toBe(true);
      await projectByAssertionId(assertionId);
      expect(await edgesBetween(from, to)).toHaveLength(1);

      await pool.query(`UPDATE knowledge_assertion SET retracted_at = now() WHERE id = $1`, [
        assertionId,
      ]);
      const retracted = await loadAssertionProjection(pool, assertionId);
      expect(retracted !== null && isProjectable(retracted)).toBe(false);
      const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
      try {
        if (retracted !== null) {
          await projectAssertion(session, retracted);
        }
      } finally {
        await session.close();
      }
      expect(await edgesBetween(from, to)).toEqual([]);
    });
  });

  describe('removeMergedEntityNode', () => {
    it('detach-deletes only the merged node, leaving unrelated nodes untouched', async () => {
      const mergedId = randomUUID();
      const untouched = randomUUID();
      await insertEntity({ id: mergedId, label: 'Solo merged node', status: 'merged' });
      await insertEntity({ id: untouched, label: 'Untouched sibling' });

      const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
      try {
        await session.executeWrite((tx) =>
          tx.run(
            `MERGE (n:KnowledgeEntity {id: $id}) SET n.organisationId = $organisationId, n.status = 'merged'`,
            { id: mergedId, organisationId },
          ),
        );
        await session.executeWrite((tx) =>
          tx.run(
            `MERGE (n:KnowledgeEntity {id: $id}) SET n.organisationId = $organisationId, n.status = 'active'`,
            { id: untouched, organisationId },
          ),
        );
      } finally {
        await session.close();
      }

      const deleteSession = driver.session({ defaultAccessMode: neo4j.session.WRITE });
      try {
        await removeMergedEntityNode(deleteSession, mergedId);
      } finally {
        await deleteSession.close();
      }

      expect(await nodeExists(mergedId)).toBe(false);
      expect(await nodeExists(untouched)).toBe(true);
    });
  });
});
