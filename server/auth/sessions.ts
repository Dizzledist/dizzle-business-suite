// Extracted for joint review from Sales a81ddae server/sales-crm/auth/sessions.ts.
// No Sales session implementation has been merged/review-approved. Shared cookie name and
// configured HTTPS-origin validation are deliberate changes; token/digest/lifetime design retained.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
export const sessionCookieName = '__Host-dizzle_session';
export const oidcCookieName = '__Host-dizzle_oidc';
export const absoluteLifetime = 8 * 60 * 60_000, idleLifetime = 30 * 60_000;
export const newSessionToken = () => randomBytes(32).toString('base64url');
export const isSessionToken = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
export const digest = (kind: string, token: string) => createHash('sha256').update(kind + '\0' + token).digest('hex');
export const sessionDigest = (token: string) => digest('session', token);
export const csrfToken = (token: string) => createHash('sha256').update('csrf\0' + token).digest('base64url');
export function cookieValue(req: IncomingMessage, name = sessionCookieName) {
  const values = (req.headers.cookie ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(name + '='));
  return values.length === 1 && isSessionToken(values[0].slice(name.length + 1)) ? values[0].slice(name.length + 1) : undefined;
}
export function secureCookie(name: string, token: string | null, seconds: number) { return `${name}=${token ?? ''}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${token ? seconds : 0}`; }
export function mutationProtected(req: IncomingMessage, token: string, origin: string) {
  const header = req.headers['x-csrf-token'];
  return req.headers.origin === origin && isSessionToken(header) && timingSafeEqual(Buffer.from(header), Buffer.from(csrfToken(token)));
}
