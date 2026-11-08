import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../server/api';
import { salesCrmApiWorkspace } from '../shared/sales-crm';

let api: ReturnType<typeof createApi> | undefined;

async function start(flag?: string, mode = 'test') {
  vi.stubEnv('SALES_CRM_ENABLED', flag);
  vi.stubEnv('NODE_ENV', mode);
  api = createApi();
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const address = api.address() as AddressInfo;

  return (identity?: string, method = 'GET', path = salesCrmApiWorkspace) => fetch(
    'http://127.0.0.1:' + address.port + path,
    { method, headers: identity ? { 'X-Demo-Identity': identity } : undefined },
  );
}

afterEach(async () => {
  if (api) {
    api.closeAllConnections();
    await new Promise<void>(resolve => api!.close(() => resolve()));
    api = undefined;
  }
  vi.unstubAllEnvs();
});

describe('Sales CRM API boundary', () => {
  it.each([undefined, 'false', 'TRUE'])('returns 404 when the flag is %s', async flag => {
    const request = await start(flag);
    expect((await request('manager')).status).toBe(404);
    expect((await request()).status).toBe(404);
    expect((await request('manager', 'GET', '/api/workspace')).status).toBe(200);
  });

  it('keeps the API disabled under production mode even with the flag', async () => {
    const request = await start('true', 'production');
    expect((await request('manager')).status).toBe(404);
  });

  it.each([
    ['rep-a', 'Rep A · Juniper accounts'],
    ['manager', 'Sales manager'],
    ['owner', 'Owner'],
    ['admin', 'Admin'],
  ])('returns only shell context to %s', async (identity, displayName) => {
    const request = await start('true');
    const response = await request(identity);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      displayName,
      integrations: { zohoInventory: 'not-configured', shipStation: 'not-configured' },
    });
  });

  it.each([
    [undefined, 401], ['unknown', 401], ['disabled', 401],
    ['revoked', 403], ['warehouse', 403], ['outside', 403],
  ] as const)('denies identity %s', async (identity, status) => {
    const request = await start('true');
    const response = await request(identity);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });

  it('rejects commands and unimplemented routes', async () => {
    const request = await start('true');
    expect((await request('manager', 'POST')).status).toBe(404);
    expect((await request('manager', 'GET', '/api/sales-crm/reports')).status).toBe(404);
  });
});
