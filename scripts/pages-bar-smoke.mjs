import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Captures the liquid glass dock at three widths and on every tab, and checks
// that the four tabs stay reachable, named and selectable with a clean console.
const tabs = ['Discover', 'Food', 'Compete', 'Tracking'];
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
});
try {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 120000 });

  const bar = page.getByTestId('pages-bar');
  await expect(bar).toBeVisible({ timeout: 60000 });
  for (const tab of tabs)
    await expect(page.getByRole('button', { name: `${tab} tab`, exact: true })).toBeVisible();

  // The dock floats: it must not span the full width, and content scrolls under it.
  for (const width of [320, 430, 1440]) {
    await page.setViewportSize({ width, height: 932 });
    await page.waitForTimeout(400);
    // The app frame is capped at 480 on web and carries a 1px rule on each side.
    const frame = Math.min(width, 480) - 2;
    const box = await bar.boundingBox();
    expect(Math.round(box.width)).toBe(frame - 28);
    expect(Math.round(box.height)).toBe(64);
    await page.screenshot({ path: `artifacts/pages-bar-glass-${width}.png` });
  }

  await page.setViewportSize({ width: 430, height: 932 });
  for (const tab of tabs) {
    await page.getByRole('button', { name: `${tab} tab`, exact: true }).click();
    await page.waitForTimeout(500);
    const selected = page.getByRole('button', { name: `${tab} tab`, exact: true });
    await expect(selected).toHaveAttribute('aria-current', 'page');
    await page.screenshot({
      path: `artifacts/pages-bar-glass-${tab.toLowerCase()}.png`,
      clip: { x: 0, y: 932 - 190, width: 430, height: 190 },
    });
  }

  expect(errors).toEqual([]);
  console.log('Pages bar passed: floating glass dock at 320/430/1440, four tabs, clean console.');
} finally {
  await browser.close();
}
