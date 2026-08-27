import { InvariantViolation } from './errors.js';

export interface SupplierInvoiceSnapshot {
  readonly legalName: string;
  readonly businessIdentifier: string | null;
  readonly billingAddress: string;
  readonly billingEmail: string;
}

export interface CustomerInvoiceSnapshot {
  readonly legalName: string;
  readonly billingAddress: string;
  readonly billingEmail: string | null;
  readonly businessIdentifier: string | null;
}

export interface RemittanceSnapshot {
  readonly accountName: string;
  readonly routingIdentifier: string;
  readonly accountNumber: string;
  readonly paymentInstructions: string | null;
}

export interface InvoiceSnapshotInput {
  readonly supplier: SupplierInvoiceSnapshot;
  readonly customer: CustomerInvoiceSnapshot;
  readonly remittance: RemittanceSnapshot;
}

function text(value: string, field: string, max = 500): string {
  const trimmed = value.trim();
  const hasControlCharacter = Array.from(trimmed).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (!trimmed || trimmed.length > max || hasControlCharacter) {
    throw new InvariantViolation(`${field} is invalid.`, 'INVALID_BILLING_SNAPSHOT');
  }
  return trimmed;
}

function optionalText(value: string | null | undefined, field: string, max = 500): string | null {
  if (value == null || value.trim() === '') return null;
  return text(value, field, max);
}

/** Validate reviewed facts before an invoice issuance operation persists them. */
export function createInvoiceSnapshot(input: InvoiceSnapshotInput): InvoiceSnapshotInput {
  const supplier = {
    legalName: text(input.supplier.legalName, 'Supplier legal name', 200),
    businessIdentifier: optionalText(
      input.supplier.businessIdentifier,
      'Supplier business identifier',
      100,
    ),
    billingAddress: text(input.supplier.billingAddress, 'Supplier billing address', 1000),
    billingEmail: text(input.supplier.billingEmail, 'Supplier billing email', 320),
  };
  const customer = {
    legalName: text(input.customer.legalName, 'Customer legal name', 200),
    billingAddress: text(input.customer.billingAddress, 'Customer billing address', 1000),
    billingEmail: optionalText(input.customer.billingEmail, 'Customer billing email', 320),
    businessIdentifier: optionalText(
      input.customer.businessIdentifier,
      'Customer business identifier',
      100,
    ),
  };
  const remittance = {
    accountName: text(input.remittance.accountName, 'Remittance account name', 200),
    routingIdentifier: text(
      input.remittance.routingIdentifier,
      'Remittance routing identifier',
      100,
    ),
    accountNumber: text(input.remittance.accountNumber, 'Remittance account number', 100),
    paymentInstructions: optionalText(
      input.remittance.paymentInstructions,
      'Payment instructions',
      1000,
    ),
  };
  return Object.freeze({
    supplier: Object.freeze(supplier),
    customer: Object.freeze(customer),
    remittance: Object.freeze(remittance),
  });
}
