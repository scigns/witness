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
 * `principal.roles` is the *global* grant tier set from
 * `RoleResolutionService.globalGrantTiers` — every `WitnessRole` the
 * signed-in user holds anywhere, flattened, `admin` EXCLUDED. This is used
 * only for actions that have no organisation or workspace to scope to
 * (`record:*`, `user:*`, `role:read`) — the actual per-request,
 * scope-aware decision for organisation- and workspace-bound actions is
 * `PolicyEnforcementService`'s job (Milestone 1.4, Authorisation
 * hardening), not this class's. See `role-resolution.service.ts` for why
 * `admin` is excluded here specifically.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { SessionService } from '../authn/session.service.js';
import { RoleResolutionService } from './role-resolution.service.js';
import type { Principal } from './authorization.port.js';

@Injectable()
export class SessionAuthenticator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly roleResolution: RoleResolutionService,
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

    const roles = await this.roleResolution.globalGrantTiers(userId);

    return {
      subject: `user:${user.id}`,
      displayName: user.displayName,
      kind: 'human',
      roles,
    };
  }
}
