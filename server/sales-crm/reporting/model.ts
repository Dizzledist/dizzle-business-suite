import type { PaymentStatus } from '../../../shared/reporting';
import type { ZohoInvoice } from '../zoho/invoice';

export type RecognitionEvidence =
  | { status: 'pending' | 'unavailable' | 'conflicting' }
  | { status: 'verified'; firstEmailAt: string; source: string; id: string; subtotal: string;
      salespersonId: string | null; currency: string; originalLineRevision?: string };

export const demoOrganization = 'demo-o1';
const scale = 1_000_000n;
const maxSqlInteger = 9_223_372_036_854_775_807n;

export function moneyUnits(value: string) {
  const match = /^(-?)(\d{1,13})(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new RangeError('Unsupported monetary precision.');
  const amount = BigInt(match[2]) * scale + BigInt((match[3] ?? '').padEnd(6, '0'));
  if (amount > maxSqlInteger) throw new RangeError('Amount exceeds the reporting limit.');
  return match[1] ? -amount : amount;
}

export function decimalAmount(units: bigint) {
  const amount = units < 0n ? -units : units;
  const fraction = (amount % scale).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return (units < 0n ? '-' : '') + (amount / scale).toString() + '.' + fraction;
}

export function exactInstant(value: string | null) {
  if (!value) return null;
  const parts = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/.exec(value);
  if (!parts) return null;
  const calendar = new Date(parts[1] + 'T00:00:00Z');
  const ms = Date.parse(value);
  return Number.isFinite(ms) && !Number.isNaN(+calendar) &&
    calendar.toISOString().slice(0, 10) === parts[1] ? ms : null;
}

export function settlement(invoice: ZohoInvoice): { payment: PaymentStatus; reason: string | null } {
  const balance = moneyUnits(invoice.balance);
  const total = moneyUnits(invoice.total);
  const paid = invoice.paymentMade === null ? null : moneyUnits(invoice.paymentMade);
  if (invoice.status === 'draft') return { payment: 'review', reason: 'draft' };
  if (['void', 'voided', 'cancelled', 'canceled', 'refunded', 'written_off', 'credit_only'].includes(invoice.status)) {
    return { payment: 'review', reason: 'adjustment' };
  }
  if (moneyUnits(invoice.creditsApplied ?? '0') !== 0n || moneyUnits(invoice.writeOffAmount ?? '0') !== 0n ||
      total <= 0n || balance < 0n || balance > total || (paid !== null && paid !== total - balance)) {
    return { payment: 'review', reason: 'ambiguous-settlement' };
  }
  if (invoice.emailed !== true) return { payment: 'review', reason: 'email-unconfirmed' };
  if (invoice.status === 'paid' && balance === 0n && paid === total) return { payment: 'paid', reason: null };
  const openStatus = ['sent', 'viewed', 'open', 'unpaid', 'overdue', 'partially_paid'];
  if (!openStatus.includes(invoice.status) || balance === 0n ||
      (invoice.status === 'partially_paid' && balance === total) || (balance < total && paid === null)) {
    return { payment: 'review', reason: 'ambiguous-settlement' };
  }
  return { payment: balance === total ? 'unpaid' : 'partial', reason: null };
}
