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
import { SessionAuthenticator } from './session-authenticator.js';

export const REQUIRED_ACTION = 'witness:required-action';

/** Declare the action a route requires. Absence means the route is denied. */
export const Requires = (action: Action) => SetMetadata(REQUIRED_ACTION, action);

export interface RequestWithPrincipal {
  headers: Record<string, string | string[] | undefined>;
  principal?: Principal;
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly logger = new Logger(AuthorizationGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationPort,
    private readonly sessionAuthenticator: SessionAuthenticator,
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

    const decision = await this.authorization.decide(principal, required);

    if (!decision.allowed) {
      this.logger.warn(`Denied ${principal.subject} → ${required}: ${decision.reason}`);
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: decision.reason },
      });
    }

    request.principal = principal;
    return true;
  }
}
