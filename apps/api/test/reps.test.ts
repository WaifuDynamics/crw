import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.SEED_PASSWORD = 'Development-test-password-123';
process.env.DATABASE_URL = '';

const { buildApp } = await import('../src/app.js');
const { db, closeDB } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { DEMO_PEOPLE, demoName } = await import('../src/demo.js');
let app: Awaited<ReturnType<typeof buildApp>>;
let token: string;

const ORIGIN = { origin: 'http://localhost:8081' };
const as = (t: string) => ({ ...ORIGIN, authorization: `Bearer ${t}` });

async function login(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: ORIGIN,
    payload: { email, password: process.env.SEED_PASSWORD },
  });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().token as string;
}

const result = (over: Record<string, any> = {}) => ({
  matchId: 'm-abc123',
  mode: '1v1',
  exercise: 'squat',
  won: true,
  reason: 'target',
  reps: 20,
  score: [20, 11],
  opponents: ['Squat Sally'],
  ...over,
});

before(async () => {
  await seed();
  app = await buildApp();
  token = await login('alex@pace.local');
});
after(async () => {
  await app?.close();
  await closeDB();
});

test('seeded demo accounts are fictional and have full account details', async () => {
  const rows = await db.query(
    `SELECT p.display_name, p.avatar_url, a.first_name, a.last_name, a.country_code, a.language
     FROM profiles p JOIN user_accounts a ON a.user_id=p.user_id
     JOIN users u ON u.id=p.user_id WHERE u.email LIKE '%@pace.local' ORDER BY u.email`,
  );
  assert.equal(rows.length, DEMO_PEOPLE.length);
  const names = new Set(DEMO_PEOPLE.map((_, i) => demoName(i)));
  for (const r of rows) {
    assert.ok(names.has(r.display_name), r.display_name);
    assert.equal(`${r.first_name} ${r.last_name}`, r.display_name);
    assert.equal(r.avatar_url, null);
    assert.equal(r.country_code, 'LB');
    assert.equal(r.language, 'en');
  }
});

test('demo match history gives every demo player matches and a ranked board', async () => {
  const [{ players, matches }] = await db.query(
    `SELECT count(DISTINCT user_id)::int players, count(DISTINCT external_id)::int matches
     FROM rep_matches WHERE external_id LIKE 'demo-%'`,
  );
  assert.equal(players, DEMO_PEOPLE.length);
  assert.equal(matches, 60);

  // a 2v2 match stores four rows, and the two sides agree on the score
  const [two] = await db.query(
    `SELECT external_id FROM rep_matches WHERE mode='2v2' GROUP BY external_id LIMIT 1`,
  );
  const sides = await db.query(
    'SELECT won, reps, team_score, opponent_score FROM rep_matches WHERE external_id=$1',
    [two.external_id],
  );
  assert.equal(sides.length, 4);
  const winners = sides.filter((s) => s.won);
  assert.equal(winners.length, 2);
  assert.equal(winners[0].reps + winners[1].reps, winners[0].team_score);

  const board = await app.inject({
    method: 'GET',
    url: '/reps/leaderboard?limit=5',
    headers: ORIGIN,
  });
  assert.equal(board.statusCode, 200, board.body);
  const top = board.json().top;
  assert.equal(top.length, 5);
  assert.deepEqual(
    top.map((p: any) => p.rank),
    [1, 2, 3, 4, 5],
  );
  for (let i = 1; i < top.length; i++)
    assert.ok(
      top[i - 1].wins > top[i].wins ||
        (top[i - 1].wins === top[i].wins && top[i - 1].reps >= top[i].reps),
    );
});

