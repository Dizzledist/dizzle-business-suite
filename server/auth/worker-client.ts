export class SharedWorkerAuthorization {
  constructor(private origin: string, private token: string, private transport: typeof fetch = fetch) {
    const url = new URL(origin); if (url.origin !== origin || url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('Worker authority must use HTTPS or same-host loopback.');
  }
  async authorize(jobId: string, fingerprint: string) {
    try {
      const response = await this.transport(this.origin + '/api/internal/publishing/authorize', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId, fingerprint }) });
      const decision = response.ok ? await response.json() : null;
      if (!decision || decision.jobId !== jobId || decision.fingerprint !== fingerprint) throw new Error();
    } catch { throw new Error('Current authorization unavailable or denied. Hold job for review; no automatic retry.'); }
  }
}
