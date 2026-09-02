/**
 * `PolicyEnforcementService.decide` is what `AuthorizationGuard` calls on
 * every request (Milestone 1.4, Authorisation hardening). These tests cover
 * the composition itself — role resolution feeding the policy engine, the
 * dev-header fallback, and every fail-closed path — using fakes for its two
 * collaborators; `role-resolution.service.test.ts` and
 * `policy-engine.service.test.ts` cover each collaborator's own real
 * behaviour in isolation.
 */

import { describe, expect, it, vi } from 'vitest';

import type { AuthorizationPort, Principal } from './authorization.port.js';
import { PolicyEnforcementService } from './policy-enforcement.service.js';
import type { PolicyEngineService } from './policy-engine.service.js';
import type { RoleResolutionService } from './role-resolution.service.js';

const SESSION_PRINCIPAL: Principal = {
  subject: 'user:user-1',
  displayName: 'Real Session User',
  kind: 'human',
  roles: [],
};

const DEV_PRINCIPAL: Principal = {
  subject: 'dev:Local Dev',
  displayName: 'Local Dev',
  kind: 'human',
  roles: ['admin'],
};

function service(options: {
  globalGrantTiers?: () => Promise<string[]>;
  platformGrantTiers?: () => Promise<string[]>;
  scopedGrantTiers?: () => Promise<string[]>;
  grants?: (tier: string, action: string) => Promise<boolean>;
  legacyDecide?: AuthorizationPort['decide'];
}) {
  const roleResolution = {
    globalGrantTiers: options.globalGrantTiers ?? vi.fn().mockResolvedValue([]),
    platformGrantTiers: options.platformGrantTiers ?? vi.fn().mockResolvedValue([]),
    scopedGrantTiers: options.scopedGrantTiers ?? vi.fn().mockResolvedValue([]),
  } as unknown as RoleResolutionService;

  const policyEngine = {
    grants: options.grants ?? vi.fn().mockResolvedValue(false),
  } as unknown as PolicyEngineService;

  const legacyAuthorization = {
    decide: options.legacyDecide ?? vi.fn().mockResolvedValue({ allowed: true, reason: 'legacy' }),
  } as unknown as AuthorizationPort;

  return new PolicyEnforcementService(legacyAuthorization, roleResolution, policyEngine);
}

