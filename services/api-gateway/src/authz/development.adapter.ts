/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DEVELOPMENT ONLY — NOT AN AUTHENTICATION SYSTEM                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * This adapter exists so the Developer Preview can demonstrate an authorisation
 * *boundary* without shipping a fake login screen that looks like security.
 *
 * What it does: reads a header naming the acting user, and applies a small
 * deny-by-default role check.
 *
 * What it is NOT: it performs no authentication. The header is unverified and
 * trivially forged. It proves nothing about who is calling.
 *
 * Why build it this way rather than a homegrown JWT login: a hand-rolled auth
 * system is the single most common way a project ends up with real security
 * debt, and it would have to be deleted when Keycloak lands. A boundary that is
 * obviously not security cannot be mistaken for security.
 *
 * The constructor throws outside the development profile. There is no
 * configuration in which this reaches production — that is the guarantee, and it
 * is tested (`authorization.test.ts`).
 *
 * Replaced in Phase 2 by KeycloakAuthenticationAdapter + CasbinAuthorizationAdapter
 * (roadmap 2.5, 2.6). See docs/engineering/PHASE_EXECUTION_PLAN.md.
 */

import { Injectable, Logger } from '@nestjs/common';

import {
  AuthorizationPort,
  type Action,
  type AuthorizationDecision,
  type Principal,
} from './authorization.port.js';

/** Role → permitted actions. Anything not listed is denied. */
const ROLE_GRANTS: Readonly<Record<string, readonly Action[]>> = Object.freeze({
  reader: ['record:read', 'organisation:read'],
  contributor: ['record:read', 'record:create', 'organisation:read'],
  reviewer: ['record:read', 'record:create', 'record:review', 'organisation:read'],
  // Least privilege (Constitution, Authority and Access): organisation creation
  // is the one privileged action in this slice, so it is the one grant `admin`
  // adds on top of what `reviewer` already has — not a blanket superuser role.
  admin: [
    'record:read',
    'record:create',
    'record:review',
    'organisation:read',
    'organisation:create',
  ],
});

@Injectable()
export class DevelopmentAuthorizationAdapter extends AuthorizationPort {
  private readonly logger = new Logger(DevelopmentAuthorizationAdapter.name);

  constructor(profile: string) {
    super();

    if (profile !== 'development') {
      // Fail at construction, not at first request. A server that starts and
      // then denies everything is a worse failure than one that refuses to start
      // and says why.
      throw new Error(
        `DevelopmentAuthorizationAdapter cannot be used in the '${profile}' profile. ` +
          'It performs no authentication. Wire the Keycloak adapter (ADR-0007) instead.',
      );
    }

    this.logger.warn(
      'Using the DEVELOPMENT authorisation adapter. Requests are NOT authenticated; ' +
        'the X-Witness-Dev-User header is unverified. Never expose this beyond localhost.',
    );
  }

  /**
   * "Authenticate" from an unverified header.
   *
   * Format: `X-Witness-Dev-User: <display name>|<role>`. Absent header means
   * unauthenticated, which the guard turns into a 401 — the preview does not
   * silently grant anonymous access.
   */
  async authenticate(header: string | undefined): Promise<Principal | null> {
    if (header === undefined || header.trim() === '') {
      return null;
    }

    const [rawName, rawRole] = header.split('|');
    const displayName = (rawName ?? '').trim();
    const role = (rawRole ?? 'reader').trim().toLowerCase();

    if (displayName === '') {
      return null;
    }

    if (!Object.hasOwn(ROLE_GRANTS, role)) {
      // An unknown role is not upgraded to a default — it resolves to a
      // principal with no grants at all, which then fails every decision.
      return { subject: `dev:${displayName}`, displayName, kind: 'human', roles: [] };
    }

    return { subject: `dev:${displayName}`, displayName, kind: 'human', roles: [role] };
  }

  async decide(principal: Principal, action: Action): Promise<AuthorizationDecision> {
    for (const role of principal.roles) {
      if ((ROLE_GRANTS[role] ?? []).includes(action)) {
        return { allowed: true, reason: `role '${role}' grants '${action}'` };
      }
    }

    return {
      allowed: false,
      reason:
        principal.roles.length === 0
          ? `principal has no recognised role, so '${action}' is denied by default`
          : `no role in [${principal.roles.join(', ')}] grants '${action}'`,
    };
  }
}
