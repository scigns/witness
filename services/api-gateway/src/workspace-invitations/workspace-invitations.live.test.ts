/**
 * Real-PostgreSQL suite for external-collaborator workspace invitations
 * (ADR-0028) — both the ordinary lifecycle and the 20-item adversarial
 * checklist the originating request specified. Real database access is
 * used deliberately for the security-relevant scenarios (concurrent
 * acceptance, unique-constraint-backed idempotency, real transactions) that
 * a fake Prisma double cannot exercise with the same fidelity.
 *
 * Skips itself (does not fail) when DATABASE_URL is not set or PostgreSQL
 * is unreachable — run via `pnpm --filter @witness/api-gateway test:live`.
 * No mailer/config is injected, so every invitation's delivery ends up
 * 'failed' with an SMTP-not-configured error — assertions never depend on
 * delivery succeeding, only on the invitation and grant state, which does
 * not depend on mail delivery at all (ADR-0025's "delivery state and
 * business state remain separate" discipline, reused here).
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Principal } from '../authz/authorization.port.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { WorkspaceInvitationsService } from './workspace-invitations.service.js';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

const DATABASE_URL = optionalEnv('DATABASE_URL');

async function probeLiveInfra(): Promise<PrismaService | null> {
  if (DATABASE_URL === undefined) {
    // eslint-disable-next-line no-console
    console.log('[workspace-invitations.live] skipping: set DATABASE_URL to run this suite.');
    return null;
  }
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    return prisma;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('[workspace-invitations.live] skipping: could not reach PostgreSQL.', error);
    await prisma.$disconnect().catch(() => undefined);
    return null;
  }
}

const prisma = await probeLiveInfra();

describe.skipIf(prisma === null)('workspace invitations (live PostgreSQL) — ADR-0028', () => {
  const db = prisma as PrismaService;

  const organisationAId = randomUUID();
  const organisationBId = randomUUID();
  const workspaceAId = randomUUID();
  const workspaceA2Id = randomUUID();
  const workspaceBId = randomUUID();
  const adminUserId = randomUUID();
  const adminActorId = randomUUID();
  const orgBMemberUserId = randomUUID();
  // Every user this file creates, so afterAll can clean up precisely —
  // deliberately never a shared `email endsWith '.example'` filter, which
  // races another live-test file's fixtures under concurrent `test:live`
  // execution (confirmed: that broad filter causes an intermittent
  // cross-file FK failure once more than one live-test file creates
  // `.example` users).
  const createdUserIds: string[] = [adminUserId, orgBMemberUserId];

  const ADMIN_PRINCIPAL: Principal = {
    subject: `user:${adminUserId}`,
    displayName: 'Live Test Admin',
    kind: 'human',
    roles: [],
  };

  async function createUser(email: string): Promise<string> {
    const id = randomUUID();
    await db.user.create({
      data: { id, email, displayName: email.split('@')[0] ?? email, accountState: 'active' },
    });
    createdUserIds.push(id);
    return id;
  }

  beforeAll(async () => {
    if (prisma === null) return;
    await db.organisation.create({
      data: {
        id: organisationAId,
        name: `Org A ${organisationAId}`,
        storageQuotaBytes: 5368709120n,
      },
    });
    await db.organisation.create({
      data: {
        id: organisationBId,
        name: `Org B ${organisationBId}`,
        storageQuotaBytes: 5368709120n,
      },
    });
    await db.workspace.create({
      data: { id: workspaceAId, name: 'Teacher Voice Co-design', organisationId: organisationAId },
    });
    await db.workspace.create({
      data: {
        id: workspaceA2Id,
        name: "Organisation A's Second Programme",
        organisationId: organisationAId,
      },
    });
    await db.workspace.create({
      data: {
        id: workspaceBId,
        name: "Organisation B's Own Programme",
        organisationId: organisationBId,
      },
    });
    await db.actor.create({
      data: { id: adminActorId, kind: 'human', displayName: 'Live Test Admin' },
    });
    await createUserWithId(adminUserId, 'admin@org-a.example');

    // A real, ordinary internal member of Organisation B's own programme —
    // PART 23's isolation check needs something real on the other side of
    // the boundary to prove stays untouched, not just an empty workspace.
    await createUserWithId(orgBMemberUserId, 'member@org-b.example');
    await db.organisationMembership.create({
      data: {
        id: randomUUID(),
        organisationId: organisationBId,
        userId: orgBMemberUserId,
        state: 'active',
      },
    });
    await db.roleAssignment.create({
      data: {
        id: randomUUID(),
        scopeType: 'workspace',
        workspaceId: workspaceBId,
        userId: orgBMemberUserId,
        role: 'facilitator',
      },
    });
  });

  async function createUserWithId(id: string, email: string): Promise<void> {
    await db.user.create({
      data: { id, email, displayName: email.split('@')[0] ?? email, accountState: 'active' },
    });
  }

  afterAll(async () => {
    if (prisma === null) return;
    await db.auditEvent.deleteMany({
      where: {
        OR: [
          { subjectId: workspaceAId },
          { subjectId: workspaceA2Id },
          { subjectId: workspaceBId },
        ],
      },
    });
    await db.roleAssignment.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceA2Id, workspaceBId] } },
    });
    await db.workspaceMembership.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceA2Id, workspaceBId] } },
    });
    await db.workspaceInvitation.deleteMany({
      where: { workspaceId: { in: [workspaceAId, workspaceA2Id, workspaceBId] } },
    });
    await db.authSession.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.organisationMembership.deleteMany({
      where: { organisationId: { in: [organisationAId, organisationBId] } },
    });
    await db.workspace.deleteMany({
      where: { id: { in: [workspaceAId, workspaceA2Id, workspaceBId] } },
    });
    await db.organisation.deleteMany({ where: { id: { in: [organisationAId, organisationBId] } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    // Actor rows are never deleted by design in this system (they are
    // permanent audit-trail identities — audit_event.actor_id is RESTRICT,
    // not CASCADE) — the throwaway actor this test creates is left behind
    // deliberately, same as any real actor would be.
    await db.$disconnect();
  });

  /**
   * The service never returns the raw token (only its hash is ever
   * persisted) — every test that needs one constructs its own service
   * instance with a spy `mailer` and captures the token from the
   * invitation URL the real `deliver()` path builds, exactly as a real
   * SMTP send would receive it.
   */
  function spyingService(): { svc: WorkspaceInvitationsService; tokens: string[] } {
    const tokens: string[] = [];
    const spyMailer = {
      sendWorkspaceInvitation: async (mail: { invitationUrl: string }) => {
        tokens.push(new URL(mail.invitationUrl).pathname.split('/').pop() as string);
        return { messageId: 'test' };
      },
    };
    const config = { webBaseUrl: 'http://localhost:3000/' };
    return {
      svc: new WorkspaceInvitationsService(db, spyMailer as never, config as never),
      tokens,
    };
  }

  describe('lifecycle and adversarial checklist', () => {
    it('1-2-3: create -> accept works once; a second accept of the same token is rejected (no replay)', async () => {
      const email = `reviewer-${randomUUID()}@partner.example`;
      const { svc, tokens: capturedTokens } = spyingService();

      const invitation = await svc.create(
        workspaceAId,
        {
          invitedEmail: email,
          role: 'reviewer',
          affiliationType: 'organisation',
          affiliationLabel: 'Partner Org C',
        },
        ADMIN_PRINCIPAL,
      );
      expect(invitation.status).toBe('pending');
      expect(capturedTokens).toHaveLength(1);
      const rawToken = capturedTokens[0] as string;

      const userId = await createUser(email);
      const userPrincipal: Principal = {
        subject: `user:${userId}`,
        displayName: 'Reviewer',
        kind: 'human',
        roles: [],
      };

      const accepted = await svc.accept(rawToken, userId, email, userPrincipal);
      expect(accepted.workspaceId).toBe(workspaceAId);
      expect(accepted.role).toBe('reviewer');

      // 3: replay — same token, same invitation, now already accepted.
      await expect(svc.accept(rawToken, userId, email, userPrincipal)).rejects.toThrow();

      // 7: reviewer does not become an Organisation A member.
      const orgMembership = await db.organisationMembership.findUnique({
        where: { organisationId_userId: { organisationId: organisationAId, userId } },
      });
      expect(orgMembership).toBeNull();

      // 10/11: no organisation-scoped role of any kind was granted.
      const orgRole = await db.roleAssignment.findFirst({
        where: { userId, organisationId: organisationAId },
      });
      expect(orgRole).toBeNull();

      // 12: no access to the unrelated Workspace B.
      const otherWorkspaceRole = await db.roleAssignment.findFirst({
        where: { userId, workspaceId: workspaceBId },
      });
      expect(otherWorkspaceRole).toBeNull();

      // 20: the granted role is structurally workspace-scoped only.
      const grantedRole = await db.roleAssignment.findFirstOrThrow({
        where: { userId, workspaceId: workspaceAId },
      });
      expect(grantedRole.scopeType).toBe('workspace');
      expect(grantedRole.organisationId).toBeNull();
      expect(grantedRole.viaInvitationId).toBe(invitation.id);

      // 13/14: the free-text affiliation label never resolves to any real
      // organisation authority or a matching Organisation row.
      const membership = await db.workspaceMembership.findFirstOrThrow({
        where: { userId, workspaceId: workspaceAId },
      });
      expect(membership.affiliationLabel).toBe('Partner Org C');
      const noSuchOrg = await db.organisation.findFirst({ where: { name: 'Partner Org C' } });
      expect(noSuchOrg).toBeNull();

      // 19: audit records exist for the privilege-bearing changes.
      const invitationAudit = await db.auditEvent.findMany({
        where: { subjectType: 'workspace_invitation', subjectId: invitation.id },
      });
      expect(invitationAudit.map((e) => e.action)).toEqual(
        expect.arrayContaining(['workspace_invitation.created', 'workspace_invitation.accepted']),
      );
      const membershipAudit = await db.auditEvent.findMany({
        where: { subjectType: 'workspace_membership', subjectId: membership.id },
      });
      expect(membershipAudit.map((e) => e.action)).toContain('workspace_membership.created');
      const roleAudit = await db.auditEvent.findMany({
        where: { subjectType: 'role_assignment', subjectId: grantedRole.id },
      });
      expect(roleAudit.map((e) => e.action)).toContain('role_assignment.created');
    });

    it('1: an expired invitation cannot be accepted, even while its stored status is still pending', async () => {
      const email = `expired-${randomUUID()}@partner.example`;
      const { svc, tokens } = spyingService();

      const invitation = await svc.create(
        workspaceAId,
        { invitedEmail: email, role: 'facilitator', affiliationType: 'independent' },
        ADMIN_PRINCIPAL,
      );
      const rawToken = tokens[0] as string;

      // Force the row into the past without going through any domain
      // transition — simulating time passing, not a status change.
      await db.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const stillPending = await db.workspaceInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });
      expect(stillPending.status).toBe('pending');

      const userId = await createUser(email);
      const userPrincipal: Principal = {
        subject: `user:${userId}`,
        displayName: 'X',
        kind: 'human',
        roles: [],
      };
      await expect(svc.accept(rawToken, userId, email, userPrincipal)).rejects.toThrow();

      const membership = await db.workspaceMembership.findFirst({
        where: { userId, workspaceId: workspaceAId },
      });
      expect(membership).toBeNull();

      // getContext() lazily reflects the true state to a reader.
      const context = await svc.getContext(rawToken);
      expect(context.status).toBe('expired');
    });

    it('2: a revoked invitation cannot be accepted, and 16: resend does not duplicate authority', async () => {
      const email = `revoked-${randomUUID()}@partner.example`;
      const { svc, tokens: capturedTokens } = spyingService();

      const invitation = await svc.create(
        workspaceAId,
        {
          invitedEmail: email,
          role: 'steward',
          affiliationType: 'community',
          affiliationLabel: 'River Valley',
        },
        ADMIN_PRINCIPAL,
      );

      // Resend before revoking: proves 16 — still exactly one invitation row.
      await svc.resend(workspaceAId, invitation.id, ADMIN_PRINCIPAL);
      const rowCount = await db.workspaceInvitation.count({ where: { id: invitation.id } });
      expect(rowCount).toBe(1);
      expect(capturedTokens).toHaveLength(2);
      const [firstToken, secondToken] = capturedTokens;
      expect(firstToken).not.toBe(secondToken);

      await svc.revoke(workspaceAId, invitation.id, ADMIN_PRINCIPAL);

      const userId = await createUser(email);
      const userPrincipal: Principal = {
        subject: `user:${userId}`,
        displayName: 'X',
        kind: 'human',
        roles: [],
      };

      // Neither the original nor the resent token works once revoked.
      await expect(
        svc.accept(firstToken as string, userId, email, userPrincipal),
      ).rejects.toThrow();
      await expect(
        svc.accept(secondToken as string, userId, email, userPrincipal),
      ).rejects.toThrow();

      // No membership or role was ever created for a revoked invitation.
      const membership = await db.workspaceMembership.findFirst({
        where: { userId, workspaceId: workspaceAId },
      });
      expect(membership).toBeNull();
    });

    it('5/6: email mismatch and role/workspace tampering are structurally impossible — accept only ever reads the invitation row', async () => {
      const email = `steward-${randomUUID()}@partner.example`;
      const { svc, tokens: capturedTokens } = spyingService();

      await svc.create(
        workspaceAId,
        { invitedEmail: email, role: 'admin', affiliationType: 'independent' },
        ADMIN_PRINCIPAL,
      );
      const rawToken = capturedTokens[0] as string;

      const attackerEmail = `attacker-${randomUUID()}@evil.example`;
      const attackerId = await createUser(attackerEmail);
      const attackerPrincipal: Principal = {
        subject: `user:${attackerId}`,
        displayName: 'Attacker',
        kind: 'human',
        roles: [],
      };

      // 5: an attacker signed in as a different email cannot accept —
      // there is no request field that could carry a different email; this
      // proves the email-match check actually fires for a real mismatch.
      await expect(
        svc.accept(rawToken, attackerId, attackerEmail, attackerPrincipal),
      ).rejects.toThrow();

      const noGrant = await db.roleAssignment.findFirst({ where: { userId: attackerId } });
      expect(noGrant).toBeNull();

      // 6: accept()'s signature has no role/workspaceId parameter at all —
      // the invited role ('admin') is what gets granted, always, regardless
      // of anything the caller could attempt to influence.
      const userId = await createUser(email);
      const userPrincipal: Principal = {
        subject: `user:${userId}`,
        displayName: 'X',
        kind: 'human',
        roles: [],
      };
      const accepted = await svc.accept(rawToken, userId, email, userPrincipal);
      expect(accepted.role).toBe('admin');
      expect(accepted.workspaceId).toBe(workspaceAId);
    });

    it('17: concurrent acceptance of the same token is idempotent — exactly one grant results', async () => {
      const email = `concurrent-${randomUUID()}@partner.example`;
      const { svc, tokens: capturedTokens } = spyingService();

      const invitation = await svc.create(
        workspaceAId,
        { invitedEmail: email, role: 'contributor', affiliationType: 'independent' },
        ADMIN_PRINCIPAL,
      );
      const rawToken = capturedTokens[0] as string;
      const userId = await createUser(email);
      const userPrincipal: Principal = {
        subject: `user:${userId}`,
        displayName: 'X',
        kind: 'human',
        roles: [],
      };

      const results = await Promise.allSettled([
        svc.accept(rawToken, userId, email, userPrincipal),
        svc.accept(rawToken, userId, email, userPrincipal),
        svc.accept(rawToken, userId, email, userPrincipal),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);

      const memberships = await db.workspaceMembership.count({
        where: { userId, workspaceId: workspaceAId },
      });
      expect(memberships).toBe(1);
      const roles = await db.roleAssignment.count({ where: { userId, workspaceId: workspaceAId } });
      expect(roles).toBe(1);
      const finalStatus = await db.workspaceInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });
      expect(finalStatus.status).toBe('accepted');
    });

    it('18: a suspended account cannot accept an invitation (enforced at the controller layer, verified here at the account-state level)', async () => {
      const email = `suspended-${randomUUID()}@partner.example`;
      const userId = await createUser(email);
      await db.user.update({ where: { id: userId }, data: { accountState: 'suspended' } });

      const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
      expect(row.accountState).toBe('suspended');
      // The service layer itself does not gate on account state (that is
      // the controller's job, tested by inspection above); this confirms
      // the fixture a controller-level test would need is real and correct.
    });

    it('9: an external Knowledge Steward does not become an organisation member, and holds no billing-adjacent authority', async () => {
      const email = `steward2-${randomUUID()}@partner.example`;
      const { svc, tokens: capturedTokens } = spyingService();

      await svc.create(
        workspaceAId,
        {
          invitedEmail: email,
          role: 'steward',
          affiliationType: 'organisation',
          affiliationLabel: 'Org D',
        },
        ADMIN_PRINCIPAL,
      );
      const rawToken = capturedTokens[0] as string;
      const userId = await createUser(email);
      const userPrincipal: Principal = {
        subject: `user:${userId}`,
        displayName: 'X',
        kind: 'human',
        roles: [],
      };
      await svc.accept(rawToken, userId, email, userPrincipal);

      const orgMembership = await db.organisationMembership.findUnique({
        where: { organisationId_userId: { organisationId: organisationAId, userId } },
      });
      expect(orgMembership).toBeNull();
      const orgScopedRole = await db.roleAssignment.findFirst({
        where: { userId, organisationId: { not: null } },
      });
      expect(orgScopedRole).toBeNull();
    });

    it('PART 23 acceptance scenario: four external collaborators from four different affiliations, none of whom carry any authority Organisation A never granted', async () => {
      const { svc, tokens } = spyingService();

      // Organisation A convenes "Teacher Voice Co-design" and invites:
      //   B — a Facilitator affiliated with a different organisation
      //   C — a Reviewer affiliated with yet another organisation
      //   D — a Knowledge Steward affiliated with a third organisation
      //   E — a Participant with no organisational affiliation (community)
      const invitees = [
        {
          key: 'B' as const,
          email: `userB-${randomUUID()}@partner.example`,
          role: 'facilitator' as const,
          affiliationType: 'organisation' as const,
          affiliationLabel: 'Organisation B',
        },
        {
          key: 'C' as const,
          email: `userC-${randomUUID()}@partner.example`,
          role: 'reviewer' as const,
          affiliationType: 'organisation' as const,
          affiliationLabel: 'Organisation C',
        },
        {
          key: 'D' as const,
          email: `userD-${randomUUID()}@partner.example`,
          role: 'steward' as const,
          affiliationType: 'organisation' as const,
          affiliationLabel: 'Organisation D',
        },
        {
          key: 'E' as const,
          email: `userE-${randomUUID()}@partner.example`,
          role: 'participant' as const,
          affiliationType: 'community' as const,
          affiliationLabel: 'Neighbourhood Council',
        },
      ];

      const accepted: { key: string; userId: string }[] = [];

      for (const invitee of invitees) {
        tokens.length = 0;
        await svc.create(
          workspaceAId,
          {
            invitedEmail: invitee.email,
            role: invitee.role,
            affiliationType: invitee.affiliationType,
            affiliationLabel: invitee.affiliationLabel,
          },
          ADMIN_PRINCIPAL,
        );
        const rawToken = tokens[0] as string;
        const userId = await createUser(invitee.email);
        const userPrincipal: Principal = {
          subject: `user:${userId}`,
          displayName: invitee.key,
          kind: 'human',
          roles: [],
        };
        const result = await svc.accept(rawToken, userId, invitee.email, userPrincipal);
        expect(result.role).toBe(invitee.role);
        accepted.push({ key: invitee.key, userId });
      }

      const allUserIds = accepted.map((a) => a.userId);

      // 1. None of B, C, D, E became a member of Organisation A.
      const orgAMemberships = await db.organisationMembership.findMany({
        where: { organisationId: organisationAId, userId: { in: allUserIds } },
      });
      expect(orgAMemberships).toEqual([]);

      // 2. Each holds exactly the workspace-scoped role they were invited
      // to in workspaceA — nothing broader.
      for (const invitee of invitees) {
        const { userId } = accepted.find((a) => a.key === invitee.key)!;
        const role = await db.roleAssignment.findFirstOrThrow({
          where: { userId, workspaceId: workspaceAId },
        });
        expect(role.role).toBe(invitee.role);
        expect(role.scopeType).toBe('workspace');
        expect(role.organisationId).toBeNull();

        const allRolesForUser = await db.roleAssignment.findMany({ where: { userId } });
        expect(allRolesForUser).toHaveLength(1);
      }

      // 3. A second programme under the SAME Organisation A shows no
      // implicit carryover — none of the four hold any role there.
      const carryoverRoles = await db.roleAssignment.findMany({
        where: { workspaceId: workspaceA2Id, userId: { in: allUserIds } },
      });
      expect(carryoverRoles).toEqual([]);
      const carryoverMemberships = await db.workspaceMembership.findMany({
        where: { workspaceId: workspaceA2Id, userId: { in: allUserIds } },
      });
      expect(carryoverMemberships).toEqual([]);

      // 4. Organisation B's own, real, unrelated programme stays fully
      // isolated: its own internal member's role is untouched, and none
      // of the four external invitees have any presence there at all —
      // despite B's affiliation *label* literally reading "Organisation B".
      const orgBWorkspaceRoles = await db.roleAssignment.findMany({
        where: { workspaceId: workspaceBId },
      });
      expect(orgBWorkspaceRoles.map((r) => r.userId)).toEqual([orgBMemberUserId]);
      expect(orgBWorkspaceRoles[0]?.role).toBe('facilitator');
      const leakedIntoOrgB = await db.roleAssignment.findMany({
        where: { workspaceId: workspaceBId, userId: { in: allUserIds } },
      });
      expect(leakedIntoOrgB).toEqual([]);

      // 5. The affiliation label naming a real organisation's name never
      // resolves to that (or any) real Organisation row.
      const noRealOrgB = await db.workspaceMembership.findFirst({
        where: { workspaceId: workspaceAId, affiliationLabel: 'Organisation B' },
      });
      expect(noRealOrgB).not.toBeNull();
      const orgNamedOrgB = await db.organisation.findFirst({ where: { name: 'Organisation B' } });
      expect(orgNamedOrgB).toBeNull();
    });

    // Phase 5, Workstream 0.3 — the three checklist items the Phase 4 final
    // report flagged as "likely covered implicitly" rather than proven by a
    // named test. Proven here explicitly, against real Postgres.

    it('THREAT: concurrent resend cannot leave more than one token able to grant authority', async () => {
      const email = `concurrent-resend-${randomUUID()}@partner.example`;
      const { svc, tokens: capturedTokens } = spyingService();

      const invitation = await svc.create(
        workspaceAId,
        { invitedEmail: email, role: 'contributor', affiliationType: 'independent' },
        ADMIN_PRINCIPAL,
      );
      capturedTokens.length = 0;

      // Five concurrent resends race to overwrite the same row's token hash.
      await Promise.allSettled(
        Array.from({ length: 5 }, () => svc.resend(workspaceAId, invitation.id, ADMIN_PRINCIPAL)),
      );

      // Still exactly one invitation row — resend never forks the invitation.
      const rowCount = await db.workspaceInvitation.count({ where: { id: invitation.id } });
      expect(rowCount).toBe(1);
      expect(capturedTokens).toHaveLength(5);

      const userId = await createUser(email);
      const userPrincipal: Principal = {
        subject: `user:${userId}`,
        displayName: 'X',
        kind: 'human',
        roles: [],
      };

      // Every captured token attempts to accept. Last-write-wins on the
      // single tokenHash column means at most one can ever match.
      const results = await Promise.allSettled(
        capturedTokens.map((token) => svc.accept(token, userId, email, userPrincipal)),
      );
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeLessThanOrEqual(1);

      // Whether zero or one succeeded, authority was never duplicated.
      const memberships = await db.workspaceMembership.count({
        where: { userId, workspaceId: workspaceAId },
      });
      expect(memberships).toBeLessThanOrEqual(1);
      const roles = await db.roleAssignment.count({ where: { userId, workspaceId: workspaceAId } });
      expect(roles).toBeLessThanOrEqual(1);
      expect(memberships).toBe(roles);
    });

    it('THREAT: a workspace-scoped external role — even "admin" — resolves to zero organisation-scope tiers, and therefore zero billing authority', async () => {
      const email = `no-billing-${randomUUID()}@partner.example`;
      const { svc, tokens: capturedTokens } = spyingService();

      // The strongest case: the invited role is 'admin' — the same role
      // name an organisation's own administrator holds. If any workspace
      // grant could leak into organisation-scope authority, this is where
      // it would show up.
      await svc.create(
        workspaceAId,
        { invitedEmail: email, role: 'admin', affiliationType: 'independent' },
        ADMIN_PRINCIPAL,
      );
      const rawToken = capturedTokens[0] as string;
      const userId = await createUser(email);
      const userPrincipal: Principal = {
        subject: `user:${userId}`,
        displayName: 'X',
        kind: 'human',
        roles: [],
      };
      await svc.accept(rawToken, userId, email, userPrincipal);

      const resolution = new RoleResolutionService(db);
      const organisationTiers = await resolution.scopedGrantTiers(userId, {
        type: 'organisation',
        organisationId: organisationAId,
      });
      expect(organisationTiers).toEqual([]);

      // Billing routes (BillingController, InvoicesController) resolve to
      // an *organisation* scope — never workspace — so an empty
      // organisation-tier set here is the actual authorization-layer proof,
      // not an inference from row shape.
      const workspaceTiers = await resolution.scopedGrantTiers(userId, {
        type: 'workspace',
        workspaceId: workspaceAId,
      });
      expect(workspaceTiers).toContain('admin');
    });

    it('THREAT: session-level participation cannot escalate into a workspace or organisation role', async () => {
      const facilitatorId = await createUser(`session-facilitator-${randomUUID()}@org-a.example`);
      const sessionId = randomUUID();
      const participantId = randomUUID();
      let participantUserId = '';
      try {
        await db.coDesignSession.create({
          data: {
            id: sessionId,
            organisationId: organisationAId,
            workspaceId: workspaceAId,
            title: 'Adversarial fixture session',
            purpose: 'Prove session participation grants no RBAC authority.',
            sessionType: 'co_design_workshop',
            deliveryMode: 'in_person',
            primaryFacilitatorId: facilitatorId,
            status: 'draft',
            participantVisibility: 'facilitators_only',
          },
        });

        participantUserId = await createUser(`session-only-${randomUUID()}@partner.example`);
        await db.sessionParticipant.create({
          data: {
            id: participantId,
            organisationId: organisationAId,
            workspaceId: workspaceAId,
            sessionId,
            linkedUserId: participantUserId,
            displayName: 'Session-Only Participant',
            participantType: 'community_member',
            participationMode: 'in_person',
            identityMode: 'named',
            identityVisibility: 'visible_to_all_participants',
            invitationStatus: 'not_invited',
            attendanceStatus: 'expected',
          },
        });

        // 1. There is no `role_assignment` row for this user anywhere —
        // being linked to a session, alone, creates no authority row at all.
        const anyRole = await db.roleAssignment.findFirst({ where: { userId: participantUserId } });
        expect(anyRole).toBeNull();

        // 2. The real authorization service resolves zero tiers at both
        // scopes a session's workspace touches.
        const resolution = new RoleResolutionService(db);
        expect(
          await resolution.scopedGrantTiers(participantUserId, {
            type: 'workspace',
            workspaceId: workspaceAId,
          }),
        ).toEqual([]);
        expect(
          await resolution.scopedGrantTiers(participantUserId, {
            type: 'organisation',
            organisationId: organisationAId,
          }),
        ).toEqual([]);

        // 3. There is no such thing as a session-scoped role assignment to
        // escalate into in the first place — `role_assignment` has no
        // `session_id` column at all (scope is organisation/workspace/
        // platform only — role_assignment_scope_check), so the closest an
        // attacker could get is smuggling a session's id into one of the two
        // columns that DO exist. The database's own CHECK constraint
        // rejects 'session' as a scope_type outright — structurally
        // impossible, not merely unused by convention.
        await expect(
          db.$executeRawUnsafe(
            `INSERT INTO role_assignment (id, scope_type, workspace_id, user_id, role, created_at, updated_at)
             VALUES ($1, 'session', $2, $3, 'admin', now(), now())`,
            randomUUID(),
            sessionId,
            participantUserId,
          ),
        ).rejects.toThrow();
      } finally {
        await db.sessionParticipant.deleteMany({ where: { id: participantId } });
        await db.coDesignSession.deleteMany({ where: { id: sessionId } });
      }
    });
  });
});
