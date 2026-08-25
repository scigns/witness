import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import { CommercialEntitlementService } from './commercial-entitlement.service.js';

const organisationId = '11111111-1111-4111-8111-111111111111';

describe('CommercialEntitlementService', () => {
  it('loads the current subscription and resolves overrides through the domain evaluator', async () => {
    const prisma = {
      subscription: {
        findFirst: async () => ({
          id: '22222222-2222-4222-8222-222222222222',
          organisationId,
          billingAccountId: '33333333-3333-4333-8333-333333333333',
          planId: '10000000-0000-4000-8000-000000000001',
          status: 'FREE',
          billingInterval: null,
          currentPeriodStart: new Date('2026-08-25T00:00:00Z'),
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          createdAt: new Date('2026-08-25T00:00:00Z'),
          plan: {
            entitlements: [
              {
                value: { type: 'INTEGER', value: 3 },
                entitlementDefinition: {
                  id: '44444444-4444-4444-8444-444444444444',
                  key: 'users.max',
                  valueType: 'INTEGER',
                  unit: 'users',
                  description: 'Maximum active users',
                },
              },
            ],
          },
          overrides: [
            {
              value: { type: 'INTEGER', value: 5 },
              reason: 'Synthetic contracted pilot',
              entitlementDefinition: {
                id: '44444444-4444-4444-8444-444444444444',
                key: 'users.max',
                valueType: 'INTEGER',
                unit: 'users',
                description: 'Maximum active users',
              },
            },
          ],
        }),
      },
    } as unknown as PrismaService;

    const resolved = await new CommercialEntitlementService(prisma).forOrganisation(organisationId);
    expect(resolved.get('users.max')).toEqual({
      key: 'users.max',
      value: { type: 'INTEGER', value: 5 },
      source: 'SUBSCRIPTION_OVERRIDE',
    });
  });

  it('fails closed when an organisation has no current subscription', async () => {
    const prisma = {
      subscription: { findFirst: async () => null },
    } as unknown as PrismaService;
    await expect(
      new CommercialEntitlementService(prisma).forOrganisation(organisationId),
    ).rejects.toThrow(NotFoundException);
  });
});
