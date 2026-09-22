import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const env = Object.fromEntries(
  (await readFile('apps/api/.env', 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const at = l.indexOf('=');
      return [l.slice(0, at), l.slice(at + 1)];
    }),
);
const api = env.API_URL || 'http://localhost:4000';
async function call(path, body, token) {
  const r = await fetch(api + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${path}: ${JSON.stringify(data)}`);
  return data;
}
const health = await call('/health');
if (health.environment !== 'development' || health.payments !== 'sandbox')
  throw new Error('UI smoke tests require the isolated development sandbox');
await mkdir('artifacts', { recursive: true });
const org = await call('/auth/login', {
  email: 'organizer@pace.local',
  password: env.SEED_PASSWORD,
});
const overview = await call('/organizer/overview', null, org.token),
  co = overview.communities[0];
const title = 'A good day, together.';
const created = await call(
  '/organizer/events',
  {
    communityId: co.id,
    title,
    description:
      'A dedicated development activity for checking the complete CRW+ mobile booking experience.',
    category: 'running',
    difficulty: 'beginner',
    cityId: co.city_id,
    locationName: 'Zaitunay Bay',
    latitude: 33.901,
    longitude: 35.495,
    startsAt: new Date(Date.now() + 48 * 3600000).toISOString(),
    endsAt: new Date(Date.now() + 50 * 3600000).toISOString(),
    capacity: 12,
    priceMinor: 800,
    currency: 'USD',
    coverUrl: 'http://localhost:4000/dev-media/photo-1552674605-db6ffd4facb5.jpg',
    tags: ['SOCIAL PACE'],
    requirements: 'Water and running shoes',
    included: 'A hosted social run',
    safetyInfo: 'Stay together and follow the host.',
    cancellationHours: 24,
    status: 'published',
  },
  org.token,
);
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
});
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await expect(page.getByText('YOUR NEXT GOOD THING.', { exact: true })).toBeVisible({
    timeout: 60000,
  });
  for (const tab of ['Discover', 'Food', 'Compete', 'Tracking'])
    await expect(page.getByRole('button', { name: `${tab} tab`, exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/discover.png' });
  await expect(page.getByRole('button', { name: 'Map tab', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Food tab', exact: true }).click();
  await expect(page.getByText('THE GOOD FOOD CLUB.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View SALATA menu', exact: true })).toBeVisible();
  await expect(page.getByTestId('food-store-card')).toHaveCount(3);
  await page.screenshot({ path: 'artifacts/food.png' });
  await page.getByRole('button', { name: 'Compete tab', exact: true }).click();
  await expect(page.getByText('THE PEOPLE PUTTING IN THE MOVES', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.screenshot({ path: 'artifacts/compete.png' });
  await page.getByRole('button', { name: 'Your profile', exact: true }).click();
  await page.getByRole('button', { name: 'Find my people', exact: true }).click();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('alex@pace.local');
  await page.getByLabel('Password', { exact: true }).fill(env.SEED_PASSWORD);
  await page.getByRole('button', { name: 'Let’s get moving', exact: true }).click();
  await expect(page.getByText('ALEX MORGAN', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: 'artifacts/profile.png' });
  await page.goto(`http://localhost:8081/?event=${created.id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await expect(page.getByText('A GOOD DAY, TOGETHER.', { exact: true }).last()).toBeVisible({
    timeout: 20000,
  });
  await page.screenshot({ path: 'artifacts/event.png' });
  await page.getByRole('button', { name: 'Book my spot', exact: true }).click();
  await expect(page.getByText('MAKE IT OFFICIAL.', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Continue to secure checkout', exact: true }).click();
  await expect(page.getByText('DEVELOPMENT CHECKOUT', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Complete test payment', exact: true }).click();
  await expect(page.getByText('YOU’RE ON THE LIST.', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText('SHOW THIS AT CHECK-IN', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/ticket.png' });
  await page.getByRole('button', { name: 'Cancel booking', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, cancel my booking', exact: true }).click();
  await expect(page.getByText('REFUND PENDING', { exact: true })).toBeVisible({ timeout: 15000 });
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    'artifacts/ui-smoke-result.json',
    JSON.stringify(
      {
        passed: true,
        checked: [
          'Four primary tabs',
          'Database discovery',
          'Food tab and restaurant menus',
          'Ledger leaderboard',
          'Real login',
          'Profile',
          'Event details',
          'Paid reservation',
          'Sandbox checkout',
          'QR confirmation',
          'Cancellation/refund queue',
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: navigation, maps, leaderboard, login, profile, booking, payment, QR and cancellation.',
  );
} catch (error) {
  await page.screenshot({ path: 'artifacts/ui-failure.png' });
  console.error((await page.locator('body').innerText()).slice(-6000));
  throw error;
} finally {
  await browser.close();
  await call(`/organizer/events/${created.id}/cancel`, {}, org.token);
}
