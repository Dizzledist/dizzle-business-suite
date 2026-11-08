import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const sessionCookieName = '__Host-dizzle_sales_session';
export const absoluteLifetime = 8 * 60 * 60_000;
export const idleLifetime = 30 * 60_000;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export const newSessionToken = () => randomBytes(32).toString('base64url');
export const isSessionToken = (value: unknown): value is string => typeof value === 'string' && tokenPattern.test(value);
export const sessionDigest = (token: string) => createHash('sha256').update('session\0' + token).digest('hex');
export const csrfToken = (token: string) => createHash('sha256').update('csrf\0' + token).digest('base64url');

export function requestSession(req: IncomingMessage) {
  const prefix = sessionCookieName + '=';
  const cookies = (req.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(prefix));
  if (cookies.length !== 1) return undefined;
  const token = cookies[0].slice(prefix.length);
  return isSessionToken(token) ? token : undefined;
}

export function sessionCookie(token: string | null) {
  const maxAge = token ? absoluteLifetime / 1000 : 0;
  return sessionCookieName + '=' + (token ?? '') + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + maxAge;
}

export function hasSessionMutationProtection(req: IncomingMessage, token: string, allowed: readonly string[]) {
  const origin = req.headers.origin;
  const header = req.headers['x-csrf-token'];
  return typeof origin === 'string' && origin === 'http://' + req.headers.host &&
    allowed.includes(origin) &&
    isSessionToken(header) && timingSafeEqual(Buffer.from(header), Buffer.from(csrfToken(token)));
}
