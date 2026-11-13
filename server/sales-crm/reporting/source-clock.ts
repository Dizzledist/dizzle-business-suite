import type { SourceClock } from '../../../shared/historical-evidence';
import type { VerificationState } from '../../../shared/reconciliation';
import { calendarDay } from '../../../shared/reporting';
import { exactInstant } from './model';

export function interpretSourceClock(input: {
 raw:string;timezone:string|null;timezoneStatus:VerificationState;reference:string|null;
 offsetMinutes?:number;offsetEvidence?:string;
}):SourceClock {
 const result:SourceClock={raw:input.raw,sourceTimezone:input.timezone,interpretedAt:null,candidates:[],
  status:'pending',reason:'Source timezone requires independent verification.',evidenceReference:input.reference,precision:'unknown'};
 const explicit=exactInstant(input.raw);
 const match=/^(\d{4}-\d{2}-\d{2})[ T]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(input.raw);
 if(explicit===null&&!match)return {...result,status:'conflicting',reason:'Invalid or unsupported source timestamp.'};
 result.precision=explicit!==null||match?.[4]!==undefined?'second':'minute';
 let formatter:Intl.DateTimeFormat;
 try { if(!input.timezone) return result;
  formatter=new Intl.DateTimeFormat('en-CA',{timeZone:input.timezone,calendar:'gregory',numberingSystem:'latn',
   year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 }catch{return {...result,status:'conflicting',reason:'Use an unambiguous IANA source timezone.'};}
 if(!input.timezone.includes('/')&&input.timezone!=='UTC')return {...result,status:'conflicting',reason:'Timezone abbreviations are not sufficient.'};
 const parts=(at:number)=>Object.fromEntries(formatter.formatToParts(at).map(p=>[p.type,p.value]));
 const wall=(at:number)=>{const p=parts(at);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);};
 if(explicit!==null) {
  result.candidates=[new Date(explicit).toISOString()];
 } else {
  try {calendarDay(match![1]);}catch{return {...result,status:'conflicting',reason:'Invalid calendar date.'};}
  const target=Date.parse(match![1]+'T'+match![2]+':'+match![3]+':'+(match![4]??'00')+'Z');
  const offsets=new Set<number>();
  for(let h=-48;h<=48;h++) {const at=target+h*3600000;offsets.add(wall(at)-at);}
  result.candidates=[...offsets].map(offset=>target-offset).filter(at=>wall(at)===target)
   .sort((a,b)=>a-b).map(at=>new Date(at).toISOString());
  if(!result.candidates.length)return {...result,status:'conflicting',reason:'Local time does not exist during the daylight saving transition.'};
 }
 if(input.timezoneStatus!=='verified'||!input.reference?.trim())return result;
 if(explicit!==null){
  const local=input.raw.replace(/(?:Z|[+-]\d{2}:?\d{2})$/,'Z');
  const declared=(Date.parse(local)-explicit)/60000;
  const rounded=Math.floor(explicit/1000)*1000;
  if((wall(rounded)-rounded)/60000!==declared)return {...result,status:'conflicting',reason:'Explicit offset conflicts with the verified IANA timezone.'};
 }
 if(input.offsetMinutes!==undefined) {
  if(!Number.isInteger(input.offsetMinutes)||Math.abs(input.offsetMinutes)>840||!input.offsetEvidence?.trim())
   return {...result,status:'conflicting',reason:'Offset selection requires independent evidence.'};
  result.candidates=result.candidates.filter(value=>{
   const at=Date.parse(value);return (wall(at)-at)/60000===input.offsetMinutes;
  });
  if(!result.candidates.length)return {...result,status:'conflicting',reason:'Selected offset conflicts with the source timezone.'};
 }
 if(result.candidates.length>1)return {...result,reason:'Ambiguous local time. Independently verify its UTC offset.'};
 if(result.precision==='minute')return {...result,reason:'Minute precision is retained. Exact seconds are unverified.'};
 return {...result,interpretedAt:result.candidates[0],status:'verified',
  reason:'Clock interpretation verified; email success and first-send semantics require separate evidence.'};
}
