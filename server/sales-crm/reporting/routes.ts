import type { IncomingMessage } from 'node:http';
import type { SQLInputValue } from 'node:sqlite';
import type { Identity } from '../../../shared/contracts';
import { canAccessSalesCrm } from '../../../shared/sales-crm';
import {
  parseRange, reportingApi, type CurrencyTotal, type InvoiceSort, type PaymentFilter, type ReportingInvoice, type ReportingPage,
} from '../../../shared/reporting';
import { ApiError } from '../../workflow';
import { requireZohoOperator, type ZohoManagement } from '../zoho/routes';
import type { SyntheticReporting } from './demo';
import { transaction } from './database';
import { decimalAmount, demoOrganization } from './model';

export type ReportingScope = { organizationId: string } &
  ({ credit: 'all' } | { credit: 'selected'; userIds: readonly string[] });

const sorts = {
  newest: 'first_email_at DESC, invoice_id',
  oldest: 'first_email_at, invoice_id',
  invoice: 'invoice_number COLLATE NOCASE, invoice_id',
  customer: 'customer_name COLLATE NOCASE, invoice_id',
} satisfies Record<InvoiceSort, string>;
const pageSize = 10;
const projection = `invoice_id, invoice_number, customer_name, credited_name, first_email_at,
  evidence_source, currency, CAST(recognized_subtotal AS TEXT) AS amount, payment,
  CAST(open_balance AS TEXT) AS balance, invoice_status, created_at, last_sync_at`;

type InvoiceRow = {
  invoice_id: string; invoice_number: string; customer_name: string | null; credited_name: string | null;
  first_email_at: number; evidence_source: string; currency: string; amount: string; payment: ReportingInvoice['payment'];
  balance: string; invoice_status: string; created_at: string | null; last_sync_at: number;
};
type TotalsRow = Pick<InvoiceRow, 'currency' | 'amount' | 'first_email_at' | 'payment'>;

function project(row: InvoiceRow): ReportingInvoice {
  return {
    id: row.invoice_id, number: row.invoice_number, customer: row.customer_name ?? 'Unspecified',
    salesperson: row.credited_name ?? 'Unassigned', firstEmailAt: new Date(row.first_email_at).toISOString(),
    evidenceSource: row.evidence_source, currency: row.currency, subtotal: decimalAmount(BigInt(row.amount)),
    payment: row.payment, balance: decimalAmount(BigInt(row.balance)), status: row.invoice_status,
    createdAt: row.created_at, lastSyncAt: new Date(row.last_sync_at).toISOString(),
  };
}

function totals(rows: TotalsRow[]): CurrencyTotal[] {
  const currencies = new Map<string, { count: number; amount: bigint }>();
  for (const row of rows) {
    const entry = currencies.get(row.currency) ?? { count: 0, amount: 0n };
    entry.count++;
    entry.amount += BigInt(row.amount);
    currencies.set(row.currency, entry);
  }
  return [...currencies].sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, entry]) => ({ currency, subtotal: decimalAmount(entry.amount), count: entry.count }));
}

function query(url: URL) {
  const params = url.searchParams;
  const allowed = new Set(['preset', 'start', 'end', 'payment', 'q', 'sort', 'page']);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new ApiError(400, 'Invalid reporting query.');
  }
  const payment = params.get('payment') ?? 'all';
  const search = (params.get('q') ?? '').trim();
  const sort = params.get('sort') ?? 'newest';
  const page = params.get('page') ?? '1';
  if (payment !== 'all' && payment !== 'open' && payment !== 'closed' || !Object.hasOwn(sorts, sort) ||
      !/^[1-9]\d{0,4}$/.test(page) || search.length > 100) throw new ApiError(400, 'Invalid reporting filters.');
  try {
    return { range: parseRange(params), payment, search, sort: sort as InvoiceSort, page: Number(page) } as const;
  } catch (error) {
    throw new ApiError(400, error instanceof RangeError ? error.message : 'Invalid reporting date range.');
  }
}

