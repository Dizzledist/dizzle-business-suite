// Local-only adapter: never connects to Slack. Stable delivery IDs deduplicate retries.
export class LocalSlackAdapter {
  readonly captured = new Map<string, string>();
  failNext = false;
  send(id: string, message: string) {
    if (this.captured.has(id)) return;
    if (this.failNext) { this.failNext = false; throw new Error('Simulated Slack delivery failure'); }
    this.captured.set(id, message);
  }
  reset() { this.captured.clear(); this.failNext = false; }
}
