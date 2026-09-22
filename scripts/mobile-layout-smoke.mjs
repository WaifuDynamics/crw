import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/auth/me', route => route.fulfill({ status: 401, json: { error: 'Not signed in' } }));
  await page.addInitScript(() => localStorage.setItem('pace.tracking.v1.guest', JSON.stringify({
    active: null, health: null,
    runs: [{ id: 'layout-fixture', startedAt: Date.now(), seconds: 1500, meters: 5000, points: [], splits: [], segment: 0, source: 'CRW+ GPS', status: 'finished' }],
  })));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Tracking tab', exact: true }).click();
  async function checkFrame(viewportWidth) {
    await page.setViewportSize({ width: viewportWidth, height: 1000 });
    const frame = page.getByRole('dialog').getByTestId('mobile-modal-frame');
    await expect(frame).toBeVisible();
    await expect.poll(async () => Math.round((await frame.boundingBox()).width)).toBe(Math.min(viewportWidth, 480));
    await expect.poll(async () => Math.round((await frame.boundingBox()).x)).toBe(Math.max(0, (viewportWidth - 480) / 2));
  }
  await page.getByRole('button', { name: 'Connect your watch', exact: true }).click();
  await checkFrame(1440);
  await page.screenshot({ path: 'artifacts/mobile-layout-health.png' });
  await checkFrame(375);
  await page.getByRole('button', { name: 'Close health connections', exact: true }).click();
  await page.getByRole('button', { name: /^View run / }).click();
  await checkFrame(1440);
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  await checkFrame(1440);
  await page.screenshot({ path: 'artifacts/mobile-layout-photo.png' });
  await checkFrame(375);
  await expect(page.getByRole('button', { name: 'Save photo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back to run', exact: true }).click();
  await page.getByRole('button', { name: 'Close run summary', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tracking tab', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  console.log('Mobile layout passed: centered 480px desktop modals, 375px phone width, health/run/photo navigation.');
} finally { await browser.close(); }
