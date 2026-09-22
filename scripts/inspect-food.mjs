import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('button', { name: 'Food tab', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Map tab', exact: true })).toHaveCount(0);
  await expect(page.getByText('THE GOOD FOOD CLUB.', { exact: true })).toBeVisible();
  await expect(page.getByText(/toters/i)).toHaveCount(0);
  await expect(page.getByTestId('food-menu-item')).toHaveCount(0);
  await expect(page.getByTestId('food-store-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'View SALATA menu', exact: true }).click({ trial: true });
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/food.png' });
  await page.getByRole('button', { name: 'View SALATA menu', exact: true }).click();
  await expect(page.getByTestId('food-menu-item')).toHaveCount(25);
  await page.getByRole('button', { name: 'Salads', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search this menu' }).fill('green goddess');
  await expect(page.getByTestId('food-menu-item')).toHaveCount(1);
  await expect(page.getByTestId('food-menu-item')).toContainText('$13.00');
  await expect(page.getByTestId('food-menu-item')).toContainText('474 kcal');
  await page.evaluate(() => { window.__foodLinks = []; window.open = (url) => { window.__foodLinks.push(url); return null; }; });
  await page.getByRole('button', { name: 'Source menu for GREEN GODDESS', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__foodLinks)).toEqual(['https://salata.co/menu/p/green-goddess']);
  await page.getByRole('textbox', { name: 'Search this menu' }).fill('not-a-real-meal');
  await expect(page.getByText('NO MATCHES YET.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear menu filters', exact: true }).click();
  await expect(page.getByTestId('food-menu-item')).toHaveCount(25);
  await page.getByRole('button', { name: 'Back to kitchens', exact: true }).click();
  await page.getByRole('button', { name: 'View BôCafé menu', exact: true }).click();
  await expect(page.getByTestId('food-menu-item')).toHaveCount(20);
  await expect(page.getByTestId('food-menu-item').filter({ hasText: 'GREEN GODDESS' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to kitchens', exact: true }).click();
  await page.getByRole('button', { name: 'View Slice & Bowl menu', exact: true }).click();
  await expect(page.getByTestId('food-menu-item')).toHaveCount(4);
  await page.getByRole('button', { name: 'Back to kitchens', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search kitchens' }).fill('salata');
  await expect(page.getByTestId('food-store-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'View SALATA menu', exact: true }).click();
  await expect(page.getByTestId('food-menu-item')).toHaveCount(25);
  await page.getByRole('button', { name: 'Back to kitchens', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search kitchens' })).toHaveValue('salata');
  await page.getByRole('button', { name: 'Clear search kitchens', exact: true }).click();
  for (const tab of ['Discover', 'Compete', 'Profile', 'Food']) {
    await page.getByRole('button', { name: `${tab} tab`, exact: true }).click();
  }
  expect(errors).toEqual([]);
  console.log('Separate store menus, scoped search/reset, back navigation, source links and directory filters passed.');
} finally {
  await browser.close();
}
