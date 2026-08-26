import { describe, expect, it } from 'vitest';

import { IllegalTransition } from './errors.js';
import {
  toInvoiceId,
  toInvoiceLineItemId,
  toOrganisationId,
  toPaymentId,
  toPaymentMethodId,
  toPurchaseOrderId,
} from './ids.js';
import {
  assessPayment,
  createDraftInvoice,
  createInvoiceLineItem,
  createManualBankTransferEvidence,
  createManualBankTransferMethod,
  createPurchaseOrder,
  issueInvoice,
  markInvoiceOverdue,
  markInvoicePaid,
  markInvoiceRefunded,
  money,
  paymentEvidenceKey,
  rejectPaymentEvidence,
  replaceDraftInvoiceLines,
  reversePaymentEvidence,
  verifyPaymentEvidence,
  voidInvoice,
  type Invoice,
  type Payment,
} from './invoice.js';

const organisationA = toOrganisationId('11111111-1111-4111-8111-111111111111');
const organisationB = toOrganisationId('22222222-2222-4222-8222-222222222222');
const invoiceId = toInvoiceId('33333333-3333-4333-8333-333333333333');
const otherInvoiceId = toInvoiceId('44444444-4444-4444-8444-444444444444');
const lineId = toInvoiceLineItemId('55555555-5555-4555-8555-555555555555');
const paymentMethodId = toPaymentMethodId('66666666-6666-4666-8666-666666666666');
const paymentId = toPaymentId('77777777-7777-4777-8777-777777777777');
const purchaseOrderId = toPurchaseOrderId('88888888-8888-4888-8888-888888888888');
const issuedAt = new Date('2026-09-01T00:00:00.000Z');
const dueAt = new Date('2026-10-01T00:00:00.000Z');
const later = new Date('2026-10-02T00:00:00.000Z');

function line(input: { amount?: bigint; currency?: string; taxRate?: number } = {}) {
  return createInvoiceLineItem({
    id: lineId,
    description: 'Annual institutional licence',
    quantity: 1n,
    unitAmount: money(input.currency ?? 'AUD', input.amount ?? 10_000n),
    taxRateBasisPoints: input.taxRate ?? 1_000,
  });
}

function draft(
  input: {
    organisationId?: typeof organisationA;
    billingAccountId?: string;
    invoice?: typeof invoiceId;
    currency?: string;
    amount?: bigint;
    purchaseOrder?: typeof purchaseOrderId | null;
  } = {},
) {
  return createDraftInvoice({
    id: input.invoice ?? invoiceId,
    organisationId: input.organisationId ?? organisationA,
    billingAccountId: input.billingAccountId ?? 'billing-account-a',
    currency: input.currency ?? 'AUD',
    lineItems: [line({ amount: input.amount, currency: input.currency })],
    purchaseOrderId: input.purchaseOrder ?? null,
    at: new Date('2026-08-30T00:00:00.000Z'),
  });
}

function openInvoice(input: Parameters<typeof draft>[0] = {}): Invoice {
  return issueInvoice({
    invoice: draft(input),
    invoiceNumber: 'INV-2026-0001',
    issuedAt,
    dueAt,
  });
}

function method(
  input: {
    organisationId?: typeof organisationA;
    billingAccountId?: string;
  } = {},
) {
  return createManualBankTransferMethod({
    id: paymentMethodId,
    organisationId: input.organisationId ?? organisationA,
    billingAccountId: input.billingAccountId ?? 'billing-account-a',
  });
}

function payment(
  input: {
    organisationId?: typeof organisationA;
    billingAccountId?: string;
    invoice?: typeof invoiceId;
    amount?: bigint;
    currency?: string;
    reference?: string;
    verified?: boolean;
  } = {},
): Payment {
  const evidence = createManualBankTransferEvidence({
    id: paymentId,
    organisationId: input.organisationId ?? organisationA,
    billingAccountId: input.billingAccountId ?? 'billing-account-a',
    invoiceId: input.invoice ?? invoiceId,
    paymentMethod: method({
      organisationId: input.organisationId,
      billingAccountId: input.billingAccountId,
    }),
    sourceReference: input.reference ?? 'TEST-RECEIPT-0001',
    amount: money(input.currency ?? 'AUD', input.amount ?? 11_000n),
    receivedAt: new Date('2026-09-03T00:00:00.000Z'),
  });
  return input.verified === false
    ? evidence
    : verifyPaymentEvidence(evidence, new Date('2026-09-03T01:00:00.000Z'));
}

