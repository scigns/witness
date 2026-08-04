/**
 * HTTP adapter for sign-in, sign-out, and the current-user endpoint.
 *
 * Deliberately NOT behind `AuthorizationGuard`/`@Requires(...)`: these routes
 * are either what *produces* a principal (`login`, `callback`) or are
 * self-service with no resource-scoped action to check (`logout`, `me`) —
 * the same reasoning `HealthController` already applies to `/health` and
 * `/ready`. `me` still refuses an absent or invalid session; it just does so
 * directly rather than through the action-grants table, because "may see my
 * own identity" is not a role-gated action.
 *
 * Every redirect target is either the fixed, configured web origin or a
 * fixed error path under it — never a caller-supplied URL — so this
 * controller cannot be used as an open redirect.
 */

import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { CurrentUserView } from '@witness/contracts';
import type { WitnessConfig } from '@witness/config';

import { WITNESS_CONFIG } from '../tokens.js';
import { AuthenticationDeniedError, AuthenticationService } from './authentication.service.js';
import { DevelopmentIdentityProviderAdapter } from './development-identity-provider.adapter.js';
import { IdentityProviderPort } from './identity-provider.port.js';
import { SessionService } from './session.service.js';

@Controller('api/v1/auth')
export class AuthenticationController {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly identityProvider: IdentityProviderPort,
    @Inject(WITNESS_CONFIG) private readonly config: WitnessConfig,
  ) {}

  @Get('login')
  async login(@Res() response: Response): Promise<void> {
    const { redirectUrl } = await this.authentication.startLogin();
    response.redirect(302, redirectUrl);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const session = await this.authentication.handleCallback(code ?? '', state ?? '');
      const target = new URL('/auth/callback', this.config.webOrigin);
      target.hash = `token=${session.token}`;
      response.redirect(302, target.toString());
    } catch (error) {
      const reason = error instanceof AuthenticationDeniedError ? error.reason : 'invalid_callback';
      const target = new URL('/auth/error', this.config.webOrigin);
      target.searchParams.set('reason', reason);
      response.redirect(302, target.toString());
    }
  }

  @Post('logout')
  async logout(@Req() request: Request): Promise<{ ok: true }> {
    const token = bearerToken(request);
    if (token !== null) {
      await this.authentication.signOut(token);
    }
    // Idempotent by design: signing out with no session, or a session that
    // was already invalid, is not an error — the caller's intent (be signed
    // out) is already satisfied.
    return { ok: true };
  }

  /**
   * The development-only simulated identity provider's authorization
   * endpoint. Only reachable when the development profile is active — the
   * only profile in which `IdentityProviderPort` is ever bound to
   * `DevelopmentIdentityProviderAdapter` (see `app.module.ts`).
   */
  @Get('dev-idp/authorize')
  devIdpAuthorize(
    @Query('state') state: string | undefined,
    @Query('nonce') nonce: string | undefined,
    @Query('code_challenge') codeChallenge: string | undefined,
    @Query('redirect_uri') redirectUri: string | undefined,
    @Query('subject') subject: string | undefined,
    @Query('email') email: string | undefined,
    @Query('name') name: string | undefined,
    @Res() response: Response,
  ): void {
    if (!(this.identityProvider instanceof DevelopmentIdentityProviderAdapter)) {
      throw new BadRequestException({
        error: {
          code: 'DEV_IDP_NOT_ACTIVE',
          message: 'The development identity provider is not active in this profile.',
        },
      });
    }

    if (
      state === undefined ||
      nonce === undefined ||
      codeChallenge === undefined ||
      redirectUri === undefined
    ) {
      throw new BadRequestException({
        error: { code: 'MALFORMED_REQUEST', message: 'Missing required authorization parameters.' },
      });
    }

    // This file's own header promises every redirect target is the fixed
    // web origin or a fixed path under it — never caller-supplied. Without
    // this check, `redirect_uri` here would be the one exception: a crafted
    // link could send a developer following it to an arbitrary origin. The
    // route is development-profile-only, so the blast radius is a local
    // dev machine, but the promise should hold without a footnote.
    if (redirectUri !== this.config.oidcRedirectUri) {
      throw new BadRequestException({
        error: {
          code: 'MALFORMED_REQUEST',
          message: 'redirect_uri does not match the configured callback URI.',
        },
      });
    }

    // No real consent screen: a query-param-selectable test identity, with a
    // clearly-fake default. This is the one place this file trusts caller
    // input outright — acceptable only because the whole class this belongs
    // to refuses to construct outside the development profile.
    const code = this.identityProvider.registerAuthorizationAttempt({
      nonce,
      codeChallenge,
      redirectUri,
      subject: subject ?? 'dev-subject-1',
      email: email ?? 'dev@example.com',
      name: name ?? 'Development User',
    });

    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    target.searchParams.set('state', state);
    response.redirect(302, target.toString());
  }
}

/**
 * Separate from `AuthenticationController` only because NestJS route
 * prefixes cannot express `/api/v1/me` as a sibling of `/api/v1/auth/*`
 * from within the same `@Controller('api/v1/auth')`. Same no-guard
 * reasoning as above: "may see my own identity" is not a role-gated action.
 */
@Controller('api/v1/me')
export class CurrentUserController {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  async me(@Req() request: Request): Promise<CurrentUserView> {
    const token = bearerToken(request);
    if (token === null) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'No valid session. Sign in first.' },
      });
    }

    const session = await this.sessions.resolveSession(token);
    if (session.status === 'not_found') {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'No valid session. Sign in first.' },
      });
    }
    if (session.status === 'expired') {
      throw new UnauthorizedException({
        error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Sign in again.' },
      });
    }

    const currentUser = await this.authentication.getCurrentUser(session.userId);
    switch (currentUser.status) {
      case 'ok':
        return currentUser.view;
      case 'not_found':
        // The session token was valid, but its account no longer is —
        // defensive only: `AuthSession.user` has `onDelete: Restrict`, so a
        // User row referenced by a live session cannot normally be deleted.
        throw new UnauthorizedException({
          error: {
            code: 'UNKNOWN_ACCOUNT',
            message: 'This session no longer maps to a valid account.',
          },
        });
      case 'suspended':
        throw new ForbiddenException({
          error: {
            code: 'ACCOUNT_SUSPENDED',
            message: 'This account has been suspended. Contact an administrator.',
          },
        });
      case 'deactivated':
        throw new ForbiddenException({
          error: {
            code: 'ACCOUNT_DEACTIVATED',
            message: 'This account has been deactivated. Contact an administrator.',
          },
        });
    }
  }
}

function bearerToken(request: Request): string | null {
  const header = request.headers['authorization'];
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) return null;

  const [scheme, token] = value.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token.trim() === '') {
    return null;
  }

  return token;
}
