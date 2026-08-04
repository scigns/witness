/**
 * Tests for `ConsentPolicyService` — the reusable decision boundary a
 * future capability (Milestone 5, Structured Evidence Capture) will call.
 * These exercise the Prisma-loading half of the boundary; the pure
 * decision logic itself is covered exhaustively in
 * `packages/domain/src/consent-decision.test.ts` — these tests confirm the
 * two are wired together correctly, especially the fail-closed cases a
 * caller outside consent management will actually hit.
 */

import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import { ConsentPolicyService } from './consent-policy.service.js';

const SESSION_1 = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_1 = '22222222-2222-4222-8222-222222222222';
const ORG_1 = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_1 = '44444444-4444-4444-8444-444444444444';
const TEMPLATE_1 = '55555555-5555-4555-8555-555555555555';

function baseRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    organisationId: ORG_1,
    workspaceId: WORKSPACE_1,
    sessionId: SESSION_1,
    participantId: PARTICIPANT_1,
    consentTemplateId: TEMPLATE_1,
    templateVersion: 1,
    categoryDecisions: [
      { category: 'participation', granted: true },
      { category: 'audio_recording', granted: true },
    ],
    captureMethod: 'in-person verbal',
    language: null,
    capturedAt: new Date('2026-04-01T10:00:00Z'),
    expiresAt: null,
    amendsRecordId: null,
    supersededByRecordId: null,
    withdrawnAt: null,
    withdrawalReason: null,
    acknowledgementReference: null,
    createdAt: new Date('2026-04-01T10:00:00Z'),
    updatedAt: new Date('2026-04-01T10:00:00Z'),
    version: 1,
    ...overrides,
  };
}

function fakePrisma(records: Record<string, unknown>[], requiredCategories: string[] | null) {
  const prisma = {
    sessionConsentConfiguration: {
      findUnique: async () => (requiredCategories === null ? null : { requiredCategories }),
    },
    participantConsentRecord: {
      findMany: async () => records.map((r) => ({ ...r })),
    },
  };
  return prisma as unknown as PrismaService;
}

describe('ConsentPolicyService fail-closed', () => {
  it('mayParticipate denies when no record was ever captured', async () => {
    const service = new ConsentPolicyService(fakePrisma([], ['participation']));
    const answer = await service.mayParticipate(SESSION_1, PARTICIPANT_1);
    expect(answer.allowed).toBe(false);
  });

  it('mayParticipate denies when the session has no consent configuration at all', async () => {
    const service = new ConsentPolicyService(fakePrisma([], null));
    const answer = await service.mayParticipate(SESSION_1, PARTICIPANT_1);
    expect(answer.allowed).toBe(false);
  });

  it('mayRecordAudio denies even when the category itself was granted, if participation was refused', async () => {
    const records = [
      baseRecord({
        categoryDecisions: [
          { category: 'participation', granted: false },
          { category: 'audio_recording', granted: true },
        ],
      }),
    ];
    const service = new ConsentPolicyService(fakePrisma(records, ['participation']));
    const answer = await service.mayRecordAudio(SESSION_1, PARTICIPANT_1);
    expect(answer.allowed).toBe(false);
  });

  it('mayProcessWithAi denies once the record has been withdrawn', async () => {
    const records = [
      baseRecord({
        categoryDecisions: [
          { category: 'participation', granted: true },
          { category: 'ai_processing', granted: true },
        ],
        withdrawnAt: new Date('2026-04-01T11:00:00Z'),
      }),
    ];
    const service = new ConsentPolicyService(fakePrisma(records, ['participation']));
    const answer = await service.mayProcessWithAi(SESSION_1, PARTICIPANT_1);
    expect(answer.allowed).toBe(false);
  });

  it('mayPublish denies once the record has expired', async () => {
    const records = [
      baseRecord({
        categoryDecisions: [
          { category: 'participation', granted: true },
          { category: 'publication', granted: true },
        ],
        expiresAt: new Date('2026-04-01T10:30:00Z'),
      }),
    ];
    const service = new ConsentPolicyService(fakePrisma(records, ['participation']));
    const answer = await service.mayPublish(
      SESSION_1,
      PARTICIPANT_1,
      new Date('2026-04-01T12:00:00Z'),
    );
    expect(answer.allowed).toBe(false);
  });

  it('mayPublish denies once the record has been superseded, even though it was never withdrawn', async () => {
    const records = [baseRecord({ supersededByRecordId: '77777777-7777-4777-8777-777777777777' })];
    const service = new ConsentPolicyService(fakePrisma(records, ['participation']));
    const answer = await service.mayPublish(SESSION_1, PARTICIPANT_1);
    expect(answer.allowed).toBe(false);
  });
});

describe('ConsentPolicyService granted answers', () => {
  it('mayRecordAudio allows when both participation and the category were granted', async () => {
    const records = [baseRecord()];
    const service = new ConsentPolicyService(fakePrisma(records, ['participation']));
    const answer = await service.mayRecordAudio(SESSION_1, PARTICIPANT_1);
    expect(answer.allowed).toBe(true);
  });

  it('mayUseCategory answers for an organisation-defined category beyond the well-known fifteen', async () => {
    const records = [
      baseRecord({
        categoryDecisions: [
          { category: 'participation', granted: true },
          { category: 'custom_category', granted: true },
        ],
      }),
    ];
    const service = new ConsentPolicyService(fakePrisma(records, ['participation']));
    const answer = await service.mayUseCategory(SESSION_1, PARTICIPANT_1, 'custom_category');
    expect(answer.allowed).toBe(true);
  });
});
