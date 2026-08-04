import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import { SessionService } from './session.service.js';

function fakePrisma() {
  const sessions: Record<string, unknown>[] = [];

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
      deleteMany: async ({ where }: { where: { tokenHash: string } }) => {
        const before = sessions.length;
        for (let i = sessions.length - 1; i >= 0; i -= 1) {
          if (sessions[i]!['tokenHash'] === where.tokenHash) sessions.splice(i, 1);
        }
        return { count: before - sessions.length };
      },
    },
  };

  return { prisma: prisma as unknown as PrismaService, sessions };
}

describe('SessionService', () => {
  it('issues a session and can resolve the user id from the raw token', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionService(prisma);

    const { token, expiresAt } = await service.issue('user-1', 60);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const resolved = await service.resolveUserId(token);
    expect(resolved).toBe('user-1');
  });

  it('never persists the raw token — only its hash', async () => {
    const { prisma, sessions } = fakePrisma();
    const service = new SessionService(prisma);

    const { token } = await service.issue('user-1', 60);

    expect(sessions).toHaveLength(1);
    const stored = sessions[0] as Record<string, unknown>;
    expect(stored['tokenHash']).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('returns null for an unknown token', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionService(prisma);
    expect(await service.resolveUserId('never-issued')).toBeNull();
  });

  it('ATTACK — returns null for an expired session', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionService(prisma);

    const { token } = await service.issue('user-1', -1); // already expired
    expect(await service.resolveUserId(token)).toBeNull();
  });

  it('revoke is idempotent and makes the token unresolvable afterward', async () => {
    const { prisma } = fakePrisma();
    const service = new SessionService(prisma);

    const { token } = await service.issue('user-1', 60);
    await service.revoke(token);
    expect(await service.resolveUserId(token)).toBeNull();

    // Revoking again (already-signed-out) must not throw.
    await expect(service.revoke(token)).resolves.not.toThrow();
  });

  describe('resolveSession — distinguishing "never signed in" from "session expired"', () => {
    it('reports valid with the user id for a live session', async () => {
      const { prisma } = fakePrisma();
      const service = new SessionService(prisma);
      const { token } = await service.issue('user-1', 60);

      expect(await service.resolveSession(token)).toEqual({ status: 'valid', userId: 'user-1' });
    });

    it('reports not_found for a token that was never issued', async () => {
      const { prisma } = fakePrisma();
      const service = new SessionService(prisma);

      expect(await service.resolveSession('never-issued')).toEqual({ status: 'not_found' });
    });

    it('reports expired — not not_found — for a token whose session has lapsed', async () => {
      const { prisma } = fakePrisma();
      const service = new SessionService(prisma);
      const { token } = await service.issue('user-1', -1);

      expect(await service.resolveSession(token)).toEqual({ status: 'expired' });
    });
  });
});
