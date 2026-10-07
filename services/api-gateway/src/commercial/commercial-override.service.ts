/**
 * Platform-administration write path for `SubscriptionEntitlementOverride`
 * (ADR-0034's sibling commercial-entitlement work) — institutional sales
 * are negotiated, so a plan default must be overridable per organisation
 * without duplicating an entire Plan. Read-side resolution is unaffected:
 * `CommercialEntitlementService`/`EffectiveCommercialConfigurationService`
 * already pick up whatever this writes through the ordinary
 * `evaluateEntitlements()` path the moment it exists.
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { CreateSubscriptionEntitlementOverrideRequest } from '@witness/contracts';

import type { Principal } from '../authz/authorization.port.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { PrismaService } from '../infrastructure/prisma.service.js';

export interface SubscriptionEntitlementOverrideRow {
  readonly id: string;
  readonly entitlementKey: string;
  readonly value: boolean | number | string;
  readonly reason: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function jsonValueType(value: boolean | number | string): 'BOOLEAN' | 'INTEGER' | 'STRING' {
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (typeof value === 'number') return 'INTEGER';
  return 'STRING';
}

@Injectable()
export class CommercialOverrideService {
  constructor(private readonly prisma: PrismaService) {}

  async listFor(organisationId: string): Promise<SubscriptionEntitlementOverrideRow[]> {
    const subscription = await this.currentSubscription(organisationId);
    const overrides = await this.prisma.subscriptionEntitlementOverride.findMany({
      where: { subscriptionId: subscription.id },
      include: { entitlementDefinition: true },
      orderBy: { entitlementDefinition: { key: 'asc' } },
    });
    return overrides.map((override) => ({
      id: override.id,
      entitlementKey: override.entitlementDefinition.key,
      value: (override.value as { value: boolean | number | string }).value,
      reason: override.reason,
      createdAt: override.createdAt.toISOString(),
      updatedAt: override.updatedAt.toISOString(),
    }));
  }

  /**
   * Create or replace the override for one entitlement key on the
   * organisation's current subscription. A reason is mandatory — enforced
   * by the request schema, the database CHECK constraint, and
   * `evaluateEntitlements()` itself (three independent layers, deliberately,
   * since "why was this overridden" is the one fact a negotiated commercial
   * exception must never lose).
   */
  async upsert(
    organisationId: string,
    request: CreateSubscriptionEntitlementOverrideRequest,
    principal: Principal,
  ): Promise<SubscriptionEntitlementOverrideRow> {
    const subscription = await this.currentSubscription(organisationId);
    const definition = await this.prisma.entitlementDefinition.findUnique({
      where: { key: request.entitlementKey },
    });
    if (definition === null) {
      throw new NotFoundException({
        error: {
          code: 'ENTITLEMENT_DEFINITION_NOT_FOUND',
          message: `No entitlement definition with key '${request.entitlementKey}'.`,
        },
      });
    }
    const valueType = jsonValueType(request.value);
    if (valueType !== definition.valueType) {
      throw new BadRequestException({
        error: {
          code: 'ENTITLEMENT_TYPE_MISMATCH',
          message: `Entitlement '${definition.key}' requires ${definition.valueType}, received ${valueType}.`,
        },
      });
    }

    if (definition.key === 'resource.profile') {
      const profile = await this.prisma.resourceProfile.findUnique({
        where: { code: String(request.value) },
      });
      if (
        profile === null ||
        !profile.active ||
        profile.storageQuotaBytes < 0n ||
        profile.concurrencyLimit < 0 ||
        profile.workerAllocation < 0 ||
        profile.jobLimit < 0
      ) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_RESOURCE_PROFILE',
            message: 'Choose an active resource profile with valid capacity.',
          },
        });
      }
    }

    const actor = await resolveActor(this.prisma, principal);
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const override = await tx.subscriptionEntitlementOverride.upsert({
        where: {
          subscriptionId_entitlementDefinitionId: {
            subscriptionId: subscription.id,
            entitlementDefinitionId: definition.id,
          },
        },
        create: {
          id: randomUUID(),
          subscriptionId: subscription.id,
          entitlementDefinitionId: definition.id,
          value: { type: valueType, value: request.value },
          reason: request.reason,
        },
        update: {
          value: { type: valueType, value: request.value },
          reason: request.reason,
        },
      });
      await appendAuditEvent(
        tx,
        'subscription',
        subscription.id,
        {
          action: 'subscription.entitlement_override_set',
          actor,
          metadata: {
            entitlementKey: definition.key,
            value: JSON.stringify(request.value),
            reason: request.reason,
          },
        },
        now,
      );
      return override;
    });

    return {
      id: result.id,
      entitlementKey: definition.key,
      value: request.value,
      reason: result.reason,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    };
  }

  private async currentSubscription(organisationId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        organisationId,
        status: { in: ['FREE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (subscription === null) {
      throw new NotFoundException({
        error: {
          code: 'SUBSCRIPTION_NOT_FOUND',
          message: `Organisation '${organisationId}' has no current subscription.`,
        },
      });
    }
    return subscription;
  }
}
