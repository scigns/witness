import { describe, expect, it } from 'vitest';

import { isProjectable, removeMergedEntityNode } from './neo4j-projector.js';
import type { AssertionProjection } from './postgres-source.js';

const ENTITY = {
  id: 'e1',
  organisationId: 'org-1',
  workspaceId: 'ws-1',
  entityType: 'topic',
  topicScheme: 'general_concept',
  canonicalLabel: 'x',
  sensitivityClass: 'internal',
  status: 'active',
  ontologyVersion: '0.1.0',
  mergedIntoId: null,
};

function assertionProjection(overrides: {
  lifecycleState?: string;
  retractedAt?: string | null;
}): AssertionProjection {
  return {
    kind: 'entity_attribute',
    assertion: {
      id: 'a1',
      organisationId: 'org-1',
      workspaceId: 'ws-1',
      confidence: 1,
      sensitivityClass: 'internal',
      lifecycleState: overrides.lifecycleState ?? 'approved',
      perspectiveTags: [],
      retractedAt: overrides.retractedAt ?? null,
      provenanceChainId: 'pc1',
      sourceEvidenceIds: ['ev1'],
      extractionMethod: 'human_manual',
      extractionModel: null,
      extractionModelVersion: null,
      confirmedByDisplayName: 'A Reviewer',
      confirmedAt: '2026-09-19T00:00:00Z',
    },
    entity: ENTITY,
    attributeKey: 'role',
    attributeValue: 'Director',
  };
}

describe('isProjectable', () => {
  it.each([
    'facilitator_curated',
    'evidence_reviewed',
    'community_validated',
    'approved',
    'published',
  ])("projects an assertion in lifecycle state '%s'", (lifecycleState) => {
    expect(isProjectable(assertionProjection({ lifecycleState }))).toBe(true);
  });

  it.each(['rejected', 'superseded'])(
    "does not project an assertion in lifecycle state '%s'",
    (lifecycleState) => {
      expect(isProjectable(assertionProjection({ lifecycleState }))).toBe(false);
    },
  );

  it('does not project a retracted assertion, even in an otherwise-projectable lifecycle state', () => {
    expect(
      isProjectable(
        assertionProjection({ lifecycleState: 'published', retractedAt: '2026-09-19T00:00:00Z' }),
      ),
    ).toBe(false);
  });
});

describe('removeMergedEntityNode', () => {
  it('runs a DETACH DELETE keyed on the merged entity id, inside a write transaction', async () => {
    const calls: { cypher: string; params: Record<string, unknown> }[] = [];
    const session = {
      executeWrite: async (work: (tx: unknown) => Promise<unknown>) =>
        work({
          run: async (cypher: string, params: Record<string, unknown>) => {
            calls.push({ cypher, params });
            return { records: [] };
          },
        }),
    };

    await removeMergedEntityNode(session as never, 'merged-entity-id');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.cypher).toContain('DETACH DELETE');
    expect(calls[0]?.params['id']).toBe('merged-entity-id');
  });
});
