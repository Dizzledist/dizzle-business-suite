import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ZohoReadError, type ZohoInvoiceReader } from '../zoho/reader';
import { transaction, upsertInvoice } from './database';
import type { RecognitionEvidence } from './model';

const pageSize = 20;
const leaseDuration = 60_000;
const retryLimit = 3;
const validId = /^[1-9]\d{0,39}$/;

type Reader = Pick<ZohoInvoiceReader, 'organizationId' | 'listInvoicePage' | 'getInvoice'>;
type QueueItem = { invoice_id: string; revision: number; attempts: number };
type Checkpoint = { next_page: number; initial_done: number };

class LeaseLost extends Error {}

export class ReportingSync {
  private readonly organization: string;
  constructor(
    private readonly db: DatabaseSync,
    private readonly reader: Reader,
    private readonly now: () => number = Date.now,
    private readonly evidence: ReadonlyMap<string, RecognitionEvidence> = new Map(),
  ) {
    this.organization = reader.organizationId;
    this.db.prepare('INSERT OR IGNORE INTO reporting_sync_state (organization_id) VALUES (?)').run(this.organization);
  }

  enqueueChanges(invoiceIds: readonly string[]) {
    if (invoiceIds.length > 100 || invoiceIds.some(id => !validId.test(id))) throw new RangeError('Invalid change batch.');
    transaction(this.db, () => {
      const enqueue = this.db.prepare(`INSERT INTO reporting_sync_queue (organization_id, invoice_id) VALUES (?, ?)
        ON CONFLICT (organization_id, invoice_id) DO UPDATE SET revision = revision + 1, attempts = 0,
          next_attempt_at = 0, error_category = NULL`);
      for (const id of new Set(invoiceIds)) enqueue.run(this.organization, id);
    });
  }

  private locked<T>(lease: string, work: () => T) {
    return transaction(this.db, () => {
      const at = this.now();
      const update = this.db.prepare(`UPDATE reporting_sync_state SET lease_until = ?
        WHERE organization_id = ? AND lease = ? AND lease_until > ?`).run(at + leaseDuration, this.organization, lease, at);
      if (update.changes !== 1) throw new LeaseLost();
      return work();
    });
  }

  async run(mode: 'initial' | 'incremental', maxRecords = 20, maxPages = 1) {
    if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 100 ||
        !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) throw new RangeError('Invalid sync limits.');
    const lease = randomUUID();
    const at = this.now();
    const acquired = this.db.prepare(`UPDATE reporting_sync_state SET lease = ?, lease_until = ?, status = 'running'
      WHERE organization_id = ? AND (lease IS NULL OR lease_until <= ?)`).run(lease, at + leaseDuration, this.organization, at);
    if (acquired.changes !== 1) return 'busy';

    let lastError: string | null = null;
    let processed = 0;
    let listed = 0;
    try {
      for (let page = 0; mode === 'initial' && page < maxPages; page++) {
        const checkpoint = this.locked(lease, () => this.db.prepare(`SELECT next_page, initial_done
          FROM reporting_sync_state WHERE organization_id = ?`).get(this.organization) as Checkpoint);
        if (checkpoint.initial_done) break;
        const result = await this.reader.listInvoicePage(checkpoint.next_page, pageSize);
        listed++;
        if (result.invoiceIds.length > pageSize || result.invoiceIds.some(id => !validId.test(id)) ||
            (result.hasMore && !result.invoiceIds.length)) throw new ZohoReadError('invalid-response');
        this.locked(lease, () => {
          const queue = this.db.prepare('INSERT OR IGNORE INTO reporting_sync_queue (organization_id, invoice_id) VALUES (?, ?)');
          for (const id of result.invoiceIds) queue.run(this.organization, id);
          this.db.prepare(`UPDATE reporting_sync_state SET next_page = ?, initial_done = ?
            WHERE organization_id = ?`).run(checkpoint.next_page + 1, Number(!result.hasMore), this.organization);
        });
      }

      const due = this.locked(lease, () => this.db.prepare(`SELECT invoice_id, revision, attempts FROM reporting_sync_queue
        WHERE organization_id = ? AND next_attempt_at <= ? AND attempts < ?
        ORDER BY next_attempt_at, invoice_id LIMIT ?`).all(this.organization, this.now(), retryLimit, maxRecords) as QueueItem[]);
      for (const job of due) {
        this.locked(lease, () => undefined);
        try {
          const invoice = await this.reader.getInvoice(job.invoice_id);
          if (invoice.organizationId !== this.organization || invoice.invoiceId !== job.invoice_id) {
            throw new ZohoReadError('invalid-response');
          }
          this.locked(lease, () => {
            const deleted = this.db.prepare(`DELETE FROM reporting_sync_queue
              WHERE organization_id = ? AND invoice_id = ? AND revision = ?`).run(this.organization, job.invoice_id, job.revision);
            if (deleted.changes !== 1) return;
            upsertInvoice(this.db, invoice, this.evidence.get(job.invoice_id) ?? { status: 'pending' }, this.now());
            this.db.prepare(`UPDATE reporting_sync_state SET records_processed = records_processed + 1
              WHERE organization_id = ?`).run(this.organization);
            processed++;
          });
        } catch (error) {
          if (error instanceof LeaseLost) throw error;
          lastError = errorCategory(error);
          const attempts = job.attempts + 1;
          this.locked(lease, () => {
            const failed = this.db.prepare(`UPDATE reporting_sync_queue SET attempts = ?, next_attempt_at = ?, error_category = ?
              WHERE organization_id = ? AND invoice_id = ? AND revision = ?`).run(
              attempts, this.now() + 1000 * 2 ** job.attempts, lastError, this.organization, job.invoice_id, job.revision,
            );
            if (failed.changes && attempts < retryLimit) {
              this.db.prepare('UPDATE reporting_sync_state SET retries = retries + 1 WHERE organization_id = ?').run(this.organization);
            }
          });
        }
      }
    } catch (error) {
      if (error instanceof LeaseLost) return 'interrupted';
      lastError = errorCategory(error);
    }

    try {
      return this.locked(lease, () => {
        const queue = this.db.prepare(`SELECT COUNT(*) AS remaining, MAX(error_category) AS queue_error
          FROM reporting_sync_queue WHERE organization_id = ?`).get(this.organization)!;
        const checkpoint = this.db.prepare('SELECT initial_done FROM reporting_sync_state WHERE organization_id = ?').get(this.organization)!;
        const error = lastError ?? (queue.queue_error === null ? null : String(queue.queue_error));
        const outcome = error ? 'failed' : queue.remaining || (mode === 'initial' && !checkpoint.initial_done) ? 'partial' : 'complete';
        this.db.prepare(`UPDATE reporting_sync_state SET status = ?, last_error = ?, lease = NULL, lease_until = NULL,
          last_success_at = CASE WHEN ? THEN ? ELSE last_success_at END WHERE organization_id = ?`).run(
          outcome, error, Number(outcome === 'complete' && (processed > 0 || listed > 0)), this.now(), this.organization,
        );
        return outcome;
      });
    } catch (error) {
      if (error instanceof LeaseLost) return 'interrupted';
      throw error;
    }
  }
}

function errorCategory(error: unknown) {
  if (error instanceof ZohoReadError) return error.kind;
  if (error instanceof RangeError) return 'invalid-record';
  return 'unavailable';
}
