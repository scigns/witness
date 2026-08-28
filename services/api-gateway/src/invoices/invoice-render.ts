import type { InvoiceRenderView } from '@witness/contracts';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const money = (minor: string, currency: string): string =>
  `${currency} ${(BigInt(minor) / 100n).toString()}.${(BigInt(minor) % 100n).toString().padStart(2, '0')}`;

export function renderInvoiceHtml(invoice: InvoiceRenderView): string {
  const lines = invoice.lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.quantity)}</td><td>${money(line.unitAmountMinor, invoice.currency)}</td><td>${money(line.totalMinor, invoice.currency)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoiceNumber)}</title><style>body{font:16px system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;color:#18222b}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #ccd;padding:.5rem}.totals{margin-left:auto;max-width:320px}.remittance{border:1px solid #ccd;padding:1rem;margin-top:2rem}</style></head><body><header><h1>INVOICE</h1><p>${escapeHtml(invoice.invoiceNumber)} · ${escapeHtml(invoice.status)}</p><p>Issued ${escapeHtml(invoice.issuedAt.slice(0, 10))} · Due ${escapeHtml(invoice.dueAt.slice(0, 10))}</p></header><section><h2>Supplier</h2><p>${escapeHtml(invoice.supplier.legalName)}${invoice.supplier.businessIdentifier ? ` (${escapeHtml(invoice.supplier.businessIdentifier)})` : ''}<br>${escapeHtml(invoice.supplier.address)}<br>${escapeHtml(invoice.supplier.email)}</p><h2>Customer</h2><p>${escapeHtml(invoice.customer.legalName)}${invoice.customer.businessIdentifier ? ` (${escapeHtml(invoice.customer.businessIdentifier)})` : ''}<br>${escapeHtml(invoice.customer.address)}${invoice.customer.email ? `<br>${escapeHtml(invoice.customer.email)}` : ''}</p></section><section><h2>Procurement</h2><p>${invoice.purchaseOrderId ? `PO ${escapeHtml(invoice.purchaseOrderId)}` : 'No purchase order recorded'}${invoice.customerReference ? ` · ${escapeHtml(invoice.customerReference)}` : ''}</p></section><table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${lines}</tbody></table><div class="totals"><p>Subtotal: ${money(invoice.subtotalMinor, invoice.currency)}</p><p>Tax: ${money(invoice.taxMinor, invoice.currency)}</p><h2>Total: ${money(invoice.totalMinor, invoice.currency)}</h2></div><section class="remittance"><h2>Remittance</h2><p>Account name: ${escapeHtml(invoice.remittance.accountName)}<br>Routing: ${escapeHtml(invoice.remittance.routingIdentifier)}<br>Account: ${escapeHtml(invoice.remittance.accountNumber)}${invoice.remittance.paymentInstructions ? `<br>${escapeHtml(invoice.remittance.paymentInstructions)}` : ''}</p><p>Payment instructions are not payment confirmation. Entitlements remain unchanged until later verification and reconciliation.</p></section></body></html>`;
}
