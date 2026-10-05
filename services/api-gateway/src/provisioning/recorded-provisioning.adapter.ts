import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { ProvisioningPort, type ProvisioningObservation } from './provisioning.port.js';

/** Existing tenant metadata is an observation hint, not provider verification or a host-creation API. */
@Injectable()
export class RecordedProvisioningAdapter extends ProvisioningPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }
  async observe(tenantId: string): Promise<ProvisioningObservation> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant === null)
      return {
        state: 'NOT_PROVISIONED',
        deploymentIsolation: null,
        resourceProfileCode: null,
        configurationFingerprint: null,
        verifiedAt: null,
        evidenceReference: null,
        detail:
          'The logical tenant resolves, but no verified infrastructure allocation is recorded.',
      };
    if (tenant.provisioningStatus === 'SHARED_INFRASTRUCTURE')
      return {
        state: 'DEGRADED',
        deploymentIsolation: 'SHARED',
        resourceProfileCode: null,
        configurationFingerprint: null,
        verifiedAt: null,
        evidenceReference: null,
        detail:
          'Shared infrastructure is recorded; contracted capacity and isolation have not been independently verified.',
      };
    return {
      state: tenant.provisioningStatus === 'PENDING' ? 'PENDING' : 'FAILED',
      deploymentIsolation: null,
      resourceProfileCode: null,
      configurationFingerprint: null,
      verifiedAt: null,
      evidenceReference: null,
      detail:
        'The recorded state requires verification by the deployment provider. Metadata alone cannot report READY.',
    };
  }
}
