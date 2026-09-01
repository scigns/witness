import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recoverPlatformRole } from './platform-role-recovery.js';

const { appendAuditEvent } = vi.hoisted(() => ({ appendAuditEvent: vi.fn() }));
vi.mock('../infrastructure/audit.helper.js', () => ({ appendAuditEvent }));

const USER = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'founder@example.com',
  displayName: 'Founder',
  accountState: 'active',
  identityLinks: [{ id: 'link-1' }],
};

function fakePrisma(options: { usableAdmins?: number; user?: typeof USER | null } = {}) {
  const assignments: Record<string, unknown>[] = [];
  const tx = {
    $executeRaw: vi.fn(),
    roleAssignment: {
      count: vi.fn().mockResolvedValue(options.usableAdmins ?? 0),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        assignments.push(data);
        return Promise.resolve(data);
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(options.user === undefined ? USER : options.user),
    },
    actor: {
      create: vi.fn().mockResolvedValue({
        id: '20000000-0000-4000-8000-000000000001',
        kind: 'system',
        displayName: 'Platform authority recovery',
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn().mockImplementation((fn: (value: unknown) => unknown) => fn(tx)),
  };
  return { prisma, assignments };
}

describe('recoverPlatformRole', () => {
  beforeEach(() => appendAuditEvent.mockReset());

  it('provisions and audits recovery only when no usable admin exists', async () => {
    const { prisma, assignments } = fakePrisma();
    await expect(
      recoverPlatformRole(prisma as never, {
        email: USER.email,
        role: 'admin',
        reason: 'Bootstrap operator is unavailable',
        confirmation: 'RECOVER_PLATFORM_ADMIN',
      }),
    ).resolves.toEqual({ email: USER.email, role: 'admin' });
    expect(assignments).toHaveLength(1);
    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      'role_assignment',
      expect.any(String),
      expect.objectContaining({ action: 'platform_role.recovered' }),
      expect.any(Date),
    );
  });

  it('fails closed when a usable platform admin already exists', async () => {
    const { prisma } = fakePrisma({ usableAdmins: 1 });
    await expect(
      recoverPlatformRole(prisma as never, {
        email: USER.email,
        role: 'admin',
        reason: 'Bootstrap operator is unavailable',
        confirmation: 'RECOVER_PLATFORM_ADMIN',
      }),
    ).rejects.toThrow('usable platform administrator already exists');
  });

  it('rejects an unverified target', async () => {
    const { prisma } = fakePrisma({ user: { ...USER, identityLinks: [] } });
    await expect(
      recoverPlatformRole(prisma as never, {
        email: USER.email,
        role: 'admin',
        reason: 'Bootstrap operator is unavailable',
        confirmation: 'RECOVER_PLATFORM_ADMIN',
      }),
    ).rejects.toThrow('verified OIDC sign-in');
  });

  it('requires explicit recovery confirmation', async () => {
    const { prisma } = fakePrisma();
    await expect(
      recoverPlatformRole(prisma as never, {
        email: USER.email,
        role: 'admin',
        reason: 'Bootstrap operator is unavailable',
        confirmation: '',
      }),
    ).rejects.toThrow('explicit RECOVER_PLATFORM_ADMIN confirmation');
  });
});
