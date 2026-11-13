import { afterEach,describe,expect,it } from 'vitest';
import { createHash } from 'node:crypto';
import { createSyntheticReporting,type SyntheticReporting } from '../server/sales-crm/reporting/demo';
import { openReportingDatabase,saveSalesperson,upsertInvoice } from '../server/sales-crm/reporting/database';
import { reportingCalendar } from '../server/sales-crm/reporting/dates';
import { interpretSourceClock } from '../server/sales-crm/reporting/source-clock';
import { registerEvidence,reviewEvidence,evidenceRoute } from '../server/sales-crm/reporting/documents';
import { reportingMethod } from '../server/sales-crm/reporting/methods';
import { prepareProspectiveCapture } from '../server/sales-crm/reporting/prospective-capture';
import { invoiceDetail,mirrorInvoice,type ZohoInvoice } from '../server/sales-crm/zoho/invoice';
import type { RecognitionEvidence } from '../server/sales-crm/reporting/model';
import { methodsApi,isHistoricalEvidenceEnabled } from '../shared/historical-evidence';
import fixture from './fixtures/management-parity-input.json';
import reference from './fixtures/management-parity-reference.json';
const now=Date.parse('2026-11-07T19:00:00Z');
const stores:SyntheticReporting[]=[];
afterEach(()=>{for(const store of stores.splice(0))store.db.close();});
async function demo(){const store=await createSyntheticReporting({path:':memory:',now:()=>now});stores.push(store);return store;}
function clock(raw:string,extra:Partial<Parameters<typeof interpretSourceClock>[0]>={}){
 return interpretSourceClock({raw,timezone:'America/Los_Angeles',timezoneStatus:'verified',reference:'independent-zone-record',...extra});
}
describe('Independent source-clock interpretation',()=>{
 it('retains raw local text without applying the CRM timezone',()=>expect(clock('2026-10-01 00:00:00',{timezone:null,timezoneStatus:'pending'}))
  .toMatchObject({raw:'2026-10-01 00:00:00',sourceTimezone:null,interpretedAt:null,status:'pending'}));
 it('keeps a proposed but unverified source zone unverified',()=>expect(clock('2026-10-01 00:00:00',{timezoneStatus:'pending'}))
  .toMatchObject({status:'pending',interpretedAt:null,candidates:['2026-10-01T07:00:00.000Z']}));
 it('handles the Los Angeles October cutoff',()=>expect(clock('2026-10-01 00:00:00')).toMatchObject({status:'verified',interpretedAt:'2026-10-01T07:00:00.000Z'}));
 it('handles a different source timezone',()=>expect(clock('2026-10-01 00:00:00',{timezone:'Asia/Kolkata'}))
  .toMatchObject({interpretedAt:'2026-09-30T18:30:00.000Z'}));
 it.each(['PST','CST','Not/AZone'])('rejects ambiguous/invalid zone %s',timezone=>expect(clock('2026-10-01 00:00:00',{timezone})).toMatchObject({status:'conflicting',interpretedAt:null}));
 it('rejects the spring daylight saving gap',()=>expect(clock('2026-03-08 02:30:00')).toMatchObject({status:'conflicting',interpretedAt:null,candidates:[]}));
 it('keeps both fall-back candidates',()=>expect(clock('2026-11-01 01:30:00')).toMatchObject({status:'pending',interpretedAt:null,
  candidates:['2026-11-01T08:30:00.000Z','2026-11-01T09:30:00.000Z']}));
 it.each([[-420,'2026-11-01T08:30:00.000Z'],[-480,'2026-11-01T09:30:00.000Z']] as const)('requires corroboration to choose offset %s',(offsetMinutes,at)=>
  expect(clock('2026-11-01 01:30:00',{offsetMinutes,offsetEvidence:'Independent original header'})).toMatchObject({status:'verified',interpretedAt:at}));
 it('rejects an unsupported selected offset',()=>expect(clock('2026-11-01 01:30:00',{offsetMinutes:-360,offsetEvidence:'header'})).toMatchObject({status:'conflicting'}));
 it('never manufactures seconds for a minute-only source',()=>expect(clock('2026-10-01 00:00')).toMatchObject({status:'pending',precision:'minute',interpretedAt:null}));
 it('rejects an explicit offset conflicting with verified IANA data',()=>expect(clock('2026-10-01T00:00:00+00:00')).toMatchObject({status:'conflicting'}));
 it.each(['2026-02-30 12:00:00','2026-10-01 25:00:00','unclassified source'])('holds invalid raw timestamp %s',raw=>expect(clock(raw)).toMatchObject({status:'conflicting',interpretedAt:null}));
});
const register=(store:SyntheticReporting,kind='original-pdf')=>registerEvidence(store,'demo-o1','admin-a',
 {source:'synthetic',invoiceId:'1001',artifactId:'1001-'+kind,provenance:'Independent synthetic archive'});
