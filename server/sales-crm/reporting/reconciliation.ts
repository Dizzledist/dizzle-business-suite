import type { DatabaseSync } from 'node:sqlite';
import { parseRange, type CurrencyTotal } from '../../../shared/reporting';
import type { ReconciliationInvoice, ReconciliationReport, VerificationState, RevenueReview } from '../../../shared/reconciliation';
import { ApiError } from '../../workflow';
import { transaction } from '../../sqlite';
import type { ZohoInvoice } from '../zoho/invoice';
import type { SyntheticReporting } from './demo';
import { legacyReview } from './evidence';
import { decimalAmount, demoOrganization, exactInstant, moneyUnits, type RecognitionEvidence } from './model';

type Row = {
  invoice_id: string; invoice_number: string; created_at: string | null; invoice_date: string | null; currency: string;
  first_email_at: number | null; amount: string | null; subtotal: string; balance: string; source_total: string | null;
  source_salesperson_id: string | null; evidence_salesperson_id: string | null;
  credited_user_id: string | null; credited_name: string | null;
  verification: VerificationState; review_reason: string | null; payment: string; invoice_status: string;
  send_evidence: string | null; amount_evidence: string | null;
  send_verification: VerificationState; amount_verification: VerificationState;
  evidence_id: string | null; evidence_source: string | null; current_snapshot: string | null;
  recognized_line_revision: string | null;
};

// Adapted from Management lib/invoice-filters.ts and lib/sync-policy.ts at f8da43c.
// The reference includes non-void emailed drafts and uses the current invoice date.
export function managementQualifies(source: ZohoInvoice, start: string, end: string, today: string, cutoff: string) {
  return source.emailed === true && source.status !== 'void' && source.invoiceDate !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(source.invoiceDate) && source.invoiceDate >= cutoff &&
    source.invoiceDate <= today && source.invoiceDate >= start && source.invoiceDate <= end;
}

function storedReview(row: Row): RevenueReview {
  if (row.send_evidence && row.amount_evidence) {
    return { send: JSON.parse(row.send_evidence), amount: JSON.parse(row.amount_evidence) };
  }
  const input: RecognitionEvidence = row.first_email_at !== null && row.amount !== null && row.evidence_id && row.evidence_source
    ? { status: 'verified', firstEmailAt: new Date(row.first_email_at).toISOString(), subtotal: decimalAmount(BigInt(row.amount)),
      id: row.evidence_id, source: row.evidence_source, salespersonId: row.evidence_salesperson_id, currency: row.currency }
    : { status: row.verification === 'verified' ? 'pending' : row.verification };
  return legacyReview(input, null);
}

function project(row: Row, reporting: SyntheticReporting, range: ReturnType<SyntheticReporting['calendar']['resolve']>) {
  if (!row.current_snapshot) return null;
  const source = JSON.parse(row.current_snapshot) as ZohoInvoice;
  if (source.organizationId !== demoOrganization || source.invoiceId !== row.invoice_id) return null;
  const { calendar, now, coverageFrom } = reporting;
  const review = storedReview(row);
  const date = row.invoice_date;
  const firstAt = row.first_email_at;
  const candidate = exactInstant(review.send.value);
  const inWindow = (at: number | null) => at !== null && at >= range.selected.from && at < range.selected.until && at <= now();
  const dateInWindow = date !== null && date >= range.selected.start && date <= range.selected.end;
  if (!dateInWindow && !inWindow(firstAt) && !inWindow(candidate)) return null;

  const managementIncluded = managementQualifies(source, range.selected.start, range.selected.end,
    calendar.localDate(now()), reporting.coverageStart);
  const crmIncluded = inWindow(firstAt) && firstAt! >= coverageFrom && row.verification === 'verified' &&
    row.send_verification === 'verified' && row.amount_verification === 'verified' &&
    row.amount !== null && row.credited_user_id !== null && row.review_reason === null;
  const original = row.amount === null ? null : decimalAmount(BigInt(row.amount));
  const reasons: ReconciliationInvoice['reasons'] = [];
  const localEmail = firstAt === null ? null : calendar.localDate(firstAt);
  if (localEmail && date && date !== localEmail) reasons.push('different-reporting-date');
  if (original !== null && source.total && moneyUnits(source.total) !== moneyUnits(original)) reasons.push('subtotal-versus-total');
  if (row.send_verification !== 'verified') reasons.push('unverified-email');
  if (row.amount_verification !== 'verified') reasons.push('missing-original-amount');
  if (['unpaid', 'partial'].includes(row.payment)) reasons.push('unpaid-or-partial');
  if (source.status === 'draft' || source.emailed === false) reasons.push('draft-or-never-emailed');
  if (['void', 'voided', 'cancelled', 'canceled'].includes(source.status)) reasons.push('void-or-cancellation');
  if (row.payment === 'review') reasons.push('settlement-review');
  if (row.verification === 'conflicting' || review.send.status === 'conflicting' || review.amount.status === 'conflicting') {
    reasons.push('conflicting-evidence');
  }
  // A source modification timestamp can reflect payments. A changed subtotal is
  // direct evidence that the current financial value differs from the saved one.
  if (original !== null && moneyUnits(original) !== moneyUnits(source.subtotal) &&
      firstAt !== null && (exactInstant(source.sourceModifiedAt) ?? 0) > firstAt) reasons.push('edited-after-send');
  if (row.evidence_salesperson_id && row.source_salesperson_id &&
      row.evidence_salesperson_id !== row.source_salesperson_id) reasons.push('salesperson-difference');
  if ((source.shippingCharge && moneyUnits(source.shippingCharge) !== 0n) ||
      source.lineItems?.some(line => line.taxAmount && moneyUnits(line.taxAmount) !== 0n)) reasons.push('tax-or-shipping');
  if ((source.invoiceDiscount && moneyUnits(source.invoiceDiscount) !== 0n) ||
      (source.invoiceAdjustment && moneyUnits(source.invoiceAdjustment) !== 0n)) reasons.push('discount-or-adjustment');
  if (!row.recognized_line_revision) reasons.push('missing-original-lines');

  return {
    id: row.invoice_id, number: row.invoice_number, createdAt: row.created_at, invoiceDate: date,
    firstEmailAt: firstAt === null ? null : new Date(firstAt).toISOString(),
    firstEmailCandidate: review.send.value, currency: row.currency, currentCurrency: source.currency,
    currentSubtotal: decimalAmount(BigInt(row.subtotal)), originalSubtotal: original, currentTotal: row.source_total,
    balance: decimalAmount(BigInt(row.balance)), payment: row.payment, currentStatus: row.invoice_status,
    currentSalesperson: source.sourceSalespersonName ?? row.source_salesperson_id,
    originalSalesperson: row.credited_name ?? row.evidence_salesperson_id,
    managementPeriod: date?.slice(0, 7) ?? null, crmPeriod: localEmail?.slice(0, 7) ?? null,
    managementIncluded, crmIncluded, managementRevenue: managementIncluded ? source.total : '0.00',
    crmRevenue: crmIncluded ? original! : '0.00',
    sendEvidence: review.send, amountEvidence: review.amount,
    verification: row.verification === 'conflicting' || reasons.includes('conflicting-evidence') ? 'conflicting'
      : row.send_verification !== 'verified' ? row.send_verification
      : row.amount_verification !== 'verified' ? row.amount_verification : row.verification,
    originalLinesAvailable: row.recognized_line_revision !== null, reasons,
  } satisfies ReconciliationInvoice;
}

