/**
 * The `AuthorizationPort` implementation bound in every profile.
 *
 * Its `decide()` is the shared, profile-independent role-grants table
 * (`role-grants.ts`) — used regardless of whether the principal came from a
 * real session (`SessionAuthenticator`, tried first by `AuthorizationGuard`)
 * or, in development only, the unverified dev header. Its `authenticate()`
 * is that dev-header fallback, and only that: it delegates to
 * `DevelopmentAuthorizationAdapter` when the profile permits one to be
 * constructed, and returns `null` — never a principal — everywhere else.
 *
 * This is what lets `app.module.ts` bind a real `AuthorizationPort` in every
 * profile now, replacing the boot-time throw that used to stand in for
 * "Keycloak and Casbin integration is Phase 2" — Phase 2 identity has
 * (partially) arrived.
 */

import { Injectable } from '@nestjs/common';

import {
  AuthorizationPort,
  type Action,
  type AuthorizationDecision,
  type Principal,
} from './authorization.port.js';
import { DevelopmentAuthorizationAdapter } from './development.adapter.js';
import { decideByRoleGrants } from './role-grants.js';

@Injectable()
export class SessionBackedAuthorizationAdapter extends AuthorizationPort {
  private readonly devFallback: DevelopmentAuthorizationAdapter | null;

  constructor(profile: string) {
    super();
    this.devFallback =
      profile === 'development' ? new DevelopmentAuthorizationAdapter(profile) : null;
  }

  async authenticate(header: string | undefined): Promise<Principal | null> {
    if (this.devFallback === null) return null;
    return this.devFallback.authenticate(header);
  }

  async decide(principal: Principal, action: Action): Promise<AuthorizationDecision> {
    return decideByRoleGrants(principal, action);
  }
}
