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

    const header = request.headers['x-witness-dev-user'];
    const principal = await this.authorization.authenticate(
      Array.isArray(header) ? header[0] : header,
    );

    if (principal === null) {
      throw new UnauthorizedException({
        error: {
          code: 'UNAUTHENTICATED',
          message:
            'No principal. In the Developer Preview, send X-Witness-Dev-User: "Name|reviewer". ' +
            'This header is unverified and exists only in the development profile.',
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
