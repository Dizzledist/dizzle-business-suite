import { type MethodReport, type ReportingBasis } from '../../../shared/historical-evidence';
import { parseRange, rangeParams, reportingApi, type PaymentFilter, type ReportingPage, type CurrencyTotal } from '../../../shared/reporting';
import { ApiError } from '../../workflow';
import type { ZohoInvoice } from '../zoho/invoice';
import type { SyntheticReporting } from './demo';
import { managementQualifies } from './reconciliation';
import { getScopedReporting } from './routes';
import { demoOrganization, decimalAmount, moneyUnits } from './model';
import { transaction } from './database';

export function reportingMethod(url:URL, reporting:SyntheticReporting|undefined, tenant:string):MethodReport {
 if(tenant!==demoOrganization)throw new ApiError(403,'Synthetic reporting is unavailable for this tenant.');
 if(!reporting)throw new ApiError(503,'Synthetic reporting unavailable.');
 const allowed=new Set(['source','basis','preset','start','end','payment']);
 for(const key of url.searchParams.keys())if(!allowed.has(key)||url.searchParams.getAll(key).length!==1)throw new ApiError(400,'Invalid reporting method query.');
 if(url.searchParams.get('source')!=='synthetic')throw new ApiError(400,'Select the synthetic source.');
 const basis=url.searchParams.get('basis')??'verified',payment=url.searchParams.get('payment')??'all';
 if(!['verified','operational'].includes(basis)||!['all','open','closed'].includes(payment))throw new ApiError(400,'Invalid reporting method.');
 let selection;try{selection=parseRange(url.searchParams);}catch{throw new ApiError(400,'Invalid date range.');}
 const calculate=():MethodReport=>{
  const range=reporting.calendar.resolve(selection,reporting.now());
  const state=reporting.db.prepare('SELECT initial_done,status,last_success_at FROM reporting_sync_state WHERE organization_id=?').get(tenant);
  const rows=reporting.db.prepare(`SELECT invoice_id,current_snapshot,last_sync_at,verification,send_verification,amount_verification,review_reason
   FROM reporting_invoices WHERE organization_id=? ORDER BY invoice_id`).all(tenant);
  const unverified=rows.filter(row=>row.verification!=='verified'||row.send_verification!=='verified'||
   row.amount_verification!=='verified'||row.review_reason!==null).length;
  let missing=0;
  const snapshots:ZohoInvoice[]=rows.flatMap(row=>{
   if(!row.current_snapshot){missing++;return [];}
   const source=JSON.parse(String(row.current_snapshot)) as ZohoInvoice;
   if(source.organizationId!==tenant||source.invoiceId!==row.invoice_id){missing++;return [];}
   return [source];
  });
  const incomplete=range.selected.from<reporting.coverageFrom;
  const knownCoverage=state?.initial_done===1&&state.status==='complete'&&!incomplete&&missing===0;
  let totals:CurrencyTotal[]=[],invoices:MethodReport['invoices']=[],count=0;
  if(basis==='verified'){
   const params=rangeParams(selection);params.set('payment',payment);
   const verified=getScopedReporting(new URL('http://localhost'+reportingApi+'?'+params),reporting,{organizationId:tenant,credit:'all'},true) as ReportingPage;
   totals=verified.invoiceTotals;count=verified.count;
   invoices=verified.invoices.map(invoice=>({id:invoice.id,number:invoice.number,date:reporting.calendar.localDate(Date.parse(invoice.firstEmailAt)),
    currency:invoice.currency,amount:invoice.subtotal,status:invoice.status}));
  }else{
   const selected=snapshots.filter(source=>managementQualifies(source,range.selected.start,range.selected.end,
    reporting.calendar.localDate(reporting.now()),reporting.coverageStart)).filter(source=>{
     // Management: paid is Closed; every other nonempty status is Open.
     const status=source.status.trim().toLowerCase();
     return payment==='all'||payment==='closed'&&status==='paid'||payment==='open'&&!!status&&status!=='paid';
    });
   const grouped=new Map<string,{value:bigint;count:number}>();
   for(const source of selected){
    const value=grouped.get(source.currency)??{value:0n,count:0};
    value.value+=moneyUnits(source.total);value.count++;grouped.set(source.currency,value);
   }
   totals=[...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([currency,value])=>({currency,subtotal:decimalAmount(value.value),count:value.count}));
   count=selected.length;
   invoices=selected.slice(0,20).map(source=>({id:source.invoiceId,number:source.invoiceNumber,date:source.invoiceDate!,
    currency:source.currency,amount:source.total,status:source.status}));
  }
  const last=Math.max(0,...rows.map(row=>Number(row.last_sync_at)));
  return {source:'synthetic',basis:basis as ReportingBasis,label:basis==='verified'?'Verified Sales':'Operational Sales: Dizzle Management Method',
   recognitionDate:basis==='verified'?'First verified successful email':'Invoice date',
   amountDefinition:basis==='verified'?'Verified original subtotal':'Current final invoice total',
   range,payment:payment as PaymentFilter,coverageStart:reporting.coverageStart,coverageIncomplete:incomplete,
   completeness:knownCoverage?(basis==='verified'&&unverified?'incomplete':'complete'):state?'incomplete':'unknown',
   lastSuccessfulSync:typeof state?.last_success_at==='number'?new Date(state.last_success_at).toISOString():null,
   lastObservedAt:last?new Date(last).toISOString():null,
   verification:basis==='verified'?'Only independently verified recognition qualifies.':'Operational eligibility is provisional and does not verify first-send revenue.',
   commissionEligible:false,totals:knownCoverage&&(basis==='operational'||count>0||!unverified)?totals:null,
   count,unverifiedCount:unverified,missingCurrentSnapshots:missing,invoices};
 };
 return basis==='operational'?transaction(reporting.db,calculate,'read'):calculate();
}
