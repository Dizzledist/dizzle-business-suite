import { useState } from 'react';
import { rangeParams, type RangeSelection, type CurrencyTotal } from '../../shared/reporting';
import {
  reconciliationApi, differenceLabels, calendarRangeLabel, type ReconciliationReport,
} from '../../shared/reconciliation';
import { FilterDates, initialRange, useReport } from './Reporting';

function totals(values: CurrencyTotal[]) {
  return values.length ? values.map(value => value.currency + ' ' + value.subtotal + ' · ' + value.count + ' invoices').join(' | ')
    : 'No qualifying invoices';
}

export function RevenueReconciliation() {
  const [range, setRange] = useState<RangeSelection>(initialRange);
  const [page, setPage] = useState(1);
  const params = rangeParams(range);
  params.set('page', String(page));
  const { request, retry } = useReport<ReconciliationReport>(reconciliationApi + '?' + params);
  const data = request?.state === 'ready' ? request.value : undefined;
  function dates(next: RangeSelection) {
    setRange(next);
    setPage(1);
    window.history.replaceState(null, '', window.location.pathname + '?' + rangeParams(next));
  }
  return <section className="sales-crm-group" aria-label="Revenue reconciliation">
    <p>Synthetic invoice comparison for administrator review.</p>
    <FilterDates selection={range} loaded={data?.range} onChange={dates} />
    {!request && <p role="status">Loading revenue reconciliation…</p>}
    {request && request.state !== 'ready' && <p role="alert">Reconciliation is unavailable for this account.
      {' '}<button type="button" onClick={retry}>Retry reconciliation</button></p>}
    {data && <>
      {data.coverageIncomplete && <p role="status">Incomplete coverage. The initial reporting baseline is {data.coverageStart}.</p>}
      <div className="sales-crm-cards">
        <article className="panel sales-crm-card"><h2>Management method</h2><strong>{totals(data.management)}</strong>
          <p>Invoice date and current final total</p></article>
        <article className="panel sales-crm-card"><h2>CRM recognized sales</h2><strong>{totals(data.crm)}</strong>
          <p>Verified first email and original subtotal</p></article>
        <article className="panel sales-crm-card"><h2>Management less CRM</h2>
          {data.differences.map(value => <p key={value.currency}>{value.currency} {value.amount}</p>)}</article>
      </div>
      <p>{calendarRangeLabel(data.range.selected)} · {data.range.timeZone}</p>
      {!data.count && <p>No synthetic records are available in this range.</p>}
      {data.invoices.map(invoice => <details className="panel sales-crm-card" key={invoice.id}>
        <summary>{invoice.number} · {invoice.currency} · Email {invoice.sendEvidence.status} · Original amount {invoice.amountEvidence.status}</summary>
        <dl className="reconciliation-fields">
          <dt>Invoice created</dt><dd>{invoice.createdAt ?? 'Unavailable'}</dd>
          <dt>Invoice date</dt><dd>{invoice.invoiceDate ?? 'Unavailable'}</dd>
          <dt>Verified first email</dt><dd>{invoice.firstEmailAt ?? 'Unverified'}</dd>
          <dt>Candidate first email</dt><dd>{invoice.firstEmailCandidate ?? 'Unavailable'}</dd>
          <dt>Current currency</dt><dd>{invoice.currentCurrency}</dd>
          <dt>Current subtotal</dt><dd>{invoice.currentSubtotal}</dd>
          <dt>Original subtotal</dt><dd>{invoice.originalSubtotal ?? 'Unavailable'}</dd>
          <dt>Current final total</dt><dd>{invoice.currentTotal ?? 'Unavailable'}</dd>
          <dt>Current payment</dt><dd>{invoice.payment} · {invoice.currentStatus} · Balance {invoice.balance}</dd>
          <dt>Management recognition period</dt><dd>{invoice.managementPeriod ?? 'Unavailable'}</dd>
          <dt>CRM recognition period</dt><dd>{invoice.crmPeriod ?? 'Unverified'}</dd>
          <dt>Management revenue in range</dt><dd>{invoice.managementRevenue}</dd>
          <dt>CRM recognized revenue in range</dt><dd>{invoice.crmRevenue}</dd>
          <dt>Overall verification</dt><dd>{invoice.verification}</dd>
          <dt>Original line snapshot</dt><dd>{invoice.originalLinesAvailable ? 'Available' : 'Unavailable'}</dd>
          <dt>Current salesperson</dt><dd>{invoice.currentSalesperson ?? 'Unassigned'}</dd>
          <dt>Original credit</dt><dd>{invoice.originalSalesperson ?? 'Unverified'}</dd>
          <dt>Email evidence</dt><dd>{invoice.sendEvidence.source ?? 'Unavailable'} · {invoice.sendEvidence.type}
            {' · '}{invoice.sendEvidence.reference ?? 'No reference'} · {invoice.sendEvidence.notes}
            {' · Review '}{invoice.sendEvidence.verifiedAt ?? 'Pending'}</dd>
          <dt>Original amount evidence</dt><dd>{invoice.amountEvidence.source ?? 'Unavailable'} · {invoice.amountEvidence.type}
            {' · '}{invoice.amountEvidence.reference ?? 'No reference'} · {invoice.amountEvidence.notes}
            {' · Review '}{invoice.amountEvidence.verifiedAt ?? 'Pending'}</dd>
        </dl>
        <ul aria-label={'Differences for ' + invoice.number}>
          {invoice.reasons.map(reason => <li key={reason}>{differenceLabels[reason]}</li>)}
        </ul>
      </details>)}
      <div className="reporting-pagination">
        <button type="button" disabled={data.page === 1} onClick={() => setPage(data.page - 1)}>Previous</button>
        <span>Page {data.page} · {data.count} records</span>
        <button type="button" disabled={data.page * data.pageSize >= data.count} onClick={() => setPage(data.page + 1)}>Next</button>
      </div>
    </>}
  </section>;
}
