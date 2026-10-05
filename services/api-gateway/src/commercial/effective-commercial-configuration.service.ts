/**
 * The ONE authoritative resolution path from
 * `Organisation + Subscription + Plan + Overrides` to the declarative
 * commercial configuration the rest of the application reads (ADR-0034's
 * sibling commercial-entitlement work). Everything here delegates to
 * already-built, already-tested machinery:
 *
 * - entitlement resolution itself is `CommercialEntitlementService.forOrganisation()`
 *   (unchanged, reused as-is);
 * - the three declarative keys (resource.profile / deployment.isolation /
 *   support.level) are picked out of that resolved map, with safe fallback,
 *   by `resolveEffectiveCommercialConfiguration()` (packages/domain).
 *
 * This service's only own responsibility is the one extra lookup neither of
 * those already does: turning a resolved `resource.profile` *code* into the
 * full declarative capacity bundle it names.
 */

import { Injectable, NotFoundException } from '@nestjs/common';

import {
  InvariantViolation,
  resolveEffectiveCommercialConfiguration,
  toOrganisationId,
  type EffectiveCommercialConfiguration,
  type PlanCode,
} from '@witness/domain';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { CommercialEntitlementService } from './commercial-entitlement.service.js';

export interface ResourceProfileView {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly computeClass: string;
  readonly memoryClass: string;
  readonly storageQuotaBytes: string;
  readonly concurrencyLimit: number;
  readonly workerAllocation: number;
  readonly jobLimit: number;
  readonly backupProfile: string;
  readonly retentionProfile: string;
}

export interface EffectiveCommercialConfigurationView {
  readonly organisationId: string;
  readonly subscriptionStatus: EffectiveCommercialConfiguration['subscriptionStatus'];
  readonly planCode: PlanCode;
  readonly deploymentIsolation: EffectiveCommercialConfiguration['deploymentIsolation'];
  readonly supportLevel: EffectiveCommercialConfiguration['supportLevel'];
  /** `null` when no profile is resolved AND the fallback catalogue lookup also finds nothing. */
  readonly resourceProfile: ResourceProfileView | null;
  readonly entitlements: Array<{
    key: string;
    value: boolean | number | string;
    source: 'PLAN' | 'SUBSCRIPTION_OVERRIDE';
  }>;
}

/** The catalogue row used when no resource.profile entitlement resolves at all. */
const FALLBACK_RESOURCE_PROFILE_CODE = 'standard-free';

function entitlementPrimitive(value: {
  type: 'BOOLEAN' | 'INTEGER' | 'STRING';
  value: boolean | number | string;
}): boolean | number | string {
  return value.value;
}

@Injectable()
export class EffectiveCommercialConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: CommercialEntitlementService,
  ) {}

  async resolveFor(organisationId: string): Promise<EffectiveCommercialConfigurationView> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        organisationId,
        status: { in: ['FREE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true, plan: { select: { code: true } } },
    });
    if (subscription === null) {
      throw new NotFoundException({
        error: {
          code: 'SUBSCRIPTION_NOT_FOUND',
          message: `Organisation '${organisationId}' has no current subscription.`,
        },
      });
    }

    const resolvedEntitlements = await this.entitlements.forOrganisation(organisationId);
    const config = resolveEffectiveCommercialConfiguration({
      organisationId: toOrganisationId(organisationId),
      subscriptionStatus:
        subscription.status as EffectiveCommercialConfiguration['subscriptionStatus'],
      planCode: subscription.plan.code as PlanCode,
      entitlements: resolvedEntitlements,
    });

    const resourceProfile = await this.prisma.resourceProfile.findUnique({
      where: { code: config.resourceProfileCode ?? FALLBACK_RESOURCE_PROFILE_CODE },
    });

    if (
      resourceProfile === null ||
      !resourceProfile.active ||
      resourceProfile.storageQuotaBytes < 0n ||
      resourceProfile.concurrencyLimit < 0 ||
      resourceProfile.workerAllocation < 0 ||
      resourceProfile.jobLimit < 0
    ) {
      throw new InvariantViolation(
        'The effective resource profile is missing, inactive or has invalid capacity.',
        'INVALID_RESOURCE_PROFILE',
      );
    }

    return {
      organisationId,
      subscriptionStatus: config.subscriptionStatus,
      planCode: config.planCode,
      deploymentIsolation: config.deploymentIsolation,
      supportLevel: config.supportLevel,
      resourceProfile:
        resourceProfile === null
          ? null
          : {
              code: resourceProfile.code,
              name: resourceProfile.name,
              description: resourceProfile.description,
              computeClass: resourceProfile.computeClass,
              memoryClass: resourceProfile.memoryClass,
              storageQuotaBytes: resourceProfile.storageQuotaBytes.toString(),
              concurrencyLimit: resourceProfile.concurrencyLimit,
              workerAllocation: resourceProfile.workerAllocation,
              jobLimit: resourceProfile.jobLimit,
              backupProfile: resourceProfile.backupProfile,
              retentionProfile: resourceProfile.retentionProfile,
            },
      entitlements: Array.from(resolvedEntitlements.values()).map((entry) => ({
        key: entry.key,
        value: entitlementPrimitive(entry.value),
        source: entry.source,
      })),
    };
  }
}
