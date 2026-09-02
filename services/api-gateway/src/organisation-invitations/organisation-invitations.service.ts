/**
 * Application layer for organisation-scoped user onboarding.
 *
 * `user:create` has always been an admin-tier action (`packages/policy/policy.csv`),
 * but the only route that exercised it — `POST /api/v1/users` — carries no
 * `organisationId`, so `AuthorizationGuard.resolveScope` always resolved it to
 * the *global* scope, which deliberately never grants the admin tier to a real
 * session (`RoleResolutionService.globalGrantTiers`). That left routine
 * onboarding reachable only through `prisma/invite.ts`, an operator script.
 *
 * This service is the organisation-scoped route the admin tier was already
 * entitled to: nested under `/organisations/:organisationId/users`, so
 * `resolveScope` resolves an *organisation* scope, in which
 * `RoleResolutionService.scopedGrantTiers` does include `admin` for an
 * organisation's own administrator. No policy or role-resolution change was
 * needed — only a route that actually carries the scope the grant was always
 * defined against.
 *
 * Mirrors `prisma/invite.ts`'s three-write shape (user, membership, role
 * assignment) but goes through the same domain functions and audit-chain
 * helper every other write-side service in this module uses, so the new
 * membership and role assignment show up in their own subjects' audit
 * history exactly as if an administrator had added an existing user and
 * assigned their role through the two existing endpoints separately.
 */

import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  addOrganisationMember,
  assignRole,
  createUser,
  normaliseEmail,
  toOrganisationId,
  toOrganisationMembershipId,
  toRoleAssignmentId,
  toUserId,
} from '@witness/domain';
import type { Actor } from '@witness/domain';
import type { InviteOrganisationUserRequest, OrganisationInvitationView } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';
import { MailerService } from '../infrastructure/mailer.js';
import { WITNESS_CONFIG } from '../tokens.js';
import type { WitnessConfig } from '@witness/config';