describe('PolicyEnforcementService.decide', () => {
  it('grants when a resolved tier is permitted by the policy engine', async () => {
    const svc = service({
      scopedGrantTiers: vi.fn().mockResolvedValue(['admin']),
      grants: vi.fn().mockResolvedValue(true),
    });

    const decision = await svc.decide(SESSION_PRINCIPAL, 'workspace_membership:create', {
      type: 'organisation',
      organisationId: 'org-1',
    });

    expect(decision).toEqual({
      allowed: true,
      reason: "role 'admin' grants 'workspace_membership:create' in organisation 'org-1'",
    });
  });

  it('denies by default when the principal holds no role in scope', async () => {
    const svc = service({ scopedGrantTiers: vi.fn().mockResolvedValue([]) });

    const decision = await svc.decide(SESSION_PRINCIPAL, 'organisation_membership:read', {
      type: 'organisation',
      organisationId: 'org-1',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('no role');
  });

  it("denies when the resolved tiers don't grant the action, without falling through to an allow", async () => {
    const svc = service({
      scopedGrantTiers: vi.fn().mockResolvedValue(['reader']),
      grants: vi.fn().mockResolvedValue(false),
    });

    const decision = await svc.decide(SESSION_PRINCIPAL, 'role_assignment:write', {
      type: 'workspace',
      workspaceId: 'workspace-1',
    });

    expect(decision.allowed).toBe(false);
  });

  it('uses globalGrantTiers for the global scope and scopedGrantTiers is never called', async () => {
    const globalGrantTiers = vi.fn().mockResolvedValue(['reader']);
    const scopedGrantTiers = vi.fn().mockResolvedValue(['admin']);
    const svc = service({
      globalGrantTiers,
      scopedGrantTiers,
      grants: vi.fn().mockResolvedValue(true),
    });

    await svc.decide(SESSION_PRINCIPAL, 'record:read', { type: 'global' });

    expect(globalGrantTiers).toHaveBeenCalledWith('user-1');
    expect(scopedGrantTiers).not.toHaveBeenCalled();
  });

  it('requires a platform-scoped operator role for settlement, not an organisation admin role', async () => {
    const platformGrantTiers = vi.fn().mockResolvedValue([]);
    const scopedGrantTiers = vi.fn().mockResolvedValue(['admin']);
    const svc = service({
      platformGrantTiers,
      scopedGrantTiers,
      grants: vi.fn().mockResolvedValue(true),
    });

    const decision = await svc.decide(SESSION_PRINCIPAL, 'payment:settle', {
      type: 'organisation',
      organisationId: 'org-1',
    });

    expect(decision.allowed).toBe(false);
    expect(platformGrantTiers).toHaveBeenCalledWith('user-1');
    expect(scopedGrantTiers).not.toHaveBeenCalled();
  });

  it('permits settlement for a platform-scoped admin through the policy engine', async () => {
    const svc = service({
      platformGrantTiers: vi.fn().mockResolvedValue(['admin']),
      grants: vi
        .fn()
        .mockImplementation((tier, action) =>
          Promise.resolve(tier === 'admin' && action === 'payment:settle'),
        ),
    });

    await expect(
      svc.decide(SESSION_PRINCIPAL, 'payment:settle', {
        type: 'organisation',
        organisationId: 'org-1',
      }),
    ).resolves.toMatchObject({ allowed: true });
  });

  it('uses only platform-scoped authority for platform role management', async () => {
    const platformGrantTiers = vi.fn().mockResolvedValue([]);
    const globalGrantTiers = vi.fn().mockResolvedValue(['admin']);
    const svc = service({
      platformGrantTiers,
      globalGrantTiers,
      grants: vi.fn().mockResolvedValue(true),
    });

    const decision = await svc.decide(SESSION_PRINCIPAL, 'platform_role:write', { type: 'global' });

    expect(decision.allowed).toBe(false);
    expect(platformGrantTiers).toHaveBeenCalledWith('user-1');
    expect(globalGrantTiers).not.toHaveBeenCalled();
  });

  it('makes payment settlement follow platform role grant and revocation', async () => {
    let tiers = ['admin'];
    const svc = service({
      platformGrantTiers: vi.fn().mockImplementation(() => Promise.resolve(tiers)),
      grants: vi.fn().mockResolvedValue(true),
    });
    await expect(
      svc.decide(SESSION_PRINCIPAL, 'payment:settle', { type: 'global' }),
    ).resolves.toMatchObject({ allowed: true });
    tiers = [];
    await expect(
      svc.decide(SESSION_PRINCIPAL, 'payment:settle', { type: 'global' }),
    ).resolves.toMatchObject({ allowed: false });
  });

  it('ATTACK — role resolution throwing is a denial, never an allow', async () => {
    const svc = service({
      scopedGrantTiers: vi.fn().mockRejectedValue(new Error('database unavailable')),
    });

    const decision = await svc.decide(SESSION_PRINCIPAL, 'organisation_membership:read', {
      type: 'organisation',
      organisationId: 'org-1',
    });

    expect(decision.allowed).toBe(false);
  });

  it('ATTACK — the policy engine throwing is a denial, never an allow', async () => {
    const svc = service({
      scopedGrantTiers: vi.fn().mockResolvedValue(['admin']),
      grants: vi.fn().mockRejectedValue(new Error('policy file missing')),
    });

    const decision = await svc.decide(SESSION_PRINCIPAL, 'organisation_membership:read', {
      type: 'organisation',
      organisationId: 'org-1',
    });

    expect(decision.allowed).toBe(false);
  });

  it('falls back unscoped to the legacy AuthorizationPort for a dev-header principal, never consulting role resolution or the policy engine', async () => {
    const scopedGrantTiers = vi.fn();
    const grants = vi.fn();
    const legacyDecide = vi.fn().mockResolvedValue({ allowed: true, reason: 'dev header allows' });
    const svc = service({ scopedGrantTiers, grants, legacyDecide });

    const decision = await svc.decide(DEV_PRINCIPAL, 'organisation_membership:create', {
      type: 'organisation',
      organisationId: 'org-1',
    });

    expect(legacyDecide).toHaveBeenCalledWith(DEV_PRINCIPAL, 'organisation_membership:create');
    expect(scopedGrantTiers).not.toHaveBeenCalled();
    expect(grants).not.toHaveBeenCalled();
    expect(decision).toEqual({ allowed: true, reason: 'dev header allows' });
  });
});
