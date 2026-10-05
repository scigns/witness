import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { CommercialEntitlementService } from './commercial-entitlement.service.js';
import { EffectiveCommercialConfigurationService } from './effective-commercial-configuration.service.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const profile = {
  code: 'custom-capacity',
  name: 'Custom capacity',
  description: 'Negotiated capacity',
  computeClass: 'small',
  memoryClass: 'small',
  storageQuotaBytes: 1000n,
  concurrencyLimit: 1,
  workerAllocation: 1,
  jobLimit: 10,
  backupProfile: 'daily',
  retentionProfile: 'standard',
  active: true,
};
function service(row: typeof profile | null) {
  const prisma = {
    subscription: { findFirst: async () => ({ status: 'ACTIVE', plan: { code: 'TEAM' } }) },
    resourceProfile: { findUnique: async () => row },
  } as unknown as PrismaService;
  const entitlements = {
    forOrganisation: async () =>
      new Map([
        [
          'resource.profile',
          {
            key: 'resource.profile',
            value: { type: 'STRING', value: 'custom-capacity' },
            source: 'SUBSCRIPTION_OVERRIDE',
          },
        ],
      ]),
  } as unknown as CommercialEntitlementService;
  return new EffectiveCommercialConfigurationService(prisma, entitlements);
}
describe('effective resource capacity', () => {
  it('resolves negotiated capacity independently of the plan name', async () => {
    expect((await service(profile).resolveFor(ORG)).resourceProfile).toMatchObject({
      code: 'custom-capacity',
      storageQuotaBytes: '1000',
    });
  });
  it.each([
    null,
    { ...profile, active: false },
    { ...profile, storageQuotaBytes: -1n },
    { ...profile, concurrencyLimit: -1 },
    { ...profile, workerAllocation: -1 },
    { ...profile, jobLimit: -1 },
  ])('fails closed for unusable profile %#', async (row) => {
    await expect(service(row).resolveFor(ORG)).rejects.toMatchObject({
      code: 'INVALID_RESOURCE_PROFILE',
    });
  });
});
