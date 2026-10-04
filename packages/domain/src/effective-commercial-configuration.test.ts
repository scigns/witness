import { describe, expect, it } from 'vitest';

import {
  evaluateEntitlements,
  type EntitlementDefinition,
  type PlanEntitlement,
  type Subscription,
  type SubscriptionEntitlementOverride,
} from './commercial.js';
import { resolveEffectiveCommercialConfiguration } from './effective-commercial-configuration.js';
import { toOrganisationId } from './ids.js';

const ORG_ID = toOrganisationId('10000000-0000-4000-8000-000000000999');
const PLAN_ID = 'plan-1';
const SUBSCRIPTION_ID = 'sub-1';

const RESOURCE_PROFILE_DEF: EntitlementDefinition = {
  id: 'def-resource-profile',
  key: 'resource.profile',
  valueType: 'STRING',
  unit: null,
  description: 'Declarative capacity profile',
};
const DEPLOYMENT_ISOLATION_DEF: EntitlementDefinition = {
  id: 'def-deployment-isolation',
  key: 'deployment.isolation',
  valueType: 'STRING',
  unit: null,
  description: 'Contracted isolation tier',
};
const SUPPORT_LEVEL_DEF: EntitlementDefinition = {
  id: 'def-support-level',
  key: 'support.level',
  valueType: 'STRING',
  unit: null,
  description: 'Support service level',
};

function activeSubscription(status: Subscription['status'] = 'ACTIVE'): Subscription {
  return {
    id: SUBSCRIPTION_ID,
    organisationId: ORG_ID,
    billingAccountId: 'billing-1',
    planId: PLAN_ID,
    status,
    billingInterval: 'MONTHLY',
    currentPeriodStart: new Date('2026-01-01'),
    currentPeriodEnd: new Date('2026-02-01'),
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-01-01'),
  };
}

const PLAN_DEFAULTS: readonly PlanEntitlement[] = [
  {
    planId: PLAN_ID,
    definition: RESOURCE_PROFILE_DEF,
    value: { type: 'STRING', value: 'standard-small' },
  },
  {
    planId: PLAN_ID,
    definition: DEPLOYMENT_ISOLATION_DEF,
    value: { type: 'STRING', value: 'SHARED' },
  },
  {
    planId: PLAN_ID,
    definition: SUPPORT_LEVEL_DEF,
    value: { type: 'STRING', value: 'email' },
  },
];