function paymentClause(filter: PaymentFilter) {
  if (filter === 'open') return " AND payment IN ('unpaid','partial')";
  if (filter === 'closed') return " AND payment = 'paid'";
  return '';
}

function operatingStatus(reporting: SyntheticReporting) {
  const { db } = reporting;
  const state = db.prepare('SELECT * FROM reporting_sync_state WHERE organization_id = ?').get(demoOrganization);
  const counts = db.prepare(`SELECT COUNT(*) AS synchronized,
    COUNT(CASE WHEN verification <> 'verified' OR review_reason IS NOT NULL THEN 1 END) AS reconciliation
    FROM reporting_invoices WHERE organization_id = ?`).get(demoOrganization)!;
  const queue = db.prepare(`SELECT error_category AS category, COUNT(*) AS count FROM reporting_sync_queue
    WHERE organization_id = ? AND error_category IS NOT NULL GROUP BY error_category`).all(demoOrganization);
  return {
    source: 'synthetic',
    syncStatus: state?.status === 'running' && Number(state.lease_until) <= reporting.now() ? 'interrupted' : state?.status ?? 'idle',
    lastSuccessfulSync: typeof state?.last_success_at === 'number' ? new Date(state.last_success_at).toISOString() : null,
    recordsSynchronized: counts.synchronized,
    recordsProcessed: state?.records_processed ?? 0,
    pendingVerification: db.prepare(`SELECT COUNT(*) AS count FROM reporting_invoices
      WHERE organization_id = ? AND verification = 'pending'`).get(demoOrganization)?.count,
    reconciliationCount: counts.reconciliation,
    failedRecords: queue.reduce((count, row) => count + Number(row.count), 0),
    errorCategories: queue,
    lastError: state?.last_error ?? null,
    retries: state?.retries ?? 0,
    checkpoint: { nextPage: state?.next_page ?? 1, initialComplete: state?.initial_done === 1 },
  };
}

export async function getReporting(
  actor: Identity, req: IncomingMessage, url: URL, reporting: SyntheticReporting | undefined, zoho: ZohoManagement | undefined,
) {
  if (!canAccessSalesCrm(actor)) throw new ApiError(403, 'Sales CRM access is unavailable for this identity.');
  if (req.method !== 'GET') throw new ApiError(404, 'Route not found.');
  if (url.pathname === reportingApi + '/operations') {
    if (!actor.roles.includes('admin') || req.socket.remoteAddress !== '127.0.0.1' ||
        req.headers.host !== 'localhost:3001' || url.origin !== 'http://localhost:3001') {
      throw new ApiError(403, 'Use the direct local administrator terminal.');
    }
    if (!zoho) throw new ApiError(404, 'Local Zoho operator access is unavailable.');
    requireZohoOperator(req, actor, zoho.config.adminKey);
    if (url.search) throw new ApiError(400, 'This operation accepts no inputs.');
    if (!reporting) throw new ApiError(503, 'Synthetic reporting is unavailable.');
    const status = await zoho.connection.status();
    return { zohoConnection: status.connection, ...transaction(reporting.db, () => operatingStatus(reporting), 'read') };
  }
  const broad = actor.roles.some(role => ['admin', 'owner', 'sales_manager'].includes(role));
  return getScopedReporting(url, reporting, broad ? { organizationId: demoOrganization, credit: 'all' }
    : { organizationId: demoOrganization, credit: 'selected', userIds: [actor.id] });
}

export function getScopedReporting(url: URL, reporting: SyntheticReporting | undefined, scope: ReportingScope) {
  const detailId = /^\/api\/sales-crm\/reporting\/invoices\/([1-9]\d{0,39})$/.exec(url.pathname)?.[1];
  if (url.pathname !== reportingApi && !detailId) throw new ApiError(404, 'Route not found.');
  if (!reporting) throw new ApiError(503, 'Synthetic reporting is unavailable.');

  const filters = query(url);
  return transaction(reporting.db, () => report(scope, detailId, filters, reporting), 'read');
}

