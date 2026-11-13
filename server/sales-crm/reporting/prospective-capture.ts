import { createHash } from 'node:crypto';
import type { SourceClock } from '../../../shared/historical-evidence';
import type { ZohoInvoice } from '../zoho/invoice';
import type { VerificationState } from '../../../shared/reconciliation';
import { exactInstant, moneyUnits, type RecognitionEvidence } from './model';

export function prepareProspectiveCapture(snapshot:ZohoInvoice,event:{
 kind:'send-accepted'|'status-sent'|'delivery'|'opened'|'resend'|'modified';
 organizationId:string;invoiceId:string;eventId:string;reference:string;verified:boolean;firstSendConfirmed:boolean;clock:SourceClock;
},amount:{
 status:VerificationState;reference:string;subtotal:string;currency:string;salespersonId:string|null;
 originalRevision:string|null;revisionAtFirstSendVerified:boolean;
},now:number):{status:'pending'|'conflicting';reason:string}|{status:'ready';eventKey:string;snapshotDigest:string;evidence:RecognitionEvidence} {
 if(event.organizationId!==snapshot.organizationId||event.invoiceId!==snapshot.invoiceId)
  return {status:'conflicting',reason:'Source invoice identity mismatch.'};
 if(event.kind!=='send-accepted'||!event.verified||!event.firstSendConfirmed)
  return {status:'pending',reason:'A verified first successful send is required; status, delivery, opening and resends cannot substitute.'};
 if(event.clock.status!=='verified'||!event.clock.interpretedAt)
  return {status:'pending',reason:'Source timestamp interpretation is unverified.'};
 const first=exactInstant(event.clock.interpretedAt),revision=exactInstant(amount.originalRevision);
 if(first===null||first>now)return {status:'conflicting',reason:'Invalid first-send instant.'};
 if(amount.status!=='verified'||!amount.revisionAtFirstSendVerified||!amount.reference.trim()||
    revision===null||revision>first||snapshot.sourceModifiedAt!==amount.originalRevision||!snapshot.lineItems?.length)
  return {status:'pending',reason:'An independently verified original amount and structured revision at first send are required.'};
 let matches=false;try{matches=moneyUnits(amount.subtotal)>=0n&&moneyUnits(amount.subtotal)===moneyUnits(snapshot.subtotal);}catch{}
 if(!matches||amount.currency!==snapshot.currency||!event.reference.trim()||!event.eventId.trim())
  return {status:'conflicting',reason:'Original snapshot and evidence conflict.'};
 const at=new Date(now).toISOString();
 return {status:'ready',eventKey:event.organizationId+':'+event.eventId,
  snapshotDigest:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
  evidence:{status:'verified',firstEmailAt:event.clock.interpretedAt,source:'Reviewed prospective first-send receipt',
   id:event.eventId,subtotal:amount.subtotal,currency:amount.currency,salespersonId:amount.salespersonId,
   originalLineRevision:amount.originalRevision!,review:{
    send:{status:'verified',value:event.clock.interpretedAt,source:'Reviewed prospective first-send receipt',
     type:'manual-corroboration',reference:event.reference,eventId:event.eventId,verifiedAt:at,
     notes:'First successful send independently corroborated; clock provenance retained separately.',successful:true,firstSend:true},
    amount:{status:'verified',value:amount.subtotal,source:'Verified original structured revision',
     type:'archived-structured-invoice',reference:amount.reference,eventId:null,verifiedAt:at,
     notes:'Original subtotal, quantities and credit independently established at first send.'},
   }}};
}
