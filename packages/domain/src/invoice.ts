/**
 * Provider-neutral invoice and procurement rules for commercial milestone C3.1.
 *
 * This module represents receivable truth; it does not move money, persist
 * settlement, reconcile an operator action, or grant entitlements. Those effects
 * belong to later application and persistence milestones (ADR-0022).
 */

import { IllegalTransition, InvariantViolation } from './errors.js';
import type {
  InvoiceId,
  InvoiceLineItemId,
  OrganisationId,
  PaymentId,
  PaymentMethodId,
  PurchaseOrderId,
} from './ids.js';

export const INVOICE_STATUSES = ['DRAFT', 'OPEN', 'PAID', 'OVERDUE', 'VOID', 'REFUNDED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_EVIDENCE_STATUSES = [
  'UNVERIFIED',
  'VERIFIED',
  'REJECTED',
  'REVERSED',
] as const;
export type PaymentEvidenceStatus = (typeof PAYMENT_EVIDENCE_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = ['DRAFT', 'AUTHORISED', 'CANCELLED'] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export type PaymentMethodType = 'MANUAL_BANK_TRANSFER';

export interface Money {
  readonly currency: string;
  readonly amountMinor: bigint;
}

export interface InvoiceLineItem {
  readonly id: InvoiceLineItemId;
  readonly description: string;
  readonly quantity: bigint;
  readonly unitAmount: Money;
  /** Human-reviewed configured rate. Witness does not determine tax jurisdiction. */
  readonly taxRateBasisPoints: number;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
}

export interface Invoice {
  readonly id: InvoiceId;
  readonly organisationId: OrganisationId;
  readonly billingAccountId: string;
  readonly status: InvoiceStatus;
  readonly currency: string;
  readonly lineItems: readonly InvoiceLineItem[];
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly invoiceNumber: string | null;
  readonly customerReference: string | null;
  readonly purchaseOrderId: PurchaseOrderId | null;
  readonly issuedAt: Date | null;
  readonly dueAt: Date | null;
  readonly paidAt: Date | null;
  readonly statusChangedAt: Date;
  readonly statusReason: string | null;
}

export interface PurchaseOrder {
  readonly id: PurchaseOrderId;
  readonly organisationId: OrganisationId;
  readonly billingAccountId: string;
  readonly customerReference: string;
  readonly status: PurchaseOrderStatus;
  readonly authorisedAmount: Money;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
}

export interface PaymentMethod {
  readonly id: PaymentMethodId;
  readonly organisationId: OrganisationId;
  readonly billingAccountId: string;
  readonly type: PaymentMethodType;
}

/** Non-secret evidence that money was observed outside Witness. */
export interface Payment {
  readonly id: PaymentId;
  readonly organisationId: OrganisationId;
  readonly billingAccountId: string;
  readonly invoiceId: InvoiceId;
  readonly paymentMethodId: PaymentMethodId;
  readonly method: PaymentMethodType;
  readonly sourceReference: string;
  readonly amount: Money;
  readonly receivedAt: Date;
  readonly status: PaymentEvidenceStatus;
  readonly statusChangedAt: Date;
  readonly verifiedAt: Date | null;
  readonly rejectionReason: string | null;
}

export type PaymentAssessmentCode =
  | 'EXACT'
  | 'UNVERIFIED'
  | 'TENANT_MISMATCH'
  | 'BILLING_ACCOUNT_MISMATCH'
  | 'INVOICE_MISMATCH'
  | 'INVOICE_NOT_RECEIVABLE'
  | 'CURRENCY_MISMATCH'
  | 'PARTIAL'
  | 'OVERPAYMENT';

export interface PaymentAssessment {
  readonly code: PaymentAssessmentCode;
  readonly eligibleForReconciliation: boolean;
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function assertCurrency(currency: string): void {
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new InvariantViolation(
      'Currency must be an explicit three-letter uppercase code.',
      'INVALID_CURRENCY',
    );
  }
}

function assertNonEmpty(value: string, field: string, code: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new InvariantViolation(`${field} is required.`, code);
  return trimmed;
}

function assertSafeReference(value: string, field: string, code: string): string {
  const reference = assertNonEmpty(value, field, code);
  const hasControlCharacter = Array.from(reference).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (reference.length > 200 || hasControlCharacter) {
    throw new InvariantViolation(
      `${field} must be at most 200 characters and contain no control characters.`,
      code,
    );
  }
  return reference;
}

function cloneDate(value: Date): Date {
  if (!Number.isFinite(value.getTime())) {
    throw new InvariantViolation('Commercial timestamp must be valid.', 'INVALID_TIMESTAMP');
  }
  return new Date(value.getTime());
}

export function money(currency: string, amountMinor: bigint): Money {
  assertCurrency(currency);
  if (amountMinor < 0n) {
    throw new InvariantViolation('Money cannot be negative.', 'INVALID_MONEY_AMOUNT');
  }
  return Object.freeze({ currency, amountMinor });
}

function calculateTax(subtotalMinor: bigint, taxRateBasisPoints: number): bigint {
  if (
    !Number.isSafeInteger(taxRateBasisPoints) ||
    taxRateBasisPoints < 0 ||
    taxRateBasisPoints > 10_000
  ) {
    throw new InvariantViolation(
      'Tax rate must be an integer from 0 to 10,000 basis points.',
      'INVALID_TAX_RATE',
    );
  }
  // Explicit half-up rounding to the nearest minor unit for non-negative amounts.
  return (subtotalMinor * BigInt(taxRateBasisPoints) + 5_000n) / 10_000n;
}

export function createInvoiceLineItem(input: {
  readonly id: InvoiceLineItemId;
  readonly description: string;
  readonly quantity: bigint;
  readonly unitAmount: Money;
  readonly taxRateBasisPoints: number;
}): InvoiceLineItem {
  if (input.quantity <= 0n) {
    throw new InvariantViolation('Line-item quantity must be positive.', 'INVALID_QUANTITY');
  }
  assertCurrency(input.unitAmount.currency);
  if (input.unitAmount.amountMinor < 0n) {
    throw new InvariantViolation('Unit amount cannot be negative.', 'INVALID_MONEY_AMOUNT');
  }
  const description = assertNonEmpty(
    input.description,
    'Line-item description',
    'LINE_DESCRIPTION_REQUIRED',
  );
  const subtotalMinor = input.quantity * input.unitAmount.amountMinor;
  const taxMinor = calculateTax(subtotalMinor, input.taxRateBasisPoints);
  return Object.freeze({
    id: input.id,
    description,
    quantity: input.quantity,
    unitAmount: money(input.unitAmount.currency, input.unitAmount.amountMinor),
    taxRateBasisPoints: input.taxRateBasisPoints,
    subtotal: money(input.unitAmount.currency, subtotalMinor),
    tax: money(input.unitAmount.currency, taxMinor),
    total: money(input.unitAmount.currency, subtotalMinor + taxMinor),
  });
}

function invoiceTotals(
  currency: string,
  lineItems: readonly InvoiceLineItem[],
): {
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
} {
  assertCurrency(currency);
  if (lineItems.length === 0) {
    throw new InvariantViolation(
      'Invoice requires at least one line item.',
      'INVOICE_LINES_REQUIRED',
    );
  }
  let subtotal = 0n;
  let tax = 0n;
  const ids = new Set<string>();
  for (const line of lineItems) {
    if (
      line.unitAmount.currency !== currency ||
      line.subtotal.currency !== currency ||
      line.tax.currency !== currency ||
      line.total.currency !== currency
    ) {
      throw new InvariantViolation(
        'Every line item must use the invoice currency.',
        'CURRENCY_MISMATCH',
      );
    }
    if (line.quantity <= 0n) {
      throw new InvariantViolation('Line-item quantity must be positive.', 'INVALID_QUANTITY');
    }
    const expectedSubtotal = line.quantity * line.unitAmount.amountMinor;
    const expectedTax = calculateTax(expectedSubtotal, line.taxRateBasisPoints);
    if (
      line.subtotal.amountMinor !== expectedSubtotal ||
      line.tax.amountMinor !== expectedTax ||
      line.total.amountMinor !== expectedSubtotal + expectedTax
    ) {
      throw new InvariantViolation(
        'Invoice line-item totals must be derived from quantity, unit amount and tax rate.',
        'LINE_TOTAL_MISMATCH',
      );
    }
    if (ids.has(line.id)) {
      throw new InvariantViolation('Invoice line-item IDs must be unique.', 'DUPLICATE_LINE_ITEM');
    }
    ids.add(line.id);
    subtotal += line.subtotal.amountMinor;
    tax += line.tax.amountMinor;
  }
  return {
    subtotal: money(currency, subtotal),
    tax: money(currency, tax),
    total: money(currency, subtotal + tax),
  };
}

function freezeInvoice(invoice: Invoice): Invoice {
  return Object.freeze({
    ...invoice,
    lineItems: Object.freeze([...invoice.lineItems]),
    issuedAt: invoice.issuedAt === null ? null : cloneDate(invoice.issuedAt),
    dueAt: invoice.dueAt === null ? null : cloneDate(invoice.dueAt),
    paidAt: invoice.paidAt === null ? null : cloneDate(invoice.paidAt),
    statusChangedAt: cloneDate(invoice.statusChangedAt),
  });
}

export function createDraftInvoice(input: {
  readonly id: InvoiceId;
  readonly organisationId: OrganisationId;
  readonly billingAccountId: string;
  readonly currency: string;
  readonly lineItems: readonly InvoiceLineItem[];
  readonly customerReference?: string | null;
  readonly purchaseOrderId?: PurchaseOrderId | null;
  readonly at: Date;
}): Invoice {
  const billingAccountId = assertNonEmpty(
    input.billingAccountId,
    'Billing account ID',
    'BILLING_ACCOUNT_REQUIRED',
  );
  const totals = invoiceTotals(input.currency, input.lineItems);
  return freezeInvoice({
    id: input.id,
    organisationId: input.organisationId,
    billingAccountId,
    status: 'DRAFT',
    currency: input.currency,
    lineItems: input.lineItems,
    ...totals,
    invoiceNumber: null,
    customerReference:
      input.customerReference === null || input.customerReference === undefined
        ? null
        : assertSafeReference(
            input.customerReference,
            'Customer reference',
            'INVALID_CUSTOMER_REFERENCE',
          ),
    purchaseOrderId: input.purchaseOrderId ?? null,
    issuedAt: null,
    dueAt: null,
    paidAt: null,
    statusChangedAt: input.at,
    statusReason: null,
  });
}

export function replaceDraftInvoiceLines(
  invoice: Invoice,
  lineItems: readonly InvoiceLineItem[],
  at: Date,
): Invoice {
  if (invoice.status !== 'DRAFT') throw new IllegalTransition(invoice.status, 'DRAFT_EDIT');
  const totals = invoiceTotals(invoice.currency, lineItems);
  return freezeInvoice({
    ...invoice,
    lineItems,
    ...totals,
    statusChangedAt: at,
  });
}

export function createPurchaseOrder(input: {
  readonly id: PurchaseOrderId;
  readonly organisationId: OrganisationId;
  readonly billingAccountId: string;
  readonly customerReference: string;
  readonly status: PurchaseOrderStatus;
  readonly authorisedAmount: Money;
  readonly validFrom: Date;
  readonly validUntil?: Date | null;
}): PurchaseOrder {
  const validFrom = cloneDate(input.validFrom);
  const validUntil =
    input.validUntil === null || input.validUntil === undefined
      ? null
      : cloneDate(input.validUntil);
  if (validUntil !== null && validUntil < validFrom) {
    throw new InvariantViolation('Purchase-order validity dates are inverted.', 'INVALID_PO_DATES');
  }
  if (!PURCHASE_ORDER_STATUSES.includes(input.status)) {
    throw new InvariantViolation(
      'Purchase-order status is invalid.',
      'INVALID_PURCHASE_ORDER_STATUS',
    );
  }
  return Object.freeze({
    ...input,
    billingAccountId: assertNonEmpty(
      input.billingAccountId,
      'Billing account ID',
      'BILLING_ACCOUNT_REQUIRED',
    ),
    customerReference: assertSafeReference(
      input.customerReference,
      'Purchase-order customer reference',
      'PO_REFERENCE_REQUIRED',
    ),
    authorisedAmount: money(input.authorisedAmount.currency, input.authorisedAmount.amountMinor),
    validFrom,
    validUntil,
  });
}

function assertPurchaseOrderCoversInvoice(
  invoice: Invoice,
  purchaseOrder: PurchaseOrder | null,
  issuedAt: Date,
): void {
  if (invoice.purchaseOrderId === null) return;
  if (purchaseOrder === null || purchaseOrder.id !== invoice.purchaseOrderId) {
    throw new InvariantViolation(
      'Referenced purchase order is required.',
      'PURCHASE_ORDER_REQUIRED',
    );
  }
  if (
    purchaseOrder.organisationId !== invoice.organisationId ||
    purchaseOrder.billingAccountId !== invoice.billingAccountId
  ) {
    throw new InvariantViolation(
      'Purchase order and invoice must have the same owner.',
      'TENANT_MISMATCH',
    );
  }
  if (purchaseOrder.status !== 'AUTHORISED') {
    throw new InvariantViolation(
      'Purchase order is not authorised.',
      'PURCHASE_ORDER_NOT_AUTHORISED',
    );
  }
  if (purchaseOrder.authorisedAmount.currency !== invoice.currency) {
    throw new InvariantViolation('Purchase-order currency does not match.', 'CURRENCY_MISMATCH');
  }
  if (purchaseOrder.authorisedAmount.amountMinor < invoice.total.amountMinor) {
    throw new InvariantViolation(
      'Purchase order does not cover the invoice total.',
      'PURCHASE_ORDER_INSUFFICIENT',
    );
  }
  if (
    issuedAt < purchaseOrder.validFrom ||
    (purchaseOrder.validUntil !== null && issuedAt > purchaseOrder.validUntil)
  ) {
    throw new InvariantViolation(
      'Purchase order is not valid on the issue date.',
      'PURCHASE_ORDER_EXPIRED',
    );
  }
}

export function issueInvoice(input: {
  readonly invoice: Invoice;
  readonly invoiceNumber: string;
  readonly issuedAt: Date;
  readonly dueAt: Date;
  readonly purchaseOrder?: PurchaseOrder | null;
}): Invoice {
  if (input.invoice.status !== 'DRAFT') throw new IllegalTransition(input.invoice.status, 'OPEN');
  const issuedAt = cloneDate(input.issuedAt);
  const dueAt = cloneDate(input.dueAt);
  if (dueAt < issuedAt) {
    throw new InvariantViolation(
      'Invoice due date cannot precede issue date.',
      'INVALID_INVOICE_DATES',
    );
  }
  assertPurchaseOrderCoversInvoice(input.invoice, input.purchaseOrder ?? null, issuedAt);
  return freezeInvoice({
    ...input.invoice,
    status: 'OPEN',
    invoiceNumber: assertNonEmpty(input.invoiceNumber, 'Invoice number', 'INVOICE_NUMBER_REQUIRED'),
    issuedAt,
    dueAt,
    statusChangedAt: issuedAt,
  });
}

export function markInvoiceOverdue(invoice: Invoice, at: Date): Invoice {
  if (invoice.status !== 'OPEN') throw new IllegalTransition(invoice.status, 'OVERDUE');
  const changedAt = cloneDate(at);
  if (invoice.dueAt === null || changedAt <= invoice.dueAt) {
    throw new InvariantViolation('Invoice is not past its due date.', 'INVOICE_NOT_DUE');
  }
  return freezeInvoice({ ...invoice, status: 'OVERDUE', statusChangedAt: changedAt });
}

export function voidInvoice(invoice: Invoice, at: Date, reason: string): Invoice {
  if (invoice.status !== 'DRAFT' && invoice.status !== 'OPEN' && invoice.status !== 'OVERDUE') {
    throw new IllegalTransition(invoice.status, 'VOID');
  }
  return freezeInvoice({
    ...invoice,
    status: 'VOID',
    statusChangedAt: at,
    statusReason: assertNonEmpty(reason, 'Void reason', 'INVOICE_REASON_REQUIRED'),
  });
}

export function createManualBankTransferMethod(input: {
  readonly id: PaymentMethodId;
  readonly organisationId: OrganisationId;
  readonly billingAccountId: string;
}): PaymentMethod {
  return Object.freeze({
    ...input,
    billingAccountId: assertNonEmpty(
      input.billingAccountId,
      'Billing account ID',
      'BILLING_ACCOUNT_REQUIRED',
    ),
    type: 'MANUAL_BANK_TRANSFER',
  });
}

export function createManualBankTransferEvidence(input: {
  readonly id: PaymentId;
  readonly organisationId: OrganisationId;
  readonly billingAccountId: string;
  readonly invoiceId: InvoiceId;
  readonly paymentMethod: PaymentMethod;
  readonly sourceReference: string;
  readonly amount: Money;
  readonly receivedAt: Date;
}): Payment {
  if (
    input.paymentMethod.organisationId !== input.organisationId ||
    input.paymentMethod.billingAccountId !== input.billingAccountId
  ) {
    throw new InvariantViolation(
      'Payment method and payment must have the same owner.',
      'TENANT_MISMATCH',
    );
  }
  return Object.freeze({
    id: input.id,
    organisationId: input.organisationId,
    billingAccountId: assertNonEmpty(
      input.billingAccountId,
      'Billing account ID',
      'BILLING_ACCOUNT_REQUIRED',
    ),
    invoiceId: input.invoiceId,
    paymentMethodId: input.paymentMethod.id,
    method: 'MANUAL_BANK_TRANSFER',
    sourceReference: assertSafeReference(
      input.sourceReference,
      'Settlement source reference',
      'SETTLEMENT_REFERENCE_REQUIRED',
    ),
    amount: money(input.amount.currency, input.amount.amountMinor),
    receivedAt: cloneDate(input.receivedAt),
    status: 'UNVERIFIED',
    statusChangedAt: cloneDate(input.receivedAt),
    verifiedAt: null,
    rejectionReason: null,
  });
}

export function paymentEvidenceKey(payment: Payment): string {
  return `${payment.organisationId}:${payment.method}:${payment.sourceReference}`;
}

export function verifyPaymentEvidence(payment: Payment, at: Date): Payment {
  if (payment.status !== 'UNVERIFIED') throw new IllegalTransition(payment.status, 'VERIFIED');
  const changedAt = cloneDate(at);
  return Object.freeze({
    ...payment,
    status: 'VERIFIED',
    statusChangedAt: changedAt,
    verifiedAt: changedAt,
  });
}

export function rejectPaymentEvidence(payment: Payment, at: Date, reason: string): Payment {
  if (payment.status !== 'UNVERIFIED') throw new IllegalTransition(payment.status, 'REJECTED');
  return Object.freeze({
    ...payment,
    status: 'REJECTED',
    statusChangedAt: cloneDate(at),
    rejectionReason: assertNonEmpty(reason, 'Rejection reason', 'PAYMENT_REASON_REQUIRED'),
  });
}

export function reversePaymentEvidence(payment: Payment, at: Date, reason: string): Payment {
  if (payment.status !== 'VERIFIED') throw new IllegalTransition(payment.status, 'REVERSED');
  return Object.freeze({
    ...payment,
    status: 'REVERSED',
    statusChangedAt: cloneDate(at),
    rejectionReason: assertNonEmpty(reason, 'Reversal reason', 'PAYMENT_REASON_REQUIRED'),
  });
}

export function assessPayment(invoice: Invoice, payment: Payment): PaymentAssessment {
  if (payment.organisationId !== invoice.organisationId) {
    return { code: 'TENANT_MISMATCH', eligibleForReconciliation: false };
  }
  if (payment.billingAccountId !== invoice.billingAccountId) {
    return { code: 'BILLING_ACCOUNT_MISMATCH', eligibleForReconciliation: false };
  }
  if (payment.invoiceId !== invoice.id) {
    return { code: 'INVOICE_MISMATCH', eligibleForReconciliation: false };
  }
  if (payment.status !== 'VERIFIED') {
    return { code: 'UNVERIFIED', eligibleForReconciliation: false };
  }
  if (invoice.status !== 'OPEN' && invoice.status !== 'OVERDUE') {
    return { code: 'INVOICE_NOT_RECEIVABLE', eligibleForReconciliation: false };
  }
  if (payment.amount.currency !== invoice.currency) {
    return { code: 'CURRENCY_MISMATCH', eligibleForReconciliation: false };
  }
  if (payment.amount.amountMinor < invoice.total.amountMinor) {
    return { code: 'PARTIAL', eligibleForReconciliation: false };
  }
  if (payment.amount.amountMinor > invoice.total.amountMinor) {
    return { code: 'OVERPAYMENT', eligibleForReconciliation: false };
  }
  return { code: 'EXACT', eligibleForReconciliation: true };
}

export function markInvoicePaid(invoice: Invoice, payment: Payment, at: Date): Invoice {
  const assessment = assessPayment(invoice, payment);
  if (!assessment.eligibleForReconciliation) {
    throw new InvariantViolation(
      `Payment is not eligible for reconciliation: ${assessment.code}.`,
      'PAYMENT_NOT_RECONCILABLE',
    );
  }
  return freezeInvoice({
    ...invoice,
    status: 'PAID',
    paidAt: at,
    statusChangedAt: at,
    statusReason: null,
  });
}

export function markInvoiceRefunded(
  invoice: Invoice,
  reversedPayment: Payment,
  at: Date,
  reason: string,
): Invoice {
  if (invoice.status !== 'PAID') throw new IllegalTransition(invoice.status, 'REFUNDED');
  if (
    reversedPayment.status !== 'REVERSED' ||
    reversedPayment.invoiceId !== invoice.id ||
    reversedPayment.organisationId !== invoice.organisationId ||
    reversedPayment.billingAccountId !== invoice.billingAccountId ||
    reversedPayment.amount.currency !== invoice.currency ||
    reversedPayment.amount.amountMinor !== invoice.total.amountMinor
  ) {
    throw new InvariantViolation(
      'Refund requires reversed payment evidence owned by this invoice.',
      'REFUND_EVIDENCE_REQUIRED',
    );
  }
  return freezeInvoice({
    ...invoice,
    status: 'REFUNDED',
    statusChangedAt: at,
    statusReason: assertNonEmpty(reason, 'Refund reason', 'INVOICE_REASON_REQUIRED'),
  });
}
