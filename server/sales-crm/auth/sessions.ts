import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const sessionCookieName = '__Host-dizzle_sales_session';
export const absoluteLifetime = 8 * 60 * 60_000;
export const idleLifetime = 30 * 60_000;
export const defaultSessionPolicy = { idle: idleLifetime, absolute: absoluteLifetime };
export type SalesSessionPolicy = typeof defaultSessionPolicy;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export const newSessionToken = () => randomBytes(32).toString('base64url');
export const isSessionToken = (value: unknown): value is string => typeof value === 'string' && tokenPattern.test(value);
export const sessionDigest = (token: string) => createHash('sha256').update('session\0' + token).digest('hex');
export const csrfToken = (token: string) => createHash('sha256').update('csrf\0' + token).digest('base64url');

export function cookieToken(req: IncomingMessage, name: string) {
  const prefix = name + '=';
  const cookies = (req.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(prefix));
  if (cookies.length !== 1) return undefined;
  const token = cookies[0].slice(prefix.length);
  return isSessionToken(token) ? token : undefined;
}

export const requestSession = (req: IncomingMessage) => cookieToken(req, sessionCookieName);

export function loadSessionPolicy(env: NodeJS.ProcessEnv): SalesSessionPolicy {
  function duration(key: string, fallback: number, min: number, max: number, unit: number) {
    const value = env[key];
    if (value === undefined) return fallback;
    if (!/^\d{1,2}$/.test(value) || Number(value) < min || Number(value) > max) throw new Error('Invalid sales session lifetime.');
    return Number(value) * unit;
  }
  return {
    idle: duration('SALES_CRM_SESSION_IDLE_MINUTES', idleLifetime, 1, 60, 60_000),
    absolute: duration('SALES_CRM_SESSION_MAX_HOURS', absoluteLifetime, 1, 24, 3_600_000),
  };
}

export function sessionCookie(token: string | null, policy = defaultSessionPolicy) {
  const maxAge = token ? policy.absolute / 1000 : 0;
  return sessionCookieName + '=' + (token ?? '') + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + maxAge;
}

export function hasSessionMutationProtection(req: IncomingMessage, token: string, allowed: readonly string[]) {
  const origin = req.headers.origin;
  const header = req.headers['x-csrf-token'];
  return typeof origin === 'string' && origin === 'http://' + req.headers.host && allowed.includes(origin) &&
    isSessionToken(header) && timingSafeEqual(Buffer.from(header), Buffer.from(csrfToken(token)));
}
