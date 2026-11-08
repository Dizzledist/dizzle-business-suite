import { useEffect, useState, type FormEvent } from 'react';
import {
  datePresets, defaultRange, parseRange, rangeParams, reportingApi, validateCustomDates,
  type CalendarRange, type CurrencyTotal, type DatePreset, type InvoiceSort, type PaymentFilter,
  type RangeSelection, type ReportingInvoiceDetail, type ReportingPage,
} from '../../shared/reporting';
import { salesCrmPath } from '../../shared/sales-crm';
import { requestSales } from './access';

const preferenceKey = 'dizzle.synthetic-reporting.range';
const reportsPath = salesCrmPath + '/reports';
const paymentLabels = { all: 'All', open: 'Open', closed: 'Closed' } as const;
const statusLabels = { unpaid: 'Unpaid', partial: 'Partially paid', paid: 'Paid' } as const;
const sorts = { newest: 'Newest first', oldest: 'Oldest first', invoice: 'Invoice number', customer: 'Customer' };

function initialRange(): RangeSelection {
  const fromUrl = new URLSearchParams(window.location.search);
  try {
    if (fromUrl.has('preset')) return parseRange(fromUrl);
    return parseRange(new URLSearchParams(sessionStorage.getItem(preferenceKey) ?? ''));
  } catch {
    return defaultRange;
  }
}

function initialPayment(): PaymentFilter {
  const value = new URLSearchParams(window.location.search).get('payment');
  return value === 'open' || value === 'closed' ? value : 'all';
}

function updateLocation(range: RangeSelection, payment: PaymentFilter) {
  const params = rangeParams(range);
  if (payment !== 'all') params.set('payment', payment);
  window.history.replaceState(null, '', window.location.pathname + '?' + params + window.location.hash);
}

function money(currency: string, amount: string) {
  return currency + ' ' + amount.replace(/\B(?=(\d{3})+\.)/g, ',');
}

function amounts(totals: CurrencyTotal[]) {
  return totals.length ? totals.map(entry => money(entry.currency, entry.subtotal)).join(' · ') : 'No qualifying invoices';
}

function rangeLabel(range: CalendarRange) {
  return range.start === range.end ? range.start : range.start + ' to ' + range.end;
}

function dateLabel(value: string, timeZone: string, includeTime = false) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone, dateStyle: 'medium', ...(includeTime ? { timeStyle: 'short' } : {}),
  }).format(new Date(value));
}

function FilterDates({ selection, loaded, onChange }: {
  selection: RangeSelection;
  loaded?: ReportingPage['range'];
  onChange: (range: RangeSelection) => void;
}) {
  const [preset, setPreset] = useState<DatePreset>(selection.preset);
  const [start, setStart] = useState(selection.preset === 'custom' ? selection.start : '');
  const [end, setEnd] = useState(selection.preset === 'custom' ? selection.end : '');
  const [error, setError] = useState('');
  function changePreset(value: DatePreset) {
    setPreset(value);
    setError('');
    if (value !== 'custom') onChange({ preset: value });
    else if (!start || !end) {
      setStart(loaded?.selected.start ?? '');
      setEnd(loaded?.selected.end ?? '');
    }
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      validateCustomDates(start, end);
      setError('');
      onChange({ preset: 'custom', start, end });
    } catch (error) {
      setError(error instanceof RangeError ? error.message : 'Enter a valid date range.');
    }
  }

  return (
    <section className="panel sales-crm-card reporting-filters" aria-label="Reporting dates">
      <form onSubmit={apply}>
        <label>Reporting date range
          <select value={preset} onChange={event => changePreset(event.target.value as DatePreset)}>
            {Object.entries(datePresets).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        {preset === 'custom' && <>
          <label>Start date<input type="date" required value={start} onChange={event => { setStart(event.target.value); setError(''); }} /></label>
          <label>End date<input type="date" required value={end} onChange={event => { setEnd(event.target.value); setError(''); }} /></label>
          <button type="submit">Apply dates</button>
        </>}
        <button type="button" onClick={() => { setStart(''); setEnd(''); changePreset('mtd'); }}>Reset dates</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p className="reporting-range">{loaded
        ? <>Showing <strong>{rangeLabel(loaded.selected)}</strong> · {loaded.timeZone}</>
        : 'Resolving the selected range in the reporting timezone…'}</p>
    </section>
  );
}

