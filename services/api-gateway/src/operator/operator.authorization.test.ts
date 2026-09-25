/**
 * ATTACK — `operator:read` (the cross-organisation failure-visibility view)
 * must never be reachable via an organisation-scoped role assignment, only a
 * platform-scoped one — the same trust boundary `payment:settle` already
 * draws (`billing-authority.adversarial.test.ts`), for the same reason: this
 * view aggregates across every organisation, so an organisation's own admin
 * must not be able to see another organisation's failures by holding a
 * merely organisation-scoped `admin` assignment.
 */

import { describe, expect, it } from 'vitest';

import type { Principal } from '../authz/authorization.port.js';
import { DevelopmentAuthorizationAdapter } from '../authz/development.adapter.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import { PolicyEngineService } from '../authz/policy-engine.service.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';
import type { PrismaService } from '../infrastructure/prisma.service.js';

const ORGANISATION_A = 'org-a';
const ADMIN_USER = 'admin-1';

function organisationScopedAdminPrisma(): PrismaService {
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
        if (where.userId !== ADMIN_USER) return [];
        if (where.scopeType === 'platform') return [];
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

function platformAdminPrisma(): PrismaService {
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
          where.userId === ADMIN_USER &&
          where.scopeType === 'platform' &&
          where.organisationId === null &&
          where.workspaceId === null
        ) {
          return [{ role: 'admin' }];
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

const ADMIN_PRINCIPAL: Principal = {
  subject: `user:${ADMIN_USER}`,
  displayName: 'Org Admin',
  kind: 'human',
  roles: [],
};

describe('operator:read is platform-only', () => {
  it('denies an organisation-scoped admin, even within their own organisation', async () => {
    const service = await realService(organisationScopedAdminPrisma());
    const decision = await service.decide(ADMIN_PRINCIPAL, 'operator:read', {
      type: 'organisation',
      organisationId: ORGANISATION_A,
    });
    expect(decision.allowed).toBe(false);
  });

  it('grants an admin holding a platform-scoped assignment', async () => {
    const service = await realService(platformAdminPrisma());
    const decision = await service.decide(ADMIN_PRINCIPAL, 'operator:read', { type: 'global' });
    expect(decision.allowed).toBe(true);
  });
});
