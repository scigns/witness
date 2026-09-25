import { describe, expect, it } from 'vitest';
import { renderInvoiceHtml, renderReceiptHtml } from './invoice-render.js';

const invoice = {
  id: '00000000-0000-4000-8000-000000000001',
  organisationId: '00000000-0000-4000-8000-000000000002',
  billingAccountId: '00000000-0000-4000-8000-000000000003',
  status: 'OPEN',
  currency: 'AUD',
  invoiceNumber: 'INV-00000001',
  customerReference: null,
  purchaseOrderId: null,
  supplier: {
    legalName: 'Supplier',
    businessIdentifier: null,
    address: '1 Supplier Lane',
    email: 'billing@example.invalid',
  },
  customer: {
    legalName: 'Customer',
    businessIdentifier: null,
    address: '2 Customer Lane',
    email: null,
  },
  lines: [
    {
      description: '<script>alert(1)</script>',
      quantity: '1',
      unitAmountMinor: '1000',
      taxRateBasisPoints: 0,
      subtotalMinor: '1000',
      taxMinor: '0',
      totalMinor: '1000',
    },
  ],
  subtotalMinor: '1000',
  taxMinor: '0',
  totalMinor: '1000',
  issuedAt: '2026-08-28T00:00:00.000Z',
  dueAt: '2026-09-28T00:00:00.000Z',
  remittance: {
    accountName: 'Supplier',
    routingIdentifier: 'SYNTHETIC-ROUTE',
    accountNumber: 'SYNTHETIC-ACCOUNT',
    paymentInstructions: 'Reference invoice',
  },
};

describe('invoice HTML rendering', () => {
  it('escapes customer-controlled text and includes persisted totals', () => {
    const html = renderInvoiceHtml(invoice);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('AUD 10.00');
  });

  it('is self-contained and states that payment is not confirmation', () => {
    const html = renderInvoiceHtml(invoice);
    expect(html).toContain('Payment instructions are not payment confirmation');
    expect(html).not.toMatch(/https?:\/\//);
  });
});

const receipt = {
  id: '00000000-0000-4000-8000-000000000005',
  organisationId: invoice.organisationId,
  invoiceId: invoice.id,
  paymentId: '00000000-0000-4000-8000-000000000006',
  receiptNumber: 'RCP-00000001',
  amountMinor: '1000',
  currency: 'AUD',
  issuedAt: '2026-09-01T00:00:00.000Z',
  invoiceNumber: invoice.invoiceNumber,
  paymentMethod: 'MANUAL_BANK_TRANSFER' as const,
  sourceReference: '<img src=x onerror=alert(1)>',
  supplier: invoice.supplier,
  customer: invoice.customer,
};

describe('receipt HTML rendering', () => {
  it('escapes customer-controlled text and includes the settled amount', () => {
    const html = renderReceiptHtml(receipt);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('AUD 10.00');
  });

  it("is self-contained and states that this document IS confirmation, not the invoice's disclaimer", () => {
    const html = renderReceiptHtml(receipt);
    expect(html).toContain('confirms the payment above was received and verified');
    expect(html).not.toContain('Payment instructions are not payment confirmation');
    expect(html).not.toMatch(/https?:\/\//);
  });
});
