/**
 * `RoleResolutionService.scopedGrantTiers` is the part of Milestone 1.4
 * (Authorisation hardening) that closes the fail-closed gap left open since
 * Authentication (Milestone 1.3): an `admin` `RoleAssignment` scoped to one
 * organisation or workspace must grant the `admin` tier *there*, and nowhere
 * else — not in a sibling organisation, not in a workspace that merely
 * shares a name, not without a membership row backing it.
 */

import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import { RoleResolutionService } from './role-resolution.service.js';

const USER_1 = 'user-1';
const ORG_1 = 'org-1';
const ORG_2 = 'org-2';
const WORKSPACE_1 = 'workspace-1';
const WORKSPACE_2 = 'workspace-2';

function fakePrisma(options: {
  roleAssignments?: { role: string; organisationId: string | null; workspaceId: string | null }[];
  organisationMemberships?: { organisationId: string; state: string }[];
  workspaceMemberships?: { workspaceId: string; state: string }[];
  workspaces?: { id: string; organisationId: string }[];
}) {
  const roleAssignments = options.roleAssignments ?? [];
  const organisationMemberships = options.organisationMemberships ?? [];
  const workspaceMemberships = options.workspaceMemberships ?? [];
  const workspaces = options.workspaces ?? [{ id: WORKSPACE_1, organisationId: ORG_1 }];

  const prisma = {
    roleAssignment: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; organisationId?: string; workspaceId?: string };
      }) =>
        roleAssignments.filter(
          (a) =>
            (where.organisationId === undefined || a.organisationId === where.organisationId) &&
            (where.workspaceId === undefined || a.workspaceId === where.workspaceId),
        ),
    },
    organisationMembership: {
      findUnique: async ({
        where,
      }: {
        where: { organisationId_userId: { organisationId: string; userId: string } };
      }) => {
        const m = organisationMemberships.find(
          (om) => om.organisationId === where.organisationId_userId.organisationId,
        );
        return m === undefined ? null : { state: m.state };
      },
    },
    workspaceMembership: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
      }) => {
        const m = workspaceMemberships.find(
          (wm) => wm.workspaceId === where.workspaceId_userId.workspaceId,
        );
        return m === undefined ? null : { state: m.state };
      },
    },
    workspace: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const w = workspaces.find((ws) => ws.id === where.id);
        return w === undefined ? null : { organisationId: w.organisationId };
      },
    },
  };

  return prisma as unknown as PrismaService;
}

describe('RoleResolutionService.scopedGrantTiers — organisation scope', () => {
  it('grants the admin tier for an admin RoleAssignment backed by an active membership', async () => {
    const prisma = fakePrisma({
      roleAssignments: [{ role: 'admin', organisationId: ORG_1, workspaceId: null }],
      organisationMemberships: [{ organisationId: ORG_1, state: 'active' }],
    });
    const service = new RoleResolutionService(prisma);

    const tiers = await service.scopedGrantTiers(USER_1, {
      type: 'organisation',
      organisationId: ORG_1,
    });

    expect(tiers).toEqual(['admin']);
  });

  it('ATTACK — an admin RoleAssignment in one organisation grants nothing in a sibling organisation', async () => {
    const prisma = fakePrisma({
      roleAssignments: [{ role: 'admin', organisationId: ORG_1, workspaceId: null }],
      organisationMemberships: [
        { organisationId: ORG_1, state: 'active' },
        { organisationId: ORG_2, state: 'active' },
      ],
    });
    const service = new RoleResolutionService(prisma);

    const tiers = await service.scopedGrantTiers(USER_1, {
      type: 'organisation',
      organisationId: ORG_2,
    });

    expect(tiers).toEqual([]);
  });

  it('ATTACK — a role assignment with no backing membership grants nothing, even though the assignment row exists', async () => {
    const prisma = fakePrisma({
      roleAssignments: [{ role: 'admin', organisationId: ORG_1, workspaceId: null }],
      organisationMemberships: [],
    });
    const service = new RoleResolutionService(prisma);

    const tiers = await service.scopedGrantTiers(USER_1, {
      type: 'organisation',
      organisationId: ORG_1,
    });

    expect(tiers).toEqual([]);
  });

  it('ATTACK — a suspended membership revokes the grant even though the role assignment row still exists', async () => {
    const prisma = fakePrisma({
      roleAssignments: [{ role: 'reviewer', organisationId: ORG_1, workspaceId: null }],
      organisationMemberships: [{ organisationId: ORG_1, state: 'suspended' }],
    });
    const service = new RoleResolutionService(prisma);

    const tiers = await service.scopedGrantTiers(USER_1, {
      type: 'organisation',
      organisationId: ORG_1,
    });

    expect(tiers).toEqual([]);
  });
});

