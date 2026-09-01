/**
 * The single point at which every request is authorised.
 *
 * Deny-by-default is structural here: a route with no `@Requires(...)` decorator
 * is refused rather than allowed through. Forgetting the decorator therefore
 * breaks the route loudly in development instead of publishing it to the world.
 */

import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthorizationPort, type Action, type Principal } from './authorization.port.js';
import { PolicyEnforcementService } from './policy-enforcement.service.js';
import type { ResourceScope } from './role-resolution.service.js';
import { SessionAuthenticator } from './session-authenticator.js';

export const REQUIRED_ACTION = 'witness:required-action';

/**
 * `decision.reason` (e.g. `no role in [reader] grants 'workspace_membership:read'
 * in workspace '<uuid>'`) is precise and useful to an operator, and stays
 * exactly that precise in the log line below and in `details` here — but it
 * is an internal policy-engine string, not something a co-design facilitator
 * or participant should ever read as the reason their own screen didn't load.
 * One constant, centrally, rather than each of the dozens of `@Requires(...)`
 * routes inventing its own user-facing copy.
 */
export const FORBIDDEN_USER_MESSAGE =
  "You don't have permission to do that. Ask an organisation or workspace administrator to check your access.";

/** Declare the action a route requires. Absence means the route is denied. */
export const Requires = (action: Action) => SetMetadata(REQUIRED_ACTION, action);

export interface RequestWithPrincipal {
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  principal?: Principal;
  socket?: { remoteAddress?: string };
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/**
 * Which organisation or workspace does this request concern? Route params
 * win when present (reading/acting on an existing organisation or
 * workspace); otherwise a workspace-creation body carries the parent
 * `organisationId` that the new workspace will belong to. Anything else
 * (record:*, user:*, role:read, organisation:create) has no scope to
 * resolve and falls through to the global tier set.
 */
function resolveScope(request: RequestWithPrincipal): ResourceScope {
  if (typeof request.params['organisationId'] === 'string') {
    return { type: 'organisation', organisationId: request.params['organisationId'] };
  }
  if (typeof request.params['workspaceId'] === 'string') {
    return { type: 'workspace', workspaceId: request.params['workspaceId'] };
  }
  const bodyOrganisationId = request.body?.['organisationId'];
  if (typeof bodyOrganisationId === 'string') {
    return { type: 'organisation', organisationId: bodyOrganisationId };
  }
  return { type: 'global' };
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly logger = new Logger(AuthorizationGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationPort,
    private readonly sessionAuthenticator: SessionAuthenticator,
    private readonly policyEnforcement: PolicyEnforcementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Action | undefined>(REQUIRED_ACTION, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();

    if (required === undefined) {
      // No declared requirement. Deny — an undeclared route is a bug, and the
      // safe reading of a bug in an authorisation path is "no".
      this.logger.error(
        `Route ${context.getClass().name}.${context.getHandler().name} declares no required ` +
          'action. Denying. Add @Requires(...) or mark it @Public().',
      );
      throw new ForbiddenException({
        error: {
          code: 'NO_POLICY_DECLARED',
          message: 'This route declares no authorisation policy.',
        },
      });
    }

    // A real, verified session always wins when present — the dev header is
    // a fallback for local iteration, never a competing source of truth.
    const authorizationHeader = request.headers['authorization'];
    const sessionPrincipal = await this.sessionAuthenticator.authenticate(
      Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader,
    );

    const devHeader = request.headers['x-witness-dev-user'];
    const principal =
      sessionPrincipal ??
      (await this.authorization.authenticate(Array.isArray(devHeader) ? devHeader[0] : devHeader));

    if (principal === null) {
      throw new UnauthorizedException({
        error: {
          code: 'UNAUTHENTICATED',
          message:
            'No principal. Sign in and send Authorization: Bearer <session token>. In the ' +
            'development profile only, X-Witness-Dev-User: "Name|reviewer" is also accepted — ' +
            'that header is unverified and never trusted outside development.',
        },
      });
    }

    // Platform authority is never available through the unverified development
    // header, even on localhost. It requires a real OIDC-backed session.
    if (required.startsWith('platform_role:') && sessionPrincipal === null) {
      throw new UnauthorizedException({
        error: {
          code: 'VERIFIED_OPERATOR_REQUIRED',
          message: 'Platform authority requires a verified Witness operator session.',
        },
      });
    }
    // Development identity is intentionally unverified. Keep invoice
    // surfaces confined to a local socket even when a role header claims admin.
    if (
      required.startsWith('invoice:') &&
      sessionPrincipal === null &&
      !isLoopback(request.socket?.remoteAddress)
    ) {
      throw new UnauthorizedException({
        error: {
          code: 'DEVELOPMENT_ACCESS_LOCAL_ONLY',
          message: 'Development-authenticated invoice access is restricted to localhost.',
        },
      });
    }

    const scope = resolveScope(request);
    const decision = await this.policyEnforcement.decide(principal, required, scope);

    if (!decision.allowed) {
      this.logger.warn(`Denied ${principal.subject} → ${required}: ${decision.reason}`);
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: FORBIDDEN_USER_MESSAGE, details: decision.reason },
      });
    }

    request.principal = principal;
    return true;
  }
}
