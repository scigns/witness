/**
 * Rendered HTML for a customer-facing invoice or receipt (Phase 5,
 * Workstream 2.2). Both share one small template helper and Witness's own
 * brand tokens (`apps/web/src/app/globals.css`'s `:root` values, inlined —
 * this document is served standalone, often downloaded or emailed, so it
 * carries its own styling rather than depending on the app's stylesheet).
 * Headings use the brand's editorial serif family's own fallback (Georgia)
 * rather than embedding a webfont: this is a document meant to print,
 * archive and forward cleanly, where portability matters more than an
 * exact type match to the marketing site.
 *
 * A receipt is not "the invoice again" — the one disclosure that must
 * differ is the closing line: an invoice's remittance section explicitly
 * says payment instructions are not confirmation (entitlements remain
 * unchanged until verification); a receipt is issued only after that
 * verification already happened (`createReceipt`'s own invariant), so its
 * equivalent line inverts that disclaimer into a statement of fact.
 */

import {
  INVOICE_CURRENCY_EXPONENTS,
  type InvoiceRenderView,
  type ReceiptRenderView,
} from '@witness/contracts';

const INK = '#1b1917';
const INK_MUTED = '#46423d';
const PAPER = '#f5f2ed';
const PAPER_RAISED = '#fffdf9';
const LINE = '#dcd6cc';
const ACCENT = '#1b1917';
const ACCENT_CONTRAST = '#f5f2ed';

const BASE_STYLE = `
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,system-ui,sans-serif;font-size:16px;line-height:1.5;max-width:720px;margin:2.5rem auto;padding:0 1.5rem;color:${INK};background:${PAPER}}
  h1,h2{font-family:Georgia,'Times New Roman',serif;font-weight:600;letter-spacing:-0.01em}
  h1{font-size:1.75rem;margin:0 0 .25rem}
  h2{font-size:1rem;text-transform:uppercase;letter-spacing:.06em;color:${INK_MUTED};margin:0 0 .5rem}
  header{border-bottom:2px solid ${INK};padding-bottom:1rem;margin-bottom:1.5rem;display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;flex-wrap:wrap}
  .meta{color:${INK_MUTED};font-size:.9rem}
  section{background:${PAPER_RAISED};border:1px solid ${LINE};border-radius:4px;padding:1.25rem;margin-bottom:1.25rem}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;border-bottom:1px solid ${LINE};padding:.5rem 0;font-size:.95rem}
  th{color:${INK_MUTED};font-weight:500;text-transform:uppercase;font-size:.75rem;letter-spacing:.04em}
  .totals{margin-left:auto;max-width:280px}
  .totals p{display:flex;justify-content:space-between;margin:.25rem 0;color:${INK_MUTED}}
  .totals .grand{color:${INK};font-weight:600;font-size:1.1rem;border-top:1px solid ${LINE};padding-top:.5rem;margin-top:.5rem}
  .badge{display:inline-block;background:${ACCENT};color:${ACCENT_CONTRAST};border-radius:4px;padding:.15rem .6rem;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em}
  .fineprint{font-size:.8rem;color:${INK_MUTED};margin-top:.75rem}
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const money = (minor: string, currency: string): string => {
  if (!Object.prototype.hasOwnProperty.call(INVOICE_CURRENCY_EXPONENTS, currency)) {
    throw new Error('Unsupported invoice currency.');
  }
  const exponent = INVOICE_CURRENCY_EXPONENTS[currency as keyof typeof INVOICE_CURRENCY_EXPONENTS];
  const value = BigInt(minor);
  if (exponent === 0) return `${currency} ${value.toString()}`;
  const scale = 10n ** BigInt(exponent);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(exponent, '0');
  return `${currency} ${whole.toString()}.${fraction}`;
};

function partyBlock(
  label: string,
  party: {
    legalName: string;
    businessIdentifier: string | null;
    address: string;
    email: string | null;
  },
): string {
  return `<div><h2>${escapeHtml(label)}</h2><p>${escapeHtml(party.legalName)}${party.businessIdentifier ? ` (${escapeHtml(party.businessIdentifier)})` : ''}<br>${escapeHtml(party.address)}${party.email ? `<br>${escapeHtml(party.email)}` : ''}</p></div>`;
}

function documentShell(title: string, badge: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${BASE_STYLE}</style></head><body>${bodyHtml}<p class="fineprint">Witness — <span class="badge">${escapeHtml(badge)}</span></p></body></html>`;
}

export function renderInvoiceHtml(invoice: InvoiceRenderView): string {
  const lines = invoice.lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.quantity)}</td><td>${money(line.unitAmountMinor, invoice.currency)}</td><td>${money(line.totalMinor, invoice.currency)}</td></tr>`,
    )
    .join('');
  const body = `<header><div><h1>Invoice</h1><p class="meta">${escapeHtml(invoice.invoiceNumber)} · ${escapeHtml(invoice.status)}</p></div><p class="meta">Issued ${escapeHtml(invoice.issuedAt.slice(0, 10))}<br>Due ${escapeHtml(invoice.dueAt.slice(0, 10))}</p></header><section><div class="grid">${partyBlock('Supplier', invoice.supplier)}${partyBlock('Customer', invoice.customer)}</div></section><section><h2>Procurement</h2><p>${invoice.purchaseOrderId ? `PO ${escapeHtml(invoice.purchaseOrderId)}` : 'No purchase order recorded'}${invoice.customerReference ? ` · ${escapeHtml(invoice.customerReference)}` : ''}</p></section><section><table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${lines}</tbody></table><div class="totals"><p><span>Subtotal</span><span>${money(invoice.subtotalMinor, invoice.currency)}</span></p><p><span>Tax</span><span>${money(invoice.taxMinor, invoice.currency)}</span></p><p class="grand"><span>Total</span><span>${money(invoice.totalMinor, invoice.currency)}</span></p></div></section><section><h2>Remittance</h2><p>Account name: ${escapeHtml(invoice.remittance.accountName)}<br>Routing: ${escapeHtml(invoice.remittance.routingIdentifier)}<br>Account: ${escapeHtml(invoice.remittance.accountNumber)}${invoice.remittance.paymentInstructions ? `<br>${escapeHtml(invoice.remittance.paymentInstructions)}` : ''}</p><p class="fineprint">Payment instructions are not payment confirmation. Entitlements remain unchanged until later verification and reconciliation.</p></section>`;
  return documentShell(invoice.invoiceNumber, invoice.status, body);
}

export function renderReceiptHtml(receipt: ReceiptRenderView): string {
  const body = `<header><div><h1>Receipt</h1><p class="meta">${escapeHtml(receipt.receiptNumber)}</p></div><p class="meta">Issued ${escapeHtml(receipt.issuedAt.slice(0, 10))}<br>For invoice ${escapeHtml(receipt.invoiceNumber)}</p></header><section><div class="grid">${partyBlock('Supplier', receipt.supplier)}${partyBlock('Customer', receipt.customer)}</div></section><section><h2>Settlement</h2><table><tbody><tr><td>Method</td><td>${escapeHtml(receipt.paymentMethod)}</td></tr><tr><td>Reference</td><td>${escapeHtml(receipt.sourceReference)}</td></tr></tbody></table><div class="totals"><p class="grand"><span>Amount received</span><span>${money(receipt.amountMinor, receipt.currency)}</span></p></div><p class="fineprint">This receipt confirms the payment above was received and verified against invoice ${escapeHtml(receipt.invoiceNumber)}. It is proof of settlement, not an estimate or a pending instruction.</p></section>`;
  return documentShell(receipt.receiptNumber, 'Paid', body);
}
