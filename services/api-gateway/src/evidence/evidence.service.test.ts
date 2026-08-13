/**
 * Service-level tests for `EvidenceService`, against an in-memory Prisma
 * double — see `participants.service.test.ts` for why this pattern exists.
 *
 * `EvidenceService` is the first consumer of `ConsentPolicyService` outside
 * consent management itself, so these tests instantiate a real
 * `ConsentPolicyService` against the same fake Prisma double rather than
 * mocking it — the point of this milestone is that the two services agree,
 * and a mock would just assert that the mock agrees with itself.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import { EvidenceService } from './evidence.service.js';

const FACILITATOR: Principal = {
  subject: 'dev:facilitator',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const ORG_1 = '00000000-0000-4000-8000-000000000000';
const WORKSPACE_1 = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_2 = '22222222-2222-4222-8222-222222222222';
const SESSION_1 = '33333333-3333-4333-8333-333333333333';
const SESSION_2 = '39999999-9999-4999-8999-999999999999';
const PARTICIPANT_NAMED = '44444444-4444-4444-8444-444444444444';
const PARTICIPANT_ANONYMOUS = '45555555-5555-4555-8555-555555555555';
const PARTICIPANT_WITHDRAWN = '46666666-6666-4666-8666-666666666666';
const TEMPLATE_1 = '66666666-6666-4666-8666-666666666666';

function fakePolicyEnforcement(allowed: boolean): PolicyEnforcementService {
  return {
    decide: async () => ({ allowed, reason: 'test' }),
  } as unknown as PolicyEnforcementService;
}

function fakePrisma(sessionStatus = 'open') {
  const sessions: Record<string, unknown>[] = [
    { id: SESSION_1, organisationId: ORG_1, workspaceId: WORKSPACE_1, status: sessionStatus },
    { id: SESSION_2, organisationId: ORG_1, workspaceId: WORKSPACE_1, status: 'open' },
  ];
  const participants: Record<string, unknown>[] = [
    {
      id: PARTICIPANT_NAMED,
      sessionId: SESSION_1,
      workspaceId: WORKSPACE_1,
      identityMode: 'named',
      withdrawnAt: null,
    },
    {
      id: PARTICIPANT_ANONYMOUS,
      sessionId: SESSION_1,
      workspaceId: WORKSPACE_1,
      identityMode: 'anonymous',
      withdrawnAt: null,
    },
    {
      id: PARTICIPANT_WITHDRAWN,
      sessionId: SESSION_1,
      workspaceId: WORKSPACE_1,
      identityMode: 'named',
      withdrawnAt: new Date(),
    },
  ];
  const configurations: Record<string, unknown>[] = [
    {
      sessionId: SESSION_1,
      requiredCategories: ['participation'],
    },
  ];
  const consentRecords: Record<string, unknown>[] = [];
  const evidenceRows: Record<string, unknown>[] = [];
  const evidenceLinks: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    coDesignSession: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = sessions.find((s) => s['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    sessionParticipant: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = participants.find((p) => p['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    sessionConsentConfiguration: {
      findUnique: async ({ where }: { where: { sessionId: string } }) => {
        const row = configurations.find((c) => c['sessionId'] === where.sessionId);
        return row === undefined ? null : { ...row };
      },
    },
    participantConsentRecord: {
      findMany: async ({ where }: { where: { sessionId: string; participantId?: string } }) =>
        consentRecords
          .filter(
            (r) =>
              r['sessionId'] === where.sessionId &&
              (where.participantId === undefined || r['participantId'] === where.participantId),
          )
          .map((r) => ({ ...r })),
    },
    evidence: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = evidenceRows.find((e) => e['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
      findFirst: async ({
        where,
      }: {
        where: { sessionId: string; clientRequestId: string | null };
      }) => {
        const row = evidenceRows.find(
          (e) =>
            e['sessionId'] === where.sessionId && e['clientRequestId'] === where.clientRequestId,
        );
        return row === undefined ? null : { ...row };
      },
      findMany: async ({
        where,
      }: {
        where: { sessionId: string; reviewStatus?: string; evidenceType?: string };
      }) =>
        evidenceRows
          .filter(
            (e) =>
              e['sessionId'] === where.sessionId &&
              (where.reviewStatus === undefined || e['reviewStatus'] === where.reviewStatus) &&
              (where.evidenceType === undefined || e['evidenceType'] === where.evidenceType),
          )
          .map((e) => ({ ...e })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        evidenceRows.push({ ...data });
        return { ...data };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const row = evidenceRows.find(
          (e) => e['id'] === where.id && e['version'] === where.version,
        );
        if (row === undefined) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    evidenceLink: {
      findFirst: async ({
        where,
      }: {
        where: { fromEvidenceId: string; toEvidenceId: string; linkType: string };
      }) => {
        const row = evidenceLinks.find(
          (l) =>
            l['fromEvidenceId'] === where.fromEvidenceId &&
            l['toEvidenceId'] === where.toEvidenceId &&
            l['linkType'] === where.linkType,
        );
        return row === undefined ? null : { ...row };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = evidenceLinks.find((l) => l['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
      findMany: async ({
        where,
      }: {
        where: { OR: { fromEvidenceId?: string; toEvidenceId?: string }[] };
      }) =>
        evidenceLinks
          .filter((l) =>
            where.OR.some(
              (clause) =>
                (clause.fromEvidenceId !== undefined &&
                  l['fromEvidenceId'] === clause.fromEvidenceId) ||
                (clause.toEvidenceId !== undefined && l['toEvidenceId'] === clause.toEvidenceId),
            ),
          )
          .map((l) => ({ ...l, createdBy: actors.find((a) => a['id'] === l['createdById']) })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        evidenceLinks.push({ ...data });
        return { ...data };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = evidenceLinks.findIndex((l) => l['id'] === where.id);
        if (index === -1) throw new Error('link not found');
        const [removed] = evidenceLinks.splice(index, 1);
        return removed;
      },
    },
    actor: {
      findFirst: async ({ where }: { where: { displayName: string; kind: string } }) => {
        const row = actors.find(
          (a) => a['displayName'] === where.displayName && a['kind'] === where.kind,
        );
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data };
        actors.push(row);
        return row;
      },
    },
    auditEvent: {
      findFirst: async ({ where }: { where: { subjectType: string; subjectId: string } }) => {
        const matching = auditEvents.filter(
          (e) => e['subjectType'] === where.subjectType && e['subjectId'] === where.subjectId,
        );
        return matching.at(-1) ?? null;
      },
      findMany: async ({ where }: { where: { subjectType: string; subjectId: string } }) =>
        auditEvents
          .filter(
            (e) => e['subjectType'] === where.subjectType && e['subjectId'] === where.subjectId,
          )
          .map((e) => ({ ...e })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push({ ...data });
        return { ...data };
      },
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> => {
      const snapshot = {
        evidenceRows: evidenceRows.map((e) => ({ ...e })),
        evidenceLinks: evidenceLinks.map((l) => ({ ...l })),
        actors: actors.map((a) => ({ ...a })),
        auditEvents: auditEvents.map((e) => ({ ...e })),
      };
      try {
        return await fn(prisma);
      } catch (error) {
        evidenceRows.splice(0, evidenceRows.length, ...snapshot.evidenceRows);
        evidenceLinks.splice(0, evidenceLinks.length, ...snapshot.evidenceLinks);
        actors.splice(0, actors.length, ...snapshot.actors);
        auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
        throw error;
      }
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    consentRecords,
    evidenceRows,
    auditEvents,
  };
}

let consentRecordCounter = 0;

function grantParticipation(consentRecords: Record<string, unknown>[], participantId: string) {
  consentRecordCounter += 1;
  consentRecords.push({
    id: `9${String(consentRecordCounter).padStart(7, '0')}-9999-4999-8999-999999999999`,
    organisationId: ORG_1,
    workspaceId: WORKSPACE_1,
    sessionId: SESSION_1,
    participantId,
    consentTemplateId: TEMPLATE_1,
    templateVersion: 1,
    categoryDecisions: [
      { category: 'participation', granted: true },
      { category: 'attributed_quotation', granted: true },
      { category: 'anonymous_quotation', granted: false },
    ],
    captureMethod: 'in-person verbal',
    language: null,
    withdrawnAt: null,
    withdrawalReason: null,
    amendsRecordId: null,
    supersededByRecordId: null,
    acknowledgementReference: null,
    expiresAt: null,
    capturedAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
}

function captureRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    evidenceType: 'observation',
    title: 'People want more shade',
    content: 'Several participants raised the lack of shade near the fountain.',
    attributionMode: 'facilitator_observation',
    ...overrides,
  } as never;
}

function service(sessionStatus = 'open') {
  const fixture = fakePrisma(sessionStatus);
  const consentPolicy = new ConsentPolicyService(fixture.prisma);
  const evidenceService = new EvidenceService(
    fixture.prisma,
    fakePolicyEnforcement(true),
    consentPolicy,
  );
  return { ...fixture, evidenceService };
}

describe('EvidenceService.capture', () => {
  it('captures sourceless evidence with no consent lookup needed', async () => {
    const { evidenceService } = service();
    const detail = await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest(),
      FACILITATOR,
    );
    expect(detail.reviewStatus).toBe('draft');
    expect(detail.attributionMode).toBe('facilitator_observation');
  });

  // Low-connectivity Level 3 (offline contribution queue): a queued capture
  // retried after reconnect must be safe to submit twice without creating a
  // duplicate.
  it('is idempotent for a repeated clientRequestId — a retry returns the original evidence', async () => {
    const { evidenceService, evidenceRows } = service();
    const request = captureRequest({ clientRequestId: '99999999-9999-4999-8999-999999999999' });

    const first = await evidenceService.capture(WORKSPACE_1, SESSION_1, request, FACILITATOR);
    const second = await evidenceService.capture(WORKSPACE_1, SESSION_1, request, FACILITATOR);

    expect(second.id).toBe(first.id);
    expect(evidenceRows.filter((r) => r['sessionId'] === SESSION_1)).toHaveLength(1);
  });

  it('two different clientRequestIds create two distinct evidence rows', async () => {
    const { evidenceService, evidenceRows } = service();

    await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest({ clientRequestId: '11111111-9999-4999-8999-000000000001' }),
      FACILITATOR,
    );
    await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest({ clientRequestId: '22222222-9999-4999-8999-000000000002' }),
      FACILITATOR,
    );

    expect(evidenceRows.filter((r) => r['sessionId'] === SESSION_1)).toHaveLength(2);
  });

  it('captures participant-backed evidence when consent is granted, recording consentBasis', async () => {
    const { evidenceService, consentRecords } = service();
    grantParticipation(consentRecords, PARTICIPANT_NAMED);

    const detail = await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest({
        evidenceType: 'quote',
        attributionMode: 'attributed',
        sourceParticipantId: PARTICIPANT_NAMED,
      }),
      FACILITATOR,
    );

    expect(detail.attributionMode).toBe('attributed');
    // consentBasis is restricted; use the policy-allowed principal for this check.
    expect(detail.consentBasis).toEqual(['participation', 'attributed_quotation']);
  });

  it('ATTACK — fails closed when the participant has no active consent record at all', async () => {
    const { evidenceService } = service();
    await expect(
      evidenceService.capture(
        WORKSPACE_1,
        SESSION_1,
        captureRequest({ attributionMode: 'attributed', sourceParticipantId: PARTICIPANT_NAMED }),
        FACILITATOR,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ATTACK — fails closed when quotation consent is refused even though participation is granted', async () => {
    const { evidenceService, consentRecords } = service();
    grantParticipation(consentRecords, PARTICIPANT_NAMED);

    await expect(
      evidenceService.capture(
        WORKSPACE_1,
        SESSION_1,
        captureRequest({
          evidenceType: 'quote',
          attributionMode: 'anonymous',
          sourceParticipantId: PARTICIPANT_NAMED,
        }),
        FACILITATOR,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ATTACK — rejects capture while the session is not open', async () => {
    const { evidenceService } = service('draft');
    await expect(
      evidenceService.capture(WORKSPACE_1, SESSION_1, captureRequest(), FACILITATOR),
    ).rejects.toThrow(/session is open/i);
  });

  it('ATTACK — rejects a source participant who has withdrawn from the session', async () => {
    const { evidenceService, consentRecords } = service();
    grantParticipation(consentRecords, PARTICIPANT_WITHDRAWN);

    await expect(
      evidenceService.capture(
        WORKSPACE_1,
        SESSION_1,
        captureRequest({
          attributionMode: 'attributed',
          sourceParticipantId: PARTICIPANT_WITHDRAWN,
        }),
        FACILITATOR,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('ATTACK — rejects a source participant from a different workspace (IDOR)', async () => {
    const { evidenceService } = service();
    await expect(
      evidenceService.capture(
        WORKSPACE_2,
        SESSION_1,
        captureRequest({ attributionMode: 'attributed', sourceParticipantId: PARTICIPANT_NAMED }),
        FACILITATOR,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('ATTACK — rejects attributing an anonymous participant (domain half of the rule, no consent lookup needed)', async () => {
    const { evidenceService, consentRecords } = service();
    grantParticipation(consentRecords, PARTICIPANT_ANONYMOUS);

    await expect(
      evidenceService.capture(
        WORKSPACE_1,
        SESSION_1,
        captureRequest({
          attributionMode: 'attributed',
          sourceParticipantId: PARTICIPANT_ANONYMOUS,
        }),
        FACILITATOR,
      ),
    ).rejects.toThrow(/anonymous participant/i);
  });
});

describe('EvidenceService.get / list', () => {
  it('ATTACK — evidence from another session is not found (IDOR)', async () => {
    const { evidenceService } = service();
    const captured = await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest(),
      FACILITATOR,
    );

    await expect(
      evidenceService.get(WORKSPACE_1, SESSION_2, captured.id, FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });

  it('privacy projection — sourceParticipantId is present only when attribution is attributed', async () => {
    const { evidenceService, consentRecords } = service();
    grantParticipation(consentRecords, PARTICIPANT_NAMED);

    const attributed = await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest({
        evidenceType: 'quote',
        attributionMode: 'attributed',
        sourceParticipantId: PARTICIPANT_NAMED,
      }),
      FACILITATOR,
    );
    expect(attributed.sourceParticipantId).toBe(PARTICIPANT_NAMED);

    const facilitatorNote = await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest(),
      FACILITATOR,
    );
    expect(facilitatorNote.sourceParticipantId).toBeUndefined();
  });

  it('restricted fields (consentBasis, withdrawalReason) are omitted for a caller without evidence:manage_restricted', async () => {
    const fixture = fakePrisma();
    const consentPolicy = new ConsentPolicyService(fixture.prisma);
    const restrictedOff = new EvidenceService(
      fixture.prisma,
      fakePolicyEnforcement(false),
      consentPolicy,
    );

    const captured = await restrictedOff.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest(),
      FACILITATOR,
    );
    expect(captured.consentBasis).toBeUndefined();
    expect(captured.withdrawalReason).toBeUndefined();
  });
});

describe('EvidenceService.updateDraft', () => {
  it('edits a draft and bumps its version', async () => {
    const { evidenceService } = service();
    const captured = await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest(),
      FACILITATOR,
    );

    const updated = await evidenceService.updateDraft(
      WORKSPACE_1,
      SESSION_1,
      captured.id,
      { title: 'Updated title', expectedVersion: captured.version },
      FACILITATOR,
    );

    expect(updated.title).toBe('Updated title');
    expect(updated.version).toBe(captured.version + 1);
  });

  it('ATTACK — rejects a stale expectedVersion', async () => {
    const { evidenceService } = service();
    const captured = await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest(),
      FACILITATOR,
    );

    await expect(
      evidenceService.updateDraft(
        WORKSPACE_1,
        SESSION_1,
        captured.id,
        { title: 'x', expectedVersion: captured.version + 1 },
        FACILITATOR,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('ATTACK — re-checks consent when attribution changes on edit', async () => {
    const { evidenceService } = service();
    const captured = await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest(),
      FACILITATOR,
    );

    await expect(
      evidenceService.updateDraft(
        WORKSPACE_1,
        SESSION_1,
        captured.id,
        {
          attributionMode: 'attributed',
          sourceParticipantId: PARTICIPANT_NAMED,
          expectedVersion: captured.version,
        },
        FACILITATOR,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('EvidenceService.transition', () => {
  it('submits a draft', async () => {
    const { evidenceService } = service();
    const captured = await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest(),
      FACILITATOR,
    );

    const submitted = await evidenceService.transition(
      WORKSPACE_1,
      SESSION_1,
      captured.id,
      { action: 'submit', expectedVersion: captured.version },
      FACILITATOR,
    );

    expect(submitted.reviewStatus).toBe('submitted');
  });

  it('withdraws evidence with a reason', async () => {
    const { evidenceService } = service();
    const captured = await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest(),
      FACILITATOR,
    );

    const withdrawn = await evidenceService.transition(
      WORKSPACE_1,
      SESSION_1,
      captured.id,
      { action: 'withdraw', reason: 'Captured in error.', expectedVersion: captured.version },
      FACILITATOR,
    );

    expect(withdrawn.reviewStatus).toBe('withdrawn');
    expect(withdrawn.withdrawn).toBe(true);
  });

  it('ATTACK — rejects submitting evidence that was already submitted', async () => {
    const { evidenceService } = service();
    const captured = await evidenceService.capture(
      WORKSPACE_1,
      SESSION_1,
      captureRequest(),
      FACILITATOR,
    );
    const submitted = await evidenceService.transition(
      WORKSPACE_1,
      SESSION_1,
      captured.id,
      { action: 'submit', expectedVersion: captured.version },
      FACILITATOR,
    );

    await expect(
      evidenceService.transition(
        WORKSPACE_1,
        SESSION_1,
        captured.id,
        { action: 'submit', expectedVersion: submitted.version },
        FACILITATOR,
      ),
    ).rejects.toThrow(/only a draft can be submitted/i);
  });
});
