import { test, expect } from '@playwright/test';
import type { Workspace } from '../../shared/contracts';

// Full Chromium's new headless mode includes the PDF viewer; headless-shell does not.
test.use({ channel: 'chromium' });

test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/demo/reset', { headers: { 'X-Demo-Identity': 'manager' }, data: {} })).ok()).toBeTruthy();
});
test('warehouse opens PDF, prints sample, cancels drag, ships with tracking and captures one alert; sales cannot move', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Receive verified full payment', exact: true }).click();
  await page.getByLabel('Test identity').selectOption('warehouse');
  const card = page.getByTestId('warehouse-job');
  await expect(card).toHaveCount(1);
  await expect(page.getByLabel('Orders column').getByTestId('warehouse-job')).toHaveCount(1);
  for (const name of ['Orders', 'Partially Shipped', 'Shipped', 'Dropoff/Pickup']) await expect(page.getByLabel(`${name} column`, { exact: true })).toBeVisible();
  const workspace = async (): Promise<Workspace> => (await page.request.get('/api/workspace', { headers: { 'X-Demo-Identity': 'manager' } })).json();
  const original = (await workspace()).jobs[0];
  await card.locator('summary').click();
  const [popup, pdf] = await Promise.all([
    page.waitForEvent('popup'), page.waitForResponse(r => r.url().endsWith('/packing-slip.pdf')),
    card.getByRole('button', { name: 'View Packing Slip PDF' }).click(),
  ]);
  expect(pdf.ok()).toBeTruthy(); expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await popup.waitForURL(/^blob:/, { waitUntil: 'commit' }); await popup.close();
  await card.getByRole('button', { name: 'Print', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Sample packing slip print preview' });
  await expect(preview).toContainText('SAMPLE PACKING SLIP');
  await expect(preview).toContainText('Not an invoice or shipping label');
  await page.evaluate(() => { window.print = () => document.body.setAttribute('data-print-called', 'yes'); });
  await page.getByRole('button', { name: 'Print sample slip', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-print-called', 'yes');
  await page.emulateMedia({ media: 'print' }); await expect(page.locator('.app')).toBeHidden(); await expect(page.locator('.packing-paper')).toBeVisible();
  await page.emulateMedia({ media: 'screen' }); await page.getByRole('button', { name: 'Close print preview' }).click();
  await card.dragTo(page.getByLabel('Shipped column', { exact: true }));
  await expect(page.getByRole('dialog', { name: 'Record shipment tracking' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await workspace()).jobs[0]).toEqual(original);
  await card.getByRole('button', { name: 'Move to Shipped', exact: true }).click();
  await page.getByLabel('Tracking number').fill('1ZLOCAL12345');
  await page.getByRole('button', { name: 'Save shipment', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Record shipment tracking' })).toHaveCount(0);
  await expect(page.getByLabel('Shipped column', { exact: true }).getByTestId('warehouse-job')).toHaveCount(1);
  await expect(page.getByLabel('Orders column').getByTestId('warehouse-job')).toHaveCount(0);
  await expect(card.locator('.slack-preview')).toContainText('capture · sent');
  for (const text of ['rep-a', 'Juniper Market', 'DZ-1001', '1ZLOCAL12345']) await expect(card.locator('.slack-preview')).toContainText(text);
  const saved = (await workspace()).jobs[0];
  expect(saved.releaseAudit).toEqual(original.releaseAudit);
  const repeat = await page.request.post(`/api/jobs/${saved.id}/move`, { headers: { 'X-Demo-Identity': 'warehouse' }, data: { target: 'Shipped', tracking: '1ZLOCAL12345', expectedRevision: 1, requestKey: 'different-key' } });
  expect((await repeat.json()).alert).toMatchObject({ status: 'sent', attempts: 1 });
  await page.screenshot({ path: 'test-results/warehouse-kanban.png', fullPage: true });
  await page.getByLabel('Test identity').selectOption('rep-a');
  await expect(page.getByRole('button', { name: 'Move to Shipped' })).toHaveCount(0);
  const denied = await page.request.post(`/api/jobs/${saved.id}/move`, { headers: { 'X-Demo-Identity': 'rep-a' }, data: { target: 'Shipped', tracking: '1ZLOCAL12345', expectedRevision: 1, requestKey: 'rep-forgery' } });
  expect(denied.status()).toBe(403);
});

test('failed alert preserves shipment and retries once; filters and pickup routing stay scoped', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Receive verified full payment', exact: true }).click();
  await page.getByRole('button', { name: 'Fail next Slack alert', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('will fail once');
  await page.getByLabel('Test identity').selectOption('warehouse');
  await page.getByRole('button', { name: 'Move to Shipped', exact: true }).click();
  await page.getByLabel('Tracking number').fill('TRACKFAIL123');
  await page.getByRole('button', { name: 'Save shipment', exact: true }).click();
  const shipped = page.getByLabel('Shipped column', { exact: true }).getByTestId('warehouse-job');
  await expect(shipped).toContainText('TRACKFAIL123');
  await expect(shipped.getByRole('alert')).toContainText('Shipment is saved');
  await shipped.getByRole('button', { name: 'Retry Slack alert' }).click();
  await expect(shipped.locator('.slack-preview')).toContainText('capture · sent');
  await expect(shipped.locator('.slack-preview')).toContainText('Attempts: 2');
  await page.getByLabel('Search warehouse').fill('does-not-match'); await expect(page.getByTestId('warehouse-job')).toHaveCount(0);
  await page.getByLabel('Search warehouse').fill('TRACKFAIL123'); await expect(page.getByTestId('warehouse-job')).toHaveCount(1);
  await page.getByLabel('Search warehouse').fill('');
  await page.getByLabel('Shipping type', { exact: true }).selectOption('Pickup'); await expect(page.getByTestId('warehouse-job')).toHaveCount(0);
  await page.getByLabel('Shipping type', { exact: true }).selectOption('');
  await page.getByLabel('Priority', { exact: true }).selectOption('Urgent'); await expect(page.getByTestId('warehouse-job')).toHaveCount(1);
  await page.getByLabel('From date (Pacific)').fill('2099-01-01'); await expect(page.getByTestId('warehouse-job')).toHaveCount(0);
  await page.getByLabel('From date (Pacific)').fill('');
  await page.getByLabel('Priority', { exact: true }).selectOption('');
  await page.request.post('/api/demo/invoices/inv-b/events', { headers: { 'X-Demo-Identity': 'manager' }, data: { event: 'full' } });
  await page.reload();
  // Reload selects manager by design; warehouse must be selected again.
  await page.getByLabel('Test identity').selectOption('warehouse');
  await page.getByRole('button', { name: 'Move to Dropoff/Pickup', exact: true }).click();
  await expect(page.getByLabel('Dropoff/Pickup column').getByTestId('warehouse-job')).toContainText('Cedar Supply');
  await expect(page.getByLabel('Partially Shipped column')).toContainText('read-only');
});
