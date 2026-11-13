import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IncomingMessage } from 'node:http';
import type { EvidenceArtifact, EvidenceKind, EvidencePage, EvidenceRecord, SourceClock } from '../../../shared/historical-evidence';
import { evidenceApi } from '../../../shared/historical-evidence';
import { verificationStates } from '../../../shared/reconciliation';
import { ApiError } from '../../workflow';
import { readJsonBody } from '../../http-body';
import type { SyntheticReporting } from './demo';
import { demoOrganization, decimalAmount, moneyUnits } from './model';
import { transaction } from './database';
import { syntheticInvoicePdf } from './invoice-pdf';
import { interpretSourceClock } from './source-clock';

type Manifest={source:'synthetic';tenant:string;invoiceId:string;invoiceNumber:string;kind:EvidenceKind;
 original:boolean;originalSubtotal:string|null;currency:string;rawTimestamp:string|null;event:'accepted'|'delivery'|'opened'|null};
type Stored={id:string;organization_id:string;invoice_id:string;source_type:EvidenceKind;artifact_id:string;
 content:Uint8Array;digest:string;manifest:string;manifest_digest:string;provenance:string;registered_by:string;registered_at:number};
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const sources:EvidenceKind[]=['original-email','original-pdf','current-pdf','archived-revision','verified-export',
 'mail-acceptance','delivery-event','opened-event','manual-record'];
function artifacts(reporting:SyntheticReporting,invoiceId:string) {
 const row=reporting.db.prepare(`SELECT invoice_number,currency,first_email_at,
  CAST(recognized_subtotal AS TEXT) AS amount FROM reporting_invoices WHERE organization_id=? AND invoice_id=?`).get(demoOrganization,invoiceId);
 if(!row)throw new ApiError(404,'Synthetic invoice not found.');
 return sources.map(kind=>{
  const original=kind!=='current-pdf'&&row.amount!==null;
  const manifest:Manifest={source:'synthetic',tenant:demoOrganization,invoiceId,invoiceNumber:String(row.invoice_number),kind,
   original,originalSubtotal:original?decimalAmount(BigInt(String(row.amount))):null,currency:String(row.currency),
   rawTimestamp:row.first_email_at===null?null:new Date(Number(row.first_email_at)).toISOString(),
   event:['original-email','mail-acceptance'].includes(kind)?'accepted':kind==='delivery-event'?'delivery':kind==='opened-event'?'opened':null};
  const id=invoiceId+'-'+kind;
  const bytes=syntheticInvoicePdf(invoiceId,[
   'SYNTHETIC EVIDENCE - '+kind,'Invoice: '+manifest.invoiceNumber,'Source organization: '+demoOrganization,
   'Original revision: '+String(original),'Original subtotal: '+(manifest.originalSubtotal??'Unavailable')+' '+manifest.currency,
   'Source timestamp: '+(manifest.rawTimestamp??'Unavailable'),'This fixture requires administrator review.',
  ]);
  return {id,kind,invoiceId,source:'synthetic' as const,label:'Synthetic '+kind.replaceAll('-',' '),manifest,bytes};
 }).filter(artifact=>artifact.bytes!==null);
}
function document(reporting:SyntheticReporting,tenant:string,id:string) {
 const row=reporting.db.prepare('SELECT * FROM reporting_documents WHERE id=? AND organization_id=?').get(id,tenant) as Stored|undefined;
 if(!row)throw new ApiError(404,'Evidence not found.');
 if(hash(row.content)!==row.digest||hash(row.manifest)!==row.manifest_digest)throw new ApiError(409,'Evidence integrity check failed.');
 return row;
}
function project(reporting:SyntheticReporting,row:Stored):EvidenceRecord {
 const reviews=reporting.db.prepare(`SELECT purpose,verification,reviewer_id,reviewed_at,review_data FROM reporting_document_reviews
  WHERE document_id=? ORDER BY id`).all(row.id).map(review=>{
   const data=JSON.parse(String(review.review_data));
   return {purpose:review.purpose as 'send'|'amount',status:review.verification as EvidenceRecord['sendStatus'],
    reviewerId:String(review.reviewer_id),reviewedAt:new Date(Number(review.reviewed_at)).toISOString(),
    notes:String(data.notes),clock:data.clock as SourceClock|null};
  });
 return {id:row.id,invoiceId:row.invoice_id,kind:row.source_type,digest:row.digest,provenance:row.provenance,
  registeredBy:row.registered_by,registeredAt:new Date(row.registered_at).toISOString(),
  sendStatus:reviews.filter(r=>r.purpose==='send').at(-1)?.status??'pending',
  amountStatus:reviews.filter(r=>r.purpose==='amount').at(-1)?.status??'pending',reviews};
}
const register=z.object({source:z.literal('synthetic'),invoiceId:z.string().regex(/^[1-9]\d{0,39}$/),
 artifactId:z.string().max(100),provenance:z.string().trim().min(3).max(300)}).strict();
