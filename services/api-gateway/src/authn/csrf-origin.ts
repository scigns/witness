import type { NextFunction, Request, Response } from 'express';

import { bearerToken, cookieToken } from './browser-session.js';

export function csrfOriginProtection(trustedOrigin: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const cookieAuthenticated = cookieToken(request) !== null && bearerToken(request) === null;

    if (unsafe && cookieAuthenticated && request.headers.origin !== trustedOrigin) {
      response.status(403).json({
        error: { code: 'CSRF_ORIGIN_DENIED', message: 'Request origin is not allowed.' },
      });
      return;
    }
    next();
  };
}
