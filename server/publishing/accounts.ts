import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SocialAccount } from '../../shared/publishing';
import { privatePublishingPath } from './private-path';
import { PublishingError } from './adapters';
export interface SocialTokens { accessToken: string; refreshToken?: string; expiresAt: number; issuedAt: number; }
interface StoredAccount { account: SocialAccount; encrypted: string; }
export class SocialAccountVault {
  private file: string;
  constructor(readonly directory: string, private key = process.env.SOCIAL_TOKEN_KEY ?? '', private transport: typeof fetch = fetch) { this.file = join(privatePublishingPath(directory), 'social-accounts.json'); }
  private records(): StoredAccount[] { return existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : []; }
  accounts() { return this.records().map(record => record.account); }
  private keyBytes() { if (!/^[a-f0-9]{64}$/i.test(this.key)) throw new PublishingError('Set SOCIAL_TOKEN_KEY to a private 32-byte hex encryption key.'); return Buffer.from(this.key, 'hex'); }
  save(account: SocialAccount, tokens: SocialTokens) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.keyBytes(), iv);
    cipher.setAAD(Buffer.from(account.id));
    const encrypted = Buffer.concat([iv, cipher.update(JSON.stringify(tokens)), cipher.final(), cipher.getAuthTag()]).toString('base64');
    const records = this.records().filter(record => record.account.id !== account.id); records.push({ account, encrypted });
    mkdirSync(this.directory, { recursive: true, mode: 0o700 }); const tmp = this.file + '.' + randomBytes(8).toString('hex') + '.tmp';
    writeFileSync(tmp, JSON.stringify(records), { mode: 0o600 }); renameSync(tmp, this.file);
  }
  private decode(record: StoredAccount): SocialTokens {
    const bytes = Buffer.from(record.encrypted, 'base64'), decipher = createDecipheriv('aes-256-gcm', this.keyBytes(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(record.account.id)); decipher.setAuthTag(bytes.subarray(-16));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString());
  }
  async token(account: SocialAccount) {
    const lock = join(this.directory, 'token-refresh.lock');
    // Exclusive local-host refresh lock prevents refresh-token rotation races. A stale lock requires
    // operator inspection after stopping workers; it is never stolen from a potentially alive worker.
    try { mkdirSync(lock); } catch { throw new PublishingError('Credential refresh is busy or interrupted. Inspect the private refresh lock before reconnecting.'); }
    try {
      const record = this.records().find(record => record.account.id === account.id && record.account.connected && record.account.providerUserId === account.providerUserId && record.account.handle === account.handle && record.account.brandId === account.brandId);
      if (!record) throw new PublishingError('Destination disconnected. Reconnect and renew content approval.');
      let tokens = this.decode(record);
      const refreshEarly = account.platform === 'x' ? 60_000 : 7 * 86_400_000;
      if (tokens.expiresAt - Date.now() > refreshEarly) return tokens.accessToken;
      let response: Response;
      if (account.platform === 'x') {
        if (!tokens.refreshToken || !process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET) throw new PublishingError('Reconnect X or configure its confidential OAuth client.');
        response = await this.transport('https://api.x.com/2/oauth2/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Authorization: 'Basic ' + Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }) });
      } else {
        if (tokens.expiresAt < Date.now() || Date.now() - tokens.issuedAt < 86_400_000) throw new PublishingError('Reconnect Instagram; the token cannot be refreshed yet or has expired.');
        const url = new URL('https://graph.instagram.com/refresh_access_token'); url.searchParams.set('grant_type', 'ig_refresh_token'); url.searchParams.set('access_token', tokens.accessToken);
        response = await this.transport(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
      }
      if (!response.ok) throw new PublishingError('Token refresh failed. Reconnect this account; no post was sent.');
      const data = await response.json(); if (!data.access_token || !data.expires_in) throw new PublishingError('Token refresh response was incomplete. Reconnect account.');
      tokens = { accessToken: data.access_token, refreshToken: data.refresh_token ?? tokens.refreshToken, issuedAt: Date.now(), expiresAt: Date.now() + data.expires_in * 1000 };
      this.save(record.account, tokens); return tokens.accessToken;
    } catch (error) { if (error instanceof PublishingError) throw error; throw new PublishingError('Credential access/refresh interrupted. Reconnect account; no post was sent.'); }
    finally { rmdirSync(lock); }
  }
}