function reviewBody(extra:Record<string,unknown>={}){
 return {source:'synthetic',purpose:'amount',status:'verified',expectedRevision:0,notes:'Manually corroborated synthetic original.',
  corroborationReference:'independent-archive-1001',identityChecked:true,provenanceChecked:true,originalRevisionChecked:true,
  firstSendChecked:true,timezoneChecked:true,sourceTimezone:'UTC',originalAmount:'925.75',...extra};
}
describe('Protected synthetic document evidence',()=>{
 it('registers an original PDF as pending without changing recognition',async()=>{
  const store=await demo();const before=store.db.prepare('SELECT original_snapshot,recognized_subtotal FROM reporting_invoices WHERE invoice_id=?').get('1001');
  const row=register(store);
  expect(row).toMatchObject({sendStatus:'pending',amountStatus:'pending',registeredBy:'admin-a',reviews:[]});
  expect(register(store).id).toBe(row.id);
  expect(store.db.prepare('SELECT COUNT(*) AS count FROM reporting_documents').get()?.count).toBe(1);
  expect(store.db.prepare('SELECT original_snapshot,recognized_subtotal FROM reporting_invoices WHERE invoice_id=?').get('1001')).toEqual(before);
  const pdf=await evidenceRoute({method:'GET'} as never,new URL('http://localhost/api/sales-crm/evidence/'+row.id+'/document?source=synthetic'),store,{tenant:'demo-o1',id:'admin-a'},false);
  expect(Buffer.isBuffer(pdf)).toBe(true);expect((pdf as Buffer).toString()).toContain('Original subtotal: 925.75 USD');
  expect(createHash('sha256').update(pdf as Buffer).digest('hex')).toBe(row.digest);
 });
 it('records independent amount and send reviews with server actor/time',async()=>{
  const store=await demo(),pdf=register(store),email=register(store,'original-email');
  expect(reviewEvidence(store,'demo-o1','reviewer-b',pdf.id,reviewBody())).toMatchObject({amountStatus:'verified',sendStatus:'pending',
   reviews:[{reviewerId:'reviewer-b',reviewedAt:new Date(now).toISOString()}]});
  expect(reviewEvidence(store,'demo-o1','reviewer-b',email.id,reviewBody({purpose:'send',originalAmount:null})))
   .toMatchObject({sendStatus:'verified',amountStatus:'pending',reviews:[{clock:{status:'verified'}}]});
 });
 it('requires a review independently of registration',async()=>{
  const store=await demo(),pdf=register(store);
  expect(()=>reviewEvidence(store,'demo-o1','admin-a',pdf.id,reviewBody({provenanceChecked:false}))).toThrow('Independently');
  expect(()=>reviewEvidence(store,'demo-o1','admin-a',pdf.id,reviewBody({originalRevisionChecked:false}))).toThrow('Original amount');
  expect(()=>reviewEvidence(store,'demo-o1','admin-a',pdf.id,reviewBody({originalAmount:'1000'}))).toThrow('Original amount');
 });
 it.each(['current-pdf','delivery-event','opened-event'])('cannot treat %s as first-send proof',async kind=>{
  const store=await demo(),row=register(store,kind);
  expect(()=>reviewEvidence(store,'demo-o1','admin-a',row.id,reviewBody({purpose:'send'}))).toThrow('First successful send');
 });
 it('cannot treat a current PDF as an original amount',async()=>{
  const store=await demo(),row=register(store,'current-pdf');
  expect(()=>reviewEvidence(store,'demo-o1','admin-a',row.id,reviewBody())).toThrow('Original amount');
 });
 it('preserves conflicting review history and rejects stale reviewer state',async()=>{
  const store=await demo(),row=register(store);
  reviewEvidence(store,'demo-o1','admin-a',row.id,reviewBody());
  expect(()=>reviewEvidence(store,'demo-o1','admin-a',row.id,reviewBody())).toThrow('changed');
  const conflict=reviewEvidence(store,'demo-o1','reviewer-b',row.id,reviewBody({status:'conflicting',expectedRevision:1}));
  expect(conflict).toMatchObject({amountStatus:'conflicting',reviews:[{status:'verified'},{status:'conflicting'}]});
 });
 it('rejects identity, provider-source and field injection',async()=>{
  const store=await demo();
  expect(()=>registerEvidence(store,'demo-o1','admin-a',{source:'synthetic',invoiceId:'1002',artifactId:'1001-original-pdf',provenance:'archive'})).toThrow('identity');
  expect(()=>registerEvidence(store,'demo-o1','admin-a',{source:'live',invoiceId:'1001',artifactId:'1001-original-pdf',provenance:'archive'})).toThrow('Invalid');
  expect(()=>registerEvidence(store,'another-tenant','admin-a',{})).toThrow('Synthetic');
 });
 it.each(['content','manifest'])('blocks a tampered %s',async field=>{
  const store=await demo(),row=register(store);
  if(field==='content')store.db.prepare('UPDATE reporting_documents SET content=? WHERE id=?').run(Buffer.from('tampered'),row.id);
  else store.db.prepare('UPDATE reporting_documents SET manifest=? WHERE id=?').run('{"tampered":true}',row.id);
  expect(()=>reviewEvidence(store,'demo-o1','admin-a',row.id,reviewBody())).toThrow('integrity');
 });
});
async function parity(){
 const db=openReportingDatabase(':memory:'),calendar=reportingCalendar('America/Los_Angeles');
 const store={db,calendar,now:()=>now,coverageStart:'2026-10-01',coverageFrom:calendar.startOfDay('2026-10-01')};stores.push(store);
 saveSalesperson(db,'demo-o1','501','rep-a','Fixture rep');
 for(const item of fixture.invoices){
  const source=mirrorInvoice('demo-o1',invoiceDetail.parse({invoice:item.zoho}).invoice);
  const proof:RecognitionEvidence=item.firstEmailAt&&item.originalSubtotal?{status:'verified',firstEmailAt:item.firstEmailAt,
   subtotal:item.originalSubtotal,source:'Synthetic archived receipt',id:'receipt-'+source.invoiceId,salespersonId:'501',currency:'USD'}:{status:'pending'};
  upsertInvoice(db,source,proof,now);
 }
 db.prepare("INSERT INTO reporting_sync_state(organization_id,initial_done,status,last_success_at) VALUES(?,1,'complete',?)").run('demo-o1',now);
 return store;
}
const method=(store:SyntheticReporting,basis='operational',filter='all',range='preset=last-month')=>reportingMethod(
 new URL('http://localhost'+methodsApi+'?source=synthetic&basis='+basis+'&payment='+filter+'&'+range),store,'demo-o1');
