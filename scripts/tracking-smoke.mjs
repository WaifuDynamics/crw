import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
});
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  permissions: ['geolocation'],
  geolocation: { latitude: 33.9, longitude: 35.49, accuracy: 5 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/auth/me', (route) =>
  route.fulfill({
    json: {
      id: 'tracking-ui-test',
      display_name: 'Test Runner',
      account: { onboarding_completed_at: '2026-01-01T00:00:00Z' },
    },
  }),
);
try {
  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('button', { name: 'Tracking tab', exact: true }).click({ timeout: 60000 });
  await expect(page.getByText('This week', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Profile tab', exact: true })).toHaveCount(0);
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'artifacts/tracking.png' });
  await page.getByRole('button', { name: 'Connect your watch', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Available in the mobile app', exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: 'artifacts/tracking-connect.png' });
  await page.getByRole('button', { name: 'Close health connections', exact: true }).click();
  await page.getByRole('button', { name: 'Start run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause run', exact: true })).toBeVisible();
  // Move at running speed; distance must come from location callbacks.
  for (let i = 1; i <= 4; i++) {
    await page.waitForTimeout(2100);
    await context.setGeolocation({ latitude: 33.9 + i * 0.00004, longitude: 35.49, accuracy: 5 });
  }
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Pause run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume run', exact: true })).toBeVisible();
  const read = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('pace.tracking.v1.tracking-ui-test')));
  const paused = await read();
  expect(paused.active.meters).toBeGreaterThan(5);
  expect(paused.active.status).toBe('paused');
  await context.setGeolocation({ latitude: 34.1, longitude: 35.5, accuracy: 5 });
  await page.waitForTimeout(2200);
  expect((await read()).active.meters).toBe(paused.active.meters);
  await page.getByRole('button', { name: 'Resume run', exact: true }).click();
  await page.waitForTimeout(1000);
  await page.reload();
  await page.getByRole('button', { name: 'Tracking tab', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume run', exact: true })).toBeVisible();
  expect((await read()).active.status).toBe('paused');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open camera', exact: true })).toBeVisible();
  const saved = await read();
  expect(saved.active).toBeNull();
  expect(saved.runs).toHaveLength(1);
  expect(saved.runs[0].meters).toBeLessThan(100);
  await page.screenshot({ path: 'artifacts/tracking-summary.png' });
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to run', exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'artifacts/tracking-photo.png' });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await (await chooserPromise).setFiles('apps/mobile/assets/ads/move.jpg');
  await expect(page.getByRole('button', { name: 'Save photo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Light mode', exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'artifacts/tracking-photo-light.png' });
  const photoDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await (await photoDownload).saveAs('artifacts/tracking-photo-export.png');
  await page.getByRole('button', { name: 'Back to run', exact: true }).click();
  await page.getByRole('button', { name: 'Close run summary', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Tracking tab', exact: true }).click();
  await expect(page.getByRole('button', { name: /^View run / })).toHaveCount(1);
  await page.getByRole('button', { name: /^View run / }).click();
  await page.getByRole('button', { name: 'Delete run', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete run', exact: true }).click();
  await expect(page.getByRole('button', { name: /^View run / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Compete tab', exact: true }).click();
  await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  await expect(page.getByText('YOUR CRW+.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    'Tracking UI passed: navigation, GPS distance, pause/resume, save/reload/delete, health availability, photo export.',
  );
} finally {
  await browser.close();
}
