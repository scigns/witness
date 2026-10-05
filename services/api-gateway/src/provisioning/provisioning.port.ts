import type { DeploymentIsolationTier } from '@witness/domain';

export type ProvisioningState = 'NOT_PROVISIONED' | 'PENDING' | 'READY' | 'DEGRADED' | 'FAILED';
export interface ProvisioningObservation {
  state: ProvisioningState;
  deploymentIsolation: DeploymentIsolationTier | null;
  resourceProfileCode: string | null;
  configurationFingerprint: string | null;
  verifiedAt: string | null;
  evidenceReference: string | null;
  detail: string;
}

/** Infrastructure adapters verify actual allocations. No request body can create an observation. */
export abstract class ProvisioningPort {
  abstract observe(tenantId: string): Promise<ProvisioningObservation>;
}

export function assessProvisioning(
  desired: {
    deploymentIsolation: DeploymentIsolationTier;
    resourceProfileCode: string;
    configurationFingerprint: string;
  },
  observed: ProvisioningObservation,
): ProvisioningObservation {
  if (observed.state !== 'READY') return observed;
  if (
    observed.deploymentIsolation !== desired.deploymentIsolation ||
    observed.resourceProfileCode !== desired.resourceProfileCode ||
    observed.configurationFingerprint !== desired.configurationFingerprint ||
    observed.verifiedAt === null ||
    !Number.isFinite(Date.parse(observed.verifiedAt)) ||
    !observed.evidenceReference?.trim()
  ) {
    return {
      ...observed,
      state: 'DEGRADED',
      detail:
        'Observed allocation does not have verified evidence matching the current contracted isolation and resource profile.',
    };
  }
  return observed;
}
