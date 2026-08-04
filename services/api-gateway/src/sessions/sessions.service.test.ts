/**
 * Service-level tests for `SessionsService`, against an in-memory Prisma
 * double — see `users.service.test.ts` for why this pattern exists in this
 * capability (no live Postgres was available while building it).
 *
 * The optimistic-concurrency tests are the actual adversarial case
 * `expectedVersion` exists to stop: a client acting on a session it read
 * before someone else changed it must be rejected, not silently overwrite
 * the change it never saw.
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DomainError } from '@witness/domain';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { SessionsService } from './sessions.service.js';

const FACILITATOR: Principal = {
  subject: 'dev:facilitator',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const ORG_1 = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_1 = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_2 = '33333333-3333-4333-8333-333333333333';
const USER_1 = '44444444-4444-4444-8444-444444444444';
const USER_2 = '55555555-5555-4555-8555-555555555555';

function fakePrisma() {
  const workspaces: Record<string, unknown>[] = [
    { id: WORKSPACE_1, organisationId: ORG_1 },
    { id: WORKSPACE_2, organisationId: ORG_1 },
  ];
  const users: Record<string, unknown>[] = [{ id: USER_1 }, { id: USER_2 }];
  const sessions: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = workspaces.find((w) => w['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = users.find((u) => u['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    coDesignSession: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = sessions.find((s) => s['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
      findMany: async ({ where }: { where: { workspaceId: string } }) =>
        sessions.filter((s) => s['workspaceId'] === where.workspaceId).map((s) => ({ ...s })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        sessions.push({ ...data });
        return { ...data };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const row = sessions.find((s) => s['id'] === where.id && s['version'] === where.version);
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
      findMany: async ({ where }: { where: { subjectType: string; subjectId: string } }) =>
        auditEvents
          .filter(
            (e) => e['subjectType'] === where.subjectType && e['subjectId'] === where.subjectId,
          )
          .map((e) => ({ ...e, actor: actors.find((a) => a['id'] === e['actorId']) })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push({ ...data });
        return { ...data };
      },
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>) => fn(prisma),
  };

  return { prisma: prisma as unknown as PrismaService, sessions, auditEvents };
}

function createRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: 'Water access co-design workshop',
    purpose: 'Agree priorities for the next bore maintenance cycle.',
    sessionType: 'co_design_workshop',
    deliveryMode: 'in_person' as const,
    primaryFacilitatorId: USER_1,
    ...overrides,
  };
}

describe('SessionsService.create', () => {
  it('creates a session as a draft and records the audit event', async () => {
    const { prisma, auditEvents } = fakePrisma();
    const service = new SessionsService(prisma);

    const detail = await service.create(WORKSPACE_1, createRequest(), FACILITATOR);

    expect(detail.status).toBe('draft');
    expect(detail.organisationId).toBe(ORG_1);
    expect(detail.workspaceId).toBe(WORKSPACE_1);
    expect(detail.version).toBe(1);
    expect(detail.canCaptureEvidence).toBe(false);
    expect(auditEvents.some((e) => e['action'] === 'co_design_session.created')).toBe(true);
  });

  it('rejects creating a session in a workspace that does not exist', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);

    await expect(service.create('ghost-workspace', createRequest(), FACILITATOR)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects creating a session with a facilitator that does not exist', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);

    await expect(
      service.create(
        WORKSPACE_1,
        createRequest({ primaryFacilitatorId: 'ghost-user' }),
        FACILITATOR,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an empty title via the domain invariant — the controller translates this to a 400, this test is below that boundary', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);

    await expect(
      service.create(WORKSPACE_1, createRequest({ title: '' }), FACILITATOR),
    ).rejects.toThrow(DomainError);
  });
});

describe('SessionsService list and get scoping', () => {
  it('lists only sessions in the requested workspace', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);

    await service.create(WORKSPACE_1, createRequest({ title: 'In workspace 1' }), FACILITATOR);
    await service.create(WORKSPACE_2, createRequest({ title: 'In workspace 2' }), FACILITATOR);

    const list1 = await service.list(WORKSPACE_1);
    const list2 = await service.list(WORKSPACE_2);

    expect(list1.map((s) => s.title)).toEqual(['In workspace 1']);
    expect(list2.map((s) => s.title)).toEqual(['In workspace 2']);
  });

  it('ATTACK — a session cannot be read through a workspace it does not belong to', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);

    const created = await service.create(WORKSPACE_1, createRequest(), FACILITATOR);

    await expect(service.get(WORKSPACE_2, created.id)).rejects.toThrow(NotFoundException);
  });
});

describe('SessionsService lifecycle transitions', () => {
  it('schedules, opens, closes, and archives a session end to end', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);

    const created = await service.create(WORKSPACE_1, createRequest(), FACILITATOR);

    const scheduled = await service.transition(
      WORKSPACE_1,
      created.id,
      {
        action: 'schedule',
        startAt: '2026-04-01T09:00:00Z',
        expectedVersion: created.version,
      },
      FACILITATOR,
    );
    expect(scheduled.status).toBe('scheduled');

    const opened = await service.transition(
      WORKSPACE_1,
      created.id,
      { action: 'open', expectedVersion: scheduled.version },
      FACILITATOR,
    );
    expect(opened.status).toBe('open');
    expect(opened.canCaptureEvidence).toBe(true);

    const closed = await service.transition(
      WORKSPACE_1,
      created.id,
      { action: 'close', expectedVersion: opened.version },
      FACILITATOR,
    );
    expect(closed.status).toBe('closed');
    expect(closed.canCaptureEvidence).toBe(false);

    const archived = await service.transition(
      WORKSPACE_1,
      created.id,
      { action: 'archive', expectedVersion: closed.version },
      FACILITATOR,
    );
    expect(archived.status).toBe('archived');
    expect(archived.permittedTransitions).toEqual([]);
  });

  it('reopens a closed session with a reason', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);

    const created = await service.create(WORKSPACE_1, createRequest(), FACILITATOR);
    const opened = await service.transition(
      WORKSPACE_1,
      created.id,
      { action: 'open', expectedVersion: created.version },
      FACILITATOR,
    );
    const closed = await service.transition(
      WORKSPACE_1,
      created.id,
      { action: 'close', expectedVersion: opened.version },
      FACILITATOR,
    );

    const reopened = await service.transition(
      WORKSPACE_1,
      created.id,
      { action: 'reopen', reason: 'Unresolved agenda item.', expectedVersion: closed.version },
      FACILITATOR,
    );

    expect(reopened.status).toBe('open');
    expect(reopened.closedAt).toBeNull();
  });

  it('ATTACK — rejects an invalid transition (draft straight to closed)', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);
    const created = await service.create(WORKSPACE_1, createRequest(), FACILITATOR);

    await expect(
      service.transition(
        WORKSPACE_1,
        created.id,
        { action: 'close', expectedVersion: created.version },
        FACILITATOR,
      ),
    ).rejects.toThrow(DomainError);
  });

  it('ATTACK — an archived session rejects every further transition and update', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);
    const created = await service.create(WORKSPACE_1, createRequest(), FACILITATOR);
    const opened = await service.transition(
      WORKSPACE_1,
      created.id,
      { action: 'open', expectedVersion: created.version },
      FACILITATOR,
    );
    const closed = await service.transition(
      WORKSPACE_1,
      created.id,
      { action: 'close', expectedVersion: opened.version },
      FACILITATOR,
    );
    const archived = await service.transition(
      WORKSPACE_1,
      created.id,
      { action: 'archive', expectedVersion: closed.version },
      FACILITATOR,
    );

    await expect(
      service.update(
        WORKSPACE_1,
        created.id,
        { title: 'New title', expectedVersion: archived.version },
        FACILITATOR,
      ),
    ).rejects.toThrow(DomainError);
  });
});

describe('SessionsService optimistic concurrency', () => {
  it('rejects an update carrying a stale expectedVersion, even though nothing else has since changed', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);
    const created = await service.create(WORKSPACE_1, createRequest(), FACILITATOR);

    await expect(
      service.update(
        WORKSPACE_1,
        created.id,
        { title: 'New title', expectedVersion: created.version + 1 },
        FACILITATOR,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('ATTACK — a second writer using the version the first writer already consumed is rejected', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);
    const created = await service.create(WORKSPACE_1, createRequest(), FACILITATOR);

    await service.update(
      WORKSPACE_1,
      created.id,
      { title: 'Writer A', expectedVersion: created.version },
      FACILITATOR,
    );

    await expect(
      service.update(
        WORKSPACE_1,
        created.id,
        { title: 'Writer B', expectedVersion: created.version },
        FACILITATOR,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('applies a detail change and a facilitator change in one call as two chained, version-checked writes', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);
    const created = await service.create(WORKSPACE_1, createRequest(), FACILITATOR);

    const updated = await service.update(
      WORKSPACE_1,
      created.id,
      { title: 'Renamed', primaryFacilitatorId: USER_2, expectedVersion: created.version },
      FACILITATOR,
    );

    expect(updated.title).toBe('Renamed');
    expect(updated.primaryFacilitatorId).toBe(USER_2);
    expect(updated.version).toBe(created.version + 2);
  });

  it('rejects an update with no fields changed', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);
    const created = await service.create(WORKSPACE_1, createRequest(), FACILITATOR);

    await expect(
      service.update(WORKSPACE_1, created.id, { expectedVersion: created.version }, FACILITATOR),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('SessionsService.history', () => {
  it('returns only lifecycle events, in order, for the session', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionsService(prisma);
    const created = await service.create(WORKSPACE_1, createRequest(), FACILITATOR);
    await service.update(
      WORKSPACE_1,
      created.id,
      { title: 'Renamed', expectedVersion: created.version },
      FACILITATOR,
    );
    await service.transition(
      WORKSPACE_1,
      created.id,
      { action: 'open', expectedVersion: created.version + 1 },
      FACILITATOR,
    );

    const history = await service.history(WORKSPACE_1, created.id);

    // 'co_design_session.updated' (the rename) is excluded — only lifecycle
    // transitions count as history, not every material field change.
    expect(history.map((e) => e.action)).toEqual([
      'co_design_session.created',
      'co_design_session.opened',
    ]);
  });
});
