/**
 * ATTACK — billing authority must not imply organisation administration,
 * and organisation administration must not require billing authority to be
 * bundled in.
 *
 * Phase 5, Workstream 2.3: `billing_manager` is a deliberately narrow tier
 * (`role-grants.ts`/`policy.csv`) — a finance officer can be given exactly
 * invoice/payment authority without also gaining `organisation:update`,
 * `workspace:*`, `user:*`, or `role_assignment:*`. This test proves that
 * boundary holds against the *real* `RoleResolutionService` and real
 * `PolicyEngineService` (loading the actual `packages/policy/policy.csv`)
 * wired through `PolicyEnforcementService` — exactly as a live request
 * would be — mirroring `knowledge-governance.adversarial.test.ts`'s
 * established pattern; only the Prisma layer is faked.
 */

import { describe, expect, it } from 'vitest';

import type { Principal } from './authorization.port.js';
import { DevelopmentAuthorizationAdapter } from './development.adapter.js';
import { PolicyEnforcementService } from './policy-enforcement.service.js';
import { PolicyEngineService } from './policy-engine.service.js';
import { RoleResolutionService } from './role-resolution.service.js';
import type { PrismaService } from '../infrastructure/prisma.service.js';

const ORGANISATION_A = 'org-a';
const ORGANISATION_B = 'org-b';
const BILLING_MANAGER_USER = 'billing-manager-1';
const ADMIN_USER = 'admin-1';

/** A user holding exactly one organisation-scoped `billing_manager` `RoleAssignment` in Organisation A, in good standing. */
function billingManagerPrisma(): PrismaService {
  return {
    roleAssignment: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; organisationId?: string; workspaceId?: string };
      }) => {
        if (where.userId !== BILLING_MANAGER_USER) return [];
        if (where.organisationId === ORGANISATION_A) {
          return [{ role: 'billing_manager', organisationId: ORGANISATION_A, workspaceId: null }];
        }
        return [];
      },
    },
    organisationMembership: {
      findUnique: async ({
        where,
      }: {
        where: { organisationId_userId: { organisationId: string; userId: string } };
      }) => {
        if (
          where.organisationId_userId.userId === BILLING_MANAGER_USER &&
          where.organisationId_userId.organisationId === ORGANISATION_A
        ) {
          return { state: 'active' };
        }
        return null;
      },
      findMany: async () => [],
    },
    workspaceMembership: { findUnique: async () => null, findMany: async () => [] },
    workspace: { findUnique: async () => null },
  } as unknown as PrismaService;
}

/** A user holding an organisation-scoped `admin` `RoleAssignment` in Organisation A — the superset regression check. */
function adminPrisma(): PrismaService {
  return {
    roleAssignment: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; organisationId?: string; workspaceId?: string };
      }) => {
        if (where.userId !== ADMIN_USER) return [];
        if (where.organisationId === ORGANISATION_A) {
          return [{ role: 'admin', organisationId: ORGANISATION_A, workspaceId: null }];
        }
        return [];
      },
    },
    organisationMembership: {
      findUnique: async ({
        where,
      }: {
        where: { organisationId_userId: { organisationId: string; userId: string } };
      }) => {
        if (
          where.organisationId_userId.userId === ADMIN_USER &&
          where.organisationId_userId.organisationId === ORGANISATION_A
        ) {
          return { state: 'active' };
        }
        return null;
      },
      findMany: async () => [],
    },
    workspaceMembership: { findUnique: async () => null, findMany: async () => [] },
    workspace: { findUnique: async () => null },
  } as unknown as PrismaService;
}

/**
 * A user holding a *platform-scoped* `billing_manager` `RoleAssignment`
 * (`scopeType: 'platform'`, both ids null) — the only shape
 * `RoleResolutionService.platformGrantTiers` recognises. `payment:settle` is
 * one of `PolicyEnforcementService`'s `PLATFORM_ONLY_ACTIONS`: it resolves
 * tiers via `platformGrantTiers` unconditionally, ignoring whatever
 * `ResourceScope` the caller passed to `decide()`, so an organisation-scoped
 * `billing_manager`/`admin` assignment can never satisfy it — settlement
 * requires Witness's own verified operator, not a customer's own
 * organisation administrator, by deliberate design predating this role.
 */
function platformBillingManagerPrisma(): PrismaService {
  return {
    roleAssignment: {
      findMany: async ({
        where,
      }: {
        where: {
          userId: string;
          scopeType?: string;
          organisationId?: string | null;
          workspaceId?: string | null;
        };
      }) => {
        if (
          where.userId === BILLING_MANAGER_USER &&
          where.scopeType === 'platform' &&
          where.organisationId === null &&
          where.workspaceId === null
        ) {
          return [{ role: 'billing_manager' }];
        }
        return [];
      },
    },
    organisationMembership: { findUnique: async () => null, findMany: async () => [] },
    workspaceMembership: { findUnique: async () => null, findMany: async () => [] },
    workspace: { findUnique: async () => null },
  } as unknown as PrismaService;
}

