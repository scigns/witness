import { Injectable, NotFoundException } from '@nestjs/common';

import {
  evaluateEntitlements,
  toOrganisationId,
  type EntitlementValue,
  type EntitlementValueType,
  type ResolvedEntitlements,
  type SubscriptionStatus,
} from '@witness/domain';

import { PrismaService } from '../infrastructure/prisma.service.js';

function entitlementValue(value: unknown, expected: string, key: string): EntitlementValue {
  if (typeof value !== 'object' || value === null || !('type' in value) || !('value' in value)) {
    throw new Error(`Persisted entitlement '${key}' is not a typed entitlement value.`);
  }
  const candidate = value as { readonly type: unknown; readonly value: unknown };
  if (candidate.type !== expected) {
    throw new Error(`Persisted entitlement '${key}' does not match its definition.`);
  }
  if (candidate.type === 'BOOLEAN' && typeof candidate.value === 'boolean') {
    return { type: 'BOOLEAN', value: candidate.value };
  }
  if (candidate.type === 'INTEGER' && typeof candidate.value === 'number') {
    return { type: 'INTEGER', value: candidate.value };
  }
  if (candidate.type === 'STRING' && typeof candidate.value === 'string') {
    return { type: 'STRING', value: candidate.value };
  }
  throw new Error(`Persisted entitlement '${key}' has an invalid ${expected} value.`);
}

/** Loads organisation-scoped commercial state and delegates all resolution to the pure domain. */
@Injectable()
export class CommercialEntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async forOrganisation(organisationId: string): Promise<ResolvedEntitlements> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        organisationId,
        status: { in: ['FREE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { include: { entitlements: { include: { entitlementDefinition: true } } } },
        overrides: { include: { entitlementDefinition: true } },
      },
    });
    if (subscription === null) {
      throw new NotFoundException({
        error: {
          code: 'SUBSCRIPTION_NOT_FOUND',
          message: `Organisation '${organisationId}' has no current subscription.`,
        },
      });
    }

    return evaluateEntitlements({
      subscription: {
        id: subscription.id,
        organisationId: toOrganisationId(subscription.organisationId),
        billingAccountId: subscription.billingAccountId,
        planId: subscription.planId,
        status: subscription.status as SubscriptionStatus,
        billingInterval: subscription.billingInterval as 'MONTHLY' | 'YEARLY' | null,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
      },
      planEntitlements: subscription.plan.entitlements.map((grant) => ({
        planId: subscription.planId,
        definition: {
          id: grant.entitlementDefinition.id,
          key: grant.entitlementDefinition.key,
          valueType: grant.entitlementDefinition.valueType as EntitlementValueType,
          unit: grant.entitlementDefinition.unit,
          description: grant.entitlementDefinition.description,
        },
        value: entitlementValue(
          grant.value,
          grant.entitlementDefinition.valueType,
          grant.entitlementDefinition.key,
        ),
      })),
      overrides: subscription.overrides.map((override) => ({
        subscriptionId: subscription.id,
        definition: {
          id: override.entitlementDefinition.id,
          key: override.entitlementDefinition.key,
          valueType: override.entitlementDefinition.valueType as EntitlementValueType,
          unit: override.entitlementDefinition.unit,
          description: override.entitlementDefinition.description,
        },
        value: entitlementValue(
          override.value,
          override.entitlementDefinition.valueType,
          override.entitlementDefinition.key,
        ),
        reason: override.reason,
      })),
    });
  }
}
