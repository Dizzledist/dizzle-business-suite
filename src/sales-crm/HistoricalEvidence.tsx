import { useState, type FormEvent } from 'react';
import { evidenceApi, type EvidencePage, type EvidenceRecord } from '../../shared/historical-evidence';
import type { SalesSessionView } from '../../shared/sales-auth';
import { requestSales } from './access';
import { useReport } from './Reporting';

export function HistoricalEvidence({session}:{session:SalesSessionView}) {
 const [invoiceId,setInvoiceId]=useState('1001'),[artifact,setArtifact]=useState('1001-original-pdf');
 const [provenance,setProvenance]=useState('Synthetic archive reference'),[notice,setNotice]=useState('');
 const [selected,setSelected]=useState<EvidenceRecord|null>(null);
 const [purpose,setPurpose]=useState<'send'|'amount'>('amount'),[status,setStatus]=useState<'pending'|'verified'|'unavailable'|'conflicting'>('pending');
 const [notes,setNotes]=useState(''),[reference,setReference]=useState(''),[amount,setAmount]=useState(''),[zone,setZone]=useState('UTC');
 const [checks,setChecks]=useState({identityChecked:false,provenanceChecked:false,originalRevisionChecked:false,firstSendChecked:false,timezoneChecked:false});
 const {request,retry}=useReport<EvidencePage>(evidenceApi+'?source=synthetic&invoiceId='+invoiceId);
 const data=request?.state==='ready'?request.value:undefined;
 async function mutate(path:string,body:unknown){
  const response=await requestSales(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify(body)});
  if(!response.ok){const error=await response.json();throw Error(error.error??'Evidence action failed.');}
  return await response.json() as EvidenceRecord;
 }
 async function register(event:FormEvent){event.preventDefault();setNotice('');
  try{const row=await mutate(evidenceApi,{source:'synthetic',invoiceId,artifactId:artifact,provenance});setSelected(row);setNotice('Evidence registered as pending. No sale was recognized.');retry();}
  catch(error){setNotice(error instanceof Error?error.message:'Registration unavailable.');}
 }
 async function review(event:FormEvent){event.preventDefault();if(!selected)return;setNotice('');
  try{const row=await mutate(evidenceApi+'/'+selected.id+'/reviews',{source:'synthetic',purpose,status,expectedRevision:selected.reviews.length,
    notes,corroborationReference:reference,...checks,sourceTimezone:zone||null,originalAmount:amount||null});
   setSelected(row);setNotice('Review recorded. Official sales recognition is unchanged.');retry();}
  catch(error){setNotice(error instanceof Error?error.message:'Review unavailable.');}
 }
 return <section className="sales-crm-group" aria-label="Historical evidence">
  <p>Administrator review of synthetic documents. No live documents, emails or financial access are enabled.</p>
  <p>Registration does not verify a send date or original amount. Review each field against independently obtained evidence.</p>
  {notice&&<p role="status">{notice}</p>}
  {!request&&<p>Loading evidence…</p>}
  {request&&request.state!=='ready'&&<p role="alert">Evidence is unavailable. <button onClick={retry}>Retry evidence</button></p>}
  {data&&<>
   <form className="panel sales-crm-card evidence-form" onSubmit={register}>
    <h2>Register synthetic evidence</h2>
    <label>Synthetic invoice <select value={invoiceId} onChange={event=>{setInvoiceId(event.target.value);setArtifact(event.target.value+'-original-pdf');setSelected(null);}}>
     {data.invoices.map(invoice=><option key={invoice.id} value={invoice.id}>{invoice.number}</option>)}
    </select></label>
    <label>Evidence artifact <select value={artifact} onChange={event=>setArtifact(event.target.value)}>
     {data.artifacts.map(doc=><option key={doc.id} value={doc.id}>{doc.label}</option>)}
    </select></label>
    <label>Source and provenance reference<input value={provenance} onChange={event=>setProvenance(event.target.value)} required minLength={3} maxLength={300}/></label>
    <button disabled={!data.artifacts.some(doc=>doc.id===artifact)}>Register evidence</button>
   </form>
   <section className="panel sales-crm-card"><h2>Registered evidence</h2>
    {!data.records.length&&<p>No evidence registered for this sample invoice.</p>}
    {data.records.map(row=><article key={row.id}>
     <h3>{row.kind}</h3><p>Email evidence: {row.sendStatus} · Original amount: {row.amountStatus}</p>
     <p>SHA-256: <code className="evidence-digest">{row.digest}</code></p>
     <p>Registered by {row.registeredBy} at {row.registeredAt}</p>
     <a href={evidenceApi+'/'+row.id+'/document?source=synthetic'} target="_blank" rel="noreferrer">Open protected evidence PDF</a>
     {' '}<button onClick={()=>{setSelected(row);setChecks({identityChecked:false,provenanceChecked:false,originalRevisionChecked:false,firstSendChecked:false,timezoneChecked:false});}}>Review document</button>
     {row.reviews.map((review,index)=><p key={index}>{review.purpose}: {review.status} · Reviewer {review.reviewerId} · {review.reviewedAt} · {review.notes}
       {review.clock&&<> · Clock: {review.clock.status}. {review.clock.reason}</>}</p>)}
    </article>)}
   </section>
   {selected&&<form className="panel sales-crm-card evidence-form" onSubmit={review}>
    <h2>Review evidence</h2>
    <p>Review concerns {selected.kind}. A current PDF cannot establish an original sent revision.</p>
    <label>Evidence purpose<select value={purpose} onChange={event=>setPurpose(event.target.value as 'send'|'amount')}><option value="send">First successful send</option><option value="amount">Original subtotal</option></select></label>
    <label>Verification state<select value={status} onChange={event=>setStatus(event.target.value as typeof status)}>
     {['pending','verified','unavailable','conflicting'].map(value=><option key={value}>{value}</option>)}</select></label>
    <label>Independent corroboration reference<input required minLength={3} maxLength={200} value={reference} onChange={event=>setReference(event.target.value)}/></label>
    <label>Review notes<textarea required minLength={3} maxLength={1000} value={notes} onChange={event=>setNotes(event.target.value)}/></label>
    <label>Original subtotal from evidence<input value={amount} onChange={event=>setAmount(event.target.value)} maxLength={40}/></label>
    <label>Verified source IANA timezone<input value={zone} onChange={event=>setZone(event.target.value)} maxLength={100}/></label>
    {Object.entries(checks).map(([key,value])=><label key={key}><input type="checkbox" checked={value} onChange={event=>setChecks({...checks,[key]:event.target.checked})}/>
     {({identityChecked:'Invoice and organization identity checked',provenanceChecked:'Provenance independently checked',originalRevisionChecked:'Original revision independently established',firstSendChecked:'Earliest successful send independently established',timezoneChecked:'Source timezone independently verified'} as Record<string,string>)[key]}</label>)}
    <button>Record review</button>
   </form>}
  </>}
 </section>;
}
