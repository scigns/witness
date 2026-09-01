import { describe, expect, it, vi } from 'vitest';

import { ManualSettlementService } from './manual-settlement.service.js';

const ids = {
  organisation: '00000000-0000-4000-8000-000000000001',
  otherOrganisation: '00000000-0000-4000-8000-000000000002',
  account: '00000000-0000-4000-8000-000000000003',
  invoice: '00000000-0000-4000-8000-000000000004',
  change: '00000000-0000-4000-8000-000000000005',
  subscription: '00000000-0000-4000-8000-000000000006',
  plan: '00000000-0000-4000-8000-000000000007',
  method: '00000000-0000-4000-8000-000000000008',
  actor: '00000000-0000-4000-8000-000000000009',
  line: '00000000-0000-4000-8000-000000000010',
  idempotency: '00000000-0000-4000-8000-000000000011',
};

const updatedAt = new Date('2026-08-01T00:00:00.000Z');
const receivedAt = '2026-09-01T02:00:00.000Z';

function fixture(overrides: Record<string, unknown> = {}) {
  const subscription = {
    id: ids.subscription,
    organisationId: ids.organisation,
    billingAccountId: ids.account,
    planId: 'free-plan',
    status: 'FREE',
    updatedAt,
  };
  const change = {
    id: ids.change,
    organisationId: ids.organisation,
    billingAccountId: ids.account,
    status: 'PENDING',
    action: 'CHANGE_PLAN',
    requestedPlanCode: 'institutional',
    billingInterval: 'YEARLY',
    paymentMethod: 'BANK_TRANSFER',
    sourceSubscriptionUpdatedAt: updatedAt,
    sourceSubscription: subscription,
  };
  const invoice = {
    id: ids.invoice,
    organisationId: ids.organisation,
    billingAccountId: ids.account,
    status: 'OPEN',
    currency: 'AUD',
    invoiceNumber: 'INV-0001',
    customerReference: null,
    purchaseOrderId: null,
    issuedAt: new Date('2026-08-02T00:00:00.000Z'),
    dueAt: new Date('2026-09-02T00:00:00.000Z'),
    paidAt: null,
    statusChangedAt: new Date('2026-08-02T00:00:00.000Z'),
    statusReason: null,
    lines: [
      {
        id: ids.line,
        description: 'Institutional annual subscription',
        quantity: 1n,
        unitAmountMinor: 120_000n,
        taxRateBasisPoints: 0,
      },
    ],
    commercialChangeRequest: change,
    ...overrides,
  };
  const payment = {
    id: '00000000-0000-4000-8000-000000000012',
    organisationId: ids.organisation,
    invoiceId: ids.invoice,
    amountMinor: 120_000n,
    currency: 'AUD',
    method: 'MANUAL_BANK_TRANSFER',
    sourceReference: 'BANK-REFERENCE-1',
    receivedAt: new Date(receivedAt),
    verifiedAt: new Date(receivedAt),
  };
  const tx = {
    $executeRaw: vi.fn(),
    actor: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: ids.actor, kind: 'human', displayName: 'Operator' }),
    },
    payment: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...payment, ...data })),
    },
    invoice: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(where.organisationId === ids.organisation ? invoice : null),
        ),
      update: vi.fn(),
    },
    plan: { findFirst: vi.fn().mockResolvedValue({ id: ids.plan, code: 'institutional' }) },
    paymentMethod: {
      findFirst: vi.fn().mockResolvedValue({ id: ids.method }),
      create: vi.fn(),
    },
    subscription: { update: vi.fn() },
    commercialChangeRequest: { update: vi.fn() },
    auditEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
  };
  const prisma = {
    actor: tx.actor,
    payment: { findUniqueOrThrow: vi.fn().mockResolvedValue(payment) },
    $transaction: vi.fn((callback) => callback(tx)),
  };
  const invoiceView = {
    id: ids.invoice,
    organisationId: ids.organisation,
    commercialChangeRequestId: ids.change,
    status: 'PAID',
    currency: 'AUD',
    totalMinor: '120000',
  };
  const invoices = { get: vi.fn().mockResolvedValue(invoiceView) };
  const overview = {
    subscription: { id: ids.subscription, status: 'ACTIVE' },
    currentPlan: { id: ids.plan, code: 'institutional', name: 'Institutional' },
    resolvedEntitlements: [{ capabilityCode: 'workspace.create', enabled: true }],
  };
  const commercial = { overview: vi.fn().mockResolvedValue(overview) };
  const service = new ManualSettlementService(
    prisma as never,
    invoices as never,
    commercial as never,
  );
  const request = {
    amountMinor: '120000',
    currency: 'AUD',
    receivedAt,
    paymentMethod: 'MANUAL_BANK_TRANSFER',
    sourceReference: payment.sourceReference,
    idempotencyKey: ids.idempotency,
  } as const;
  const principal = {
    subject: 'user:operator',
    displayName: 'Operator',
    kind: 'human',
    roles: [],
  } as never;
  return { service, request, principal, prisma, tx, invoice, change, subscription, payment };
}

