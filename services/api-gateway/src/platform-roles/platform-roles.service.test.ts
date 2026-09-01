import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformRolesService } from './platform-roles.service.js';

const { appendAuditEvent } = vi.hoisted(() => ({ appendAuditEvent: vi.fn() }));
vi.mock('../infrastructure/audit.helper.js', () => ({ appendAuditEvent }));
vi.mock('../infrastructure/actor.helper.js', () => ({
  resolveActor: vi
    .fn()
    .mockResolvedValue({ id: 'actor-1', kind: 'human', displayName: 'Operator' }),
}));

const USER = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'founder@example.com',
  displayName: 'Founder',
  accountState: 'active',
  identityLinks: [{ id: 'link-1' }],
};
const PRINCIPAL = {
  subject: 'user:operator',
  displayName: 'Operator',
  kind: 'human' as const,
  roles: [],
};

function fakePrisma(
  options: { user?: typeof USER | null; assignments?: Record<string, unknown>[] } = {},
) {
  const assignments = options.assignments ?? [];
  const user = options.user === undefined ? USER : options.user;
  const roleAssignment = {
    findMany: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(assignments.map((row) => ({ ...row, user: row['user'] ?? user }))),
      ),
    findFirst: vi
      .fn()
      .mockImplementation(({ where }: { where: { userId?: string } }) =>
        Promise.resolve(
          assignments.find((row) => where.userId === undefined || row['userId'] === where.userId) ??
            null,
        ),
      ),
    create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const row = { ...data, user };
      assignments.push(row);
      return Promise.resolve(row);
    }),
    delete: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
      const index = assignments.findIndex((row) => row['id'] === where.id);
      return Promise.resolve(assignments.splice(index, 1)[0]);
    }),
    count: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          assignments.filter(
            (row) =>
              row['role'] === 'admin' &&
              (row['user'] as typeof USER | undefined)?.accountState === 'active' &&
              ((row['user'] as typeof USER | undefined)?.identityLinks.length ?? 0) > 0,
          ).length,
        ),
      ),
  };
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    actor: { findFirst: vi.fn(), create: vi.fn() },
    roleAssignment,
    $executeRaw: vi.fn(),
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma, assignments, roleAssignment };
}

describe('PlatformRolesService', () => {
  beforeEach(() => appendAuditEvent.mockReset());

  it('lists platform assignments with safe identity status', async () => {
    const row = {
      id: 'assignment-1',
      userId: USER.id,
      role: 'admin',
      scopeType: 'platform',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      user: USER,
    };
    const { prisma } = fakePrisma({ assignments: [row] });
    const result = await new PlatformRolesService(prisma as never).list();
    expect(result).toEqual([
      expect.objectContaining({ email: USER.email, role: 'admin', oidcLinked: true }),
    ]);
  });

  it('grants a verified existing user and audits the transition', async () => {
    const { prisma, assignments } = fakePrisma();
    const result = await new PlatformRolesService(prisma as never).grant(
      { email: USER.email, role: 'admin', reason: 'Approved commercial operator' },
      PRINCIPAL,
    );
    expect(result.role).toBe('admin');
    expect(assignments).toHaveLength(1);
    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      'role_assignment',
      expect.any(String),
      expect.objectContaining({ action: 'platform_role.granted' }),
      expect.any(Date),
    );
  });

  it('makes a duplicate grant idempotent without a second audit event', async () => {
    const existing = {
      id: 'assignment-1',
      userId: USER.id,
      role: 'admin',
      scopeType: 'platform',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: USER,
    };
    const { prisma, assignments } = fakePrisma({ assignments: [existing] });
    await new PlatformRolesService(prisma as never).grant(
      { email: USER.email, role: 'admin', reason: 'Approved commercial operator' },
      PRINCIPAL,
    );
    expect(assignments).toHaveLength(1);
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });

  it('rejects a target without a verified linked identity', async () => {
    const { prisma } = fakePrisma({ user: { ...USER, identityLinks: [] } });
    await expect(
      new PlatformRolesService(prisma as never).grant(
        { email: USER.email, role: 'admin', reason: 'Approved commercial operator' },
        PRINCIPAL,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'VERIFIED_OIDC_IDENTITY_REQUIRED' } } });
  });

  it('revokes authority without changing organisation membership and audits it', async () => {
    const existing = {
      id: 'assignment-1',
      userId: USER.id,
      role: 'admin',
      scopeType: 'platform',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: USER,
    };
    const replacement = {
      id: 'assignment-2',
      userId: 'replacement',
      role: 'admin',
      scopeType: 'platform',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { ...USER, id: 'replacement', email: 'other@example.com' },
    };
    const { prisma, assignments } = fakePrisma({ assignments: [existing, replacement] });
    const memberships = { untouched: true };
    await new PlatformRolesService(prisma as never).revoke(
      USER.id,
      { reason: 'Authority is no longer required' },
      PRINCIPAL,
    );
    expect(assignments).toHaveLength(1);
    expect(memberships).toEqual({ untouched: true });
    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      'role_assignment',
      existing.id,
      expect.objectContaining({ action: 'platform_role.revoked' }),
      expect.any(Date),
    );
  });

  it('prevents revocation of the last usable platform admin', async () => {
    const existing = {
      id: 'assignment-1',
      userId: USER.id,
      role: 'admin',
      scopeType: 'platform',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: USER,
    };
    const { prisma } = fakePrisma({ assignments: [existing] });
    await expect(
      new PlatformRolesService(prisma as never).revoke(
        USER.id,
        { reason: 'Authority is no longer required' },
        PRINCIPAL,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'LAST_PLATFORM_ADMIN' } } });
  });

  it('rejects revocation of an absent assignment', async () => {
    const { prisma } = fakePrisma();
    await expect(
      new PlatformRolesService(prisma as never).revoke(
        USER.id,
        { reason: 'Authority is no longer required' },
        PRINCIPAL,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'PLATFORM_ROLE_NOT_FOUND' } } });
  });
});
