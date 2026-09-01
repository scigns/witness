/**
 * The single per-request authorisation decision point (BUILD_ROADMAP.md
 * Milestone 1.4, Authorisation hardening) — what `AuthorizationGuard` calls
 * instead of `AuthorizationPort.decide()` directly.
 *
 * Deny-by-default, structurally: every path below that is not an explicit
 * `{ allowed: true }` is a denial, and a thrown error from either the
 * database or the Casbin policy engine is caught and treated as a denial
 * (ADR-0007's accepted "fail-closed availability cost" — a policy-decision
 * bug becomes an outage, never a silent allow).
 *
 * The unverified `X-Witness-Dev-User` header path is untouched: a principal
 * whose `subject` does not start with `user:` (i.e. not a real,
 * Milestone-1.3 session) is not a user this service can look up
 * organisation or workspace membership for, so it falls back to
 * `AuthorizationPort.decide()` — the same flat, unscoped role-grants check
 * that has always governed that path. Scoping is a property of real
 * identity; it cannot apply to a header nobody has verified.
 */

import { Injectable, Logger } from '@nestjs/common';

// `AuthorizationPort` is imported as a *value*, not a type. It is the Nest
// injection token for this service's first constructor parameter, and an
// `import type` is erased at compile time — TypeScript then emits `Function`
// for `design:paramtypes` and Nest cannot resolve the dependency, so the
// application fails to boot. The unit tests do not catch this because they
// construct the service directly rather than through the container.
import { AuthorizationPort } from './authorization.port.js';
import type { Action, AuthorizationDecision, Principal } from './authorization.port.js';
import { PolicyEngineService } from './policy-engine.service.js';
import { RoleResolutionService, type ResourceScope } from './role-resolution.service.js';

const SESSION_SUBJECT_PREFIX = 'user:';
const PLATFORM_ONLY_ACTIONS: ReadonlySet<Action> = new Set(['payment:settle']);

function scopeLabel(scope: ResourceScope): string {
  switch (scope.type) {
    case 'global':
      return 'the global scope';
    case 'organisation':
      return `organisation '${scope.organisationId}'`;
    case 'workspace':
      return `workspace '${scope.workspaceId}'`;
  }
}

@Injectable()
export class PolicyEnforcementService {
  private readonly logger = new Logger(PolicyEnforcementService.name);

  constructor(
    private readonly legacyAuthorization: AuthorizationPort,
    private readonly roleResolution: RoleResolutionService,
    private readonly policyEngine: PolicyEngineService,
  ) {}

  async decide(
    principal: Principal,
    action: Action,
    scope: ResourceScope,
  ): Promise<AuthorizationDecision> {
    if (!principal.subject.startsWith(SESSION_SUBJECT_PREFIX)) {
      return this.legacyAuthorization.decide(principal, action);
    }

    const userId = principal.subject.slice(SESSION_SUBJECT_PREFIX.length);

    let tiers: string[];
    try {
      tiers = PLATFORM_ONLY_ACTIONS.has(action)
        ? await this.roleResolution.platformGrantTiers(userId)
        : scope.type === 'global'
          ? await this.roleResolution.globalGrantTiers(userId)
          : await this.roleResolution.scopedGrantTiers(userId, scope);
    } catch (error) {
      this.logger.error(
        `Role resolution failed for ${principal.subject} in ${scopeLabel(scope)}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      return {
        allowed: false,
        reason: "could not resolve the principal's roles — denying by default",
      };
    }

    if (tiers.length === 0) {
      return {
        allowed: false,
        reason: `principal holds no role in ${scopeLabel(scope)}, so '${action}' is denied by default`,
      };
    }

    for (const tier of tiers) {
      let granted: boolean;
      try {
        granted = await this.policyEngine.grants(tier, action);
      } catch (error) {
        this.logger.error(
          `Policy engine unavailable while deciding '${action}' for ${principal.subject}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
        return { allowed: false, reason: 'policy engine unavailable — denying by default' };
      }

      if (granted) {
        return {
          allowed: true,
          reason: `role '${tier}' grants '${action}' in ${scopeLabel(scope)}`,
        };
      }
    }

    return {
      allowed: false,
      reason: `no role in [${tiers.join(', ')}] grants '${action}' in ${scopeLabel(scope)}`,
    };
  }
}
