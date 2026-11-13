import type { CalendarRange, CurrencyTotal, ReportRange } from './reporting';

export const reconciliationApi = '/api/sales-crm/reconciliation';
export const verificationStates = ['verified', 'pending', 'unavailable', 'conflicting'] as const;
export type VerificationState = typeof verificationStates[number];
export interface EvidenceCheck {
  status: VerificationState;
  value: string | null;
  source: string | null;
  type: 'synthetic-receipt' | 'manual-corroboration' | 'archived-structured-invoice' | 'unclassified-history' | 'legacy-attestation';
  reference: string | null;
  eventId: string | null;
  verifiedAt: string | null;
  notes: string;
}
export interface RevenueReview {
  send: EvidenceCheck & { successful: boolean; firstSend: boolean };
  amount: EvidenceCheck;
}
export const differenceLabels = {
  'different-reporting-date': 'Different reporting date',
  'subtotal-versus-total': 'Original subtotal versus current final total',
  'unverified-email': 'Unverified first email',
  'missing-original-amount': 'Missing verified original amount',
  'unpaid-or-partial': 'Unpaid or partially paid',
  'draft-or-never-emailed': 'Draft or never emailed',
  'void-or-cancellation': 'Void or cancellation',
  'edited-after-send': 'Invoice modified after first send',
  'salesperson-difference': 'Current salesperson differs from original credit',
  'tax-or-shipping': 'Documented tax or shipping',
  'discount-or-adjustment': 'Documented discount or adjustment',
  'missing-original-lines': 'Original line snapshot unavailable',
  'settlement-review': 'Current settlement requires review',
  'conflicting-evidence': 'Conflicting evidence',
} as const;
export interface ReconciliationInvoice {
  id: string;
  number: string;
  createdAt: string | null;
  invoiceDate: string | null;
  firstEmailAt: string | null;
  firstEmailCandidate: string | null;
  currency: string;
  currentCurrency: string;
  currentSubtotal: string;
  originalSubtotal: string | null;
  currentTotal: string | null;
  balance: string;
  payment: string;
  currentStatus: string;
  currentSalesperson: string | null;
  originalSalesperson: string | null;
  managementPeriod: string | null;
  crmPeriod: string | null;
  managementIncluded: boolean;
  crmIncluded: boolean;
  managementRevenue: string;
  crmRevenue: string;
  sendEvidence: RevenueReview['send'];
  amountEvidence: EvidenceCheck;
  verification: VerificationState;
  originalLinesAvailable: boolean;
  reasons: (keyof typeof differenceLabels)[];
}
export interface ReconciliationReport {
  source: 'synthetic';
  range: ReportRange;
  coverageStart: string;
  coverageIncomplete: boolean;
  management: CurrencyTotal[];
  crm: CurrencyTotal[];
  differences: { currency: string; amount: string }[];
  invoices: ReconciliationInvoice[];
  count: number;
  page: number;
  pageSize: number;
}

export function calendarRangeLabel(range: CalendarRange) {
  return range.start + ' to ' + range.end;
}
