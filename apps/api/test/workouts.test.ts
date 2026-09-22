import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.SEED_PASSWORD = 'Development-test-password-123';
process.env.DATABASE_URL = '';

const { buildApp } = await import('../src/app.js');
const { db, closeDB, tx } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { deleteAccount } = await import('../src/routes/accountDeletion.js');
let app: Awaited<ReturnType<typeof buildApp>>;

const ORIGIN = { origin: 'http://localhost:8081' };
type Person = { id: string; token: string };

async function signUp(name: string, email: string): Promise<Person> {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/register',
    headers: ORIGIN,
    payload: { displayName: name, email, password: 'a-long-test-password' },
  });
  assert.equal(r.statusCode, 200, r.body);
  const [u] = await db.query('SELECT id FROM users WHERE email=$1', [email]);
  return { id: u.id, token: r.json().token };
}
const call = (who: Person, method: any, url: string, payload?: any) =>
  app.inject({ method, url, headers: { ...ORIGIN, authorization: `Bearer ${who.token}` }, payload });

const start = Date.now() - 2 * 86400_000;
const route = Array.from({ length: 50 }, (_, i) => [
  52.2297 + i * 0.0001,
  21.0122,
  i * 3000,
  5,
  i < 25 ? 1 : 2,
  i * 3,
]);
const run = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  activity: 'Running',
  meters: 5200,
  seconds: 1800,
  startedAt: start,
  endedAt: start + 1900_000,
  source: 'gps',
  calories: 380,
  heartRate: 152,
  steps: 5400,
  splits: [340, 350, 345, 360, 355],
  route,
  ...over,
});

let ann: Person, bob: Person;
before(async () => {
  await seed();
  app = await buildApp();
  ann = await signUp('Ann History', 'ann.history@example.com');
  bob = await signUp('Bob History', 'bob.history@example.com');
});
after(async () => {
  await app?.close();
  await closeDB();
});

test('a workout is stored whole, route included, and only for its owner', async () => {
  const up = await call(ann, 'POST', '/workouts', { workouts: [run('gps-1')] });
  assert.equal(up.statusCode, 200, up.body);
  assert.deepEqual(up.json(), { recorded: 1, ids: ['gps-1'], deleted: [] });

  const one = await call(ann, 'GET', '/workouts/gps-1');
  assert.equal(one.statusCode, 200, one.body);
  const w = one.json();
  assert.equal(w.meters, 5200);
  assert.equal(w.calories, 380);
  assert.equal(w.heartRate, 152);
  assert.equal(w.steps, 5400);
  assert.deepEqual(w.splits, [340, 350, 345, 360, 355]);
  assert.equal(w.startedAt, start);
  assert.equal(w.pointCount, 50);
  assert.equal(w.route.length, 50);
  assert.deepEqual(w.route[30], route[30]);

  assert.equal((await call(bob, 'GET', '/workouts/gps-1')).statusCode, 404);
  assert.equal((await call(bob, 'GET', '/workouts')).json().workouts.length, 0);
});

test('uploading again updates the workout and keeps the route unless a new one is sent', async () => {
  const { route: _drop, ...noRoute } = run('gps-1', { calories: 400 });
  const again = await call(ann, 'POST', '/workouts', { workouts: [noRoute] });
  assert.equal(again.json().recorded, 0, 'an update is not a new workout');
  const w = (await call(ann, 'GET', '/workouts/gps-1')).json();
  assert.equal(w.calories, 400);
  assert.equal(w.route.length, 50);
});

