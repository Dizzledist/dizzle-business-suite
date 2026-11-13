import { expect, test, type Page } from '@playwright/test';
import { samplePassword, samplePasswordEmail } from '../fixtures/password-browser';

async function signIn(page: Page, email = samplePasswordEmail, password = samplePassword) {
  await page.getByLabel('Company email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

if (process.env.DIZZLE_E2E_PASSWORD === 'true') {
  test('administrator can reconcile synthetic revenue using the shared date controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sales');
    await signIn(page);
    await page.getByRole('link', { name: 'Revenue reconciliation' }).click();
    await expect(page.getByRole('heading', { name: 'Revenue reconciliation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Management method' })).toBeVisible();
    await expect(page.getByLabel('Reporting date range')).toHaveValue('mtd');
    await page.getByLabel('Reporting date range').selectOption('last-month');
    await expect(page.getByRole('region', { name: 'Revenue reconciliation' })).toContainText('Original amount');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toBeVisible();
  });
  test('opens all invoice tabs and shows a private synthetic PDF on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sales');
    await signIn(page);
    await page.getByRole('link', { name: 'View recognized invoices' }).click();
    await page.getByRole('button', { name: 'DEMO-1001', exact: true }).click();
    const detail = page.getByRole('region', { name: 'Invoice details' });
    await expect(detail.getByRole('heading', { name: 'Invoice DEMO-1001' })).toBeVisible();
    await expect(detail.getByRole('region', { name: 'Invoice line items' })).toContainText('SAMPLE-JUNIPER');
    const lines = detail.getByRole('tab', { name: 'Line Items' });
    await lines.focus();
    const pdfResponse = page.waitForResponse(response => response.url().includes('/invoices/1001/pdf?'));
    await lines.press('ArrowRight');
    const pdf = await pdfResponse;
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['cache-control']).toBe('private, no-store');
    await expect(detail.getByTitle('Synthetic invoice PDF')).toBeVisible();
    await detail.getByRole('tab', { name: 'Activity' }).click();
    await expect(detail.getByRole('tabpanel')).toContainText('First successful email verified');
    await detail.getByRole('tab', { name: 'Payments' }).click();
    await expect(detail.getByRole('tabpanel')).toContainText('Individual payment transactions are unavailable');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await detail.getByRole('button', { name: 'Close invoice detail' }).click();
    await page.getByRole('button', { name: 'DEMO-1009', exact: true }).click();
    await detail.getByRole('tab', { name: 'Invoice PDF' }).click();
    await expect(detail.getByRole('alert')).toContainText('This sample invoice has no PDF');
  });

  test('labels pre-October coverage and resets to Month to Date', async ({ page }) => {
    await page.goto('/sales');
    await signIn(page);
    await expect(page.getByLabel('Reporting date range')).toHaveValue('mtd');
    await page.getByLabel('Reporting date range').selectOption('custom');
    await page.getByLabel('Start date').fill('2026-09-10');
    await page.getByLabel('End date').fill('2026-09-30');
    await page.getByRole('button', { name: 'Apply dates' }).click();
    await expect(page.getByText('Incomplete reporting coverage.', { exact: false })).toContainText('2026-10-01');
    await expect(page.getByText('Outside initial coverage', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Reset dates' }).click();
    await expect(page.getByLabel('Reporting date range')).toHaveValue('mtd');
  });
  test('company sign-in is mobile-friendly and keeps forgot-password responses generic', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto('/sales');
    await signIn(page, 'unknown@example.test');
    await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');
    await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /google/i })).toHaveCount(0);
    await page.getByRole('button', { name: 'Forgot Password', exact: true }).click();
    await page.getByRole('button', { name: 'Request Password Reset' }).click();
    await expect(page.getByText('If your account is eligible', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('administrator issues an employee setup code and the employee sets, uses, and changes their password', async ({ page, browser, baseURL }) => {
    await page.goto('/sales');
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toBeVisible();
    await expect(page.getByText('Sample Password Admin', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'User management' }).click();
    await expect(page.getByRole('heading', { name: 'Create Employee Account' })).toBeVisible();
    const email = 'password-rep@example.test';
    await page.getByLabel('Name', { exact: true }).fill('Browser Test Representative');
    await page.getByLabel('Company email').fill(email);
    await page.getByRole('button', { name: 'Create Account and Setup Code' }).click();
    const codePanel = page.getByRole('region', { name: 'Private one-time password code' });
    await expect(codePanel).toBeVisible();
    const code = await codePanel.locator('code').innerText();
    await page.getByRole('button', { name: 'Hide Code' }).click();

    const context = await browser.newContext({ baseURL });
    try {
      const employee = await context.newPage();
      const password = 'Fixture only! Willow Meadow 45';
      const replacement = 'Fixture only! Orchard River 65';
      await employee.goto('/sales');
      await employee.getByRole('button', { name: 'Use Setup or Reset Code' }).click();
      await employee.getByLabel('Company email').fill(email);
      await employee.getByLabel('Setup or reset code').fill(code);
      await employee.getByLabel('New password', { exact: true }).fill(password);
      await employee.getByLabel('Confirm new password').fill(password);
      await employee.getByRole('button', { name: 'Save Password' }).click();
      await expect(employee.getByText('Password saved.', { exact: false })).toBeVisible();
      await signIn(employee, email, password);
      await expect(employee.getByText('Sales representative', { exact: true })).toBeVisible();
      await expect(employee.getByRole('link', { name: 'User management' })).toHaveCount(0);
      await employee.getByRole('link', { name: 'Account settings' }).click();
      await employee.getByLabel('Current password').fill(password);
      await employee.getByLabel('New password', { exact: true }).fill(replacement);
      await employee.getByLabel('Confirm new password').fill(replacement);
      await employee.getByRole('button', { name: 'Save New Password' }).click();
      await expect(employee.getByRole('heading', { name: 'Company sign-in' })).toBeVisible();
      await signIn(employee, email, replacement);
      await expect(employee.getByRole('heading', { name: 'Account settings' })).toBeVisible();
      await employee.getByRole('button', { name: 'Sign out' }).click();
      await expect(employee.getByRole('heading', { name: 'Company sign-in' })).toBeVisible();
    } finally { await context.close(); }
  });
}
