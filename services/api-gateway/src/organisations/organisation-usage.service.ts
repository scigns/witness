/**
 * Per-organisation usage metering (Flight 1's operational-visibility gate).
 *
 * Every figure is derived on demand from the tables that already hold the
 * fact, the same reasoning `StorageQuotaService`'s own doc comment gives for
 * not maintaining a running counter: a counter can drift from reality, and
 * an aggregate query is cheap enough at this scale that the drift risk is
 * not worth taking on for an O(1) read. Nothing here is a client assertion —
 * every number is a server-side count against rows the application itself
 * wrote, and none of it is participant/evidence content, only counts of it.
 *
 * Deliberately not billing: no rate, no currency, no invoice. An operator
 * reads this to understand load and growth, not to be charged.
 */

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { StorageQuotaService } from './storage-quota.service.js';

export interface OrganisationUsage {
  readonly storageBytes: string;
  readonly storageQuotaBytes: string;
  readonly userCount: number;
  readonly participantCount: number;
  readonly programCount: number;
  readonly sessionCount: number;
  readonly transcriptionJobCount: number;
  readonly aiProcessingJobCount: number;
  readonly exportCount: number;
}

@Injectable()
export class OrganisationUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageQuota: StorageQuotaService,
  ) {}

  async usage(organisationId: string): Promise<OrganisationUsage> {
    const reportIds = await this.prisma.report.findMany({
      where: { organisationId },
      select: { id: true },
    });

    const [
      storage,
      userCount,
      participantCount,
      programCount,
      sessionCount,
      transcriptionJobCount,
      aiProcessingJobCount,
      exportCount,
    ] = await Promise.all([
      this.storageQuota.usage(organisationId),
      this.prisma.organisationMembership.count({ where: { organisationId, state: 'active' } }),
      this.prisma.sessionParticipant.count({ where: { organisationId } }),
      this.prisma.workspace.count({ where: { organisationId } }),
      this.prisma.coDesignSession.count({ where: { organisationId } }),
      this.prisma.transcript.count({ where: { evidence: { organisationId } } }),
      this.prisma.sessionSummary.count({ where: { session: { organisationId } } }),
      this.prisma.auditEvent.count({
        where: {
          subjectType: 'report',
          action: 'report.exported',
          subjectId: { in: reportIds.map((r) => r.id) },
        },
      }),
    ]);

    return {
      storageBytes: storage.usedBytes.toString(),
      storageQuotaBytes: storage.quotaBytes.toString(),
      userCount,
      participantCount,
      programCount,
      sessionCount,
      transcriptionJobCount,
      aiProcessingJobCount,
      exportCount,
    };
  }
}
