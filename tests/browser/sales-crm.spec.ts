import { expect, test } from '@playwright/test';
import { isSalesCrmEnabled, salesCrmApiWorkspace } from '../../shared/sales-crm';
import { reportingApi, type ReportingPage } from '../../shared/reporting';
import { isSalesAuthEnabled } from '../../shared/sales-auth';

if (!isSalesCrmEnabled(process.env)) {
  test('CRM is hidden by default and its direct entry preserves the legacy shell', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sample invoices' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sales CRM' })).toHaveCount(0);
    await page.goto('/sales');
    await expect(page.getByRole('heading', { name: 'Sample invoices' })).toBeVisible();
    expect((await request.get(salesCrmApiWorkspace, { headers: { 'X-Demo-Identity': 'manager' } })).status()).toBe(404);
    expect((await request.get(reportingApi, { headers: { 'X-Demo-Identity': 'manager' } })).status()).toBe(404);
  });
} else if (!isSalesAuthEnabled(process.env)) {
  test('authorized rep can reach every CRM section and return to the existing workflow', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Test identity').selectOption('rep-a');
    await page.getByRole('link', { name: 'Sales CRM' }).click();
    await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toBeVisible();
    await expect(page.getByText('Viewing as Rep A', { exact: false })).toBeVisible();

    const commission = page.getByRole('article').filter({ hasText: 'Monthly Commission' });
    await expect(commission).toContainText('Coming Soon');
    await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Monthly Sales', exact: true }) })).toContainText('Verified first-email subtotal');
    await expect(page.getByRole('article').filter({ hasText: 'Today’s Follow-Ups' })).toContainText('No data yet');

    const navigation = page.getByRole('navigation', { name: 'Sales CRM sections' });
    await expect(navigation.getByRole('link')).toHaveCount(9);
    await expect(navigation.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    for (const section of ['Leads', 'Customers', 'Pipeline', 'Tasks', 'AI Assistant', 'Reports', 'Field Sales', 'Settings']) {
      await navigation.getByRole('link', { name: section, exact: true }).click();
      await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
      await expect(navigation.getByRole('link', { name: section, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { name: section === 'Reports' ? 'Invoice reporting' : 'Development placeholder' })).toBeVisible();
    }
    await expect(page.getByRole('article').filter({ hasText: 'Zoho Inventory' })).toContainText('Not configured');
    await expect(page.getByRole('article').filter({ hasText: 'ShipStation' })).toContainText('Not configured');
    await page.getByRole('link', { name: 'Invoice workflow' }).click();
    await expect(page.getByRole('heading', { name: 'Sample invoices' })).toBeVisible();
  });

  test('fresh entry and warehouse identity cannot open CRM pages', async ({ page }) => {
    await page.goto('/sales');
    await expect(page.getByRole('heading', { name: 'Workspace unavailable' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sales CRM sections' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Return to invoice workflow' }).click();
    await page.getByLabel('Test identity').selectOption('warehouse');
    await expect(page.getByRole('heading', { name: 'Warehouse board' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sales CRM' })).toHaveCount(0);
    await page.goto('/sales/reports');
    await expect(page.getByRole('heading', { name: 'Workspace unavailable' })).toBeVisible();
  });

  test('date filters, payment filters and verified invoice details agree across dashboard and report', async ({ page, request }) => {
    const database = await request.get('/.sales-reporting-demo/invoices.sqlite');
    expect((await database.body()).subarray(0, 15).toString('ascii')).not.toBe('SQLite format 3');
    if (database.ok()) expect(database.headers()['content-type']).toContain('text/html');
    const response = await request.get(reportingApi + '?preset=today', { headers: { 'X-Demo-Identity': 'rep-a' } });
    const report: ReportingPage = await response.json();
    const today = report.range.selected.start;
    await page.goto('/');
    await page.getByLabel('Test identity').selectOption('rep-a');
    await page.getByRole('link', { name: 'Sales CRM' }).click();
    const dates = page.getByLabel('Reporting date range');
    await expect(dates).toHaveValue('mtd');
    expect(await dates.locator('option').count()).toBe(14);
    await dates.selectOption('custom');
    await page.getByLabel('Start date').fill('2026-03-03');
    await page.getByLabel('End date').fill('2026-03-02');
    await page.getByRole('button', { name: 'Apply dates' }).click();
    await expect(page.getByRole('alert')).toContainText('End date must be on or after start date');
    await page.getByLabel('Start date').fill(today);
    await page.getByLabel('End date').fill(today);
    await page.getByRole('button', { name: 'Apply dates' }).click();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    const invoiceCard = page.getByRole('article').filter({ hasText: 'Invoices for Selected Range' });
    await expect(invoiceCard).toContainText('2 invoices');
    await expect(invoiceCard).toContainText('USD 1,401.00');
    await expect(page.getByRole('heading', { name: 'Weekly Sales Goal' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Today’s Follow-Ups' })).toBeVisible();
    await invoiceCard.getByRole('link', { name: 'View filtered invoices' }).click();
    await expect(page.getByRole('heading', { name: 'Invoice reporting' })).toBeVisible();
    await expect(page.getByLabel('Start date')).toHaveValue(today);
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Synthetic data preview.', { exact: false })).toBeVisible();
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'DEMO-1006' })).toHaveCount(0);
    await page.getByLabel('Search invoices').fill('1002');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
    await page.getByRole('button', { name: 'DEMO-1002' }).click();
    const detail = page.getByRole('region', { name: 'Invoice details' });
    await expect(detail.getByRole('heading', { name: 'Invoice DEMO-1002' })).toBeVisible();
    await expect(detail).toContainText('Synthetic send receipt');
    await expect(detail).toContainText('USD 125.25');
    await page.getByRole('button', { name: 'Closed', exact: true }).click();
    await expect(page.getByText('No qualifying invoices match these filters.')).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(dates).toHaveValue('custom');
    await expect(page.getByLabel('End date')).toHaveValue(today);
    await page.getByRole('button', { name: 'Reset dates' }).click();
    await expect(dates).toHaveValue('mtd');
    await page.reload();
    await expect(dates).toHaveValue('mtd');
  });

  test('reporting can retry failed data requests without losing its date controls', async ({ page }) => {
    const pattern = '**' + reportingApi + '?*';
    await page.route(pattern, route => route.fulfill({ status: 503 }));
    await page.goto('/');
    await page.getByRole('link', { name: 'Sales CRM' }).click();
    await expect(page.getByRole('alert')).toContainText('Reporting could not load');
    await expect(page.getByLabel('Reporting date range')).toHaveValue('mtd');
    await page.unroute(pattern);
    await page.getByRole('button', { name: 'Retry reporting' }).click();
    await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Monthly Sales', exact: true }) })).toContainText('Verified first-email subtotal');
  });

  test('dashboard works on a narrow screen and placeholder links support keyboard activation', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await page.getByRole('link', { name: 'Sales CRM' }).click();
    await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const tasks = page.getByRole('link', { name: 'Tasks', exact: true });
    await tasks.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByLabel('Reporting date range').selectOption('custom');
    await expect(page.getByLabel('Start date')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('workspace shows a loading state and can retry a failed request', async ({ page }) => {
    let failPendingRequest: (() => void) | undefined;
    const allowFailure = new Promise<void>(resolve => { failPendingRequest = resolve; });
    const pattern = '**' + salesCrmApiWorkspace;
    await page.route(pattern, async route => {
      await allowFailure;
      await route.fulfill({ status: 503 });
    });

    await page.goto('/');
    await page.getByRole('link', { name: 'Sales CRM' }).click();
    await expect(page.getByRole('status')).toHaveText('Loading workspace…');
    failPendingRequest?.();
    await expect(page.getByRole('alert')).toContainText('local API request failed');
    await page.unroute(pattern);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toBeVisible();
  });
}
