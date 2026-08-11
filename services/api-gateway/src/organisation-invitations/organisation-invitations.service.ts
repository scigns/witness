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

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
import type { InviteOrganisationUserRequest, OrganisationInvitationView } from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import type { Principal } from '../authz/authorization.port.js';

@Injectable()
export class OrganisationInvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async invite(
    organisationId: string,
    request: InviteOrganisationUserRequest,
    principal: Principal,
  ): Promise<OrganisationInvitationView> {
    await this.requireOrganisation(organisationId);

    // Normalise before the duplicate check so 'Name@Example.com' and
    // 'name@example.com' collide here rather than at the unique-constraint
    // violation — same reasoning as `UsersService.create`.
    const email = normaliseEmail(request.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing !== null) {
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
    });

    return {
      userId: userOutcome.user.id,
      email: userOutcome.user.email,
      displayName: userOutcome.user.displayName,
      accountState: userOutcome.user.accountState,
      organisationId,
      membershipId: membershipOutcome.membership.id,
      role: roleOutcome.assignment.role,
      createdAt: userOutcome.user.createdAt.toISOString(),
    };
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
}
