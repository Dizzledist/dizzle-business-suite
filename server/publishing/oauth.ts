import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SocialPlatform } from '../../shared/publishing';
export const oauthScopes = { instagram: ['instagram_business_basic', 'instagram_business_content_publish'], x: ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'] };
export function verifyExpectedHandle(actual: string, expected?: string) {
  if (expected && actual !== expected) throw new Error('Authorized account does not match the expected pilot handle. Nothing was saved.');
}
export function oauthStart(platform: SocialPlatform, clientId: string, redirectUri: string) {
  const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
  const url = new URL(platform === 'x' ? 'https://x.com/i/oauth2/authorize' : 'https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', clientId); url.searchParams.set('redirect_uri', redirectUri); url.searchParams.set('response_type', 'code'); url.searchParams.set('state', state);
  url.searchParams.set('scope', oauthScopes[platform].join(platform === 'x' ? ' ' : ','));
  if (platform === 'x') { url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url')); url.searchParams.set('code_challenge_method', 'S256'); }
  return { url: url.href, state, verifier, expiresAt: Date.now() + 300_000 };
}
export function consumeOAuthState(expected: { state: string; expiresAt: number }, state: string) {
  const a = Buffer.from(expected.state), b = Buffer.from(state);
  if (Date.now() > expected.expiresAt || a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Invalid or expired OAuth state.');
  expected.expiresAt = 0; // one use, including failed exchanges
}
