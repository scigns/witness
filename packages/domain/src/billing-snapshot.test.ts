import { describe, expect, it } from 'vitest';
import { createInvoiceSnapshot } from './billing-snapshot.js';

const valid = {
  supplier: {
    legalName: 'Supplier A',
    businessIdentifier: null,
    billingAddress: 'Address A',
    billingEmail: 'billing@example.invalid',
  },
  customer: {
    legalName: 'Customer A',
    billingAddress: 'Customer Address A',
    billingEmail: null,
    businessIdentifier: null,
  },
  remittance: {
    accountName: 'Supplier A',
    routingIdentifier: 'SYNTHETIC-BSB-123',
    accountNumber: 'SYNTHETIC-ACCOUNT-456',
    paymentInstructions: null,
  },
};

describe('invoice snapshots', () => {
  it('freezes reviewed supplier/customer/remittance facts', () => {
    const snapshot = createInvoiceSnapshot(valid);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.supplier.legalName).toBe('Supplier A');
    expect(snapshot.remittance.accountNumber).toBe('SYNTHETIC-ACCOUNT-456');
  });

  it('rejects control characters and incomplete facts', () => {
    expect(() =>
      createInvoiceSnapshot({ ...valid, supplier: { ...valid.supplier, legalName: 'A\nB' } }),
    ).toThrow();
    expect(() =>
      createInvoiceSnapshot({ ...valid, remittance: { ...valid.remittance, accountNumber: '' } }),
    ).toThrow();
  });
});
