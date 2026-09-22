/**
 * The `neighbourhood` route's second, in-process gate (`KNOWLEDGE_GRAPH.md`
 * §13, Gap A; ADR-0027): `@Requires('knowledge_entity:read')` controls
 * whether the route is reachable at all, but `canInspectGovernance` — a
 * *second* decision, against `knowledge_provenance:inspect` — controls
 * whether `community_restricted` governance detail on the returned edges is
 * redacted. Nothing exercised this wiring before this file existed. Uses
 * the real `PolicyEnforcementService`/`PolicyEngineService`/
 * `RoleResolutionService` stack (loading the actual `packages/policy/policy.csv`,
 * following `knowledge-governance.adversarial.test.ts`'s established
 * pattern) so the test proves the real policy grants, not a hand-rolled
 * double's assumption about them; only Prisma and the graph repository are
 * faked.
 */

import { describe, expect, it } from 'vitest';

import { DevelopmentAuthorizationAdapter } from '../authz/development.adapter.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import { PolicyEngineService } from '../authz/policy-engine.service.js';
import { RoleResolutionService } from '../authz/role-resolution.service.js';
import type { Principal } from '../authz/authorization.port.js';
import type { RequestWithPrincipal } from '../authz/authorization.guard.js';
import type { PrismaService } from '../infrastructure/prisma.service.js';
import { KnowledgeGraphQueryController } from './knowledge-graph-query.controller.js';
import type { KnowledgeGraphQueryService } from './knowledge-graph-query.service.js';

const ORGANISATION = 'org-1';
const WORKSPACE = 'workspace-1';
const USER = 'user-1';

function fakePrismaWithWorkspaceRole(role: string): PrismaService {
  return {
    roleAssignment: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; organisationId?: string; workspaceId?: string };
      }) => {
        if (where.workspaceId === WORKSPACE) {
          return [{ role, organisationId: null, workspaceId: WORKSPACE }];
        }
        return [];
      },
    },
    organisationMembership: {
      findUnique: async () => ({ state: 'active' }),
      findMany: async () => [{ organisationId: ORGANISATION, state: 'active' }],
    },
    workspaceMembership: {
      findUnique: async () => ({ state: 'active' }),
      findMany: async () => [{ workspaceId: WORKSPACE, state: 'active' }],
    },
    workspace: {
      findUnique: async () => ({ organisationId: ORGANISATION }),
    },
  } as unknown as PrismaService;
}

async function realAuthorization(role: string): Promise<PolicyEnforcementService> {
  const roleResolution = new RoleResolutionService(fakePrismaWithWorkspaceRole(role));
  const policyEngine = new PolicyEngineService();
  await policyEngine.onModuleInit();
  const legacyAuthorization = new DevelopmentAuthorizationAdapter('development');
  return new PolicyEnforcementService(legacyAuthorization, roleResolution, policyEngine);
}

const PRINCIPAL: Principal = {
  subject: `user:${USER}`,
  displayName: 'Test User',
  kind: 'human',
  roles: [],
};

function fakeGraphService() {
  const calls: unknown[][] = [];
  const service: Partial<KnowledgeGraphQueryService> = {
    neighbourhood: async (...args: unknown[]) => {
      calls.push(args);
      return { nodes: [], edges: [] };
    },
  };
  return { service: service as KnowledgeGraphQueryService, calls };
}

function requestFor(principal: Principal): RequestWithPrincipal {
  return { headers: {}, params: {}, principal };
}

describe('KnowledgeGraphQueryController.neighbourhood — the governance-inspection second gate', () => {
  it('passes canInspectGovernance = false for a reader, who holds knowledge_entity:read but not knowledge_provenance:inspect', async () => {
    const authorization = await realAuthorization('reader');
    const { service, calls } = fakeGraphService();
    const controller = new KnowledgeGraphQueryController(service, authorization);

    await controller.neighbourhood(
      ORGANISATION,
      WORKSPACE,
      'entity-1',
      undefined,
      undefined,
      requestFor(PRINCIPAL),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[3]).toBe(false);
  });

  it('passes canInspectGovernance = true for a reviewer, who holds both knowledge_entity:read and knowledge_provenance:inspect', async () => {
    const authorization = await realAuthorization('reviewer');
    const { service, calls } = fakeGraphService();
    const controller = new KnowledgeGraphQueryController(service, authorization);

    await controller.neighbourhood(
      ORGANISATION,
      WORKSPACE,
      'entity-1',
      undefined,
      undefined,
      requestFor(PRINCIPAL),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[3]).toBe(true);
  });

  it('passes canInspectGovernance = true for a steward', async () => {
    const authorization = await realAuthorization('steward');
    const { service, calls } = fakeGraphService();
    const controller = new KnowledgeGraphQueryController(service, authorization);

    await controller.neighbourhood(
      ORGANISATION,
      WORKSPACE,
      'entity-1',
      undefined,
      undefined,
      requestFor(PRINCIPAL),
    );

    expect(calls[0]?.[3]).toBe(true);
  });

  it('forwards depth and relationshipTypes as parsed values, in addition to canInspectGovernance', async () => {
    const authorization = await realAuthorization('reviewer');
    const { service, calls } = fakeGraphService();
    const controller = new KnowledgeGraphQueryController(service, authorization);

    await controller.neighbourhood(
      ORGANISATION,
      WORKSPACE,
      'entity-1',
      '3',
      'SUPPORTED_BY,CONTRADICTED_BY',
      requestFor(PRINCIPAL),
    );

    expect(calls[0]).toEqual([
      ORGANISATION,
      WORKSPACE,
      'entity-1',
      true,
      3,
      ['SUPPORTED_BY', 'CONTRADICTED_BY'],
    ]);
  });
});
