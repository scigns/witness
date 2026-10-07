/**
 * Effective commercial configuration (ADR-0034's sibling commercial-
 * entitlement work). The ONE authoritative resolution path from
 * `Organisation + Subscription + Plan + Overrides` (already resolved into
 * `ResolvedEntitlements` by `evaluateEntitlements()` in `commercial.ts` —
 * this module does not re-resolve entitlements, it only reads three
 * specific keys out of that already-resolved map) to the three declarative
 * commercial profiles the application actually needs to reason about:
 * `resource.profile`, `deployment.isolation`, `support.level`.
 *
 * Every lookup here is safe, never throwing: a subscription whose plan
 * predates one of these keys, or whose status fails `evaluateEntitlements`
 * closed to an empty map (SUSPENDED/CANCELLED), still resolves to a
 * well-defined least-capability default rather than an error. Plan names
 * never drive this — a caller reads `deploymentIsolation`/`supportLevel`,
 * never `plan.code === 'INSTITUTIONAL'`.
 */

import {
  DEPLOYMENT_ISOLATION_TIERS,
  type DeploymentIsolationTier,
} from './deployment-isolation.js';
import { SUPPORT_LEVELS, type SupportLevel } from './support-level.js';
import type { PlanCode, ResolvedEntitlements, SubscriptionStatus } from './commercial.js';
import type { OrganisationId } from './ids.js';

export const DEFAULT_DEPLOYMENT_ISOLATION: DeploymentIsolationTier = 'SHARED';
export const DEFAULT_SUPPORT_LEVEL: SupportLevel = 'community';

export interface EffectiveCommercialConfiguration {
  readonly organisationId: OrganisationId;
  readonly subscriptionStatus: SubscriptionStatus;
  readonly planCode: PlanCode;
  readonly entitlements: ResolvedEntitlements;
  /**
   * The resolved `resource.profile` entitlement's value (a
   * `ResourceProfile.code` to look up for its declarative capacity bundle),
   * or `null` when no usable value is resolved. Deliberately not defaulted
   * to a fallback code here — the pure domain layer does not know the
   * catalogue of profiles that exist, so it reports "unresolved" honestly
   * and leaves the application layer to decide a fallback profile.
   */
  readonly resourceProfileCode: string | null;
  readonly deploymentIsolation: DeploymentIsolationTier;
  readonly supportLevel: SupportLevel;
}

function stringEntitlementOrNull(entitlements: ResolvedEntitlements, key: string): string | null {
  const entitlement = entitlements.get(key);
  if (entitlement === undefined || entitlement.value.type !== 'STRING') return null;
  return entitlement.value.value;
}

function enumEntitlementOrDefault<T extends string>(
  entitlements: ResolvedEntitlements,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = stringEntitlementOrNull(entitlements, key);
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export function resolveEffectiveCommercialConfiguration(input: {
  readonly organisationId: OrganisationId;
  readonly subscriptionStatus: SubscriptionStatus;
  readonly planCode: PlanCode;
  readonly entitlements: ResolvedEntitlements;
}): EffectiveCommercialConfiguration {
  return {
    organisationId: input.organisationId,
    subscriptionStatus: input.subscriptionStatus,
    planCode: input.planCode,
    entitlements: input.entitlements,
    resourceProfileCode: stringEntitlementOrNull(input.entitlements, 'resource.profile'),
    deploymentIsolation: enumEntitlementOrDefault(
      input.entitlements,
      'deployment.isolation',
      DEPLOYMENT_ISOLATION_TIERS,
      DEFAULT_DEPLOYMENT_ISOLATION,
    ),
    supportLevel: enumEntitlementOrDefault(
      input.entitlements,
      'support.level',
      SUPPORT_LEVELS,
      DEFAULT_SUPPORT_LEVEL,
    ),
  };
}
