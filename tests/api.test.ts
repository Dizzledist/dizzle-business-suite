import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import type { Workspace } from '../shared/contracts';
import { createApi } from '../server/api';
import { Workflow } from '../server/workflow';
import { FRESHNESS_MS } from '../server/fixtures';

describe('Local HTTP invoice-to-warehouse workflow', () => {
  let workflow: Workflow;
  let server: ReturnType<typeof createApi>;
  let base: string;
  let now: number;
  beforeEach(async () => {
    now = Date.parse('2026-11-06T18:00:00Z');
    workflow = new Workflow(() => now);
    server = createApi(workflow);
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  async function request(path: string, actor = 'manager', payload?: unknown, headers: Record<string, string> = {}) {
    return fetch(`${base}/api${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { 'X-Demo-Identity': actor, 'Content-Type': 'application/json', ...headers },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  }
  const event = (kind: string, id = 'inv-open', actor = 'manager') => request(`/demo/invoices/${id}/events`, actor, { event: kind });
  const workspace = async (actor = 'manager'): Promise<Workspace> => (await request('/workspace', actor)).json();
  async function release(id = 'inv-open', actor = 'manager', overrides: Record<string, unknown> = {}) {
    const inv = workflow.getInvoice(workflow.authenticate('manager'), id);
    return request(`/invoices/${id}/release`, actor, { reason: 'Standing agreement permits early dispatch', termsId: inv.terms.id,
      expectedRevision: inv.revision, requestKey: 'request-1', ...overrides });
  }
  it('A02/A03: unpaid and partial invoices never appear on warehouse board', async () => {
    expect((await workspace()).invoices.find(i => i.id === 'inv-partial')?.balance).toBe('60.00');
    expect((await workspace('warehouse')).jobs).toEqual([]);
    await event('partial');
    expect((await workspace()).invoices.find(i => i.id === 'inv-open')?.payment).toBe('partial');
    expect((await workspace('warehouse')).jobs).toEqual([]);
  });
  it('A04/A05: full verified payment and repeated deliveries create exactly one job', async () => {
    expect((await event('full')).status).toBe(200);
    const before = await workspace();
    await Promise.all(Array.from({ length: 10 }, () => event('replay')));
    const after = await workspace();
    expect(after.jobs).toEqual(before.jobs);
    expect(after.jobs).toHaveLength(1);
    expect(after.invoices.find(i => i.id === 'inv-open')?.balance).toBe('0.00');
    expect(after.jobs[0].releaseAudit?.basis).toBe('verified_payment');
  });
  it('A06: older partial snapshots cannot erase newer full payment', async () => {
    await event('full'); const before = await workspace();
    await event('partial');
    expect((await workspace()).invoices).toEqual(before.invoices);
    expect((await workspace()).jobs).toEqual(before.jobs);
  });
  it.each(['manager', 'owner', 'admin'])('A07: %s can release with documented approved terms and an immutable audit', async actor => {
    expect((await release('inv-open', actor)).status).toBe(201);
    const data = await workspace();
    expect(data.invoices.find(i => i.id === 'inv-open')?.balance).toBe('100.00');
    expect(data.jobs[0].releaseAudit).toMatchObject({ actor, basis: 'approved_terms', reason: 'Standing agreement permits early dispatch', terms: expect.stringContaining('terms-a-net15') });
  });
  it('A08/A09/A26: later partial/full payments update same job and preserve release audit', async () => {
    await release(); const original = (await workspace()).jobs[0];
    await event('partial');
    expect((await workspace()).invoices.find(i => i.id === 'inv-open')?.balance).toBe('60.00');
    expect((await workspace()).jobs).toEqual([original]);
    await event('partial'); await event('full'); await event('replay');
    expect((await workspace()).invoices.find(i => i.id === 'inv-open')?.balance).toBe('0.00');
    expect((await workspace()).jobs).toEqual([original]);
    expect((await release('inv-partial')).status).toBe(201);
  });
  it('A10: empty/whitespace reason and missing documented terms fail without side effects', async () => {
    for (const overrides of [{ reason: '' }, { reason: '  ' }, { termsId: '' }, { termsId: 'invented-terms' }]) {
      expect((await release('inv-open', 'manager', overrides)).ok).toBe(false);
    }
    expect((await workspace()).jobs).toEqual([]);
  });
  it.each(['rep-a', 'rep-b', 'warehouse'])('A11: %s cannot release or invoke fixture payment controls', async actor => {
    expect((await release('inv-open', actor)).status).toBe(403);
    expect((await event('full', 'inv-open', actor)).status).toBe(403);
    expect((await workspace()).jobs).toEqual([]);
  });
  it('A12/A27: concurrent payment and distinct-key terms requests preserve one original audit', async () => {
    await Promise.all([release(), event('full'), ...Array.from({ length: 8 }, (_, n) => release('inv-open', 'manager', { requestKey: `key-${n}` }))]);
    const original = (await workspace()).jobs[0];
    expect((await workspace()).jobs).toHaveLength(1);
    for (const key of ['new-1', 'new-2']) expect((await release('inv-open', 'manager', { requestKey: key, reason: 'Different reason' })).status).toBe(200);
    expect((await workspace()).jobs).toEqual([original]);
  });
  it.each(['stale', 'unverified', 'unmapped'])('A13/A14/A17: %s holds a new manual/automatic release', async kind => {
    await event(kind);
    expect((await release()).status).toBe(409);
    await event('full');
    expect((await workspace()).jobs).toEqual([]);
    expect((await workspace()).invoices.find(i => i.id === 'inv-open')?.holdReason).toBeTruthy();
    await event('restore'); await event('full');
    expect((await workspace()).jobs).toHaveLength(1);
  });
  it('A13: fixture freshness expires with time, not only a UI toggle', async () => {
    now += FRESHNESS_MS + 1;
    expect((await release()).status).toBe(409);
    await event('full'); expect((await workspace()).jobs).toEqual([]);
  });
  it.each(['inv-credit', 'inv-draft'])('A16: %s cannot release even with zero balance/full event', async id => {
    await event('full', id);
    expect((await release(id)).status).toBe(409);
    expect((await workspace()).jobs).toEqual([]);
  });
  it('A18: reps cannot list or retrieve other assigned invoices or jobs; warehouse gets only released projection', async () => {
    await event('full', 'inv-b');
    const job = (await workspace()).jobs[0];
    expect((await workspace('rep-a')).invoices.every(i => i.accountId === 'account-a')).toBe(true);
    expect((await workspace('rep-b')).invoices.map(i => i.id)).toEqual(['inv-b']);
    expect((await request('/invoices/inv-b', 'rep-a')).status).toBe(404);
    expect((await request(`/jobs/${job.id}`, 'rep-a')).status).toBe(404);
    expect((await request(`/jobs/${job.id}`, 'rep-b')).status).toBe(200);
    const warehouse = await workspace('warehouse');
    expect(warehouse.invoices).toEqual([]); expect(warehouse.jobs).toHaveLength(1);
    expect(warehouse.jobs[0]).not.toHaveProperty('releaseAudit');
    expect((await request('/invoices/inv-b', 'warehouse')).status).toBe(404);
  });
  it.each(['disabled', 'revoked', 'outside'])('A28: %s cannot access O1 data or release/reset it', async actor => {
    await event('full');
    const original = (await workspace()).jobs[0];
    expect((await request('/invoices/inv-open', actor)).ok).toBe(false);
    expect((await request(`/jobs/${original.id}`, actor)).ok).toBe(false);
    expect((await release('inv-open', actor)).ok).toBe(false);
    expect((await event('full', 'inv-open', actor)).ok).toBe(false);
    expect((await request('/demo/reset', actor, {})).ok).toBe(false);
    expect((await workspace()).jobs).toEqual([original]);
    if (actor === 'outside') {
      const other = await workspace(actor);
      expect(other.invoices.every(i => i.sourceKey.organizationId === 'demo-o2')).toBe(true);
      expect(other.jobs).toEqual([]);
    }
    else expect((await request('/workspace', actor)).ok).toBe(false);
  });
  it('A28: permissions revoked after a successful read are rechecked on next request', async () => {
    await release(); const job = (await workspace()).jobs[0];
    workflow.identities.find(i => i.id === 'manager')!.release = false;
    expect((await release()).status).toBe(403);
    workflow.identities.find(i => i.id === 'manager')!.read = false;
    expect((await request(`/jobs/${job.id}`)).status).toBe(403);
  });
  it.each(['stale', 'unverified', 'unmapped'])('A29: %s preserves existing job/audit with a review flag', async kind => {
    await release(); const original = (await workspace()).jobs[0];
    await event(kind);
    expect((await release()).status).toBe(409);
    const held = (await workspace()).jobs[0];
    expect(held.id).toBe(original.id); expect(held.releaseAudit).toEqual(original.releaseAudit);
    expect(held.review).toBeTruthy(); expect(held.items).toEqual(original.items);
    await event('restore');
    expect((await workspace()).jobs).toEqual([original]);
  });
  it.each(['inv-disputed', 'inv-missing'])('A30: %s terms cannot be replaced by a caller assertion', async id => {
    expect((await release(id)).status).toBe(409);
    expect((await release(id, 'manager', { approved: true })).status).toBe(400);
    expect((await workspace()).jobs).toEqual([]);
  });
  it('rejects forged role/verification payloads and untrusted browser origins', async () => {
    expect((await request('/invoices/inv-open/release', 'rep-a', { reason: 'x', termsId: 'x', requestKey: 'x', expectedRevision: 1, role: 'owner' })).status).toBe(400);
    expect((await request('/demo/invoices/inv-open/events', 'manager', { event: 'full', verified: true, paid: 10000 })).status).toBe(400);
    expect((await request('/workspace', 'manager', undefined, { Origin: 'https://untrusted.example' })).status).toBe(403);
    const hostStatus = await new Promise<number>(resolve => {
      const req = httpRequest(`${base}/api/workspace`, { headers: { Host: 'untrusted.example', 'X-Demo-Identity': 'manager' } }, res => { res.resume(); resolve(res.statusCode!); });
      req.end();
    });
    expect(hostStatus).toBe(403);
    expect((await request('/workspace', 'unknown')).status).toBe(401);
  });
  it('a replay is only available after receipt, and does not refresh stale verification', async () => {
    expect((await event('replay')).status).toBe(409);
    await event('full'); await event('stale'); await event('replay');
    expect((await workspace()).jobs[0].review).toBe('Awaiting verification');
  });
  it('R01: a separate server-granted role broadens only that role scope', async () => {
    await event('full', 'inv-b');
    workflow.identities.find(i => i.id === 'rep-a')!.roles.push('warehouse');
    const data = await workspace('rep-a');
    expect(data.jobs).toHaveLength(1);
    expect(data.jobs[0]).not.toHaveProperty('releaseAudit');
    expect(data.invoices.every(i => i.accountId === 'account-a')).toBe(true);
    expect((await request('/invoices/inv-b', 'rep-a')).status).toBe(404);
    expect((await release('inv-open', 'rep-a')).status).toBe(403);
  });
  const move = (id: string, actor = 'warehouse', overrides: Record<string, unknown> = {}) => request(`/jobs/${id}/move`, actor,
    { target: 'Shipped', tracking: '1ZLOCAL12345', expectedRevision: 1, requestKey: 'shipment-1', ...overrides });
  it('saves shipment before Slack, preserves release audit and deduplicates different submission keys', async () => {
    await event('full'); const original = (await workspace()).jobs[0];
    const send = workflow.slack.send.bind(workflow.slack);
    workflow.slack.send = (id, message) => {
      const saved = workflow.workspace(workflow.authenticate('warehouse')).jobs[0];
      expect(saved.status).toBe('Shipped'); expect(saved.shipment?.tracking).toBe('1ZLOCAL12345');
      expect(saved.alert?.status).toBe('queued'); send(id, message);
    };
    expect((await move(original.id)).status).toBe(200);
    const saved = (await workspace()).jobs[0];
    expect(saved.status).toBe('Shipped'); expect(saved.releaseAudit).toEqual(original.releaseAudit);
    expect(saved.alert).toMatchObject({ status: 'sent', attempts: 1 });
    for (const text of ['rep-a', 'Juniper Market', 'DZ-1001', '1ZLOCAL12345']) expect(saved.alert?.message).toContain(text);
    await Promise.all(['new-key-1', 'new-key-2', 'new-key-3'].map(requestKey => move(original.id, 'warehouse', { requestKey })));
    expect((await workspace()).jobs).toEqual([saved]); expect(workflow.slack.captured.size).toBe(1);
    await event('replay'); await event('partial');
    expect((await workspace()).jobs).toEqual([saved]);
    expect((await move(original.id, 'warehouse', { tracking: 'DIFFERENT123' })).status).toBe(409);
    expect(workflow.slack.captured.size).toBe(1);
  });
  it('failed Slack leaves shipment saved; explicit retries capture only one alert', async () => {
    await event('full'); const job = (await workspace()).jobs[0];
    expect((await request('/demo/slack-failure', 'manager', {})).status).toBe(200);
    const failed = await (await move(job.id)).json();
    expect(failed.status).toBe('Shipped'); expect(failed.shipment.tracking).toBe('1ZLOCAL12345');
    expect(failed.alert).toMatchObject({ status: 'failed', attempts: 1 }); expect(workflow.slack.captured.size).toBe(0);
    await move(job.id, 'warehouse', { requestKey: 'another' });
    expect(workflow.slack.captured.size).toBe(0); // repeated shipment is not an implicit alert retry
    const retry = await request(`/jobs/${job.id}/alert/retry`, 'warehouse', {});
    expect((await retry.json()).alert).toMatchObject({ status: 'sent', attempts: 2 });
    await request(`/jobs/${job.id}/alert/retry`, 'warehouse', {});
    expect((await workspace()).jobs[0].shipment).toEqual(failed.shipment);
    expect(workflow.slack.captured.size).toBe(1);
  });
  it.each(['', '   ', 'x', '<script>bad</script>'])('invalid tracking %j cannot save a shipment or alert', async tracking => {
    await event('full'); const job = (await workspace()).jobs[0];
    expect((await move(job.id, 'warehouse', { tracking })).status).toBe(400);
    expect((await workspace()).jobs[0]).toEqual(job); expect(workflow.slack.captured.size).toBe(0);
  });
  it.each(['rep-a', 'rep-b', 'manager', 'owner', 'admin', 'disabled', 'revoked', 'outside'])('%s cannot move warehouse cards or retry alerts without warehouse authority', async actor => {
    await event('full'); const job = (await workspace()).jobs[0];
    expect((await move(job.id, actor)).ok).toBe(false);
    expect((await request(`/jobs/${job.id}/alert/retry`, actor, {})).ok).toBe(false);
    expect((await workspace()).jobs[0]).toEqual(job);
  });
  it('warehouse authority never crosses organization boundaries', async () => {
    await event('full'); const job = (await workspace()).jobs[0];
    const outside = workflow.identities.find(i => i.id === 'outside')!;
    outside.roles.push('warehouse'); outside.move = true;
    expect((await move(job.id, 'outside')).status).toBe(404);
    expect((await workspace()).jobs[0]).toEqual(job);
  });
  it('stale source and stale card revisions hold new moves without losing work', async () => {
    await event('full'); const job = (await workspace()).jobs[0];
    expect((await move(job.id, 'warehouse', { expectedRevision: 99 })).status).toBe(409);
    await event('stale'); expect((await move(job.id)).status).toBe(409);
    expect((await workspace()).jobs[0]).toMatchObject({ id: job.id, status: 'Orders', shipment: null });
  });
  it('partial workflow is disabled; pickup routing saves awaiting-pickup state without a shipping alert', async () => {
    await event('full'); const job = (await workspace()).jobs[0];
    expect((await move(job.id, 'warehouse', { target: 'Partially Shipped' })).status).toBe(409);
    expect((await move(job.id, 'warehouse', { target: 'Dropoff/Pickup' })).status).toBe(409);
    await event('full', 'inv-b'); const pickup = (await workspace()).jobs.find(j => j.invoiceId === 'inv-b')!;
    const result = await (await move(pickup.id, 'warehouse', { target: 'Dropoff/Pickup', tracking: undefined })).json();
    expect(result).toMatchObject({ status: 'Dropoff/Pickup', shipment: null, alert: null });
    expect((await move(pickup.id)).status).toBe(409); expect(workflow.slack.captured.size).toBe(0);
  });
  it('sample packing slip PDF is scoped to released job access and distinct from invoice records', async () => {
    await event('full'); const job = (await workspace()).jobs[0];
    const pdf = await request(`/jobs/${job.id}/packing-slip.pdf`, 'warehouse');
    expect(pdf.status).toBe(200); expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await request(`/jobs/${job.id}/packing-slip.pdf`, 'rep-a')).status).toBe(200);
    for (const actor of ['rep-b', 'outside', 'disabled', 'revoked']) expect((await request(`/jobs/${job.id}/packing-slip.pdf`, actor)).ok).toBe(false);
    expect((await request(`/jobs/${job.id}/invoice.pdf`, 'warehouse')).status).toBe(404);
  });
});