describe('ManualSettlementService', () => {
  it('atomically records exact settlement, activates the requested plan, and audits every transition', async () => {
    const f = fixture();
    const result = await f.service.record(ids.organisation, ids.invoice, f.request, f.principal);

    expect(result.invoice.status).toBe('PAID');
    expect(result.subscription.status).toBe('ACTIVE');
    expect(result.resolvedEntitlements).toContainEqual(
      expect.objectContaining({ capabilityCode: 'workspace.create', enabled: true }),
    );
    expect(f.tx.payment.create).toHaveBeenCalledTimes(1);
    expect(f.tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
    expect(f.tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ planId: ids.plan, status: 'ACTIVE' }),
      }),
    );
    expect(f.tx.commercialChangeRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPLIED' }) }),
    );
    expect(f.tx.auditEvent.create).toHaveBeenCalledTimes(3);
  });

  it('returns the original result on an identical idempotent retry without applying twice', async () => {
    const f = fixture();
    f.tx.payment.findUnique.mockResolvedValue(f.payment);
    await f.service.record(ids.organisation, ids.invoice, f.request, f.principal);
    expect(f.tx.payment.create).not.toHaveBeenCalled();
    expect(f.tx.invoice.update).not.toHaveBeenCalled();
    expect(f.tx.subscription.update).not.toHaveBeenCalled();
    expect(f.tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for different evidence', async () => {
    const f = fixture();
    f.tx.payment.findUnique.mockResolvedValue({ ...f.payment, sourceReference: 'OTHER' });
    await expect(
      f.service.record(ids.organisation, ids.invoice, f.request, f.principal),
    ).rejects.toMatchObject({
      response: { error: { code: 'IDEMPOTENCY_CONFLICT' } },
    });
  });

  it('ATTACK — cannot settle an invoice through another organisation', async () => {
    const f = fixture();
    await expect(
      f.service.record(ids.otherOrganisation, ids.invoice, f.request, f.principal),
    ).rejects.toMatchObject({ response: { error: { code: 'INVOICE_NOT_FOUND' } } });
    expect(f.tx.payment.create).not.toHaveBeenCalled();
  });

  it('rejects stale subscription intent', async () => {
    const f = fixture();
    f.subscription.updatedAt = new Date('2026-08-02T00:00:00.000Z');
    await expect(
      f.service.record(ids.organisation, ids.invoice, f.request, f.principal),
    ).rejects.toMatchObject({
      response: { error: { code: 'STALE_COMMERCIAL_CHANGE' } },
    });
  });

  it.each([
    ['wrong currency', { currency: 'USD' }],
    ['partial payment', { amountMinor: '119999' }],
    ['overpayment', { amountMinor: '120001' }],
  ])('rejects unsupported %s', async (_name, change) => {
    const f = fixture();
    await expect(
      f.service.record(
        ids.organisation,
        ids.invoice,
        { ...f.request, ...change } as never,
        f.principal,
      ),
    ).rejects.toMatchObject({ code: expect.any(String) });
    expect(f.tx.payment.create).not.toHaveBeenCalled();
  });

  it.each(['PAID', 'VOID'])('rejects an invoice in %s state', async (status) => {
    const f = fixture({ status });
    await expect(
      f.service.record(ids.organisation, ids.invoice, f.request, f.principal),
    ).rejects.toMatchObject({
      code: expect.any(String),
    });
    expect(f.tx.payment.create).not.toHaveBeenCalled();
  });

  it('rejects a missing or non-pending commercial request', async () => {
    const f = fixture({ commercialChangeRequest: null });
    await expect(
      f.service.record(ids.organisation, ids.invoice, f.request, f.principal),
    ).rejects.toMatchObject({
      response: { error: { code: 'COMMERCIAL_CHANGE_NOT_SETTLEABLE' } },
    });
  });

  it('ATTACK — rejects replayed payment evidence even with a new idempotency key', async () => {
    const f = fixture();
    f.tx.payment.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      f.service.record(ids.organisation, ids.invoice, f.request, f.principal),
    ).rejects.toMatchObject({
      response: { error: { code: 'DUPLICATE_PAYMENT_EVIDENCE' } },
    });
  });

  it('propagates activation failure so the database transaction can roll back payment and invoice changes', async () => {
    const f = fixture();
    f.tx.subscription.update.mockRejectedValue(new Error('activation failed'));
    await expect(
      f.service.record(ids.organisation, ids.invoice, f.request, f.principal),
    ).rejects.toThrow('activation failed');
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(f.tx.auditEvent.create).not.toHaveBeenCalled();
  });
});
