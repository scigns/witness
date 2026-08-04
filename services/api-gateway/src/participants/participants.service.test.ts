/**
 * Service-level tests for `ParticipantsService`, against an in-memory Prisma
 * double — see `sessions.service.test.ts` for why this pattern exists (no
 * live Postgres was available while building this capability).
 *
 * `fakePolicyEnforcement` stands in for the real Casbin decision
 * `canSeeRestricted` makes: tests that care about redaction construct it
 * with the tier they want to exercise, so the privacy assertions below are
 * checking the service's own redaction logic, not re-testing Casbin itself
 * (that is `policy-engine.service.test.ts`'s job).
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { DomainError } from '@witness/domain';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { ParticipantsService } from './participants.service.js';

const FACILITATOR: Principal = {
  subject: 'dev:facilitator',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const ORG_1 = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_1 = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_2 = '33333333-3333-4333-8333-333333333333';
const SESSION_1 = '44444444-4444-4444-8444-444444444444';
const SESSION_2 = '55555555-5555-4555-8555-555555555555';
const USER_1 = '66666666-6666-4666-8666-666666666666';

function fakePolicyEnforcement(allowed: boolean): PolicyEnforcementService {
  return {
    decide: async () => ({ allowed, reason: 'test' }),
  } as unknown as PolicyEnforcementService;
}

function fakePrisma(sessionStatus = 'draft') {
  const sessions: Record<string, unknown>[] = [
    { id: SESSION_1, organisationId: ORG_1, workspaceId: WORKSPACE_1, status: sessionStatus },
    { id: SESSION_2, organisationId: ORG_1, workspaceId: WORKSPACE_1, status: sessionStatus },
  ];
  const participants: Record<string, unknown>[] = [];
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
      create: async ({ data }: { data: Record<string, unknown> }) => {
        participants.push({ ...data });
        return { ...data };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const row = participants.find(
          (p) => p['id'] === where.id && p['version'] === where.version,
        );
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
      findMany: async ({
        where,
      }: {
        where: { subjectType: string; subjectId: string; action?: { in: readonly string[] } };
      }) =>
        auditEvents
          .filter(
            (e) =>
              e['subjectType'] === where.subjectType &&
              e['subjectId'] === where.subjectId &&
              (where.action === undefined || where.action.in.includes(e['action'] as string)),
          )
          .map((e) => ({ ...e, actor: actors.find((a) => a['id'] === e['actorId']) })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push({ ...data });
        return { ...data };
      },
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> => {
      const snapshot = {
        participants: participants.map((p) => ({ ...p })),
        actors: actors.map((a) => ({ ...a })),
        auditEvents: auditEvents.map((e) => ({ ...e })),
      };

      try {
        return await fn(prisma);
      } catch (error) {
        participants.splice(0, participants.length, ...snapshot.participants);
        actors.splice(0, actors.length, ...snapshot.actors);
        auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
        throw error;
      }
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    sessions,
    participants,
    auditEvents,
  };
}

function addRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    displayName: 'Aroha Ngata',
    participantType: 'community_representative',
    participationMode: 'in_person' as const,
    identityMode: 'named' as const,
    ...overrides,
  };
}

describe('ParticipantsService.add', () => {
  it('adds a named participant to a draft session', async () => {
    const { prisma, auditEvents } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));

    const detail = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);

    expect(detail.displayName).toBe('Aroha Ngata');
    expect(detail.identityMode).toBe('named');
    expect(detail.invitationStatus).toBe('not_invited');
    expect(auditEvents.some((e) => e['action'] === 'session_participant.added')).toBe(true);
  });

  it('adds a pseudonymous participant with an internally-retained linked user', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));

    const detail = await service.add(
      WORKSPACE_1,
      SESSION_1,
      addRequest({ identityMode: 'pseudonymous', displayName: 'River', linkedUserId: USER_1 }),
      FACILITATOR,
    );

    expect(detail.displayName).toBe('River');
    expect(detail.linkedUserId).toBe(USER_1);
  });

  it('adds an anonymous participant with no identifying fields', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));

    const detail = await service.add(
      WORKSPACE_1,
      SESSION_1,
      addRequest({ identityMode: 'anonymous', displayName: 'Ignored', pronouns: 'they/them' }),
      FACILITATOR,
    );

    expect(detail.displayName).toBe('Anonymous participant');
    expect(detail.pronouns).toBeNull();
  });

  it('adds a non-registered participant (no linkedUserId)', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));

    const detail = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);

    expect(detail.linkedUserId).toBeNull();
  });

  it('rejects adding a participant to a session that does not exist', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));

    await expect(
      service.add(WORKSPACE_1, 'ghost-session', addRequest(), FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });

  it('ATTACK — rejects adding a participant to a closed session', async () => {
    const { prisma } = fakePrisma('closed');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));

    await expect(service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR)).rejects.toThrow(
      DomainError,
    );
  });

  it('ATTACK — rejects adding a participant to an archived session', async () => {
    const { prisma } = fakePrisma('archived');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));

    await expect(service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR)).rejects.toThrow(
      DomainError,
    );
  });
});

describe('ParticipantsService privacy-safe list projection', () => {
  it('redacts a facilitators_only participant for a caller without restricted access', async () => {
    const { prisma } = fakePrisma('draft');
    const writer = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    await writer.add(
      WORKSPACE_1,
      SESSION_1,
      addRequest({ identityVisibility: 'facilitators_only', affiliation: 'Community council' }),
      FACILITATOR,
    );

    const reader = new ParticipantsService(prisma, fakePolicyEnforcement(false));
    const [summary] = await reader.list(WORKSPACE_1, SESSION_1, FACILITATOR);

    expect(summary!.displayName).toBe('Restricted participant');
    expect(summary!.affiliation).toBeNull();
  });

  it('shows a facilitators_only participant in full to a caller with restricted access', async () => {
    const { prisma } = fakePrisma('draft');
    const writer = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    await writer.add(
      WORKSPACE_1,
      SESSION_1,
      addRequest({ identityVisibility: 'facilitators_only', affiliation: 'Community council' }),
      FACILITATOR,
    );

    const [summary] = await writer.list(WORKSPACE_1, SESSION_1, FACILITATOR);

    expect(summary!.displayName).toBe('Aroha Ngata');
    expect(summary!.affiliation).toBe('Community council');
  });

  it('never includes facilitatorNotes or linkedUserId in the list projection, regardless of caller tier', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    await service.add(WORKSPACE_1, SESSION_1, addRequest({ linkedUserId: USER_1 }), FACILITATOR);

    const [summary] = await service.list(WORKSPACE_1, SESSION_1, FACILITATOR);

    expect(summary).not.toHaveProperty('linkedUserId');
    expect(summary).not.toHaveProperty('facilitatorNotes');
  });

  it('ATTACK — facilitatorNotes is absent from the detail view for a caller without restricted access', async () => {
    const { prisma } = fakePrisma('draft');
    const privileged = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await privileged.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);
    await privileged.updateNotes(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { facilitatorNotes: 'Sensitive note', expectedVersion: created.version },
      FACILITATOR,
    );

    const unprivileged = new ParticipantsService(prisma, fakePolicyEnforcement(false));
    const detail = await unprivileged.get(WORKSPACE_1, SESSION_1, created.id, FACILITATOR);

    expect(detail).not.toHaveProperty('facilitatorNotes');
  });

  it('a pseudonymous participant does not expose linkedUserId to a caller without restricted access', async () => {
    const { prisma } = fakePrisma('draft');
    const privileged = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await privileged.add(
      WORKSPACE_1,
      SESSION_1,
      addRequest({ identityMode: 'pseudonymous', displayName: 'River', linkedUserId: USER_1 }),
      FACILITATOR,
    );

    const unprivileged = new ParticipantsService(prisma, fakePolicyEnforcement(false));
    const detail = await unprivileged.get(WORKSPACE_1, SESSION_1, created.id, FACILITATOR);

    expect(detail).not.toHaveProperty('linkedUserId');
  });

  it('a named participant exposes linkedUserId even to a caller without restricted access', async () => {
    const { prisma } = fakePrisma('draft');
    const privileged = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await privileged.add(
      WORKSPACE_1,
      SESSION_1,
      addRequest({ linkedUserId: USER_1 }),
      FACILITATOR,
    );

    const unprivileged = new ParticipantsService(prisma, fakePolicyEnforcement(false));
    const detail = await unprivileged.get(WORKSPACE_1, SESSION_1, created.id, FACILITATOR);

    expect(detail.linkedUserId).toBe(USER_1);
  });

  it('export is redacted even for a caller who could otherwise see restricted fields', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    await service.add(
      WORKSPACE_1,
      SESSION_1,
      addRequest({ identityVisibility: 'facilitators_only' }),
      FACILITATOR,
    );

    const [exported] = await service.exportRedacted(WORKSPACE_1, SESSION_1);

    expect(exported!.displayName).toBe('Restricted participant');
    expect(exported).not.toHaveProperty('linkedUserId');
    expect(exported).not.toHaveProperty('facilitatorNotes');
  });

  it('ATTACK — a caller without restricted access does not receive languagePreference or accessibilityRequirements for a facilitators_only participant', async () => {
    const { prisma } = fakePrisma('draft');
    const privileged = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await privileged.add(
      WORKSPACE_1,
      SESSION_1,
      addRequest({
        identityVisibility: 'facilitators_only',
        languagePreference: 'Samoan',
        accessibilityRequirements: 'Wheelchair access required.',
      }),
      FACILITATOR,
    );

    const unprivileged = new ParticipantsService(prisma, fakePolicyEnforcement(false));
    const detail = await unprivileged.get(WORKSPACE_1, SESSION_1, created.id, FACILITATOR);

    expect(detail.languagePreference).toBeNull();
    expect(detail.accessibilityRequirements).toBeNull();
  });

  it('a caller with restricted access still receives languagePreference and accessibilityRequirements', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await service.add(
      WORKSPACE_1,
      SESSION_1,
      addRequest({
        identityVisibility: 'facilitators_only',
        languagePreference: 'Samoan',
        accessibilityRequirements: 'Wheelchair access required.',
      }),
      FACILITATOR,
    );

    const detail = await service.get(WORKSPACE_1, SESSION_1, created.id, FACILITATOR);

    expect(detail.languagePreference).toBe('Samoan');
    expect(detail.accessibilityRequirements).toBe('Wheelchair access required.');
  });
});

describe('ParticipantsService cross-scope isolation', () => {
  it('ATTACK — a participant cannot be read through a session it does not belong to', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);

    await expect(service.get(WORKSPACE_1, SESSION_2, created.id, FACILITATOR)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('ATTACK — a participant cannot be read through a workspace it does not belong to', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);

    await expect(service.get(WORKSPACE_2, SESSION_1, created.id, FACILITATOR)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ParticipantsService lifecycle transitions', () => {
  it('walks a participant through invitation not_invited -> invited -> accepted', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);

    const invited = await service.transition(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { action: 'invite', expectedVersion: created.version },
      FACILITATOR,
    );
    expect(invited.invitationStatus).toBe('invited');

    const accepted = await service.transition(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { action: 'accept_invitation', expectedVersion: invited.version },
      FACILITATOR,
    );
    expect(accepted.invitationStatus).toBe('accepted');
  });

  it('records attendance while the session is open', async () => {
    const { prisma } = fakePrisma('open');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);

    const attended = await service.transition(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { action: 'record_attendance', status: 'present', expectedVersion: created.version },
      FACILITATOR,
    );

    expect(attended.attendanceStatus).toBe('present');
  });

  it('ATTACK — rejects recording attendance while the session is still a draft', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);

    await expect(
      service.transition(
        WORKSPACE_1,
        SESSION_1,
        created.id,
        { action: 'record_attendance', status: 'present', expectedVersion: created.version },
        FACILITATOR,
      ),
    ).rejects.toThrow(DomainError);
  });

  it('withdraws and restores a participant', async () => {
    const { prisma } = fakePrisma('open');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);

    const withdrawn = await service.transition(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { action: 'withdraw', reason: 'Requested', expectedVersion: created.version },
      FACILITATOR,
    );
    expect(withdrawn.withdrawnAt).not.toBeNull();

    const restored = await service.transition(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { action: 'restore', expectedVersion: withdrawn.version },
      FACILITATOR,
    );
    expect(restored.withdrawnAt).toBeNull();
  });

  it('ATTACK — an archived session rejects every further participant transition and update', async () => {
    const { prisma, sessions } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);

    const session = sessions.find((s) => s['id'] === SESSION_1)!;
    session['status'] = 'archived';

    await expect(
      service.update(
        WORKSPACE_1,
        SESSION_1,
        created.id,
        { affiliation: 'New', expectedVersion: created.version },
        FACILITATOR,
      ),
    ).rejects.toThrow(DomainError);

    await expect(
      service.transition(
        WORKSPACE_1,
        SESSION_1,
        created.id,
        { action: 'withdraw', expectedVersion: created.version },
        FACILITATOR,
      ),
    ).rejects.toThrow(DomainError);
  });
});

describe('ParticipantsService optimistic concurrency', () => {
  it('rejects an update carrying a stale expectedVersion', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);

    await expect(
      service.update(
        WORKSPACE_1,
        SESSION_1,
        created.id,
        { affiliation: 'New', expectedVersion: created.version + 1 },
        FACILITATOR,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('ATTACK — a second writer using the version the first writer already consumed is rejected', async () => {
    const { prisma } = fakePrisma('draft');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);

    await service.update(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { affiliation: 'Writer A', expectedVersion: created.version },
      FACILITATOR,
    );

    await expect(
      service.update(
        WORKSPACE_1,
        SESSION_1,
        created.id,
        { affiliation: 'Writer B', expectedVersion: created.version },
        FACILITATOR,
      ),
    ).rejects.toThrow(ConflictException);
  });
});

describe('ParticipantsService.history', () => {
  it('returns only lifecycle events, in order, excluding ordinary detail updates', async () => {
    const { prisma } = fakePrisma('open');
    const service = new ParticipantsService(prisma, fakePolicyEnforcement(true));
    const created = await service.add(WORKSPACE_1, SESSION_1, addRequest(), FACILITATOR);
    await service.update(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { affiliation: 'Renamed', expectedVersion: created.version },
      FACILITATOR,
    );
    await service.transition(
      WORKSPACE_1,
      SESSION_1,
      created.id,
      { action: 'withdraw', expectedVersion: created.version + 1 },
      FACILITATOR,
    );

    const history = await service.history(WORKSPACE_1, SESSION_1, created.id);

    expect(history.map((e) => e.action)).toEqual([
      'session_participant.added',
      'session_participant.withdrawn',
    ]);
  });
});
