/**
 * `WorkspacesService.list` is a visibility boundary, not just a convenience
 * filter — a real session must only see workspaces it can reach: a direct
 * workspace membership, or membership in the workspace's parent
 * organisation (Milestone 1.4, Authorisation hardening; mirrors the
 * cascade in `RoleResolutionService`). The unverified `X-Witness-Dev-User`
 * path is untouched — see `organisations.service.test.ts` for why.
 */

import { ConflictException } from '@nestjs/common';
import { DomainError } from '@witness/domain';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { WorkspacesService } from './workspaces.service.js';

const ORG_1 = '11111111-1111-4111-8111-111111111111';
const ORG_2 = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_1 = '44444444-4444-4444-8444-444444444444';
const WORKSPACE_2 = '55555555-5555-4555-8555-555555555555';
const WORKSPACE_3 = '66666666-6666-4666-8666-666666666666';
const USER_1 = '33333333-3333-4333-8333-333333333333';

const SESSION_PRINCIPAL: Principal = {
  subject: `user:${USER_1}`,
  displayName: 'Real Session User',
  kind: 'human',
  roles: [],
};

const DEV_PRINCIPAL: Principal = {
  subject: 'dev:Local Dev',
  displayName: 'Local Dev',
  kind: 'human',
  roles: ['admin'],
};

function fakePrisma(options: {
  workspaces: { id: string; name: string; organisationId: string }[];
  workspaceMemberships?: { workspaceId: string; userId: string }[];
  organisationMemberships?: { organisationId: string; userId: string }[];
}) {
  const workspaceMemberships = options.workspaceMemberships ?? [];
  const organisationMemberships = options.organisationMemberships ?? [];

  const prisma = {
    workspace: {
      findMany: async ({
        where,
      }: {
        where?: { OR?: ({ id: { in: string[] } } | { organisationId: { in: string[] } })[] };
      }) => {
        const rows = options.workspaces.map((w) => ({
          ...w,
          description: null,
          status: 'draft',
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
        }));
        if (where?.OR === undefined) return rows;

        const [byId, byOrg] = where.OR as [
          { id: { in: string[] } },
          { organisationId: { in: string[] } },
        ];
        return rows.filter(
          (w) => byId.id.in.includes(w.id) || byOrg.organisationId.in.includes(w.organisationId),
        );
      },
    },
    workspaceMembership: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        workspaceMemberships.filter((m) => m.userId === where.userId),
    },
    organisationMembership: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        organisationMemberships.filter((m) => m.userId === where.userId),
    },
  };

  return prisma as unknown as PrismaService;
}

describe('WorkspacesService.list — visibility scoping', () => {
  it('a real session sees a workspace it is directly a member of', async () => {
    const prisma = fakePrisma({
      workspaces: [
        { id: WORKSPACE_1, name: 'W1', organisationId: ORG_1 },
        { id: WORKSPACE_2, name: 'W2', organisationId: ORG_1 },
      ],
      workspaceMemberships: [{ workspaceId: WORKSPACE_1, userId: USER_1 }],
    });
    const service = new WorkspacesService(prisma);

    const result = await service.list(SESSION_PRINCIPAL);

    expect(result.map((w) => w.id)).toEqual([WORKSPACE_1]);
  });

  it('a real session sees every workspace under an organisation it is a member of, without a direct workspace membership', async () => {
    const prisma = fakePrisma({
      workspaces: [
        { id: WORKSPACE_1, name: 'W1', organisationId: ORG_1 },
        { id: WORKSPACE_2, name: 'W2', organisationId: ORG_1 },
        { id: WORKSPACE_3, name: 'W3', organisationId: ORG_2 },
      ],
      organisationMemberships: [{ organisationId: ORG_1, userId: USER_1 }],
    });
    const service = new WorkspacesService(prisma);

    const result = await service.list(SESSION_PRINCIPAL);

    expect(result.map((w) => w.id).sort()).toEqual([WORKSPACE_1, WORKSPACE_2].sort());
  });

  it('a real session with no reach sees no workspaces', async () => {
    const prisma = fakePrisma({
      workspaces: [{ id: WORKSPACE_1, name: 'W1', organisationId: ORG_1 }],
    });
    const service = new WorkspacesService(prisma);

    const result = await service.list(SESSION_PRINCIPAL);

    expect(result).toEqual([]);
  });

  it('the unverified dev-header path is unscoped, as before', async () => {
    const prisma = fakePrisma({
      workspaces: [
        { id: WORKSPACE_1, name: 'W1', organisationId: ORG_1 },
        { id: WORKSPACE_3, name: 'W3', organisationId: ORG_2 },
      ],
    });
    const service = new WorkspacesService(prisma);

    const result = await service.list(DEV_PRINCIPAL);

    expect(result.map((w) => w.id).sort()).toEqual([WORKSPACE_1, WORKSPACE_3].sort());
  });
});

