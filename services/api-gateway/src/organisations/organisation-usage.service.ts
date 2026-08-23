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
  readonly transcriptionFailedCount: number;
  readonly aiProcessingJobCount: number;
  readonly summaryFailedCount: number;
  readonly reviewsCompletedCount: number;
  readonly reportsPublishedCount: number;
  readonly exportCount: number;
  readonly medianSessionCloseToPublishHours: number | null;
}

/** The middle value of a numerically-sorted, non-empty list; `null` for an empty one. */
function median(sortedAscending: readonly number[]): number | null {
  if (sortedAscending.length === 0) return null;
  const mid = Math.floor(sortedAscending.length / 2);
  if (sortedAscending.length % 2 !== 0) {
    return sortedAscending[mid]!;
  }
  return (sortedAscending[mid - 1]! + sortedAscending[mid]!) / 2;
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
      transcriptionFailedCount,
      aiProcessingJobCount,
      summaryFailedCount,
      reviewsCompletedCount,
      reportsPublishedCount,
      exportCount,
      publishedReports,
    ] = await Promise.all([
      this.storageQuota.usage(organisationId),
      this.prisma.organisationMembership.count({ where: { organisationId, state: 'active' } }),
      this.prisma.sessionParticipant.count({ where: { organisationId } }),
      this.prisma.workspace.count({ where: { organisationId } }),
      this.prisma.coDesignSession.count({ where: { organisationId } }),
      this.prisma.transcript.count({ where: { evidence: { organisationId } } }),
      this.prisma.transcript.count({ where: { evidence: { organisationId }, status: 'failed' } }),
      this.prisma.sessionSummary.count({ where: { session: { organisationId } } }),
      this.prisma.sessionSummary.count({
        where: { session: { organisationId }, status: 'failed' },
      }),
      this.prisma.reviewAssignment.count({ where: { organisationId, status: 'completed' } }),
      this.prisma.report.count({ where: { organisationId, publishedAt: { not: null } } }),
      this.prisma.auditEvent.count({
        where: {
          subjectType: 'report',
          action: 'report.exported',
          subjectId: { in: reportIds.map((r) => r.id) },
        },
      }),
      // Raw material for the median below — one row per published report whose
      // session has also closed, not a second source of truth for either fact.
      this.prisma.report.findMany({
        where: { organisationId, publishedAt: { not: null }, session: { closedAt: { not: null } } },
        select: { publishedAt: true, session: { select: { closedAt: true } } },
      }),
    ]);

    const closeToPublishHours = publishedReports
      .map((report) => {
        // Both are non-null by the query's own `where` clause; Prisma's types
        // just can't express that a selected relation's field is guaranteed.
        const closedAt = report.session.closedAt as Date;
        const publishedAt = report.publishedAt as Date;
        return (publishedAt.getTime() - closedAt.getTime()) / (1000 * 60 * 60);
      })
      .filter((hours) => hours >= 0)
      .sort((a, b) => a - b);

    return {
      storageBytes: storage.usedBytes.toString(),
      storageQuotaBytes: storage.quotaBytes.toString(),
      userCount,
      participantCount,
      programCount,
      sessionCount,
      transcriptionJobCount,
      transcriptionFailedCount,
      aiProcessingJobCount,
      summaryFailedCount,
      reviewsCompletedCount,
      reportsPublishedCount,
      exportCount,
      medianSessionCloseToPublishHours: median(closeToPublishHours),
    };
  }
}
