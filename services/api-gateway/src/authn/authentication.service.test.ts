/**
 * User-mapping and sign-in orchestration tests, against a stub
 * `IdentityProviderPort` (the identity verification itself is exercised for
 * real in `development-identity-provider.adapter.test.ts`) and an in-memory
 * Prisma double.
 */

import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import { IdentityProviderPort, type VerifiedIdentity } from './identity-provider.port.js';
import { AuthenticationDeniedError, AuthenticationService } from './authentication.service.js';
import { SessionService } from './session.service.js';

const REDIRECT_URI = 'http://localhost:3001/api/v1/auth/callback';
const INVITED_USER = '11111111-1111-4111-8111-111111111111';
const SUSPENDED_USER = '22222222-2222-4222-8222-222222222222';
const LINK_1 = '33333333-3333-4333-8333-333333333333';

class StubIdentityProvider extends IdentityProviderPort {
  readonly provider = 'keycloak';
  verified: VerifiedIdentity = {
    subject: 'sub-1',
    email: 'invited@example.com',
    emailVerified: true,
    name: 'Invited Person',
  };

  async buildAuthorizationRequest(input: { state: string }) {
    return { url: `https://idp.example/authorize?state=${input.state}`, state: input.state };
  }

  async exchangeCode() {
    return { idToken: 'stub-id-token' };
  }

  async verifyIdToken() {
    return this.verified;
  }
}

function fakePrisma() {
  const authLoginAttempts: Record<string, unknown>[] = [];
  const identityLinks: Record<string, unknown>[] = [];
  const users: Record<string, unknown>[] = [
    {
      id: INVITED_USER,
      email: 'invited@example.com',
      displayName: 'Invited Person',
      accountState: 'invited',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: SUSPENDED_USER,
      email: 'suspended@example.com',
      displayName: 'Suspended Person',
      accountState: 'suspended',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];
  const authSessions: Record<string, unknown>[] = [];
  const organisationMemberships: Record<string, unknown>[] = [];
  const workspaceMemberships: Record<string, unknown>[] = [];
  const roleAssignments: Record<string, unknown>[] = [];
  const workspaces: Record<string, unknown>[] = [];

  const prisma = {
    authLoginAttempt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        authLoginAttempts.push({ ...data });
        return { ...data };
      },
      // Real Prisma throws PrismaClientKnownRequestError(code: 'P2025') —
      // "record to delete does not exist" — when the where-clause matches
      // nothing. AuthenticationService's atomic-consume `.catch()` duck-types
      // on `error.code === 'P2025'` (deliberately not importing the real
      // Prisma error class — see that file's own comment), so the fake only
      // needs to match that shape, not the real class.
      delete: async ({ where }: { where: { state: string } }) => {
        const index = authLoginAttempts.findIndex((a) => a['state'] === where.state);
        if (index === -1) {
          throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' });
        }
        const [removed] = authLoginAttempts.splice(index, 1);
        return removed;
      },
      deleteMany: async ({ where }: { where: { expiresAt: { lt: Date } } }) => {
        const before = authLoginAttempts.length;
        for (let i = authLoginAttempts.length - 1; i >= 0; i -= 1) {
          const expiresAt = authLoginAttempts[i]!['expiresAt'] as Date;
          if (expiresAt.getTime() < where.expiresAt.lt.getTime()) authLoginAttempts.splice(i, 1);
        }
        return { count: before - authLoginAttempts.length };
      },
    },
    identityLink: {
      findUnique: async ({
        where,
      }: {
        where: { provider_providerSubject: { provider: string; providerSubject: string } };
      }) => {
        const key = where.provider_providerSubject;
        const row = identityLinks.find(
          (l) => l['provider'] === key.provider && l['providerSubject'] === key.providerSubject,
        );
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        identityLinks.push({ ...data });
        return { ...data };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = identityLinks.find((l) => l['id'] === where.id);
        Object.assign(row!, data);
        return { ...row };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        const row = users.find((u) =>
          where.id ? u['id'] === where.id : u['email'] === where.email,
        );
        return row === undefined ? null : { ...row };
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = users.find((u) => u['id'] === where.id);
        if (row === undefined) throw new Error('not found');
        return { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = users.find((u) => u['id'] === where.id);
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
    authSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        authSessions.push({ ...data });
        return { ...data };
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const row = authSessions.find((s) => s['tokenHash'] === where.tokenHash);
        return row === undefined ? null : { ...row };
      },
      deleteMany: async ({ where }: { where: { tokenHash: string } }) => {
        const before = authSessions.length;
        for (let i = authSessions.length - 1; i >= 0; i -= 1) {
          if (authSessions[i]!['tokenHash'] === where.tokenHash) authSessions.splice(i, 1);
        }
        return { count: before - authSessions.length };
      },
    },
    organisationMembership: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        organisationMemberships.filter((m) => m['userId'] === where.userId),
    },
    workspaceMembership: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        workspaceMemberships.filter((m) => m['userId'] === where.userId),
    },
    roleAssignment: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        roleAssignments.filter((a) => a['userId'] === where.userId),
    },
    workspace: {
      findMany: async ({ where }: { where: { organisationId: { in: string[] } } }) =>
        workspaces.filter((w) => where.organisationId.in.includes(w['organisationId'] as string)),
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>) => fn(prisma),
  };

  return {
    prisma: prisma as unknown as PrismaService,
    authLoginAttempts,
    identityLinks,
    users,
    auditEvents,
    authSessions,
    organisationMemberships,
    workspaceMemberships,
    roleAssignments,
    workspaces,
  };
}

