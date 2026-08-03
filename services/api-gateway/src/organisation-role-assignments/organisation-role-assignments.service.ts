/**
 * Application layer for organisation-scoped role assignments.
 *
 * "What may this member do in this organisation" — always resolved from an
 * *existing* `OrganisationMembership` (identified by `membershipId`, the
 * same identifier the membership API already returns), never from a raw
 * user id, so a role assignment cannot be created without membership
 * already having been established (BUILD_ROADMAP.md Milestone 1.2: "Role
 * assignment must never create membership implicitly").
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  assignRole,
  changeRoleAssignment,
  permittedActionsForRole,
  removeRoleAssignment,
  toOrganisationId,
  toRoleAssignmentId,
  toUserId,
  type MembershipState,
  type RoleAssignment,
  type WitnessRole,
} from '@witness/domain';
import type { AssignRoleRequest, RoleAssignmentView } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { roleLabel } from '../infrastructure/role.helper.js';
import type { Principal } from '../authz/authorization.port.js';

type MembershipRow = {
  id: string;
  organisationId: string;
  userId: string;
  state: string;
  user: { email: string; displayName: string };
};

@Injectable()
export class OrganisationRoleAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organisationId: string, membershipId: string): Promise<RoleAssignmentView> {
    const membership = await this.requireMembership(organisationId, membershipId);
    const assignment = await this.prisma.roleAssignment.findUnique({
      where: { organisationId_userId: { organisationId, userId: membership.userId } },
    });

    return toView(membership, assignment);
  }

  async assignOrChange(
    organisationId: string,
    membershipId: string,
    request: AssignRoleRequest,
    principal: Principal,
  ): Promise<RoleAssignmentView> {
    const membership = await this.requireMembership(organisationId, membershipId);
    const existing = await this.prisma.roleAssignment.findUnique({
      where: { organisationId_userId: { organisationId, userId: membership.userId } },
    });

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const scope = {
      type: 'organisation' as const,
      organisationId: toOrganisationId(organisationId),
    };

    const outcome =
      existing === null
        ? assignRole({
            id: toRoleAssignmentId(randomUUID()),
            userId: toUserId(membership.userId),
            role: request.role,
            scope,
            membershipState: membership.state as MembershipState,
            assignedBy: actor,
            at: now,
          })
        : changeRoleAssignment(
            toDomainAssignment(existing, scope, membership.userId),
            request.role,
            actor,
            now,
          );

    await this.prisma.$transaction(async (tx) => {
      if (existing === null) {
        await tx.roleAssignment.create({
          data: {
            id: outcome.assignment.id,
            scopeType: 'organisation',
            organisationId,
            userId: outcome.assignment.userId,
            role: outcome.assignment.role,
            createdAt: outcome.assignment.createdAt,
            updatedAt: outcome.assignment.updatedAt,
          },
        });
      } else {
        await tx.roleAssignment.update({
          where: { id: existing.id },
          data: { role: outcome.assignment.role, updatedAt: outcome.assignment.updatedAt },
        });
      }

      await appendAuditEvent(tx, 'role_assignment', outcome.assignment.id, outcome.event, now);
    });

    return toView(membership, outcome.assignment);
  }

  async remove(organisationId: string, membershipId: string, principal: Principal): Promise<void> {
    const membership = await this.requireMembership(organisationId, membershipId);
    const existing = await this.prisma.roleAssignment.findUnique({
      where: { organisationId_userId: { organisationId, userId: membership.userId } },
    });

    if (existing === null) {
      throw new NotFoundException({
        error: {
          code: 'ROLE_ASSIGNMENT_NOT_FOUND',
          message: `Member '${membershipId}' has no role assignment in organisation '${organisationId}'.`,
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const scope = {
      type: 'organisation' as const,
      organisationId: toOrganisationId(organisationId),
    };
    const event = removeRoleAssignment(
      toDomainAssignment(existing, scope, membership.userId),
      actor,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.roleAssignment.delete({ where: { id: existing.id } });
      await appendAuditEvent(tx, 'role_assignment', existing.id, event, now);
    });
  }

  private async requireMembership(
    organisationId: string,
    membershipId: string,
  ): Promise<MembershipRow> {
    const row = await this.prisma.organisationMembership.findUnique({
      where: { id: membershipId },
      include: { user: { select: { email: true, displayName: true } } },
    });

    if (row === null || row.organisationId !== organisationId) {
      throw new NotFoundException({
        error: {
          code: 'MEMBERSHIP_NOT_FOUND',
          message: `No membership '${membershipId}' in organisation '${organisationId}'.`,
        },
      });
    }

    return row;
  }
}

function toDomainAssignment(
  row: { id: string; role: string; createdAt: Date; updatedAt: Date },
  scope: { type: 'organisation'; organisationId: ReturnType<typeof toOrganisationId> },
  userId: string,
): RoleAssignment {
  return {
    id: toRoleAssignmentId(row.id),
    userId: toUserId(userId),
    role: row.role as WitnessRole,
    scope,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toView(
  membership: MembershipRow,
  assignment: { role: string; updatedAt: Date } | null,
): RoleAssignmentView {
  const role = assignment === null ? null : (assignment.role as WitnessRole);

  return {
    membershipId: membership.id,
    userId: membership.userId,
    userEmail: membership.user.email,
    userDisplayName: membership.user.displayName,
    role,
    roleLabel: role === null ? null : roleLabel(role),
    permittedActions: role === null ? [] : [...permittedActionsForRole(role)],
    updatedAt: assignment === null ? null : assignment.updatedAt.toISOString(),
  };
}
