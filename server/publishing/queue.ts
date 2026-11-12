import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PublishJob, PublishPayload, PublishState } from '../../shared/publishing';
import { privatePublishingPath } from './private-path';
import { ApiError } from '../workflow';

// v1 is a new, isolated queue. No startup changes to existing business databases.
export class PublishingQueue {
  readonly db: DatabaseSync;
  constructor(file = ':memory:') {
    if (file !== ':memory:') mkdirSync(privatePublishingPath(dirname(file)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    if (!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='publishing_schema'").get()) {
      this.db.exec(readFileSync(new URL('./001-publishing.sql', import.meta.url), 'utf8'));
    }

    if ((this.db.prepare('SELECT MAX(version) AS v FROM publishing_schema').get() as { v: number }).v !== 1) throw new Error('Unsupported publishing queue schema.');
  }
  close() { this.db.close(); }
  private decode(row: any): PublishJob {
    return { id: row.id, payload: JSON.parse(row.payload), state: row.state, createdAt: row.created, startedAt: row.started,
      checkpoint: JSON.parse(row.checkpoint), providerId: row.provider_id, url: row.url, error: row.error,
      publishedAt: row.published, postedBy: row.posted_by, manual: !!row.manual };
  }
  list(): PublishJob[] { return this.db.prepare('SELECT * FROM publishing_jobs ORDER BY created DESC,rowid DESC').all().map(row => this.decode(row)); }
  get(id: string) { const row = this.db.prepare('SELECT * FROM publishing_jobs WHERE id=?').get(id); if (!row) throw new ApiError(404, 'Publishing job not found.'); return this.decode(row); }
  image(id: string) { return Buffer.from((this.db.prepare('SELECT image FROM publishing_jobs WHERE id=?').get(id) as any).image); }
  event(id: string, actor: string, action: string, now = new Date().toISOString()) { this.db.prepare('INSERT INTO publishing_events(job_id,at,actor,action) VALUES(?,?,?,?)').run(id, now, actor, action); }
  enqueue(payload: PublishPayload, image: Buffer, now: string) {
    if (!payload.approvedBy || !payload.approvalSnapshot || createHash('sha256').update(image).digest('hex') !== payload.imageHash) throw new ApiError(409, 'Approved image evidence is required.');
    const id = randomUUID();
    const approvalKey = JSON.stringify([payload.approvalSnapshot, payload.approvedAt, payload.approvedBy]);
    this.db.prepare(`INSERT OR IGNORE INTO publishing_jobs(id,content_id,approval,state,due,payload,image,created) VALUES(?,?,?,'scheduled',?,?,?,?)`)
      .run(id, payload.contentId, approvalKey, new Date(payload.publishAt).toISOString(), JSON.stringify(payload), image, now);
    const row = this.db.prepare('SELECT * FROM publishing_jobs WHERE content_id=? AND approval=?').get(payload.contentId, approvalKey);
    const job = this.decode(row); if (job.id === id) this.event(id, payload.approvedBy, 'approved queue snapshot created', now); return job;
  }
  blockEdit(contentId: string) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
    if (this.list().some(j => j.payload.contentId === contentId && ['publishing', 'needs_review', 'published'].includes(j.state))) throw new ApiError(409, 'Posting has started or needs reconciliation. Resolve that result before editing; create new content for a new post.');
    this.db.prepare("UPDATE publishing_jobs SET state='canceled',error='Content changed; renewed approval required.' WHERE content_id=? AND state='scheduled'").run(contentId);
    this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  cancel(id: string, actor: string) {
    const result = this.db.prepare("UPDATE publishing_jobs SET state='canceled',error=NULL WHERE id=? AND state='scheduled'").run(id);
    if (!result.changes) throw new ApiError(409, 'Only queued posts can be canceled. A sending post may already be public.');
    this.event(id, actor, 'canceled'); return this.get(id);
  }
  claim(now: string, allowLive: boolean) {
    const lease = randomUUID();
    // Expired work is NEVER automatically re-sent. A paused old worker cannot cause a second send.
    this.db.prepare("UPDATE publishing_jobs SET state='needs_review',error='Worker interrupted. Reconcile before any new post.' WHERE state='publishing' AND lease_until<?").run(Date.parse(now));
    const row = this.db.prepare(`UPDATE publishing_jobs SET state='publishing',started=?,lease=?,lease_until=?
      WHERE id=(SELECT id FROM publishing_jobs WHERE state='scheduled' AND due<=? AND (json_extract(payload,'$.account.mode')='test' OR ?=1) ORDER BY due LIMIT 1)
      AND state='scheduled' RETURNING *`).get(now, lease, Date.parse(now) + 120_000, now, allowLive ? 1 : 0);
    if (!row) return null;
    const job = this.decode(row); this.event(job.id, 'worker', 'claimed', now); return { job, lease };
  }
  checkpoint(id: string, lease: string, checkpoint: Record<string, string>, now = Date.now()) {
    const result = this.db.prepare("UPDATE publishing_jobs SET checkpoint=?,lease_until=? WHERE id=? AND lease=? AND state='publishing'").run(JSON.stringify(checkpoint), now + 120_000, id, lease);
    if (!result.changes) throw new Error('Publishing lease lost; stop.');
  }
  finish(id: string, lease: string, state: PublishState, result: { id?: string; url?: string; error?: string }, now: string) {
    this.db.prepare("UPDATE publishing_jobs SET state=?,provider_id=?,url=?,error=?,published=? WHERE id=? AND lease=? AND state='publishing'")
      .run(state, result.id ?? null, result.url ?? null, result.error ?? null, state === 'published' ? now : null, id, lease);
    this.event(id, 'worker', state, now);
  }
  reconcile(id: string, result: { id: string; url?: string }, now: string) {
    this.db.prepare("UPDATE publishing_jobs SET state='published',provider_id=?,url=?,published=?,error=NULL WHERE id=? AND state='needs_review'").run(result.id, result.url ?? null, now, id);
    this.event(id, 'worker', 'reconciled publication', now); return this.get(id);
  }
  manual(id: string, actor: string, url: string, at: string) {
    // An uncertain/in-flight send cannot be bypassed by a manual post. Resolve provider outcome first.
    const result = this.db.prepare("UPDATE publishing_jobs SET state='published',url=?,published=?,posted_by=?,manual=1,error=NULL WHERE id=? AND state IN ('canceled','failed')").run(url, at, actor, id);
    if (!result.changes) throw new ApiError(409, 'Cannot mark posted while a send is running, uncertain or already complete.');
    this.event(id, actor, 'manual posting attested'); return this.get(id);
  }
  confirmExisting(id: string, actor: string, url: string, at: string) {
    const result = this.db.prepare("UPDATE publishing_jobs SET state='published',url=?,published=?,posted_by=?,error=NULL WHERE id=? AND state='needs_review' AND lease_until<?").run(url, at, actor, id, Date.now());
    if (!result.changes) throw new ApiError(409, 'Wait for the sending lease to expire, then inspect the provider account before recording an existing post.');
    this.event(id, actor, 'reviewer confirmed an already-existing provider post'); return this.get(id);
  }
}
