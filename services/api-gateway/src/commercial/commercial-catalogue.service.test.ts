import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Principal } from '../authz/authorization.port.js';
import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { OrganisationUsageService } from '../organisations/organisation-usage.service.js';
import type { CommercialEntitlementService } from './commercial-entitlement.service.js';

vi.mock('../infrastructure/actor.helper.js', () => ({
  resolveActor: vi.fn().mockResolvedValue({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    kind: 'human',
    displayName: 'Admin',
  }),
}));
vi.mock('../infrastructure/audit.helper.js', () => ({ appendAuditEvent: vi.fn() }));

import { CommercialCatalogueService } from './commercial-catalogue.service.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const SUBSCRIPTION = '33333333-3333-4333-8333-333333333333';
const PRINCIPAL: Principal = { subject: 'user-1', displayName: 'Admin', kind: 'human', roles: [] };

function harness(status = 'ACTIVE') {
  const subscription = {
    id: SUBSCRIPTION,
    organisationId: ORG,
    billingAccountId: ACCOUNT,
    planId: 'team-plan',
    status,
    billingInterval: status === 'FREE' ? null : 'MONTHLY',
    currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
    currentPeriodEnd: status === 'FREE' ? null : new Date('2026-09-01T00:00:00Z'),
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-10T00:00:00Z'),
  };
  const originalSubscription = structuredClone(subscription);
  const rows: Array<Record<string, unknown>> = [];
  let transactionTail = Promise.resolve();
  const commercialChangeRequest = {
    findUnique: vi.fn(
      async ({ where }) =>
        rows.find(
          (row) =>
            row.organisationId === where.organisationId_idempotencyKey.organisationId &&
            row.idempotencyKey === where.organisationId_idempotencyKey.idempotencyKey,
        ) ?? null,
    ),
    updateMany: vi.fn(async () => {
      for (const row of rows) if (row.status === 'PENDING') row.status = 'SUPERSEDED';
      return { count: rows.length };
    }),
    create: vi.fn(async ({ data }) => {
      const row = { ...data, status: 'PENDING', requestedAt: new Date('2026-08-26T00:00:00Z') };
      rows.push(row);
      return row;
    }),
  };
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    commercialChangeRequest,
    billingAccount: { findUnique: vi.fn(async () => ({ id: ACCOUNT, organisationId: ORG })) },
    subscription: { findFirst: vi.fn(async () => subscription) },
  };
  const prisma = {
    plan: {
      findUnique: vi.fn(async ({ where }) => ({
        code: where.code,
        active: true,
        quoteBased: where.code === 'INSTITUTIONAL',
      })),
    },
    $transaction: vi.fn((callback) => {
      const result = transactionTail.then(() => callback(tx));
      transactionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }),
  } as unknown as PrismaService;
  const service = new CommercialCatalogueService(
    prisma,
    {} as CommercialEntitlementService,
    {} as OrganisationUsageService,
  );
  return { service, subscription, originalSubscription, rows, commercialChangeRequest };
}

const paid = (key: string) => ({
  action: 'CHANGE_PLAN' as const,
  planCode: 'ORGANISATION' as const,
  billingInterval: 'YEARLY' as const,
  paymentMethod: 'CARD' as const,
  idempotencyKey: key,
});