// ─── Lifecycle transitions (Phase 4F, ADR-0028) ────────────────────────────

function fakeWritablePrisma() {
  const workspaces: Record<string, unknown>[] = [
    {
      id: WORKSPACE_1,
      organisationId: ORG_1,
      name: 'Water Committee Programme',
      description: null,
      status: 'draft',
      version: 1,
      createdAt: new Date('2026-03-14T11:00:00Z'),
      updatedAt: new Date('2026-03-14T11:00:00Z'),
    },
  ];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = workspaces.find((w) => w['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const row = workspaces.find((w) => w['id'] === where.id && w['version'] === where.version);
        if (row === undefined) return { count: 0 };
        Object.assign(row, data, { updatedAt: new Date() });
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
    // Snapshot-and-restore — see `sessions.service.test.ts`'s identical
    // double for why a throwing callback must leave no trace.
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> => {
      const snapshot = {
        workspaces: workspaces.map((w) => ({ ...w })),
        actors: actors.map((a) => ({ ...a })),
        auditEvents: auditEvents.map((e) => ({ ...e })),
      };
      try {
        return await fn(prisma);
      } catch (error) {
        workspaces.splice(0, workspaces.length, ...snapshot.workspaces);
        actors.splice(0, actors.length, ...snapshot.actors);
        auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
        throw error;
      }
    },
  };

  return { prisma: prisma as unknown as PrismaService, workspaces, auditEvents };
}

describe('WorkspacesService.transition', () => {
  it('moves a draft programme through recruiting -> active -> review -> closed -> archived', async () => {
    const { prisma } = fakeWritablePrisma();
    const service = new WorkspacesService(prisma);

    let current = await service.transition(
      WORKSPACE_1,
      { action: 'recruit', expectedVersion: 1 },
      DEV_PRINCIPAL,
    );
    expect(current.status).toBe('recruiting');
    expect(current.version).toBe(2);

    current = await service.transition(
      WORKSPACE_1,
      { action: 'activate', expectedVersion: 2 },
      DEV_PRINCIPAL,
    );
    expect(current.status).toBe('active');

    current = await service.transition(
      WORKSPACE_1,
      { action: 'review', expectedVersion: 3 },
      DEV_PRINCIPAL,
    );
    expect(current.status).toBe('review');

    current = await service.transition(
      WORKSPACE_1,
      { action: 'close', expectedVersion: 4 },
      DEV_PRINCIPAL,
    );
    expect(current.status).toBe('closed');

    current = await service.transition(
      WORKSPACE_1,
      { action: 'archive', expectedVersion: 5 },
      DEV_PRINCIPAL,
    );
    expect(current.status).toBe('archived');
  });

  it('reopens a closed programme with a stated reason', async () => {
    const { prisma } = fakeWritablePrisma();
    const service = new WorkspacesService(prisma);

    await service.transition(
      WORKSPACE_1,
      { action: 'activate', expectedVersion: 1 },
      DEV_PRINCIPAL,
    );
    await service.transition(WORKSPACE_1, { action: 'close', expectedVersion: 2 }, DEV_PRINCIPAL);

    const reopened = await service.transition(
      WORKSPACE_1,
      { action: 'reopen', reason: 'Community asked to continue', expectedVersion: 3 },
      DEV_PRINCIPAL,
    );

    expect(reopened.status).toBe('active');
    expect(reopened.version).toBe(4);
  });

  it('ATTACK — rejects an invalid transition (draft straight to closed)', async () => {
    const { prisma } = fakeWritablePrisma();
    const service = new WorkspacesService(prisma);

    await expect(
      service.transition(WORKSPACE_1, { action: 'close', expectedVersion: 1 }, DEV_PRINCIPAL),
    ).rejects.toThrow(DomainError);
  });

  it('ATTACK — a second writer using the version the first writer already consumed is rejected', async () => {
    const { prisma } = fakeWritablePrisma();
    const service = new WorkspacesService(prisma);

    await service.transition(WORKSPACE_1, { action: 'recruit', expectedVersion: 1 }, DEV_PRINCIPAL);

    await expect(
      service.transition(WORKSPACE_1, { action: 'activate', expectedVersion: 1 }, DEV_PRINCIPAL),
    ).rejects.toThrow(ConflictException);
  });

  it('records one audit event per transition', async () => {
    const { prisma, auditEvents } = fakeWritablePrisma();
    const service = new WorkspacesService(prisma);

    await service.transition(WORKSPACE_1, { action: 'recruit', expectedVersion: 1 }, DEV_PRINCIPAL);

    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      subjectType: 'workspace',
      subjectId: WORKSPACE_1,
      action: 'workspace.status_changed',
    });
  });
});
