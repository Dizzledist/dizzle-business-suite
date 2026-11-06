import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const reset = await request.post('/api/demo/reset', { headers: { 'X-Demo-Identity': 'manager' }, data: {} });
  expect(reset.ok()).toBeTruthy();
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
