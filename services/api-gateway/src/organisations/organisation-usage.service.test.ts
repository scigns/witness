import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { StorageQuotaService } from './storage-quota.service.js';
import { OrganisationUsageService } from './organisation-usage.service.js';

const ORG_1 = '11111111-1111-4111-8111-111111111111';

function fakeStorageQuota(): StorageQuotaService {
  return {
    usage: async () => ({ usedBytes: 123n, quotaBytes: 5_368_709_120n }),
  } as unknown as StorageQuotaService;
}

function fakePrisma(counts: {
  userCount: number;
  participantCount: number;
  programCount: number;
  sessionCount: number;
  transcriptionJobCount: number;
  transcriptionFailedCount?: number;
  aiProcessingJobCount: number;
  summaryFailedCount?: number;
  reviewsCompletedCount?: number;
  reportIds: string[];
  exportedReportIds: string[];
  publishedReportsPublishedCount?: number;
  closeToPublishPairs?: { closedAt: Date; publishedAt: Date }[];
}) {
  const prisma = {
    report: {
      // Two different calls share this one mock, distinguished by `select`
      // shape exactly like the real Prisma client would distinguish by args:
      // the reportIds lookup (feeds export count) selects `id`, the
      // close-to-publish lookup selects `publishedAt`/`session.closedAt`.
      findMany: async ({ select }: { select: { id?: true; publishedAt?: true } }) =>
        select.id
          ? counts.reportIds.map((id) => ({ id }))
          : (counts.closeToPublishPairs ?? []).map(({ closedAt, publishedAt }) => ({
              publishedAt,
              session: { closedAt },
            })),
      count: async () => counts.publishedReportsPublishedCount ?? 0,
    },
    organisationMembership: { count: async () => counts.userCount },
    sessionParticipant: { count: async () => counts.participantCount },
    workspace: { count: async () => counts.programCount },
    coDesignSession: { count: async () => counts.sessionCount },
    transcript: {
      count: async ({ where }: { where: { status?: string } }) =>
        where.status === 'failed'
          ? (counts.transcriptionFailedCount ?? 0)
          : counts.transcriptionJobCount,
    },
    sessionSummary: {
      count: async ({ where }: { where: { status?: string } }) =>
        where.status === 'failed' ? (counts.summaryFailedCount ?? 0) : counts.aiProcessingJobCount,
    },
    reviewAssignment: {
      count: async () => counts.reviewsCompletedCount ?? 0,
    },
    auditEvent: {
      count: async ({ where }: { where: { subjectId: { in: string[] } } }) =>
        where.subjectId.in.filter((id) => counts.exportedReportIds.includes(id)).length,
    },
  };
  return prisma as unknown as PrismaService;
}

describe('OrganisationUsageService.usage', () => {
  it('aggregates every dimension from the tables that already hold the fact', async () => {
    const prisma = fakePrisma({
      userCount: 3,
      participantCount: 12,
      programCount: 2,
      sessionCount: 5,
      transcriptionJobCount: 4,
      transcriptionFailedCount: 1,
      aiProcessingJobCount: 2,
      summaryFailedCount: 1,
      reviewsCompletedCount: 6,
      reportIds: ['r1', 'r2'],
      exportedReportIds: ['r1'],
      publishedReportsPublishedCount: 1,
    });
    const service = new OrganisationUsageService(prisma, fakeStorageQuota());

    const usage = await service.usage(ORG_1);

    expect(usage).toEqual({
      storageBytes: '123',
      storageQuotaBytes: '5368709120',
      userCount: 3,
      participantCount: 12,
      programCount: 2,
      sessionCount: 5,
      transcriptionJobCount: 4,
      transcriptionFailedCount: 1,
      aiProcessingJobCount: 2,
      summaryFailedCount: 1,
      reviewsCompletedCount: 6,
      reportsPublishedCount: 1,
      exportCount: 1,
      medianSessionCloseToPublishHours: null,
    });
  });

  it('reports zero exports for an organisation with no reports, not an error', async () => {
    const prisma = fakePrisma({
      userCount: 1,
      participantCount: 0,
      programCount: 0,
      sessionCount: 0,
      transcriptionJobCount: 0,
      aiProcessingJobCount: 0,
      reportIds: [],
      exportedReportIds: [],
    });
    const service = new OrganisationUsageService(prisma, fakeStorageQuota());

    const usage = await service.usage(ORG_1);

    expect(usage.exportCount).toBe(0);
    expect(usage.reportsPublishedCount).toBe(0);
    expect(usage.medianSessionCloseToPublishHours).toBeNull();
  });

  it('computes the median session-close-to-report-published duration in hours', async () => {
    const base = Date.parse('2026-08-01T00:00:00Z');
    const hour = 60 * 60 * 1000;
    const prisma = fakePrisma({
      userCount: 0,
      participantCount: 0,
      programCount: 0,
      sessionCount: 0,
      transcriptionJobCount: 0,
      aiProcessingJobCount: 0,
      reportIds: [],
      exportedReportIds: [],
      // Durations of 10h, 20h and 30h — median is the middle value, 20h,
      // not the mean (20h here, but the two would diverge with a skewed set).
      closeToPublishPairs: [
        { closedAt: new Date(base), publishedAt: new Date(base + 10 * hour) },
        { closedAt: new Date(base), publishedAt: new Date(base + 30 * hour) },
        { closedAt: new Date(base), publishedAt: new Date(base + 20 * hour) },
      ],
    });
    const service = new OrganisationUsageService(prisma, fakeStorageQuota());

    const usage = await service.usage(ORG_1);

    expect(usage.medianSessionCloseToPublishHours).toBe(20);
  });
});
