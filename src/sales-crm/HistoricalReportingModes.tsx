import { useState } from 'react';
import { methodsApi, type MethodReport, type ReportingBasis } from '../../shared/historical-evidence';
import { rangeParams, type PaymentFilter, type RangeSelection } from '../../shared/reporting';
import { initialRange, FilterDates, useReport, SalesReporting } from './Reporting';

export function HistoricalReportingModes() {
 const [basis,setBasis]=useState<ReportingBasis>('verified');
 const [range,setRange]=useState<RangeSelection>(initialRange);
 const [payment,setPayment]=useState<PaymentFilter>('all');
 const params=rangeParams(range);params.set('source','synthetic');params.set('basis',basis);params.set('payment',payment);
 const {request,retry}=useReport<MethodReport>(methodsApi+'?'+params);
 const data=request?.state==='ready'?request.value:undefined;
 function dates(next:RangeSelection){setRange(next);const query=rangeParams(next);if(payment!=='all')query.set('payment',payment);
  window.history.replaceState(null,'',window.location.pathname+'?'+query);}
 return <section className="sales-crm-group" aria-label="Reporting methods">
  <label>Reporting method <select value={basis} onChange={event=>setBasis(event.target.value as ReportingBasis)}>
   <option value="verified">Verified Sales</option><option value="operational">Operational Sales</option>
  </select></label>
  {!request&&<p role="status">Loading reporting basis…</p>}
  {request&&request.state!=='ready'&&<p role="alert">Reporting basis unavailable. <button onClick={retry}>Retry basis</button></p>}
  {data&&<article className="panel sales-crm-card">
   <h2>{data.label}</h2>
   <dl className="reconciliation-fields">
    <dt>Reporting basis</dt><dd>{data.label} · Synthetic data</dd>
    <dt>Recognition date</dt><dd>{data.recognitionDate}</dd><dt>Amount definition</dt><dd>{data.amountDefinition}</dd>
    <dt>Date range</dt><dd>{data.range.selected.start} to {data.range.selected.end} · {data.range.timeZone}</dd>
    <dt>Source freshness</dt><dd>Last successful sample sync: {data.lastSuccessfulSync??'Unknown'}. Last observation: {data.lastObservedAt??'Unknown'}.</dd>
    <dt>Data coverage</dt><dd>{data.completeness} · starts {data.coverageStart}</dd>
    <dt>Verification status</dt><dd>{data.verification} {data.unverifiedCount} sample records await reconciliation across all dates.</dd>
   </dl>
   {data.completeness!=='complete'&&<p role="status">Incomplete reporting coverage or verification. Missing history does not mean zero revenue.</p>}
   {data.coverageIncomplete&&<p role="status">The selected range includes dates before the {data.coverageStart} baseline.</p>}
   <p>{basis==='operational'?'Operational Sales is provisional and is excluded from official commissions.':'Original verified recognition and historical credit are preserved.'}</p>
  </article>}
  {basis==='verified'?<SalesReporting dashboard={true} onRangeChange={setRange}/>:<>
   <FilterDates selection={range} loaded={data?.range} onChange={dates}/>
   <label>Operational invoice status <select value={payment} onChange={event=>setPayment(event.target.value as PaymentFilter)}>
    <option value="all">All</option><option value="open">Open</option><option value="closed">Closed</option>
   </select></label>
   {data&&<article className="panel sales-crm-card"><h3>Operational Sales</h3>
    <strong>{data.totals===null?'Totals unavailable — incomplete evidence or coverage':data.totals.length?
      data.totals.map(row=>row.currency+' '+row.subtotal).join(' · '):'No qualifying sample invoices'}</strong>
    <p>{data.count} known qualifying sample invoices</p>
    <div className="reporting-table" tabIndex={0} role="region" aria-label="Operational invoice table"><table>
     <thead><tr><th>Invoice</th><th>Invoice date</th><th>Current final total</th><th>Current status</th></tr></thead>
     <tbody>{data.invoices.map(invoice=><tr key={invoice.id}><td>{invoice.number}</td><td>{invoice.date}</td>
      <td>{invoice.currency} {invoice.amount}</td><td>{invoice.status}</td></tr>)}</tbody>
    </table></div><p>Showing up to 20 sample rows. Totals use all qualifying rows.</p>
   </article>}
  </>}
 </section>;
}
