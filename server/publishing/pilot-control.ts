import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PublishJob } from '../../shared/publishing';
import { PublishingHold, publishingFingerprint, type PublishingControls } from './authorization';
import { privatePublishingPath } from './private-path';

export class SinglePostPilot {
  private db: DatabaseSync;
  private reservations = new Map<string, string>();
  constructor(file: string) {
    mkdirSync(privatePublishingPath(dirname(file)), { recursive: true, mode: 0o700 }); this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    const version = (this.db.prepare('PRAGMA user_version').get() as any).user_version;
    if (version === 0) this.db.exec(readFileSync(new URL('./001-pilot-control.sql', import.meta.url), 'utf8'));
    else if (version !== 1) throw new Error('Unsupported pilot-control store.');
  }
  close() { this.db.close(); }
  private row(): any { return this.db.prepare('SELECT * FROM pilot_control WHERE singleton=1').get(); }
  select(job: PublishJob, numericAccountId: string, actor: string, now: string) {
    if (job.state !== 'scheduled' || !/^\d+$/.test(numericAccountId) || job.payload.account.platform !== 'x' || job.payload.account.brandId !== 'cheddr' ||
      job.payload.account.handle !== '@cheddrco_' || job.payload.account.providerUserId !== numericAccountId || !job.payload.account.connected || !job.payload.approvedBy)
      throw new PublishingHold('Select one approved scheduled Cheddr X job for @cheddrco_ and its verified numeric account ID.');
    const fingerprint = publishingFingerprint(job);
    this.db.prepare('INSERT OR IGNORE INTO pilot_control(singleton,job_id,account_id,fingerprint,selected_by,selected_at) VALUES(1,?,?,?,?,?)').run(job.id, numericAccountId, fingerprint, actor, now);
    const current = this.row();
    if (current.job_id !== job.id || current.fingerprint !== fingerprint || current.account_id !== numericAccountId || current.consumed_at)
      throw new PublishingHold('This pilot slot is already selected or consumed. It cannot be reset or assigned to another job.');
  }
  reserve(job: PublishJob, now: string) {
    const token = randomUUID(), fingerprint = publishingFingerprint(job);
    const result = this.db.prepare('UPDATE pilot_control SET consumed_at=?,reservation=? WHERE singleton=1 AND job_id=? AND account_id=? AND fingerprint=? AND consumed_at IS NULL')
      .run(now, token, job.id, job.payload.account.providerUserId, fingerprint);
    if (!result.changes) throw new PublishingHold('Job is not the selected pilot, its approved payload changed, or the single attempt was already consumed.');
    this.reservations.set(job.id, token);
  }
  validate(job: PublishJob) {
    const row = this.row();
    if (!row || row.job_id !== job.id || row.account_id !== job.payload.account.providerUserId || row.fingerprint !== publishingFingerprint(job) || !row.consumed_at || row.reservation !== this.reservations.get(job.id))
      throw new PublishingHold('Pilot reservation changed or was consumed by another worker. Hold for review.');
  }
  controls(authorize: (job: PublishJob) => Promise<void>, now = () => new Date().toISOString()): PublishingControls {
    return { authorize, reserve: job => this.reserve(job, now()), validate: job => this.validate(job) };
  }
}
