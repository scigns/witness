/**
 * Service-level tests for `UsersService`, against an in-memory Prisma double.
 *
 * No live Postgres was available while building this capability (see the PR
 * description) — these tests exercise the actual service class and the actual
 * `@witness/domain` code it calls, with only persistence swapped for an
 * in-memory table. They are not a substitute for the manual verification
 * against a real database recorded in the PR; they are what could be run
 * without one.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { UsersService } from './users.service.js';

const ADMIN: Principal = {
  subject: 'dev:admin',
  displayName: 'Admin',
  kind: 'human',
  roles: ['admin'],
};

function fakePrisma() {
  const users: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    user: {
      findMany: async ({ take }: { take?: number }) =>
        users.slice(0, take).map((row) => ({ ...row })),
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        const row =
          where.id !== undefined
            ? users.find((u) => u['id'] === where.id)
            : users.find((u) => u['email'] === where.email);
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        users.push({ ...data });
        return { ...data };
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

  return { prisma: prisma as unknown as PrismaService, users, auditEvents };
}

describe('UsersService', () => {
  it('creates a user and records an audit event', async () => {
    const { prisma, auditEvents } = fakePrisma();
    const service = new UsersService(prisma);

    const created = await service.create(
      { email: 'Mele@Example.com', displayName: 'Mele Tupou' },
      ADMIN,
    );

    expect(created.email).toBe('mele@example.com');
    expect(created.accountState).toBe('invited');
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({ action: 'user.created', subjectType: 'user' });
  });

  it('refuses a duplicate email, case-insensitively', async () => {
    const { prisma } = fakePrisma();
    const service = new UsersService(prisma);

    await service.create({ email: 'mele@example.com', displayName: 'Mele' }, ADMIN);

    await expect(
      service.create({ email: 'Mele@EXAMPLE.com', displayName: 'Someone Else' }, ADMIN),
    ).rejects.toThrow(ConflictException);
  });

  it('lists created users', async () => {
    const { prisma } = fakePrisma();
    const service = new UsersService(prisma);

    await service.create({ email: 'a@example.com', displayName: 'A' }, ADMIN);
    await service.create({ email: 'b@example.com', displayName: 'B' }, ADMIN);

    const listed = await service.list();
    expect(listed.map((u) => u.email).sort()).toEqual(['a@example.com', 'b@example.com']);
  });

  it('404s for a missing user', async () => {
    const { prisma } = fakePrisma();
    const service = new UsersService(prisma);

    await expect(service.get('does-not-exist')).rejects.toThrow(NotFoundException);
  });
});
