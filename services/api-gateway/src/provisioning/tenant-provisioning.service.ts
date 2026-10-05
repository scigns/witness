import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { StorageQuotaService } from '../organisations/storage-quota.service.js';
import { effectiveTenantId } from '@witness/domain';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { EffectiveCommercialConfigurationService } from '../commercial/effective-commercial-configuration.service.js';
import {
  ProvisioningPort,
  assessProvisioning,
  type ProvisioningObservation,
} from './provisioning.port.js';

@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuration: EffectiveCommercialConfigurationService,
    private readonly provider: ProvisioningPort,
    private readonly quota: StorageQuotaService,
  ) {}
  async status(organisationId: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true, tenantId: true },
    });
    if (organisation === null) throw new NotFoundException('Organisation not found.');
    const configuration = await this.configuration.resolveFor(organisationId);
    const tenantId = effectiveTenantId(organisation);
    const storageQuotaBytes = (await this.quota.usage(organisationId)).quotaBytes.toString();
    const desired = {
      deploymentIsolation: configuration.deploymentIsolation,
      resourceProfileCode: configuration.resourceProfile!.code,
      storageQuotaBytes,
      configurationFingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            profile: configuration.resourceProfile,
            isolation: configuration.deploymentIsolation,
            storageQuotaBytes,
          }),
        )
        .digest('hex'),
    };
    let observation: ProvisioningObservation;
    try {
      observation = await this.provider.observe(tenantId);
    } catch {
      this.logger.error({ event: 'provisioning.observation_failed', organisationId, tenantId });
      observation = {
        state: 'FAILED',
        deploymentIsolation: null,
        resourceProfileCode: null,
        configurationFingerprint: null,
        verifiedAt: null,
        evidenceReference: null,
        detail: 'The provisioning provider could not verify the allocation.',
      };
    }
    const observed = assessProvisioning(desired, observation);
    return {
      organisationId,
      tenantId,
      tenantAssignment:
        organisation.tenantId === null ? 'IMPLICIT_ORGANISATION_BOUNDARY' : 'EXPLICIT_TENANT',
      desired,
      observed,
    };
  }
}
