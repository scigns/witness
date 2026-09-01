/**
 * `AuthorizationGuard` is the single place a real session and the unverified
 * dev header meet. The guarantee under test: when a real, verified session
 * resolves a principal, that principal is used — a forged
 * `X-Witness-Dev-User` header sent alongside a valid bearer token cannot
 * widen (or otherwise change) what the request is allowed to do.
 */

import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationPort, Principal } from './authorization.port.js';
import { AuthorizationGuard, FORBIDDEN_USER_MESSAGE } from './authorization.guard.js';
import type { PolicyEnforcementService } from './policy-enforcement.service.js';
import type { SessionAuthenticator } from './session-authenticator.js';

type RequestWithPrincipal = {
  headers: Record<string, string | undefined>;
  params: Record<string, string | undefined>;
  principal?: Principal;
};

function fakePolicyEnforcement() {
  return {
    decide: vi.fn().mockResolvedValue({ allowed: true, reason: 'ok' }),
  } as unknown as PolicyEnforcementService;
}

function fakeReflector(action: string | undefined) {
  return { getAllAndOverride: vi.fn().mockReturnValue(action) } as never;
}

function fakeContext(request: RequestWithPrincipal) {
  return {
    getHandler: () => ({ name: 'testHandler' }),
    getClass: () => ({ name: 'TestController' }),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as Parameters<AuthorizationGuard['canActivate']>[0];
}

describe('AuthorizationGuard — session precedence over the development header', () => {
  it('uses the session principal when both a valid session and a dev header are present', async () => {
    const sessionPrincipal: Principal = {
      subject: 'user:real-1',
      displayName: 'Real Session User',
      kind: 'human',
      roles: ['contributor'],
    };
    const sessionAuthenticator = {
      authenticate: vi.fn().mockResolvedValue(sessionPrincipal),
    } as unknown as SessionAuthenticator;

    const authorization = {
      // If the guard ever asks the dev-header path for a principal despite a
      // session already resolving, this attacker-controlled role must not
      // be the one `decide` evaluates.
      authenticate: vi.fn().mockResolvedValue({
        subject: 'dev:Forged Admin',
        displayName: 'Forged Admin',
        kind: 'human',
        roles: ['admin'],
      }),
    } as unknown as AuthorizationPort;
    const policyEnforcement = fakePolicyEnforcement();

    const guard = new AuthorizationGuard(
      fakeReflector('record:read'),
      authorization,
      sessionAuthenticator,
      policyEnforcement,
    );

    const request: RequestWithPrincipal = {
      headers: {
        authorization: 'Bearer real-session-token',
        'x-witness-dev-user': 'Forged Admin|admin',
      },
      params: {},
    };

    await guard.canActivate(fakeContext(request));

    expect(policyEnforcement.decide).toHaveBeenCalledWith(sessionPrincipal, 'record:read', {
      type: 'global',
    });
    expect(request.principal).toEqual(sessionPrincipal);
  });

  it('falls back to the dev header only when no session principal resolves', async () => {
    const sessionAuthenticator = {
      authenticate: vi.fn().mockResolvedValue(null),
    } as unknown as SessionAuthenticator;

    const devPrincipal: Principal = {
      subject: 'dev:Local Dev',
      displayName: 'Local Dev',
      kind: 'human',
      roles: ['reader'],
    };
    const authorization = {
      authenticate: vi.fn().mockResolvedValue(devPrincipal),
    } as unknown as AuthorizationPort;
    const policyEnforcement = fakePolicyEnforcement();

    const guard = new AuthorizationGuard(
      fakeReflector('record:read'),
      authorization,
      sessionAuthenticator,
      policyEnforcement,
    );

    const request: RequestWithPrincipal = {
      headers: { 'x-witness-dev-user': 'Local Dev|reader' },
      params: {},
    };

    await guard.canActivate(fakeContext(request));

    expect(policyEnforcement.decide).toHaveBeenCalledWith(devPrincipal, 'record:read', {
      type: 'global',
    });
    expect(request.principal).toEqual(devPrincipal);
  });
});

describe('AuthorizationGuard — denial response shape', () => {
  it('shows a plain-language message and keeps the raw policy-engine reason out of it', async () => {
    const sessionPrincipal: Principal = {
      subject: 'user:reader-1',
      displayName: 'Reader User',
      kind: 'human',
      roles: ['reader'],
    };
    const sessionAuthenticator = {
      authenticate: vi.fn().mockResolvedValue(sessionPrincipal),
    } as unknown as SessionAuthenticator;
    const authorization = {
      authenticate: vi.fn().mockResolvedValue(null),
    } as unknown as AuthorizationPort;
    const rawReason = "no role in [reader] grants 'workspace_membership:read' in workspace 'ws-1'";
    const policyEnforcement = {
      decide: vi.fn().mockResolvedValue({ allowed: false, reason: rawReason }),
    } as unknown as PolicyEnforcementService;

    const guard = new AuthorizationGuard(
      fakeReflector('workspace_membership:read'),
      authorization,
      sessionAuthenticator,
      policyEnforcement,
    );

    const request: RequestWithPrincipal = {
      headers: { authorization: 'Bearer token' },
      params: { workspaceId: 'ws-1' },
    };

    await expect(guard.canActivate(fakeContext(request))).rejects.toMatchObject({
      response: {
        error: expect.objectContaining({
          code: 'FORBIDDEN',
          message: FORBIDDEN_USER_MESSAGE,
          details: rawReason,
        }),
      },
    });
  });
});

describe('AuthorizationGuard — development invoice containment', () => {
  it('rejects unverified development invoice access off localhost', async () => {
    const guard = new AuthorizationGuard(
      fakeReflector('invoice:read'),
      {
        authenticate: vi.fn().mockResolvedValue({
          subject: 'dev',
          displayName: 'Dev',
          kind: 'human',
          roles: ['admin'],
        }),
      } as never,
      { authenticate: vi.fn().mockResolvedValue(null) } as never,
      fakePolicyEnforcement(),
    );
    await expect(
      guard.canActivate(
        fakeContext({
          headers: { 'x-witness-dev-user': 'Dev|admin' },
          params: {},
          socket: { remoteAddress: '10.0.0.5' },
        }),
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'DEVELOPMENT_ACCESS_LOCAL_ONLY' } } });
  });
});
describe('AuthorizationGuard — platform authority identity', () => {
  it('never accepts the unverified development header for platform role mutation', async () => {
    const guard = new AuthorizationGuard(
      fakeReflector('platform_role:write'),
      {
        authenticate: vi.fn().mockResolvedValue({
          subject: 'dev:Forged Operator',
          displayName: 'Forged Operator',
          kind: 'human',
          roles: ['admin'],
        }),
      } as never,
      { authenticate: vi.fn().mockResolvedValue(null) } as never,
      fakePolicyEnforcement(),
    );
    await expect(
      guard.canActivate(
        fakeContext({
          headers: { 'x-witness-dev-user': 'Forged Operator|admin' },
          params: {},
        }),
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'VERIFIED_OPERATOR_REQUIRED' } } });
  });
});
