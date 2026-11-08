import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { invoiceDetail, invoiceHistory, invoicePage, mirrorInvoice, zohoId } from './invoice';
import { inventoryOrigin, inventoryRegions, type InventoryRegion } from './config';
import { contactDetail, contactPage, invoicePayments, itemDetail, itemPage, organizations } from './records';

const envelope = z.object({ code: z.number() });
const maxRetries = 2;
const maxRetryDelayMs = 30_000;
const allowedReadPath = /^\/(?:organizations|contacts(?:\/[1-9]\d*)?|items(?:\/[1-9]\d*)?|invoices(?:\/[1-9]\d*(?:\/(?:comments|payments))?)?)$/;

export type ZohoReadFailure = 'authorization' | 'rate-limited' | 'unavailable' |
  'rejected' | 'not-found' | 'invalid-response' | 'scan-limit';

export class ZohoReadError extends Error {
  constructor(readonly kind: ZohoReadFailure) {
    super('Zoho invoice read failed: ' + kind);
    this.name = 'ZohoReadError';
  }
}

interface ReaderOptions {
  region: InventoryRegion;
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

export function createZohoInventoryReader(options: ReaderOptions) {
  const organizationId = checkedId(options.organizationId);
  if (!inventoryRegions.includes(options.region)) throw new ZohoReadError('rejected');

  const origin = inventoryOrigin(options.region);
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
    if (!allowedReadPath.test(path)) throw new ZohoReadError('rejected');
    const url = new URL('/inventory/v1' + path, origin);
    url.search = new URLSearchParams(path === '/organizations' ? {} : { ...query, organization_id: organizationId }).toString();
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

  function pagination(page: number, perPage: number) {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 200) {
      throw new ZohoReadError('rejected');
    }
    return { page: String(page), per_page: String(perPage) };
  }

  function hasMore(context: { page: number; has_more_page: boolean }, page: number, perPage: number, length: number) {
    if (context.page !== page || length > perPage || (context.has_more_page && length === 0)) {
      throw new ZohoReadError('invalid-response');
    }
    return context.has_more_page;
  }

  return {
    organizationId,
    async getOrganization() {
      const result = await read('/organizations', organizations);
      const organization = result.organizations.find(row => row.organization_id === organizationId);
      if (!organization || organization.is_org_active === false) throw new ZohoReadError('not-found');
      return { id: organization.organization_id, name: organization.name };
    },
    async listContacts(page: number, perPage = 200) {
      const result = await read('/contacts', contactPage, { ...pagination(page, perPage), contact_type: 'customer' });
      return { contacts: result.contacts, hasMore: hasMore(result.page_context, page, perPage, result.contacts.length) };
    },
    async getContact(contactId: string) {
      const id = checkedId(contactId);
      const { contact } = await read('/contacts/' + id, contactDetail);
      if (contact.contact_id !== id) throw new ZohoReadError('invalid-response');
      return contact;
    },
    async listItems(page: number, perPage = 200) {
      const result = await read('/items', itemPage, pagination(page, perPage));
      return { items: result.items, hasMore: hasMore(result.page_context, page, perPage, result.items.length) };
    },
    async getItem(itemId: string) {
      const id = checkedId(itemId);
      const { item } = await read('/items/' + id, itemDetail);
      if (item.item_id !== id) throw new ZohoReadError('invalid-response');
      return item;
    },
    async listInvoicePage(page: number, perPage = 200) {
      const result = await read('/invoices', invoicePage, { ...pagination(page, perPage), filter_by: 'Status.All' });
      return {
        invoiceIds: result.invoices.map(row => row.invoice_id),
        hasMore: hasMore(result.page_context, page, perPage, result.invoices.length),
      };
    },
    async getInvoice(invoiceId: string) {
      const id = checkedId(invoiceId);
      const { invoice } = await read('/invoices/' + id, invoiceDetail);
      if (invoice.invoice_id !== id || (invoice.organization_id && invoice.organization_id !== organizationId)) {
        throw new ZohoReadError('invalid-response');
      }
      return mirrorInvoice(organizationId, invoice);
    },
    async getInvoicePayments(invoiceId: string) {
      const id = checkedId(invoiceId);
      const { payments } = await read('/invoices/' + id + '/payments', invoicePayments);
      if (payments.some(payment => payment.invoice_id && payment.invoice_id !== id)) {
        throw new ZohoReadError('invalid-response');
      }
      return payments;
    },
    async getInvoiceHistory(invoiceId: string) {
      const id = checkedId(invoiceId);
      const { comments } = await read('/invoices/' + id + '/comments', invoiceHistory);
      if (comments.some(event => event.invoice_id && event.invoice_id !== id)) {
        throw new ZohoReadError('invalid-response');
      }
      return { events: comments, firstSuccessfulEmailAt: null };
    },
  };
}

export const createZohoInvoiceReader = createZohoInventoryReader;
export type ZohoInvoiceReader = Pick<ReturnType<typeof createZohoInventoryReader>,
  'organizationId' | 'listInvoicePage' | 'getInvoice' | 'getInvoiceHistory'>;
