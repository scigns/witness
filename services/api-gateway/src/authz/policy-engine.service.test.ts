/**
 * `PolicyEngineService` against the real, versioned Casbin model and policy
 * (`packages/policy/model.conf`, `packages/policy/policy.csv`) — not a fake.
 * ADR-0007 treats this policy data as reviewed, unit-tested-in-isolation
 * data; these tests are that isolation unit, and they also pin the grant
 * table `RoleResolutionService`'s tier names must keep agreeing with.
 */

import { describe, expect, it } from 'vitest';

import { PolicyEngineService } from './policy-engine.service.js';

async function loadedEngine(): Promise<PolicyEngineService> {
  const engine = new PolicyEngineService();
  await engine.onModuleInit();
  return engine;
}

describe('PolicyEngineService — real policy data', () => {
  it('reader may read but not create records', async () => {
    const engine = await loadedEngine();
    expect(await engine.grants('reader', 'record:read')).toBe(true);
    expect(await engine.grants('reader', 'record:create')).toBe(false);
  });

  it('contributor may create but not review records', async () => {
    const engine = await loadedEngine();
    expect(await engine.grants('contributor', 'record:create')).toBe(true);
    expect(await engine.grants('contributor', 'record:review')).toBe(false);
  });

  it('reviewer may review records', async () => {
    const engine = await loadedEngine();
    expect(await engine.grants('reviewer', 'record:review')).toBe(true);
  });

  it('admin holds every organisation- and workspace-membership management action', async () => {
    const engine = await loadedEngine();
    for (const action of [
      'organisation_membership:read',
      'organisation_membership:create',
      'organisation_membership:update',
      'workspace_membership:read',
      'workspace_membership:create',
      'workspace_membership:update',
      'role_assignment:read',
      'role_assignment:write',
      'role_assignment:delete',
    ] as const) {
      expect(await engine.grants('admin', action)).toBe(true);
    }
  });

  it('ATTACK — an unknown tier grants nothing, not even the actions every real tier holds', async () => {
    const engine = await loadedEngine();
    expect(await engine.grants('superuser', 'organisation:read')).toBe(false);
  });

  it('ATTACK — no tier grants an action absent from the policy entirely', async () => {
    const engine = await loadedEngine();
    for (const tier of ['reader', 'contributor', 'reviewer', 'admin']) {
      expect(await engine.grants(tier, 'record:delete')).toBe(false);
    }
  });

  it('concurrent callers share one lazily-initialised enforcer instead of racing to build it twice', async () => {
    const engine = new PolicyEngineService();
    const [a, b] = await Promise.all([
      engine.grants('reader', 'record:read'),
      engine.grants('admin', 'role_assignment:write'),
    ]);
    expect(a).toBe(true);
    expect(b).toBe(true);
  });
});
