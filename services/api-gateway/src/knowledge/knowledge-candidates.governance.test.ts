/**
 * Governance/provenance regression tests from the Phase 3 curation
 * feature's checklist (`3K`/TESTS): a rejected or still-in-review candidate
 * must never reach the confirmed graph; a reviewer's corrected payload must
 * never overwrite what the proposer actually submitted; and disagreement
 * (contested / minority perspective) must coexist rather than collapse to
 * one tag. Same in-memory Prisma double pattern as
 * `knowledge-candidates.service.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { Principal } from '../authz/authorization.port.js';
import { KnowledgeCandidatesService } from './knowledge-candidates.service.js';

const CONTRIBUTOR: Principal = {
  subject: 'dev:contributor',
  displayName: 'A Contributor',
  kind: 'human',
  roles: ['contributor'],
};
const REVIEWER: Principal = {
  subject: 'dev:reviewer',
  displayName: 'A Reviewer',
  kind: 'human',
  roles: ['reviewer'],
};

const ORG = '00000000-0000-4000-8000-000000000000';
const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_ID = '77777777-7777-4777-8777-777777777777';
const ENTITY_ID = '88888888-8888-4888-8888-888888888888';

function fakePrisma() {
  const actors: Record<string, unknown>[] = [];
  const evidence = [{ id: EVIDENCE_ID, workspaceId: WORKSPACE }];
  const entities = [
    { id: ENTITY_ID, organisationId: ORG, workspaceId: WORKSPACE, status: 'active' },
  ];
  const candidates: Record<string, unknown>[] = [];
  const reviewDecisions: Record<string, unknown>[] = [];
  const provenanceChains: Record<string, unknown>[] = [];
  const assertions: Record<string, unknown>[] = [];
  const attributes: Record<string, unknown>[] = [];
  const outbox: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  function actorFor(kind: string, displayName: string) {
    let actor = actors.find((a) => a['kind'] === kind && a['displayName'] === displayName);
    if (actor === undefined) {
      const n = String(actors.length + 1).padStart(12, '0');
      actor = { id: `aaaaaaaa-aaaa-4aaa-8aaa-${n}`, kind, displayName };
      actors.push(actor);
    }
    return actor;
  }

  const txApi = {
    actor: {
      findFirst: async ({ where }: { where: { displayName: string; kind: string } }) => {
        const found = actors.find(
          (a) => a['displayName'] === where.displayName && a['kind'] === where.kind,
        );
        return found === undefined ? null : { ...found };
      },
      create: async ({ data }: { data: { id: string; kind: string; displayName: string } }) => {
        const created = actorFor(data.kind, data.displayName);
        return { ...created };
      },
    },
    evidence: {
      findMany: async ({ where }: { where: { id: { in: string[] }; workspaceId: string } }) =>
        evidence
          .filter((e) => where.id.in.includes(e.id) && e.workspaceId === where.workspaceId)
          .map((e) => ({ ...e, sessionId: 'session-1', sourceParticipantId: null })),
    },
    knowledgeDomain: { findFirst: async () => null, findUnique: async () => null },
    knowledgeCandidateAssertion: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        candidates.push({ ...data });
        return { ...data, proposedBy: actors.find((a) => a['id'] === data['proposedById']) };
      },
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => {
        const row = candidates.find(
          (c) => c['id'] === where.id && c['workspaceId'] === where.workspaceId,
        );
        return row === undefined
          ? null
          : { ...row, proposedBy: actors.find((a) => a['id'] === row['proposedById']) };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = candidates.findIndex((c) => c['id'] === where.id);
        candidates[idx] = { ...candidates[idx], ...data };
        return {
          ...candidates[idx],
          proposedBy: actors.find((a) => a['id'] === candidates[idx]!['proposedById']),
        };
      },
    },
    knowledgeReviewDecision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        reviewDecisions.push({ ...data });
        return { ...data };
      },
    },
    knowledgeProvenanceChain: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        provenanceChains.push({ ...data });
        return { ...data };
      },
    },
    knowledgeAssertion: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assertions.push({ ...data });
        return { ...data };
      },
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => {
        const row = assertions.find(
          (a) => a['id'] === where.id && a['workspaceId'] === where.workspaceId,
        );
        return row === undefined ? null : { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = assertions.findIndex((a) => a['id'] === where.id);
        assertions[idx] = { ...assertions[idx], ...data };
        return { ...assertions[idx] };
      },
    },
    knowledgeEntityAttribute: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        attributes.push({ ...data });
        return { ...data };
      },
    },
    knowledgeEntity: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = entities.find((e) => e.id === where.id);
        return row === undefined ? null : { ...row };
      },
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => {
        const row = entities.find((e) => e.id === where.id && e.workspaceId === where.workspaceId);
        return row === undefined ? null : { ...row };
      },
      findMany: async ({ where }: { where: { id: { in: string[] }; workspaceId: string } }) =>
        entities
          .filter((e) => where.id.in.includes(e.id) && e.workspaceId === where.workspaceId)
          .map((e) => ({ ...e })),
    },
    relationshipTypeDefinition: { findUnique: async () => null },
    eventLogEntry: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        return { ...data };
      },
    },
    outbox: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        outbox.push({ ...data });
        return { ...data };
      },
    },
    auditEvent: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push({ ...data });
        return { ...data };
      },
    },
  };

  const prisma = {
    ...txApi,
    $transaction: async (fn: (tx: typeof txApi) => Promise<unknown>) => fn(txApi),
  };

  return { prisma, candidates, assertions, attributes, provenanceChains, outbox, auditEvents };
}

async function proposeCandidate(service: KnowledgeCandidatesService) {
  return service.propose(
    ORG,
    WORKSPACE,
    {
      payload: {
        assertionType: 'entity_attribute',
        entityId: ENTITY_ID,
        attributeKey: 'role',
        attributeValue: 'Director of Housing',
      },
      sourceEvidenceIds: [EVIDENCE_ID],
    },
    CONTRIBUTOR,
  );
}

describe('governance: rejected/in-review candidates never reach the confirmed graph', () => {
  it.each([
    [
      'rejected',
      { decision: 'rejected' as const, rationale: 'Not supported by the cited evidence.' },
    ],
    [
      'clarification_requested',
      { decision: 'clarification_requested' as const, rationale: 'Which time period?' },
    ],
    [
      'returned_for_community_review',
      { decision: 'returned_for_community_review' as const, rationale: 'Needs community input.' },
    ],
  ])(
    'a %s decision creates no KnowledgeAssertion and appends no outbox event',
    async (_label, decisionInput) => {
      const { prisma, assertions, outbox } = fakePrisma();
      const service = new KnowledgeCandidatesService(prisma as never, {} as never);
      const candidate = await proposeCandidate(service);

      await service.review(
        ORG,
        WORKSPACE,
        candidate.id,
        { ...decisionInput, reviewStartedAt: new Date(Date.now() - 1000).toISOString() },
        REVIEWER,
      );

      expect(assertions).toHaveLength(0);
      expect(outbox).toHaveLength(0);
    },
  );
});

describe('provenance: a reviewer’s corrected payload never overwrites the original candidate', () => {
  it('the stored candidate keeps the proposer’s original payload after approval with a correctedPayload', async () => {
    const { prisma, candidates } = fakePrisma();
    const service = new KnowledgeCandidatesService(prisma as never, {} as never);
    const candidate = await proposeCandidate(service);
    const originalPayload = candidates[0]?.['payload'];

    await service.review(
      ORG,
      WORKSPACE,
      candidate.id,
      {
        decision: 'approved',
        correctedPayload: {
          assertionType: 'entity_attribute',
          entityId: ENTITY_ID,
          attributeKey: 'role',
          attributeValue: 'Deputy Director of Housing',
        },
        reviewStartedAt: new Date(Date.now() - 1000).toISOString(),
      },
      REVIEWER,
    );

    // The candidate row's own `payload` column is never touched by review()
    // — only `status`/`version` are updated on it. The correction lives on
    // the KnowledgeReviewDecision row instead (see the fixture's
    // `knowledgeReviewDecision.create` capturing `correctedPayload`).
    expect(candidates[0]?.['payload']).toEqual(originalPayload);
    expect((candidates[0]?.['payload'] as Record<string, unknown>)['attributeValue']).toBe(
      'Director of Housing',
    );
  });
});

describe('governance: disagreement tags coexist rather than collapsing to one', () => {
  it('contested and minority_perspective can both be attached to the same confirmed assertion', async () => {
    const { prisma, assertions } = fakePrisma();
    const service = new KnowledgeCandidatesService(prisma as never, {} as never);
    const candidate = await proposeCandidate(service);
    await service.review(
      ORG,
      WORKSPACE,
      candidate.id,
      { decision: 'approved', reviewStartedAt: new Date(Date.now() - 1000).toISOString() },
      REVIEWER,
    );
    const assertionId = assertions[0]?.['id'] as string;

    await service.addAssertionPerspectiveTag(WORKSPACE, assertionId, 'contested', REVIEWER);
    const afterSecondTag = await service.addAssertionPerspectiveTag(
      WORKSPACE,
      assertionId,
      'minority_perspective',
      REVIEWER,
    );

    // Neither tag replaced the other — disagreement is additive, and a
    // minority perspective is never silently dropped by a later action.
    expect(afterSecondTag.perspectiveTags).toEqual(
      expect.arrayContaining(['contested', 'minority_perspective']),
    );
    expect(afterSecondTag.perspectiveTags).toHaveLength(2);
  });
});
