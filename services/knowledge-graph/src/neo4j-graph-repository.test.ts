/**
 * Tenant-isolation tests for `Neo4jGraphRepository` — the gap this file
 * closes is real: before this test existed, nothing proved that every
 * query actually carries `organisationId` as a bound parameter rather
 * than, say, a string interpolated into the wrong place, or omitted
 * entirely for one query path. A fake `Driver` stands in for Neo4j
 * (constructor injection added specifically to make this possible — see
 * `neo4j-graph-repository.ts`'s constructor doc comment).
 *
 * Two things are asserted per method: (1) every Cypher `run()` call is
 * parameterised with the caller's `organisationId`, never string-embedded
 * (ADR/§9 "parameterised queries only"), and (2) a minimal in-memory
 * "database" proves a cross-tenant id lookup returns nothing even when the
 * id exists under a different organisation.
 */

import { describe, expect, it } from 'vitest';

import { Neo4jGraphRepository } from './neo4j-graph-repository.js';

interface FakeNode {
  id: string;
  organisationId: string;
  workspaceId: string;
  entityType: string;
  topicScheme: string | null;
  canonicalLabel: string;
  sensitivityClass: string;
  status: string;
  ontologyVersion: string;
}

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const NODE_IN_ORG_A = 'entity-1';

const FAKE_NODES: FakeNode[] = [
  {
    id: NODE_IN_ORG_A,
    organisationId: ORG_A,
    workspaceId: 'ws-a',
    entityType: 'topic',
    topicScheme: 'general_concept',
    canonicalLabel: 'Climate Change',
    sensitivityClass: 'internal',
    status: 'active',
    ontologyVersion: '0.1.0',
  },
];

/**
 * A fake `Driver` that actually enforces tenant scoping in its record
 * lookups (rather than merely echoing back whatever it was asked for), so
 * the test genuinely exercises "does the repository's Cypher restrict
 * results to the caller's organisation" rather than only "did it pass a
 * parameter named organisationId".
 */
function fakeDriver() {
  const runCalls: { cypher: string; params: Record<string, unknown> }[] = [];

  function fakeRecord(properties: Record<string, unknown>) {
    return { get: (_key: string) => ({ properties }) };
  }

  const session = {
    executeRead: async (
      work: (tx: {
        run: (cypher: string, params: Record<string, unknown>) => Promise<{ records: unknown[] }>;
      }) => Promise<unknown>,
    ) => {
      const tx = {
        run: async (cypher: string, params: Record<string, unknown>) => {
          runCalls.push({ cypher, params });

          // getNode / search: filter the fake node set exactly as the real
          // Cypher's WHERE/MATCH property predicates would.
          if (cypher.includes('RETURN n LIMIT 1')) {
            const match = FAKE_NODES.find(
              (n) => n.id === params['entityId'] && n.organisationId === params['organisationId'],
            );
            return { records: match ? [fakeRecord(match)] : [] };
          }
          if (cypher.includes('CONTAINS toLower($query)')) {
            const matches = FAKE_NODES.filter(
              (n) =>
                n.organisationId === params['organisationId'] &&
                n.canonicalLabel.toLowerCase().includes(String(params['query']).toLowerCase()),
            );
            return { records: matches.map(fakeRecord) };
          }
          // neighbourhood / provenance queries: no fake graph edges modelled;
          // returning empty is enough to prove the call shape (asserted via
          // runCalls below), since the behavioural proof lives in the two
          // cases above.
          return { records: [] };
        },
      };
      return work(tx as never);
    },
    close: async () => {},
  };

  const driver = {
    session: () => session,
    close: async () => {},
  };

  return { driver, runCalls };
}

