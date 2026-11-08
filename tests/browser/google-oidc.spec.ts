import { expect, test, type Page } from '@playwright/test';
import { googleAuthApi } from '../../shared/sales-auth';
import { authorizationEndpoint, mockGoogleCode } from '../fixtures/google-oidc';

async function interceptGoogle(page: Page, claims: Parameters<typeof mockGoogleCode>[1] = {}) {
  await page.route('**' + googleAuthApi + '/start', async route => {
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const authorization = new URL(response.headers().location);
    expect(authorization.origin + authorization.pathname).toBe(authorizationEndpoint);
    const callback = new URL(authorization.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', authorization.searchParams.get('state')!);
    callback.searchParams.set('code', mockGoogleCode(authorization, claims));
    await route.fulfill({ response, headers: { ...response.headers(), location: callback.href } });
  });
}

if (process.env.DIZZLE_E2E_GOOGLE === 'true') {
  test('Google login returns to the CRM and enables authorized employee administration', async ({ page }) => {
    await interceptGoogle(page);
    await page.goto('/sales');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toBeVisible();
    await expect(page.getByText('admin@example.test', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'User management' }).click();
    await expect(page.getByRole('heading', { name: 'Approve an employee' })).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Sample Employee');
    await page.getByLabel('Google email').fill('new.employee@example.test');
    await page.getByRole('button', { name: 'Approve and issue invitation' }).click();
    await expect(page.getByRole('region', { name: 'Private one-time invitation' })).toBeVisible();
    await expect(page.getByRole('table').getByText('Sample Employee', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Hide invitation' }).click();
    await expect(page.getByRole('region', { name: 'Private one-time invitation' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Company sign-in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('an unapproved Google account stays signed out on mobile', async ({ page, request }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await interceptGoogle(page, { sub: 'unapproved-account', email: 'unapproved@example.test' });
    await page.goto('/sales');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByRole('alert')).toContainText('This Google account could not be approved');
    await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await request.get(googleAuthApi + '/status')).status()).toBe(200);
  });
}
