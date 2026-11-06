import { test, expect } from '@playwright/test';
import type { Workspace } from '../../shared/contracts';

test.beforeEach(async ({ request }) => {
  const reset = await request.post('/api/demo/reset', { headers: { 'X-Demo-Identity': 'manager' }, data: {} });
  expect(reset.ok()).toBeTruthy();
});

test('fresh verified full payment automatically releases one job and replay preserves its original audit', async ({ page }) => {
  // beforeEach resets the API. No manual terms release is made in this path.
  const managerWorkspace = async (): Promise<Workspace> => {
    const response = await page.request.get('/api/workspace', { headers: { 'X-Demo-Identity': 'manager' } });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const expectWarehouseJob = async (jobId: string) => {
    await page.getByLabel('Test identity').selectOption('warehouse');
    const cards = page.getByTestId('warehouse-job');
    await expect(cards).toHaveCount(1);
    await expect(cards.getByRole('heading', { name: 'DZ-1001', exact: true })).toBeVisible();
    await expect(cards.locator('.job-id')).toHaveText(jobId);
    await expect(cards).toContainText('Linked source: inv-open');
    await expect(page.getByRole('heading', { name: 'Sample invoices' })).toHaveCount(0);
  };

  await page.goto('/');
  await expect(page.locator('.detail .panel-title h2')).toHaveText('DZ-1001');
  const fresh = await managerWorkspace();
  expect(fresh.invoices.find(i => i.id === 'inv-open')).toMatchObject({ payment: 'unpaid', verification: 'verified', balance: '100.00', jobId: null });
  expect(fresh.jobs).toEqual([]);
  await page.getByLabel('Test identity').selectOption('warehouse');
  await expect(page.getByRole('heading', { name: 'No released work yet' })).toBeVisible();
  await expect(page.getByTestId('warehouse-job')).toHaveCount(0);

  await page.getByLabel('Test identity').selectOption('manager');
  await page.getByRole('button', { name: 'Receive verified full payment', exact: true }).click();
  await expect(page.getByTestId('warehouse-job')).toHaveCount(1);
  await expect(page.locator('.invoice-facts')).toContainText('$0.00');
  const paid = await managerWorkspace();
  expect(paid.jobs).toHaveLength(1);
  const original = paid.jobs[0];
  expect(original.invoiceId).toBe('inv-open');
  expect(original.releaseAudit).toMatchObject({ basis: 'verified_payment', actor: 'fixture-payment-verifier', terms: null });
  expect(original.releaseAudit?.at).toBeTruthy();
  expect(paid.invoices.find(i => i.id === 'inv-open')).toMatchObject({ payment: 'fully paid', balance: '0.00', jobId: original.id });
  await expectWarehouseJob(original.id);

  await page.getByLabel('Test identity').selectOption('manager');
  await page.getByRole('button', { name: 'Replay full event', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('duplicate');
  const replayed = await managerWorkspace();
  expect(replayed.jobs).toHaveLength(1);
  expect(replayed.jobs[0].id).toBe(original.id);
  expect(replayed.jobs[0].releaseAudit).toEqual(original.releaseAudit);
  expect(replayed.jobs[0]).toEqual(original);
  await expectWarehouseJob(original.id);
});
test('manager terms release, payments, replay, audit preservation and warehouse view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'From invoice to warehouse.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No released work yet' })).toBeVisible();
  await page.getByLabel('Documented terms').selectOption('terms-a-net15');
  await page.getByLabel('Reason for early release').fill('Approved customer net 15 agreement');
  await page.getByRole('button', { name: 'Push to warehouse' }).click();
  await expect(page.getByTestId('warehouse-job')).toHaveCount(1);
  const originalAudit = await page.locator('.release-record').innerText();
  await page.getByRole('button', { name: 'Receive $40 payment', exact: true }).click();
  await expect(page.locator('.invoice-facts')).toContainText('$60.00');
  await page.getByRole('button', { name: 'Receive verified full payment', exact: true }).click();
  await expect(page.locator('.invoice-facts')).toContainText('$0.00');
  await page.getByRole('button', { name: 'Replay full event', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('duplicate');
  await page.getByRole('button', { name: 'Repeat release request', exact: false }).click();
  await expect(page.getByRole('status')).toContainText('original audit preserved');
  await expect(page.locator('.release-record')).toHaveText(originalAudit, { useInnerText: true });
  await page.getByRole('button', { name: 'Mark stale', exact: true }).click();
  await expect(page.getByTestId('warehouse-job')).toContainText('Review required');
  await page.screenshot({ path: 'test-results/local-workflow-desktop.png', fullPage: true });
  await page.getByLabel('Test identity').selectOption('warehouse');
  await expect(page.getByTestId('warehouse-job')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Sample invoices' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Push to warehouse' })).toHaveCount(0);
});
test('rep scope, disabled/revoked identities and narrow mobile shell', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Test identity').selectOption('rep-b');
  await expect(page.locator('.invoice-row')).toHaveCount(1);
  await expect(page.locator('.invoice-row')).toContainText('Cedar Supply');
  await expect(page.getByRole('button', { name: 'Push to warehouse' })).toHaveCount(0);
  await page.getByLabel('Test identity').selectOption('disabled');
  await expect(page.getByRole('alert')).toContainText('Active local test identity required');
  await expect(page.locator('.invoice-row')).toHaveCount(0);
  await page.getByLabel('Test identity').selectOption('revoked');
  await expect(page.getByRole('alert')).toContainText('Read permission revoked');
  await page.getByLabel('Test identity').selectOption('manager');
  await expect(page.locator('.invoice-row')).toHaveCount(9);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/local-workflow-mobile.png', fullPage: true });
});
