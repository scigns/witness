/**
 * `SessionAuthenticator` is the real-identity replacement for the
 * unverified `X-Witness-Dev-User` header at request boundaries. The most
 * important guarantee under test here is the one named in the class's own
 * header comment: an `admin` `RoleAssignment` — scope-relative, "administers
 * this organisation" — must never flow into a global `admin` grant.
 */

import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import { SessionService } from '../authn/session.service.js';
import { RoleResolutionService } from './role-resolution.service.js';
import { SessionAuthenticator } from './session-authenticator.js';

const USER_1 = 'user-1';
const ORG_1 = 'org-1';
const ORG_2 = 'org-2';
const ORG_3 = 'org-3';
const WORKSPACE_1 = 'workspace-1';

function fakePrisma(options: {
  accountState?: string;
  roleAssignments?: { role: string; organisationId: string | null; workspaceId: string | null }[];
  organisationMemberships?: { organisationId: string; state: string }[];
  workspaceMemberships?: { workspaceId: string; state: string }[];
  /** Shorthand for the common single-organisation case. */
  organisationMembershipState?: string | null;
  /** Shorthand for the common single-workspace case. */
  workspaceMembershipState?: string | null;
}) {
  const sessions: Record<string, unknown>[] = [];
  const calls = { organisationFindMany: 0, workspaceFindMany: 0 };

  const organisationMemberships =
    options.organisationMemberships ??
    (options.organisationMembershipState !== undefined &&
    options.organisationMembershipState !== null
      ? [{ organisationId: ORG_1, state: options.organisationMembershipState }]
      : []);
  const workspaceMemberships =
    options.workspaceMemberships ??
    (options.workspaceMembershipState !== undefined && options.workspaceMembershipState !== null
      ? [{ workspaceId: WORKSPACE_1, state: options.workspaceMembershipState }]
      : []);

  const prisma = {
    authSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        sessions.push({ ...data });
        return { ...data };
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const row = sessions.find((s) => s['tokenHash'] === where.tokenHash);
        return row === undefined ? null : { ...row };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id !== USER_1) return null;
        return {
          id: USER_1,
          displayName: 'Test User',
          accountState: options.accountState ?? 'active',
        };
      },
    },
    roleAssignment: {
      findMany: async ({ where }: { where: { userId: string } }) => {
        if (where.userId !== USER_1) return [];
        return options.roleAssignments ?? [];
      },
    },
    organisationMembership: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; organisationId: { in: string[] } };
      }) => {
        calls.organisationFindMany += 1;
        if (where.userId !== USER_1) return [];
        return organisationMemberships.filter((m) =>
          where.organisationId.in.includes(m.organisationId),
        );
      },
    },
    workspaceMembership: {
      findMany: async ({ where }: { where: { userId: string; workspaceId: { in: string[] } } }) => {
        calls.workspaceFindMany += 1;
        if (where.userId !== USER_1) return [];
        return workspaceMemberships.filter((m) => where.workspaceId.in.includes(m.workspaceId));
      },
    },
  };

  return { prisma: prisma as unknown as PrismaService, calls };
}

async function issueAndAuthenticate(
  prisma: PrismaService,
  header: (token: string) => string | undefined,
) {
  const sessions = new SessionService(prisma);
  const { token } = await sessions.issue(USER_1, 60);
  const authenticator = new SessionAuthenticator(
    prisma,
    sessions,
    new RoleResolutionService(prisma),
  );
  return authenticator.authenticate(header(token));
}

