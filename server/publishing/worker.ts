import { PublishingQueue } from './queue';
import { PublishingError, type PublishAdapter } from './adapters';
import type { SocialAccount } from '../../shared/publishing';
export class PublishingWorker {
  constructor(private queue: PublishingQueue, private adapter: (account: SocialAccount) => PublishAdapter,
    private now = () => new Date().toISOString(), private liveEnabled = false) {}
  async tick() {
    const claim = this.queue.claim(this.now(), this.liveEnabled); if (!claim) return false;
    const { job, lease } = claim;
    try {
      const adapter = this.adapter(job.payload.account);
      if (adapter.mode !== job.payload.account.mode || adapter.mode === 'live' && !this.liveEnabled) throw new PublishingError('Live publishing is disabled or account mode changed.');
      const result = await adapter.publish(job, this.queue.image(job.id), values => this.queue.checkpoint(job.id, lease, values, Date.parse(this.now())));
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
