/**
 * Service-level tests for `OrganisationInvitationsService`, against an
 * in-memory Prisma double — same approach as `users.service.test.ts` and
 * `organisation-memberships.service.test.ts`.
 *
 * This is the regression coverage for the defect this module fixes: an
 * organisation administrator could not onboard a new person through the
 * application at all (`POST /api/v1/users` always resolved to the global
 * scope, which never grants the admin tier to a real session). These tests
 * exercise the fixed path directly, one level below the HTTP/authorisation
 * layer that `services/api-gateway/src/authz/role-resolution.service.test.ts`
 * already proves grants `admin` the organisation-scoped tier this endpoint
 * needs.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { InvariantViolation } from '@witness/domain';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { OrganisationInvitationsService } from './organisation-invitations.service.js';

const ADMIN: Principal = {
  subject: 'user:admin-1',
  displayName: 'Org Admin',
  kind: 'human',
  roles: [],
};

const ORGANISATION_ID = 'a1b2c3d4-e5f6-4789-8abc-def012345678';

function fakePrisma() {
  const organisations = [{ id: ORGANISATION_ID, name: 'Test Org' }];
  const users: Record<string, unknown>[] = [];
  const memberships: Record<string, unknown>[] = [];
  const roleAssignments: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];
  const invitationNotifications: Record<string, unknown>[] = [];

  const prisma = {
    organisation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = organisations.find((o) => o.id === where.id);
        return row === undefined ? null : { ...row };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { email?: string } }) => {
        const row = users.find((u) => u['email'] === where.email);
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        users.push({ ...data });
        return { ...data };
      },
    },
    organisationMembership: {
      findUnique: async ({
        where,
      }: {
        where: { organisationId_userId: { organisationId: string; userId: string } };
      }) => {
        const row = memberships.find(
          (m) =>
            m['organisationId'] === where.organisationId_userId.organisationId &&
            m['userId'] === where.organisationId_userId.userId,
        );
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        memberships.push({ ...data });
        return { ...data };
      },
    },
    roleAssignment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        roleAssignments.push({ ...data });
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
    invitationNotification: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        invitationNotifications.push({ ...data });
        return { ...data };
      },
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>) => fn(prisma),
  };

  return {
    prisma: prisma as unknown as PrismaService,
    users,
    memberships,
    roleAssignments,
    auditEvents,
    invitationNotifications,
  };
}

describe('OrganisationInvitationsService', () => {
  it('registers a user, an active membership and a role assignment in one call', async () => {
    const { prisma, users, memberships, roleAssignments, auditEvents } = fakePrisma();
    const service = new OrganisationInvitationsService(prisma);

    const result = await service.invite(
      ORGANISATION_ID,
      { email: 'Mele@Example.com', displayName: 'Mele Tupou', role: 'facilitator' },
      ADMIN,
    );

    expect(result.email).toBe('mele@example.com');
    expect(result.accountState).toBe('invited');
    expect(result.organisationId).toBe(ORGANISATION_ID);
    expect(result.role).toBe('facilitator');
    expect(result.notificationStatus).toBe('pending');

    expect(users).toHaveLength(1);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ organisationId: ORGANISATION_ID, state: 'invited' });
    expect(roleAssignments).toHaveLength(1);
    expect(roleAssignments[0]).toMatchObject({
      organisationId: ORGANISATION_ID,
      role: 'facilitator',
      scopeType: 'organisation',
    });

    // One audit event per subject: the user, the membership and the role
    // assignment each get their own chain, exactly as if an admin had added
    // an existing user and assigned their role through the two separate,
    // already-existing endpoints.
    expect(auditEvents.map((e) => e['subjectType'])).toEqual([
      'user',
      'organisation_membership',
      'role_assignment',
    ]);
  });

  it('refuses to invite an email that already has an account', async () => {
    const { prisma } = fakePrisma();
    const service = new OrganisationInvitationsService(prisma);

    await service.invite(
      ORGANISATION_ID,
      { email: 'mele@example.com', displayName: 'Mele', role: 'reader' },
      ADMIN,
    );

    await expect(
      service.invite(
        ORGANISATION_ID,
        { email: 'Mele@EXAMPLE.com', displayName: 'Someone Else', role: 'reader' },
        ADMIN,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('404s for a missing organisation', async () => {
    const { prisma } = fakePrisma();
    const service = new OrganisationInvitationsService(prisma);

    await expect(
      service.invite(
        'does-not-exist',
        { email: 'a@example.com', displayName: 'A', role: 'reader' },
        ADMIN,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a malformed email before persisting anything', async () => {
    const { prisma, users, memberships, roleAssignments } = fakePrisma();
    const service = new OrganisationInvitationsService(prisma);

    await expect(
      service.invite(
        ORGANISATION_ID,
        { email: 'not-an-email', displayName: 'Someone', role: 'reader' },
        ADMIN,
      ),
    ).rejects.toThrow(InvariantViolation);

    expect(users).toHaveLength(0);
    expect(memberships).toHaveLength(0);
    expect(roleAssignments).toHaveLength(0);
  });
});