describe('Neo4jGraphRepository — tenant isolation', () => {
  it('getNode returns the entity when the caller is the owning organisation', async () => {
    const { driver } = fakeDriver();
    const repo = new Neo4jGraphRepository(driver as never);

    const node = await repo.getNode({ organisationId: ORG_A }, NODE_IN_ORG_A);
    expect(node?.id).toBe(NODE_IN_ORG_A);
  });

  it('getNode returns null for the exact same entity id under a different organisation — cross-tenant lookup fails, not errors, not leaks', async () => {
    const { driver } = fakeDriver();
    const repo = new Neo4jGraphRepository(driver as never);

    const node = await repo.getNode({ organisationId: ORG_B }, NODE_IN_ORG_A);
    expect(node).toBeNull();
  });

  it('search only returns results scoped to the caller organisation', async () => {
    const { driver } = fakeDriver();
    const repo = new Neo4jGraphRepository(driver as never);

    const asOwner = await repo.search({ organisationId: ORG_A }, 'climate');
    const asOther = await repo.search({ organisationId: ORG_B }, 'climate');

    expect(asOwner).toHaveLength(1);
    expect(asOther).toHaveLength(0);
  });

  it('getNode always sends organisationId as a bound Cypher parameter, never string-embedded', async () => {
    const { driver, runCalls } = fakeDriver();
    const repo = new Neo4jGraphRepository(driver as never);
    await repo.getNode({ organisationId: ORG_A }, NODE_IN_ORG_A);

    expect(runCalls.length).toBeGreaterThan(0);
    for (const call of runCalls) {
      expect(call.params['organisationId']).toBe(ORG_A);
      // The organisationId value must never appear directly concatenated
      // into the query text — only ever referenced as `$organisationId`.
      expect(call.cypher.includes(ORG_A)).toBe(false);
      expect(call.cypher).toContain('$organisationId');
    }
  });

  it('neighbourhood, provenanceForNode, provenanceForEdge and search every bind organisationId as a parameter', async () => {
    const { driver, runCalls } = fakeDriver();
    const repo = new Neo4jGraphRepository(driver as never);

    await repo.neighbourhood({ organisationId: ORG_A, entityId: NODE_IN_ORG_A });
    await repo.provenanceForNode({ organisationId: ORG_A }, NODE_IN_ORG_A);
    await repo.provenanceForEdge({ organisationId: ORG_A }, 'rel-1');
    await repo.search({ organisationId: ORG_A }, 'x');

    expect(runCalls.length).toBe(4);
    for (const call of runCalls) {
      expect(call.params['organisationId']).toBe(ORG_A);
      expect(call.cypher).toContain('$organisationId');
    }
  });

  it('rejects a call with an empty organisationId rather than silently querying unscoped', async () => {
    const { driver } = fakeDriver();
    const repo = new Neo4jGraphRepository(driver as never);

    await expect(repo.getNode({ organisationId: '' }, NODE_IN_ORG_A)).rejects.toThrow(
      /organisationId is required/,
    );
  });
});

/**
 * `neighbourhood`'s governance-metadata surfacing and redaction
 * (`KNOWLEDGE_GRAPH.md` §13, Gap A; ADR-0027) — a fake driver that answers
 * the *shape* `neighbourhood`'s query returns (`nodes`, `relPairs`, each
 * pair pre-associated with its assertion) rather than modelling real
 * Cypher traversal, since the logic under test is this file's TypeScript
 * mapping and redaction, not the Cypher engine (that round-trip, and the
 * exact Cypher shape, is exercised live in
 * `graph-integrity.live.test.ts`/`neo4j-graph-repository.live.test.ts` —
 * a nested pattern comprehension was tried here first and rejected by a
 * real Neo4j 5.26 server, which this fake driver would never have caught).
 */
function fakeNeighbourhoodDriver(scenario: {
  rel: Record<string, unknown>;
  relType: string;
  assertion: Record<string, unknown> | null;
}) {
  const session = {
    executeRead: async (
      work: (tx: {
        run: (cypher: string, params: Record<string, unknown>) => Promise<{ records: unknown[] }>;
      }) => Promise<unknown>,
    ) => {
      const tx = {
        run: async () => ({
          records: [
            {
              get: (key: string) => {
                if (key === 'nodes') return [];
                if (key === 'relPairs') {
                  return [
                    {
                      rel: { type: scenario.relType, properties: scenario.rel },
                      assertion:
                        scenario.assertion === null ? null : { properties: scenario.assertion },
                    },
                  ];
                }
                throw new Error(`unexpected key '${key}'`);
              },
            },
          ],
        }),
      };
      return work(tx as never);
    },
    close: async () => {},
  };
  return { session: () => session, close: async () => {} };
}

const BASE_REL = {
  id: 'rel-1',
  fromEntityId: 'e1',
  toEntityId: 'e2',
  assertionId: 'a1',
  validFrom: '2026-01-01T00:00:00Z',
  validTo: null,
  strength: null,
};