async function primeLoginAttempt(prisma: PrismaService, state: string) {
  await prisma.authLoginAttempt.create({
    data: {
      state,
      nonce: 'nonce-1',
      codeVerifier: 'verifier-1',
      redirectUri: REDIRECT_URI,
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
}

describe('AuthenticationService — sign-in and user mapping', () => {
  it('activates an invited user on first sign-in and links the identity', async () => {
    const { prisma, identityLinks, users, auditEvents } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await primeLoginAttempt(prisma, 'state-1');
    const issued = await service.handleCallback('code-1', 'state-1');

    expect(issued.token).toBeTruthy();
    expect(identityLinks).toHaveLength(1);
    expect(identityLinks[0]).toMatchObject({ provider: 'keycloak', providerSubject: 'sub-1' });
    expect(
      (users.find((u) => u['id'] === INVITED_USER) as Record<string, unknown>)['accountState'],
    ).toBe('active');
    expect(auditEvents.some((e) => e['action'] === 'identity_link.created')).toBe(true);
    expect(auditEvents.some((e) => e['action'] === 'user.activated')).toBe(true);
  });

  it('signs in an already-linked user without creating a second link', async () => {
    const { prisma, identityLinks } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await primeLoginAttempt(prisma, 'state-1');
    await service.handleCallback('code-1', 'state-1');
    expect(identityLinks).toHaveLength(1);

    await primeLoginAttempt(prisma, 'state-2');
    await service.handleCallback('code-2', 'state-2');
    expect(identityLinks).toHaveLength(1); // still one — second sign-in reused it
  });

  it('an email change at the provider does not create a duplicate user once linked', async () => {
    const { prisma, users } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await primeLoginAttempt(prisma, 'state-1');
    await service.handleCallback('code-1', 'state-1');

    idp.verified = { ...idp.verified, email: 'newaddress@example.com' };
    await primeLoginAttempt(prisma, 'state-2');
    await service.handleCallback('code-2', 'state-2');

    expect(users).toHaveLength(2); // invited-user + suspended-user, no third created
  });

  it('ATTACK — denies an unknown identity (no link, no matching invited account)', async () => {
    const { prisma } = fakePrisma();
    const idp = new StubIdentityProvider();
    idp.verified = {
      subject: 'nobody',
      email: 'nobody@example.com',
      emailVerified: true,
      name: null,
    };
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await primeLoginAttempt(prisma, 'state-1');
    await expect(service.handleCallback('code-1', 'state-1')).rejects.toMatchObject({
      reason: 'unknown_identity',
    });
  });

  it('ATTACK — denies linking via an unverified email, even if it matches an invited account', async () => {
    const { prisma } = fakePrisma();
    const idp = new StubIdentityProvider();
    idp.verified = { ...idp.verified, emailVerified: false };
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await primeLoginAttempt(prisma, 'state-1');
    await expect(service.handleCallback('code-1', 'state-1')).rejects.toMatchObject({
      reason: 'unknown_identity',
    });
  });

  it('ATTACK — denies sign-in for a suspended account and audits the denial', async () => {
    const { prisma, auditEvents } = fakePrisma();
    const idp = new StubIdentityProvider();
    idp.verified = {
      subject: 'suspended-sub',
      email: 'suspended@example.com',
      emailVerified: true,
      name: null,
    };
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    // The suspended fixture user is not `invited`, so first-link activation
    // does not apply — this exercises denial via an EXISTING link instead.
    await prisma.identityLink.create({
      data: {
        id: LINK_1,
        provider: 'keycloak',
        providerSubject: 'suspended-sub',
        userId: SUSPENDED_USER,
        linkedAt: new Date(),
        lastSignInAt: new Date(),
      },
    });

    await primeLoginAttempt(prisma, 'state-1');
    await expect(service.handleCallback('code-1', 'state-1')).rejects.toMatchObject({
      reason: 'account_suspended',
    });
    expect(auditEvents.some((e) => e['action'] === 'authentication.denied')).toBe(true);
  });

  it('ATTACK — rejects a callback with an unknown or reused state (invalid_callback)', async () => {
    const { prisma } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await expect(service.handleCallback('code-1', 'never-registered-state')).rejects.toMatchObject({
      reason: 'invalid_callback',
    });
  });

  it('ATTACK — rejects a malformed callback missing code or state', async () => {
    const { prisma } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await expect(service.handleCallback('', '')).rejects.toBeInstanceOf(AuthenticationDeniedError);
  });

  it('a state is single-use — a replayed callback is rejected', async () => {
    const { prisma } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await primeLoginAttempt(prisma, 'state-1');
    await service.handleCallback('code-1', 'state-1');

    await expect(service.handleCallback('code-1', 'state-1')).rejects.toMatchObject({
      reason: 'invalid_callback',
    });
  });

  it('propagates identity-provider verification failure as invalid_callback', async () => {
    const { prisma } = fakePrisma();
    const idp = new StubIdentityProvider();
    idp.verifyIdToken = vi.fn().mockRejectedValue(new Error('bad signature'));
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await primeLoginAttempt(prisma, 'state-1');
    await expect(service.handleCallback('code-1', 'state-1')).rejects.toMatchObject({
      reason: 'invalid_callback',
    });
  });

  it('signOut revokes the session so it can no longer be resolved', async () => {
    const { prisma } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await primeLoginAttempt(prisma, 'state-1');
    const issued = await service.handleCallback('code-1', 'state-1');

    expect(await sessions.resolveUserId(issued.token)).not.toBeNull();
    await service.signOut(issued.token);
    expect(await sessions.resolveUserId(issued.token)).toBeNull();
  });

  it('getCurrentUser returns only organisations and workspaces the user actually belongs to', async () => {
    const { prisma } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    // No memberships wired into this fake — asserts the shape degrades to empty lists cleanly.
    const current = await service.getCurrentUser(INVITED_USER);
    if (current.status !== 'ok') throw new Error(`expected 'ok', got '${current.status}'`);
    expect(current.view.organisations).toEqual([]);
    expect(current.view.workspaces).toEqual([]);
    expect(current.view.email).toBe('invited@example.com');
  });

  it('getCurrentUser reports the organisation role on a workspace that has no workspace-scoped assignment of its own', async () => {
    const { prisma, organisationMemberships, workspaceMemberships, roleAssignments } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    organisationMemberships.push({
      userId: INVITED_USER,
      state: 'active',
      organisation: { id: 'org-1', name: 'Org One', createdAt: new Date() },
    });
    workspaceMemberships.push({
      userId: INVITED_USER,
      state: 'active',
      workspace: {
        id: 'workspace-1',
        name: 'Workspace One',
        organisationId: 'org-1',
        createdAt: new Date(),
      },
    });
    // A role assignment for the organisation only — the workspace membership
    // predates its role assignment, exactly as Milestone 1.2 allows.
    //
    // This must resolve to 'admin' on the workspace, not null:
    // `RoleResolutionService.tiersForWorkspace` already honours an
    // organisation-scoped assignment for every workspace under that
    // organisation when deciding real authorization — an organisation
    // administrator's remit extends to their organisation's workspaces. The
    // identity view this test checks must report the same effective role the
    // server will actually enforce, not a narrower one derived only from
    // `WorkspaceMembership` rows.
    roleAssignments.push({
      userId: INVITED_USER,
      role: 'admin',
      organisationId: 'org-1',
      workspaceId: null,
    });

    const current = await service.getCurrentUser(INVITED_USER);
    if (current.status !== 'ok') throw new Error(`expected 'ok', got '${current.status}'`);
    expect(current.view.organisations).toEqual([
      expect.objectContaining({ id: 'org-1', role: 'admin' }),
    ]);
    expect(current.view.workspaces).toEqual([
      expect.objectContaining({ id: 'workspace-1', role: 'admin' }),
    ]);
  });

  it('getCurrentUser lists a workspace the user has no membership row for at all, when an organisation-scoped role cascades to it', async () => {
    const { prisma, organisationMemberships, roleAssignments, workspaces } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    organisationMemberships.push({
      userId: INVITED_USER,
      state: 'active',
      organisation: { id: 'org-1', name: 'Org One', createdAt: new Date() },
    });
    roleAssignments.push({
      userId: INVITED_USER,
      role: 'facilitator',
      organisationId: 'org-1',
      workspaceId: null,
    });
    // No `WorkspaceMembership` row for this user anywhere — the exact
    // production shape that left an organisation-scoped facilitator able to
    // create a session (server-side authorization already cascades) but
    // unable to see the button to open it (the identity view reported no
    // workspaces at all).
    workspaces.push({
      id: 'workspace-1',
      name: 'Workspace One',
      organisationId: 'org-1',
      description: null,
      createdAt: new Date(),
    });

    const current = await service.getCurrentUser(INVITED_USER);
    if (current.status !== 'ok') throw new Error(`expected 'ok', got '${current.status}'`);
    expect(current.view.workspaces).toEqual([
      expect.objectContaining({ id: 'workspace-1', role: 'facilitator' }),
    ]);
  });

  it('getCurrentUser prefers a workspace-scoped role over a cascaded organisation-scoped role when both exist', async () => {
    const { prisma, organisationMemberships, workspaceMemberships, roleAssignments } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    organisationMemberships.push({
      userId: INVITED_USER,
      state: 'active',
      organisation: { id: 'org-1', name: 'Org One', createdAt: new Date() },
    });
    workspaceMemberships.push({
      userId: INVITED_USER,
      state: 'active',
      workspace: {
        id: 'workspace-1',
        name: 'Workspace One',
        organisationId: 'org-1',
        createdAt: new Date(),
      },
    });
    roleAssignments.push(
      { userId: INVITED_USER, role: 'reviewer', organisationId: 'org-1', workspaceId: null },
      {
        userId: INVITED_USER,
        role: 'facilitator',
        organisationId: null,
        workspaceId: 'workspace-1',
      },
    );

    const current = await service.getCurrentUser(INVITED_USER);
    if (current.status !== 'ok') throw new Error(`expected 'ok', got '${current.status}'`);
    expect(current.view.workspaces).toEqual([
      expect.objectContaining({ id: 'workspace-1', role: 'facilitator' }),
    ]);
  });

  it('getCurrentUser does not cascade an organisation-scoped role while the organisation membership itself is not in good standing', async () => {
    const { prisma, organisationMemberships, roleAssignments, workspaces } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    organisationMemberships.push({
      userId: INVITED_USER,
      state: 'suspended',
      organisation: { id: 'org-1', name: 'Org One', createdAt: new Date() },
    });
    roleAssignments.push({
      userId: INVITED_USER,
      role: 'facilitator',
      organisationId: 'org-1',
      workspaceId: null,
    });
    workspaces.push({
      id: 'workspace-1',
      name: 'Workspace One',
      organisationId: 'org-1',
      description: null,
      createdAt: new Date(),
    });

    const current = await service.getCurrentUser(INVITED_USER);
    if (current.status !== 'ok') throw new Error(`expected 'ok', got '${current.status}'`);
    expect(current.view.organisations).toEqual([]);
    expect(current.view.workspaces).toEqual([]);
  });

  it("getCurrentUser does not leak a different organisation's workspaces from an unrelated organisation-scoped role", async () => {
    const { prisma, organisationMemberships, roleAssignments, workspaces } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    organisationMemberships.push({
      userId: INVITED_USER,
      state: 'active',
      organisation: { id: 'org-1', name: 'Org One', createdAt: new Date() },
    });
    roleAssignments.push({
      userId: INVITED_USER,
      role: 'facilitator',
      organisationId: 'org-1',
      workspaceId: null,
    });
    // A workspace under a different organisation the user holds no role in.
    workspaces.push({
      id: 'workspace-other-org',
      name: 'Someone Else’s Workspace',
      organisationId: 'org-2',
      description: null,
      createdAt: new Date(),
    });

    const current = await service.getCurrentUser(INVITED_USER);
    if (current.status !== 'ok') throw new Error(`expected 'ok', got '${current.status}'`);
    expect(current.view.workspaces).toEqual([]);
  });

  it('getCurrentUser reports not_found for an unknown user id', async () => {
    const { prisma } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    expect(await service.getCurrentUser('nonexistent')).toEqual({ status: 'not_found' });
  });

  it('getCurrentUser reports suspended for a suspended account, without leaking membership data', async () => {
    const { prisma } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    expect(await service.getCurrentUser(SUSPENDED_USER)).toEqual({ status: 'suspended' });
  });
});

describe('AuthenticationService — atomic single-use state consumption', () => {
  it('exactly one of two concurrent callbacks carrying the same state succeeds', async () => {
    const { prisma } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await primeLoginAttempt(prisma, 'shared-state');

    const results = await Promise.allSettled([
      service.handleCallback('code-1', 'shared-state'),
      service.handleCallback('code-1', 'shared-state'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      reason: 'invalid_callback',
    });
  });
});

describe('AuthenticationService — login-attempt retention', () => {
  it('starting a new sign-in purges expired login attempts', async () => {
    const { prisma, authLoginAttempts } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await prisma.authLoginAttempt.create({
      data: {
        state: 'long-expired',
        nonce: 'n',
        codeVerifier: 'v',
        redirectUri: REDIRECT_URI,
        expiresAt: new Date(Date.now() - 3_600_000),
      },
    });

    await service.startLogin();

    expect(authLoginAttempts.some((a) => a['state'] === 'long-expired')).toBe(false);
  });

  it('starting a new sign-in preserves other still-active login attempts', async () => {
    const { prisma, authLoginAttempts } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await primeLoginAttempt(prisma, 'still-active');
    await service.startLogin();

    expect(authLoginAttempts.some((a) => a['state'] === 'still-active')).toBe(true);
  });

  it('purging expired attempts removes exactly the expired rows, not more', async () => {
    const { prisma, authLoginAttempts } = fakePrisma();
    const idp = new StubIdentityProvider();
    const sessions = new SessionService(prisma);
    const service = new AuthenticationService(prisma, idp, sessions, REDIRECT_URI, 480);

    await prisma.authLoginAttempt.create({
      data: {
        state: 'expired-1',
        nonce: 'n',
        codeVerifier: 'v',
        redirectUri: REDIRECT_URI,
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    await prisma.authLoginAttempt.create({
      data: {
        state: 'expired-2',
        nonce: 'n',
        codeVerifier: 'v',
        redirectUri: REDIRECT_URI,
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    await primeLoginAttempt(prisma, 'active-1');

    await service.startLogin();

    const remainingStates = authLoginAttempts.map((a) => a['state']);
    expect(remainingStates).not.toContain('expired-1');
    expect(remainingStates).not.toContain('expired-2');
    expect(remainingStates).toContain('active-1');
  });
});
