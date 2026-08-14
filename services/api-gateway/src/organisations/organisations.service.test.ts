/**
 * `OrganisationsService.list` is a visibility boundary, not just a
 * convenience filter — a real session must only see organisations it holds
 * a membership row in, independent of any single record's authorisation
 * check (Milestone 1.4, Authorisation hardening). The unverified
 * `X-Witness-Dev-User` path is untouched: it has always seen everything,
 * and there is no membership set to scope a header nobody has verified to.
 */

import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { OrganisationsService } from './organisations.service.js';

const ORG_1 = '11111111-1111-4111-8111-111111111111';
const ORG_2 = '22222222-2222-4222-8222-222222222222';
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
  organisations: { id: string; name: string }[];
  organisationMemberships?: { organisationId: string; userId: string }[];
  users?: { id: string; email: string }[];
}) {
  const memberships = options.organisationMemberships ?? [];
  const organisations = [...options.organisations];
  const users = [...(options.users ?? [])];
  const actors: { id: string; kind: string; displayName: string }[] = [];
  const roleAssignments: { id: string; organisationId: string; userId: string; role: string }[] =
    [];
  const auditEvents: { subjectType: string; subjectId: string; action: string }[] = [];

  const tx = {
    organisation: {
      create: async ({ data }: { data: { id: string; name: string; createdAt: Date } }) => {
        organisations.push({ id: data.id, name: data.name });
        return data;
      },
    },
    actor: {
      findFirst: async ({ where }: { where: { displayName: string; kind: string } }) =>
        actors.find((a) => a.displayName === where.displayName && a.kind === where.kind) ?? null,
      create: async ({ data }: { data: { id: string; kind: string; displayName: string } }) => {
        actors.push(data);
        return data;
      },
    },
    user: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        users.find((u) => u.email === where.email) ?? null,
      create: async ({ data }: { data: { id: string; email: string } }) => {
        users.push({ id: data.id, email: data.email });
        return data;
      },
    },
    organisationMembership: {
      create: async ({ data }: { data: { organisationId: string; userId: string } }) => {
        memberships.push(data);
        return data;
      },
    },
    roleAssignment: {
      create: async ({
        data,
      }: {
        data: { id: string; organisationId: string; userId: string; role: string };
      }) => {
        roleAssignments.push(data);
        return data;
      },
    },
    auditEvent: {
      create: async ({
        data,
      }: {
        data: { subjectType: string; subjectId: string; action: string };
      }) => {
        auditEvents.push(data);
        return data;
      },
    },
  };

  const prisma = {
    organisation: {
      findMany: async ({ where }: { where?: { id?: { in: string[] } } }) => {
        const rows = organisations.map((o) => ({ ...o, createdAt: new Date() }));
        if (where?.id === undefined) return rows;
        return rows.filter((o) => where.id!.in.includes(o.id));
      },
    },
    organisationMembership: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        memberships.filter((m) => m.userId === where.userId),
    },
    actor: tx.actor,
    $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(tx),
  };

  return {
    prisma: prisma as unknown as PrismaService,
    state: { organisations, users, memberships, roleAssignments, auditEvents },
  };
}

describe('OrganisationsService.list — visibility scoping', () => {
  it('a real session only sees organisations it has a membership row in', async () => {
    const { prisma } = fakePrisma({
      organisations: [
        { id: ORG_1, name: 'Org One' },
        { id: ORG_2, name: 'Org Two' },
      ],
      organisationMemberships: [{ organisationId: ORG_1, userId: USER_1 }],
    });
    const service = new OrganisationsService(prisma);

    const result = await service.list(SESSION_PRINCIPAL);

    expect(result.map((o) => o.id)).toEqual([ORG_1]);
  });

  it('a real session with no memberships sees no organisations', async () => {
    const { prisma } = fakePrisma({
      organisations: [
        { id: ORG_1, name: 'Org One' },
        { id: ORG_2, name: 'Org Two' },
      ],
    });
    const service = new OrganisationsService(prisma);

    const result = await service.list(SESSION_PRINCIPAL);

    expect(result).toEqual([]);
  });

  it('the unverified dev-header path is unscoped, as before', async () => {
    const { prisma } = fakePrisma({
      organisations: [
        { id: ORG_1, name: 'Org One' },
        { id: ORG_2, name: 'Org Two' },
      ],
    });
    const service = new OrganisationsService(prisma);

    const result = await service.list(DEV_PRINCIPAL);

    expect(result.map((o) => o.id).sort()).toEqual([ORG_1, ORG_2].sort());
  });
});

describe('OrganisationsService.create — provisions an administrator', () => {
  it('creates the organisation, invites the administrator, and grants them organisation-scoped admin', async () => {
    const { prisma, state } = fakePrisma({ organisations: [] });
    const service = new OrganisationsService(prisma);

    const result = await service.create(
      'New Institution',
      'admin@new-institution.example',
      'New Admin',
      SESSION_PRINCIPAL,
    );

    expect(state.organisations).toEqual([{ id: result.id, name: 'New Institution' }]);
    expect(state.users.map((u) => u.email)).toEqual(['admin@new-institution.example']);
    const invitedUserId = state.users[0]!.id;
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]).toMatchObject({
      organisationId: result.id,
      userId: invitedUserId,
    });
    expect(state.roleAssignments).toHaveLength(1);
    expect(state.roleAssignments[0]).toMatchObject({
      organisationId: result.id,
      userId: invitedUserId,
      role: 'admin',
    });
    expect(state.auditEvents.map((e) => e.action)).toEqual([
      'organisation.created',
      'user.invited',
    ]);
  });

  it('reuses an existing user by email rather than creating a duplicate, and adds no second user.invited event', async () => {
    const { prisma, state } = fakePrisma({
      organisations: [],
      users: [{ id: USER_1, email: 'shared-admin@example.org' }],
    });
    const service = new OrganisationsService(prisma);

    await service.create(
      'Second Org',
      'shared-admin@example.org',
      'Shared Admin',
      SESSION_PRINCIPAL,
    );

    expect(state.users).toHaveLength(1);
    expect(state.memberships[0]).toMatchObject({ userId: USER_1 });
    expect(state.auditEvents.map((e) => e.action)).toEqual(['organisation.created']);
  });
});
