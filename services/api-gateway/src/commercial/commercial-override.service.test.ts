import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../infrastructure/prisma.service.js';
import { CommercialOverrideService } from './commercial-override.service.js';

describe('commercial resource override validation', () => {
  it.each([
    null,
    {
      active: false,
      storageQuotaBytes: 1000n,
      concurrencyLimit: 1,
      workerAllocation: 1,
      jobLimit: 1,
    },
    { active: true, storageQuotaBytes: -1n, concurrencyLimit: 1, workerAllocation: 1, jobLimit: 1 },
  ])('rejects unusable profile before commercial mutation %#', async (profile) => {
    const transaction = vi.fn();
    const prisma = {
      subscription: { findFirst: vi.fn().mockResolvedValue({ id: 'subscription-1' }) },
      entitlementDefinition: {
        findUnique: vi.fn().mockResolvedValue({ key: 'resource.profile', valueType: 'STRING' }),
      },
      resourceProfile: { findUnique: vi.fn().mockResolvedValue(profile) },
      $transaction: transaction,
    } as unknown as PrismaService;
    await expect(
      new CommercialOverrideService(prisma).upsert(
        'org-1',
        {
          entitlementKey: 'resource.profile',
          value: 'invalid-profile',
          reason: 'Negotiated capacity',
        },
        { subject: 'user:operator', displayName: 'Operator', kind: 'human', roles: [] },
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'INVALID_RESOURCE_PROFILE' } } });
    expect(transaction).not.toHaveBeenCalled();
  });
});
