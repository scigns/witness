/**
 * Confines the development identity-provider double's sign-in surface to
 * this machine (Phase 6, Track E — physical-device LAN acceptance testing).
 *
 * `DevelopmentIdentityProviderAdapter`'s own file header is explicit that it
 * "performs no check that the caller is who they claim" — completing this
 * flow from anywhere is exactly as unverified as sending
 * `X-Witness-Dev-User` (`AuthorizationGuard`'s own LAN-containment check,
 * which this mirrors). The API may be bound to a LAN-reachable address on
 * purpose, for a phone's participant-token traffic; a second device on that
 * same LAN completing a real sign-in and inheriting whatever role the
 * resulting identity happens to hold is a distinct route to the same
 * privilege this API must not hand out remotely.
 *
 * Participant join/capture (`/api/v1/session-join/*`,
 * `/api/v1/participant-capture/*`) and public reads never touch these
 * paths — only registered here, nothing broader.
 */

import type { NextFunction, Request, Response } from 'express';

import { isLoopbackAddress } from './loopback.js';

const RESTRICTED_PATH_PREFIXES = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/dev-idp',
  '/api/v1/auth/callback',
];

export function devSignInLoopbackGuard() {
  return (request: Request, response: Response, next: NextFunction): void => {
    const restricted = RESTRICTED_PATH_PREFIXES.some((prefix) => request.path.startsWith(prefix));
    if (restricted && !isLoopbackAddress(request.socket.remoteAddress)) {
      response.status(403).json({
        error: {
          code: 'DEV_SIGNIN_LOOPBACK_ONLY',
          message:
            'The development sign-in flow is restricted to localhost, even though this API ' +
            'may be reachable on the local network for physical-device participant testing.',
        },
      });
      return;
    }
    next();
  };
}
