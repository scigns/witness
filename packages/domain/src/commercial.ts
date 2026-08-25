/**
 * Provider-independent commercial catalogue and entitlement evaluation.
 *
 * Payment transport is deliberately absent. Witness resolves capability from
 * plan grants plus subscription overrides; a provider can confirm settlement
 * later, but cannot decide what an organisation may use (ADR-0022).
 */

import { InvariantViolation } from './errors.js';
import type { OrganisationId } from './ids.js';

export const PLAN_CODES = ['FREE', 'TEAM', 'ORGANISATION', 'INSTITUTIONAL'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** Stable catalogue identity seeded by the C1 migration. */
export const FREE_PLAN_ID = '10000000-0000-4000-8000-000000000001';

export const SUBSCRIPTION_STATUSES = [
  'FREE',
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type BillingInterval = 'MONTHLY' | 'YEARLY';
export type EntitlementValueType = 'BOOLEAN' | 'INTEGER' | 'STRING';

export type EntitlementValue =
  | { readonly type: 'BOOLEAN'; readonly value: boolean }
  | { readonly type: 'INTEGER'; readonly value: number }
  | { readonly type: 'STRING'; readonly value: string };

export interface Plan {
  readonly id: string;
  readonly code: PlanCode;
  readonly name: string;
  readonly description: string;
  readonly quoteBased: boolean;
  readonly active: boolean;
}

export interface PlanPrice {
  readonly id: string;
  readonly planId: string;
  readonly interval: BillingInterval;
  readonly currency: string;
  readonly amountMinor: number;
  readonly startingFrom: boolean;
}

export interface EntitlementDefinition {
  readonly id: string;
  readonly key: string;
  readonly valueType: EntitlementValueType;
  readonly unit: string | null;
  readonly description: string;
}

export interface PlanEntitlement {
  readonly planId: string;
  readonly definition: EntitlementDefinition;
  readonly value: EntitlementValue;
}

export interface BillingAccount {
  readonly id: string;
  readonly organisationId: OrganisationId;
  readonly currency: string;
  readonly createdAt: Date;
}

export interface Subscription {
  readonly id: string;
  readonly organisationId: OrganisationId;
  readonly billingAccountId: string;
  readonly planId: string;
  readonly status: SubscriptionStatus;
  readonly billingInterval: BillingInterval | null;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly createdAt: Date;
}

export interface SubscriptionEntitlementOverride {
  readonly subscriptionId: string;
  readonly definition: EntitlementDefinition;
  readonly value: EntitlementValue;
  readonly reason: string;
}

export interface ResolvedEntitlement {
  readonly key: string;
  readonly value: EntitlementValue;
  readonly source: 'PLAN' | 'SUBSCRIPTION_OVERRIDE';
}

export type ResolvedEntitlements = ReadonlyMap<string, ResolvedEntitlement>;

const ENTITLEMENT_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

function validateValue(definition: EntitlementDefinition, value: EntitlementValue): void {
  if (!ENTITLEMENT_KEY_PATTERN.test(definition.key)) {
    throw new InvariantViolation(
      `Entitlement key '${definition.key}' must be a dotted lower-case identifier.`,
      'INVALID_ENTITLEMENT_KEY',
    );
  }
  if (definition.valueType !== value.type) {
    throw new InvariantViolation(
      `Entitlement '${definition.key}' requires ${definition.valueType}, received ${value.type}.`,
      'ENTITLEMENT_TYPE_MISMATCH',
    );
  }
  if (value.type === 'INTEGER' && (!Number.isSafeInteger(value.value) || value.value < 0)) {
    throw new InvariantViolation(
      `Entitlement '${definition.key}' must be a non-negative safe integer.`,
      'INVALID_ENTITLEMENT_VALUE',
    );
  }
  if (value.type === 'STRING' && value.value.trim().length === 0) {
    throw new InvariantViolation(
      `Entitlement '${definition.key}' cannot be an empty string.`,
      'INVALID_ENTITLEMENT_VALUE',
    );
  }
}

/** Resolve plan defaults first, then explicit subscription overrides by key. */
export function evaluateEntitlements(input: {
  readonly subscription: Subscription;
  readonly planEntitlements: readonly PlanEntitlement[];
  readonly overrides: readonly SubscriptionEntitlementOverride[];
}): ResolvedEntitlements {
  if (input.subscription.status === 'SUSPENDED' || input.subscription.status === 'CANCELLED') {
    return new Map();
  }

  const resolved = new Map<string, ResolvedEntitlement>();
  for (const grant of input.planEntitlements) {
    if (grant.planId !== input.subscription.planId) continue;
    validateValue(grant.definition, grant.value);
    if (resolved.has(grant.definition.key)) {
      throw new InvariantViolation(
        `Plan contains duplicate entitlement '${grant.definition.key}'.`,
        'DUPLICATE_ENTITLEMENT',
      );
    }
    resolved.set(grant.definition.key, {
      key: grant.definition.key,
      value: grant.value,
      source: 'PLAN',
    });
  }

  for (const override of input.overrides) {
    if (override.subscriptionId !== input.subscription.id) continue;
    validateValue(override.definition, override.value);
    if (override.reason.trim().length === 0) {
      throw new InvariantViolation(
        `Override for '${override.definition.key}' requires a reason.`,
        'ENTITLEMENT_OVERRIDE_REASON_REQUIRED',
      );
    }
    resolved.set(override.definition.key, {
      key: override.definition.key,
      value: override.value,
      source: 'SUBSCRIPTION_OVERRIDE',
    });
  }
  return resolved;
}

export function booleanEntitlement(entitlements: ResolvedEntitlements, key: string): boolean {
  const entitlement = entitlements.get(key);
  if (entitlement === undefined) return false;
  if (entitlement.value.type !== 'BOOLEAN') {
    throw new InvariantViolation(
      `Entitlement '${key}' is not boolean.`,
      'ENTITLEMENT_TYPE_MISMATCH',
    );
  }
  return entitlement.value.value;
}

export function remainingAllowance(input: {
  readonly entitlements: ResolvedEntitlements;
  readonly key: string;
  readonly consumed: number;
}): number {
  if (!Number.isSafeInteger(input.consumed) || input.consumed < 0) {
    throw new InvariantViolation(
      'Consumed usage must be a non-negative safe integer.',
      'INVALID_USAGE',
    );
  }
  const entitlement = input.entitlements.get(input.key);
  if (entitlement === undefined) return 0;
  if (entitlement.value.type !== 'INTEGER') {
    throw new InvariantViolation(
      `Entitlement '${input.key}' is not an integer allowance.`,
      'ENTITLEMENT_TYPE_MISMATCH',
    );
  }
  return Math.max(0, entitlement.value.value - input.consumed);
}
