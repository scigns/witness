#!/usr/bin/env node

/**
 * Direct PostgreSQL probes for #112. This deliberately uses psql rather than
 * Prisma so CHECK constraints, composite foreign keys, triggers and concurrent
 * allocation are exercised at the database boundary.
 *
 * Run against a disposable database after migrations:
 *   DATABASE_URL=... node scripts/ci/check-commercial-persistence.mjs
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const configuredDatabaseUrl = process.env.DATABASE_URL;

if (!configuredDatabaseUrl) throw new Error('DATABASE_URL is required');

// Prisma accepts the `schema` query parameter; libpq/psql does not.
const databaseUrl = new URL(configuredDatabaseUrl);
databaseUrl.searchParams.delete('schema');

function sql(statement) {
  return execFileSync(
    'psql',
    ['--dbname', databaseUrl.toString(), '-v', 'ON_ERROR_STOP=1', '-Atqc', statement],
    { encoding: 'utf8' },
  ).trim();
}

function expectRejected(label, statement) {
  try {
    sql(statement);
  } catch {
    return;
  }
  throw new Error(`${label}: database accepted an invalid write`);
}

const suffix = `${Date.now()}`;
const organisationA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const organisationB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const accountA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const accountB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc';
const invoiceA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac';
const invoiceB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd';
const invoiceC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbe';
const invoiceD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbf';
const invoiceE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const lineA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad';
const remittanceA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaba';
const poA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae';
const methodA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaf';
const methodB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb0';
const paymentA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab0';

sql(`
  INSERT INTO organisation (id, name, storage_quota_bytes, created_at)
  VALUES
    ('${organisationA}', 'C3 persistence probe A ${suffix}', 1, CURRENT_TIMESTAMP),
    ('${organisationB}', 'C3 persistence probe B ${suffix}', 1, CURRENT_TIMESTAMP);
  INSERT INTO billing_account (id, organisation_id, currency, created_at, updated_at)
  VALUES
    ('${accountA}', '${organisationA}', 'AUD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('${accountB}', '${organisationB}', 'AUD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO purchase_order
    (id, organisation_id, billing_account_id, customer_reference, status,
    authorised_amount, currency, valid_from, valid_until, created_at, updated_at)
  VALUES ('${poA}', '${organisationA}', '${accountA}', 'PO-PROBE', 'AUTHORISED',
          11000, 'AUD', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO payment_method (id, organisation_id, billing_account_id, type, created_at, updated_at)
  VALUES
    ('${methodA}', '${organisationA}', '${accountA}', 'MANUAL_BANK_TRANSFER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('${methodB}', '${organisationB}', '${accountB}', 'MANUAL_BANK_TRANSFER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO invoice
    (id, organisation_id, billing_account_id, status, currency, invoice_number,
     customer_reference, purchase_order_id, subtotal_minor, tax_minor, total_minor,
     issued_at, due_at, status_changed_at, updated_at)
  VALUES ('${invoiceA}', '${organisationA}', '${accountA}', 'DRAFT', 'AUD',
          NULL, 'CUSTOMER-PROBE', '${poA}', 10000, 1000, 11000,
          NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO invoice_line_item
    (id, organisation_id, invoice_id, description, currency, quantity,
     unit_amount_minor, tax_rate_basis_points, subtotal_minor, tax_minor, total_minor)
  VALUES ('${lineA}', '${organisationA}', '${invoiceA}', 'Probe line', 'AUD',
          1, 10000, 1000, 10000, 1000, 11000);
  INSERT INTO invoice_remittance_snapshot
    (id, organisation_id, invoice_id, account_name, routing_identifier, account_number, captured_at)
  VALUES ('${remittanceA}', '${organisationA}', '${invoiceA}', 'Synthetic Supplier',
          'SYNTHETIC-BSB-123', 'SYNTHETIC-ACCOUNT-456', CURRENT_TIMESTAMP);
  UPDATE invoice
  SET status = 'OPEN', invoice_number = 'INV-PROBE-${suffix}', issued_at = CURRENT_TIMESTAMP,
      due_at = CURRENT_TIMESTAMP + INTERVAL '30 days', status_changed_at = CURRENT_TIMESTAMP,
      supplier_legal_name_snapshot = 'Synthetic Supplier', supplier_address_snapshot = '1 Test Lane',
      supplier_billing_email_snapshot = 'supplier@example.invalid',
      customer_legal_name_snapshot = 'Synthetic Customer', customer_address_snapshot = '2 Test Lane'
  WHERE id = '${invoiceA}';
  INSERT INTO payment
    (id, organisation_id, billing_account_id, invoice_id, payment_method_id,
    method, source_reference, settlement_idempotency_key, amount_minor, currency, received_at, updated_at)
  VALUES ('${paymentA}', '${organisationA}', '${accountA}', '${invoiceA}', '${methodA}',
          'MANUAL_BANK_TRANSFER', 'source-${suffix}', '${paymentA}', 11000, 'AUD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
`);

expectRejected(
  'invalid invoice currency',
  `
  INSERT INTO invoice (id, organisation_id, billing_account_id, status, currency,
    subtotal_minor, tax_minor, total_minor, status_changed_at, updated_at)
  VALUES ('${invoiceB}', '${organisationA}', '${accountA}', 'DRAFT', 'aud', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`,
);

sql(`
  INSERT INTO invoice
    (id, organisation_id, billing_account_id, status, currency, subtotal_minor, tax_minor, total_minor, status_changed_at, updated_at)
  VALUES ('${invoiceC}', '${organisationA}', '${accountA}', 'DRAFT', 'AUD', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
`);
expectRejected(
  'issued invoice without remittance snapshot',
  `UPDATE invoice SET status = 'OPEN', invoice_number = 'INV-MISSING-${suffix}', issued_at = CURRENT_TIMESTAMP,
    due_at = CURRENT_TIMESTAMP + INTERVAL '30 days', supplier_legal_name_snapshot = 'Synthetic Supplier',
    supplier_address_snapshot = '1 Test Lane', supplier_billing_email_snapshot = 'supplier@example.invalid',
    customer_legal_name_snapshot = 'Synthetic Customer', customer_address_snapshot = '2 Test Lane'
    WHERE id = '${invoiceC}'`,
);

sql(`
  INSERT INTO invoice
    (id, organisation_id, billing_account_id, status, currency, subtotal_minor, tax_minor, total_minor, status_changed_at, updated_at)
  VALUES ('${invoiceE}', '${organisationA}', '${accountA}', 'DRAFT', 'AUD', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
`);
expectRejected(
  'issued invoice without any snapshots',
  `UPDATE invoice SET status = 'OPEN', invoice_number = 'INV-NO-SNAPSHOTS-${suffix}', issued_at = CURRENT_TIMESTAMP,
    due_at = CURRENT_TIMESTAMP + INTERVAL '30 days'
    WHERE id = '${invoiceE}'`,
);

sql(`
  INSERT INTO invoice
    (id, organisation_id, billing_account_id, status, currency, subtotal_minor, tax_minor, total_minor, status_changed_at, updated_at)
  VALUES ('${invoiceD}', '${organisationA}', '${accountA}', 'DRAFT', 'AUD', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  INSERT INTO invoice_remittance_snapshot
    (id, organisation_id, invoice_id, account_name, routing_identifier, account_number)
  VALUES ('${remittanceA.replace('aaba', 'aabc')}', '${organisationA}', '${invoiceD}', 'Synthetic Supplier',
          'SYNTHETIC-BSB-123', 'SYNTHETIC-ACCOUNT-456');
`);
expectRejected(
  'issued invoice with incomplete snapshots',
  `UPDATE invoice SET status = 'OPEN', invoice_number = 'INV-INCOMPLETE-${suffix}', issued_at = CURRENT_TIMESTAMP,
    due_at = CURRENT_TIMESTAMP + INTERVAL '30 days', supplier_legal_name_snapshot = 'Synthetic Supplier',
    supplier_address_snapshot = '1 Test Lane', supplier_billing_email_snapshot = 'supplier@example.invalid'
    WHERE id = '${invoiceD}'`,
);

sql(
  `UPDATE invoice SET status = 'VOID', status_reason = 'Persistence probe' WHERE id = '${invoiceA}'`,
);

expectRejected(
  'invalid invoice totals',
  `
  INSERT INTO invoice (id, organisation_id, billing_account_id, status, currency,
    subtotal_minor, tax_minor, total_minor, status_changed_at, updated_at)
  VALUES ('${invoiceB}', '${organisationA}', '${accountA}', 'DRAFT', 'AUD', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`,
);

expectRejected(
  'invalid invoice status',
  `
  INSERT INTO invoice (id, organisation_id, billing_account_id, status, currency,
    subtotal_minor, tax_minor, total_minor, status_changed_at, updated_at)
  VALUES ('${invoiceB}', '${organisationA}', '${accountA}', 'UNKNOWN', 'AUD', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`,
);

expectRejected(
  'cross-tenant billing account on invoice',
  `
  INSERT INTO invoice (id, organisation_id, billing_account_id, status, currency,
    subtotal_minor, tax_minor, total_minor, status_changed_at, updated_at)
  VALUES ('${invoiceB}', '${organisationA}', '${accountB}', 'DRAFT', 'AUD', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`,
);

expectRejected(
  'cross-tenant purchase order/account',
  `
  INSERT INTO purchase_order (id, organisation_id, billing_account_id, customer_reference,
    status, authorised_amount, currency, valid_from, updated_at)
  VALUES ('${invoiceB}', '${organisationA}', '${accountB}', 'PO-BAD', 'DRAFT', 1, 'AUD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`,
);

expectRejected(
  'cross-tenant payment method/account',
  `
  INSERT INTO payment_method (id, organisation_id, billing_account_id, type, updated_at)
  VALUES ('${invoiceB}', '${organisationA}', '${accountB}', 'MANUAL_BANK_TRANSFER', CURRENT_TIMESTAMP)
`,
);

expectRejected(
  'invalid line quantity and arithmetic',
  `
  INSERT INTO invoice_line_item (id, organisation_id, invoice_id, description, currency, quantity,
    unit_amount_minor, tax_rate_basis_points, subtotal_minor, tax_minor, total_minor)
  VALUES ('${invoiceB}', '${organisationA}', '${invoiceA}', 'Bad line', 'AUD', 0, 1, 0, 0, 0, 0)
`,
);

expectRejected(
  'cross-tenant payment/invoice',
  `
  INSERT INTO payment (id, organisation_id, billing_account_id, invoice_id, payment_method_id,
    method, source_reference, settlement_idempotency_key, amount_minor, currency, received_at, updated_at)
  VALUES ('${invoiceB}', '${organisationB}', '${accountB}', '${invoiceA}', '${methodB}',
    'MANUAL_BANK_TRANSFER', 'wrong-invoice-${suffix}', '${invoiceB}', 11000, 'AUD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`,
);

expectRejected(
  'duplicate payment evidence identity',
  `
  INSERT INTO payment (id, organisation_id, billing_account_id, invoice_id, payment_method_id,
    method, source_reference, settlement_idempotency_key, amount_minor, currency, received_at, updated_at)
  VALUES ('${invoiceB}', '${organisationA}', '${accountA}', '${invoiceA}', '${methodA}',
    'MANUAL_BANK_TRANSFER', 'source-${suffix}', '${invoiceB}', 11000, 'AUD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`,
);

expectRejected(
  'issued invoice meaning mutation',
  `UPDATE invoice SET total_minor = 12000 WHERE id = '${invoiceA}'`,
);
expectRejected(
  'issued invoice snapshot mutation',
  `UPDATE invoice SET supplier_legal_name_snapshot = 'Changed' WHERE id = '${invoiceA}'`,
);
expectRejected(
  'remittance snapshot mutation',
  `UPDATE invoice_remittance_snapshot SET account_number = 'Changed' WHERE invoice_id = '${invoiceA}'`,
);
expectRejected(
  'remittance snapshot deletion',
  `DELETE FROM invoice_remittance_snapshot WHERE invoice_id = '${invoiceA}'`,
);
expectRejected(
  'late remittance snapshot insertion',
  `INSERT INTO invoice_remittance_snapshot
    (id, organisation_id, invoice_id, account_name, routing_identifier, account_number)
   VALUES ('${remittanceA.replace('aaba', 'aabb')}', '${organisationA}', '${invoiceA}', 'Late', 'Late', 'Late')`,
);
expectRejected(
  'issued invoice line mutation',
  `UPDATE invoice_line_item SET total_minor = 12000 WHERE id = '${lineA}'`,
);
expectRejected('issued invoice deletion', `DELETE FROM invoice WHERE id = '${invoiceA}'`);
expectRejected('referenced PO deletion', `DELETE FROM purchase_order WHERE id = '${poA}'`);

const allocations = await Promise.all(
  [1, 2].map(() =>
    execFileAsync('psql', [
      '--dbname',
      databaseUrl.toString(),
      '-v',
      'ON_ERROR_STOP=1',
      '-Atqc',
      `SELECT "allocate_invoice_number"('${organisationA}')`,
    ]).then(({ stdout }) => stdout.trim()),
  ),
);
if (allocations.length !== 2 || allocations[0] === allocations[1]) {
  throw new Error(`concurrent invoice allocation duplicated: ${allocations.join(', ')}`);
}

const allocationValues = allocations.map((value) => Number(value.replace('INV-', ''))).sort();
if (allocationValues[1] !== allocationValues[0] + 1) {
  throw new Error(`invoice allocation was not sequential: ${allocations.join(', ')}`);
}

sql(`DROP TABLE payment CASCADE; DROP TABLE invoice_line_item CASCADE; DROP TABLE invoice CASCADE;
     DROP TABLE payment_method CASCADE; DROP TABLE purchase_order CASCADE;
     DROP TABLE invoice_number_counter CASCADE;`);
console.log(`commercial persistence probes passed (${allocations.join(', ')})`);
