import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('CONSOLE:', msg.text());
});
await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.getByText('YOUR NEXT GOOD THING.', { exact: true }).waitFor({ timeout: 120000 });
await page.screenshot({ path: 'artifacts/discover.png', fullPage: true });
console.log((await page.locator('body').innerText()).slice(0, 7000));
await browser.close();