const reviewSchema=z.object({
 source:z.literal('synthetic'),purpose:z.enum(['send','amount']),status:z.enum(verificationStates),
 expectedRevision:z.number().int().nonnegative(),notes:z.string().trim().min(3).max(1000),
 corroborationReference:z.string().trim().min(3).max(200),identityChecked:z.boolean(),provenanceChecked:z.boolean(),
 originalRevisionChecked:z.boolean(),firstSendChecked:z.boolean(),timezoneChecked:z.boolean(),
 sourceTimezone:z.string().max(100).nullable(),originalAmount:z.string().max(40).nullable(),
 offsetMinutes:z.number().int().min(-840).max(840).optional(),offsetEvidence:z.string().max(200).optional(),
}).strict();

export function registerEvidence(reporting:SyntheticReporting,tenant:string,actor:string,input:unknown) {
 if(tenant!==demoOrganization)throw new ApiError(403,'Synthetic evidence only.');
 const parsed=register.safeParse(input);if(!parsed.success)throw new ApiError(400,'Invalid evidence registration.');
 const data=parsed.data,artifact=artifacts(reporting,data.invoiceId).find(a=>a.id===data.artifactId);
 if(!artifact?.bytes)throw new ApiError(400,'Artifact identity must match the selected invoice.');
 const digest=hash(artifact.bytes),manifest=JSON.stringify(artifact.manifest);
 return transaction(reporting.db,()=>{
  const existing=reporting.db.prepare(`SELECT id FROM reporting_documents WHERE organization_id=? AND invoice_id=? AND digest=? AND source_type=?`)
   .get(tenant,data.invoiceId,digest,artifact.kind);
  if(existing)return project(reporting,document(reporting,tenant,String(existing.id)));
  const id=randomUUID();
  reporting.db.prepare(`INSERT INTO reporting_documents
   (id,organization_id,invoice_id,source,source_type,artifact_id,content,digest,manifest,manifest_digest,provenance,registered_by,registered_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,tenant,data.invoiceId,'synthetic',artifact.kind,artifact.id,artifact.bytes,
    digest,manifest,hash(manifest),data.provenance,actor,reporting.now());
  return project(reporting,document(reporting,tenant,id));
 });
}
export function reviewEvidence(reporting:SyntheticReporting,tenant:string,actor:string,id:string,input:unknown) {
 if(tenant!==demoOrganization)throw new ApiError(403,'Synthetic evidence only.');
 const parsed=reviewSchema.safeParse(input);if(!parsed.success)throw new ApiError(400,'Invalid evidence review.');
 const data=parsed.data;
 return transaction(reporting.db,()=>{
  const row=document(reporting,tenant,id),current=project(reporting,row),manifest=JSON.parse(row.manifest) as Manifest;
  if(current.reviews.length!==data.expectedRevision)throw new ApiError(409,'The evidence review changed. Reload before reviewing.');
  let clock:SourceClock|null=null;
  if(data.purpose==='send')clock=interpretSourceClock({raw:manifest.rawTimestamp??'',timezone:data.sourceTimezone,
   timezoneStatus:data.timezoneChecked?'verified':'pending',reference:data.corroborationReference,
   offsetMinutes:data.offsetMinutes,offsetEvidence:data.offsetEvidence});
  if(data.status==='verified'){
   if(!data.identityChecked||!data.provenanceChecked)throw new ApiError(400,'Independently verify identity and provenance before approval.');
   if(data.purpose==='send'&&(manifest.event!=='accepted'||!data.firstSendChecked||clock?.status!=='verified'))
    throw new ApiError(400,'First successful send and source clock require independent corroboration.');
   if(data.purpose==='amount'){
    let matches=false;try{matches=data.originalAmount!==null&&manifest.originalSubtotal!==null&&
      moneyUnits(data.originalAmount)===moneyUnits(manifest.originalSubtotal);}catch{}
    if(!manifest.original||!data.originalRevisionChecked||!matches)
     throw new ApiError(400,'Original amount must match a corroborated original revision.');
   }
  }
  reporting.db.prepare(`INSERT INTO reporting_document_reviews
   (document_id,purpose,verification,reviewer_id,reviewed_at,review_data) VALUES(?,?,?,?,?,?)`)
   .run(id,data.purpose,data.status,actor,reporting.now(),JSON.stringify({...data,clock,recognitionPromoted:false}));
  return project(reporting,document(reporting,tenant,id));
 });
}
export async function evidenceRoute(req:IncomingMessage,url:URL,reporting:SyntheticReporting|undefined,
 actor:{tenant:string;id:string},mutationProtected:boolean) {
 if(actor.tenant!==demoOrganization)throw new ApiError(403,'Synthetic evidence unavailable for this tenant.');
 if(!reporting)throw new ApiError(503,'Evidence database unavailable.');
 if(req.method==='POST'){
  if(url.search||!mutationProtected)throw new ApiError(403,'Evidence request could not be verified.');
  const input=await readJsonBody(req);
  if(url.pathname===evidenceApi)return registerEvidence(reporting,actor.tenant,actor.id,input);
  const match=new RegExp('^'+evidenceApi+'/([a-f0-9-]{36})/reviews$').exec(url.pathname);
  if(match)return reviewEvidence(reporting,actor.tenant,actor.id,match[1],input);
  throw new ApiError(404,'Route not found.');
 }
 if(req.method!=='GET')throw new ApiError(404,'Route not found.');
 const allowed=new Set(['source','invoiceId']);
 for(const key of url.searchParams.keys())if(!allowed.has(key)||url.searchParams.getAll(key).length!==1)
  throw new ApiError(400,'Invalid evidence query.');
 if(url.searchParams.get('source')!=='synthetic')throw new ApiError(400,'Select the synthetic source.');
 const doc=new RegExp('^'+evidenceApi+'/([a-f0-9-]{36})/document$').exec(url.pathname);
 if(doc){
  if(url.searchParams.has('invoiceId'))throw new ApiError(400,'Document identity is fixed.');
  return Buffer.from(document(reporting,actor.tenant,doc[1]).content);
 }
 if(url.pathname!==evidenceApi)throw new ApiError(404,'Route not found.');
 const invoiceId=url.searchParams.get('invoiceId')??'1001';
 const catalog=artifacts(reporting,invoiceId);
 const records=(reporting.db.prepare('SELECT * FROM reporting_documents WHERE organization_id=? AND invoice_id=? ORDER BY registered_at,id')
  .all(actor.tenant,invoiceId) as Stored[]).map(row=>project(reporting,row));
 return {source:'synthetic',liveAccess:false,invoices:reporting.db.prepare('SELECT invoice_id AS id,invoice_number AS number FROM reporting_invoices WHERE organization_id=? ORDER BY invoice_id').all(actor.tenant),
  artifacts:catalog.map(({id,kind,invoiceId,source,label})=>({id,kind,invoiceId,source,label})),records} as EvidencePage;
}
