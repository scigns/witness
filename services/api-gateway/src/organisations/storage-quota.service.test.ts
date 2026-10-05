import { describe, expect, it, vi } from 'vitest';

import { InvariantViolation, toActorId } from '@witness/domain';

import type { EffectiveCommercialConfigurationService } from '../commercial/effective-commercial-configuration.service.js';
import type { PrismaService } from '../infrastructure/prisma.service.js';
import { StorageQuotaService } from './storage-quota.service.js';

const ORG_1 = '11111111-1111-4111-8111-111111111111';

function fakePrisma(options: {
  quotaBytes: bigint | null;
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
    storageReservation: { aggregate: async () => ({ _sum: { sizeBytes: 0n } }) },
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
    const service = new StorageQuotaService(prisma, {} as EffectiveCommercialConfigurationService);

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
    const service = new StorageQuotaService(prisma, {} as EffectiveCommercialConfigurationService);

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
    const service = new StorageQuotaService(prisma, {} as EffectiveCommercialConfigurationService);

    await expect(service.checkQuota(ORG_1, 500_000_000)).resolves.toBeUndefined();
  });

  it('allows an upload that lands exactly on the quota boundary', async () => {
    const prisma = fakePrisma({ quotaBytes: 1000n, attachmentBytesSum: 400, resourceBytesSum: 0 });
    const service = new StorageQuotaService(prisma, {} as EffectiveCommercialConfigurationService);

    await expect(service.checkQuota(ORG_1, 600)).resolves.toBeUndefined();
  });

  it('ATTACK — refuses an upload that would exceed quota by even one byte', async () => {
    const prisma = fakePrisma({ quotaBytes: 1000n, attachmentBytesSum: 400, resourceBytesSum: 0 });
    const service = new StorageQuotaService(prisma, {} as EffectiveCommercialConfigurationService);

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
    const service = new StorageQuotaService(prisma, {} as EffectiveCommercialConfigurationService);

    await expect(service.checkQuota(ORG_1, 1)).rejects.toThrow(InvariantViolation);
  });
});

describe('StorageQuotaService invalid capacity requests', () => {
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid byte count %s',
    async (bytes) => {
      const prisma = fakePrisma({ quotaBytes: 1000n, attachmentBytesSum: 0, resourceBytesSum: 0 });
      const service = new StorageQuotaService(
        prisma,
        {} as EffectiveCommercialConfigurationService,
      );
      await expect(service.checkQuota(ORG_1, bytes)).rejects.toMatchObject({
        code: 'INVALID_STORAGE_SIZE',
      });
    },
  );

  it('fails closed for a negative allocation', async () => {
    const prisma = fakePrisma({ quotaBytes: -1n, attachmentBytesSum: 0, resourceBytesSum: 0 });
    const service = new StorageQuotaService(prisma, {} as EffectiveCommercialConfigurationService);
    await expect(service.checkQuota(ORG_1, 0)).rejects.toMatchObject({
      code: 'INVALID_STORAGE_QUOTA',
    });
  });
});

describe('commercial allocation resolution', () => {
  it('uses the effective resource profile when no administrator override exists', async () => {
    const prisma = fakePrisma({ quotaBytes: null, attachmentBytesSum: 400, resourceBytesSum: 100 });
    const resolveFor = vi
      .fn()
      .mockResolvedValue({ resourceProfile: { storageQuotaBytes: '2000' } });
    const service = new StorageQuotaService(prisma, {
      resolveFor,
    } as unknown as EffectiveCommercialConfigurationService);
    const usage = await service.usage(ORG_1);
    expect(resolveFor).toHaveBeenCalledWith(ORG_1, prisma);
    expect(usage).toMatchObject({
      quotaBytes: 2000n,
      usedBytes: 500n,
      availableBytes: 1500n,
      percentageUsed: 25,
      source: 'RESOURCE_PROFILE',
    });
  });

  it('keeps an explicit zero allocation authoritative', async () => {
    const prisma = fakePrisma({ quotaBytes: 0n, attachmentBytesSum: 0, resourceBytesSum: 0 });
    const resolveFor = vi.fn();
    const service = new StorageQuotaService(prisma, {
      resolveFor,
    } as unknown as EffectiveCommercialConfigurationService);
    await expect(service.checkQuota(ORG_1, 1)).rejects.toMatchObject({
      code: 'STORAGE_QUOTA_EXCEEDED',
    });
    expect(resolveFor).not.toHaveBeenCalled();
  });

  it('propagates a commercial resolver failure rather than granting fallback capacity', async () => {
    const prisma = fakePrisma({ quotaBytes: null, attachmentBytesSum: 0, resourceBytesSum: 0 });
    const resolveFor = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const service = new StorageQuotaService(prisma, {
      resolveFor,
    } as unknown as EffectiveCommercialConfigurationService);
    await expect(service.checkQuota(ORG_1, 1)).rejects.toThrow('database unavailable');
  });

  it('uses the transaction aggregates for the authoritative recheck', async () => {
    const prisma = fakePrisma({ quotaBytes: 1000n, attachmentBytesSum: 0, resourceBytesSum: 0 });
    const tx = fakePrisma({ quotaBytes: 1000n, attachmentBytesSum: 900, resourceBytesSum: 0 });
    const service = new StorageQuotaService(prisma, {} as EffectiveCommercialConfigurationService);
    await expect(service.checkQuota(ORG_1, 200)).resolves.toBeUndefined();
    await expect(service.checkQuotaInTransaction(tx as never, ORG_1, 200)).rejects.toMatchObject({
      code: 'STORAGE_QUOTA_EXCEEDED',
    });
  });
});

describe('storage threshold audit', () => {
  const actor = {
    id: toActorId('99999999-9999-4999-8999-999999999999'),
    kind: 'human' as const,
    displayName: 'Uploader',
  };
  function transaction(used: number) {
    const db = fakePrisma({ quotaBytes: 1000n, attachmentBytesSum: used, resourceBytesSum: 0 });
    const auditEvent = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    };
    return Object.assign(db, { auditEvent });
  }
  it('records every newly crossed configured threshold in the upload transaction', async () => {
    const tx = transaction(600);
    const service = new StorageQuotaService(tx, {} as EffectiveCommercialConfigurationService);
    await service.checkQuotaInTransaction(tx as never, ORG_1, 400, actor);
    expect(
      tx.auditEvent.create.mock.calls.map(([call]) => call.data.metadata.thresholdPercent),
    ).toEqual(['70', '85', '95', '100']);
    expect(tx.auditEvent.create.mock.calls.every(([call]) => call.data.subjectId === ORG_1)).toBe(
      true,
    );
  });
  it('does not repeat thresholds already reached', async () => {
    const tx = transaction(850);
    const service = new StorageQuotaService(tx, {} as EffectiveCommercialConfigurationService);
    await service.checkQuotaInTransaction(tx as never, ORG_1, 50, actor);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
  it('records no threshold event for a rejected upload', async () => {
    const tx = transaction(600);
    const service = new StorageQuotaService(tx, {} as EffectiveCommercialConfigurationService);
    await expect(
      service.checkQuotaInTransaction(tx as never, ORG_1, 401, actor),
    ).rejects.toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});
