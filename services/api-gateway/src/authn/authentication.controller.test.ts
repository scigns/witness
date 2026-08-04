/**
 * `GET /api/v1/me` distinguishes several reasons a request is not served,
 * each with its own error code — that distinction is the point (see the
 * frontend's `apps/web/src/lib/auth.tsx`, which reacts differently to each
 * one rather than treating every non-2xx response as "sign in again").
 */

import { ForbiddenException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { WitnessConfig } from '@witness/config';

import { AuthenticationController, CurrentUserController } from './authentication.controller.js';
import type { AuthenticationService, CurrentUserResult } from './authentication.service.js';
import { DevelopmentIdentityProviderAdapter } from './development-identity-provider.adapter.js';
import type { IdentityProviderPort } from './identity-provider.port.js';
import type { SessionService, SessionLookupResult } from './session.service.js';

function fakeRequest(authorizationHeader: string | undefined) {
  return { headers: { authorization: authorizationHeader } } as never;
}

function fakeAuthentication(getCurrentUserResult: CurrentUserResult) {
  return {
    getCurrentUser: vi.fn().mockResolvedValue(getCurrentUserResult),
  } as unknown as AuthenticationService;
}

function fakeSessions(result: SessionLookupResult) {
  return {
    resolveSession: vi.fn().mockResolvedValue(result),
  } as unknown as SessionService;
}

describe('CurrentUserController — error mapping', () => {
  it('UNAUTHENTICATED when no Authorization header is present', async () => {
    const controller = new CurrentUserController(
      fakeAuthentication({ status: 'not_found' }),
      fakeSessions({ status: 'not_found' }),
    );

    await expect(controller.me(fakeRequest(undefined))).rejects.toMatchObject({
      response: { error: { code: 'UNAUTHENTICATED' } },
    });
    await expect(controller.me(fakeRequest(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('UNAUTHENTICATED for a token that was never issued', async () => {
    const controller = new CurrentUserController(
      fakeAuthentication({ status: 'not_found' }),
      fakeSessions({ status: 'not_found' }),
    );

    await expect(controller.me(fakeRequest('Bearer never-issued'))).rejects.toMatchObject({
      response: { error: { code: 'UNAUTHENTICATED' } },
    });
  });

  it('SESSION_EXPIRED for a token whose session has lapsed', async () => {
    const controller = new CurrentUserController(
      fakeAuthentication({ status: 'not_found' }),
      fakeSessions({ status: 'expired' }),
    );

    await expect(controller.me(fakeRequest('Bearer expired-token'))).rejects.toMatchObject({
      response: { error: { code: 'SESSION_EXPIRED' } },
    });
  });

  it('ACCOUNT_SUSPENDED for a valid session whose account is now suspended', async () => {
    const controller = new CurrentUserController(
      fakeAuthentication({ status: 'suspended' }),
      fakeSessions({ status: 'valid', userId: 'user-1' }),
    );

    const call = controller.me(fakeRequest('Bearer valid-token'));
    await expect(call).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.me(fakeRequest('Bearer valid-token'))).rejects.toMatchObject({
      response: { error: { code: 'ACCOUNT_SUSPENDED' } },
    });
  });

  it('ACCOUNT_DEACTIVATED for a valid session whose account is now deactivated', async () => {
    const controller = new CurrentUserController(
      fakeAuthentication({ status: 'deactivated' }),
      fakeSessions({ status: 'valid', userId: 'user-1' }),
    );

    await expect(controller.me(fakeRequest('Bearer valid-token'))).rejects.toMatchObject({
      response: { error: { code: 'ACCOUNT_DEACTIVATED' } },
    });
  });

  it('UNKNOWN_ACCOUNT for a valid session whose account row is gone', async () => {
    const controller = new CurrentUserController(
      fakeAuthentication({ status: 'not_found' }),
      fakeSessions({ status: 'valid', userId: 'ghost' }),
    );

    await expect(controller.me(fakeRequest('Bearer valid-token'))).rejects.toMatchObject({
      response: { error: { code: 'UNKNOWN_ACCOUNT' } },
    });
  });

  it('returns the current-user view for a valid session and an active account', async () => {
    const view = {
      id: 'user-1',
      displayName: 'Real User',
      email: 'real@example.com',
      accountState: 'active' as const,
      organisations: [],
      workspaces: [],
    };
    const controller = new CurrentUserController(
      fakeAuthentication({ status: 'ok', view }),
      fakeSessions({ status: 'valid', userId: 'user-1' }),
    );

    await expect(controller.me(fakeRequest('Bearer valid-token'))).resolves.toEqual(view);
  });
});

describe('AuthenticationController — dev-idp/authorize redirect_uri validation', () => {
  function controllerWithConfiguredRedirect(configuredRedirectUri: string) {
    const config = {
      webOrigin: 'http://localhost:3000',
      oidcRedirectUri: configuredRedirectUri,
    } as WitnessConfig;
    const identityProvider = new DevelopmentIdentityProviderAdapter(
      'development',
      'http://localhost:3001',
      'witness-api',
    );
    return new AuthenticationController(
      {} as AuthenticationService,
      identityProvider as unknown as IdentityProviderPort,
      config,
    );
  }

  function fakeResponse() {
    return { redirect: vi.fn() } as never;
  }

  it('rejects a redirect_uri that does not match the configured callback URI', () => {
    const controller = controllerWithConfiguredRedirect(
      'http://localhost:3001/api/v1/auth/callback',
    );

    expect(() =>
      controller.devIdpAuthorize(
        'state-1',
        'nonce-1',
        'challenge-1',
        'http://evil.example/callback',
        undefined,
        undefined,
        undefined,
        fakeResponse(),
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts a redirect_uri that matches the configured callback URI', () => {
    const configuredRedirectUri = 'http://localhost:3001/api/v1/auth/callback';
    const controller = controllerWithConfiguredRedirect(configuredRedirectUri);
    const response = fakeResponse();

    expect(() =>
      controller.devIdpAuthorize(
        'state-1',
        'nonce-1',
        'challenge-1',
        configuredRedirectUri,
        undefined,
        undefined,
        undefined,
        response,
      ),
    ).not.toThrow();
    expect(response.redirect).toHaveBeenCalled();
  });
});
