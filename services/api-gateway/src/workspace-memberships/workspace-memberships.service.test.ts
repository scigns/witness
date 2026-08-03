/**
 * Service-level tests for `WorkspaceMembershipsService`, against an in-memory
 * Prisma double — see `users.service.test.ts` for why this pattern exists in
 * this capability (no live Postgres was available while building it).
 *
 * Two tests here are the actual adversarial cases the eligibility rule exists
 * to stop: a user's standing in one organisation being used to justify
 * workspace access under a *different* organisation, and a membership row
 * being mutated through a workspace it does not belong to.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { DomainError } from '@witness/domain';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { WorkspaceMembershipsService } from './workspace-memberships.service.js';

const ADMIN: Principal = {
  subject: 'dev:admin',
  displayName: 'Admin',
  kind: 'human',
  roles: ['admin'],
};

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_A = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_B = '44444444-4444-4444-8444-444444444444';
const USER_1 = '55555555-5555-4555-8555-555555555555';

function fakePrisma() {
  const workspaces: Record<string, unknown>[] = [];
  const users: Record<string, unknown>[] = [];
  const organisationMemberships: Record<string, unknown>[] = [];
  const workspaceMemberships: Record<string, unknown>[] = [];
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
    organisationMembership: {
      findUnique: async ({
        where,
      }: {
        where: { organisationId_userId: { organisationId: string; userId: string } };
      }) => {
        const row = organisationMemberships.find(
          (m) =>
            m['organisationId'] === where.organisationId_userId.organisationId &&
            m['userId'] === where.organisationId_userId.userId,
        );
        return row === undefined ? null : { ...row };
      },
    },
    workspaceMembership: {
      findUnique: async ({
        where,
      }: {
        where: { id?: string; workspaceId_userId?: { workspaceId: string; userId: string } };
      }) => {
        const row =
          where.id !== undefined
            ? workspaceMemberships.find((m) => m['id'] === where.id)
            : workspaceMemberships.find(
                (m) =>
                  m['workspaceId'] === where.workspaceId_userId!.workspaceId &&
                  m['userId'] === where.workspaceId_userId!.userId,
              );
        if (row === undefined) return null;
        return { ...row, user: users.find((u) => u['id'] === row['userId']) };
      },
      findMany: async ({ where }: { where: { workspaceId: string } }) =>
        workspaceMemberships
          .filter((m) => m['workspaceId'] === where.workspaceId)
          .map((m) => ({ ...m, user: users.find((u) => u['id'] === m['userId']) })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        workspaceMemberships.push({ ...data });
        return { ...data };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = workspaceMemberships.find((m) => m['id'] === where.id);
        Object.assign(row!, data);
        return { ...row };
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
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>) => fn(prisma),
  };

  return {
    prisma: prisma as unknown as PrismaService,
    workspaces,
    users,
    organisationMemberships,
    workspaceMemberships,
    auditEvents,
  };
}

describe('WorkspaceMembershipsService', () => {
  it('404s when the workspace does not exist', async () => {
    const { prisma } = fakePrisma();
    const service = new WorkspaceMembershipsService(prisma);
    await expect(service.add('missing-workspace', USER_1, ADMIN)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('404s when the user does not exist', async () => {
    const { prisma, workspaces } = fakePrisma();
    workspaces.push({ id: WORKSPACE_A, organisationId: ORG_A, name: 'Workspace A' });
    const service = new WorkspaceMembershipsService(prisma);
    await expect(service.add(WORKSPACE_A, 'missing-user', ADMIN)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('ATTACK — refuses a user with no organisation membership at all', async () => {
    const { prisma, workspaces, users } = fakePrisma();
    workspaces.push({ id: WORKSPACE_A, organisationId: ORG_A, name: 'Workspace A' });
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });

    const service = new WorkspaceMembershipsService(prisma);
    await expect(service.add(WORKSPACE_A, USER_1, ADMIN)).rejects.toThrow(DomainError);
  });

  it('ATTACK — a user active in organisation B cannot be added to a workspace under organisation A', async () => {
    const { prisma, workspaces, users, organisationMemberships } = fakePrisma();
    workspaces.push({ id: WORKSPACE_A, organisationId: ORG_A, name: 'Workspace A' });
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });
    // The user's ONLY organisation membership is in organisation B — good
    // standing there must not translate into eligibility for a workspace
    // under organisation A.
    organisationMemberships.push({
      id: 'membership-b',
      organisationId: ORG_B,
      userId: USER_1,
      state: 'active',
    });

    const service = new WorkspaceMembershipsService(prisma);
    await expect(service.add(WORKSPACE_A, USER_1, ADMIN)).rejects.toThrow(DomainError);
  });

  it('refuses a user whose organisation membership is suspended', async () => {
    const { prisma, workspaces, users, organisationMemberships } = fakePrisma();
    workspaces.push({ id: WORKSPACE_A, organisationId: ORG_A, name: 'Workspace A' });
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });
    organisationMemberships.push({
      id: 'membership-a',
      organisationId: ORG_A,
      userId: USER_1,
      state: 'suspended',
    });

    const service = new WorkspaceMembershipsService(prisma);
    await expect(service.add(WORKSPACE_A, USER_1, ADMIN)).rejects.toThrow(DomainError);
  });

  it('admits a user active in the workspace’s own organisation, with an audit event', async () => {
    const { prisma, workspaces, users, organisationMemberships, auditEvents } = fakePrisma();
    workspaces.push({ id: WORKSPACE_A, organisationId: ORG_A, name: 'Workspace A' });
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });
    organisationMemberships.push({
      id: 'membership-a',
      organisationId: ORG_A,
      userId: USER_1,
      state: 'active',
    });

    const service = new WorkspaceMembershipsService(prisma);
    const membership = await service.add(WORKSPACE_A, USER_1, ADMIN);

    expect(membership.state).toBe('invited');
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      action: 'workspace_membership.created',
      subjectType: 'workspace_membership',
    });
  });

  it('refuses a duplicate workspace membership', async () => {
    const { prisma, workspaces, users, organisationMemberships } = fakePrisma();
    workspaces.push({ id: WORKSPACE_A, organisationId: ORG_A, name: 'Workspace A' });
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });
    organisationMemberships.push({
      id: 'membership-a',
      organisationId: ORG_A,
      userId: USER_1,
      state: 'active',
    });

    const service = new WorkspaceMembershipsService(prisma);
    await service.add(WORKSPACE_A, USER_1, ADMIN);

    await expect(service.add(WORKSPACE_A, USER_1, ADMIN)).rejects.toThrow(ConflictException);
  });

  it('ATTACK — cannot transition a membership using a different workspace in the URL', async () => {
    const { prisma, workspaces, users, organisationMemberships } = fakePrisma();
    workspaces.push(
      { id: WORKSPACE_A, organisationId: ORG_A, name: 'Workspace A' },
      { id: WORKSPACE_B, organisationId: ORG_A, name: 'Workspace B' },
    );
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });
    organisationMemberships.push({
      id: 'membership-a',
      organisationId: ORG_A,
      userId: USER_1,
      state: 'active',
    });

    const service = new WorkspaceMembershipsService(prisma);
    const created = await service.add(WORKSPACE_A, USER_1, ADMIN);

    // The membership belongs to workspace A; targeting it via workspace B's
    // route must be refused as not-found, not silently applied.
    await expect(
      service.transition(WORKSPACE_B, created.id, { action: 'activate' }, ADMIN),
    ).rejects.toThrow(NotFoundException);
  });
});
