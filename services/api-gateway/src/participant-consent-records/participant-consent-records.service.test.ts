/**
 * Service-level tests for `ParticipantConsentRecordsService`, against an
 * in-memory Prisma double — see `participants.service.test.ts` for why this
 * pattern exists.
 *
 * `fakePolicyEnforcement` stands in for the real Casbin decision
 * `canSeeRestricted` makes — see that file's own comment for why this is
 * the right seam to fake at.
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { ParticipantConsentRecordsService } from './participant-consent-records.service.js';

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
const PARTICIPANT_1 = '44444444-4444-4444-8444-444444444444';
const PARTICIPANT_2 = '55555555-5555-4555-8555-555555555555';
const TEMPLATE_1 = '66666666-6666-4666-8666-666666666666';

function fakePolicyEnforcement(allowed: boolean): PolicyEnforcementService {
  return {
    decide: async () => ({ allowed, reason: 'test' }),
  } as unknown as PolicyEnforcementService;
}

function fakePrisma(hasConfiguration = true) {
  const sessions: Record<string, unknown>[] = [
    { id: SESSION_1, organisationId: ORG_1, workspaceId: WORKSPACE_1 },
  ];
  const participants: Record<string, unknown>[] = [
    {
      id: PARTICIPANT_1,
      sessionId: SESSION_1,
      workspaceId: WORKSPACE_1,
      displayName: 'Aroha Ngata',
      consentStatusSummary: 'not_configured',
    },
    {
      id: PARTICIPANT_2,
      sessionId: SESSION_1,
      workspaceId: WORKSPACE_1,
      displayName: 'Kai Anderson',
      consentStatusSummary: 'not_configured',
    },
  ];
  const configurations: Record<string, unknown>[] = hasConfiguration
    ? [
        {
          id: 'config-1',
          organisationId: ORG_1,
          workspaceId: WORKSPACE_1,
          sessionId: SESSION_1,
          consentTemplateId: TEMPLATE_1,
          templateVersion: 1,
          requiredCategories: ['participation'],
          optionalCategories: ['audio_recording'],
          facilitatorInstructions: null,
          participantIntroduction: null,
          effectiveDate: new Date(),
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
        },
      ]
    : [];
  const records: Record<string, unknown>[] = [];
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
      findMany: async ({ where }: { where: { sessionId: string } }) =>
        participants.filter((p) => p['sessionId'] === where.sessionId).map((p) => ({ ...p })),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = participants.find((p) => p['id'] === where.id);
        if (row === undefined) throw new Error('participant not found');
        Object.assign(row, data);
        return { ...row };
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
        records
          .filter(
            (r) =>
              r['sessionId'] === where.sessionId &&
              (where.participantId === undefined || r['participantId'] === where.participantId),
          )
          .map((r) => ({ ...r })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const amendsId = data['amendsRecordId'];
        if (typeof amendsId === 'string' && !records.some((r) => r['id'] === amendsId)) {
          throw new Error(
            `simulated foreign key violation: amends_record_id '${amendsId}' does not exist yet`,
          );
        }
        records.push({ ...data });
        return { ...data };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        // Mirrors the real, non-deferrable foreign key on
        // `superseded_by_record_id` — see `ParticipantConsentRecordsService.amend`'s
        // comment on why the replacement record must already exist before this
        // write can point at it. A wrong write order here reached production
        // silently once already; this check is what would have caught it.
        const supersededBy = data['supersededByRecordId'];
        if (typeof supersededBy === 'string' && !records.some((r) => r['id'] === supersededBy)) {
          throw new Error(
            `simulated foreign key violation: superseded_by_record_id '${supersededBy}' does not exist yet`,
          );
        }
        const row = records.find((r) => r['id'] === where.id && r['version'] === where.version);
        if (row === undefined) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
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
        actors.push({ ...data });
        return { ...data };
      },
    },
    auditEvent: {
      findFirst: async ({ where }: { where: { subjectType: string; subjectId: string } }) => {
        const matching = auditEvents.filter(
          (e) => e['subjectType'] === where.subjectType && e['subjectId'] === where.subjectId,
        );
        return matching.at(-1) ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push({ ...data });
        return { ...data };
      },
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> => {
      const snapshot = {
        participants: participants.map((p) => ({ ...p })),
        records: records.map((r) => ({ ...r })),
        actors: actors.map((a) => ({ ...a })),
        auditEvents: auditEvents.map((e) => ({ ...e })),
      };
      try {
        return await fn(prisma);
      } catch (error) {
        participants.splice(0, participants.length, ...snapshot.participants);
        records.splice(0, records.length, ...snapshot.records);
        actors.splice(0, actors.length, ...snapshot.actors);
        auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
        throw error;
      }
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    participants,
    records,
    auditEvents,
  };
}

function captureRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    categoryDecisions: [
      { category: 'participation', granted: true },
      { category: 'audio_recording', granted: true },
    ],
    captureMethod: 'in-person verbal',
    ...overrides,
  };
}

describe('ParticipantConsentRecordsService.capture', () => {
  it('captures full consent for a participant', async () => {
    const { prisma, auditEvents } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));

    const detail = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );

    expect(detail.status).toBe('granted');
    expect(auditEvents.some((e) => e['action'] === 'participant_consent_record.captured')).toBe(
      true,
    );
  });

  it('captures partial consent when an optional category is refused', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));

    const detail = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest({
        categoryDecisions: [
          { category: 'participation', granted: true },
          { category: 'audio_recording', granted: false },
        ],
      }),
      FACILITATOR,
    );

    expect(detail.status).toBe('partially_granted');
  });

  it('captures a refusal of the required participation category', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));

    const detail = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest({ categoryDecisions: [{ category: 'participation', granted: false }] }),
      FACILITATOR,
    );

    expect(detail.status).toBe('refused');
  });

  it('updates the participant row consentStatusSummary cache', async () => {
    const { prisma, participants } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));

    await service.capture(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR);

    const participant = participants.find((p) => p['id'] === PARTICIPANT_1)!;
    expect(participant['consentStatusSummary']).toBe('granted');
  });

  it('rejects capturing consent before the session has a consent configuration', async () => {
    const { prisma } = fakePrisma(false);
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));

    await expect(
      service.capture(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('ATTACK — rejects capturing a second active record instead of amending', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    await service.capture(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR);

    await expect(
      service.capture(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR),
    ).rejects.toThrow(ConflictException);
  });

  it('ATTACK — rejects a category decision outside the configured categories', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));

    await expect(
      service.capture(
        WORKSPACE_1,
        SESSION_1,
        PARTICIPANT_1,
        captureRequest({
          categoryDecisions: [
            { category: 'participation', granted: true },
            { category: 'video_recording', granted: true },
          ],
        }),
        FACILITATOR,
      ),
    ).rejects.toThrow();
  });
});

describe('ParticipantConsentRecordsService.amend', () => {
  it('supersedes the active record and captures a fresh one', async () => {
    const { prisma, records } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    const original = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );

    const amended = await service.amend(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest({
        categoryDecisions: [
          { category: 'participation', granted: true },
          { category: 'audio_recording', granted: false },
        ],
      }),
      FACILITATOR,
    );

    expect(amended.status).toBe('partially_granted');
    expect(amended.amendsRecordId).toBe(original.id);
    const originalRow = records.find((r) => r['id'] === original.id)!;
    expect(originalRow['supersededByRecordId']).toBe(amended.id);
  });

  it('the superseded original remains in the database unaltered apart from the supersession link', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    await service.capture(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR);

    await service.amend(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest({ categoryDecisions: [{ category: 'participation', granted: false }] }),
      FACILITATOR,
    );

    const history = await service.history(WORKSPACE_1, SESSION_1, PARTICIPANT_1, FACILITATOR);
    expect(history).toHaveLength(2);
    expect(history[0]!.status).toBe('superseded');
    expect(history[1]!.status).toBe('refused');
  });

  it('rejects amending when there is no active consent record', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));

    await expect(
      service.amend(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });

  // Regression — UAT found `amend` throwing an uncaught 500 in production: the
  // transaction pointed the old record's `supersededByRecordId` at the new
  // record's id before the new row existed, tripping the (correct,
  // non-deferrable) foreign key. `fakePrisma`'s `updateMany`/`create` above
  // now simulate that constraint, so this reproduces the failure directly
  // against the real write order rather than only against the previously
  // blind in-memory double.
  it('does not throw a foreign key violation — the replacement record is written before the old one is superseded', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    await service.capture(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR);

    await expect(
      service.amend(
        WORKSPACE_1,
        SESSION_1,
        PARTICIPANT_1,
        captureRequest({
          categoryDecisions: [
            { category: 'participation', granted: true },
            { category: 'audio_recording', granted: false },
          ],
        }),
        FACILITATOR,
      ),
    ).resolves.toBeDefined();
  });

  it('an amendment failure leaves the original consent record exactly as it was before the attempt', async () => {
    const { prisma, records } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    const original = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );
    const beforeAttempt = { ...records.find((r) => r['id'] === original.id)! };

    // A category outside the session's configured set fails domain
    // validation (`InvariantViolation`, a `DomainError`) before the
    // transaction ever opens — no write of any kind should have happened.
    await expect(
      service.amend(
        WORKSPACE_1,
        SESSION_1,
        PARTICIPANT_1,
        captureRequest({
          categoryDecisions: [{ category: 'video_recording', granted: true }],
        }),
        FACILITATOR,
      ),
    ).rejects.toThrow();

    const afterAttempt = records.find((r) => r['id'] === original.id)!;
    expect(afterAttempt).toEqual(beforeAttempt);
    expect(records).toHaveLength(1);

    const stillActive = await service.getActive(WORKSPACE_1, SESSION_1, PARTICIPANT_1, FACILITATOR);
    expect(stillActive.id).toBe(original.id);
    expect(stillActive.status).toBe('granted');
  });

  it('an amendment that fails after the replacement record is written rolls back — no orphaned record survives', async () => {
    const { prisma, records } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    const original = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );

    // Simulate a second request's amendment landing between this attempt's
    // read of `active` and its write: bump the row's version at the moment
    // the replacement record is created (which now happens first), so the
    // `updateMany` that follows — matching on the version this attempt
    // originally read — finds no row and hits its STALE_VERSION guard.
    const realCreate = prisma.participantConsentRecord.create;
    prisma.participantConsentRecord.create = (async (args: { data: Record<string, unknown> }) => {
      const row = records.find((r) => r['id'] === original.id)!;
      row['version'] = (row['version'] as number) + 1;
      return realCreate(args);
    }) as typeof realCreate;

    await expect(
      service.amend(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR),
    ).rejects.toThrow(ConflictException);

    // The transaction's catch-and-rollback (see `fakePrisma`'s `$transaction`)
    // must discard the replacement record created earlier in the same
    // attempt — the participant must not end up with two live-looking rows.
    expect(records).toHaveLength(1);
  });
});

describe('ParticipantConsentRecordsService.withdraw', () => {
  it('withdraws the active record with a reason', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    const captured = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );

    const withdrawn = await service.withdraw(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      { reason: 'Changed their mind', expectedVersion: captured.version },
      FACILITATOR,
    );

    expect(withdrawn.status).toBe('withdrawn');
    expect(withdrawn.withdrawnAt).not.toBeNull();
  });

  it('updates consentStatusSummary to withdrawn', async () => {
    const { prisma, participants } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    const captured = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );
    await service.withdraw(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      { expectedVersion: captured.version },
      FACILITATOR,
    );

    const participant = participants.find((p) => p['id'] === PARTICIPANT_1)!;
    expect(participant['consentStatusSummary']).toBe('withdrawn');
  });

  it('ATTACK — rejects withdrawing with a stale expectedVersion', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    const captured = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );

    await expect(
      service.withdraw(
        WORKSPACE_1,
        SESSION_1,
        PARTICIPANT_1,
        { expectedVersion: captured.version + 1 },
        FACILITATOR,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects withdrawing when there is no active consent record', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));

    await expect(
      service.withdraw(WORKSPACE_1, SESSION_1, PARTICIPANT_1, { expectedVersion: 1 }, FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });

  it('there is no restore — re-granting after withdrawal requires a fresh capture', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    const captured = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );
    await service.withdraw(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      { expectedVersion: captured.version },
      FACILITATOR,
    );

    const fresh = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );

    expect(fresh.status).toBe('granted');
    expect(fresh.withdrawnAt).toBeNull();
  });
});

describe('ParticipantConsentRecordsService privacy', () => {
  it('omits categoryDecisions and withdrawalReason for a caller without manage_restricted', async () => {
    const { prisma } = fakePrisma();
    const writer = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    const captured = await writer.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );
    await writer.withdraw(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      { reason: 'Sensitive reason', expectedVersion: captured.version },
      FACILITATOR,
    );

    const reader = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(false));
    const active = await reader.history(WORKSPACE_1, SESSION_1, PARTICIPANT_1, FACILITATOR);

    for (const record of active) {
      expect(record).not.toHaveProperty('categoryDecisions');
      expect(record).not.toHaveProperty('withdrawalReason');
    }
  });

  it('includes categoryDecisions and withdrawalReason for a caller with manage_restricted', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    const captured = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );
    const withdrawn = await service.withdraw(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      { reason: 'Full detail visible', expectedVersion: captured.version },
      FACILITATOR,
    );

    expect(withdrawn.categoryDecisions).toBeDefined();
    expect(withdrawn.withdrawalReason).toBe('Full detail visible');
  });
});

describe('ParticipantConsentRecordsService cross-scope isolation', () => {
  it('ATTACK — a participant consent record cannot be read through a workspace it does not belong to', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    await service.capture(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR);

    await expect(
      service.getActive(WORKSPACE_2, SESSION_1, PARTICIPANT_1, FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });

  it('ATTACK — an unrelated participant has no active consent leaking from another participant', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    await service.capture(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR);

    await expect(
      service.getActive(WORKSPACE_1, SESSION_1, PARTICIPANT_2, FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ParticipantConsentRecordsService.getActive fail-closed', () => {
  it('404s when no consent record has ever been captured', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));

    await expect(
      service.getActive(WORKSPACE_1, SESSION_1, PARTICIPANT_1, FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });

  it('404s once the only record has been withdrawn — a withdrawn record is never active', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    const captured = await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest(),
      FACILITATOR,
    );
    await service.withdraw(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      { expectedVersion: captured.version },
      FACILITATOR,
    );

    await expect(
      service.getActive(WORKSPACE_1, SESSION_1, PARTICIPANT_1, FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });

  it('404s once the record has expired', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    await service.capture(
      WORKSPACE_1,
      SESSION_1,
      PARTICIPANT_1,
      captureRequest({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      FACILITATOR,
    );

    await expect(
      service.getActive(WORKSPACE_1, SESSION_1, PARTICIPANT_1, FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ParticipantConsentRecordsService.dashboard', () => {
  it('summarises every participant in the session, including those with no consent yet', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    await service.capture(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR);

    const dashboard = await service.dashboard(WORKSPACE_1, SESSION_1, FACILITATOR);

    expect(dashboard.participants).toHaveLength(2);
    const p1 = dashboard.participants.find((p) => p.participantId === PARTICIPANT_1)!;
    const p2 = dashboard.participants.find((p) => p.participantId === PARTICIPANT_2)!;
    expect(p1.status).toBe('granted');
    expect(p2.status).toBe('not_requested');
  });

  it('reports not_configured when the session has no consent configuration at all', async () => {
    const { prisma } = fakePrisma(false);
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));

    const dashboard = await service.dashboard(WORKSPACE_1, SESSION_1, FACILITATOR);

    expect(dashboard.configuration).toBeNull();
    expect(dashboard.participants.every((p) => p.status === 'not_configured')).toBe(true);
  });

  // Backs the consent matrix (Professional Product Experience pass) — the
  // matrix needs per-category decisions, not just the rolled-up status this
  // endpoint used to return. Gated on the same `manage_restricted` check as
  // `ParticipantConsentRecordDetail.categoryDecisions`, not a new privacy rule.
  it('includes per-category decisions for a caller with manage_restricted', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(true));
    await service.capture(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR);

    const dashboard = await service.dashboard(WORKSPACE_1, SESSION_1, FACILITATOR);

    const p1 = dashboard.participants.find((p) => p.participantId === PARTICIPANT_1)!;
    const p2 = dashboard.participants.find((p) => p.participantId === PARTICIPANT_2)!;
    expect(p1.categoryDecisions).toEqual([
      { category: 'participation', granted: true },
      { category: 'audio_recording', granted: true },
    ]);
    // No active record — nothing to report decisions for, even though the
    // caller can see restricted fields.
    expect(p2.categoryDecisions).toBeUndefined();
  });

  it('omits per-category decisions for a caller without manage_restricted', async () => {
    const { prisma } = fakePrisma();
    const service = new ParticipantConsentRecordsService(prisma, fakePolicyEnforcement(false));
    await service.capture(WORKSPACE_1, SESSION_1, PARTICIPANT_1, captureRequest(), FACILITATOR);

    const dashboard = await service.dashboard(WORKSPACE_1, SESSION_1, FACILITATOR);

    const p1 = dashboard.participants.find((p) => p.participantId === PARTICIPANT_1)!;
    expect(p1.categoryDecisions).toBeUndefined();
  });
});
