import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { invoiceDetail, invoiceHistory, invoicePage, mirrorInvoice, zohoId } from './invoice';

const regions = ['com', 'eu', 'in', 'com.au', 'jp', 'ca', 'com.cn', 'sa'] as const;
const envelope = z.object({ code: z.number() });
const maxRetries = 2;
const maxRetryDelayMs = 30_000;

export type ZohoReadFailure = 'authorization' | 'rate-limited' | 'unavailable' |
  'rejected' | 'not-found' | 'invalid-response' | 'scan-limit';

export class ZohoReadError extends Error {
  constructor(readonly kind: ZohoReadFailure) {
    super('Zoho invoice read failed: ' + kind);
    this.name = 'ZohoReadError';
  }
}

interface ReaderOptions {
  region: typeof regions[number];
  organizationId: string;
  transport: typeof fetch;
  accessToken: (forceRefresh: boolean) => Promise<string>;
  wait?: (milliseconds: number) => Promise<void>;
}

function checkedId(value: unknown) {
  const result = zohoId.safeParse(value);
  if (!result.success) throw new ZohoReadError('invalid-response');
  return result.data;
}

function retryAfter(header: string | null) {
  if (!header) return 0;
  if (/^\d+$/.test(header)) return Number(header) * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

export function createZohoInvoiceReader(options: ReaderOptions) {
  const organizationId = checkedId(options.organizationId);
  if (!regions.includes(options.region)) throw new ZohoReadError('rejected');

  const origin = 'https://www.zohoapis.' + options.region;
  const wait = options.wait ?? sleep;

  async function accessToken(forceRefresh: boolean) {
    try {
      const token = await options.accessToken(forceRefresh);
      if (!token || /[\s]/.test(token)) throw new Error();
      return token;
    } catch {
      throw new ZohoReadError('authorization');
    }
  }

  async function read<T>(path: string, schema: z.ZodType<T>, query: Record<string, string> = {}): Promise<T> {
    const url = new URL('/inventory/v1/invoices' + path, origin);
    url.search = new URLSearchParams({ ...query, organization_id: organizationId }).toString();
    let token = await accessToken(false);
    let refreshed = false;
    let retries = 0;

    while (true) {
      let response: Response | undefined;
      try {
        response = await options.transport(url, {
          method: 'GET',
          headers: { Authorization: 'Zoho-oauthtoken ' + token, Accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // A transport failure has no safe provider details to retain.
      }

      if (response?.ok) {
        let body: unknown;
        try { body = await response.json(); } catch { throw new ZohoReadError('invalid-response'); }
        const result = envelope.safeParse(body);
        if (!result.success) throw new ZohoReadError('invalid-response');
        if (result.data.code !== 0) throw new ZohoReadError('rejected');
        const parsed = schema.safeParse(body);
        if (!parsed.success) throw new ZohoReadError('invalid-response');
        return parsed.data;
      }

      await response?.body?.cancel().catch(() => undefined);
      const status = response?.status;
      if (status === 401 && !refreshed) {
        refreshed = true;
        token = await accessToken(true);
        continue;
      }
      if (status === 401 || status === 403) throw new ZohoReadError('authorization');
      if (status === 404) throw new ZohoReadError('not-found');
      if (status !== undefined && status !== 408 && status !== 429 && status < 500) {
        throw new ZohoReadError('rejected');
      }

      const failure = status === 429 ? 'rate-limited' : 'unavailable';
      const delay = Math.max(250 * 2 ** retries, retryAfter(response?.headers.get('Retry-After') ?? null));
      if (retries >= maxRetries || delay > maxRetryDelayMs) throw new ZohoReadError(failure);
      retries++;
      await wait(delay);
    }
  }

  return {
    organizationId,
    async listInvoicePage(page: number) {
      if (!Number.isSafeInteger(page) || page < 1) throw new ZohoReadError('rejected');
      const result = await read('', invoicePage, { page: String(page), per_page: '200', filter_by: 'Status.All' });
      if (result.page_context.page !== page || (result.page_context.has_more_page && !result.invoices.length)) {
        throw new ZohoReadError('invalid-response');
      }
      return { invoiceIds: result.invoices.map(row => row.invoice_id), hasMore: result.page_context.has_more_page };
    },
    async getInvoice(invoiceId: string) {
      const id = checkedId(invoiceId);
      const { invoice } = await read('/' + id, invoiceDetail);
      if (invoice.invoice_id !== id || (invoice.organization_id && invoice.organization_id !== organizationId)) {
        throw new ZohoReadError('invalid-response');
      }
      return mirrorInvoice(organizationId, invoice);
    },
    async getInvoiceHistory(invoiceId: string) {
      const id = checkedId(invoiceId);
      const { comments } = await read('/' + id + '/comments', invoiceHistory);
      if (comments.some(event => event.invoice_id && event.invoice_id !== id)) {
        throw new ZohoReadError('invalid-response');
      }
      return { events: comments, firstSuccessfulEmailAt: null };
    },
  };
}

export type ZohoInvoiceReader = ReturnType<typeof createZohoInvoiceReader>;