describe('Neo4jGraphRepository — governance metadata on edges', () => {
  it('surfaces lifecycleState and perspectiveTags from the edge’s Assertion node', async () => {
    const driver = fakeNeighbourhoodDriver({
      rel: BASE_REL,
      relType: 'SUPPORTS',
      assertion: { lifecycleState: 'approved', perspectiveTags: ['contested'] },
    });
    const repo = new Neo4jGraphRepository(driver as never);

    const { edges } = await repo.neighbourhood({
      organisationId: 'org-a',
      entityId: 'e1',
      canInspectGovernance: false,
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]?.lifecycleState).toBe('approved');
    expect(edges[0]?.perspectiveTags).toEqual(['contested']);
  });

  it('redacts governance fields for community_restricted when the caller cannot inspect provenance', async () => {
    const driver = fakeNeighbourhoodDriver({
      rel: BASE_REL,
      relType: 'SUPPORTS',
      assertion: { lifecycleState: 'approved', perspectiveTags: ['community_restricted'] },
    });
    const repo = new Neo4jGraphRepository(driver as never);

    const { edges } = await repo.neighbourhood({
      organisationId: 'org-a',
      entityId: 'e1',
      canInspectGovernance: false,
    });

    expect(edges[0]?.lifecycleState).toBeNull();
    expect(edges[0]?.perspectiveTags).toBeNull();
  });

  it('does not redact community_restricted for a caller who can inspect provenance', async () => {
    const driver = fakeNeighbourhoodDriver({
      rel: BASE_REL,
      relType: 'SUPPORTS',
      assertion: { lifecycleState: 'approved', perspectiveTags: ['community_restricted'] },
    });
    const repo = new Neo4jGraphRepository(driver as never);

    const { edges } = await repo.neighbourhood({
      organisationId: 'org-a',
      entityId: 'e1',
      canInspectGovernance: true,
    });

    expect(edges[0]?.lifecycleState).toBe('approved');
    expect(edges[0]?.perspectiveTags).toEqual(['community_restricted']);
  });

  it('does not redact non-community_restricted tags regardless of the caller’s governance permission', async () => {
    const driver = fakeNeighbourhoodDriver({
      rel: BASE_REL,
      relType: 'SUPPORTS',
      assertion: { lifecycleState: 'approved', perspectiveTags: ['unresolved'] },
    });
    const repo = new Neo4jGraphRepository(driver as never);

    const { edges } = await repo.neighbourhood({
      organisationId: 'org-a',
      entityId: 'e1',
      canInspectGovernance: false,
    });

    expect(edges[0]?.perspectiveTags).toEqual(['unresolved']);
  });

  it('defaults canInspectGovernance to false (redacted) when the caller omits it', async () => {
    const driver = fakeNeighbourhoodDriver({
      rel: BASE_REL,
      relType: 'SUPPORTS',
      assertion: { lifecycleState: 'approved', perspectiveTags: ['community_restricted'] },
    });
    const repo = new Neo4jGraphRepository(driver as never);

    const { edges } = await repo.neighbourhood({ organisationId: 'org-a', entityId: 'e1' });

    expect(edges[0]?.perspectiveTags).toBeNull();
  });

  it('handles a relationship with no matching Assertion node gracefully (null governance, no crash)', async () => {
    const driver = fakeNeighbourhoodDriver({ rel: BASE_REL, relType: 'SUPPORTS', assertion: null });
    const repo = new Neo4jGraphRepository(driver as never);

    const { edges } = await repo.neighbourhood({
      organisationId: 'org-a',
      entityId: 'e1',
      canInspectGovernance: true,
    });

    expect(edges[0]?.lifecycleState).toBeNull();
    expect(edges[0]?.perspectiveTags).toBeNull();
  });
});

describe('Neo4jGraphRepository — invariant 4 (no tombstoned entity as an active peer)', () => {
  it('getNode only matches status = active in its Cypher pattern', async () => {
    const { driver, runCalls } = fakeDriver();
    const repo = new Neo4jGraphRepository(driver as never);
    await repo.getNode({ organisationId: ORG_A }, NODE_IN_ORG_A);

    expect(runCalls[0]?.cypher).toContain("status: 'active'");
  });

  it('neighbourhood filters both traversal endpoints to status = active in its Cypher', async () => {
    const { driver, runCalls } = fakeDriver();
    const repo = new Neo4jGraphRepository(driver as never);
    await repo.neighbourhood({ organisationId: ORG_A, entityId: NODE_IN_ORG_A });

    expect(runCalls[0]?.cypher).toContain("n.status = 'active' AND m.status = 'active'");
  });
});
