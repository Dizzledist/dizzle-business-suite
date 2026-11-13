import { isSalesCrmEnabled } from './sales-crm';
import type { ReportRange, CurrencyTotal, PaymentFilter } from './reporting';
import type { VerificationState } from './reconciliation';

export const methodsApi = '/api/sales-crm/reporting-methods';
export const evidenceApi = '/api/sales-crm/evidence';
export function isHistoricalEvidenceEnabled(env: Record<string, string | undefined>) {
  return isSalesCrmEnabled(env) && env.SALES_HISTORICAL_EVIDENCE_ENABLED === 'true';
}
export type ReportingBasis = 'verified' | 'operational';
export interface SourceClock {
  raw: string; sourceTimezone: string | null; interpretedAt: string | null;
  candidates: string[]; status: VerificationState; reason: string;
  evidenceReference: string | null; precision: 'minute' | 'second' | 'unknown';
}
export interface MethodReport {
  source: 'synthetic'; basis: ReportingBasis; label: string; recognitionDate: string; amountDefinition: string;
  range: ReportRange; payment: PaymentFilter; coverageStart: string; coverageIncomplete: boolean;
  completeness: 'complete' | 'incomplete' | 'unknown'; lastSuccessfulSync: string | null; lastObservedAt: string | null;
  verification: string; commissionEligible: boolean; totals: CurrencyTotal[] | null; count: number;
  unverifiedCount: number; missingCurrentSnapshots: number;
  invoices: {id:string;number:string;date:string;currency:string;amount:string;status:string}[];
}
export type EvidenceKind = 'original-email' | 'original-pdf' | 'current-pdf' | 'archived-revision' |
  'verified-export' | 'mail-acceptance' | 'delivery-event' | 'opened-event' | 'manual-record';
export interface EvidenceArtifact {id:string;kind:EvidenceKind;invoiceId:string;source:'synthetic';label:string}
export interface EvidenceRecord {
 id:string;invoiceId:string;kind:EvidenceKind;digest:string;provenance:string;registeredAt:string;registeredBy:string;
 sendStatus:VerificationState;amountStatus:VerificationState;
 reviews:{purpose:'send'|'amount';status:VerificationState;reviewerId:string;reviewedAt:string;notes:string;clock:SourceClock|null}[];
}
export interface EvidencePage {
 source:'synthetic';artifacts:EvidenceArtifact[];records:EvidenceRecord[];
 invoices:{id:string;number:string}[];liveAccess:false;
}
