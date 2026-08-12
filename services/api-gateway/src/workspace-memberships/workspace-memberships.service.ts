/**
 * Application layer for workspace memberships.
 *
 * "Does this user belong to this workspace" — and, because a workspace sits
 * inside exactly one organisation, that question is only answerable once this
 * layer has read the user's *organisation* membership for the workspace's
 * specific parent organisation and handed that state to the domain, which is
 * what actually enforces eligibility (`packages/domain/src/workspace-membership.ts`).
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  addWorkspaceMember,
  toUserId,
  toWorkspaceId,
  toWorkspaceMembershipId,
  transitionWorkspaceMembership,
  type MembershipState,
  type WorkspaceMembership,
} from '@witness/domain';
import type { MembershipAction, WorkspaceMembershipView } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import {
  MEMBERSHIP_ACTION_TO_STATE,
  permittedMembershipActionNames,
} from '../infrastructure/membership-actions.helper.js';
import type { Principal } from '../authz/authorization.port.js';

type MembershipRowWithUser = {
  id: string;
  workspaceId: string;
  userId: string;
  state: string;
  createdAt: Date;
  updatedAt: Date;
  user: { email: string; displayName: string; bio: string | null };
};

@Injectable()
export class WorkspaceMembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<WorkspaceMembershipView[]> {
    await this.requireWorkspace(workspaceId);

    const rows = await this.prisma.workspaceMembership.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, displayName: true, bio: true } } },
      take: 200,
    });

    return rows.map(toView);
  }

  async add(
    workspaceId: string,
    userId: string,
    principal: Principal,
  ): Promise<WorkspaceMembershipView> {
    const workspace = await this.requireWorkspace(workspaceId);
    const user = await this.requireUser(userId);

    const existing = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });

    if (existing !== null) {
      throw new ConflictException({
        error: {
          code: 'DUPLICATE_MEMBERSHIP',
          message: `User '${userId}' is already a member of workspace '${workspaceId}'.`,
        },
      });
    }

    // The eligibility check: the user's organisation membership for THIS
    // workspace's organisation specifically, never any other organisation the
    // user might belong to — that is what stops standing in Organisation A
    // being used to justify access to a workspace under Organisation B.
    const organisationMembership = await this.prisma.organisationMembership.findUnique({
      where: {
        organisationId_userId: { organisationId: workspace.organisationId, userId },
      },
      select: { state: true },
    });

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = addWorkspaceMember({
      id: toWorkspaceMembershipId(randomUUID()),
      workspaceId: toWorkspaceId(workspaceId),
      userId: toUserId(userId),
      organisationMembershipState: (organisationMembership?.state as MembershipState) ?? null,
      addedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMembership.create({
        data: {
          id: outcome.membership.id,
          workspaceId: outcome.membership.workspaceId,
          userId: outcome.membership.userId,
          state: outcome.membership.state,
          createdAt: outcome.membership.createdAt,
          updatedAt: outcome.membership.updatedAt,
        },
      });

      await appendAuditEvent(tx, 'workspace_membership', outcome.membership.id, outcome.event, now);
    });

    return toView({ ...outcome.membership, user });
  }

  async transition(
    workspaceId: string,
    membershipId: string,
    action: MembershipAction,
    principal: Principal,
  ): Promise<WorkspaceMembershipView> {
    const row = await this.prisma.workspaceMembership.findUnique({
      where: { id: membershipId },
      include: { user: { select: { email: true, displayName: true, bio: true } } },
    });

    if (row === null || row.workspaceId !== workspaceId) {
      throw new NotFoundException({
        error: {
          code: 'MEMBERSHIP_NOT_FOUND',
          message: `No membership '${membershipId}' in workspace '${workspaceId}'.`,
        },
      });
    }

    const current: WorkspaceMembership = {
      id: toWorkspaceMembershipId(row.id),
      workspaceId: toWorkspaceId(row.workspaceId),
      userId: toUserId(row.userId),
      state: row.state as MembershipState,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const outcome = transitionWorkspaceMembership(
      current,
      MEMBERSHIP_ACTION_TO_STATE[action.action],
      actor,
      now,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMembership.update({
        where: { id: row.id },
        data: { state: outcome.membership.state, updatedAt: outcome.membership.updatedAt },
      });

      await appendAuditEvent(tx, 'workspace_membership', outcome.membership.id, outcome.event, now);
    });

    return toView({ ...outcome.membership, user: row.user });
  }

  private async requireWorkspace(
    workspaceId: string,
  ): Promise<{ id: string; organisationId: string }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, organisationId: true },
    });

    if (workspace === null) {
      throw new NotFoundException({
        error: { code: 'WORKSPACE_NOT_FOUND', message: `No workspace with id '${workspaceId}'.` },
      });
    }

    return workspace;
  }

  private async requireUser(
    userId: string,
  ): Promise<{ email: string; displayName: string; bio: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, bio: true },
    });

    if (user === null) {
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: `No user with id '${userId}'.` },
      });
    }

    return user;
  }
}

function toView(membership: MembershipRowWithUser): WorkspaceMembershipView {
  const state = membership.state as MembershipState;

  return {
    id: membership.id,
    workspaceId: membership.workspaceId,
    userId: membership.userId,
    userEmail: membership.user.email,
    userDisplayName: membership.user.displayName,
    userBio: membership.user.bio,
    state,
    permittedActions: permittedMembershipActionNames(state),
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}
