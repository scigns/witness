/**
 * Application layer for workspace-scoped role assignments.
 *
 * Mirrors `OrganisationRoleAssignmentsService`, with one addition: because a
 * workspace sits inside exactly one organisation, this layer re-reads the
 * user's *organisation* membership for the workspace's specific parent
 * organisation and hands both states to the domain, exactly as
 * `WorkspaceMembershipsService` does for workspace membership itself — a
 * workspace role assignment must not survive on organisation standing that
 * has since lapsed.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  assignRole,
  changeRoleAssignment,
  permittedActionsForRole,
  removeRoleAssignment,
  toRoleAssignmentId,
  toUserId,
  toWorkspaceId,
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
  workspaceId: string;
  userId: string;
  state: string;
  user: { email: string; displayName: string };
};

@Injectable()
export class WorkspaceRoleAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(workspaceId: string, membershipId: string): Promise<RoleAssignmentView> {
    const membership = await this.requireMembership(workspaceId, membershipId);
    const assignment = await this.prisma.roleAssignment.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: membership.userId } },
    });

    return toView(membership, assignment);
  }

  async assignOrChange(
    workspaceId: string,
    membershipId: string,
    request: AssignRoleRequest,
    principal: Principal,
  ): Promise<RoleAssignmentView> {
    const membership = await this.requireMembership(workspaceId, membershipId);
    const parentOrganisationMembershipState = await this.requireParentOrganisationMembershipState(
      workspaceId,
      membership.userId,
    );
    const existing = await this.prisma.roleAssignment.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: membership.userId } },
    });

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const scope = { type: 'workspace' as const, workspaceId: toWorkspaceId(workspaceId) };

    const outcome =
      existing === null
        ? assignRole({
            id: toRoleAssignmentId(randomUUID()),
            userId: toUserId(membership.userId),
            role: request.role,
            scope,
            membershipState: membership.state as MembershipState,
            parentOrganisationMembershipState,
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
            scopeType: 'workspace',
            workspaceId,
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

  async remove(workspaceId: string, membershipId: string, principal: Principal): Promise<void> {
    const membership = await this.requireMembership(workspaceId, membershipId);
    const existing = await this.prisma.roleAssignment.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: membership.userId } },
    });

    if (existing === null) {
      throw new NotFoundException({
        error: {
          code: 'ROLE_ASSIGNMENT_NOT_FOUND',
          message: `Member '${membershipId}' has no role assignment in workspace '${workspaceId}'.`,
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const scope = { type: 'workspace' as const, workspaceId: toWorkspaceId(workspaceId) };
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
    workspaceId: string,
    membershipId: string,
  ): Promise<MembershipRow> {
    const row = await this.prisma.workspaceMembership.findUnique({
      where: { id: membershipId },
      include: { user: { select: { email: true, displayName: true } } },
    });

    if (row === null || row.workspaceId !== workspaceId) {
      throw new NotFoundException({
        error: {
          code: 'MEMBERSHIP_NOT_FOUND',
          message: `No membership '${membershipId}' in workspace '${workspaceId}'.`,
        },
      });
    }

    return row;
  }

  private async requireParentOrganisationMembershipState(
    workspaceId: string,
    userId: string,
  ): Promise<MembershipState | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { organisationId: true },
    });

    // The workspace itself was already resolved via `requireMembership` above
    // (a `WorkspaceMembership` row cannot exist without its `Workspace`,
    // enforced by the foreign key), so a missing workspace here would mean
    // the schema's own referential integrity had been violated.
    if (workspace === null) {
      throw new NotFoundException({
        error: { code: 'WORKSPACE_NOT_FOUND', message: `No workspace with id '${workspaceId}'.` },
      });
    }

    const organisationMembership = await this.prisma.organisationMembership.findUnique({
      where: {
        organisationId_userId: { organisationId: workspace.organisationId, userId },
      },
      select: { state: true },
    });

    return (organisationMembership?.state as MembershipState) ?? null;
  }
}

function toDomainAssignment(
  row: { id: string; role: string; createdAt: Date; updatedAt: Date },
  scope: { type: 'workspace'; workspaceId: ReturnType<typeof toWorkspaceId> },
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
