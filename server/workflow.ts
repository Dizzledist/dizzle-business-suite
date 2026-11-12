import { randomUUID } from 'node:crypto';
import type { DemoEvent, Identity, InvoiceView, JobView, ReleaseAudit, Workspace } from '../shared/contracts';
import { FIXTURE_NOTICE, FRESHNESS_MS, identityFixtures, invoiceFixtures, type InvoiceRecord } from './fixtures';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
interface JobRecord { id: string; invoiceId: string; audit: ReleaseAudit }
// Synchronous mutations in one local process: no await between checks and inserts.
// Persistence, multi-process transactions, worker recovery and durable audit are deferred.
export class Workflow {
  identities = identityFixtures();
  private invoices: InvoiceRecord[];
  private jobs = new Map<string, JobRecord>();
  private events = new Set<string>();
  constructor(private now: () => number = Date.now) { this.invoices = invoiceFixtures(now()); }
  reset() { this.invoices = invoiceFixtures(this.now()); this.jobs.clear(); this.events.clear(); }
  authenticate(id: string | undefined): Identity {
    const actor = this.identities.find(i => i.id === id);
    if (!actor || !actor.active) throw new ApiError(401, 'Active local test identity required.');
    if (!actor.read) throw new ApiError(403, 'Read permission revoked.');
    return actor;
  }
  private broad(actor: Identity) { return actor.roles.some(r => ['owner', 'admin', 'sales_manager'].includes(r)); }
  private canRead(actor: Identity, invoice: InvoiceRecord) {
    return actor.organizationId === invoice.organizationId && (this.broad(actor) ||
      (actor.roles.includes('sales_rep') && invoice.assignedRep === actor.id));
  }
  isAssignedToAccount(actor: Identity, accountId: string) {
    return actor.roles.includes('sales_rep') && this.invoices.some(invoice =>
      invoice.organizationId === actor.organizationId && invoice.accountId === accountId && invoice.assignedRep === actor.id);
  }
  private invoice(actor: Identity, id: string): InvoiceRecord {
    const invoice = this.invoices.find(i => i.id === id);
    if (!invoice || !this.canRead(actor, invoice)) throw new ApiError(404, 'Invoice not found.');
    return invoice;
  }
  private verification(invoice: InvoiceRecord): InvoiceView['verification'] {
    return invoice.verification === 'verified' && this.now() - Date.parse(invoice.verifiedAt) > FRESHNESS_MS ? 'stale' : invoice.verification;
  }
  private hold(invoice: InvoiceRecord): string | null {
    if (this.verification(invoice) !== 'verified') return 'Awaiting verification';
    if (!invoice.mappingVerified) return 'Account mapping requires verification';
    if (invoice.status !== 'open') return invoice.status === 'draft' ? 'Draft invoice is ineligible' : 'Credit-only settlement requires review';
    return null;
  }
  private payment(invoice: InvoiceRecord): InvoiceView['payment'] {
    if (invoice.status === 'credit_only') return 'ambiguous';
    return invoice.paidMinor === invoice.totalMinor ? 'fully paid' : invoice.paidMinor > 0 ? 'partial' : 'unpaid';
  }
  private view(invoice: InvoiceRecord): InvoiceView {
    return {
      id: invoice.id, number: invoice.number, accountId: invoice.accountId, accountName: invoice.accountName,
      sourceKey: { application: 'fixture-zoho-origin-unverified', organizationId: invoice.organizationId, invoiceId: invoice.id },
      currency: 'USD', total: (invoice.totalMinor / 100).toFixed(2),
      balance: invoice.status === 'credit_only' ? '0.00' : ((invoice.totalMinor - invoice.paidMinor) / 100).toFixed(2),
      payment: this.payment(invoice), verification: this.verification(invoice), verifiedAt: invoice.verifiedAt,
      mappingVerified: invoice.mappingVerified, eligible: invoice.status === 'open', terms: { ...invoice.terms },
      jobId: this.jobs.get(invoice.id)?.id ?? null, holdReason: this.hold(invoice), revision: invoice.revision,
    };
  }
  private jobView(actor: Identity, invoice: InvoiceRecord, job: JobRecord): JobView {
    return {
      id: job.id, invoiceId: invoice.id, invoiceNumber: invoice.number, accountName: invoice.accountName,
      status: 'Orders', items: [{ sku: 'DEMO-SKU-01', quantity: 10, unit: 'each' }], review: this.hold(invoice),
      ...(this.canRead(actor, invoice) ? { releaseAudit: { ...job.audit } } : {}),
    };
  }
  workspace(actor: Identity): Workspace {
    return {
      identity: { ...actor }, fixtureNotice: FIXTURE_NOTICE,
      invoices: this.invoices.filter(i => this.canRead(actor, i)).map(i => this.view(i)),
      jobs: [...this.jobs.values()].flatMap(job => {
        const invoice = this.invoices.find(i => i.id === job.invoiceId)!;
        return invoice.organizationId === actor.organizationId && (this.canRead(actor, invoice) || actor.roles.includes('warehouse'))
          ? [this.jobView(actor, invoice, job)] : [];
      }),
    };
  }
  getInvoice(actor: Identity, id: string) { return this.view(this.invoice(actor, id)); }
  getJob(actor: Identity, id: string) {
    const job = this.workspace(actor).jobs.find(j => j.id === id);
    if (!job) throw new ApiError(404, 'Job not found.');
    return job;
  }
  private createJob(invoice: InvoiceRecord, audit: ReleaseAudit) {
    const existing = this.jobs.get(invoice.id);
    if (existing) return existing;
    const job = { id: `job-${randomUUID()}`, invoiceId: invoice.id, audit: Object.freeze({ ...audit }) };
    this.jobs.set(invoice.id, job);
    return job;
  }
  release(actor: Identity, id: string, request: { reason: string; termsId: string; requestKey: string; expectedRevision: number }) {
    if (!this.broad(actor) || !actor.release) throw new ApiError(403, 'Owner/admin or sales manager with release permission required.');
    const invoice = this.invoice(actor, id);
    if (!request.reason.trim()) throw new ApiError(400, 'An early-release reason is required.');
    const hold = this.hold(invoice);
    if (hold) throw new ApiError(409, hold);
    // Authorized retries keep the original job/audit, independent of request key.
    const existing = this.jobs.get(invoice.id);
    if (existing) return { jobId: existing.id, created: false };
    if (request.expectedRevision !== invoice.revision) throw new ApiError(409, 'Invoice changed; reload before release.');
    if (invoice.terms.status !== 'approved' || request.termsId !== invoice.terms.id) throw new ApiError(409, 'Documented approved terms required; hold for explicit approval.');
    const job = this.createJob(invoice, { actor: actor.id, at: new Date(this.now()).toISOString(), basis: 'approved_terms',
      reason: request.reason.trim(), terms: `${invoice.terms.id}: ${invoice.terms.text}`, requestKey: request.requestKey });
    return { jobId: job.id, created: true };
  }
  requireDemo(actor: Identity) {
    if (!this.broad(actor) || !actor.demo) throw new ApiError(403, 'Local demo controls require manager/owner/admin permission.');
  }
  simulate(actor: Identity, id: string, event: DemoEvent) {
    this.requireDemo(actor);
    const invoice = this.invoice(actor, id);
    const eventKind = event === 'replay' ? 'full' : event;
    const eventKey = `${invoice.organizationId}:${invoice.id}:${eventKind}`;
    if (event === 'replay' && !this.events.has(eventKey)) throw new ApiError(409, 'Receive the full payment event before replaying it.');
    if (eventKind === 'full' || eventKind === 'partial') {
      if (this.events.has(eventKey)) return { outcome: 'duplicate', jobId: this.jobs.get(id)?.id ?? null };
      const version = eventKind === 'full' ? 2 : 1;
      if (version <= invoice.sourceVersion) { this.events.add(eventKey); return { outcome: 'older snapshot ignored', jobId: this.jobs.get(id)?.id ?? null }; }
      // Synthetic adapter supplies evidence. Browser cannot supply amounts/verified status.
      if (this.verification(invoice) !== 'verified') return { outcome: 'held: payment verification unavailable', jobId: this.jobs.get(id)?.id ?? null };
      this.events.add(eventKey);
      invoice.sourceVersion = version;
      invoice.paidMinor = eventKind === 'full' ? 10000 : 4000;
      invoice.verifiedAt = new Date(this.now()).toISOString();
    } else if (eventKind === 'stale' || eventKind === 'unverified') {
      invoice.verification = eventKind;
    } else if (eventKind === 'unmapped') {
      invoice.mappingVerified = false;
    } else if (eventKind === 'restore') {
      invoice.verification = 'verified'; invoice.mappingVerified = true;
      invoice.verifiedAt = new Date(this.now()).toISOString();
    }
    invoice.revision++;
    if (!this.hold(invoice) && invoice.paidMinor === invoice.totalMinor) {
      this.createJob(invoice, { actor: 'fixture-payment-verifier', at: new Date(this.now()).toISOString(),
        basis: 'verified_payment', reason: 'Verified fixture payment evidence', terms: null, requestKey: eventKey });
    }
    return { outcome: this.hold(invoice) ?? 'applied', jobId: this.jobs.get(id)?.id ?? null };
  }
}
