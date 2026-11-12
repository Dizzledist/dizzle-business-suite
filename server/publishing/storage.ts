import { MarketingStore } from '../marketing-store';
import { privatePublishingPath } from './private-path';

// One resolver for API, worker, OAuth, reconciliation and media serving. Explicit paths
// keep approval history and queue/vault state stable when a checkout/release path changes.
export function publishingStorage(env: Record<string, string | undefined> = process.env) {
  const marketingDirectory = env.DIZZLE_MARKETING_DIR ? privatePublishingPath(env.DIZZLE_MARKETING_DIR) : undefined;
  const store = new MarketingStore(marketingDirectory);
  const directory = privatePublishingPath(env.DIZZLE_PUBLISHING_DIR || store.directory);
  return { store, directory };
}