describe('resolveEffectiveCommercialConfiguration', () => {
  it('resolves plan defaults when there are no overrides', () => {
    const entitlements = evaluateEntitlements({
      subscription: activeSubscription(),
      planEntitlements: PLAN_DEFAULTS,
      overrides: [],
    });

    const config = resolveEffectiveCommercialConfiguration({
      organisationId: ORG_ID,
      subscriptionStatus: 'ACTIVE',
      planCode: 'TEAM',
      entitlements,
    });

    expect(config.resourceProfileCode).toBe('standard-small');
    expect(config.deploymentIsolation).toBe('SHARED');
    expect(config.supportLevel).toBe('email');
  });

  it('an organisation-specific override takes precedence over the plan default', () => {
    const override: SubscriptionEntitlementOverride = {
      subscriptionId: SUBSCRIPTION_ID,
      definition: DEPLOYMENT_ISOLATION_DEF,
      value: { type: 'STRING', value: 'DEDICATED' },
      reason: 'Institutional contract #4521 — negotiated dedicated environment.',
    };
    const entitlements = evaluateEntitlements({
      subscription: activeSubscription(),
      planEntitlements: PLAN_DEFAULTS,
      overrides: [override],
    });

    const config = resolveEffectiveCommercialConfiguration({
      organisationId: ORG_ID,
      subscriptionStatus: 'ACTIVE',
      planCode: 'INSTITUTIONAL',
      entitlements,
    });

    expect(config.deploymentIsolation).toBe('DEDICATED');
    expect(entitlements.get('deployment.isolation')?.source).toBe('SUBSCRIPTION_OVERRIDE');
    // Keys the override does not touch keep resolving from the plan default.
    expect(config.resourceProfileCode).toBe('standard-small');
    expect(config.supportLevel).toBe('email');
  });

  it('a resource-only override does not disturb deployment isolation or support level', () => {
    const override: SubscriptionEntitlementOverride = {
      subscriptionId: SUBSCRIPTION_ID,
      definition: RESOURCE_PROFILE_DEF,
      value: { type: 'STRING', value: 'institutional' },
      reason: 'Negotiated capacity uplift.',
    };
    const entitlements = evaluateEntitlements({
      subscription: activeSubscription(),
      planEntitlements: PLAN_DEFAULTS,
      overrides: [override],
    });

    const config = resolveEffectiveCommercialConfiguration({
      organisationId: ORG_ID,
      subscriptionStatus: 'ACTIVE',
      planCode: 'TEAM',
      entitlements,
    });

    expect(config.resourceProfileCode).toBe('institutional');
    expect(config.deploymentIsolation).toBe('SHARED');
    expect(config.supportLevel).toBe('email');
  });

  it('falls back to the least-capability default when a key is entirely absent from the plan', () => {
    const entitlements = evaluateEntitlements({
      subscription: activeSubscription(),
      planEntitlements: [],
      overrides: [],
    });

    const config = resolveEffectiveCommercialConfiguration({
      organisationId: ORG_ID,
      subscriptionStatus: 'ACTIVE',
      planCode: 'FREE',
      entitlements,
    });

    expect(config.resourceProfileCode).toBeNull();
    expect(config.deploymentIsolation).toBe('SHARED');
    expect(config.supportLevel).toBe('community');
  });

  it('falls back to the least-capability default rather than throwing on an unrecognised tier value', () => {
    const corrupted: EntitlementDefinition = { ...DEPLOYMENT_ISOLATION_DEF };
    const entitlements = evaluateEntitlements({
      subscription: activeSubscription(),
      planEntitlements: [
        {
          planId: PLAN_ID,
          definition: corrupted,
          value: { type: 'STRING', value: 'NOT_A_REAL_TIER' },
        },
      ],
      overrides: [],
    });

    const config = resolveEffectiveCommercialConfiguration({
      organisationId: ORG_ID,
      subscriptionStatus: 'ACTIVE',
      planCode: 'FREE',
      entitlements,
    });

    expect(config.deploymentIsolation).toBe('SHARED');
  });

  it('a SUSPENDED subscription resolves every key to its safe default, never a stale plan grant', () => {
    const entitlements = evaluateEntitlements({
      subscription: activeSubscription('SUSPENDED'),
      planEntitlements: PLAN_DEFAULTS,
      overrides: [],
    });
    expect(entitlements.size).toBe(0);

    const config = resolveEffectiveCommercialConfiguration({
      organisationId: ORG_ID,
      subscriptionStatus: 'SUSPENDED',
      planCode: 'TEAM',
      entitlements,
    });

    expect(config.resourceProfileCode).toBeNull();
    expect(config.deploymentIsolation).toBe('SHARED');
    expect(config.supportLevel).toBe('community');
  });

  it('a CANCELLED subscription resolves to the same safe defaults as SUSPENDED', () => {
    const entitlements = evaluateEntitlements({
      subscription: activeSubscription('CANCELLED'),
      planEntitlements: PLAN_DEFAULTS,
      overrides: [],
    });

    const config = resolveEffectiveCommercialConfiguration({
      organisationId: ORG_ID,
      subscriptionStatus: 'CANCELLED',
      planCode: 'TEAM',
      entitlements,
    });

    expect(config.deploymentIsolation).toBe('SHARED');
    expect(config.supportLevel).toBe('community');
  });
});
