/**
 * Service-level tests for `WorkspaceRoleAssignmentsService`, against an
 * in-memory Prisma double — see `users.service.test.ts` for why this pattern
 * exists in this capability.
 *
 * The two ATTACK tests are the actual adversarial cases the eligibility rule
 * exists to stop: a user's standing in one organisation being used to
 * justify a role assignment in a workspace under a *different* organisation,
 * and a role assignment being read or mutated through a workspace it does
 * not belong to.
 */

import { DomainError, InvariantViolation } from '@witness/domain';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { WorkspaceRoleAssignmentsService } from './workspace-role-assignments.service.js';

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
const MEMBERSHIP_1 = '66666666-6666-4666-8666-666666666666';

function fakePrisma() {
  const workspaces: Record<string, unknown>[] = [
    { id: WORKSPACE_A, organisationId: ORG_A },
    { id: WORKSPACE_B, organisationId: ORG_B },
  ];
  const memberships: Record<string, unknown>[] = [
    {
      id: MEMBERSHIP_1,
      workspaceId: WORKSPACE_A,
      userId: USER_1,
      state: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  const users: Record<string, unknown>[] = [
    { id: USER_1, email: 'a@example.com', displayName: 'A' },
  ];
  const organisationMemberships: Record<string, unknown>[] = [
    { organisationId: ORG_A, userId: USER_1, state: 'active' },
  ];
  const roleAssignments: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = workspaces.find((w) => w['id'] === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    workspaceMembership: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = memberships.find((m) => m['id'] === where.id);
        if (row === undefined) return null;
        return { ...row, user: users.find((u) => u['id'] === row['userId']) };
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
    roleAssignment: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_userId?: { workspaceId: string; userId: string } };
      }) => {
        const key = where.workspaceId_userId!;
        const row = roleAssignments.find(
          (r) => r['workspaceId'] === key.workspaceId && r['userId'] === key.userId,
        );
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        roleAssignments.push({ ...data });
        return { ...data };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = roleAssignments.find((r) => r['id'] === where.id);
        Object.assign(row!, data);
        return { ...row };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = roleAssignments.findIndex((r) => r['id'] === where.id);
        const [removed] = roleAssignments.splice(index, 1);
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
    memberships,
    organisationMemberships,
    roleAssignments,
    auditEvents,
  };
}

describe('WorkspaceRoleAssignmentsService', () => {
  it('assigns a workspace role when both workspace and parent organisation membership are in good standing', async () => {
    const { prisma, auditEvents } = fakePrisma();
    const service = new WorkspaceRoleAssignmentsService(prisma);

    const view = await service.assignOrChange(
      WORKSPACE_A,
      MEMBERSHIP_1,
      { role: 'reviewer' },
      ADMIN,
    );

    expect(view.role).toBe('reviewer');
    expect(auditEvents).toHaveLength(1);
  });

  it('refuses an invalid role', async () => {
    const { prisma } = fakePrisma();
    const service = new WorkspaceRoleAssignmentsService(prisma);
    await expect(
      service.assignOrChange(WORKSPACE_A, MEMBERSHIP_1, { role: 'superuser' } as never, ADMIN),
    ).rejects.toThrow(InvariantViolation);
  });

  it('refuses when the workspace membership itself is not in good standing', async () => {
    const { prisma, memberships } = fakePrisma();
    (memberships[0] as Record<string, unknown>)['state'] = 'suspended';
    const service = new WorkspaceRoleAssignmentsService(prisma);

    await expect(
      service.assignOrChange(WORKSPACE_A, MEMBERSHIP_1, { role: 'reviewer' }, ADMIN),
    ).rejects.toThrow(DomainError);
  });

  it('ATTACK — a user whose organisation membership has lapsed cannot receive a workspace role on old standing', async () => {
    const { prisma, organisationMemberships } = fakePrisma();
    (organisationMemberships[0] as Record<string, unknown>)['state'] = 'suspended';
    const service = new WorkspaceRoleAssignmentsService(prisma);

    await expect(
      service.assignOrChange(WORKSPACE_A, MEMBERSHIP_1, { role: 'reviewer' }, ADMIN),
    ).rejects.toThrow(/organisation/i);
  });

  it('ATTACK — a user with no organisation membership in the workspace’s organisation cannot receive a workspace role', async () => {
    const { prisma, organisationMemberships } = fakePrisma();
    organisationMemberships.length = 0;
    const service = new WorkspaceRoleAssignmentsService(prisma);

    await expect(
      service.assignOrChange(WORKSPACE_A, MEMBERSHIP_1, { role: 'reviewer' }, ADMIN),
    ).rejects.toThrow(/organisation/i);
  });

  it('changes an existing assignment, replacing rather than duplicating it', async () => {
    const { prisma, roleAssignments } = fakePrisma();
    const service = new WorkspaceRoleAssignmentsService(prisma);

    await service.assignOrChange(WORKSPACE_A, MEMBERSHIP_1, { role: 'contributor' }, ADMIN);
    const changed = await service.assignOrChange(
      WORKSPACE_A,
      MEMBERSHIP_1,
      { role: 'reviewer' },
      ADMIN,
    );

    expect(changed.role).toBe('reviewer');
    expect(roleAssignments).toHaveLength(1);
  });

  it('removes an assignment, with an audit event', async () => {
    const { prisma, roleAssignments, auditEvents } = fakePrisma();
    const service = new WorkspaceRoleAssignmentsService(prisma);

    await service.assignOrChange(WORKSPACE_A, MEMBERSHIP_1, { role: 'reviewer' }, ADMIN);
    await service.remove(WORKSPACE_A, MEMBERSHIP_1, ADMIN);

    expect(roleAssignments).toHaveLength(0);
    expect(auditEvents.some((e) => e['action'] === 'role_assignment.removed')).toBe(true);
  });

  it('404s removing an assignment that does not exist', async () => {
    const { prisma } = fakePrisma();
    const service = new WorkspaceRoleAssignmentsService(prisma);
    await expect(service.remove(WORKSPACE_A, MEMBERSHIP_1, ADMIN)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('ATTACK — cannot read or change a role assignment using a different workspace in the URL', async () => {
    const { prisma } = fakePrisma();
    const service = new WorkspaceRoleAssignmentsService(prisma);

    await expect(service.get(WORKSPACE_B, MEMBERSHIP_1)).rejects.toThrow(NotFoundException);
    await expect(
      service.assignOrChange(WORKSPACE_B, MEMBERSHIP_1, { role: 'admin' }, ADMIN),
    ).rejects.toThrow(NotFoundException);
  });
});
