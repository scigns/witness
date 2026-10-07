import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { StorageQuotaService } from '../organisations/storage-quota.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
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
      observation = await this.provider.observe(tenantId, {
        ...desired,
        organisationId,
        computeClass: configuration.resourceProfile!.computeClass,
        memoryClass: configuration.resourceProfile!.memoryClass,
      });
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

  /** Explicit operator action records observed changes; GET remains read-only. */
  async verify(organisationId: string, principal: Principal) {
    const view = await this.status(organisationId);
    const actor = await resolveActor(this.prisma, principal);
    const metadata = {
      tenantId: view.tenantId,
      desiredIsolation: view.desired.deploymentIsolation,
      desiredProfile: view.desired.resourceProfileCode,
      fingerprint: view.desired.configurationFingerprint,
      observedState: view.observed.state,
      evidenceReference: view.observed.evidenceReference ?? '',
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('organisation'), hashtext(${organisationId}))`;
      const previous = await tx.auditEvent.findFirst({
        where: {
          subjectType: 'organisation',
          subjectId: organisationId,
          action: 'organisation.provisioning_verified',
        },
        orderBy: { sequence: 'desc' },
      });
      const prior = previous?.metadata as Record<string, unknown> | undefined;
      if (!Object.entries(metadata).every(([key, value]) => prior?.[key] === value)) {
        await appendAuditEvent(
          tx,
          'organisation',
          organisationId,
          {
            action: 'organisation.provisioning_verified',
            actor,
            metadata,
          },
          new Date(),
        );
      }
    });
    return view;
  }
}
