import type { ZohoInvoice } from './invoice';
import { ZohoReadError, type ZohoInvoiceReader, type ZohoReadFailure } from './reader';

const maxPages = 25;
const maxChangedIds = 5_000;

type ReviewReason = 'draft' | 'void-or-cancelled' | 'unemailed' | 'first-email-unverified' | 'unmapped-salesperson';
interface MirrorRecord {
  invoice: ZohoInvoice;
  lastSyncedAt: string;
  review: ReviewReason[];
}

function reviewInvoice(invoice: ZohoInvoice, salespersonMappings: ReadonlyMap<string, string>): ReviewReason[] {
  const review: ReviewReason[] = [];
  if (invoice.status === 'draft') review.push('draft');
  if (['void', 'voided', 'cancelled', 'canceled'].includes(invoice.status)) review.push('void-or-cancelled');
  review.push(invoice.emailed === false ? 'unemailed' : 'first-email-unverified');
  if (!invoice.sourceSalespersonId || !salespersonMappings.get(invoice.sourceSalespersonId)) {
    review.push('unmapped-salesperson');
  }
  return review;
}

function sourceTime(value: string | null) {
  if (!value || !/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return NaN;
  return Date.parse(value);
}

// One server-side prototype per configured organization. A durable repository
// and cross-process leases are required before wiring a scheduled job.
export class ZohoInvoiceSync {
  private records = new Map<string, MirrorRecord>();
  private running = false;
  private lastSuccessfulSyncAt: string | null = null;
  private lastFailure: { at: string; kind: ZohoReadFailure } | null = null;

  constructor(
    private readonly reader: ZohoInvoiceReader,
    private readonly salespersonMappings: ReadonlyMap<string, string>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  status() {
    return {
      invoiceCount: this.records.size,
      lastSuccessfulSyncAt: this.lastSuccessfulSyncAt,
      lastFailure: this.lastFailure ? { ...this.lastFailure } : null,
    };
  }

  getInvoice(invoiceId: string) {
    const record = this.records.get(invoiceId);
    return record && structuredClone(record);
  }

  private async listedInvoiceIds() {
    const ids = new Set<string>();
    for (let page = 1; page <= maxPages; page++) {
      const result = await this.reader.listInvoicePage(page);
      for (const id of result.invoiceIds) ids.add(id);
      if (!result.hasMore) return ids;
    }
    throw new ZohoReadError('scan-limit');
  }

  // Changed IDs are only hints. Every change fetches current source detail.
  // Omit them for a bounded reconciliation scan. An absent list row does not
  // authorize deleting a previously mirrored invoice.
  async reconcile(changedInvoiceIds?: readonly string[]) {
    if (this.running) return { outcome: 'busy' as const };
    if (changedInvoiceIds?.length === 0) return { outcome: 'no-changes' as const };
    this.running = true;

    try {
      if (changedInvoiceIds && changedInvoiceIds.length > maxChangedIds) throw new ZohoReadError('scan-limit');
      const ids = changedInvoiceIds ? new Set(changedInvoiceIds) : await this.listedInvoiceIds();
      const staged = new Map(this.records);
      for (const id of ids) {
        const invoice = await this.reader.getInvoice(id);
        if (invoice.organizationId !== this.reader.organizationId || invoice.invoiceId !== id) {
          throw new ZohoReadError('invalid-response');
        }
        const existing = staged.get(id);
        if (existing && sourceTime(invoice.sourceModifiedAt) < sourceTime(existing.invoice.sourceModifiedAt)) continue;
        staged.set(id, {
          invoice,
          lastSyncedAt: this.now().toISOString(),
          review: reviewInvoice(invoice, this.salespersonMappings),
        });
      }

      const completedAt = this.now().toISOString();
      this.records = staged;
      this.lastSuccessfulSyncAt = completedAt;
      this.lastFailure = null;
      return { outcome: 'synced' as const };
    } catch (error) {
      const kind = error instanceof ZohoReadError ? error.kind : 'unavailable';
      this.lastFailure = { at: this.now().toISOString(), kind };
      return { outcome: 'failed' as const, kind };
    } finally {
      this.running = false;
    }
  }
}