function report(authorization: ReportingScope, detailId: string | undefined, filters: ReturnType<typeof query>, reporting: SyntheticReporting) {
  const { db, calendar, now } = reporting;
  const range = calendar.resolve(filters.range, now());
  const scope = 'organization_id = ?' + (authorization.credit === 'all' ? ''
    : ' AND credited_user_id IN (SELECT value FROM json_each(?))');
  const scopeArgs: SQLInputValue[] = [authorization.organizationId];
  if (authorization.credit === 'selected') scopeArgs.push(JSON.stringify(authorization.userIds));
  const eligible = scope + " AND verification = 'verified' AND review_reason IS NULL AND first_email_at >= ? AND first_email_at < ?";
  const selectedArgs = [...scopeArgs, range.selected.from, range.selected.until];
  const payment = paymentClause(filters.payment);

  if (detailId) {
    const invoice = db.prepare('SELECT ' + projection + ' FROM reporting_invoices WHERE ' + eligible + payment +
      ' AND invoice_id = ?').get(...selectedArgs, detailId) as InvoiceRow | undefined;
    if (!invoice) throw new ApiError(404, 'Invoice report record not found.');
    return project(invoice);
  }

  const totalSql = 'SELECT currency, CAST(recognized_subtotal AS TEXT) AS amount, first_email_at, payment FROM reporting_invoices WHERE ' + eligible;
  const current = db.prepare(totalSql).all(...selectedArgs) as TotalsRow[];
  const previous = db.prepare(totalSql).all(...scopeArgs, range.previous.from, range.previous.until) as TotalsRow[];
  const days = new Map<string, TotalsRow[]>();
  for (const row of current) {
    const date = calendar.localDate(row.first_email_at);
    const daily = days.get(date) ?? [];
    daily.push(row);
    days.set(date, daily);
  }
  const matching = eligible + payment + (filters.search
    ? " AND (instr(lower(invoice_number), lower(?)) OR instr(lower(coalesce(customer_name, '')), lower(?)) OR instr(lower(coalesce(credited_name, '')), lower(?)))"
    : '');
  const args = filters.search ? [...selectedArgs, filters.search, filters.search, filters.search] : selectedArgs;
  const count = Number(db.prepare('SELECT COUNT(*) AS count FROM reporting_invoices WHERE ' + matching).get(...args)?.count);
  const page = Math.min(filters.page, Math.max(1, Math.ceil(count / pageSize)));
  const rows = db.prepare('SELECT ' + projection + ' FROM reporting_invoices WHERE ' + matching +
    ' ORDER BY ' + sorts[filters.sort] + ' LIMIT ? OFFSET ?').all(...args, pageSize, (page - 1) * pageSize) as InvoiceRow[];
  const reconciliationCount = Number(db.prepare('SELECT COUNT(*) AS count FROM reporting_invoices WHERE ' + scope +
    " AND (verification <> 'verified' OR review_reason IS NOT NULL)").get(...scopeArgs)?.count);
  const selection = filters.payment === 'all' ? current
    : current.filter(row => filters.payment === 'closed' ? row.payment === 'paid' : row.payment !== 'paid');
  const result: ReportingPage = {
    source: 'synthetic',
    range: {
      timeZone: range.timeZone,
      selected: { start: range.selected.start, end: range.selected.end },
      previous: { start: range.previous.start, end: range.previous.end },
    },
    sales: totals(current),
    previousSales: totals(previous),
    invoiceTotals: totals(selection),
    trend: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, daily]) => ({ date, totals: totals(daily) })),
    reconciliationCount,
    invoices: rows.map(project), count, page, pageSize,
  };
  return result;
}