describe('Independent operational and verified reporting',()=>{
 it.each(['all','open','closed'] as const)('preserves Management %s parity',async filter=>{
  const store=await parity(),result=method(store,'operational',filter),expected=reference.filters[filter];
  expect(result).toMatchObject({count:expected.count,totals:[{currency:'USD',subtotal:expected.sales.toFixed(2),count:expected.count}],
   label:'Operational Sales: Dizzle Management Method',commissionEligible:false});
 });
 it('preserves the official three/300 and operational four/414 definitions',async()=>{
  const store=await parity();
  expect(method(store,'verified')).toMatchObject({count:3,totals:[{currency:'USD',subtotal:'300.00',count:3}],completeness:'incomplete'});
  expect(method(store)).toMatchObject({count:4,totals:[{currency:'USD',subtotal:'414.00',count:4}]});
 });
 it('does not show missing historical coverage as zero',async()=>{
  const store=await parity();expect(method(store,'operational','all','preset=custom&start=2026-09-01&end=2026-09-30'))
   .toMatchObject({totals:null,coverageIncomplete:true,completeness:'incomplete'});
  store.db.prepare('UPDATE reporting_sync_state SET initial_done=0').run();
  expect(method(store)).toMatchObject({totals:null,completeness:'incomplete'});
 });
 it('withholds totals for missing source snapshots',async()=>{
  const store=await parity();store.db.prepare("UPDATE reporting_invoices SET current_snapshot=NULL WHERE invoice_id='5002'").run();
  expect(method(store)).toMatchObject({totals:null,missingCurrentSnapshots:1});
 });
 it.each(['mtd','qtd','last-quarter','ytd','custom'])('uses shared calendar for %s',async preset=>{
  const store=await parity(),range=preset==='custom'?'preset=custom&start=2026-10-01&end=2026-10-31':'preset='+preset;
  expect(method(store,'operational','all',range).range.timeZone).toBe('America/Los_Angeles');
 });
 it('rejects unauthorized sources, tenants, org switching and duplicate parameters',async()=>{
  const store=await parity();
  for(const query of ['source=live','source=synthetic&organizationId=821729823','source=synthetic&basis=operational&basis=verified']){
   expect(()=>reportingMethod(new URL('http://localhost'+methodsApi+'?'+query),store,'demo-o1')).toThrow();
  }
  expect(()=>reportingMethod(new URL('http://localhost'+methodsApi+'?source=synthetic'),store,'another-tenant')).toThrow();
  expect(isHistoricalEvidenceEnabled({NODE_ENV:'production',SALES_CRM_ENABLED:'true',SALES_HISTORICAL_EVIDENCE_ENABLED:'true'})).toBe(false);
 });
});
describe('Prospective capture proof gate',()=>{
 async function bundle(){
  const store=await demo();const row=store.db.prepare("SELECT original_snapshot FROM reporting_invoices WHERE invoice_id='1001'").get()!;
  const snapshot=JSON.parse(String(row.original_snapshot)) as ZohoInvoice;
  const event={kind:'send-accepted' as const,organizationId:snapshot.organizationId,invoiceId:snapshot.invoiceId,eventId:'accepted-event-1',
   reference:'Independent provider receipt',verified:true,firstSendConfirmed:true,
   clock:interpretSourceClock({raw:snapshot.sourceModifiedAt!,timezone:'UTC',timezoneStatus:'verified',reference:'Original receipt timezone'})};
  const amount={status:'verified' as const,reference:'Original structured archive',subtotal:snapshot.subtotal,currency:snapshot.currency,
   salespersonId:snapshot.sourceSalespersonId,originalRevision:snapshot.sourceModifiedAt,revisionAtFirstSendVerified:true};
  return {snapshot,event,amount};
 }
 it.each(['status-sent','delivery','opened','resend','modified'] as const)('does not recognize a %s event',async kind=>{
  const b=await bundle();expect(prepareProspectiveCapture(b.snapshot,{...b.event,kind},b.amount,now)).toMatchObject({status:'pending'});
 });
 it('requires verified original revision, first-success semantics and timezone',async()=>{
  const b=await bundle();
  expect(prepareProspectiveCapture(b.snapshot,{...b.event,firstSendConfirmed:false},b.amount,now)).toMatchObject({status:'pending'});
  expect(prepareProspectiveCapture(b.snapshot,b.event,{...b.amount,revisionAtFirstSendVerified:false},now)).toMatchObject({status:'pending'});
  expect(prepareProspectiveCapture(b.snapshot,{...b.event,clock:{...b.event.clock,status:'pending'}},b.amount,now)).toMatchObject({status:'pending'});
  expect(prepareProspectiveCapture(b.snapshot,{...b.event,organizationId:'another'},b.amount,now)).toMatchObject({status:'conflicting'});
 });
 it('builds an idempotent plan while later edits retain original amount, quantities and credit',async()=>{
  const b=await bundle(),result=prepareProspectiveCapture(b.snapshot,b.event,b.amount,now);
  expect(result.status).toBe('ready');if(result.status!=='ready')throw Error();
  const db=openReportingDatabase(':memory:');try{
   saveSalesperson(db,'demo-o1',b.snapshot.sourceSalespersonId!,'original-rep','Original rep');
   upsertInvoice(db,b.snapshot,result.evidence,now);upsertInvoice(db,b.snapshot,result.evidence,now);
   const original=db.prepare('SELECT original_snapshot,recognized_subtotal,credited_user_id FROM reporting_invoices').get()!;
   upsertInvoice(db,{...b.snapshot,subtotal:'2000',total:'2000',balance:'2000',sourceModifiedAt:new Date(now).toISOString()},{status:'pending'},now);
   expect(db.prepare('SELECT original_snapshot,recognized_subtotal,credited_user_id FROM reporting_invoices').get()).toEqual(original);
   expect(db.prepare('SELECT COUNT(*) AS count FROM reporting_invoices').get()?.count).toBe(1);
  }finally{db.close();}
 });
});
