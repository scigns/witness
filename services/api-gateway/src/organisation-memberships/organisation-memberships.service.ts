/**
 * Application layer for organisation memberships.
 *
 * "Does this user belong to this organisation" — nothing about what they may
 * do there (Milestone 1.2, Roles and Permission Assignment, is separate and
 * later). Mirrors `OrganisationsService`'s persistence pattern.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  addOrganisationMember,
  toOrganisationId,
  toOrganisationMembershipId,
  toUserId,
  transitionOrganisationMembership,
  type MembershipState,
  type OrganisationMembership,
} from '@witness/domain';
import type { MembershipAction, OrganisationMembershipView } from '@witness/contracts';

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
  organisationId: string;
  userId: string;
  state: string;
  createdAt: Date;
  updatedAt: Date;
  user: { email: string; displayName: string };
};

@Injectable()
export class OrganisationMembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organisationId: string): Promise<OrganisationMembershipView[]> {
    await this.requireOrganisation(organisationId);

    const rows = await this.prisma.organisationMembership.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, displayName: true } } },
      take: 200,
    });

    return rows.map(toView);
  }

  async add(
    organisationId: string,
    userId: string,
    principal: Principal,
  ): Promise<OrganisationMembershipView> {
    await this.requireOrganisation(organisationId);
    const user = await this.requireUser(userId);

    const existing = await this.prisma.organisationMembership.findUnique({
      where: { organisationId_userId: { organisationId, userId } },
    });

    if (existing !== null) {
      throw new ConflictException({
        error: {
          code: 'DUPLICATE_MEMBERSHIP',
          message: `User '${userId}' is already a member of organisation '${organisationId}'.`,
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const outcome = addOrganisationMember({
      id: toOrganisationMembershipId(randomUUID()),
      organisationId: toOrganisationId(organisationId),
      userId: toUserId(userId),
      addedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.organisationMembership.create({
        data: {
          id: outcome.membership.id,
          organisationId: outcome.membership.organisationId,
          userId: outcome.membership.userId,
          state: outcome.membership.state,
          createdAt: outcome.membership.createdAt,
          updatedAt: outcome.membership.updatedAt,
        },
      });

      await appendAuditEvent(
        tx,
        'organisation_membership',
        outcome.membership.id,
        outcome.event,
        now,
      );
    });

    return toView({ ...outcome.membership, user });
  }

  async transition(
    organisationId: string,
    membershipId: string,
    action: MembershipAction,
    principal: Principal,
  ): Promise<OrganisationMembershipView> {
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

    const current: OrganisationMembership = {
      id: toOrganisationMembershipId(row.id),
      organisationId: toOrganisationId(row.organisationId),
      userId: toUserId(row.userId),
      state: row.state as MembershipState,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const outcome = transitionOrganisationMembership(
      current,
      MEMBERSHIP_ACTION_TO_STATE[action.action],
      actor,
      now,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.organisationMembership.update({
        where: { id: row.id },
        data: { state: outcome.membership.state, updatedAt: outcome.membership.updatedAt },
      });

      await appendAuditEvent(
        tx,
        'organisation_membership',
        outcome.membership.id,
        outcome.event,
        now,
      );
    });

    return toView({ ...outcome.membership, user: row.user });
  }

  private async requireOrganisation(organisationId: string): Promise<void> {
    const exists = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true },
    });

    if (exists === null) {
      throw new NotFoundException({
        error: {
          code: 'ORGANISATION_NOT_FOUND',
          message: `No organisation with id '${organisationId}'.`,
        },
      });
    }
  }

  private async requireUser(userId: string): Promise<{ email: string; displayName: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });

    if (user === null) {
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: `No user with id '${userId}'.` },
      });
    }

    return user;
  }
}

function toView(membership: MembershipRowWithUser): OrganisationMembershipView {
  const state = membership.state as MembershipState;

  return {
    id: membership.id,
    organisationId: membership.organisationId,
    userId: membership.userId,
    userEmail: membership.user.email,
    userDisplayName: membership.user.displayName,
    state,
    permittedActions: permittedMembershipActionNames(state),
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}
