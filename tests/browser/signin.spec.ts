import { expect, test } from '@playwright/test';
test('shared sign-in reaches authorized Marketing without fixture selectors, then signs out', async ({ page }) => {
  const fixtureHeaders: string[] = [];
  page.on('request', request => { if (request.headers()['x-demo-identity']) fixtureHeaders.push(request.url()); });
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Sign in to Marketing' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in with Google Workspace' }).click();
  await expect(page.getByRole('tab', { name: 'Calendar' })).toBeVisible();
  await expect(page.getByLabel('Test identity')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await page.getByLabel('Campaign title').fill('Signed-in browser campaign');
  await page.locator('.planner-form').first().getByLabel('Objective').fill('CSRF protected edit');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByRole('status')).toHaveText('Campaign created.');
  await page.reload(); await expect(page.getByRole('tab', { name: 'Calendar' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Marketing' })).toBeVisible();
  expect(fixtureHeaders).toEqual([]);
});
