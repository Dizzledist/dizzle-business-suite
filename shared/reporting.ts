export const reportingApi = '/api/sales-crm/reporting';
export const datePresets = {
  today: 'Today', yesterday: 'Yesterday', wtd: 'Week to Date', 'last-week': 'Last Week',
  mtd: 'Month to Date', 'this-month': 'This Month', 'last-month': 'Last Month',
  qtd: 'Quarter to Date', 'this-quarter': 'This Quarter', 'last-quarter': 'Last Quarter',
  ytd: 'Year to Date', 'this-year': 'This Year', 'last-year': 'Last Year', custom: 'Custom Date Range',
} as const;
export type DatePreset = keyof typeof datePresets;
export type RangeSelection = { preset: Exclude<DatePreset, 'custom'> } | { preset: 'custom'; start: string; end: string };
export const defaultRange: RangeSelection = { preset: 'mtd' };
export const maxCustomDays = 366;
export type PaymentFilter = 'all' | 'open' | 'closed';
export type InvoiceSort = 'newest' | 'oldest' | 'invoice' | 'customer';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'review';
export interface CalendarRange { start: string; end: string }
export interface ReportRange {
  selected: CalendarRange;
  previous: CalendarRange;
  timeZone: string;
}
export interface CurrencyTotal { currency: string; subtotal: string; count: number }
export interface ReportingInvoice {
  id: string;
  number: string;
  customer: string;
  salesperson: string;
  firstEmailAt: string;
  evidenceSource: string;
  currency: string;
  subtotal: string;
  payment: Exclude<PaymentStatus, 'review'>;
  balance: string;
  status: string;
  createdAt: string | null;
  lastSyncAt: string;
}
export interface InvoiceLine {
  lineId: string | null;
  productId: string | null;
  sku: string | null;
  name: string | null;
  description: string | null;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  discount: string | null;
  discountAmount: string | null;
  amount: string;
  taxId: string | null;
  taxName: string | null;
  taxType: string | null;
  taxPercentage: string | null;
  taxAmount: string | null;
  categoryId: string | null;
  category: string | null;
}
export interface StoredInvoiceLine extends InvoiceLine {
  sourceRevision: string | null;
  synchronizedAt: string;
}
export type LineSnapshotState = 'unavailable' | 'invalid' | 'reconciled' | 'difference';
export interface ReportingInvoiceDetail extends ReportingInvoice {
  invoiceDate: string | null;
  currentSubtotal: string;
  lineState: LineSnapshotState;
  lineItems: StoredInvoiceLine[];
  subtotalDifference: string | null;
  invoiceDiscount: string | null;
  invoiceAdjustment: string | null;
  shippingCharge: string | null;
  paymentMade: string | null;
  currentTotal: string | null;
  pdfAccess: boolean;
}
export type CoverageState = 'within-baseline' | 'partial' | 'before-baseline';
export interface ReportingPage {
  source: 'synthetic';
  range: ReportRange;
  coverage: { from: string; selected: CoverageState; previous: CoverageState };
  sales: CurrencyTotal[];
  previousSales: CurrencyTotal[];
  invoiceTotals: CurrencyTotal[];
  trend: { date: string; totals: CurrencyTotal[] }[];
  reconciliationCount: number;
  invoices: ReportingInvoice[];
  count: number;
  page: number;
  pageSize: number;
}

export function parseRange(params: URLSearchParams): RangeSelection {
  const preset = params.get('preset') ?? 'mtd';
  if (!Object.hasOwn(datePresets, preset)) throw new RangeError('Unknown date preset.');
  if (preset === 'custom') {
    const start = params.get('start') ?? '';
    const end = params.get('end') ?? '';
    validateCustomDates(start, end);
    return { preset, start, end };
  }
  if (params.has('start') || params.has('end')) throw new RangeError('Choose Custom Date Range to enter dates.');
  return { preset: preset as Exclude<DatePreset, 'custom'> };
}

export const calendarDayMs = 86_400_000;

export function calendarDay(value: string) {
  if (!/^(?:19\d{2}|[2-9]\d{3})-\d{2}-\d{2}$/.test(value)) throw new RangeError('Enter a valid calendar date.');
  const ms = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new RangeError('Enter a valid calendar date.');
  }
  return ms;
}

export function validateCustomDates(start: string, end: string) {
  const days = (calendarDay(end) - calendarDay(start)) / calendarDayMs + 1;
  if (days < 1) throw new RangeError('End date must be on or after start date.');
  if (days > maxCustomDays) throw new RangeError('Choose a range of 366 days or fewer.');
}

export function rangeParams(range: RangeSelection) {
  return new URLSearchParams(range.preset === 'custom'
    ? { preset: range.preset, start: range.start, end: range.end }
    : { preset: range.preset });
}
