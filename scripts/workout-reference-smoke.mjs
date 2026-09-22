import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
const env = await readFile('apps/mobile/.env', 'utf8');
const api = env.match(/^EXPO_PUBLIC_API_URL=(.*)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '') || 'http://localhost:4000';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
await mkdir('artifacts', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, permissions: ['geolocation'], geolocation: { latitude: 33.9, longitude: 35.49, accuracy: 5 } });
  await context.addInitScript(() => localStorage.setItem('crw.theme', 'dark'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(`${api}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.endsWith('/auth/me')) data = { id: 'screen-match-test', display_name: 'Test Runner', account: { legal_version: '2026-09-17', onboarding_completed_at: '2026-01-01T00:00:00Z' } };
    else if (path.endsWith('/workouts')) data = { workouts: [] };
    else if (path.endsWith('/events')) data = { events: [] };
    else if (path.endsWith('/communities') || path.endsWith('/notifications')) data = [];
    else if (path.endsWith('/leaderboard')) data = { rows: [], me: null, total: 0, nextOffset: null };
    else if (path.endsWith('/catalog')) data = { categories: [], cities: [] };
    await route.fulfill({ json: data });
  });
  await page.goto('http://localhost:8081/tracking', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.screenshot({path:'artifacts/workout-test-entry.png'});
  await page.getByRole('button', { name: 'Tracking tab', exact: true }).click({ timeout: 10000 });
  await page.screenshot({path:'artifacts/workout-test-entry.png'});
  await page.getByRole('button', { name: 'Start', exact: true }).click({ timeout: 10000 });
  await page.getByRole('button', { name: 'Running', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause workout', exact: true })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
  for (const width of [430, 320, 1440]) {
    await page.setViewportSize({ width, height: 932 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `artifacts/workout-start-reference-${width}.png` });
    const finish = page.getByRole('button', { name: 'Finish', exact: true });
    await finish.scrollIntoViewIfNeeded();
    const box = await finish.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 430, height: 932 });
  await page.getByRole('button', { name: 'Pause workout', exact: true }).click();
  await expect(page.getByText('Workout paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume workout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause workout', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByText('RUN COMPLETE', { exact: true })).toBeVisible();
  for (const width of [430, 320, 1440]) {
    await page.setViewportSize({ width, height: 932 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `artifacts/workout-finish-reference-${width}.png` });
    await expect(page.getByRole('button', { name: 'Brag a little', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Brag a little', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to run', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to run', exact: true }).click();
  const del = page.getByRole('button', { name: 'Hold to delete. Press and hold.', exact: true });
  await del.scrollIntoViewIfNeeded();
  const box = await del.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1800);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Close summary', exact: true })).toHaveCount(0);
  // A recorded route still renders after the summary sections were reordered.
  await page.evaluate(() => {
    const now = Date.now();
    const points = [[33.9,35.49],[33.9005,35.4905],[33.901,35.491],[33.9005,35.4915],[33.9,35.49]].map(([latitude,longitude], i) => ({latitude,longitude,accuracy:5,timestamp:now-20000+i*4000,elapsed:1100+i*4,segment:0}));
    localStorage.setItem('pace.tracking.v1.screen-match-test', JSON.stringify({runs:[],health:null,active:{id:'route-fixture',activity:'Running',startedAt:now-1122000,seconds:1122,meters:2480,status:'paused',segment:0,splits:[460,462],source:'CRW+ GPS',points}}));
  });
  await page.reload();
  await expect(page.getByRole('button',{name:'Resume workout',exact:true})).toBeVisible();
  await page.setViewportSize({width:430,height:932});
  await page.waitForTimeout(600);
  await page.screenshot({path:'artifacts/workout-start-route-430.png'});
  await page.getByRole('button',{name:'Finish',exact:true}).click();
  await page.getByRole('button',{name:'Open the map full screen',exact:true}).click();
  await expect(page.getByRole('button',{name:'Close map',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close map',exact:true}).click();
  expect(errors).toEqual([]);
  console.log('Passed: start, countdown, pause/resume, finish, responsive layouts, photo, hold-to-delete; no runtime errors.');
} finally { await browser.close(); }

