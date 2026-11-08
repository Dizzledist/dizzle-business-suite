import type { DatabaseSync } from 'node:sqlite';
import type { InvoiceLine, LineSnapshotState, StoredInvoiceLine } from '../../../shared/reporting';
import type { ZohoInvoice } from '../zoho/invoice';
import { decimalAmount, exactInstant, moneyUnits, type RecognitionEvidence } from './model';

export function saveInvoiceDetails(
  db: DatabaseSync, invoice: ZohoInvoice, evidence: RecognitionEvidence, verified: boolean, now: number,
) {
  const keys = [invoice.organizationId, invoice.invoiceId] as const;
  db.prepare(`UPDATE reporting_invoices SET invoice_date = ?, payment_made = ?, source_total = ?
    WHERE organization_id = ? AND invoice_id = ?`).run(
    invoice.invoiceDate, invoice.paymentMade, invoice.total, ...keys,
  );
  const lines = invoice.lineItems;
  const difference = lines == null ? null : subtotalDifference(invoice, lines);
  const state: LineSnapshotState = lines === undefined ? 'unavailable' : lines === null ? 'invalid'
    : difference === 0n ? 'reconciled' : 'difference';
  db.prepare(`UPDATE reporting_invoices SET line_state = ?, subtotal_difference = ?,
    invoice_discount = ?, invoice_adjustment = ?, shipping_charge = ?
    WHERE organization_id = ? AND invoice_id = ?`).run(
    state, difference === null ? null : decimalAmount(difference), invoice.invoiceDiscount ?? null,
    invoice.invoiceAdjustment ?? null, invoice.shippingCharge ?? null, ...keys,
  );
  if (lines == null) return;
  const snapshotLines = lines;

  db.prepare(`DELETE FROM reporting_invoice_lines WHERE organization_id = ? AND invoice_id = ?
    AND snapshot = 'current'`).run(...keys);
  const insert = db.prepare(`INSERT INTO reporting_invoice_lines (
    organization_id, invoice_id, snapshot, position, line_id, product_id, sku, line_data, source_revision, synchronized_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  function save(snapshot: 'current' | 'recognized') {
    snapshotLines.forEach((line, position) => insert.run(
      ...keys, snapshot, position, line.lineId, line.productId, line.sku,
      JSON.stringify(line), invoice.sourceModifiedAt, now,
    ));
  }
  save('current');

  // A matching subtotal alone cannot establish what was sold at the first send.
  if (state !== 'reconciled' || !verified || evidence.status !== 'verified' || !evidence.originalLineRevision) return;
  const originalRevisionAt = exactInstant(evidence.originalLineRevision);
  if (originalRevisionAt === null || originalRevisionAt > exactInstant(evidence.firstEmailAt)! ||
      invoice.sourceModifiedAt !== evidence.originalLineRevision || moneyUnits(invoice.subtotal) !== moneyUnits(evidence.subtotal)) return;
  const discount = invoice.discountType === 'entity_level' ? invoice.invoiceDiscount! : '0';
  const claimed = db.prepare(`UPDATE reporting_invoices SET recognized_line_revision = ?, recognized_invoice_discount = ?,
    recognized_customer_id = ?, recognized_customer_name = ?
    WHERE organization_id = ? AND invoice_id = ? AND recognized_line_revision IS NULL`).run(
    evidence.originalLineRevision, decimalAmount(moneyUnits(discount)), invoice.customerId, invoice.customerName, ...keys,
  );
  if (claimed.changes === 1) save('recognized');
}

function subtotalDifference(invoice: ZohoInvoice, lines: readonly InvoiceLine[]) {
  // item_total is the provider's line amount. Do not recalculate rounding, tax,
  // item-level discounts, shipping or total-level adjustments from their labels.
  const sum = lines.reduce((total, line) => total + moneyUnits(line.amount), 0n);
  if (invoice.inclusiveTax !== false || !['item_level', 'entity_level'].includes(invoice.discountType ?? '')) return null;
  if (invoice.discountType === 'entity_level' && invoice.invoiceDiscount == null) return null;
  const invoiceDiscount = invoice.discountType === 'entity_level' ? moneyUnits(invoice.invoiceDiscount!) : 0n;
  return moneyUnits(invoice.subtotal) - (sum - invoiceDiscount);
}

export function currentInvoiceLines(db: DatabaseSync, organization: string, invoiceId: string): StoredInvoiceLine[] {
  const rows = db.prepare(`SELECT line_data, source_revision, synchronized_at
    FROM reporting_invoice_lines WHERE organization_id = ? AND invoice_id = ? AND snapshot = 'current'
    ORDER BY position`).all(organization, invoiceId);
  return rows.map(row => ({
    ...JSON.parse(String(row.line_data)) as InvoiceLine,
    sourceRevision: row.source_revision === null ? null : String(row.source_revision),
    synchronizedAt: new Date(Number(row.synchronized_at)).toISOString(),
  }));
}
