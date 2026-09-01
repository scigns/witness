import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  GrantPlatformRoleRequest,
  PlatformRoleAssignmentView,
  RevokePlatformRoleRequest,
} from '@witness/contracts';

import type { Principal } from '../authz/authorization.port.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { PrismaService } from '../infrastructure/prisma.service.js';

type PrismaTransaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class PlatformRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PlatformRoleAssignmentView[]> {
    const rows = await this.prisma.roleAssignment.findMany({
      where: { scopeType: 'platform', organisationId: null, workspaceId: null },
      include: { user: { include: { identityLinks: { select: { id: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toView);
  }

  async grant(
    request: GrantPlatformRoleRequest,
    principal: Principal,
  ): Promise<PlatformRoleAssignmentView> {
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await lockPlatformRoles(tx);
      const user = await tx.user.findUnique({
        where: { email: request.email },
        include: { identityLinks: { select: { id: true } } },
      });
      if (user === null) {
        throw new NotFoundException({
          error: {
            code: 'USER_NOT_FOUND',
            message: `No Witness user exists for '${request.email}'.`,
          },
        });
      }
      if (user.accountState !== 'active' || user.identityLinks.length === 0) {
        throw new UnprocessableEntityException({
          error: {
            code: 'VERIFIED_OIDC_IDENTITY_REQUIRED',
            message: 'The target must be active and linked through a verified OIDC sign-in.',
          },
        });
      }
      const existing = await tx.roleAssignment.findFirst({
        where: { userId: user.id, scopeType: 'platform' },
      });
      if (existing !== null) return toView({ ...existing, user });

      const assignment = await tx.roleAssignment.create({
        data: {
          id: randomUUID(),
          scopeType: 'platform',
          userId: user.id,
          role: request.role,
          createdAt: now,
          updatedAt: now,
        },
      });
      await appendAuditEvent(
        tx,
        'role_assignment',
        assignment.id,
        {
          action: 'platform_role.granted',
          actor,
          metadata: {
            targetUserId: user.id,
            targetEmail: user.email,
            role: request.role,
            previousState: 'absent',
            resultingState: 'active',
            reason: request.reason,
          },
        },
        now,
      );
      return toView({ ...assignment, user });
    });
  }

  async revoke(
    userId: string,
    request: RevokePlatformRoleRequest,
    principal: Principal,
  ): Promise<void> {
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await lockPlatformRoles(tx);
      const existing = await tx.roleAssignment.findFirst({
        where: { userId, scopeType: 'platform', organisationId: null, workspaceId: null },
        include: { user: { include: { identityLinks: { select: { id: true } } } } },
      });
      if (existing === null) {
        throw new NotFoundException({
          error: { code: 'PLATFORM_ROLE_NOT_FOUND', message: 'The platform role does not exist.' },
        });
      }

      const usableAdmins = await tx.roleAssignment.count({
        where: {
          scopeType: 'platform',
          role: 'admin',
          user: { accountState: 'active', identityLinks: { some: {} } },
        },
      });
      const targetUsable =
        existing.role === 'admin' &&
        existing.user.accountState === 'active' &&
        existing.user.identityLinks.length > 0;
      if (targetUsable && usableAdmins <= 1) {
        throw new ConflictException({
          error: {
            code: 'LAST_PLATFORM_ADMIN',
            message:
              'Cannot revoke the last usable platform administrator. Grant a replacement first.',
          },
        });
      }

      await tx.roleAssignment.delete({ where: { id: existing.id } });
      await appendAuditEvent(
        tx,
        'role_assignment',
        existing.id,
        {
          action: 'platform_role.revoked',
          actor,
          metadata: {
            targetUserId: existing.userId,
            targetEmail: existing.user.email,
            role: existing.role,
            previousState: 'active',
            resultingState: 'absent',
            reason: request.reason,
          },
        },
        now,
      );
    });
  }
}

type PlatformRow = {
  id: string;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    displayName: string;
    accountState: string;
    identityLinks: { id: string }[];
  };
};

function toView(row: PlatformRow): PlatformRoleAssignmentView {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    displayName: row.user.displayName,
    accountState: row.user.accountState,
    oidcLinked: row.user.identityLinks.length > 0,
    role: row.role as 'admin',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function lockPlatformRoles(tx: PrismaTransaction) {
  if (typeof tx.$executeRaw === 'function') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('witness-platform-roles'))`;
  }
}
