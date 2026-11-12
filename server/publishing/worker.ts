import { PublishingQueue } from './queue';
import { PublishingError, type PublishAdapter } from './adapters';
import type { SocialAccount } from '../../shared/publishing';
import { createHash } from 'node:crypto';
import { denyPublishingControls, PublishingHold, publishingFingerprint, type PublishingControls } from './authorization';
import type { PublishJob } from '../../shared/publishing';
export class PublishingWorker {
  constructor(private queue: PublishingQueue, private adapter: (account: SocialAccount) => PublishAdapter,
    private now = () => new Date().toISOString(), private liveEnabled = false, private controls: PublishingControls = denyPublishingControls) {}
  private unchanged(job: PublishJob) {
    const current = this.queue.get(job.id);
    if (current.state !== 'publishing' || publishingFingerprint(current) !== publishingFingerprint(job) || createHash('sha256').update(this.queue.image(job.id)).digest('hex') !== job.payload.imageHash)
      throw new PublishingHold('Approved job or image bytes changed. Hold for review.');
  }
  async tick() {
    const claim = this.queue.claim(this.now(), this.liveEnabled); if (!claim) return false;
    const { job, lease } = claim;
    try {
      const adapter = this.adapter(job.payload.account);
      if (adapter.mode !== job.payload.account.mode || adapter.mode === 'live' && !this.liveEnabled) throw new PublishingError('Live publishing is disabled or account mode changed.');
      this.unchanged(job); await this.controls.authorize(job); this.unchanged(job);
      this.controls.reserve(job);
      let publicWriteUsed = false;
      const beforePublish = async () => {
        if (publicWriteUsed) throw new PublishingHold('A public write was already permitted for this attempt. No replay allowed.');
        await this.controls.authorize(job); this.unchanged(job); this.controls.validate(job);
        this.queue.checkpoint(job.id, lease, this.queue.get(job.id).checkpoint, Date.parse(this.now()));
        publicWriteUsed = true;
      };
      const result = await adapter.publish(job, this.queue.image(job.id), values => this.queue.checkpoint(job.id, lease, values, Date.parse(this.now())), beforePublish);
      if (!publicWriteUsed) throw new PublishingHold('Adapter did not request final publishing authorization.');
      this.queue.finish(job.id, lease, 'published', result, this.now());
    } catch (error) {
      const uncertain = !(error instanceof PublishingError) || error.uncertain;
      this.queue.finish(job.id, lease, uncertain ? 'needs_review' : 'failed', { error: error instanceof PublishingError ? error.message : 'Worker interrupted or storage unavailable. Reconcile before retrying.' }, this.now());
    }
    return true;
  }
  async reconcile(id: string) {
    const job = this.queue.get(id); if (job.state !== 'needs_review') throw new PublishingError('Only uncertain posts need reconciliation.');
    const adapter = this.adapter(job.payload.account);
    if (adapter.mode === 'live' && !this.liveEnabled) throw new PublishingError('Live provider reads are disabled until account setup is authorized.');
    const result = await adapter.reconcile(job);
    return result ? this.queue.reconcile(id, result, this.now()) : job;
  }
}
