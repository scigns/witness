/**
 * Service-level tests for `OrganisationMembershipsService`, against an
 * in-memory Prisma double — see `users.service.test.ts` for why this pattern
 * exists in this capability (no live Postgres was available while building
 * it).
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { DomainError } from '@witness/domain';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { OrganisationMembershipsService } from './organisation-memberships.service.js';

const ADMIN: Principal = {
  subject: 'dev:admin',
  displayName: 'Admin',
  kind: 'human',
  roles: ['admin'],
};

// Real UUIDs — `addOrganisationMember` validates its ids via `toOrganisationId`/
// `toUserId` once the existence checks pass, so a fixture id must satisfy the
// same format a real database row's id would.
const ORG_1 = '11111111-1111-4111-8111-111111111111';
const ORG_2 = '22222222-2222-4222-8222-222222222222';
const USER_1 = '33333333-3333-4333-8333-333333333333';

function fakePrisma() {
  const organisations: Record<string, unknown>[] = [];
  const users: Record<string, unknown>[] = [];
  const memberships: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    organisation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = organisations.find((o) => o['id'] === where.id);
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
        where: { id?: string; organisationId_userId?: { organisationId: string; userId: string } };
      }) => {
        const row =
          where.id !== undefined
            ? memberships.find((m) => m['id'] === where.id)
            : memberships.find(
                (m) =>
                  m['organisationId'] === where.organisationId_userId!.organisationId &&
                  m['userId'] === where.organisationId_userId!.userId,
              );
        if (row === undefined) return null;
        return { ...row, user: users.find((u) => u['id'] === row['userId']) };
      },
      findMany: async ({ where }: { where: { organisationId: string } }) =>
        memberships
          .filter((m) => m['organisationId'] === where.organisationId)
          .map((m) => ({ ...m, user: users.find((u) => u['id'] === m['userId']) })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        memberships.push({ ...data });
        return { ...data };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = memberships.find((m) => m['id'] === where.id);
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
    organisations,
    users,
    memberships,
    auditEvents,
  };
}

describe('OrganisationMembershipsService', () => {
  it('404s when the organisation does not exist', async () => {
    const { prisma } = fakePrisma();
    const service = new OrganisationMembershipsService(prisma);
    await expect(service.add('missing-org', 'some-user', ADMIN)).rejects.toThrow(NotFoundException);
  });

  it('404s when the user does not exist', async () => {
    const { prisma, organisations } = fakePrisma();
    organisations.push({ id: ORG_1, name: 'Org' });
    const service = new OrganisationMembershipsService(prisma);
    await expect(service.add(ORG_1, 'missing-user', ADMIN)).rejects.toThrow(NotFoundException);
  });

  it('adds a member, invited, with an audit event', async () => {
    const { prisma, organisations, users, auditEvents } = fakePrisma();
    organisations.push({ id: ORG_1, name: 'Org' });
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });

    const service = new OrganisationMembershipsService(prisma);
    const membership = await service.add(ORG_1, USER_1, ADMIN);

    expect(membership.state).toBe('invited');
    expect(membership.permittedActions.sort()).toEqual(['activate', 'revoke']);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      action: 'organisation_membership.created',
      subjectType: 'organisation_membership',
    });
  });

  it('refuses a duplicate membership for the same organisation and user', async () => {
    const { prisma, organisations, users } = fakePrisma();
    organisations.push({ id: ORG_1, name: 'Org' });
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });

    const service = new OrganisationMembershipsService(prisma);
    await service.add(ORG_1, USER_1, ADMIN);

    await expect(service.add(ORG_1, USER_1, ADMIN)).rejects.toThrow(ConflictException);
  });

  it('lists only memberships for the requested organisation', async () => {
    const { prisma, organisations, users } = fakePrisma();
    organisations.push({ id: ORG_1, name: 'Org 1' }, { id: ORG_2, name: 'Org 2' });
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });

    const service = new OrganisationMembershipsService(prisma);
    await service.add(ORG_1, USER_1, ADMIN);

    const org1Memberships = await service.list(ORG_1);
    const org2Memberships = await service.list(ORG_2);

    expect(org1Memberships).toHaveLength(1);
    expect(org2Memberships).toHaveLength(0);
  });

  it('transitions invited -> active -> revoked', async () => {
    const { prisma, organisations, users } = fakePrisma();
    organisations.push({ id: ORG_1, name: 'Org' });
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });

    const service = new OrganisationMembershipsService(prisma);
    const created = await service.add(ORG_1, USER_1, ADMIN);

    const activated = await service.transition(ORG_1, created.id, { action: 'activate' }, ADMIN);
    expect(activated.state).toBe('active');

    const revoked = await service.transition(ORG_1, created.id, { action: 'revoke' }, ADMIN);
    expect(revoked.state).toBe('revoked');
  });

  it('refuses an invalid transition (revoked is terminal)', async () => {
    const { prisma, organisations, users } = fakePrisma();
    organisations.push({ id: ORG_1, name: 'Org' });
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });

    const service = new OrganisationMembershipsService(prisma);
    const created = await service.add(ORG_1, USER_1, ADMIN);
    await service.transition(ORG_1, created.id, { action: 'revoke' }, ADMIN);

    await expect(
      service.transition(ORG_1, created.id, { action: 'activate' }, ADMIN),
    ).rejects.toThrow(DomainError);
  });

  it('ATTACK — cannot transition a membership using a different organisation in the URL', async () => {
    const { prisma, organisations, users } = fakePrisma();
    organisations.push({ id: ORG_1, name: 'Org 1' }, { id: ORG_2, name: 'Org 2' });
    users.push({ id: USER_1, email: 'a@example.com', displayName: 'A' });

    const service = new OrganisationMembershipsService(prisma);
    const created = await service.add(ORG_1, USER_1, ADMIN);

    // The membership belongs to org-1; asking to change it via org-2's route
    // must be refused as not-found, not silently applied.
    await expect(
      service.transition(ORG_2, created.id, { action: 'activate' }, ADMIN),
    ).rejects.toThrow(NotFoundException);
  });
});
