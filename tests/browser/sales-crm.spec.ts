import { expect, test } from '@playwright/test';
import { isSalesCrmEnabled, salesCrmApiWorkspace } from '../../shared/sales-crm';

if (!isSalesCrmEnabled(process.env)) {
  test('CRM is hidden by default and its direct entry preserves the legacy shell', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sample invoices' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sales CRM' })).toHaveCount(0);
    await page.goto('/sales');
    await expect(page.getByRole('heading', { name: 'Sample invoices' })).toBeVisible();
    expect((await request.get(salesCrmApiWorkspace, { headers: { 'X-Demo-Identity': 'manager' } })).status()).toBe(404);
  });
} else {
  test('authorized rep can reach every CRM section and return to the existing workflow', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Test identity').selectOption('rep-a');
    await page.getByRole('link', { name: 'Sales CRM' }).click();
    await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toBeVisible();
    await expect(page.getByText('Viewing as Rep A', { exact: false })).toBeVisible();

    const commission = page.getByRole('article').filter({ hasText: 'Monthly Commission' });
    await expect(commission).toContainText('Coming Soon');
    await expect(page.getByRole('article').filter({ hasText: 'Monthly Sales' })).toContainText('Not configured');
    await expect(page.getByRole('article').filter({ hasText: 'Today’s Follow-Ups' })).toContainText('No data yet');

    const navigation = page.getByRole('navigation', { name: 'Sales CRM sections' });
    await expect(navigation.getByRole('link')).toHaveCount(9);
    await expect(navigation.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    for (const section of ['Leads', 'Customers', 'Pipeline', 'Tasks', 'AI Assistant', 'Reports', 'Field Sales', 'Settings']) {
      await navigation.getByRole('link', { name: section, exact: true }).click();
      await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
      await expect(navigation.getByRole('link', { name: section, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { name: 'Development placeholder' })).toBeVisible();
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