describe('SessionAuthenticator', () => {
  it('returns null when there is no Authorization header', async () => {
    const { prisma } = fakePrisma({});
    const result = await issueAndAuthenticate(prisma, () => undefined);
    expect(result).toBeNull();
  });

  it('returns null for a malformed Authorization header', async () => {
    const { prisma } = fakePrisma({});
    const result = await issueAndAuthenticate(prisma, () => 'NotBearer sometoken');
    expect(result).toBeNull();
  });

  it('returns null for an unknown session token', async () => {
    const { prisma } = fakePrisma({});
    const sessions = new SessionService(prisma);
    const authenticator = new SessionAuthenticator(
      prisma,
      sessions,
      new RoleResolutionService(prisma),
    );
    expect(await authenticator.authenticate('Bearer never-issued')).toBeNull();
  });

  it('resolves a principal with no roles for a user with no role assignments', async () => {
    const { prisma } = fakePrisma({});
    const principal = await issueAndAuthenticate(prisma, (t) => `Bearer ${t}`);
    expect(principal?.roles).toEqual([]);
    expect(principal?.subject).toBe(`user:${USER_1}`);
  });

  it('ATTACK — a suspended account resolves to no principal even with a valid, unexpired token', async () => {
    const { prisma } = fakePrisma({ accountState: 'suspended' });
    const principal = await issueAndAuthenticate(prisma, (t) => `Bearer ${t}`);
    expect(principal).toBeNull();
  });

  it('ATTACK — a deactivated account resolves to no principal', async () => {
    const { prisma } = fakePrisma({ accountState: 'deactivated' });
    const principal = await issueAndAuthenticate(prisma, (t) => `Bearer ${t}`);
    expect(principal).toBeNull();
  });

  it('flattens an organisation-scoped contributor role into the contributor grant tier', async () => {
    const { prisma } = fakePrisma({
      roleAssignments: [{ role: 'contributor', organisationId: ORG_1, workspaceId: null }],
      organisationMembershipState: 'active',
    });
    const principal = await issueAndAuthenticate(prisma, (t) => `Bearer ${t}`);
    expect(principal?.roles).toEqual(['contributor']);
  });

  it('flattens a workspace-scoped reviewer role into the reviewer grant tier', async () => {
    const { prisma } = fakePrisma({
      roleAssignments: [{ role: 'reviewer', organisationId: null, workspaceId: WORKSPACE_1 }],
      workspaceMembershipState: 'active',
    });
    const principal = await issueAndAuthenticate(prisma, (t) => `Bearer ${t}`);
    expect(principal?.roles).toEqual(['reviewer']);
  });

  it('ATTACK — an admin RoleAssignment never grants the global admin tier', async () => {
    const { prisma } = fakePrisma({
      roleAssignments: [{ role: 'admin', organisationId: ORG_1, workspaceId: null }],
      organisationMembershipState: 'active',
    });
    const principal = await issueAndAuthenticate(prisma, (t) => `Bearer ${t}`);
    expect(principal?.roles).toEqual([]);
    expect(principal?.roles).not.toContain('admin');
  });

  it('ATTACK — a role assignment whose backing membership has lapsed grants nothing', async () => {
    const { prisma } = fakePrisma({
      roleAssignments: [{ role: 'reviewer', organisationId: ORG_1, workspaceId: null }],
      organisationMembershipState: 'suspended',
    });
    const principal = await issueAndAuthenticate(prisma, (t) => `Bearer ${t}`);
    expect(principal?.roles).toEqual([]);
  });

  it('batches membership lookups into one query per scope type, regardless of assignment count', async () => {
    const { prisma, calls } = fakePrisma({
      roleAssignments: [
        { role: 'contributor', organisationId: ORG_1, workspaceId: null },
        { role: 'reviewer', organisationId: ORG_2, workspaceId: null },
        { role: 'reader', organisationId: ORG_3, workspaceId: null },
      ],
      organisationMemberships: [
        { organisationId: ORG_1, state: 'active' },
        { organisationId: ORG_2, state: 'active' },
        { organisationId: ORG_3, state: 'active' },
      ],
    });

    const principal = await issueAndAuthenticate(prisma, (t) => `Bearer ${t}`);

    expect(new Set(principal?.roles)).toEqual(new Set(['contributor', 'reviewer', 'reader']));
    // One batched findMany covering all three organisations, not three —
    // the N+1 this test guards against.
    expect(calls.organisationFindMany).toBe(1);
    // No workspace-scoped assignments at all: the workspace query is never
    // issued rather than issued once for an empty id list.
    expect(calls.workspaceFindMany).toBe(0);
  });

  it('facilitator and participant flatten onto the same tiers as contributor and reader', async () => {
    const { prisma } = fakePrisma({
      roleAssignments: [
        { role: 'facilitator', organisationId: ORG_1, workspaceId: null },
        { role: 'participant', organisationId: null, workspaceId: WORKSPACE_1 },
      ],
      organisationMembershipState: 'active',
      workspaceMembershipState: 'active',
    });
    const principal = await issueAndAuthenticate(prisma, (t) => `Bearer ${t}`);
    expect(new Set(principal?.roles)).toEqual(new Set(['contributor', 'reader']));
  });
});
