import { Workflow } from '../../server/workflow';
import { assertPublishingAuthority, PublishingHold, type PublishingControls } from '../../server/publishing/authorization';
import { testAccounts } from '../../server/publishing/adapters';
import type { SocialAccount } from '../../shared/publishing';

// Explicitly test-only unscoped harness for queue/adapter unit tests. Runtime never imports it.
export function fixturePublishingControls(workflow = new Workflow(), accounts: SocialAccount[] = testAccounts): PublishingControls {
  return {
    async authorize(job) {
      assertPublishingAuthority(job, workflow.identities.find(actor => actor.id === job.payload.approvedBy) ?? null, accounts.find(account => account.id === job.payload.account.id) ?? null);
    },
    reserve(job) { if (job.payload.account.mode !== 'test') throw new PublishingHold('Fixture control cannot reserve live work.'); },
    validate(job) { if (job.payload.account.mode !== 'test') throw new PublishingHold('Fixture control cannot authorize a live write.'); },
  };
}
