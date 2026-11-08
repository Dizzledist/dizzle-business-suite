import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { googleAuthApi } from '../../../../shared/sales-auth';
import { readBody } from '../../../http-body';
import { ApiError } from '../../../workflow';
import { cookieToken, isSessionToken, newSessionToken, requestSession, sessionCookie } from '../sessions';
import type { SalesIdentityStore } from '../store';
import type { GoogleConfig } from './config';
import { createGoogleProvider, GoogleIdentityRejected, type GoogleProvider } from './provider';

const flowCookieName = '__Host-dizzle_google_flow';
const flowLifetime = 5 * 60_000;
const maxPending = 256;

export function isGoogleAuthPath(path: string) {
  return path === googleAuthApi || path.startsWith(googleAuthApi + '/');
}

function redirect(res: ServerResponse, location: string) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.end();
}

function flowCookie(value: string | null) {
  return flowCookieName + '=' + (value ?? '') + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' +
    (value ? flowLifetime / 1000 : 0);
}

export function createGoogleLogin(config: GoogleConfig, provider: GoogleProvider = createGoogleProvider(config), now = Date.now) {
  const pending = new Map<string, {
    nonce: string; verifier: string; browser: string; expires: number; invitation?: string;
  }>();
  const sessionPolicy = createHash('sha256').update(JSON.stringify([config.clientId, config.redirectUri, config.hostedDomain])).digest('hex');
  return {
    origin: config.origin,
    sessionPolicy,

    async handle(req: IncomingMessage, res: ServerResponse, url: URL, identity: SalesIdentityStore) {
      if (url.origin !== config.origin || req.headers.host !== new URL(config.origin).host ||
          req.headers['x-demo-identity'] !== undefined) throw new ApiError(403, 'Use the configured company sign-in address.');
      if (req.method === 'POST' && url.pathname === googleAuthApi + '/start' && !url.search) {
        if (req.headers.origin !== config.origin) throw new ApiError(403, 'Sign-in request could not be verified.');
        if (req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
          throw new ApiError(415, 'Sign-in form required.');
        }
        const params = new URLSearchParams(await readBody(req, 512));
        const invitation = params.get('invitation') || undefined;
        if ([...params.keys()].some(key => key !== 'invitation') || params.getAll('invitation').length > 1 ||
            (invitation !== undefined && !isSessionToken(invitation))) return redirect(res, '/sales?signIn=account');

        try {
          const request = await provider.begin();
          const at = now();
          for (const [state, flow] of pending) if (flow.expires <= at) pending.delete(state);
          if (pending.size >= maxPending) return redirect(res, '/sales?signIn=unavailable');
          const browser = newSessionToken();
          pending.set(request.state, {
            nonce: request.nonce, verifier: request.verifier, browser, expires: at + flowLifetime, invitation,
          });
          res.setHeader('Set-Cookie', flowCookie(browser));
          return redirect(res, request.url.href);
        } catch {
          return redirect(res, '/sales?signIn=unavailable');
        }
      }

      if (req.method === 'GET' && url.pathname === googleAuthApi + '/callback') {
        const state = url.searchParams.get('state');
        const flow = state && pending.get(state);
        const browser = cookieToken(req, flowCookieName);
        if (!state || url.searchParams.getAll('state').length !== 1 || !flow || flow.expires <= now() ||
            !browser || !timingSafeEqual(Buffer.from(flow.browser), Buffer.from(browser))) {
          return redirect(res, '/sales?signIn=failed');
        }
        // Consume before any await. A callback, even a failed one, cannot be replayed.
        pending.delete(state);
        res.setHeader('Set-Cookie', flowCookie(null));
        if (url.searchParams.getAll('code').length !== 1 || !url.searchParams.get('code')) {
          return redirect(res, '/sales?signIn=failed');
        }
        try {
          const verified = await provider.verify(url, { state, nonce: flow.nonce, verifier: flow.verifier });
          const session = identity.startGoogleSession(verified, flow.invitation, sessionPolicy, requestSession(req));
          res.setHeader('Set-Cookie', [flowCookie(null), sessionCookie(session, identity.policy)]);
          return redirect(res, '/sales');
        } catch (error) {
          return redirect(res, error instanceof GoogleIdentityRejected || (error instanceof ApiError && error.status === 403)
            ? '/sales?signIn=account' : '/sales?signIn=failed');
        }
      }
      throw new ApiError(404, 'Route not found.');
    },
  };
}

export type GoogleLogin = ReturnType<typeof createGoogleLogin>;
