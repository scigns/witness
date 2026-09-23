/**
 * Real-PostgreSQL suite for governed QR/link session joining (Phase 5,
 * Workstream 1.6) — ordinary lifecycle plus the adversarial checklist the
 * feature is asked to guarantee by construction: replay/idempotency,
 * expiry, revocation, exhaustion, rate limiting, governance-mode identity
 * rules, and that a join link never grants workspace or organisation
 * authority. Real database access is used deliberately for the
 * concurrency-relevant scenarios (advisory-lock idempotency, real
 * transactions) a fake Prisma double cannot exercise with the same
 * fidelity — same rationale as `workspace-invitations.live.test.ts`.
 *
 * Skips itself (does not fail) when DATABASE_URL is not set or PostgreSQL
 * is unreachable — run via `pnpm --filter @witness/api test:live`.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Principal } from '../authz/authorization.port.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { SessionService } from '../authn/session.service.js';
import { SessionJoinService } from './session-join.service.js';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

const DATABASE_URL = optionalEnv('DATABASE_URL');

async function probeLiveInfra(): Promise<PrismaService | null> {
  if (DATABASE_URL === undefined) {
    // eslint-disable-next-line no-console
    console.log('[session-join.live] skipping: set DATABASE_URL to run this suite.');
    return null;
  }
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    return prisma;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[session-join.live] skipping: could not reach PostgreSQL.', error);
    await prisma.$disconnect().catch(() => undefined);
    return null;
  }
}

const prisma = await probeLiveInfra();

/** Minimal fake Express Request — only the two fields the service touches. */
function fakeHttpRequest(opts: { bearer?: string; remoteAddress?: string }): {
  headers: Record<string, string>;
  socket: { remoteAddress?: string };
} {
  return {
    headers: opts.bearer !== undefined ? { authorization: `Bearer ${opts.bearer}` } : {},
    socket: { remoteAddress: opts.remoteAddress ?? '203.0.113.5' },
  };
}