describe('RoleResolutionService.scopedGrantTiers — workspace scope', () => {
  it('grants the tier from a direct workspace-scoped role assignment', async () => {
    const prisma = fakePrisma({
      roleAssignments: [{ role: 'reviewer', organisationId: null, workspaceId: WORKSPACE_1 }],
      workspaceMemberships: [{ workspaceId: WORKSPACE_1, state: 'active' }],
      workspaces: [{ id: WORKSPACE_1, organisationId: ORG_1 }],
    });
    const service = new RoleResolutionService(prisma);

    const tiers = await service.scopedGrantTiers(USER_1, {
      type: 'workspace',
      workspaceId: WORKSPACE_1,
    });

    expect(tiers).toEqual(['reviewer']);
  });

  it('cascades an organisation admin role down to the workspaces under that organisation', async () => {
    const prisma = fakePrisma({
      roleAssignments: [{ role: 'admin', organisationId: ORG_1, workspaceId: null }],
      organisationMemberships: [{ organisationId: ORG_1, state: 'active' }],
      workspaces: [{ id: WORKSPACE_1, organisationId: ORG_1 }],
    });
    const service = new RoleResolutionService(prisma);

    const tiers = await service.scopedGrantTiers(USER_1, {
      type: 'workspace',
      workspaceId: WORKSPACE_1,
    });

    expect(tiers).toEqual(['admin']);
  });

  it('ATTACK — an organisation admin role does not cascade into a workspace under a different organisation', async () => {
    const prisma = fakePrisma({
      roleAssignments: [{ role: 'admin', organisationId: ORG_1, workspaceId: null }],
      organisationMemberships: [{ organisationId: ORG_1, state: 'active' }],
      workspaces: [{ id: WORKSPACE_2, organisationId: ORG_2 }],
    });
    const service = new RoleResolutionService(prisma);

    const tiers = await service.scopedGrantTiers(USER_1, {
      type: 'workspace',
      workspaceId: WORKSPACE_2,
    });

    expect(tiers).toEqual([]);
  });

  it('ATTACK — a workspace-scoped role assignment in one workspace grants nothing in a sibling workspace under the same organisation', async () => {
    const prisma = fakePrisma({
      roleAssignments: [{ role: 'admin', organisationId: null, workspaceId: WORKSPACE_1 }],
      workspaceMemberships: [
        { workspaceId: WORKSPACE_1, state: 'active' },
        { workspaceId: WORKSPACE_2, state: 'active' },
      ],
      workspaces: [
        { id: WORKSPACE_1, organisationId: ORG_1 },
        { id: WORKSPACE_2, organisationId: ORG_1 },
      ],
    });
    const service = new RoleResolutionService(prisma);

    const tiers = await service.scopedGrantTiers(USER_1, {
      type: 'workspace',
      workspaceId: WORKSPACE_2,
    });

    expect(tiers).toEqual([]);
  });

  it('unions a direct workspace role with a parent-organisation role when both are held', async () => {
    const prisma = fakePrisma({
      roleAssignments: [
        { role: 'reviewer', organisationId: null, workspaceId: WORKSPACE_1 },
        { role: 'contributor', organisationId: ORG_1, workspaceId: null },
      ],
      workspaceMemberships: [{ workspaceId: WORKSPACE_1, state: 'active' }],
      organisationMemberships: [{ organisationId: ORG_1, state: 'active' }],
      workspaces: [{ id: WORKSPACE_1, organisationId: ORG_1 }],
    });
    const service = new RoleResolutionService(prisma);

    const tiers = await service.scopedGrantTiers(USER_1, {
      type: 'workspace',
      workspaceId: WORKSPACE_1,
    });

    expect(new Set(tiers)).toEqual(new Set(['reviewer', 'contributor']));
  });

  it('returns nothing for a workspace that does not exist', async () => {
    const prisma = fakePrisma({ workspaces: [] });
    const service = new RoleResolutionService(prisma);

    const tiers = await service.scopedGrantTiers(USER_1, {
      type: 'workspace',
      workspaceId: 'ghost',
    });

    expect(tiers).toEqual([]);
  });
});