test('sync pages through changes without skipping rows saved together', async () => {
  const batch = ['gps-2', 'gps-3', 'gps-4', 'gps-5'].map((id, i) =>
    run(id, { startedAt: start + (i + 1) * 3600_000, route: null }),
  );
  assert.equal((await call(ann, 'POST', '/workouts', { workouts: batch })).statusCode, 200);

  const seen: string[] = [];
  let since = '';
  for (let page = 0; page < 10; page++) {
    const r = await call(ann, 'GET', `/workouts?limit=2${since ? `&since=${encodeURIComponent(since)}` : ''}`);
    assert.equal(r.statusCode, 200, r.body);
    const body = r.json();
    seen.push(...body.workouts.map((w: any) => w.id));
    since = body.cursor;
    if (!body.more) break;
  }
  assert.deepEqual([...seen].sort(), ['gps-1', 'gps-2', 'gps-3', 'gps-4', 'gps-5']);

  const nothing = (await call(ann, 'GET', `/workouts?since=${encodeURIComponent(since)}`)).json();
  assert.equal(nothing.workouts.length, 0);
  assert.equal(nothing.cursor, since);

  // A later change shows up after the cursor.
  await call(ann, 'POST', '/workouts', { workouts: [run('gps-6', { route: null })] });
  const later = (await call(ann, 'GET', `/workouts?since=${encodeURIComponent(since)}`)).json();
  assert.deepEqual(
    later.workouts.map((w: any) => w.id),
    ['gps-6'],
  );
});

test('a deleted workout becomes a tombstone that other devices see and cannot undo', async () => {
  const before = (await call(ann, 'GET', '/workouts?limit=200')).json().cursor;
  assert.equal((await call(ann, 'DELETE', '/workouts/gps-1')).statusCode, 200);

  const changes = (await call(ann, 'GET', `/workouts?since=${encodeURIComponent(before)}`)).json();
  assert.deepEqual(
    changes.workouts.map((w: any) => [w.id, w.deleted]),
    [['gps-1', true]],
  );
  const [row] = await db.query(
    `SELECT meters, calories, (SELECT count(*)::int FROM workout_routes r WHERE r.workout_id=w.id) routes
     FROM workouts w WHERE external_id='gps-1'`,
  );
  assert.deepEqual({ ...row }, { meters: 0, calories: null, routes: 0 }, 'personal data removed');

  // An offline device uploads it again: it stays deleted and the device is told.
  const stale = await call(ann, 'POST', '/workouts', { workouts: [run('gps-1')] });
  assert.deepEqual(stale.json().deleted, ['gps-1']);
  assert.equal((await call(ann, 'GET', '/workouts/gps-1')).statusCode, 404);
  const full = (await call(ann, 'GET', '/workouts?limit=200')).json();
  assert.ok(!full.workouts.some((w: any) => w.id === 'gps-1'));

  // Deleted workouts no longer count on the km leaderboard.
  const board = (
    await call(ann, 'GET', '/reps/leaderboard?metric=km&scope=friends&limit=50')
  ).json();
  assert.equal(board.me.value, 5 * 5200);
});

test('bad workouts are refused', async () => {
  const cases = [
    run('gps-x', { route: [[91, 0, 0, 5, 1, 0]] }),
    run('gps-x', { meters: 90_000, seconds: 600 }),
    run('bad id!'),
    { ...run('gps-x'), extra: true },
  ];
  for (const w of cases)
    assert.equal((await call(ann, 'POST', '/workouts', { workouts: [w] })).statusCode, 400, JSON.stringify(w).slice(0, 80));
});

test('health days keep the newest sync per day', async () => {
  const put = (days: any[]) => call(ann, 'PUT', '/health/days', { days });
  const t = Date.now();
  assert.equal(
    (await put([{ day: '2026-09-15', steps: 8000, calories: 420, heartRate: 64, source: 'Health Connect', syncedAt: t }])).statusCode,
    200,
  );
  await put([{ day: '2026-09-15', steps: 3000, source: 'Health Connect', syncedAt: t - 60_000 }]);
  await put([{ day: '2026-09-16', steps: 12000, source: 'Apple Health', syncedAt: t }]);
  const days = (await call(ann, 'GET', '/health/days?from=2026-09-01')).json().days;
  assert.deepEqual(
    days.map((d: any) => [d.day, d.steps]),
    [
      ['2026-09-16', 12000],
      ['2026-09-15', 8000],
    ],
  );
  assert.equal((await call(bob, 'GET', '/health/days')).json().days.length, 0);
});

test('deleting the account removes all workouts and health data', async () => {
  await tx((c) => deleteAccount(c, ann.id, 'test'));
  const [left] = await db.query(
    `SELECT (SELECT count(*)::int FROM workouts WHERE user_id=$1) w,
            (SELECT count(*)::int FROM health_days WHERE user_id=$1) h`,
    [ann.id],
  );
  assert.deepEqual({ ...left }, { w: 0, h: 0 });
});
