/**
 * `WorkspacesService.list` is a visibility boundary, not just a convenience
 * filter — a real session must only see workspaces it can reach: a direct
 * workspace membership, or membership in the workspace's parent
 * organisation (Milestone 1.4, Authorisation hardening; mirrors the
 * cascade in `RoleResolutionService`). The unverified `X-Witness-Dev-User`
 * path is untouched — see `organisations.service.test.ts` for why.
 */

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
        const rows = options.workspaces.map((w) => ({ ...w, createdAt: new Date() }));
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
