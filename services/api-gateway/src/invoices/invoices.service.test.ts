import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { InvoicesService } from './invoices.service.js';

const row = {
  id: '00000000-0000-4000-8000-000000000001',
  organisationId: '00000000-0000-4000-8000-000000000002',
  billingAccountId: '00000000-0000-4000-8000-000000000003',
  status: 'OPEN',
  currency: 'AUD',
  invoiceNumber: 'INV-00000001',
  customerReference: null,
  purchaseOrderId: null,
  supplierLegalNameSnapshot: 'Supplier',
  supplierBusinessIdentifierSnapshot: null,
  supplierAddressSnapshot: '1 Supplier Lane',
  supplierBillingEmailSnapshot: 'billing@example.invalid',
  customerLegalNameSnapshot: 'Customer',
  customerBusinessIdentifierSnapshot: null,
  customerAddressSnapshot: '2 Customer Lane',
  customerBillingEmailSnapshot: null,
  subtotalMinor: 1000n,
  taxMinor: 0n,
  totalMinor: 1000n,
  issuedAt: new Date('2026-08-28T00:00:00Z'),
  dueAt: new Date('2026-09-28T00:00:00Z'),
  lines: [
    {
      description: 'Work',
      quantity: 1n,
      unitAmountMinor: 1000n,
      taxRateBasisPoints: 0,
      subtotalMinor: 1000n,
      taxMinor: 0n,
      totalMinor: 1000n,
    },
  ],
  remittanceSnapshot: {
    accountName: 'Supplier',
    routingIdentifier: 'ROUTE',
    accountNumber: 'ACCOUNT',
    paymentInstructions: null,
  },
};

describe('InvoicesService retrieval boundaries', () => {
  it('issues from server-authoritative facts and is idempotent', async () => {
    const created = { ...row, issuanceIdempotencyKey: '00000000-0000-4000-8000-000000000099' };
    const actor = {
      id: '00000000-0000-4000-8000-000000000098',
      kind: 'human',
      displayName: 'Operator',
    };
    const tx = {
      invoice: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(created),
        create: vi.fn().mockResolvedValue(created),
        findUniqueOrThrow: vi.fn().mockResolvedValue(created),
        update: vi.fn().mockResolvedValue(created),
      },
      invoiceRemittanceSnapshot: { create: vi.fn().mockResolvedValue(row.remittanceSnapshot) },
      billingAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: row.billingAccountId, currency: 'AUD' }),
      },
      purchaseOrder: { findFirst: vi.fn().mockResolvedValue(null) },
      organisation: { findUnique: vi.fn().mockResolvedValue({ id: row.organisationId }) },
      actor: { findFirst: vi.fn().mockResolvedValue(actor) },
      auditEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([{ allocate_invoice_number: row.invoiceNumber }]),
      $executeRaw: vi.fn(),
    };
    const prisma = { actor: tx.actor, $transaction: vi.fn((callback) => callback(tx)) };
    const service = new InvoicesService(
      prisma as never,
      {
        billingProfile: {
          legalName: 'Supplier',
          businessIdentifier: null,
          address: '1 Supplier Lane',
          email: 'billing@example.invalid',
          remittance: {
            accountName: 'Supplier',
            routingIdentifier: 'ROUTE',
            accountNumber: 'ACCOUNT',
            paymentInstructions: null,
          },
        },
      } as never,
    );
    const request = {
      idempotencyKey: created.issuanceIdempotencyKey,
      billingAccountId: row.billingAccountId,
      currency: 'AUD',
      customer: { legalName: 'Customer', address: '2 Customer Lane' },
      lines: [
        { description: 'Work', quantity: '1', unitAmountMinor: '1000', taxRateBasisPoints: 0 },
      ],
      dueAt: '2026-09-28T00:00:00.000Z',
    } as const;
    const principal = {
      subject: 'operator',
      displayName: 'Operator',
      kind: 'human',
      roles: ['admin'],
    } as never;
    const first = await service.issue(row.organisationId, request, principal);
    const second = await service.issue(row.organisationId, request, principal);
    expect(first.id).toBe(second.id);
    expect(tx.invoice.create).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    await expect(
      service.issue(
        row.organisationId,
        { ...request, lines: [{ ...request.lines[0], unitAmountMinor: '2000' }] },
        principal,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'IDEMPOTENCY_CONFLICT' } } });
    expect(tx.invoice.create).toHaveBeenCalledTimes(1);
  });

  it('scopes detail reads by organisation and excludes remittance', async () => {
    const findFirst = vi.fn().mockResolvedValue(row);
    const service = new InvoicesService(
      { invoice: { findFirst } } as never,
      { billingProfile: null } as never,
    );
    const result = await service.get(row.organisationId, row.id);
    expect(result).not.toHaveProperty('remittance');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organisationId: row.organisationId, id: row.id }),
      }),
    );
  });

  it('requires configured billing profile before issuance', async () => {
    const service = new InvoicesService({} as never, { billingProfile: null } as never);
    await expect(
      service.issue(row.organisationId, {} as never, {} as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('includes remittance only in the explicitly privileged render path', async () => {
    const findFirst = vi.fn().mockResolvedValue(row);
    const service = new InvoicesService(
      { invoice: { findFirst } } as never,
      { billingProfile: null } as never,
    );
    const result = await service.render(row.organisationId, row.id);
    expect(result.remittance.accountNumber).toBe('ACCOUNT');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ include: { lines: true, remittanceSnapshot: true } }),
    );
  });
});
