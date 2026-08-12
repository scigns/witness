/**
 * Parity gate between the two authorization tables (ADR-0007's dual-path
 * design, documented in `role-grants.ts`'s own header comment): the
 * dev-header fallback (`ROLE_GRANTS`) and the real Casbin policy
 * (`packages/policy/policy.csv`, read by `PolicyEngineService`) must never
 * disagree about what a tier may do — a drift here is a real
 * fail-open/fail-closed inconsistency between the unverified development
 * path and the verified session-backed one, not a cosmetic difference.
 *
 * Built generically over every action either table declares, rather than a
 * hand-picked list, so a newly added action (like `agenda_item:manage` or
 * `resource:manage`, added alongside this test) is covered automatically —
 * the previous tests in this directory only exercised a fixed set of
 * actions chosen when they were written, which is why this gap existed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ROLE_GRANTS } from './role-grants.js';
import type { Action } from './authorization.port.js';
import { PolicyEngineService } from './policy-engine.service.js';

const TIERS = ['reader', 'contributor', 'reviewer', 'admin'] as const;

const POLICY_CSV_PATH = fileURLToPath(
  new URL('../../../../packages/policy/policy.csv', import.meta.url),
);

function actionsFromPolicyCsv(): Set<Action> {
  const text = readFileSync(POLICY_CSV_PATH, 'utf8');
  const actions = new Set<Action>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(',').map((p) => p.trim());
    if (parts[0] !== 'p' || parts.length < 3) continue;
    actions.add(parts[2] as Action);
  }
  return actions;
}

function actionsFromRoleGrants(): Set<Action> {
  const actions = new Set<Action>();
  for (const tier of TIERS) {
    for (const action of ROLE_GRANTS[tier] ?? []) {
      actions.add(action);
    }
  }
  return actions;
}

describe('ROLE_GRANTS and policy.csv agree for every action either declares', () => {
  const allActions = new Set<Action>([...actionsFromRoleGrants(), ...actionsFromPolicyCsv()]);

  it('the combined action set is non-trivial (sanity check the parsers found something)', () => {
    expect(allActions.size).toBeGreaterThan(50);
  });

  it('every declared action is granted identically by both tables, for every tier', async () => {
    const engine = new PolicyEngineService();
    await engine.onModuleInit();

    const mismatches: string[] = [];

    for (const action of allActions) {
      for (const tier of TIERS) {
        const viaRoleGrants = (ROLE_GRANTS[tier] ?? []).includes(action);
        const viaPolicyCsv = await engine.grants(tier, action);
        if (viaRoleGrants !== viaPolicyCsv) {
          mismatches.push(
            `${tier} / ${action}: role-grants.ts=${viaRoleGrants}, policy.csv=${viaPolicyCsv}`,
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
