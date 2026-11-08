import type { DatabaseSync } from 'node:sqlite';
import { openSqliteDatabase } from '../../sqlite';
import type { ZohoInvoice } from '../zoho/invoice';
import { exactInstant, moneyUnits, settlement, type RecognitionEvidence } from './model';

export { transaction } from '../../sqlite';

export function openReportingDatabase(path: string) {
  return openSqliteDatabase(path, [new URL('./migrations/001-invoice-reporting.sql', import.meta.url)]);
}

export function saveSalesperson(db: DatabaseSync, organization: string, source: string, user: string, name: string) {
  db.prepare(`INSERT INTO reporting_salespeople VALUES (?, ?, ?, ?)
    ON CONFLICT (organization_id, source_salesperson_id) DO UPDATE SET
    crm_user_id = excluded.crm_user_id, display_name = excluded.display_name`).run(organization, source, user, name);
}

// Called inside the same transaction as the durable queue acknowledgement.
export function upsertInvoice(db: DatabaseSync, invoice: ZohoInvoice, evidence: RecognitionEvidence, now: number) {
  const { organizationId, invoiceId } = invoice;
  const existing = db.prepare(`SELECT first_email_at, evidence_source, evidence_id, evidence_salesperson_id, verification, currency,
    CAST(recognized_subtotal AS TEXT) AS recognized_subtotal, credited_user_id, credited_name, source_modified_at
    FROM reporting_invoices WHERE organization_id = ? AND invoice_id = ?`).get(organizationId, invoiceId);
  const sourceModified = exactInstant(invoice.sourceModifiedAt);
  if (typeof existing?.source_modified_at === 'number' &&
      (sourceModified === null || sourceModified < existing.source_modified_at)) return;

  const sourceSubtotal = moneyUnits(invoice.subtotal);
  const payment = settlement(invoice);
  let verifiedAt: number | null = null;
  let creditedId: string | null = null;
  let creditedName: string | null = null;
  let evidenceSource: string | null = null;
  let evidenceId: string | null = null;
  let evidenceSalesperson: string | null = null;
  let recognizedSubtotal: bigint | null = null;
  let currency = invoice.currency;
  let verification: RecognitionEvidence['status'] = evidence.status;

  if (evidence.status === 'verified') {
    const at = exactInstant(evidence.firstEmailAt);
    const created = exactInstant(invoice.createdAt);
    if (at === null || at > now || (created !== null && at < created) || !evidence.id.trim() ||
        !evidence.source.trim() || evidence.currency !== invoice.currency || invoice.emailed !== true ||
        invoice.status === 'draft') {
      verification = 'conflicting';
    } else {
      verifiedAt = at;
      evidenceSource = evidence.source;
      evidenceId = evidence.id;
      evidenceSalesperson = evidence.salespersonId;
      recognizedSubtotal = moneyUnits(evidence.subtotal);
      if (recognizedSubtotal < 0n) verification = 'conflicting';
      const mapping = db.prepare(`SELECT crm_user_id, display_name FROM reporting_salespeople
        WHERE organization_id = ? AND source_salesperson_id = ?`).get(organizationId, evidence.salespersonId);
      creditedId = mapping ? String(mapping.crm_user_id) : null;
      creditedName = mapping ? String(mapping.display_name) : null;
    }
  }

  if (existing?.first_email_at != null) {
    if (existing.verification === 'conflicting' || verification === 'conflicting' || existing.currency !== invoice.currency ||
        (verification === 'verified' && (verifiedAt !== existing.first_email_at ||
          recognizedSubtotal?.toString() !== existing.recognized_subtotal ||
          evidenceId !== existing.evidence_id || evidenceSource !== existing.evidence_source ||
          evidenceSalesperson !== existing.evidence_salesperson_id))) {
      verification = 'conflicting';
    } else {
      verification = 'verified';
    }
    verifiedAt = Number(existing.first_email_at);
    evidenceSource = String(existing.evidence_source);
    evidenceId = String(existing.evidence_id);
    evidenceSalesperson = existing.evidence_salesperson_id === null ? null : String(existing.evidence_salesperson_id);
    recognizedSubtotal = BigInt(String(existing.recognized_subtotal));
    creditedId = existing.credited_user_id === null ? null : String(existing.credited_user_id);
    creditedName = existing.credited_name === null ? null : String(existing.credited_name);
    currency = String(existing.currency);
  } else if (verification !== 'verified') {
    verifiedAt = null;
    evidenceSource = null;
    evidenceId = null;
    evidenceSalesperson = null;
    recognizedSubtotal = null;
    creditedId = null;
    creditedName = null;
  }

  const reviewReason = payment.reason ?? (verification === 'verified' && creditedId === null ? 'unmapped-salesperson' : null);
  db.prepare(`INSERT INTO reporting_invoices (
    organization_id, invoice_id, invoice_number, customer_id, customer_name, source_salesperson_id,
    credited_user_id, credited_name, currency, subtotal, recognized_subtotal, created_at, first_email_at,
    evidence_source, evidence_id, evidence_salesperson_id, verification, payment, open_balance, invoice_status, review_reason,
    source_modified_at, last_sync_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (organization_id, invoice_id) DO UPDATE SET
    invoice_number = excluded.invoice_number, customer_id = excluded.customer_id, customer_name = excluded.customer_name,
    source_salesperson_id = excluded.source_salesperson_id, credited_user_id = excluded.credited_user_id,
    credited_name = excluded.credited_name, currency = excluded.currency, subtotal = excluded.subtotal,
    recognized_subtotal = excluded.recognized_subtotal, created_at = excluded.created_at,
    first_email_at = excluded.first_email_at, evidence_source = excluded.evidence_source, evidence_id = excluded.evidence_id,
    evidence_salesperson_id = excluded.evidence_salesperson_id,
    verification = excluded.verification, payment = excluded.payment, open_balance = excluded.open_balance,
    invoice_status = excluded.invoice_status, review_reason = excluded.review_reason,
    source_modified_at = excluded.source_modified_at, last_sync_at = excluded.last_sync_at`).run(
    organizationId, invoiceId, invoice.invoiceNumber, invoice.customerId, invoice.customerName, invoice.sourceSalespersonId,
    creditedId, creditedName, currency, sourceSubtotal, recognizedSubtotal, invoice.createdAt, verifiedAt,
    evidenceSource, evidenceId, evidenceSalesperson, verification, payment.payment, moneyUnits(invoice.balance), invoice.status,
    reviewReason, sourceModified, now,
  );
}