test('demo workouts populate the distance leaderboard', async () => {
  const board = await app.inject({
    method: 'GET',
    url: '/reps/leaderboard?metric=km&period=weekly&limit=50',
    headers: ORIGIN,
  });
  assert.equal(board.statusCode, 200, board.body);
  const rows = board.json().rows;
  assert.equal(rows.length, DEMO_PEOPLE.length);
  assert.deepEqual(
    rows.map((row: any) => row.rank),
    DEMO_PEOPLE.map((_, index) => index + 1),
  );
  assert.ok(rows.every((row: any) => row.value > 0));
});

test('a reported result counts once and shows in my stats', async () => {
  const before = (await app.inject({ method: 'GET', url: '/reps/me', headers: as(token) })).json();

  const first = await app.inject({
    method: 'POST',
    url: '/reps/results',
    headers: as(token),
    payload: result(),
  });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().recorded, true);
  assert.equal(first.json().stats.wins, before.wins + 1);
  assert.equal(first.json().stats.byExercise.squat, before.byExercise.squat + 1);
  assert.equal(first.json().stats.reps, before.reps + 20);

  const again = await app.inject({
    method: 'POST',
    url: '/reps/results',
    headers: as(token),
    payload: result(),
  });
  assert.equal(again.json().recorded, false);
  assert.equal(again.json().stats.wins, before.wins + 1);

  const loss = await app.inject({
    method: 'POST',
    url: '/reps/results',
    headers: as(token),
    payload: result({ matchId: 'm-loss', won: false, reps: 9, score: [9, 20], mode: '2v2' }),
  });
  assert.equal(loss.json().stats.matches, before.matches + 2);
  assert.equal(loss.json().stats.wins, before.wins + 1);
});

test('results need a session and a valid body', async () => {
  const anon = await app.inject({
    method: 'POST',
    url: '/reps/results',
    headers: ORIGIN,
    payload: result(),
  });
  assert.equal(anon.statusCode, 401);
  for (const bad of [
    result({ mode: '3v3' }),
    result({ exercise: 'burpee' }),
    result({ reps: -1 }),
    result({ matchId: 'bad id!' }),
    result({ opponents: ['a', 'b', 'c', 'd'] }),
    { ...result(), extra: true },
  ]) {
    const r = await app.inject({
      method: 'POST',
      url: '/reps/results',
      headers: as(token),
      payload: bad,
    });
    assert.equal(r.statusCode, 400, JSON.stringify(bad));
  }
});

test('private profiles stay off the leaderboard', async () => {
  const top = (
    await app.inject({ method: 'GET', url: '/reps/leaderboard?limit=50', headers: ORIGIN })
  ).json().top;
  const leader = top[0];
  await db.query(`UPDATE profiles SET visibility='private' WHERE user_id=$1`, [leader.id]);
  const after = (
    await app.inject({ method: 'GET', url: '/reps/leaderboard?limit=50', headers: ORIGIN })
  ).json().top;
  assert.ok(!after.some((p: any) => p.id === leader.id));
  await db.query(`UPDATE profiles SET visibility='public' WHERE user_id=$1`, [leader.id]);
});

test('demo accounts have answered the sign-up questions', async () => {
  const rows = await db.query(
    `SELECT age, weight_kg::float8 w, height_cm, onboarding_completed_at FROM user_accounts a
     JOIN users u ON u.id=a.user_id WHERE u.email LIKE '%@pace.local'`,
  );
  assert.equal(rows.length, DEMO_PEOPLE.length);
  for (const r of rows) {
    assert.ok(r.age >= 13 && r.w >= 25 && r.height_cm >= 90, JSON.stringify(r));
    assert.ok(r.onboarding_completed_at);
  }
});

