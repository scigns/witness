/**
 * ATTACK — platform authority must not become knowledge authority.
 *
 * The originating feature request's second invariant: "a Witness platform
 * administrator may operate the platform but must not automatically gain
 * semantic authority to approve, redefine, merge, publish, or validate a
 * community or organisation's knowledge." This test proves the invariant
 * holds *structurally*, using the real `RoleResolutionService` and real
 * `PolicyEngineService` (loading the actual `packages/policy/policy.csv`)
 * wired through `PolicyEnforcementService`, exactly as a live request would
 * be — only the Prisma layer is faked, following
 * `role-resolution.service.test.ts`'s existing double.
 *
 * The mechanism under test is not new: every `knowledge_*` action is a
 * workspace/organisation-scoped action like any other, so
 * `PolicyEnforcementService.decide` calls `scopedGrantTiers`, which only
 * ever looks at `RoleAssignment` rows scoped to that exact organisation or
 * workspace (see `role-resolution.service.ts`'s file header). A
 * platform-scope `RoleAssignment` — `organisationId`/`workspaceId` both
 * null — never satisfies that lookup. This test exists so that guarantee is
 * verified for the knowledge actions specifically, not assumed by analogy.
 */

import { describe, expect, it } from 'vitest';

import type { Principal } from './authorization.port.js';
import { DevelopmentAuthorizationAdapter } from './development.adapter.js';
import { PolicyEnforcementService } from './policy-enforcement.service.js';
import { PolicyEngineService } from './policy-engine.service.js';
import { RoleResolutionService } from './role-resolution.service.js';
import type { PrismaService } from '../infrastructure/prisma.service.js';

const PLATFORM_ADMIN_USER = 'platform-admin-1';
const WORKSPACE = 'workspace-1';
const ORGANISATION = 'org-1';

const KNOWLEDGE_ACTIONS = [
  'knowledge_entity:steward',
  'knowledge_entity:publish',
  'knowledge_candidate:review',
  'knowledge_candidate:validate_community',
  'knowledge_governance:configure',
  'knowledge_domain:manage',
] as const;

/**
 * A user holding ONLY a platform-scope `admin` `RoleAssignment` — the exact
 * shape `prisma/bootstrap.ts` creates for the first platform administrator
 * (`role-resolution.service.ts`'s file header) — and no organisation or
 * workspace membership/assignment of any kind.
 */
function platformOnlyPrisma(): PrismaService {
  return {
    roleAssignment: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; organisationId?: string; workspaceId?: string };
      }) => {
        if (where.organisationId !== undefined || where.workspaceId !== undefined) {
          // No organisation- or workspace-scoped assignment exists for this user.
          return [];
        }
        // Global lookup (scopeType: 'platform', both ids null).
        return [{ role: 'admin', organisationId: null, workspaceId: null }];
      },
    },
    organisationMembership: {
      findUnique: async () => null,
      findMany: async () => [],
    },
    workspaceMembership: {
      findUnique: async () => null,
      findMany: async () => [],
    },
    workspace: {
      findUnique: async () => ({ organisationId: ORGANISATION }),
    },
  } as unknown as PrismaService;
}

async function realService(): Promise<PolicyEnforcementService> {
  const prisma = platformOnlyPrisma();
  const roleResolution = new RoleResolutionService(prisma);
  const policyEngine = new PolicyEngineService();
  await policyEngine.onModuleInit();
  // Only reached for the unverified dev-header path, which this test does
  // not exercise (the principal's subject starts with `user:`).
  const legacyAuthorization = new DevelopmentAuthorizationAdapter('development');
  return new PolicyEnforcementService(legacyAuthorization, roleResolution, policyEngine);
}

const PLATFORM_ADMIN_PRINCIPAL: Principal = {
  subject: `user:${PLATFORM_ADMIN_USER}`,
  displayName: 'Platform Administrator',
  kind: 'human',
  roles: [],
};

describe('ATTACK — a platform-scope admin cannot reach knowledge governance actions', () => {
  it.each(KNOWLEDGE_ACTIONS)(
    "denies '%s' in a workspace the platform admin has no assignment in",
    async (action) => {
      const svc = await realService();
      const decision = await svc.decide(PLATFORM_ADMIN_PRINCIPAL, action, {
        type: 'workspace',
        workspaceId: WORKSPACE,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('no role');
    },
  );

  it.each(KNOWLEDGE_ACTIONS)(
    "denies '%s' in an organisation the platform admin has no assignment in",
    async (action) => {
      const svc = await realService();
      const decision = await svc.decide(PLATFORM_ADMIN_PRINCIPAL, action, {
        type: 'organisation',
        organisationId: ORGANISATION,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('no role');
    },
  );

  it('the same platform admin IS granted an org-scoped admin action once given a real organisation-scoped assignment — proving the denial above is about scope, not a broken test double', async () => {
    const prisma = {
      roleAssignment: {
        findMany: async ({
          where,
        }: {
          where: { userId: string; organisationId?: string; workspaceId?: string };
        }) => {
          if (where.organisationId === ORGANISATION) {
            return [{ role: 'admin', organisationId: ORGANISATION, workspaceId: null }];
          }
          return [];
        },
      },
      organisationMembership: {
        findUnique: async () => ({ state: 'active' }),
        findMany: async () => [{ organisationId: ORGANISATION, state: 'active' }],
      },
      workspaceMembership: { findUnique: async () => null, findMany: async () => [] },
      workspace: { findUnique: async () => ({ organisationId: ORGANISATION }) },
    } as unknown as PrismaService;

    const roleResolution = new RoleResolutionService(prisma);
    const policyEngine = new PolicyEngineService();
    await policyEngine.onModuleInit();
    const legacyAuthorization = new DevelopmentAuthorizationAdapter('development');
    const svc = new PolicyEnforcementService(legacyAuthorization, roleResolution, policyEngine);

    const decision = await svc.decide(PLATFORM_ADMIN_PRINCIPAL, 'knowledge_governance:configure', {
      type: 'organisation',
      organisationId: ORGANISATION,
    });
    expect(decision.allowed).toBe(true);
  });
});
