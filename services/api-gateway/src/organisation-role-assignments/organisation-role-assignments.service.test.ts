/**
 * Service-level tests for `OrganisationRoleAssignmentsService`, against an
 * in-memory Prisma double — see `users.service.test.ts` for why this pattern
 * exists in this capability (no live Postgres was available while building
 * it).
 */

import { DomainError, InvariantViolation } from '@witness/domain';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { OrganisationRoleAssignmentsService } from './organisation-role-assignments.service.js';

const ADMIN: Principal = {
  subject: 'dev:admin',
  displayName: 'Admin',
  kind: 'human',
  roles: ['admin'],
};

const ORG_1 = '11111111-1111-4111-8111-111111111111';
const ORG_2 = '22222222-2222-4222-8222-222222222222';
const USER_1 = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP_1 = '44444444-4444-4444-8444-444444444444';

function fakePrisma() {
  const memberships: Record<string, unknown>[] = [
    {
      id: MEMBERSHIP_1,
      organisationId: ORG_1,
      userId: USER_1,
      state: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  const users: Record<string, unknown>[] = [
    { id: USER_1, email: 'a@example.com', displayName: 'A' },
  ];
  const roleAssignments: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    organisationMembership: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = memberships.find((m) => m['id'] === where.id);
        if (row === undefined) return null;
        return { ...row, user: users.find((u) => u['id'] === row['userId']) };
      },
    },
    roleAssignment: {
      findUnique: async ({
        where,
      }: {
        where: {
          organisationId_userId?: { organisationId: string; userId: string };
          workspaceId_userId?: { workspaceId: string; userId: string };
        };
      }) => {
        const key = where.organisationId_userId!;
        const row = roleAssignments.find(
          (r) => r['organisationId'] === key.organisationId && r['userId'] === key.userId,
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

  return { prisma: prisma as unknown as PrismaService, memberships, roleAssignments, auditEvents };
}

describe('OrganisationRoleAssignmentsService', () => {
  it('404s when the membership does not exist', async () => {
    const { prisma } = fakePrisma();
    const service = new OrganisationRoleAssignmentsService(prisma);
    await expect(
      service.assignOrChange(ORG_1, 'missing-membership', { role: 'reviewer' }, ADMIN),
    ).rejects.toThrow(NotFoundException);
  });

  it('assigns a role to a member with no existing assignment, with an audit event', async () => {
    const { prisma, auditEvents } = fakePrisma();
    const service = new OrganisationRoleAssignmentsService(prisma);

    const view = await service.assignOrChange(ORG_1, MEMBERSHIP_1, { role: 'reviewer' }, ADMIN);

    expect(view.role).toBe('reviewer');
    expect(view.permittedActions).toContain('record:review');
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      action: 'role_assignment.created',
      subjectType: 'role_assignment',
    });
  });

  it('refuses an invalid role', async () => {
    const { prisma } = fakePrisma();
    const service = new OrganisationRoleAssignmentsService(prisma);
    await expect(
      service.assignOrChange(ORG_1, MEMBERSHIP_1, { role: 'superuser' } as never, ADMIN),
    ).rejects.toThrow(InvariantViolation);
  });

  it('refuses to assign a role to a member whose membership is not in good standing', async () => {
    const { prisma, memberships } = fakePrisma();
    (memberships[0] as Record<string, unknown>)['state'] = 'suspended';
    const service = new OrganisationRoleAssignmentsService(prisma);

    await expect(
      service.assignOrChange(ORG_1, MEMBERSHIP_1, { role: 'reviewer' }, ADMIN),
    ).rejects.toThrow(DomainError);
  });

  it('changes an existing assignment to a different role, replacing rather than duplicating it', async () => {
    const { prisma, roleAssignments } = fakePrisma();
    const service = new OrganisationRoleAssignmentsService(prisma);

    await service.assignOrChange(ORG_1, MEMBERSHIP_1, { role: 'contributor' }, ADMIN);
    const changed = await service.assignOrChange(ORG_1, MEMBERSHIP_1, { role: 'reviewer' }, ADMIN);

    expect(changed.role).toBe('reviewer');
    expect(roleAssignments).toHaveLength(1);
  });

  it('refuses to "change" an assignment to the role it already has — duplicate assignment prevention', async () => {
    const { prisma } = fakePrisma();
    const service = new OrganisationRoleAssignmentsService(prisma);

    await service.assignOrChange(ORG_1, MEMBERSHIP_1, { role: 'contributor' }, ADMIN);

    await expect(
      service.assignOrChange(ORG_1, MEMBERSHIP_1, { role: 'contributor' }, ADMIN),
    ).rejects.toThrow(DomainError);
  });

  it('removes an assignment, with an audit event naming the removed role', async () => {
    const { prisma, roleAssignments, auditEvents } = fakePrisma();
    const service = new OrganisationRoleAssignmentsService(prisma);

    await service.assignOrChange(ORG_1, MEMBERSHIP_1, { role: 'reviewer' }, ADMIN);
    await service.remove(ORG_1, MEMBERSHIP_1, ADMIN);

    expect(roleAssignments).toHaveLength(0);
    const removalEvent = auditEvents.find((e) => e['action'] === 'role_assignment.removed');
    expect(removalEvent).toBeDefined();

    const view = await service.get(ORG_1, MEMBERSHIP_1);
    expect(view.role).toBeNull();
  });

  it('404s removing an assignment that does not exist', async () => {
    const { prisma } = fakePrisma();
    const service = new OrganisationRoleAssignmentsService(prisma);
    await expect(service.remove(ORG_1, MEMBERSHIP_1, ADMIN)).rejects.toThrow(NotFoundException);
  });

  it('ATTACK — cannot read or change a role assignment using a different organisation in the URL', async () => {
    const { prisma } = fakePrisma();
    const service = new OrganisationRoleAssignmentsService(prisma);

    await expect(service.get(ORG_2, MEMBERSHIP_1)).rejects.toThrow(NotFoundException);
    await expect(
      service.assignOrChange(ORG_2, MEMBERSHIP_1, { role: 'admin' }, ADMIN),
    ).rejects.toThrow(NotFoundException);
  });
});
