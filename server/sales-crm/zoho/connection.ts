import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { zohoIntegrationPath, zohoScopes, type ZohoConfig } from './config';
import { createZohoInventoryReader, ZohoReadError, type ZohoReadFailure } from './reader';
import { ZohoInvoiceSync } from './sync';
import { createEncryptedTokenStore, validProviderToken, type ZohoTokenStore } from './token-store';

const flowLifetimeMs = 10 * 60_000;
const noncePattern = /^[A-Za-z0-9_-]{43}$/;
const tokenResponse = z.object({
  error: z.string().optional(),
  access_token: z.string().regex(validProviderToken),
  refresh_token: z.string().regex(validProviderToken).optional(),
  expires_in: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().int().positive().max(86_400)),
  api_domain: z.string().optional(),
  scope: z.string().optional(),
});

type ConnectionFailure = ZohoReadFailure | 'invalid-state' | 'oauth-denied' | 'oauth-rejected' |
  'wrong-region' | 'wrong-organization' | 'token-store' | 'not-connected' | 'busy';

export class ZohoConnectionError extends Error {
  constructor(readonly kind: ConnectionFailure) {
    super('Zoho integration: ' + kind);
    this.name = 'ZohoConnectionError';
  }
}

function newNonce() {
  return randomBytes(32).toString('base64url');
}

