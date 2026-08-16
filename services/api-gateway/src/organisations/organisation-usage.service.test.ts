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
  aiProcessingJobCount: number;
  reportIds: string[];
  exportedReportIds: string[];
}) {
  const prisma = {
    report: {
      findMany: async () => counts.reportIds.map((id) => ({ id })),
    },
    organisationMembership: { count: async () => counts.userCount },
    sessionParticipant: { count: async () => counts.participantCount },
    workspace: { count: async () => counts.programCount },
    coDesignSession: { count: async () => counts.sessionCount },
    transcript: { count: async () => counts.transcriptionJobCount },
    sessionSummary: { count: async () => counts.aiProcessingJobCount },
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
      aiProcessingJobCount: 2,
      reportIds: ['r1', 'r2'],
      exportedReportIds: ['r1'],
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
      aiProcessingJobCount: 2,
      exportCount: 1,
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
  });
});