async function realService(prisma: PrismaService): Promise<PolicyEnforcementService> {
  const roleResolution = new RoleResolutionService(prisma);
  const policyEngine = new PolicyEngineService();
  await policyEngine.onModuleInit();
  const legacyAuthorization = new DevelopmentAuthorizationAdapter('development');
  return new PolicyEnforcementService(legacyAuthorization, roleResolution, policyEngine);
}

const BILLING_MANAGER_PRINCIPAL: Principal = {
  subject: `user:${BILLING_MANAGER_USER}`,
  displayName: 'Finance Officer',
  kind: 'human',
  roles: [],
};

const ADMIN_PRINCIPAL: Principal = {
  subject: `user:${ADMIN_USER}`,
  displayName: 'Org Admin',
  kind: 'human',
  roles: [],
};

// `payment:settle` is deliberately excluded here — see
// `platformBillingManagerPrisma`'s comment. It is a platform-only action
// unreachable via any organisation-scoped assignment, `billing_manager`
// included, so it is covered by its own tests below instead of this loop.
const BILLING_ACTIONS_GRANTED = [
  'organisation:read',
  'invoice:read',
  'invoice:create',
  'invoice:render',
] as const;

const ADMIN_ONLY_ACTIONS = [
  'organisation:update',
  'organisation:create',
  'workspace:create',
  'workspace:update',
  'user:create',
  'organisation_membership:create',
  'workspace_membership:create',
  'role_assignment:write',
  'platform_role:write',
] as const;

describe('ATTACK — billing_manager cannot reach organisation/workspace/member/role administration', () => {
  it.each(ADMIN_ONLY_ACTIONS)(
    'denies billing_manager %s in its own organisation',
    async (action) => {
      const service = await realService(billingManagerPrisma());
      const decision = await service.decide(BILLING_MANAGER_PRINCIPAL, action as never, {
        type: 'organisation',
        organisationId: ORGANISATION_A,
      });
      expect(decision.allowed).toBe(false);
    },
  );

  it.each(BILLING_ACTIONS_GRANTED)(
    'grants billing_manager %s in its own organisation',
    async (action) => {
      const service = await realService(billingManagerPrisma());
      const decision = await service.decide(BILLING_MANAGER_PRINCIPAL, action as never, {
        type: 'organisation',
        organisationId: ORGANISATION_A,
      });
      expect(decision.allowed).toBe(true);
    },
  );

  it('denies billing_manager any billing action in a different organisation', async () => {
    const service = await realService(billingManagerPrisma());
    for (const action of BILLING_ACTIONS_GRANTED) {
      const decision = await service.decide(BILLING_MANAGER_PRINCIPAL, action as never, {
        type: 'organisation',
        organisationId: ORGANISATION_B,
      });
      expect(decision.allowed).toBe(false);
    }
  });
});

describe('payment:settle — platform-only by design, regardless of how the tier is granted', () => {
  it('denies billing_manager payment:settle from an organisation-scoped assignment, even in their own organisation', async () => {
    const service = await realService(billingManagerPrisma());
    const decision = await service.decide(BILLING_MANAGER_PRINCIPAL, 'payment:settle' as never, {
      type: 'organisation',
      organisationId: ORGANISATION_A,
    });
    expect(decision.allowed).toBe(false);
  });

  it('denies admin payment:settle from an organisation-scoped assignment', async () => {
    const service = await realService(adminPrisma());
    const decision = await service.decide(ADMIN_PRINCIPAL, 'payment:settle' as never, {
      type: 'organisation',
      organisationId: ORGANISATION_A,
    });
    expect(decision.allowed).toBe(false);
  });

  it('grants billing_manager payment:settle once granted a platform-scoped assignment', async () => {
    const service = await realService(platformBillingManagerPrisma());
    const decision = await service.decide(BILLING_MANAGER_PRINCIPAL, 'payment:settle' as never, {
      type: 'organisation',
      organisationId: ORGANISATION_A,
    });
    expect(decision.allowed).toBe(true);
  });
});

describe('regression — organisation admin retains full billing authority alongside everything else', () => {
  it.each([
    ...BILLING_ACTIONS_GRANTED,
    ...ADMIN_ONLY_ACTIONS.filter((a) => a !== 'platform_role:write'),
  ])('grants admin %s in its own organisation', async (action) => {
    const service = await realService(adminPrisma());
    const decision = await service.decide(ADMIN_PRINCIPAL, action as never, {
      type: 'organisation',
      organisationId: ORGANISATION_A,
    });
    expect(decision.allowed).toBe(true);
  });
});
