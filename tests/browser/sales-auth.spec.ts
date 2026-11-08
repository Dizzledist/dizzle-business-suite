import { expect, test, type BrowserContext } from '@playwright/test';
import { reportingApi } from '../../shared/reporting';
import { isSalesAuthEnabled, salesAuthApi } from '../../shared/sales-auth';
import { isSalesCrmEnabled } from '../../shared/sales-crm';
import { sessionCookieName } from '../../server/sales-crm/auth/sessions';
import { openSalesIdentity } from '../../server/sales-crm/auth/store';
import { requireE2eIdentityPath, testIssuer } from '../fixtures/sales-auth';

const identityPath = process.env.DIZZLE_E2E_IDENTITY_DB;

async function authenticate(context: BrowserContext, url: string, subject: string) {
  const store = openSalesIdentity(requireE2eIdentityPath(identityPath));
  try {
    const token = store.startSession({ issuer: testIssuer, subject });
    // Playwright derives the Secure attribute from the cookie's URL scheme.
    // The synthetic cookie stays on the loopback host used by this test.
    const secureUrl = new URL(url);
    secureUrl.protocol = 'https:';
    await context.addCookies([{ name: sessionCookieName, value: token, url: secureUrl.href, httpOnly: true, sameSite: 'Lax' }]);
    return token;
  } finally {
    store.close();
  }
}

if (isSalesCrmEnabled(process.env) && isSalesAuthEnabled(process.env)) {
  test('company sign-in is explicit, responsive, and unaffected by the fixture selector', async ({ page, request }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto('/');
    await page.getByLabel('Test identity').selectOption('admin');
    await page.evaluate(() => sessionStorage.setItem('dizzle.sales-crm.demo-identity', 'admin'));
    await page.getByRole('link', { name: 'Sales CRM' }).click();
    await expect(page.getByRole('heading', { name: 'Company sign-in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Company sign-in pending setup' })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await request.get(reportingApi, { headers: { 'X-Demo-Identity': 'admin' } })).status()).toBe(401);
  });

  test('a server-issued rep session opens scoped reports and logout removes access', async ({ page, context, baseURL }) => {
    test.skip(!identityPath, 'Requires the isolated synthetic identity test harness.');
    await authenticate(context, baseURL!, 'north');
    await page.addInitScript(() => sessionStorage.setItem('dizzle.sales-crm.demo-identity', 'admin'));
    await page.goto('/sales/reports');
    await expect(page.getByText('Viewing as North Rep.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AUTH-9001' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AUTH-9002' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'User management' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    expect((await page.request.get(reportingApi + '/invoices/9002')).status()).toBe(404);
    expect((await page.request.get(salesAuthApi + '/admin')).status()).toBe(403);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Company sign-in' })).toBeVisible();
    expect((await page.request.get(reportingApi)).status()).toBe(401);
    expect((await context.cookies()).some(cookie => cookie.name === sessionCookieName)).toBe(false);
  });

  test('an administrator can review the directory and audit in the same organization', async ({ page, context, baseURL }) => {
    test.skip(!identityPath, 'Requires the isolated synthetic identity test harness.');
    await authenticate(context, baseURL!, 'admin');
    await page.goto('/sales');
    await page.getByRole('link', { name: 'User management' }).click();
    await expect(page.getByRole('heading', { name: 'User management' })).toBeVisible();
    await expect(page.getByRole('table').getByText('North Rep', { exact: true })).toBeVisible();
    await expect(page.getByRole('table').getByText('Other Admin', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Recent access activity' })).toBeVisible();
  });

  test('a revoked session removes the current report on the next request', async ({ page, context, baseURL }) => {
    test.skip(!identityPath, 'Requires the isolated synthetic identity test harness.');
    const token = await authenticate(context, baseURL!, 'north');
    await page.goto('/sales');
    await expect(page.getByRole('link', { name: 'View recognized invoices' })).toBeVisible();
    const store = openSalesIdentity(requireE2eIdentityPath(identityPath));
    try { store.logout(token); } finally { store.close(); }
    await page.getByLabel('Reporting date range').selectOption('today');
    await expect(page.getByRole('heading', { name: 'Company sign-in' })).toBeVisible();
    await expect(page.getByText('Your session ended.', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toHaveCount(0);
  });
}