test('solo sessions build personal records per exercise and are idempotent', async () => {
  const post = (payload: Record<string, any>) =>
    app.inject({ method: 'POST', url: '/reps/sessions', headers: as(token), payload });
  const first = await post({
    sessionId: 's-one',
    exercise: 'pushup',
    reps: 30,
    bestSet: 18,
    seconds: 95,
  });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().recorded, true);
  const again = await post({
    sessionId: 's-one',
    exercise: 'pushup',
    reps: 30,
    bestSet: 18,
    seconds: 95,
  });
  assert.equal(again.json().recorded, false);
  await post({ sessionId: 's-two', exercise: 'pushup', reps: 22, bestSet: 22, seconds: 40 });
  await post({ sessionId: 's-three', exercise: 'squat', reps: 15, bestSet: 15, seconds: 30 });

  const me = await app.inject({ method: 'GET', url: '/reps/me', headers: as(token) });
  const solo = me.json().solo;
  assert.equal(solo.pushup.sessions, 2);
  assert.equal(solo.pushup.reps, 52);
  assert.equal(solo.pushup.bestSet, 22);
  assert.equal(solo.pushup.bestSession, 30);
  assert.equal(solo.pushup.seconds, 135);
  assert.equal(solo.squat.reps, 15);

  assert.equal(
    (await post({ sessionId: 's-bad', exercise: 'pushup', reps: 5, bestSet: 9, seconds: 10 }))
      .statusCode,
    400,
  );
  assert.equal(
    (await post({ sessionId: 's-zero', exercise: 'squat', reps: 0, bestSet: 0, seconds: 10 }))
      .statusCode,
    400,
  );
  const anon = await app.inject({
    method: 'POST',
    url: '/reps/sessions',
    headers: ORIGIN,
    payload: { sessionId: 's-anon', exercise: 'squat', reps: 3, bestSet: 3, seconds: 5 },
  });
  assert.equal(anon.statusCode, 401);
});

test('solo sessions can be listed for health app sync', async () => {
  const r = await app.inject({ method: 'GET', url: '/reps/sessions', headers: as(token) });
  assert.equal(r.statusCode, 200, r.body);
  const list = r.json().sessions;
  assert.ok(list.length >= 3);
  assert.deepEqual(Object.keys(list[0]).sort(), [
    'bestSet',
    'exercise',
    'id',
    'performedAt',
    'reps',
    'seconds',
  ]);
  const times = list.map((x: any) => Date.parse(x.performedAt));
  assert.deepEqual(
    times,
    [...times].sort((a, b) => a - b),
  );
  const later = await app.inject({
    method: 'GET',
    url: `/reps/sessions?since=${encodeURIComponent(list[list.length - 1].performedAt)}`,
    headers: as(token),
  });
  assert.equal(later.json().sessions.length, 0);
  assert.equal(
    (await app.inject({ method: 'GET', url: '/reps/sessions', headers: ORIGIN })).statusCode,
    401,
  );
});

test('uploaded workouts count once on the km leaderboard', async () => {
  const run = { id: 'run-km-1', activity: 'Running', meters: 10500, seconds: 3000, source: 'gps' };
  const send = (w: any[]) =>
    app.inject({ method: 'POST', url: '/workouts', headers: as(token), payload: { workouts: w } });
  const first = await send([{ ...run, startedAt: Date.now() - 3600_000 }]);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().recorded, 1);
  assert.equal((await send([{ ...run, startedAt: Date.now() - 3600_000 }])).json().recorded, 0);
  const fast = await send([
    { ...run, id: 'run-car', meters: 50000, seconds: 600, startedAt: Date.now() - 3600_000 },
  ]);
  assert.equal(fast.statusCode, 400, fast.body);

  const board = (
    await app.inject({
      method: 'GET',
      url: '/reps/leaderboard?metric=km&scope=friends&limit=50',
      headers: as(token),
    })
  ).json();
  assert.equal(board.metric, 'km');
  assert.ok(board.me, JSON.stringify(board));
  assert.equal(board.me.value, 10500);
  assert.equal(board.me.meters, 10500);
  const reps = (
    await app.inject({
      method: 'GET',
      url: '/reps/leaderboard?metric=reps&scope=friends&limit=50',
      headers: as(token),
    })
  ).json();
  assert.notEqual(reps.me?.value, 10500);
});
