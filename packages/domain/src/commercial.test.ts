import { describe, expect, it } from 'vitest';

import { toOrganisationId } from './ids.js';
import {
  booleanEntitlement,
  evaluateEntitlements,
  remainingAllowance,
  type EntitlementDefinition,
  type PlanEntitlement,
  type Subscription,
} from './commercial.js';

const organisationId = toOrganisationId('11111111-1111-4111-8111-111111111111');
const subscription: Subscription = {
  id: '22222222-2222-4222-8222-222222222222',
  organisationId,
  billingAccountId: '33333333-3333-4333-8333-333333333333',
  planId: '44444444-4444-4444-8444-444444444444',
  status: 'FREE',
  billingInterval: null,
  currentPeriodStart: new Date('2026-08-25T00:00:00Z'),
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  createdAt: new Date('2026-08-25T00:00:00Z'),
};

const users: EntitlementDefinition = {
  id: '55555555-5555-4555-8555-555555555555',
  key: 'users.max',
  valueType: 'INTEGER',
  unit: 'users',
  description: 'Maximum active users',
};
const api: EntitlementDefinition = {
  id: '66666666-6666-4666-8666-666666666666',
  key: 'api.enabled',
  valueType: 'BOOLEAN',
  unit: null,
  description: 'API access',
};
const grants: PlanEntitlement[] = [
  { planId: subscription.planId, definition: users, value: { type: 'INTEGER', value: 3 } },
  { planId: subscription.planId, definition: api, value: { type: 'BOOLEAN', value: false } },
];

describe('commercial entitlement evaluation', () => {
  it('derives access from entitlement grants without inspecting a plan code', () => {
    const resolved = evaluateEntitlements({
      subscription,
      planEntitlements: grants,
      overrides: [],
    });
    expect(booleanEntitlement(resolved, 'api.enabled')).toBe(false);
    expect(remainingAllowance({ entitlements: resolved, key: 'users.max', consumed: 1 })).toBe(2);
  });

  it('applies a subscription override after the plan grant', () => {
    const resolved = evaluateEntitlements({
      subscription,
      planEntitlements: grants,
      overrides: [
        {
          subscriptionId: subscription.id,
          definition: users,
          value: { type: 'INTEGER', value: 8 },
          reason: 'Contracted pilot cohort',
        },
      ],
    });
    expect(resolved.get('users.max')?.source).toBe('SUBSCRIPTION_OVERRIDE');
    expect(remainingAllowance({ entitlements: resolved, key: 'users.max', consumed: 3 })).toBe(5);
  });

  it('fails closed for a suspended or cancelled subscription', () => {
    for (const status of ['SUSPENDED', 'CANCELLED'] as const) {
      const resolved = evaluateEntitlements({
        subscription: { ...subscription, status },
        planEntitlements: grants,
        overrides: [],
      });
      expect(resolved.size).toBe(0);
    }
  });

  it('rejects a value that does not match its entitlement definition', () => {
    expect(() =>
      evaluateEntitlements({
        subscription,
        planEntitlements: [
          {
            planId: subscription.planId,
            definition: users,
            value: { type: 'BOOLEAN', value: true },
          },
        ],
        overrides: [],
      }),
    ).toThrow(/requires INTEGER/);
  });

  it('rejects duplicate plan grants and undocumented overrides', () => {
    expect(() =>
      evaluateEntitlements({
        subscription,
        planEntitlements: [...grants, grants[0]],
        overrides: [],
      }),
    ).toThrow(/duplicate entitlement/i);

    expect(() =>
      evaluateEntitlements({
        subscription,
        planEntitlements: grants,
        overrides: [
          {
            subscriptionId: subscription.id,
            definition: users,
            value: { type: 'INTEGER', value: 5 },
            reason: ' ',
          },
        ],
      }),
    ).toThrow(/requires a reason/);
  });

  it('clamps an exhausted allowance to zero and validates usage', () => {
    const resolved = evaluateEntitlements({
      subscription,
      planEntitlements: grants,
      overrides: [],
    });
    expect(remainingAllowance({ entitlements: resolved, key: 'users.max', consumed: 10 })).toBe(0);
    expect(() =>
      remainingAllowance({ entitlements: resolved, key: 'users.max', consumed: -1 }),
    ).toThrow(/non-negative/);
  });
});
