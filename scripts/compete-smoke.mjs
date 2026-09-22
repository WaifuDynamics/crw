import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';

// Isolated UI fixtures: never join a real matchmaking queue during verification.
const env = await readFile('apps/mobile/.env', 'utf8');
const api =
  env
    .match(/^EXPO_PUBLIC_API_URL=(.*)$/m)?.[1]
    .trim()
    .replace(/^['"]|['"]$/g, '') || 'http://localhost:4000';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
await mkdir('artifacts', { recursive: true });
try {
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
    await context.addInitScript((theme) => localStorage.setItem('crw.theme', theme), theme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(`${api}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      let status = 200;
      if (path.endsWith('/auth/me')) {
        data = { id: 'test-player', display_name: 'Alex Morgan', avatar_url: null };
      } else if (path.endsWith('/reps/me'))
        data = {
          wins: 7,
          matches: 10,
          reps: 1240,
          byMode: { '1v1': 5, '2v2': 2 },
          byExercise: { pushup: 4, squat: 3 },
          solo: {
            pushup: { sessions: 8, reps: 640, bestSet: 42, bestSession: 90 },
            squat: { sessions: 6, reps: 600, bestSet: 60, bestSession: 120 },
          },
        };
      else if (path.endsWith('/queues'))
        data = {
          online: 8,
          playing: 4,
          target: 20,
          waiting: { '1v1': { pushup: 1, squat: 0 }, '2v2': { pushup: 2, squat: 1 } },
          needed: { '1v1': 2, '2v2': 4 },
        };
      else if (path.endsWith('/leaderboard'))
        data = { rows: [], me: null, total: 0, nextOffset: null };
      else if (path.endsWith('/events')) data = { events: [] };
      else if (path.endsWith('/communities') || path.endsWith('/notifications')) data = [];
      else if (path.endsWith('/catalog')) data = { categories: [], cities: [] };
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto('http://localhost:8081/compete', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await expect(page.getByTestId('compete-arena')).toBeVisible({ timeout: 60000 });
    await expect(page.getByRole('button', { name: 'Compete tab', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('play-button')).toHaveCount(0);
    for (const width of [320, 430, 1440]) {
      await page.setViewportSize({ width, height: 932 });
      await page.screenshot({ path: `artifacts/compete-unified-${theme}-${width}.png` });
      const arena = await page.getByTestId('compete-arena').boundingBox();
      expect(arena.x).toBeGreaterThanOrEqual(0);
      expect(arena.x + arena.width).toBeLessThanOrEqual(width);
      await expect(page.getByRole('button', { name: 'Choose 2 vs 2', exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Choose Squats', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Start solo squats', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Choose 1 vs 1', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Find a 1v1 match', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Choose 2 vs 2', exact: true }).click();
    await expect(page.getByText('1 waiting · 3 more to start', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Camera setup tips', exact: true }).click();
    await expect(
      page.getByText('2. Keep your whole body, including your feet, in frame.', { exact: true }),
    ).toBeVisible();
    await page.getByText('Community rankings', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/compete-unified-${theme}-leaderboard.png` });
    await page.getByRole('button', { name: 'Start a session', exact: true }).click();
    await expect(page.locator('iframe')).toHaveAttribute('src', /exercise=squat.*mode=2v2/, {
      timeout: 15000,
    });
    expect(errors).toEqual([]);
    // Old Play URLs must land in the single Compete tab.
    await page.goto('http://localhost:8081/play');
    await expect(page.getByTestId('compete-arena')).toBeVisible({ timeout: 15000 });
    await context.close();
  }
  console.log(
    'Compete passed: both themes, 320/430/1440 widths, mode/exercise selection, camera tips, leaderboard session action, legacy Play URL.',
  );
} finally {
  await browser.close();
}
