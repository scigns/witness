import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationPort, Principal } from '../authz/authorization.port.js';
import { AuthorizationGuard } from '../authz/authorization.guard.js';
import type { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import type { SessionAuthenticator } from '../authz/session-authenticator.js';
import { BillingController } from './commercial.controller.js';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const principal: Principal = {
  subject: 'user:user-a',
  displayName: 'A Admin',
  kind: 'human',
  roles: [],
};

function context(handler: 'overview' | 'requestChange', organisationId: string) {
  const request = { headers: { authorization: 'Bearer valid' }, params: { organisationId } };
  return {
    request,
    execution: {
      getHandler: () => BillingController.prototype[handler],
      getClass: () => BillingController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as Parameters<AuthorizationGuard['canActivate']>[0],
  };
}

function guard(allowedOrganisation: string | null) {
  const policy = {
    decide: vi.fn(async (_principal, action, scope) => ({
      allowed:
        action === 'organisation:update' &&
        scope.type === 'organisation' &&
        scope.organisationId === allowedOrganisation,
      reason: 'organisation-scoped test decision',
    })),
  } as unknown as PolicyEnforcementService;
  return new AuthorizationGuard(
    new Reflector(),
    { authenticate: vi.fn() } as unknown as AuthorizationPort,
    { authenticate: vi.fn().mockResolvedValue(principal) } as unknown as SessionAuthenticator,
    policy,
  );
}

describe('C2 billing route authorisation', () => {
  it.each(['overview', 'requestChange'] as const)(
    'denies %s when the user lacks organisation:update',
    async (handler) => {
      const target = context(handler, ORG_A);
      await expect(guard(null).canActivate(target.execution)).rejects.toMatchObject({
        response: { error: { code: 'FORBIDDEN' } },
      });
    },
  );

  it.each(['overview', 'requestChange'] as const)(
    'denies Organisation A admin access to Organisation B through %s',
    async (handler) => {
      const target = context(handler, ORG_B);
      await expect(guard(ORG_A).canActivate(target.execution)).rejects.toMatchObject({
        response: { error: { code: 'FORBIDDEN' } },
      });
    },
  );

  it.each(['overview', 'requestChange'] as const)(
    'permits %s only in the administrator organisation scope',
    async (handler) => {
      const target = context(handler, ORG_A);
      await expect(guard(ORG_A).canActivate(target.execution)).resolves.toBe(true);
      expect(target.request).toHaveProperty('principal', principal);
    },
  );
});