function PaymentToggle({ selected, onChange }: { selected: PaymentFilter; onChange: (value: PaymentFilter) => void }) {
  return <div className="reporting-toggle" role="group" aria-label="Invoice payment filter">
    {(['all', 'open', 'closed'] as const).map(value => (
      <button key={value} type="button" aria-pressed={selected === value} onClick={() => onChange(value)}>
        {paymentLabels[value]}
      </button>
    ))}
  </div>;
}

type Load<T> = { path: string; state: 'ready'; value: T }
  | { path: string; state: 'missing' | 'error' };

function useReport<T>(path: string | null) {
  const [request, setRequest] = useState<Load<T>>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return;
    const activePath = path;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await requestSales(activePath, { signal: controller.signal });
        if (response.status === 404) {
          if (!controller.signal.aborted) setRequest({ path: activePath, state: 'missing' });
          return;
        }
        if (!response.ok) throw new Error('Report unavailable.');
        const value: T = await response.json();
        if (!controller.signal.aborted) setRequest({ path: activePath, state: 'ready', value });
      } catch {
        if (!controller.signal.aborted) setRequest({ path: activePath, state: 'error' });
      }
    }
    void load();
    return () => controller.abort();
  }, [path, attempt]);

  return {
    request: request?.path === path ? request : undefined,
    retry: () => { setRequest(undefined); setAttempt(value => value + 1); },
  };
}

function ReportingNotice({ count }: { count: number }) {
  return (
    <p className="reporting-notice">
      Synthetic data preview. Only invoices with verified first-email evidence qualify.
      {count > 0 && <> {count} visible sample {count === 1 ? 'invoice needs' : 'invoices need'} reconciliation across all dates.</>}
    </p>
  );
}

function Performance({ data, filter, onFilter, selection }: {
  data?: ReportingPage; filter: PaymentFilter; onFilter: (value: PaymentFilter) => void; selection: RangeSelection;
}) {
  const invoiceQuery = rangeParams(selection);
  invoiceQuery.set('payment', filter);
  const count = data?.invoiceTotals.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const isMonth = ['mtd', 'this-month', 'last-month'].includes(selection.preset);
  const salesTitle = isMonth ? 'Monthly Sales' : 'Sales for Selected Range';
  const invoiceTitle = isMonth ? 'Monthly Invoices' : 'Invoices for Selected Range';

  return <section className="sales-crm-group" aria-label="Sales reporting performance">
    {data && <ReportingNotice count={data.reconciliationCount} />}
    <div className="sales-crm-cards">
      <article className="panel sales-crm-card">
        <h3>{salesTitle}</h3>
        {data && <>
          <strong>{data.coverage.selected === 'before-baseline' ? 'Outside initial coverage' : amounts(data.sales)}</strong>
          <p>Verified first-email subtotal</p>
          <p>Previous period ({rangeLabel(data.range.previous)}). {data.coverage.previous === 'before-baseline'
            ? 'Outside initial coverage' : amounts(data.previousSales)}
            {data.coverage.previous === 'partial' && ' · Incomplete coverage'}</p>
          <a className="sales-crm-link" href={reportsPath + '?' + rangeParams(selection)}>View recognized invoices</a>
        </>}
      </article>
      <article className="panel sales-crm-card">
        <h3>{invoiceTitle}</h3>
        <PaymentToggle selected={filter} onChange={onFilter} />
        {data && <>
          {data.coverage.selected === 'before-baseline' ? <p>Outside initial coverage</p> : <>
            <p><strong>{count} {count === 1 ? 'invoice' : 'invoices'}</strong></p>
            <p>Recognized subtotal · {amounts(data.invoiceTotals)}</p>
          </>}
          <a className="sales-crm-link" href={reportsPath + '?' + invoiceQuery}>View filtered invoices</a>
        </>}
      </article>
      <article className="panel sales-crm-card reporting-trend">
        <h3>Sales Trends</h3>
        {data && (data.trend.length ? <ul aria-label="Verified daily subtotals">
          {data.trend.map(point => <li key={point.date}><time dateTime={point.date}>{point.date}</time><span>{amounts(point.totals)}</span></li>)}
        </ul> : <p>{data.coverage.selected === 'before-baseline' ? 'Outside initial coverage' : 'No verified sales in this range.'}</p>)}
      </article>
    </div>
  </section>;
}

