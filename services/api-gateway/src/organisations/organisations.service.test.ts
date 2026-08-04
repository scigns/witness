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
}) {
  const memberships = options.organisationMemberships ?? [];

  const prisma = {
    organisation: {
      findMany: async ({ where }: { where?: { id?: { in: string[] } } }) => {
        const rows = options.organisations.map((o) => ({ ...o, createdAt: new Date() }));
        if (where?.id === undefined) return rows;
        return rows.filter((o) => where.id!.in.includes(o.id));
      },
    },
    organisationMembership: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        memberships.filter((m) => m.userId === where.userId),
    },
  };

  return prisma as unknown as PrismaService;
}

describe('OrganisationsService.list — visibility scoping', () => {
  it('a real session only sees organisations it has a membership row in', async () => {
    const prisma = fakePrisma({
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
    const prisma = fakePrisma({
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
    const prisma = fakePrisma({
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
