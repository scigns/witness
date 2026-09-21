/**
 * Direct tier-vs-action assertions against the real `packages/policy/policy.csv`,
 * distinct from `role-grants-parity.test.ts` (which only proves `ROLE_GRANTS`
 * and `policy.csv` agree with *each other* — a bug present in both tables
 * identically would pass that check). These assert the specific governance
 * boundaries the Phase 3 knowledge-curation feature depends on:
 *
 * - a read-only/participant tier cannot steward the vocabulary or graph,
 * - a reviewer (evidence-quality judgement) cannot reach organisation-admin
 *   governance configuration without being separately granted that tier,
 * - the steward and admin tiers that *should* hold these actions actually do
 *   (a denial-only test suite can't distinguish "correctly scoped" from
 *   "everything denies, engine is broken").
 */

import { describe, expect, it } from 'vitest';

import { PolicyEngineService } from './policy-engine.service.js';

async function engine(): Promise<PolicyEngineService> {
  const svc = new PolicyEngineService();
  await svc.onModuleInit();
  return svc;
}

describe('knowledge governance tier boundaries (packages/policy/policy.csv)', () => {
  it('reader (read-only/participant-facing tier) cannot steward vocabulary, merge concepts, publish, or configure governance', async () => {
    const svc = await engine();
    for (const action of [
      'knowledge_entity:steward',
      'knowledge_entity:publish',
      'knowledge_candidate:review',
      'knowledge_domain:manage',
      'knowledge_governance:configure',
    ]) {
      expect(await svc.grants('reader', action)).toBe(false);
    }
  });

  it('contributor (propose-only tier) cannot review, steward, or configure governance', async () => {
    const svc = await engine();
    for (const action of [
      'knowledge_candidate:review',
      'knowledge_entity:steward',
      'knowledge_entity:publish',
      'knowledge_domain:manage',
      'knowledge_governance:configure',
    ]) {
      expect(await svc.grants('contributor', action)).toBe(false);
    }
  });

  it('reviewer can review candidates but cannot steward vocabulary, publish, or configure organisation-admin governance unless separately granted the admin/steward tier', async () => {
    const svc = await engine();
    expect(await svc.grants('reviewer', 'knowledge_candidate:review')).toBe(true);
    for (const action of [
      'knowledge_entity:steward',
      'knowledge_entity:publish',
      'knowledge_domain:manage',
      'knowledge_governance:configure',
    ]) {
      expect(await svc.grants('reviewer', action)).toBe(false);
    }
  });

  it('steward can steward vocabulary, review, and publish, but cannot configure organisation-level governance or manage domains — that remains admin-only', async () => {
    const svc = await engine();
    for (const action of [
      'knowledge_entity:steward',
      'knowledge_entity:publish',
      'knowledge_candidate:review',
      'knowledge_candidate:validate_community',
    ]) {
      expect(await svc.grants('steward', action)).toBe(true);
    }
    for (const action of ['knowledge_domain:manage', 'knowledge_governance:configure']) {
      expect(await svc.grants('steward', action)).toBe(false);
    }
  });

  it('admin (an organisation/workspace-scoped tier, never a platform-scope one) holds the full knowledge-governance surface', async () => {
    const svc = await engine();
    for (const action of [
      'knowledge_domain:manage',
      'knowledge_governance:configure',
      'knowledge_entity:steward',
      'knowledge_entity:publish',
      'knowledge_candidate:review',
    ]) {
      expect(await svc.grants('admin', action)).toBe(true);
    }
  });
});