@Injectable()
export class OrganisationInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mailer?: MailerService,
    @Optional() @Inject(WITNESS_CONFIG) private readonly config?: WitnessConfig,
  ) {}

  async invite(
    organisationId: string,
    request: InviteOrganisationUserRequest,
    principal: Principal,
  ): Promise<OrganisationInvitationView> {
    const organisation = await this.requireOrganisation(organisationId);

    // Normalise before the duplicate check so 'Name@Example.com' and
    // 'name@example.com' collide here rather than at the unique-constraint
    // violation — same reasoning as `UsersService.create`.
    const email = normaliseEmail(request.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing !== null) {
      const orphanMembership = await this.prisma.organisationMembership.findUnique({
        where: { organisationId_userId: { organisationId, userId: existing.id } },
      });
      if (existing.accountState === 'invited' && orphanMembership === null) {
        return this.attachExistingInvitation(organisation, existing, request, principal);
      }
      throw new ConflictException({
        error: {
          code: 'DUPLICATE_EMAIL',
          message:
            `A user with email '${email}' already has a Witness account. Add them to this ` +
            'organisation with the existing member picker instead — inviting only registers a ' +
            'brand-new account.',
        },
      });
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();

    const userOutcome = createUser({
      id: toUserId(randomUUID()),
      email: request.email,
      displayName: request.displayName,
      registeredBy: actor,
      registeredAt: now,
    });

    const membershipOutcome = addOrganisationMember({
      id: toOrganisationMembershipId(randomUUID()),
      organisationId: toOrganisationId(organisationId),
      userId: userOutcome.user.id,
      addedBy: actor,
      at: now,
    });

    const roleOutcome = assignRole({
      id: toRoleAssignmentId(randomUUID()),
      userId: userOutcome.user.id,
      role: request.role,
      scope: { type: 'organisation', organisationId: toOrganisationId(organisationId) },
      membershipState: membershipOutcome.membership.state,
      assignedBy: actor,
      at: now,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userOutcome.user.id,
          email: userOutcome.user.email,
          displayName: userOutcome.user.displayName,
          accountState: userOutcome.user.accountState,
          createdAt: userOutcome.user.createdAt,
          updatedAt: userOutcome.user.updatedAt,
        },
      });
      await appendAuditEvent(tx, 'user', userOutcome.user.id, userOutcome.event, now);

      await tx.organisationMembership.create({
        data: {
          id: membershipOutcome.membership.id,
          organisationId: membershipOutcome.membership.organisationId,
          userId: membershipOutcome.membership.userId,
          state: membershipOutcome.membership.state,
          createdAt: membershipOutcome.membership.createdAt,
          updatedAt: membershipOutcome.membership.updatedAt,
        },
      });
      await appendAuditEvent(
        tx,
        'organisation_membership',
        membershipOutcome.membership.id,
        membershipOutcome.event,
        now,
      );

      await tx.roleAssignment.create({
        data: {
          id: roleOutcome.assignment.id,
          scopeType: 'organisation',
          organisationId,
          userId: roleOutcome.assignment.userId,
          role: roleOutcome.assignment.role,
          createdAt: roleOutcome.assignment.createdAt,
          updatedAt: roleOutcome.assignment.updatedAt,
        },
      });
      await appendAuditEvent(
        tx,
        'role_assignment',
        roleOutcome.assignment.id,
        roleOutcome.event,
        now,
      );

      await tx.invitationNotification.create({
        data: {
          id: randomUUID(),
          organisationId,
          userId: userOutcome.user.id,
          membershipId: membershipOutcome.membership.id,
          recipientEmail: userOutcome.user.email,
          status: 'pending',
          attemptCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      });
    });

    const notificationStatus = await this.deliver(
      organisationId,
      userOutcome.user.id,
      userOutcome.user.email,
      organisation.name,
      roleOutcome.assignment.role,
      membershipOutcome.membership.id,
      actor,
    );

    return {
      userId: userOutcome.user.id,
      email: userOutcome.user.email,
      displayName: userOutcome.user.displayName,
      accountState: userOutcome.user.accountState,
      organisationId,
      membershipId: membershipOutcome.membership.id,
      role: roleOutcome.assignment.role,
      createdAt: userOutcome.user.createdAt.toISOString(),
      notificationStatus,
    };
  }

  private async attachExistingInvitation(
    organisation: { id: string; name: string },
    existing: {
      id: string;
      email: string;
      displayName: string;
      accountState: string;
      createdAt: Date;
    },
    request: InviteOrganisationUserRequest,
    principal: Principal,
  ): Promise<OrganisationInvitationView> {
    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const membershipOutcome = addOrganisationMember({
      id: toOrganisationMembershipId(randomUUID()),
      organisationId: toOrganisationId(organisation.id),
      userId: toUserId(existing.id),
      addedBy: actor,
      at: now,
    });
    const roleOutcome = assignRole({
      id: toRoleAssignmentId(randomUUID()),
      userId: toUserId(existing.id),
      role: request.role,
      scope: { type: 'organisation', organisationId: toOrganisationId(organisation.id) },
      membershipState: membershipOutcome.membership.state,
      assignedBy: actor,
      at: now,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.organisationMembership.create({ data: { ...membershipOutcome.membership } });
      await appendAuditEvent(
        tx,
        'organisation_membership',
        membershipOutcome.membership.id,
        membershipOutcome.event,
        now,
      );
      await tx.roleAssignment.create({
        data: {
          id: roleOutcome.assignment.id,
          scopeType: 'organisation',
          organisationId: organisation.id,
          userId: existing.id,
          role: roleOutcome.assignment.role,
          createdAt: now,
          updatedAt: now,
        },
      });
      await appendAuditEvent(
        tx,
        'role_assignment',
        roleOutcome.assignment.id,
        roleOutcome.event,
        now,
      );
      await tx.invitationNotification.create({
        data: {
          id: randomUUID(),
          organisationId: organisation.id,
          userId: existing.id,
          membershipId: membershipOutcome.membership.id,
          recipientEmail: existing.email,
          status: 'pending',
          attemptCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      });
    });
    const notificationStatus = await this.deliver(
      organisation.id,
      existing.id,
      existing.email,
      organisation.name,
      roleOutcome.assignment.role,
      membershipOutcome.membership.id,
      actor,
    );
    return {
      userId: existing.id,
      email: existing.email,
      displayName: existing.displayName,
      accountState: existing.accountState as 'invited',
      organisationId: organisation.id,
      membershipId: membershipOutcome.membership.id,
      role: roleOutcome.assignment.role,
      createdAt: existing.createdAt.toISOString(),
      notificationStatus,
    };
  }

  async resend(
    organisationId: string,
    userId: string,
    principal: Principal,
  ): Promise<{ readonly status: 'pending' | 'sent' | 'failed' }> {
    const organisation = await this.requireOrganisation(organisationId);
    const row = await this.prisma.invitationNotification.findUnique({
      where: { organisationId_userId: { organisationId, userId } },
      include: { user: true },
    });
    if (row === null) throw new NotFoundException('Invitation notification not found.');
    const role = await this.prisma.roleAssignment.findFirst({
      where: { organisationId, userId, scopeType: 'organisation' },
      select: { role: true },
    });
    if (role === null) throw new NotFoundException('Invitation role not found.');
    const actor = await resolveActor(this.prisma, principal);
    const status = await this.deliver(
      organisationId,
      userId,
      row.user.email,
      organisation.name,
      role.role,
      row.membershipId,
      actor,
    );
    return { status };
  }

  private async deliver(
    organisationId: string,
    userId: string,
    email: string,
    organisationName: string,
    role: string,
    membershipId: string,
    actor: Actor,
  ): Promise<'pending' | 'sent' | 'failed'> {
    if (this.mailer === undefined || this.config === undefined) return 'pending';
    const now = new Date();
    const activationUrl = new URL('activate', this.config.webBaseUrl).toString();
    const current = await this.prisma.invitationNotification.findUnique({
      where: { organisationId_userId: { organisationId, userId } },
    });
    const attemptCount = (current?.attemptCount ?? 0) + 1;
    try {
      const result = await this.mailer.sendInvitation({
        to: email,
        organisationName,
        invitedEmail: email,
        role,
        activationUrl,
      });
      await this.prisma.invitationNotification.update({
        where: { organisationId_userId: { organisationId, userId } },
        data: { status: 'sent', attemptCount, lastError: null, sentAt: now, updatedAt: now },
      });
      await this.appendNotificationAudit(userId, 'user.invitation_notification_sent', actor, now, {
        organisationId,
        membershipId,
        attemptCount: String(attemptCount),
        messageId: result.messageId ?? '',
      });
      return 'sent';
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : 'SMTP delivery failed.';
      await this.prisma.invitationNotification.update({
        where: { organisationId_userId: { organisationId, userId } },
        data: { status: 'failed', attemptCount, lastError: message, updatedAt: now },
      });
      await this.appendNotificationAudit(
        userId,
        'user.invitation_notification_failed',
        actor,
        now,
        {
          organisationId,
          membershipId,
          attemptCount: String(attemptCount),
        },
      );
      return 'failed';
    }
  }

  private async appendNotificationAudit(
    userId: string,
    action: 'user.invitation_notification_sent' | 'user.invitation_notification_failed',
    actor: Actor,
    at: Date,
    metadata: Record<string, string>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await appendAuditEvent(tx, 'user', userId, { action, actor, metadata }, at);
    });
  }

  private async requireOrganisation(organisationId: string): Promise<{ id: string; name: string }> {
    const exists = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true, name: true },
    });

    if (exists === null) {
      throw new NotFoundException({
        error: {
          code: 'ORGANISATION_NOT_FOUND',
          message: `No organisation with id '${organisationId}'.`,
        },
      });
    }
    return exists;
  }
}
