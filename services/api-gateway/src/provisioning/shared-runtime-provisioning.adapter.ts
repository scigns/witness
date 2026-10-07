import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { WitnessConfig } from '@witness/config';
import { effectiveTenantId } from '@witness/domain';
import { BUILD_INFO } from '../build-info.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { StoragePort } from '../storage/storage.port.js';
import { WITNESS_CONFIG } from '../tokens.js';
import {
  ProvisioningPort,
  type ProvisioningObservation,
  type ProvisioningRequest,
} from './provisioning.port.js';

/** Verifies the existing shared pool; never creates or attests dedicated infrastructure. */
@Injectable()
export class SharedRuntimeProvisioningAdapter extends ProvisioningPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WITNESS_CONFIG) private readonly config: WitnessConfig,
    @Optional() @Inject(StoragePort) private readonly storage: StoragePort | null,
  ) {
    super();
  }

  async observe(tenantId: string, desired?: ProvisioningRequest): Promise<ProvisioningObservation> {
    const unfulfilled: ProvisioningObservation = {
      state: 'NOT_PROVISIONED',
      deploymentIsolation: null,
      resourceProfileCode: null,
      configurationFingerprint: null,
      verifiedAt: null,
      evidenceReference: null,
      detail:
        'This provider only fulfils standard SHARED organisation namespaces on the managed runtime.',
    };
    if (
      !desired ||
      desired.deploymentIsolation !== 'SHARED' ||
      !['standard-free', 'standard-small'].includes(desired.resourceProfileCode) ||
      desired.computeClass !== 'shared-standard' ||
      desired.memoryClass !== 'shared-standard' ||
      this.config.profile !== 'hybrid' ||
      !this.config.objectStorageEnabled ||
      !this.storage ||
      !/^[0-9a-f]{40}$/.test(BUILD_INFO.buildId)
    ) {
      return unfulfilled;
    }
    try {
      const organisation = await this.prisma.organisation.findUnique({
        where: { id: desired.organisationId },
        select: { id: true, tenantId: true },
      });
      if (!organisation || effectiveTenantId(organisation) !== tenantId) return unfulfilled;
      const [database] = await this.prisma.$queryRaw<{ database: string; recovering: boolean }[]>`
        SELECT current_database() AS database, pg_is_in_recovery() AS recovering`;
      if (!database || database.recovering)
        return {
          ...unfulfilled,
          state: 'DEGRADED',
          detail: 'The shared system of record is not available as a writable primary.',
        };
      await this.storage.verifyNamespace(organisation.id + '/');
      const evidence = createHash('sha256')
        .update(
          JSON.stringify({
            build: BUILD_INFO.buildId,
            database: database.database,
            tenantId,
            organisationId: organisation.id,
            fingerprint: desired.configurationFingerprint,
          }),
        )
        .digest('hex');
      return {
        state: 'READY',
        deploymentIsolation: 'SHARED',
        resourceProfileCode: desired.resourceProfileCode,
        configurationFingerprint: desired.configurationFingerprint,
        verifiedAt: new Date().toISOString(),
        evidenceReference: `shared-runtime:${BUILD_INFO.buildId}:${evidence}`,
        detail:
          'Verified the serving shared runtime, writable system of record, organisation boundary and both object-store namespaces. This is shared-pool access, not dedicated compute or an additional worker allocation.',
      };
    } catch {
      return {
        ...unfulfilled,
        state: 'FAILED',
        detail: 'The database or storage provider could not verify the shared allocation.',
      };
    }
  }
}