function totals(invoices: readonly ReconciliationInvoice[], method: 'management' | 'crm'): CurrencyTotal[] {
  const values = new Map<string, { amount: bigint; count: number }>();
  for (const invoice of invoices) {
    const included = method === 'management' ? invoice.managementIncluded : invoice.crmIncluded;
    if (!included) continue;
    const currency = method === 'management' ? invoice.currentCurrency : invoice.currency;
    const value = values.get(currency) ?? { amount: 0n, count: 0 };
    value.amount += moneyUnits(method === 'management' ? invoice.managementRevenue : invoice.crmRevenue);
    value.count++;
    values.set(currency, value);
  }
  return [...values].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => ({
    currency, subtotal: decimalAmount(value.amount), count: value.count,
  }));
}

export function getReconciliation(url: URL, reporting: SyntheticReporting | undefined, organizationId: string): ReconciliationReport {
  if (organizationId !== demoOrganization) throw new ApiError(403, 'Synthetic reconciliation is unavailable for this tenant.');
  if (!reporting) throw new ApiError(503, 'Synthetic reporting is unavailable.');
  const allowed = new Set(['preset', 'start', 'end', 'page']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) throw new ApiError(400, 'Invalid reconciliation query.');
  }
  const pageValue = url.searchParams.get('page') ?? '1';
  if (!/^[1-9]\d{0,4}$/.test(pageValue)) throw new ApiError(400, 'Invalid reconciliation page.');
  let selected;
  try { selected = parseRange(url.searchParams); } catch { throw new ApiError(400, 'Invalid reconciliation date range.'); }
  return transaction(reporting.db, () => reconcile(reporting.db, reporting, selected, Number(pageValue)), 'read');
}

function reconcile(
  db: DatabaseSync, reporting: SyntheticReporting, selection: Parameters<SyntheticReporting['calendar']['resolve']>[0], requestedPage: number,
): ReconciliationReport {
  const range = reporting.calendar.resolve(selection, reporting.now());
  const rows = db.prepare(`SELECT *, CAST(recognized_subtotal AS TEXT) AS amount, CAST(subtotal AS TEXT) AS subtotal,
    CAST(open_balance AS TEXT) AS balance FROM reporting_invoices WHERE organization_id = ? ORDER BY invoice_id`)
    .all(demoOrganization) as Row[];
  const invoices = rows.map(row => project(row, reporting, range)).filter(row => row !== null);
  const management = totals(invoices, 'management');
  const crm = totals(invoices, 'crm');
  const currencies = new Set([...management, ...crm].map(value => value.currency));
  const differences = [...currencies].sort().map(currency => ({
    currency, amount: decimalAmount(
      moneyUnits(management.find(value => value.currency === currency)?.subtotal ?? '0') -
      moneyUnits(crm.find(value => value.currency === currency)?.subtotal ?? '0'),
    ),
  }));
  const pageSize = 20;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(invoices.length / pageSize)));
  return {
    source: 'synthetic', range, coverageStart: reporting.coverageStart,
    coverageIncomplete: range.selected.from < reporting.coverageFrom,
    management, crm, differences, invoices: invoices.slice((page - 1) * pageSize, page * pageSize),
    count: invoices.length, page, pageSize,
  };
}