describe('CommercialCatalogueService commercial intent invariants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records CHANGE_PLAN without mutating the active subscription or its resolved entitlement source', async () => {
    const h = harness();
    const entitlementsBefore = new Map([['users.max', 10]]);
    await h.service.requestChange(ORG, paid('aaaaaaaa-0000-4000-8000-000000000001'), PRINCIPAL);
    expect(h.subscription).toEqual(h.originalSubscription);
    expect(entitlementsBefore).toEqual(new Map([['users.max', 10]]));
    expect(h.rows[0]).toMatchObject({
      sourceSubscriptionId: SUBSCRIPTION,
      sourceSubscriptionUpdatedAt: new Date('2026-08-10T00:00:00Z'),
      effectiveAt: null,
    });
  });

  it('records cancellation for period end without mutating the active subscription', async () => {
    const h = harness();
    await h.service.requestChange(
      ORG,
      { action: 'CANCEL', idempotencyKey: 'aaaaaaaa-0000-4000-8000-000000000002' },
      PRINCIPAL,
    );
    expect(h.subscription).toEqual(h.originalSubscription);
    expect(h.rows[0]?.effectiveAt).toEqual(new Date('2026-09-01T00:00:00Z'));
  });

  it('rejects cancellation of FREE', async () => {
    const h = harness('FREE');
    await expect(
      h.service.requestChange(
        ORG,
        { action: 'CANCEL', idempotencyKey: 'aaaaaaaa-0000-4000-8000-000000000003' },
        PRINCIPAL,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'INVALID_SUBSCRIPTION_CHANGE' } } });
    expect(h.rows).toHaveLength(0);
  });

  it('returns the original row for a duplicate idempotency key', async () => {
    const h = harness();
    const request = paid('aaaaaaaa-0000-4000-8000-000000000004');
    const first = await h.service.requestChange(ORG, request, PRINCIPAL);
    const second = await h.service.requestChange(ORG, request, PRINCIPAL);
    expect(second.id).toBe(first.id);
    expect(h.rows).toHaveLength(1);
  });

  it('supersedes the previous pending request', async () => {
    const h = harness();
    await h.service.requestChange(ORG, paid('aaaaaaaa-0000-4000-8000-000000000005'), PRINCIPAL);
    await h.service.requestChange(ORG, paid('aaaaaaaa-0000-4000-8000-000000000006'), PRINCIPAL);
    expect(h.rows.map((row) => row.status)).toEqual(['SUPERSEDED', 'PENDING']);
  });

  it('serialises concurrent intents so exactly one remains PENDING', async () => {
    const h = harness();
    await Promise.all([
      h.service.requestChange(ORG, paid('aaaaaaaa-0000-4000-8000-000000000007'), PRINCIPAL),
      h.service.requestChange(ORG, paid('aaaaaaaa-0000-4000-8000-000000000008'), PRINCIPAL),
    ]);
    expect(h.rows.filter((row) => row.status === 'PENDING')).toHaveLength(1);
  });

  it('records quote interest without billing or payment semantics', async () => {
    const h = harness();
    const result = await h.service.requestChange(
      ORG,
      {
        action: 'REQUEST_QUOTE',
        planCode: 'INSTITUTIONAL',
        idempotencyKey: 'aaaaaaaa-0000-4000-8000-000000000009',
      },
      PRINCIPAL,
    );
    expect(result).toMatchObject({
      action: 'REQUEST_QUOTE',
      requestedPlanCode: 'INSTITUTIONAL',
      billingInterval: null,
      paymentMethod: null,
      effectiveAt: null,
    });
  });
});

describe('CommercialCatalogueService public catalogue boundary', () => {
  it('returns only public catalogue DTO fields and no customer or provider data', async () => {
    const prisma = {
      plan: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'internal-plan-id',
            code: 'TEAM',
            name: 'Team',
            description: 'For teams',
            quoteBased: false,
            active: true,
            providerProductId: 'provider-secret',
            prices: [
              {
                id: 'internal-price-id',
                planId: 'internal-plan-id',
                interval: 'MONTHLY',
                currency: 'AUD',
                amountMinor: 9900,
                startingFrom: false,
                active: true,
                providerPriceId: 'provider-price',
              },
            ],
            entitlements: [
              {
                id: 'internal-grant-id',
                planId: 'internal-plan-id',
                entitlementDefinitionId: 'definition-id',
                value: { type: 'INTEGER', value: 10 },
                entitlementDefinition: {
                  id: 'definition-id',
                  key: 'users.max',
                  valueType: 'INTEGER',
                  unit: 'users',
                  description: 'Maximum users',
                },
              },
            ],
            organisationId: ORG,
            billingAccount: { id: ACCOUNT },
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new CommercialCatalogueService(
      prisma,
      {} as CommercialEntitlementService,
      {} as OrganisationUsageService,
    );
    const result = await service.catalogue();
    const serialised = JSON.stringify(result);
    expect(result.plans[0]).toEqual({
      code: 'TEAM',
      name: 'Team',
      description: 'For teams',
      quoteBased: false,
      prices: [{ interval: 'MONTHLY', currency: 'AUD', amountMinor: 9900, startingFrom: false }],
      entitlements: [{ key: 'users.max', description: 'Maximum users', unit: 'users', value: 10 }],
    });
    expect(serialised).not.toMatch(/internal-|provider|organisationId|billingAccount/i);
  });
});
