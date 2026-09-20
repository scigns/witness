/**
 * Service-level test for the propose → review → approve flow, against the
 * same in-memory Prisma double pattern as `evidence-link.service.test.ts`.
 * Covers the `entity_attribute` path end-to-end (the `relationship` path's
 * type-registration invariant is covered directly at the domain layer in
 * `packages/domain/src/knowledge-graph.invariants.test.ts`'s INV-KG-8).
 */

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
  const eventLog: Record<string, unknown>[] = [];
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
        eventLog.push({ ...data });
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

describe('KnowledgeCandidatesService', () => {
  it('proposes a candidate citing existing evidence', async () => {
    const { prisma, candidates } = fakePrisma();
    const service = new KnowledgeCandidatesService(prisma as never, {} as never);

    const view = await service.propose(
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

    expect(view.status).toBe('pending');
    expect(candidates).toHaveLength(1);
  });

  it('refuses to propose a candidate citing evidence outside the workspace', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeCandidatesService(prisma as never, {} as never);

    await expect(
      service.propose(
        ORG,
        WORKSPACE,
        {
          payload: {
            assertionType: 'entity_attribute',
            entityId: ENTITY_ID,
            attributeKey: 'role',
            attributeValue: 'x',
          },
          sourceEvidenceIds: ['99999999-9999-4999-8999-999999999999'],
        },
        CONTRIBUTOR,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to propose a candidate citing an entity from another workspace (cross-tenant guard)', async () => {
    const { prisma } = fakePrisma();
    // An entity that exists, but in a different workspace — the exact shape
    // of a cross-tenant reference: real id, wrong scope.
    (prisma as unknown as { knowledgeEntity: { findMany: unknown } }).knowledgeEntity.findMany =
      async () => [];
    const service = new KnowledgeCandidatesService(prisma as never, {} as never);

    await expect(
      service.propose(
        ORG,
        WORKSPACE,
        {
          payload: {
            assertionType: 'entity_attribute',
            entityId: '99999999-0000-4000-8000-000000000000',
            attributeKey: 'role',
            attributeValue: 'x',
          },
          sourceEvidenceIds: [EVIDENCE_ID],
        },
        CONTRIBUTOR,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to approve a relationship candidate whose endpoint entity is outside the workspace, even if it slipped past propose()', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeCandidatesService(prisma as never, {} as never);

    const candidate = await service.propose(
      ORG,
      WORKSPACE,
      {
        payload: {
          assertionType: 'entity_attribute',
          entityId: ENTITY_ID,
          attributeKey: 'role',
          attributeValue: 'x',
        },
        sourceEvidenceIds: [EVIDENCE_ID],
      },
      CONTRIBUTOR,
    );

    // Simulate a foreign-workspace entity id being smuggled in via a
    // reviewer's corrected payload at review time — the defense-in-depth
    // check inside review() must catch this independently of propose()'s.
    await expect(
      service.review(
        ORG,
        WORKSPACE,
        candidate.id,
        {
          decision: 'approved',
          correctedPayload: {
            assertionType: 'entity_attribute',
            entityId: '99999999-0000-4000-8000-000000000000',
            attributeKey: 'role',
            attributeValue: 'x',
          },
          reviewStartedAt: new Date(Date.now() - 5000).toISOString(),
        },
        REVIEWER,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('approving a candidate creates a provenance chain, an assertion, an attribute, and an outbox event — all in one pass', async () => {
    const { prisma, assertions, attributes, provenanceChains, outbox } = fakePrisma();
    const service = new KnowledgeCandidatesService(prisma as never, {} as never);

    const candidate = await service.propose(
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

    const reviewed = await service.review(
      ORG,
      WORKSPACE,
      candidate.id,
      { decision: 'approved', reviewStartedAt: new Date(Date.now() - 5000).toISOString() },
      REVIEWER,
    );

    expect(reviewed.status).toBe('confirmed');
    expect(assertions).toHaveLength(1);
    expect(attributes).toHaveLength(1);
    expect(provenanceChains).toHaveLength(1);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.['eventId']).toBeDefined();

    // The provenance chain names a human confirmer — never a model, structurally.
    expect(assertions[0]?.['lifecycleState']).toBe('evidence_reviewed');
  });

  it('refuses to review a candidate that has already been decided', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeCandidatesService(prisma as never, {} as never);

    const candidate = await service.propose(
      ORG,
      WORKSPACE,
      {
        payload: {
          assertionType: 'entity_attribute',
          entityId: ENTITY_ID,
          attributeKey: 'role',
          attributeValue: 'x',
        },
        sourceEvidenceIds: [EVIDENCE_ID],
      },
      CONTRIBUTOR,
    );
    await service.review(
      ORG,
      WORKSPACE,
      candidate.id,
      {
        decision: 'rejected',
        rationale: 'not supported',
        reviewStartedAt: new Date().toISOString(),
      },
      REVIEWER,
    );

    await expect(
      service.review(
        ORG,
        WORKSPACE,
        candidate.id,
        { decision: 'approved', reviewStartedAt: new Date().toISOString() },
        REVIEWER,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to propose a candidate citing participant-attributed evidence without knowledge-graph consent', async () => {
    const { prisma } = fakePrisma();
    const consentPolicy = {
      mayIncludeInKnowledgeGraph: async () => ({
        allowed: false,
        reason: 'This participant has not consented to knowledge-graph inclusion.',
      }),
    };
    const service = new KnowledgeCandidatesService(prisma as never, consentPolicy as never);

    // Override the fake to attribute this evidence to a real participant.
    (prisma as unknown as { evidence: { findMany: unknown } }).evidence.findMany = async () => [
      {
        id: EVIDENCE_ID,
        workspaceId: WORKSPACE,
        sessionId: 'session-1',
        sourceParticipantId: 'participant-1',
      },
    ];

    await expect(
      service.propose(
        ORG,
        WORKSPACE,
        {
          payload: {
            assertionType: 'entity_attribute',
            entityId: ENTITY_ID,
            attributeKey: 'role',
            attributeValue: 'x',
          },
          sourceEvidenceIds: [EVIDENCE_ID],
        },
        CONTRIBUTOR,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('404s reviewing a candidate that does not exist', async () => {
    const { prisma } = fakePrisma();
    const service = new KnowledgeCandidatesService(prisma as never, {} as never);

    await expect(
      service.review(
        ORG,
        WORKSPACE,
        '00000000-0000-4000-8000-000000000099',
        { decision: 'approved', reviewStartedAt: new Date().toISOString() },
        REVIEWER,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
