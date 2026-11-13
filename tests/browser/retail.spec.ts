import { expect, test } from '@playwright/test';
import { managementDashboards } from '../../shared/retail-reporting';
const format = (minor: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
test.beforeEach(async ({ page }) => { await page.goto('/'); await page.getByRole('button', { name: 'Sign in with Google Workspace' }).click(); await page.getByRole('tab', { name: 'Retail Analytics', exact: true }).waitFor(); });
test('Marketing shows scoped Shopify KPIs, trend, products, Pacific dates, currency and demo freshness', async ({ page }) => {
  await page.getByRole('tab', { name: 'Retail Analytics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Retail Analytics', exact: true })).toBeVisible(); await expect(page.getByTestId('retail-net-sales')).toContainText('$');
  await expect(page.getByLabel('Authorized store').locator('option')).toHaveCount(2); await expect(page.getByText('DEMO DATA', { exact: true })).toBeVisible(); await expect(page.locator('.retail-period')).toContainText('America/Los_Angeles'); await expect(page.locator('.retail-period')).toContainText('USD'); await expect(page.locator('.retail-period')).toContainText('Fixture snapshot');
  const report = await page.evaluate(async () => (await fetch('/api/reporting/retail?from=2026-10-15&to=2026-11-13&storeId=fixture-cheddr-us')).json());
  await expect(page.getByTestId('retail-net-sales')).toContainText(format(report.metrics.netSalesMinor, 'USD')); await expect(page.getByRole('img', { name: /Daily net merchandise sales/ })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Top products', exact: true })).toBeVisible();
  expect((await page.getByRole('img', { name: /Daily net merchandise sales/ }).boundingBox())!.height).toBeGreaterThanOrEqual(180);
  await page.screenshot({ path: 'test-results/retail-desktop.png', fullPage: true });
  await page.getByLabel('Inspect trend date').fill('0'); await expect(page.locator('.retail-card output')).toContainText('2026-10-15');
  await page.getByLabel('Reporting from').fill('2026-11-01'); await page.getByLabel('Reporting through').fill('2026-11-01'); await page.getByRole('button', { name: 'Apply dates' }).click(); await expect(page.locator('.retail-period')).toContainText('2026-11-01 – 2026-11-01');
  const denied = await page.evaluate(async () => ({ foreign: (await fetch('/api/reporting/retail?from=2026-11-01&to=2026-11-01&storeId=fixture-foreign')).status, fixtureHeader: (await fetch('/api/reporting/retail/stores', { headers: { 'X-Demo-Identity': 'owner' } })).status })); expect(denied).toEqual({ foreign: 404, fixtureHeader: 401 });
  await page.setViewportSize({ width: 390, height: 844 }); await expect(page.locator('#workspace-sidebar')).toBeHidden(); await page.getByRole('button', { name: 'Open workspace navigation', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('tab', { name: 'Retail Analytics', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await page.screenshot({ path: 'test-results/retail-mobile.png', fullPage: true, animations: 'disabled' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('all three adoption-preview toggles default off, persist after reload and show exact channel sums', async ({ page }) => {
  await page.goto('/tests/browser/retail-preview.html'); await expect(page.getByRole('heading', { name: 'Management reporting adoption preview' })).toBeVisible();
  for (const dashboard of managementDashboards) { const toggle = page.getByLabel(`Include Shopify sales · ${dashboard}`, { exact: true }); await expect(toggle).toBeEnabled(); await expect(toggle).not.toBeChecked(); }
  for (const dashboard of managementDashboards) {
    await page.getByLabel(`Include Shopify sales · ${dashboard}`, { exact: true }).check(); await expect(page.getByTestId(`${dashboard}-combined`)).toBeVisible();
    const report = await page.evaluate(async dashboard => (await fetch(`/api/reporting/management/${dashboard}?from=2026-10-15&to=2026-11-13`)).json(), dashboard);
    expect(report.combined.netSalesMinor).toBe(report.wholesale.netSalesMinor + report.retail.reduce((sum: number, r: any) => sum + r.netSalesMinor, 0)); await expect(page.getByTestId(`${dashboard}-combined`)).toContainText(format(report.combined.netSalesMinor, 'USD'));
    await page.reload(); await expect(page.getByLabel(`Include Shopify sales · ${dashboard}`, { exact: true })).toBeChecked();
  }
});