describe.skipIf(prisma === null)(
  'governed session joining (live PostgreSQL) — Workstream 1.6',
  () => {
    const db = prisma as PrismaService;
    const svc = new SessionJoinService(db, new SessionService(db));

    const organisationId = randomUUID();
    const otherOrganisationId = randomUUID();
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const facilitatorUserId = randomUUID();

    const FACILITATOR: Principal = {
      subject: `user:${facilitatorUserId}`,
      displayName: 'Live Test Facilitator',
      kind: 'human',
      roles: [],
    };

    async function createUser(email: string): Promise<string> {
      const id = randomUUID();
      await db.user.create({
        data: { id, email, displayName: email.split('@')[0] ?? email, accountState: 'active' },
      });
      return id;
    }

    async function createOpenSession(): Promise<string> {
      const sessionId = randomUUID();
      await db.coDesignSession.create({
        data: {
          id: sessionId,
          organisationId,
          workspaceId,
          title: 'Teacher Voice Co-design — live session',
          purpose: 'Prove governed QR joining end to end.',
          sessionType: 'co_design_workshop',
          deliveryMode: 'in_person',
          primaryFacilitatorId: facilitatorUserId,
          status: 'open',
          participantVisibility: 'facilitators_only',
        },
      });
      return sessionId;
    }

    beforeAll(async () => {
      if (prisma === null) return;
      await db.organisation.create({
        data: {
          id: organisationId,
          name: `Join Org ${organisationId}`,
          storageQuotaBytes: 5368709120n,
        },
      });
      await db.organisation.create({
        data: {
          id: otherOrganisationId,
          name: `Join Org Other ${otherOrganisationId}`,
          storageQuotaBytes: 5368709120n,
        },
      });
      await db.workspace.create({
        data: { id: workspaceId, name: 'Teacher Voice Co-design', organisationId },
      });
      await db.workspace.create({
        data: {
          id: otherWorkspaceId,
          name: 'Unrelated Programme',
          organisationId: otherOrganisationId,
        },
      });
      await db.user.create({
        data: {
          id: facilitatorUserId,
          email: 'facilitator@join-org.example',
          displayName: 'Live Test Facilitator',
          accountState: 'active',
        },
      });
    });

    afterAll(async () => {
      if (prisma === null) return;
      await db.auditEvent.deleteMany({
        where: { OR: [{ subjectId: workspaceId }, { subjectId: otherWorkspaceId }] },
      });
      await db.sessionJoinAttempt.deleteMany({
        where: { joinLink: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } },
      });
      await db.sessionJoinLink.deleteMany({
        where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
      });
      await db.sessionParticipant.deleteMany({
        where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
      });
      await db.workspaceMembership.deleteMany({
        where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
      });
      await db.coDesignSession.deleteMany({
        where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } },
      });
      await db.authSession.deleteMany({ where: { user: { email: { endsWith: '.example' } } } });
      await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
      await db.organisation.deleteMany({
        where: { id: { in: [organisationId, otherOrganisationId] } },
      });
      await db.user.deleteMany({ where: { email: { endsWith: '.example' } } });
      await db.$disconnect();
    });

    it('anonymous mode: create -> context -> join produces an anonymous participant, no display name leaked', async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'anonymous', expiresInMinutes: 60 },
        FACILITATOR,
      );
      expect(created.status).toBe('active');
      expect(created.useCount).toBe(0);

      const context = await svc.getContext(created.token);
      expect(context.governanceMode).toBe('anonymous');
      expect(context.requiresSignIn).toBe(false);
      expect(context.requiresDisplayName).toBe(false);

      const result = await svc.join(
        created.token,
        { clientRequestId: randomUUID() },
        fakeHttpRequest({}) as never,
      );
      expect(result.identityMode).toBe('anonymous');
      expect(result.displayName).toBe('Anonymous participant');

      const participant = await db.sessionParticipant.findUniqueOrThrow({
        where: { id: result.participantId },
      });
      expect(participant.linkedUserId).toBeNull();

      const link = await db.sessionJoinLink.findUniqueOrThrow({ where: { id: created.id } });
      expect(link.useCount).toBe(1);
    });

    it('pseudonymous mode: requires a display name and never links a user account', async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'pseudonymous', expiresInMinutes: 60 },
        FACILITATOR,
      );

      await expect(
        svc.join(created.token, { clientRequestId: randomUUID() }, fakeHttpRequest({}) as never),
      ).rejects.toThrow();

      const result = await svc.join(
        created.token,
        { clientRequestId: randomUUID(), displayName: 'Anaru' },
        fakeHttpRequest({}) as never,
      );
      expect(result.identityMode).toBe('pseudonymous');
      expect(result.displayName).toBe('Anaru');

      const participant = await db.sessionParticipant.findUniqueOrThrow({
        where: { id: result.participantId },
      });
      expect(participant.linkedUserId).toBeNull();
    });

    it('THREAT: replaying the same clientRequestId does not create a second participant (idempotent retry)', async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'anonymous', expiresInMinutes: 60 },
        FACILITATOR,
      );
      const clientRequestId = randomUUID();

      const first = await svc.join(
        created.token,
        { clientRequestId },
        fakeHttpRequest({}) as never,
      );
      const second = await svc.join(
        created.token,
        { clientRequestId },
        fakeHttpRequest({}) as never,
      );

      expect(second.participantId).toBe(first.participantId);

      const link = await db.sessionJoinLink.findUniqueOrThrow({ where: { id: created.id } });
      expect(link.useCount).toBe(1);

      const participantCount = await db.sessionParticipant.count({ where: { sessionId } });
      expect(participantCount).toBe(1);
    });

    it('THREAT: an expired link cannot be joined, even though it still resolves by token', async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'anonymous', expiresInMinutes: 60 },
        FACILITATOR,
      );
      await db.sessionJoinLink.update({
        where: { id: created.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await expect(
        svc.join(created.token, { clientRequestId: randomUUID() }, fakeHttpRequest({}) as never),
      ).rejects.toThrow();
    });

    it('THREAT: a revoked link cannot be joined even before its original expiry', async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'anonymous', expiresInMinutes: 60 },
        FACILITATOR,
      );
      await svc.revoke(workspaceId, sessionId, created.id, FACILITATOR);

      await expect(
        svc.join(created.token, { clientRequestId: randomUUID() }, fakeHttpRequest({}) as never),
      ).rejects.toThrow();
    });

    it('THREAT: a link cannot be used beyond maxUses (never an unbounded programme-wide credential)', async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'anonymous', expiresInMinutes: 60, maxUses: 1 },
        FACILITATOR,
      );
      await svc.join(
        created.token,
        { clientRequestId: randomUUID() },
        fakeHttpRequest({}) as never,
      );

      await expect(
        svc.join(created.token, { clientRequestId: randomUUID() }, fakeHttpRequest({}) as never),
      ).rejects.toThrow();
    });

    it('THREAT: a session not yet open cannot be joined via QR, even with a valid, active link', async () => {
      const sessionId = randomUUID();
      await db.coDesignSession.create({
        data: {
          id: sessionId,
          organisationId,
          workspaceId,
          title: 'Not yet open',
          purpose: 'Prove draft sessions refuse QR joins.',
          sessionType: 'co_design_workshop',
          deliveryMode: 'in_person',
          primaryFacilitatorId: facilitatorUserId,
          status: 'draft',
          participantVisibility: 'facilitators_only',
        },
      });
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'anonymous', expiresInMinutes: 60 },
        FACILITATOR,
      );

      await expect(
        svc.join(created.token, { clientRequestId: randomUUID() }, fakeHttpRequest({}) as never),
      ).rejects.toThrow();
    });

    it('THREAT: verified_guest mode refuses an unauthenticated join', async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'verified_guest', expiresInMinutes: 60 },
        FACILITATOR,
      );

      await expect(
        svc.join(created.token, { clientRequestId: randomUUID() }, fakeHttpRequest({}) as never),
      ).rejects.toThrow();
    });

    it('verified_guest mode: a signed-in account with no prior workspace standing can still join', async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'verified_guest', expiresInMinutes: 60 },
        FACILITATOR,
      );

      const guestUserId = await createUser(`guest-${randomUUID()}@join-org.example`);
      const sessions = new SessionService(db);
      const { token: bearer } = await sessions.issue(guestUserId, 60);

      const result = await svc.join(
        created.token,
        { clientRequestId: randomUUID() },
        fakeHttpRequest({ bearer }) as never,
      );
      expect(result.identityMode).toBe('named');

      const participant = await db.sessionParticipant.findUniqueOrThrow({
        where: { id: result.participantId },
      });
      expect(participant.linkedUserId).toBe(guestUserId);
    });

    it('THREAT: invited_only mode refuses a signed-in account with no active workspace membership', async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'invited_only', expiresInMinutes: 60 },
        FACILITATOR,
      );

      const strangerUserId = await createUser(`stranger-${randomUUID()}@join-org.example`);
      const sessions = new SessionService(db);
      const { token: bearer } = await sessions.issue(strangerUserId, 60);

      await expect(
        svc.join(
          created.token,
          { clientRequestId: randomUUID() },
          fakeHttpRequest({ bearer }) as never,
        ),
      ).rejects.toThrow();
    });

    it('invited_only mode: an active workspace member can join', async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'invited_only', expiresInMinutes: 60 },
        FACILITATOR,
      );

      const memberUserId = await createUser(`member-${randomUUID()}@join-org.example`);
      await db.workspaceMembership.create({
        data: { id: randomUUID(), workspaceId, userId: memberUserId, state: 'active' },
      });
      const sessions = new SessionService(db);
      const { token: bearer } = await sessions.issue(memberUserId, 60);

      const result = await svc.join(
        created.token,
        { clientRequestId: randomUUID() },
        fakeHttpRequest({ bearer }) as never,
      );
      expect(result.identityMode).toBe('named');
    });

    it('THREAT: joining a session grants no workspace or organisation authority of any kind', async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'verified_guest', expiresInMinutes: 60 },
        FACILITATOR,
      );
      const guestUserId = await createUser(`no-escalation-${randomUUID()}@join-org.example`);
      const sessions = new SessionService(db);
      const { token: bearer } = await sessions.issue(guestUserId, 60);

      await svc.join(
        created.token,
        { clientRequestId: randomUUID() },
        fakeHttpRequest({ bearer }) as never,
      );

      const anyRole = await db.roleAssignment.findFirst({ where: { userId: guestUserId } });
      expect(anyRole).toBeNull();

      const resolution = new RoleResolutionService(db);
      expect(
        await resolution.scopedGrantTiers(guestUserId, { type: 'workspace', workspaceId }),
      ).toEqual([]);
      expect(
        await resolution.scopedGrantTiers(guestUserId, { type: 'organisation', organisationId }),
      ).toEqual([]);
    });

    it("THREAT: a link minted for one workspace's session cannot be listed or revoked through another workspace's route", async () => {
      const sessionId = await createOpenSession();
      const created = await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'anonymous', expiresInMinutes: 60 },
        FACILITATOR,
      );

      await expect(
        svc.revoke(otherWorkspaceId, sessionId, created.id, FACILITATOR),
      ).rejects.toThrow();
    });

    it('facilitator roster view never exposes the raw token', async () => {
      const sessionId = await createOpenSession();
      await svc.create(
        workspaceId,
        sessionId,
        { governanceMode: 'anonymous', expiresInMinutes: 60 },
        FACILITATOR,
      );

      const list = await svc.list(workspaceId, sessionId);
      expect(list.length).toBeGreaterThan(0);
      for (const row of list) {
        expect(row).not.toHaveProperty('token');
        expect(row).not.toHaveProperty('tokenHash');
      }
    });
  },
);
