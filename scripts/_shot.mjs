import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  permissions: ['geolocation'],
  geolocation: { latitude: 52.23, longitude: 21.01, accuracy: 6 },
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.route('**/account/legal', (route) => route.fulfill({ json: { ok: true } }));
await page.route('**/auth/me', (route) =>
  route.fulfill({ json: { id: 'ui-shot', display_name: 'Test Runner', account: { onboarding_completed_at: '2026-01-01T00:00:00Z' } } }),
);
const shot = (n) => page.screenshot({ path: `artifacts/shot-${n}.png` });
try {
  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(20000);
  await shot('00-initial');
  for (const box of await page.getByRole('checkbox').all()) {
    // Click the square itself: the row's label carries links to the policies.
    await box.click({ timeout: 5000, position: { x: 12, y: 12 } }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(600);
  const agree = page.getByRole('button', { name: /Agree and continue/ });
  if (await agree.count()) {
    console.log('agree enabled?', await agree.first().isEnabled());
    await agree.first().click({ timeout: 15000 }).catch((e) => console.log('agree click failed'));
    await page.waitForTimeout(6000);
  }
  await shot('01-after-consent');
  const tab = page.getByRole('button', { name: 'Tracking tab', exact: true });
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(5000); }
  await shot('02-dashboard');
  const start = page.getByRole('button', { name: 'Start run', exact: true });
  await start.waitFor({ state: 'visible', timeout: 30000 });
  for (let i = 0; i < 60 && !(await start.isEnabled()); i++) await page.waitForTimeout(500);
  await start.click({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot('03-picker');
  const run = page.getByRole('button', { name: 'Running', exact: true });
  if (await run.count()) await run.first().click();
  await page.waitForTimeout(7000);
  for (let i = 1; i <= 5; i++) {
    await page.waitForTimeout(1500);
    await context.setGeolocation({ latitude: 52.23 + i * 0.00006, longitude: 21.01 + i * 0.00003, accuracy: 6 });
  }
  await page.waitForTimeout(2500);
  await shot('04-session');
  console.log('done');
} catch (e) {
  console.log('ERR', e.message.split('\n')[0]);
  await shot('99-failure');
}
await browser.close();
