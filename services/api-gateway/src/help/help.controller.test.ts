/**
 * Help & Knowledge search controller (ADR-0032). Proves the two
 * server-side gates `HelpSearchService` itself cannot enforce, because it
 * never sees the raw request: (1) a malformed/missing query is rejected
 * before anything is resolved, and (2) an `organisationId` the caller
 * cannot be shown to belong to — including a cross-organisation attempt —
 * is refused rather than silently resolved to no entitlements. The
 * "unauthenticated access is refused" invariant is checked here too, as
 * the required-action metadata the shared `AuthorizationGuard` reads: the
 * guard is deny-by-default (see its own header comment), so a route with
 * the right `@Requires(...)` metadata cannot be reached without passing
 * through it, and a route missing that metadata is denied unconditionally.
 */

import 'reflect-metadata';

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ResolvedEntitlements } from '@witness/domain';

import { REQUIRED_ACTION, type RequestWithPrincipal } from '../authz/authorization.guard.js';
import type { RoleResolutionService } from '../authz/role-resolution.service.js';
import type { CommercialEntitlementService } from '../commercial/commercial-entitlement.service.js';
import { HelpController } from './help.controller.js';
import type { HelpSearchService } from './help-search.service.js';

const USER = 'user:user-1';
const ORG_MEMBER = 'org-the-caller-belongs-to';
const ORG_OTHER = 'org-the-caller-does-not-belong-to';

function request(): RequestWithPrincipal {
  return {
    principal: { subject: USER, displayName: 'Test User', kind: 'human', roles: [] },
  } as unknown as RequestWithPrincipal;
}

function harness(options: { memberOf?: string; entitlements?: ResolvedEntitlements } = {}) {
  const scopedGrantTiers = vi.fn(async (_userId: string, scope: { organisationId?: string }) =>
    scope.organisationId === options.memberOf ? ['reader'] : [],
  );
  const forOrganisation = vi.fn(async () => options.entitlements ?? new Map());
  const search = vi.fn(async () => []);

  const controller = new HelpController(
    { search } as unknown as HelpSearchService,
    { scopedGrantTiers } as unknown as RoleResolutionService,
    { forOrganisation } as unknown as CommercialEntitlementService,
  );

  return { controller, scopedGrantTiers, forOrganisation, search };
}

describe('HelpController', () => {
  it('is reachable only through the deny-by-default AuthorizationGuard, gated on help_article:read', () => {
    const action = Reflect.getMetadata(REQUIRED_ACTION, HelpController.prototype.search);
    expect(action).toBe('help_article:read');
  });

  it('rejects a missing query parameter', async () => {
    const { controller, search } = harness();
    await expect(controller.search(undefined, undefined, request())).rejects.toThrow(
      BadRequestException,
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('rejects a blank/whitespace-only query', async () => {
    const { controller, search } = harness();
    await expect(controller.search('   ', undefined, request())).rejects.toThrow(
      BadRequestException,
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('rejects a non-string query (e.g. repeated query param parsed as an array)', async () => {
    const { controller, search } = harness();
    await expect(controller.search(['a', 'b'] as unknown, undefined, request())).rejects.toThrow(
      BadRequestException,
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('proceeds with no entitlement context when organisationId is omitted', async () => {
    const { controller, search, forOrganisation } = harness();
    await controller.search('how do I', undefined, request());
    expect(forOrganisation).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledWith('how do I', expect.anything(), expect.anything(), null);
  });

  it('THREAT: a cross-organisation access attempt (an organisationId the caller does not belong to) is refused, never silently resolved', async () => {
    const { controller, search, forOrganisation } = harness({ memberOf: ORG_MEMBER });
    await expect(controller.search('how do I', ORG_OTHER, request())).rejects.toThrow(
      ForbiddenException,
    );
    expect(forOrganisation).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it('resolves entitlements for an organisation the caller does belong to', async () => {
    const grants: ResolvedEntitlements = new Map([
      [
        'help.premium',
        { key: 'help.premium', value: { type: 'BOOLEAN', value: true }, source: 'PLAN' },
      ],
    ]);
    const { controller, search, forOrganisation } = harness({
      memberOf: ORG_MEMBER,
      entitlements: grants,
    });
    await controller.search('how do I', ORG_MEMBER, request());
    expect(forOrganisation).toHaveBeenCalledWith(ORG_MEMBER);
    expect(search).toHaveBeenCalledWith('how do I', expect.anything(), expect.anything(), grants);
  });

  it('treats a non-string organisationId (malformed query param) as absent rather than throwing', async () => {
    const { controller, search, forOrganisation } = harness({ memberOf: ORG_MEMBER });
    await controller.search('how do I', ['not', 'a', 'string'] as unknown, request());
    expect(forOrganisation).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledWith('how do I', expect.anything(), expect.anything(), null);
  });
});