describe('commercial money and invoice lines', () => {
  it('uses explicit currency and exact integer minor units', () => {
    expect(money('AUD', 12_345n)).toEqual({ currency: 'AUD', amountMinor: 12_345n });
    expect(() => money('aud', 1n)).toThrowError(
      expect.objectContaining({ code: 'INVALID_CURRENCY' }),
    );
    expect(() => money('AUD', -1n)).toThrowError(
      expect.objectContaining({ code: 'INVALID_MONEY_AMOUNT' }),
    );
  });

  it('derives line and invoice totals with explicit half-up tax rounding', () => {
    const rounded = createInvoiceLineItem({
      id: lineId,
      description: 'Configured taxable item',
      quantity: 1n,
      unitAmount: money('AUD', 1n),
      taxRateBasisPoints: 5_000,
    });
    expect(rounded.subtotal.amountMinor).toBe(1n);
    expect(rounded.tax.amountMinor).toBe(1n);
    expect(rounded.total.amountMinor).toBe(2n);

    const invoice = draft();
    expect(invoice.subtotal.amountMinor).toBe(10_000n);
    expect(invoice.tax.amountMinor).toBe(1_000n);
    expect(invoice.total.amountMinor).toBe(11_000n);
  });

  it('rejects invalid quantity, tax, mixed currency, empty and duplicate lines', () => {
    expect(() =>
      createInvoiceLineItem({
        id: lineId,
        description: 'Invalid',
        quantity: 0n,
        unitAmount: money('AUD', 1n),
        taxRateBasisPoints: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_QUANTITY' }));
    expect(() => line({ taxRate: 10_001 })).toThrowError(
      expect.objectContaining({ code: 'INVALID_TAX_RATE' }),
    );
    expect(() =>
      createDraftInvoice({
        id: invoiceId,
        organisationId: organisationA,
        billingAccountId: 'billing-account-a',
        currency: 'AUD',
        lineItems: [line({ currency: 'USD' })],
        at: issuedAt,
      }),
    ).toThrowError(expect.objectContaining({ code: 'CURRENCY_MISMATCH' }));
    expect(() =>
      createDraftInvoice({
        id: invoiceId,
        organisationId: organisationA,
        billingAccountId: 'billing-account-a',
        currency: 'AUD',
        lineItems: [],
        at: issuedAt,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVOICE_LINES_REQUIRED' }));
    expect(() =>
      createDraftInvoice({
        id: invoiceId,
        organisationId: organisationA,
        billingAccountId: 'billing-account-a',
        currency: 'AUD',
        lineItems: [line(), line()],
        at: issuedAt,
      }),
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_LINE_ITEM' }));
  });

  it('rejects structurally forged line totals instead of trusting caller arithmetic', () => {
    const valid = line();
    const forged = {
      ...valid,
      total: money('AUD', valid.total.amountMinor + 1n),
    };
    expect(() =>
      createDraftInvoice({
        id: invoiceId,
        organisationId: organisationA,
        billingAccountId: 'billing-account-a',
        currency: 'AUD',
        lineItems: [forged],
        at: issuedAt,
      }),
    ).toThrowError(expect.objectContaining({ code: 'LINE_TOTAL_MISMATCH' }));
  });
});

describe('invoice state machine and issued immutability', () => {
  it('supports DRAFT → OPEN → OVERDUE → PAID → REFUNDED', () => {
    const opened = openInvoice();
    const overdue = markInvoiceOverdue(opened, later);
    const paid = markInvoicePaid(overdue, payment(), new Date('2026-10-03T00:00:00.000Z'));
    const reversed = reversePaymentEvidence(
      payment(),
      new Date('2026-10-04T00:00:00.000Z'),
      'Authorised reversal recorded',
    );
    const refunded = markInvoiceRefunded(
      paid,
      reversed,
      new Date('2026-10-04T00:00:00.000Z'),
      'Refund authorised',
    );
    expect([opened.status, overdue.status, paid.status, refunded.status]).toEqual([
      'OPEN',
      'OVERDUE',
      'PAID',
      'REFUNDED',
    ]);
  });

  it('supports voiding only DRAFT, OPEN, or OVERDUE invoices', () => {
    expect(voidInvoice(draft(), issuedAt, 'Draft withdrawn').status).toBe('VOID');
    expect(voidInvoice(openInvoice(), later, 'Invoice replaced').status).toBe('VOID');
    expect(
      voidInvoice(markInvoiceOverdue(openInvoice(), later), later, 'Order cancelled').status,
    ).toBe('VOID');
    const paid = markInvoicePaid(openInvoice(), payment(), later);
    expect(() => voidInvoice(paid, later, 'Invalid')).toThrow(IllegalTransition);
  });

  it('prevents issued meaning from being edited and retains the issued snapshot', () => {
    const opened = openInvoice();
    expect(Object.isFrozen(opened)).toBe(true);
    expect(Object.isFrozen(opened.lineItems)).toBe(true);
    expect(() => replaceDraftInvoiceLines(opened, [line({ amount: 20_000n })], later)).toThrow(
      IllegalTransition,
    );

    const overdue = markInvoiceOverdue(opened, later);
    expect(overdue.invoiceNumber).toBe(opened.invoiceNumber);
    expect(overdue.lineItems).toEqual(opened.lineItems);
    expect(overdue.total).toEqual(opened.total);
    expect(overdue.issuedAt).toEqual(opened.issuedAt);
    expect(overdue.dueAt).toEqual(opened.dueAt);
  });

  it('rejects invalid dates and illegal transitions', () => {
    expect(() =>
      issueInvoice({
        invoice: draft(),
        invoiceNumber: 'INV-1',
        issuedAt,
        dueAt: new Date('2026-08-31T00:00:00.000Z'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_INVOICE_DATES' }));
    expect(() => markInvoiceOverdue(openInvoice(), dueAt)).toThrowError(
      expect.objectContaining({ code: 'INVOICE_NOT_DUE' }),
    );
    expect(() =>
      issueInvoice({
        invoice: openInvoice(),
        invoiceNumber: 'INV-2',
        issuedAt,
        dueAt,
      }),
    ).toThrow(IllegalTransition);
    expect(() => markInvoiceRefunded(openInvoice(), payment(), later, 'Invalid')).toThrow(
      IllegalTransition,
    );
  });

  it('requires exact reversed evidence before recording a refund', () => {
    const paid = markInvoicePaid(openInvoice(), payment(), later);
    const wrongAmount = reversePaymentEvidence(
      payment({ amount: 11_001n }),
      later,
      'Incorrect receipt reversed',
    );
    expect(() => markInvoiceRefunded(paid, wrongAmount, later, 'Invalid refund')).toThrowError(
      expect.objectContaining({ code: 'REFUND_EVIDENCE_REQUIRED' }),
    );
  });
});

describe('purchase-order controls', () => {
  function purchaseOrder(
    input: {
      organisationId?: typeof organisationA;
      billingAccountId?: string;
      currency?: string;
      amount?: bigint;
      status?: 'DRAFT' | 'AUTHORISED' | 'CANCELLED';
      validUntil?: Date | null;
    } = {},
  ) {
    return createPurchaseOrder({
      id: purchaseOrderId,
      organisationId: input.organisationId ?? organisationA,
      billingAccountId: input.billingAccountId ?? 'billing-account-a',
      customerReference: 'PO-TEST-0001',
      status: input.status ?? 'AUTHORISED',
      authorisedAmount: money(input.currency ?? 'AUD', input.amount ?? 11_000n),
      validFrom: new Date('2026-08-01T00:00:00.000Z'),
      validUntil: input.validUntil ?? new Date('2026-12-31T00:00:00.000Z'),
    });
  }

  it('issues only against an authorised, current, same-tenant PO that covers the total', () => {
    const invoice = draft({ purchaseOrder: purchaseOrderId });
    expect(
      issueInvoice({
        invoice,
        invoiceNumber: 'INV-PO-1',
        issuedAt,
        dueAt,
        purchaseOrder: purchaseOrder(),
      }).status,
    ).toBe('OPEN');

    for (const po of [
      purchaseOrder({ organisationId: organisationB }),
      purchaseOrder({ billingAccountId: 'billing-account-b' }),
    ]) {
      expect(() =>
        issueInvoice({ invoice, invoiceNumber: 'INV-PO-X', issuedAt, dueAt, purchaseOrder: po }),
      ).toThrowError(expect.objectContaining({ code: 'TENANT_MISMATCH' }));
    }
    expect(() =>
      issueInvoice({
        invoice,
        invoiceNumber: 'INV-PO-X',
        issuedAt,
        dueAt,
        purchaseOrder: purchaseOrder({ status: 'DRAFT' }),
      }),
    ).toThrowError(expect.objectContaining({ code: 'PURCHASE_ORDER_NOT_AUTHORISED' }));
    expect(() =>
      issueInvoice({
        invoice,
        invoiceNumber: 'INV-PO-X',
        issuedAt,
        dueAt,
        purchaseOrder: purchaseOrder({ amount: 10_999n }),
      }),
    ).toThrowError(expect.objectContaining({ code: 'PURCHASE_ORDER_INSUFFICIENT' }));
    expect(() =>
      issueInvoice({
        invoice,
        invoiceNumber: 'INV-PO-X',
        issuedAt,
        dueAt,
        purchaseOrder: purchaseOrder({ currency: 'USD' }),
      }),
    ).toThrowError(expect.objectContaining({ code: 'CURRENCY_MISMATCH' }));
  });

  it('rejects a supplied PO when the invoice does not reference it', () => {
    expect(() =>
      issueInvoice({
        invoice: draft(),
        invoiceNumber: 'INV-PO-X',
        issuedAt,
        dueAt,
        purchaseOrder: purchaseOrder(),
      }),
    ).toThrowError(expect.objectContaining({ code: 'PURCHASE_ORDER_NOT_REFERENCED' }));
  });

  it('rejects inverted or expired PO dates', () => {
    expect(() =>
      createPurchaseOrder({
        id: purchaseOrderId,
        organisationId: organisationA,
        billingAccountId: 'billing-account-a',
        customerReference: 'PO-TEST-0001',
        status: 'AUTHORISED',
        authorisedAmount: money('AUD', 11_000n),
        validFrom: dueAt,
        validUntil: issuedAt,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_PO_DATES' }));

    expect(() =>
      createPurchaseOrder({
        id: purchaseOrderId,
        organisationId: organisationA,
        billingAccountId: 'billing-account-a',
        customerReference: 'PO-TEST-0001',
        status: 'INVALID' as 'AUTHORISED',
        authorisedAmount: money('AUD', 11_000n),
        validFrom: issuedAt,
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_PURCHASE_ORDER_STATUS' }));

    const invoice = draft({ purchaseOrder: purchaseOrderId });
    expect(() =>
      issueInvoice({
        invoice,
        invoiceNumber: 'INV-PO-X',
        issuedAt,
        dueAt,
        purchaseOrder: purchaseOrder({ validUntil: new Date('2026-08-31T00:00:00.000Z') }),
      }),
    ).toThrowError(expect.objectContaining({ code: 'PURCHASE_ORDER_EXPIRED' }));
  });
});

describe('manual bank-transfer settlement evidence', () => {
  it('is provider-neutral, non-secret and starts unverified', () => {
    const evidence = payment({ verified: false });
    expect(evidence).toMatchObject({
      method: 'MANUAL_BANK_TRANSFER',
      status: 'UNVERIFIED',
      sourceReference: 'TEST-RECEIPT-0001',
    });
    expect(evidence).not.toHaveProperty('credentials');
    expect(evidence).not.toHaveProperty('providerPayload');
  });

  it('gives duplicate deliveries the same stable evidence identity', () => {
    const first = payment({ verified: false, reference: 'TEST-REPLAY-0001' });
    const duplicate = payment({ verified: false, reference: 'TEST-REPLAY-0001' });
    const distinct = payment({ verified: false, reference: 'TEST-REPLAY-0002' });
    expect(paymentEvidenceKey(first)).toBe(paymentEvidenceKey(duplicate));
    expect(paymentEvidenceKey(first)).not.toBe(paymentEvidenceKey(distinct));
  });

  it('allows only UNVERIFIED → VERIFIED or REJECTED and VERIFIED → REVERSED', () => {
    const unverified = payment({ verified: false });
    const verified = verifyPaymentEvidence(unverified, issuedAt);
    const rejected = rejectPaymentEvidence(unverified, issuedAt, 'Reference not found');
    const reversed = reversePaymentEvidence(verified, later, 'Receipt reversed');
    expect([verified.status, rejected.status, reversed.status]).toEqual([
      'VERIFIED',
      'REJECTED',
      'REVERSED',
    ]);
    expect(() => verifyPaymentEvidence(verified, later)).toThrow(IllegalTransition);
    expect(() => reversePaymentEvidence(unverified, later, 'Invalid')).toThrow(IllegalTransition);
  });

  it('reports rejected and reversed evidence with their actual status', () => {
    const unverified = payment({ verified: false });
    const rejected = rejectPaymentEvidence(unverified, issuedAt, 'Reference not found');
    const reversed = reversePaymentEvidence(payment(), later, 'Receipt reversed');
    expect(assessPayment(openInvoice(), rejected)).toEqual({
      code: 'REJECTED',
      eligibleForReconciliation: false,
    });
    expect(assessPayment(openInvoice(), reversed)).toEqual({
      code: 'REVERSED',
      eligibleForReconciliation: false,
    });
  });

  it.each([
    ['exact verified payment', payment(), 'EXACT', true],
    ['unverified evidence', payment({ verified: false }), 'UNVERIFIED', false],
    ['wrong tenant', payment({ organisationId: organisationB }), 'TENANT_MISMATCH', false],
    [
      'wrong billing account',
      payment({ billingAccountId: 'billing-account-b' }),
      'BILLING_ACCOUNT_MISMATCH',
      false,
    ],
    ['wrong invoice', payment({ invoice: otherInvoiceId }), 'INVOICE_MISMATCH', false],
    ['wrong currency', payment({ currency: 'USD' }), 'CURRENCY_MISMATCH', false],
    ['partial payment', payment({ amount: 10_999n }), 'PARTIAL', false],
    ['overpayment', payment({ amount: 11_001n }), 'OVERPAYMENT', false],
  ])('assesses %s without guessing settlement behaviour', (_name, evidence, code, eligible) => {
    expect(assessPayment(openInvoice(), evidence as Payment)).toEqual({
      code,
      eligibleForReconciliation: eligible,
    });
  });

  it('does not settle void, paid or refunded invoices again', () => {
    const opened = openInvoice();
    const paid = markInvoicePaid(opened, payment(), later);
    const reversed = reversePaymentEvidence(payment(), later, 'Receipt reversed');
    const refunded = markInvoiceRefunded(paid, reversed, later, 'Refund authorised');
    for (const invoice of [voidInvoice(opened, later, 'Withdrawn'), paid, refunded]) {
      expect(assessPayment(invoice, payment())).toEqual({
        code: 'INVOICE_NOT_RECEIVABLE',
        eligibleForReconciliation: false,
      });
    }
  });

  it('rejects cross-tenant payment-method attachment', () => {
    expect(() =>
      createManualBankTransferEvidence({
        id: paymentId,
        organisationId: organisationA,
        billingAccountId: 'billing-account-a',
        invoiceId,
        paymentMethod: method({ organisationId: organisationB }),
        sourceReference: 'TEST-TENANT-0001',
        amount: money('AUD', 11_000n),
        receivedAt: issuedAt,
      }),
    ).toThrowError(expect.objectContaining({ code: 'TENANT_MISMATCH' }));
  });

  it('never marks an invoice paid from invalid evidence', () => {
    for (const evidence of [
      payment({ verified: false }),
      payment({ amount: 1n }),
      payment({ currency: 'USD' }),
      payment({ organisationId: organisationB }),
    ]) {
      expect(() => markInvoicePaid(openInvoice(), evidence, later)).toThrowError(
        expect.objectContaining({ code: 'PAYMENT_NOT_RECONCILABLE' }),
      );
    }
  });
});
