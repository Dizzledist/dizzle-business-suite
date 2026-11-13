import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import { verificationStates, type RevenueReview, type EvidenceCheck } from '../../../shared/reconciliation';
import { decimalAmount, exactInstant, moneyUnits, type RecognitionEvidence } from './model';

const evidence = z.object({
  status: z.enum(verificationStates), value: z.string().max(100).nullable(),
  source: z.string().trim().max(200).nullable(),
  type: z.enum(['synthetic-receipt', 'manual-corroboration', 'archived-structured-invoice', 'unclassified-history', 'legacy-attestation']),
  reference: z.string().trim().max(200).nullable(), eventId: z.string().max(100).nullable(),
  verifiedAt: z.string().max(100).nullable(), notes: z.string().max(2000),
}).strict();
const reviewSchema = z.object({
  send: evidence.extend({ successful: z.boolean(), firstSend: z.boolean() }).strict(),
  amount: evidence,
}).strict();

function checkedEvidence(check: EvidenceCheck, now: number): EvidenceCheck {
  if (check.status !== 'verified') return check;
  const at = exactInstant(check.verifiedAt);
  if (!check.source || !check.reference || !check.notes.trim() || at === null || at > now ||
      check.type === 'unclassified-history' || check.value === null) {
    return { ...check, status: 'conflicting' };
  }
  return check;
}

export function validatedReview(input: RevenueReview, now: number): RevenueReview {
  const parsed = reviewSchema.parse(input);
  let send = { ...parsed.send, ...checkedEvidence(parsed.send, now) };
  let amount = checkedEvidence(parsed.amount, now);
  const candidate = exactInstant(send.value);
  if (send.status === 'verified' && (!send.successful || !send.firstSend || candidate === null ||
      candidate > now || candidate > exactInstant(send.verifiedAt)!)) send = { ...send, status: 'conflicting' };
  if (amount.status === 'verified') {
    try {
      if (moneyUnits(amount.value!) < 0n) amount = { ...amount, status: 'conflicting' };
    } catch {
      amount = { ...amount, status: 'conflicting' };
    }
  }
  return { send, amount };
}

export function reviewedRecognition(input: RecognitionEvidence, now: number): RecognitionEvidence {
  if (!input.review) return input;
  const review = validatedReview(input.review, now);
  if (review.send.status === 'conflicting' || review.amount.status === 'conflicting') return { status: 'conflicting', review };
  if (review.send.status !== 'verified' || review.amount.status !== 'verified') {
    return { status: review.send.status === 'unavailable' || review.amount.status === 'unavailable' ? 'unavailable' : 'pending', review };
  }
  if (input.status !== 'verified' || exactInstant(input.firstEmailAt) !== exactInstant(review.send.value) ||
      moneyUnits(input.subtotal) !== moneyUnits(review.amount.value!)) return { status: 'conflicting', review };
  return { ...input, review };
}

export function legacyReview(input: RecognitionEvidence, at: number | null): RevenueReview {
  const proof = input.status === 'verified' ? input : null;
  const common: EvidenceCheck = {
    status: input.status, value: null, source: proof?.source ?? null,
    type: 'legacy-attestation', reference: proof?.id ?? null, eventId: proof?.id ?? null,
    verifiedAt: at === null ? null : new Date(at).toISOString(),
    notes: proof ? 'Previously attested server-side recognition evidence.' : 'Recognition evidence requires review.',
  };
  return {
    send: { ...common, value: proof?.firstEmailAt ?? null, successful: !!proof, firstSend: !!proof },
    amount: { ...common, value: proof?.subtotal ?? null },
  };
}

export function saveEvidenceReview(
  db: DatabaseSync, organizationId: string, invoiceId: string, input: RecognitionEvidence, now: number,
) {
  const previous = db.prepare(`SELECT send_evidence, amount_evidence, send_verification, amount_verification, verification,
    first_email_at, evidence_source, evidence_id, evidence_salesperson_id, currency,
    CAST(recognized_subtotal AS TEXT) AS original_amount FROM reporting_invoices
    WHERE organization_id = ? AND invoice_id = ?`).get(organizationId, invoiceId)!;
  // Current-only refreshes retain the prior independent review.
  if (!input.review && previous.send_evidence !== null &&
      (input.status === 'pending' || input.status === 'unavailable' ||
        input.status === 'verified' && previous.send_verification === 'verified' && previous.amount_verification === 'verified')) return;
  const proof: RecognitionEvidence = !input.review && input.status !== 'verified' && previous.verification === 'verified' &&
    previous.first_email_at !== null && previous.original_amount !== null ? {
      status: 'verified', firstEmailAt: new Date(Number(previous.first_email_at)).toISOString(),
      source: String(previous.evidence_source), id: String(previous.evidence_id), currency: String(previous.currency),
      salespersonId: previous.evidence_salesperson_id === null ? null : String(previous.evidence_salesperson_id),
      subtotal: decimalAmount(BigInt(String(previous.original_amount))),
    } : input;
  const review = input.review ? validatedReview(input.review, now) : legacyReview(proof, input.status === 'verified' ? now : null);
  const send = JSON.stringify(review.send);
  const amount = JSON.stringify(review.amount);
  if (send === previous.send_evidence && amount === previous.amount_evidence) return;
  db.prepare(`UPDATE reporting_invoices SET send_verification = ?, amount_verification = ?, send_evidence = ?, amount_evidence = ?
    WHERE organization_id = ? AND invoice_id = ?`).run(review.send.status, review.amount.status, send, amount, organizationId, invoiceId);
  db.prepare(`INSERT INTO reporting_evidence_reviews (organization_id, invoice_id, reviewed_at, review_data)
    VALUES (?, ?, ?, ?)`).run(organizationId, invoiceId, now, JSON.stringify(review));
}