function matchesNonce(expected: string, actual: string | null) {
  return !!actual && noncePattern.test(actual) && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

function hasOnlyApprovedScopes(scope: string | undefined) {
  if (scope === undefined) return true;
  const granted = scope.trim().split(/[,\s]+/);
  return granted.length === zohoScopes.length && zohoScopes.every(value => granted.includes(value));
}

type Pending =
  | { phase: 'issued'; ticket: string; expiresAt: number }
  | { phase: 'browser'; state: string; browser: string; verifier: string; expiresAt: number };

export function createZohoConnection(config: ZohoConfig, options: {
  transport?: typeof fetch; store?: ZohoTokenStore; now?: () => number; wait?: (ms: number) => Promise<void>;
} = {}) {
  const transport = options.transport ?? fetch;
  const store = options.store ?? createEncryptedTokenStore(config);
  const now = options.now ?? Date.now;
  const readerOptions = { organizationId: config.organizationId, region: config.region, transport, wait: options.wait };
  let pending: Pending | undefined;
  let busy = false;
  let activeToken: { value: string; expiresAt: number } | undefined;
  let organization: { id: string; name: string } | null = null;
  let lastSuccessfulApiConnection: string | null = null;
  let lastSuccessfulSync: string | null = null;
  let lastError: ConnectionFailure | null = null;

  async function storedToken() {
    try { return await store.load(); } catch { throw new ZohoConnectionError('token-store'); }
  }

  async function saveToken(token: string) {
    try { await store.save(token); } catch { throw new ZohoConnectionError('token-store'); }
  }

  async function accountsToken(grant: Record<string, string>) {
    let response: Response;
    try {
      response = await transport(new URL('/oauth/v2/token', config.accountsUrl), {
        method: 'POST',
        body: new URLSearchParams({ ...grant, client_id: config.clientId, client_secret: config.clientSecret }),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ZohoConnectionError('unavailable');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 429) throw new ZohoConnectionError('rate-limited');
      throw new ZohoConnectionError(response.status >= 500 ? 'unavailable' : 'oauth-rejected');
    }
    let body: unknown;
    try { body = await response.json(); } catch { throw new ZohoConnectionError('oauth-rejected'); }
    const parsed = tokenResponse.safeParse(body);
    if (!parsed.success || parsed.data.error !== undefined ||
        !hasOnlyApprovedScopes(parsed.data.scope)) throw new ZohoConnectionError('oauth-rejected');
    if (parsed.data.api_domain !== undefined &&
        parsed.data.api_domain !== new URL(config.apiBaseUrl).origin) throw new ZohoConnectionError('wrong-region');
    return parsed.data;
  }

  async function accessToken(forceRefresh: boolean) {
    if (!forceRefresh && activeToken && activeToken.expiresAt - now() > 60_000) return activeToken.value;
    const refreshToken = await storedToken();
    if (!refreshToken) throw new ZohoConnectionError('not-connected');
    const response = await accountsToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
    if (response.refresh_token && response.refresh_token !== refreshToken) await saveToken(response.refresh_token);
    activeToken = { value: response.access_token, expiresAt: now() + response.expires_in * 1000 };
    return activeToken.value;
  }

  async function verifyOrganization(reader: ReturnType<typeof createZohoInventoryReader>) {
    try {
      return await reader.getOrganization();
    } catch (error) {
      if (error instanceof ZohoReadError && error.kind === 'not-found') throw new ZohoConnectionError('wrong-organization');
      throw error;
    }
  }

  async function exclusive<T>(action: () => Promise<T>) {
    if (busy) throw new ZohoConnectionError('busy');
    busy = true;
    try {
      const result = await action();
      lastError = null;
      return result;
    } catch (error) {
      lastError = error instanceof ZohoReadError || error instanceof ZohoConnectionError ? error.kind : 'unavailable';
      throw new ZohoConnectionError(lastError);
    } finally {
      busy = false;
    }
  }

  return {
    issueStart() {
      if (busy) throw new ZohoConnectionError('busy');
      const ticket = newNonce();
      pending = { phase: 'issued', ticket, expiresAt: now() + flowLifetimeMs };
      const start = new URL(zohoIntegrationPath + '/start', config.redirectUri);
      start.searchParams.set('ticket', ticket);
      return start.toString();
    },
    openStart(ticket: string | null) {
      if (busy) throw new ZohoConnectionError('busy');
      if (pending?.phase !== 'issued' || pending.expiresAt <= now() || !matchesNonce(pending.ticket, ticket)) {
        throw new ZohoConnectionError('invalid-state');
      }
      const state = newNonce();
      const verifier = newNonce();
      const browser = newNonce();
      pending = { phase: 'browser', state, verifier, browser, expiresAt: now() + flowLifetimeMs };
      const url = new URL('/oauth/v2/auth', config.accountsUrl);
      url.search = new URLSearchParams({
        scope: zohoScopes.join(','),
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      }).toString();
      return { url: url.toString(), browser, maxAge: flowLifetimeMs / 1000 };
    },
    async complete(query: URLSearchParams, browser: string | null) {
      const flow = pending;
      if (flow?.phase !== 'browser' || flow.expiresAt <= now() || query.getAll('state').length !== 1 ||
          !matchesNonce(flow.state, query.get('state')) || !matchesNonce(flow.browser, browser)) {
        throw new ZohoConnectionError('invalid-state');
      }

      return exclusive(async () => {
        pending = undefined;
        if (query.has('error')) throw new ZohoConnectionError('oauth-denied');
        const code = query.get('code');
        if (query.getAll('code').length !== 1 || !code || !validProviderToken.test(code)) {
          throw new ZohoConnectionError('oauth-rejected');
        }
        const region = query.get('location');
        const accounts = query.get('accounts-server');
        if (query.getAll('location').length > 1 || query.getAll('accounts-server').length > 1 ||
            (region !== null && region !== config.location) || (accounts !== null && accounts !== config.accountsUrl)) {
          throw new ZohoConnectionError('wrong-region');
        }

        const candidate = await accountsToken({
          grant_type: 'authorization_code', code, code_verifier: flow.verifier, redirect_uri: config.redirectUri,
        });
        if (!candidate.refresh_token) throw new ZohoConnectionError('oauth-rejected');
        const reader = createZohoInventoryReader({
          ...readerOptions,
          accessToken: async forceRefresh => {
            if (forceRefresh) throw new ZohoReadError('authorization');
            return candidate.access_token;
          },
        });
        const verified = await verifyOrganization(reader);
        await saveToken(candidate.refresh_token);
        activeToken = { value: candidate.access_token, expiresAt: now() + candidate.expires_in * 1000 };
        organization = verified;
        lastSuccessfulApiConnection = new Date(now()).toISOString();
      });
    },
    async sample() {
      return exclusive(async () => {
        if (!await storedToken()) throw new ZohoConnectionError('not-connected');
        const reader = createZohoInventoryReader({ ...readerOptions, accessToken });
        organization = await verifyOrganization(reader);
        lastSuccessfulApiConnection = new Date(now()).toISOString();
        const { invoiceIds } = await reader.listInvoicePage(1, 1);
        const { contacts } = await reader.listContacts(1, 1);
        const { items } = await reader.listItems(1, 1);
        const result = await new ZohoInvoiceSync(reader, new Map(), () => new Date(now())).reconcile(invoiceIds);
        if (result.outcome === 'failed') throw new ZohoConnectionError(result.kind);
        lastSuccessfulApiConnection = lastSuccessfulSync = new Date(now()).toISOString();
        return { invoiceCount: invoiceIds.length, contactCount: contacts.length, itemCount: items.length };
      });
    },
    async status() {
      let saved = false;
      let storageError = false;
      try { saved = !!await storedToken(); } catch { storageError = true; }
      return {
        mode: 'read-only',
        connection: storageError ? 'storage-error' : saved
          ? organization ? 'connected' : 'authorization-saved'
          : 'not-connected',
        organizationId: config.organizationId,
        organization: saved ? organization : null,
        lastSuccessfulApiConnection,
        lastSuccessfulSync,
        lastError: storageError ? 'token-store' : lastError,
      };
    },
  };
}

export type ZohoConnection = ReturnType<typeof createZohoConnection>;
