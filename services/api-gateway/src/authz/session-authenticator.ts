/**
 * Resolves a `Principal` from a real, verified session — the replacement for
 * the development-only `X-Witness-Dev-User` header at real request
 * boundaries (BUILD_ROADMAP.md Milestone 1.3, Authentication).
 *
 * Deliberately NOT part of `AuthorizationPort`: that port's `authenticate()`
 * stays scoped to the unverified dev-header path (and is simply never
 * reachable outside the development profile, since
 * `DevelopmentAuthorizationAdapter` is never constructed there). This class
 * is always available, in every profile, and `AuthorizationGuard` tries it
 * first.
 *
 * `principal.roles` is computed by flattening every `WitnessRole` the
 * signed-in user holds via any organisation- or workspace-scoped
 * `RoleAssignment` into the existing `reader`/`contributor`/`reviewer` grant
 * tiers `role-grants.ts` already defines — deliberately EXCLUDING `admin`.
 * An `admin` `RoleAssignment` is scope-relative ("administers organisation
 * X"); it must not grant the *global* actions `role-grants.ts` gates behind
 * the literal string `'admin'` (organisation:create, user:create, every
 * membership/role-assignment write). Precisely resolving *scoped*
 * administration is Authorisation hardening's job (the next capability);
 * this class fails closed on it rather than approximating it unsafely.
 *
 * This flattening is not a precision loss for `record:*` actions
 * specifically: nothing on `Record` is organisation- or workspace-scoped
 * yet (`architecture/domains/DOMAIN_MODEL.md` §1), so "the user holds this
 * role somewhere" is exactly as precise as the system can honestly be today.
 */

import { Injectable } from '@nestjs/common';

import { isInGoodStanding, type MembershipState, type WitnessRole } from '@witness/domain';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { SessionService } from '../authn/session.service.js';
import type { Principal } from './authorization.port.js';

/**
 * A held `WitnessRole` → the dev-grant tier it carries into
 * `role-grants.ts`. `admin` maps to nothing (see the file header). Multiple
 * `WitnessRole`s can map to the same tier — `facilitator` and `participant`
 * exist as distinct product-facing roles (`packages/domain/src/role.ts`)
 * without needing their own request-authorisation tier yet.
 */
const WITNESS_ROLE_TO_GRANT_TIER: Readonly<Record<WitnessRole, string | null>> = Object.freeze({
  admin: null,
  facilitator: 'contributor',
  contributor: 'contributor',
  reviewer: 'reviewer',
  participant: 'reader',
  reader: 'reader',
});

@Injectable()
export class SessionAuthenticator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  /** `authorizationHeader` is the raw `Authorization` header value, e.g. `'Bearer <token>'`. */
  async authenticate(authorizationHeader: string | undefined): Promise<Principal | null> {
    if (authorizationHeader === undefined) return null;

    const [scheme, token] = authorizationHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token.trim() === '') {
      return null;
    }

    const userId = await this.sessions.resolveUserId(token);
    if (userId === null) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, accountState: true },
    });

    // Fails closed silently (as "no session"), not with an error — an
    // account that was suspended or deactivated after the session was
    // issued must not go on being usable just because the token is still
    // technically valid.
    if (user === null || user.accountState !== 'active') return null;

    const roles = await this.effectiveRoleGrantTiers(userId);

    return {
      subject: `user:${user.id}`,
      displayName: user.displayName,
      kind: 'human',
      roles,
    };
  }

  private async effectiveRoleGrantTiers(userId: string): Promise<string[]> {
    const assignments = await this.prisma.roleAssignment.findMany({
      where: { userId },
      select: { role: true, organisationId: true, workspaceId: true },
    });

    if (assignments.length === 0) return [];

    // Re-verify the membership backing each assignment is still in good
    // standing — a role assignment survives a later membership suspension
    // as a *record*, but must not go on granting access once the
    // membership it depends on has lapsed.
    const tiers = new Set<string>();

    for (const assignment of assignments) {
      const inGoodStanding =
        assignment.organisationId !== null
          ? await this.organisationMembershipInGoodStanding(userId, assignment.organisationId)
          : await this.workspaceMembershipInGoodStanding(userId, assignment.workspaceId!);

      if (!inGoodStanding) continue;

      const tier = WITNESS_ROLE_TO_GRANT_TIER[assignment.role as WitnessRole];
      if (tier !== null && tier !== undefined) tiers.add(tier);
    }

    return [...tiers];
  }

  private async organisationMembershipInGoodStanding(
    userId: string,
    organisationId: string,
  ): Promise<boolean> {
    const membership = await this.prisma.organisationMembership.findUnique({
      where: { organisationId_userId: { organisationId, userId } },
      select: { state: true },
    });
    return membership !== null && isInGoodStanding(membership.state as MembershipState);
  }

  private async workspaceMembershipInGoodStanding(
    userId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { state: true },
    });
    return membership !== null && isInGoodStanding(membership.state as MembershipState);
  }
}
