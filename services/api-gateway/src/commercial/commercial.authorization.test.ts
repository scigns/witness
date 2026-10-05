import { OrganisationsController } from '../organisations/organisations.controller.js';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationPort, Principal } from '../authz/authorization.port.js';
import { AuthorizationGuard } from '../authz/authorization.guard.js';
import type { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import type { SessionAuthenticator } from '../authz/session-authenticator.js';
import {
  BillingController,
  CommercialConfigurationController,
  OperatorCommercialConfigurationController,
} from './commercial.controller.js';

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

/**
 * The guard's own job: extracting the right action + scope from each route
 * and calling PolicyEnforcementService.decide() with them, propagating a
 * denial as a 403. This does not re-prove the real policy grants (that is
 * `billing-authority.adversarial.test.ts`'s job) -- it proves the route
 * wiring itself: the right controller class, the right action, the right
 * :organisationId param.
 */
function routeContext(
  controllerClass: { prototype: Record<string, unknown> },
  handler: string,
  organisationId: string,
) {
  const request = { headers: { authorization: 'Bearer valid' }, params: { organisationId } };
  return {
    request,
    execution: {
      getHandler: () => controllerClass.prototype[handler],
      getClass: () => controllerClass,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as Parameters<AuthorizationGuard['canActivate']>[0],
  };
}

function guardForAction(action: string, allowedOrganisation: string | null) {
  const policy = {
    decide: vi.fn(async (_principal, decidedAction, scope) => ({
      allowed:
        decidedAction === action &&
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

describe('commercial-configuration route authorisation (ADR-0034)', () => {
  it("denies the organisation's own self-service resolve() when the guard's decision is false", async () => {
    const target = routeContext(CommercialConfigurationController, 'resolve', ORG_A);
    await expect(
      guardForAction('organisation:read', null).canActivate(target.execution),
    ).rejects.toMatchObject({ response: { error: { code: 'FORBIDDEN' } } });
  });

  it('permits self-service resolve() once organisation:read is granted for that organisation', async () => {
    const target = routeContext(CommercialConfigurationController, 'resolve', ORG_A);
    await expect(
      guardForAction('organisation:read', ORG_A).canActivate(target.execution),
    ).resolves.toBe(true);
  });

  it.each(['resolve', 'listOverrides', 'storage', 'usage'] as const)(
    'denies operator %s when operator:read is not granted',
    async (handler) => {
      const target = routeContext(OperatorCommercialConfigurationController, handler, ORG_A);
      await expect(
        guardForAction('operator:read', null).canActivate(target.execution),
      ).rejects.toMatchObject({ response: { error: { code: 'FORBIDDEN' } } });
    },
  );

  it('denies setOverride when commercial_override:manage is not granted', async () => {
    const target = routeContext(OperatorCommercialConfigurationController, 'setOverride', ORG_A);
    await expect(
      guardForAction('commercial_override:manage', null).canActivate(target.execution),
    ).rejects.toMatchObject({ response: { error: { code: 'FORBIDDEN' } } });
  });

  it('permits setOverride once commercial_override:manage is granted', async () => {
    const target = routeContext(OperatorCommercialConfigurationController, 'setOverride', ORG_A);
    await expect(
      guardForAction('commercial_override:manage', ORG_A).canActivate(target.execution),
    ).resolves.toBe(true);
  });
});

describe('organisation resource boundaries', () => {
  it.each(['storage', 'usage'] as const)(
    'denies cross-organisation %s inspection',
    async (handler) => {
      const target = routeContext(OrganisationsController, handler, ORG_B);
      await expect(
        guardForAction('organisation:read', ORG_A).canActivate(target.execution),
      ).rejects.toMatchObject({ response: { error: { code: 'FORBIDDEN' } } });
    },
  );
  it('does not grant quota overrides through organisation:update', async () => {
    const target = routeContext(OrganisationsController, 'updateStorageQuota', ORG_A);
    await expect(
      guardForAction('organisation:update', ORG_A).canActivate(target.execution),
    ).rejects.toMatchObject({ response: { error: { code: 'FORBIDDEN' } } });
  });
});
