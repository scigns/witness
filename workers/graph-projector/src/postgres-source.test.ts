/**
 * `resolveCanonicalEntity` is the one place a merge's "current graph
 * resolves through the survivor" guarantee is enforced (`KNOWLEDGE_GRAPH.md`
 * §13, Gap B; ADR-0027). A fake `pg.Pool` is enough here — the function's
 * entire job is chain-walking logic over rows it is handed, not SQL
 * correctness (the real queries are exercised live in
 * `graph-integrity.live.test.ts`).
 */

import { describe, expect, it } from 'vitest';

import { fetchMergeSubtreeIds, resolveCanonicalEntity, type EntityRow } from './postgres-source.js';

function entity(overrides: Partial<EntityRow> & { id: string }): EntityRow {
  return {
    organisationId: 'org-1',
    workspaceId: 'ws-1',
    entityType: 'person',
    topicScheme: null,
    canonicalLabel: overrides.id,
    sensitivityClass: 'internal',
    status: 'active',
    ontologyVersion: '0.1.0',
    mergedIntoId: null,
    ...overrides,
  };
}

function fakePool(rows: Record<string, EntityRow>) {
  return {
    query: async (_sql: string, params: unknown[]) => {
      const id = params[0] as string;
      const row = rows[id];
      if (row === undefined) return { rows: [] };
      return {
        rows: [
          {
            id: row.id,
            organisation_id: row.organisationId,
            workspace_id: row.workspaceId,
            entity_type: row.entityType,
            topic_scheme: row.topicScheme,
            canonical_label: row.canonicalLabel,
            sensitivity_class: row.sensitivityClass,
            status: row.status,
            ontology_version: row.ontologyVersion,
            merged_into_id: row.mergedIntoId,
          },
        ],
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('resolveCanonicalEntity', () => {
  it('returns the entity unchanged when it is already active', async () => {
    const pool = fakePool({});
    const active = entity({ id: 'A', status: 'active' });

    const result = await resolveCanonicalEntity(pool, active);

    expect(result.id).toBe('A');
  });

  it('resolves one hop: B merged into A', async () => {
    const a = entity({ id: 'A', status: 'active' });
    const b = entity({ id: 'B', status: 'merged', mergedIntoId: 'A' });
    const pool = fakePool({ A: a });

    const result = await resolveCanonicalEntity(pool, b);

    expect(result.id).toBe('A');
  });

  it('resolves a chained merge: C -> B -> A', async () => {
    const a = entity({ id: 'A', status: 'active' });
    const b = entity({ id: 'B', status: 'merged', mergedIntoId: 'A' });
    const c = entity({ id: 'C', status: 'merged', mergedIntoId: 'B' });
    const pool = fakePool({ A: a, B: b });

    const result = await resolveCanonicalEntity(pool, c);

    expect(result.id).toBe('A');
  });

  it('resolves a longer chain: D -> C -> B -> A', async () => {
    const a = entity({ id: 'A', status: 'active' });
    const b = entity({ id: 'B', status: 'merged', mergedIntoId: 'A' });
    const c = entity({ id: 'C', status: 'merged', mergedIntoId: 'B' });
    const d = entity({ id: 'D', status: 'merged', mergedIntoId: 'C' });
    const pool = fakePool({ A: a, B: b, C: c });

    const result = await resolveCanonicalEntity(pool, d);

    expect(result.id).toBe('A');
  });

  it('refuses to loop forever if a cycle is somehow present (defensive cap)', async () => {
    // Structurally impossible via the domain layer (a merge target must be
    // active), but this proves the defensive hop cap actually fires rather
    // than hanging, if that invariant were ever violated by a bug or a
    // direct database write.
    const x = entity({ id: 'X', status: 'merged', mergedIntoId: 'Y' });
    const y = entity({ id: 'Y', status: 'merged', mergedIntoId: 'X' });
    const pool = fakePool({ X: x, Y: y });

    await expect(resolveCanonicalEntity(pool, x)).rejects.toThrow(/exceeded/i);
  });

  it('resolves to the last-known entity if a merge target row is unexpectedly missing', async () => {
    const b = entity({ id: 'B', status: 'merged', mergedIntoId: 'GONE' });
    const pool = fakePool({});

    const result = await resolveCanonicalEntity(pool, b);

    expect(result.id).toBe('B');
  });
});

/**
 * `fetchMergeSubtreeIds` uses a recursive CTE, which a row-keyed fake
 * `pg.Pool` cannot simulate query-by-query — this fake instead walks a
 * plain `mergedIntoId` adjacency map in JS to compute the same answer the
 * real recursive query would, and returns it for any call regardless of the
 * SQL text. The real query's shape is exercised live in
 * `graph-integrity.live.test.ts`.
 */
function fakeSubtreePool(mergedIntoId: Record<string, string>) {
  return {
    query: async (_sql: string, params: unknown[]) => {
      const root = params[0] as string;
      const ids = [root];
      let frontier = [root];
      while (frontier.length > 0) {
        const next = Object.entries(mergedIntoId)
          .filter(([, parent]) => frontier.includes(parent))
          .map(([id]) => id);
        ids.push(...next);
        frontier = next;
      }
      return { rows: ids.map((id) => ({ id })) };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('fetchMergeSubtreeIds', () => {
  it('returns just the entity itself when nothing has merged into it', async () => {
    const pool = fakeSubtreePool({});

    const result = await fetchMergeSubtreeIds(pool, 'A');

    expect(result).toEqual(['A']);
  });

  it('includes an entity that merged directly into it', async () => {
    const pool = fakeSubtreePool({ B: 'A' });

    const result = await fetchMergeSubtreeIds(pool, 'A');

    expect(result.sort()).toEqual(['A', 'B']);
  });

  it('includes entities that merged in transitively (chained merge)', async () => {
    // C merged into B (some time ago); B is merging into A now. The
    // subtree rooted at B must still include C, so C's original assertion
    // gets re-projected onto A rather than silently dropped when B's node
    // is detach-deleted.
    const pool = fakeSubtreePool({ C: 'B' });

    const result = await fetchMergeSubtreeIds(pool, 'B');

    expect(result.sort()).toEqual(['B', 'C']);
  });
});
