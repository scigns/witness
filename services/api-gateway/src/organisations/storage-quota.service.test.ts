import { describe, expect, it } from 'vitest';

import { InvariantViolation } from '@witness/domain';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import { StorageQuotaService } from './storage-quota.service.js';

const ORG_1 = '11111111-1111-4111-8111-111111111111';

function fakePrisma(options: {
  quotaBytes: bigint;
  attachmentBytesSum: number | null;
  resourceBytesSum: number | null;
}) {
  const prisma = {
    organisation: {
      findUniqueOrThrow: async () => ({ storageQuotaBytes: options.quotaBytes }),
    },
    evidenceAttachment: {
      aggregate: async () => ({ _sum: { sizeBytes: options.attachmentBytesSum } }),
    },
    resource: {
      aggregate: async () => ({ _sum: { sizeBytes: options.resourceBytesSum } }),
    },
  };
  return prisma as unknown as PrismaService;
}

describe('StorageQuotaService.usage', () => {
  it('sums evidence attachment and resource bytes together', async () => {
    const prisma = fakePrisma({
      quotaBytes: 5_368_709_120n,
      attachmentBytesSum: 1000,
      resourceBytesSum: 2000,
    });
    const service = new StorageQuotaService(prisma);

    const usage = await service.usage(ORG_1);

    expect(usage.usedBytes).toBe(3000n);
    expect(usage.quotaBytes).toBe(5_368_709_120n);
  });

  it('treats no rows in either table as zero usage, not an error', async () => {
    const prisma = fakePrisma({
      quotaBytes: 5_368_709_120n,
      attachmentBytesSum: null,
      resourceBytesSum: null,
    });
    const service = new StorageQuotaService(prisma);

    const usage = await service.usage(ORG_1);

    expect(usage.usedBytes).toBe(0n);
  });
});

describe('StorageQuotaService.checkQuota', () => {
  it('allows an upload that stays within quota', async () => {
    const prisma = fakePrisma({
      quotaBytes: 5_368_709_120n,
      attachmentBytesSum: 1_000_000_000,
      resourceBytesSum: 0,
    });
    const service = new StorageQuotaService(prisma);

    await expect(service.checkQuota(ORG_1, 500_000_000)).resolves.toBeUndefined();
  });

  it('allows an upload that lands exactly on the quota boundary', async () => {
    const prisma = fakePrisma({ quotaBytes: 1000n, attachmentBytesSum: 400, resourceBytesSum: 0 });
    const service = new StorageQuotaService(prisma);

    await expect(service.checkQuota(ORG_1, 600)).resolves.toBeUndefined();
  });

  it('ATTACK — refuses an upload that would exceed quota by even one byte', async () => {
    const prisma = fakePrisma({ quotaBytes: 1000n, attachmentBytesSum: 400, resourceBytesSum: 0 });
    const service = new StorageQuotaService(prisma);

    await expect(service.checkQuota(ORG_1, 601)).rejects.toThrow(InvariantViolation);
    await expect(service.checkQuota(ORG_1, 601)).rejects.toMatchObject({
      code: 'STORAGE_QUOTA_EXCEEDED',
    });
  });

  it('refuses an upload to an organisation already over quota', async () => {
    const prisma = fakePrisma({
      quotaBytes: 1000n,
      attachmentBytesSum: 2000,
      resourceBytesSum: 0,
    });
    const service = new StorageQuotaService(prisma);

    await expect(service.checkQuota(ORG_1, 1)).rejects.toThrow(InvariantViolation);
  });
});