const invoiceTabs = ['Line Items', 'Invoice PDF', 'Activity', 'Payments'] as const;

function InvoicePdf({ path }: { path: string }) {
  const [document, setDocument] = useState<string>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function load() {
      try {
        const response = await requestSales(path, { signal: controller.signal });
        if (response.status === 404) {
          if (!controller.signal.aborted) setError('This sample invoice has no PDF.');
          return;
        }
        if (!response.ok || response.headers.get('content-type') !== 'application/pdf') throw new Error();
        const blob = await response.blob();
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setDocument(objectUrl);
        }
      } catch {
        if (!controller.signal.aborted) setError('The invoice PDF could not load.');
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, attempt]);

  if (error) return <p role="alert">{error} <button type="button" onClick={() => {
    setError('');
    setAttempt(value => value + 1);
  }}>Retry PDF</button></p>;
  return document
    ? <iframe className="reporting-pdf" title="Synthetic invoice PDF" src={document} referrerPolicy="no-referrer" />
    : <p role="status">Loading invoice PDF…</p>;
}

function InvoiceTabs({ row, path, timeZone }: { row: ReportingInvoiceDetail; path: string; timeZone: string }) {
  const [active, setActive] = useState(0);
  const priced = (value: string | null) => value === null ? 'Unavailable' : money(row.currency, value);
  return <>
    <div className="reporting-toggle invoice-tabs" role="tablist" aria-label="Invoice detail views"
      onKeyDown={event => {
        const next = { ArrowLeft: (active + 3) % 4, ArrowRight: (active + 1) % 4, Home: 0, End: 3 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        setActive(next);
        event.currentTarget.querySelectorAll('button')[next]?.focus();
      }}>
      {invoiceTabs.map((label, index) => <button type="button" key={label} role="tab" id={'invoice-tab-' + index}
        aria-controls="invoice-tab-panel" aria-selected={active === index} tabIndex={active === index ? 0 : -1}
        onClick={() => setActive(index)}>{label}</button>)}
    </div>
    <div id="invoice-tab-panel" role="tabpanel" aria-labelledby={'invoice-tab-' + active} tabIndex={0}>
      {active === 0 && <>
        {(row.lineState === 'unavailable' || row.lineState === 'invalid') && <p>The current line-item snapshot is unavailable.</p>}
        {row.lineState === 'difference' && <p role="status">{row.subtotalDifference === null
          ? 'The current line totals could not be reconciled with the invoice subtotal.'
          : 'Difference between the invoice subtotal and supported line totals: ' + priced(row.subtotalDifference)}</p>}
        {row.lineItems.length > 0 && <div className="reporting-table" tabIndex={0} role="region" aria-label="Invoice line items">
          <table><thead><tr>
            {['Product', 'SKU', 'Quantity', 'Unit price', 'Discount', 'Line total'].map(label => <th key={label} scope="col">{label}</th>)}
          </tr></thead><tbody>{row.lineItems.map((line, index) => <tr key={line.lineId ?? 'position-' + index}>
            <th scope="row">{line.name ?? 'Unnamed product'}{line.description && <small>{line.description}</small>}</th>
            <td>{line.sku ?? 'Unknown'}</td><td>{line.quantity} {line.unit}</td><td>{priced(line.unitPrice)}</td>
            <td>{line.discountAmount === null ? line.discount ?? 'Unavailable' : priced(line.discountAmount)}</td>
            <td>{priced(line.amount)}</td>
          </tr>)}</tbody></table>
        </div>}
        {row.lineState === 'reconciled' && row.lineItems.length === 0 && <p>This invoice has no line items.</p>}
        <p>Current invoice subtotal · {priced(row.currentSubtotal)}
          {row.invoiceDiscount !== null && <> · Invoice discount {priced(row.invoiceDiscount)}</>}
          {row.invoiceAdjustment !== null && <> · Adjustment {priced(row.invoiceAdjustment)}</>}
          {row.shippingCharge !== null && <> · Shipping {priced(row.shippingCharge)}</>}
        </p>
      </>}
      {active === 1 && <><p>Synthetic invoice PDF preview.</p>{row.pdfAccess
        ? <InvoicePdf key={path} path={path} />
        : <p>PDF preview requires an eligible employee password session.</p>}</>}
      {active === 2 && <ol aria-label="Invoice activity">
        <li><time dateTime={row.firstEmailAt}>{dateLabel(row.firstEmailAt, timeZone, true)}</time> ·
          First successful email verified by {row.evidenceSource}.</li>
        <li><time dateTime={row.lastSyncAt}>{dateLabel(row.lastSyncAt, timeZone, true)}</time> · Reporting copy synchronized.</li>
      </ol>}
      {active === 3 && <>
        <dl>
          <dt>Current total</dt><dd>{priced(row.currentTotal)}</dd>
          <dt>Payment recorded</dt><dd>{priced(row.paymentMade)}</dd>
          <dt>Open balance</dt><dd>{priced(row.balance)}</dd>
        </dl>
        <p>Individual payment transactions are unavailable in this preview.</p>
      </>}
    </div>
  </>;
}

function InvoiceDetail({ id, params, timeZone, onClose }: {
  id: string; params: URLSearchParams; timeZone: string; onClose: () => void;
}) {
  const invoicePath = reportingApi + '/invoices/' + encodeURIComponent(id);
  const { request, retry } = useReport<ReportingInvoiceDetail>(invoicePath + '?' + params);
  return (
    <section className="panel sales-crm-card reporting-detail" aria-label="Invoice details">
      <button type="button" onClick={onClose}>Close invoice detail</button>
      {!request && <p role="status">Loading invoice detail…</p>}
      {request?.state === 'missing' && <p role="alert">This invoice is unavailable for your current range, filter, or account.</p>}
      {request?.state === 'error' && <p role="alert">Invoice detail could not load. <button onClick={retry}>Retry</button></p>}
      {request?.state === 'ready' && (() => {
        const row = request.value;
        return <>
          <h3>Invoice {row.number}</h3>
          <dl>
            <dt>Customer</dt><dd>{row.customer}</dd>
            <dt>Credited salesperson</dt><dd>{row.salesperson}</dd>
            <dt>Invoice date</dt><dd>{row.invoiceDate ?? 'Unavailable'}</dd>
            <dt>Line items</dt><dd>{row.lineState === 'unavailable' || row.lineState === 'invalid'
              ? 'Unavailable' : row.lineItems.length}</dd>
            <dt>First verified email</dt><dd>{dateLabel(row.firstEmailAt, timeZone, true)} · {timeZone}</dd>
            <dt>Evidence</dt><dd>{row.evidenceSource}</dd>
            <dt>Recognized subtotal</dt><dd>{money(row.currency, row.subtotal)}</dd>
            <dt>Current payment</dt><dd>{statusLabels[row.payment]}</dd>
            <dt>Open balance</dt><dd>{money(row.currency, row.balance)}</dd>
            <dt>Invoice status</dt><dd>{row.status}</dd>
            <dt>Last sync</dt><dd>{dateLabel(row.lastSyncAt, timeZone, true)}</dd>
          </dl>
          <InvoiceTabs key={invoicePath + '?' + params} row={row} path={invoicePath + '/pdf?' + params} timeZone={timeZone} />
        </>;
      })()}
    </section>
  );
}

function InvoiceTable({ data, onPage, onDetail }: {
  data: ReportingPage; onPage: (value: number) => void; onDetail: (id: string) => void;
}) {
  if (!data.invoices.length) return <p role="status">No qualifying invoices match these filters.</p>;
  const first = (data.page - 1) * data.pageSize + 1;
  const last = first + data.invoices.length - 1;
  return <>
    <div className="reporting-table" tabIndex={0} role="region" aria-label="Invoice table">
      <table>
        <thead><tr>
          {['Invoice', 'Customer', 'Salesperson', 'First verified email', 'Subtotal', 'Payment', 'Open balance', 'Last sync']
            .map(label => <th key={label} scope="col">{label}</th>)}
        </tr></thead>
        <tbody>{data.invoices.map(row => (
          <tr key={row.id}>
            <th scope="row"><button type="button" className="reporting-invoice-link" onClick={() => onDetail(row.id)}>{row.number}</button></th>
            <td>{row.customer}</td><td>{row.salesperson}</td>
            <td>{dateLabel(row.firstEmailAt, data.range.timeZone)}</td><td>{money(row.currency, row.subtotal)}</td>
            <td>{statusLabels[row.payment]}</td><td>{money(row.currency, row.balance)}</td>
            <td>{dateLabel(row.lastSyncAt, data.range.timeZone)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
    <div className="reporting-pagination" aria-label="Invoice pagination">
      <button disabled={data.page === 1} onClick={() => onPage(data.page - 1)}>Previous</button>
      <span>{first}–{last} of {data.count} invoices</span>
      <button disabled={last >= data.count} onClick={() => onPage(data.page + 1)}>Next</button>
    </div>
  </>;
}

export function SalesReporting({ dashboard }: { dashboard: boolean }) {
  const [range, setRange] = useState(initialRange);
  const [payment, setPayment] = useState(initialPayment);
  const [sort, setSort] = useState<InvoiceSort>('newest');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const params = rangeParams(range);
  params.set('payment', payment);
  if (!dashboard) {
    params.set('sort', sort);
    params.set('page', String(page));
    if (appliedSearch) params.set('q', appliedSearch);
  }
  const { request, retry } = useReport<ReportingPage>(reportingApi + '?' + params);
  const data = request?.state === 'ready' ? request.value : undefined;

  function changeRange(next: RangeSelection) {
    setRange(next);
    updateLocation(next, payment);
    setPage(1);
    setDetail(null);
    try { sessionStorage.setItem(preferenceKey, rangeParams(next).toString()); } catch { /* Session storage can be unavailable. */ }
  }
  function changePayment(next: PaymentFilter) {
    setPayment(next);
    updateLocation(range, next);
    setPage(1);
    setDetail(null);
  }

  return (
    <section id={dashboard ? undefined : 'invoice-reporting'} className="sales-crm-group" aria-label={dashboard ? 'Dashboard reporting' : 'Invoice reporting'}>
      {!dashboard && <h2>Invoice reporting</h2>}
      <FilterDates selection={range} loaded={data?.range} onChange={changeRange} />
      {data && data.coverage.selected !== 'within-baseline' && <p role="status" className="reporting-notice">
        Incomplete reporting coverage. The initial baseline starts {data.coverage.from}.
        {data.coverage.selected === 'before-baseline' && ' The selected range is before the baseline.'}
      </p>}
      {!dashboard && <div className="panel sales-crm-card reporting-filters">
        <PaymentToggle selected={payment} onChange={changePayment} />
        <form onSubmit={event => { event.preventDefault(); setAppliedSearch(search.trim()); setPage(1); setDetail(null); }}>
          <label>Search invoices<input type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></label>
          <button type="submit">Search</button>
          <label>Sort invoices
            <select value={sort} onChange={event => { setSort(event.target.value as InvoiceSort); setPage(1); setDetail(null); }}>
              {Object.entries(sorts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </form>
      </div>}
      {!request && <p role="status">Loading synthetic reporting…</p>}
      {request && request.state !== 'ready' && <p role="alert">Reporting could not load. <button onClick={retry}>Retry reporting</button></p>}
      {dashboard ? <Performance data={data} filter={payment} onFilter={changePayment} selection={range} /> : data &&
        <>
          <ReportingNotice count={data.reconciliationCount} />
          {data.coverage.selected !== 'before-baseline' && <p>Recognized subtotal for {paymentLabels[payment].toLowerCase()}
            {' '}invoices · {amounts(data.invoiceTotals)}</p>}
          {detail && <InvoiceDetail id={detail} params={params} timeZone={data.range.timeZone} onClose={() => setDetail(null)} />}
          {data.coverage.selected !== 'before-baseline' &&
            <InvoiceTable data={data} onDetail={setDetail} onPage={next => { setPage(next); setDetail(null); }} />}
        </>
      }
    </section>
  );
}
