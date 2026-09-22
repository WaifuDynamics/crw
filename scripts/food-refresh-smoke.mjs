import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
const env = await readFile('apps/mobile/.env', 'utf8');
const api = env.match(/^EXPO_PUBLIC_API_URL=(.*)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '') || 'http://localhost:4000';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
await mkdir('artifacts', { recursive: true });
try {
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
    await context.addInitScript(theme => localStorage.setItem('crw.theme', theme), theme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(`${api}/**`, async route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path.endsWith('/auth/me')) data = { id: 'food-preview', display_name: 'Alex', avatar_url: null };
      else if (path.endsWith('/events')) data = { events: [] };
      else if (path.endsWith('/communities') || path.endsWith('/notifications')) data = [];
      else if (path.endsWith('/catalog')) data = { categories: [], cities: [] };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto('http://localhost:8081/food', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByRole('button', { name: 'Food tab', exact: true }).click({ timeout: 60000 });
    await expect(page.getByTestId('food-store-card')).toHaveCount(3);
    for (const width of [320, 430, 1440]) {
      await page.setViewportSize({ width, height: 932 });
      await page.waitForTimeout(1000);
      await page.evaluate(() => Promise.all(Array.from(document.images).map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; }))));
      await page.screenshot({ path: `artifacts/food-refresh-${theme}-${width}.png`, fullPage: true });
      for (const card of await page.getByTestId('food-store-card').all()) {
        const box = await card.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
    }
    await page.setViewportSize({ width: 430, height: 932 });
    await expect(page.getByTestId('food-menu-item')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Search restaurants', exact: true }).fill('zzzz-no-food');
    await expect(page.getByText('NO RESTAURANTS FOUND.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show all restaurants', exact: true }).click();
    await expect(page.getByTestId('food-store-card')).toHaveCount(3);
    await page.getByRole('textbox', { name: 'Search restaurants', exact: true }).fill('salata');
    await expect(page.getByTestId('food-store-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear search restaurants', exact: true }).click();
    await page.getByRole('button', { name: 'View SALATA menu', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Search this menu', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Salads', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search this menu', exact: true }).fill('green goddess');
    await expect(page.getByTestId('food-menu-item')).toHaveCount(1);
    await page.screenshot({ path: `artifacts/food-refresh-${theme}-menu.png`, fullPage: true });
    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('food-menu-item').click();
    const popup = await popupPromise;
    expect(popup.url()).toContain('salata.co/menu/p/green-goddess');
    await popup.close();
    await page.getByRole('button', { name: 'Back to kitchens', exact: true }).click();
    await expect(page.getByTestId('food-store-card')).toHaveCount(3);
    expect(errors).toEqual([]);
    await context.close();
  }
  console.log('Food passed: dark/light, 320/430/1440 widths, restaurant separation, search, empty/reset, kitchen navigation, menu categories, source link, back navigation.');
} finally { await browser.close(); }
