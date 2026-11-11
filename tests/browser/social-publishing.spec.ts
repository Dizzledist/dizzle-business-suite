import { test, expect } from '@playwright/test';

test('calendar approves the exact posting details, queues, cancels and records a manual post', async ({ page, request, context }) => {
  const api = async (path: string, actor = 'marketing', body?: unknown) => {
    const response = await request.fetch('/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Demo-Identity': actor }, ...(body === undefined ? {} : { data: body }) });
    expect(response.ok(), await response.text()).toBe(true); return response.json();
  };
  const generated = await api('/marketing/generation-jobs', 'marketing', { brandId: 'cheddr', campaignId: 'campaign-cheddr-launch', prompt: 'A square product hero', referenceAssetIds: [], width: 512, height: 512, requestKey: crypto.randomUUID() });
  let versionId = '';
  await expect.poll(async () => { const workspace = await api('/marketing/workspace'); versionId = workspace.generationJobs.find((j: any) => j.id === generated.id)?.versionId; return !!versionId; }).toBe(true);
  await api(`/marketing/versions/${versionId}/submit`, 'marketing', {}); await api(`/marketing/versions/${versionId}/review`, 'owner', { decision: 'approve', notes: 'Approved exact square creative' });
  await page.goto('/'); await page.getByLabel('Test identity').selectOption('marketing'); await page.getByRole('tab', { name: 'Calendar', exact: true }).click(); await page.getByRole('button', { name: 'New content', exact: false }).click();
  const form = page.locator('.content-form');
  await form.getByRole('combobox', { name: /^Campaign/ }).selectOption('campaign-cheddr-launch'); await form.getByLabel('Title', { exact: true }).fill('Approved X launch'); await form.getByLabel('Objective', { exact: true }).fill('Introduce the approved collection');
  await form.getByLabel('Connected publishing account').selectOption('test-cheddr-x'); await expect(form.getByLabel('Destination account', { exact: true })).toHaveValue('@cheddr_test');
  await form.getByRole('button', { name: 'Draft caption & propose time with AI' }).click(); await expect(form.getByLabel('Caption or brief')).toHaveValue('Test proposal: discover the collection.');
  await form.getByLabel('Planned date and time (Pacific)').fill('2030-11-12T12:00'); await form.getByRole('combobox', { name: /^Approved linked creative/ }).selectOption(versionId); await form.getByRole('button', { name: 'Create draft', exact: true }).click();
  let entry = page.locator('.calendar-item').filter({ has: page.getByText('Approved X launch', { exact: true }) });
  await entry.getByRole('button', { name: 'Submit review', exact: true }).click();
  await page.getByLabel('Test identity').selectOption('owner'); await page.getByRole('tab', { name: 'Review', exact: true }).click();
  const review = page.locator('.review-row').filter({ hasText: 'Approved X launch' }); await expect(review.getByRole('img', { name: 'Exact posting creative for Approved X launch' })).toBeVisible(); await expect(review).toContainText('@cheddr_test'); await review.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByLabel('Test identity').selectOption('marketing'); await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  entry = page.locator('.calendar-item').filter({ has: page.getByText('Approved X launch', { exact: true }) }); await entry.getByRole('button', { name: 'Queue approved post', exact: true }).click();
  await expect(entry.locator('.social-job strong')).toHaveText('Scheduled');
  const download = page.waitForEvent('download'); await entry.getByRole('button', { name: 'Download Image', exact: true }).click(); expect((await download).suggestedFilename()).toBe('approved-social-image.jpg');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await entry.getByRole('button', { name: 'Copy Caption', exact: true }).click(); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Test proposal: discover the collection.');
  await entry.getByRole('button', { name: 'Cancel queued post' }).click(); await expect(entry.locator('.social-job strong')).toHaveText('Canceled');
  await entry.getByLabel('Published post URL').fill('https://x.com/cheddr_test/status/123456'); await entry.getByLabel('Actual posting time (Pacific)').fill('2026-11-10T12:00'); await entry.getByRole('button', { name: 'Mark as Posted', exact: true }).click();
  await expect(entry.locator('.social-job strong')).toHaveText('Published'); await expect(entry.getByRole('link', { name: 'Open published post' })).toHaveAttribute('href', 'https://x.com/cheddr_test/status/123456');
  const workspace = await api('/marketing/workspace'); const content = workspace.content.find((c: any) => c.title === 'Approved X launch');
  const denied = await request.get(`/api/marketing/content/${content.id}/social-image`, { headers: { 'X-Demo-Identity': 'rep-a' } }); expect(denied.status()).toBe(403);
  const currentJob = workspace.publishingJobs.find((j: any) => j.payload.contentId === content.id);
  for (const actor of ['rep-a', 'warehouse', 'outside', 'disabled']) {
    const deniedCancel = await request.post(`/api/marketing/publishing-jobs/${currentJob.id}/cancel`, { headers: { 'X-Demo-Identity': actor }, data: {} }); expect(deniedCancel.status()).toBe(actor === 'disabled' ? 401 : 403);
    const deniedManual = await request.post(`/api/marketing/content/${content.id}/mark-posted`, { headers: { 'X-Demo-Identity': actor }, data: { url: 'https://x.com/cheddr_test/status/123456', postedAt: '2026-11-10T20:00:00.000Z' } }); expect(deniedManual.status()).toBe(actor === 'disabled' ? 401 : 403);
  }
  await page.screenshot({ path: 'test-results/social-calendar-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: 'test-results/social-calendar-mobile.png', fullPage: true });
});
