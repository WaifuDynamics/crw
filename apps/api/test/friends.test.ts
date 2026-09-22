import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.SEED_PASSWORD = 'Development-test-password-123';
process.env.DATABASE_URL = '';

const { buildApp } = await import('../src/app.js');
const { db, closeDB } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
let app: Awaited<ReturnType<typeof buildApp>>;

const ORIGIN = { origin: 'http://localhost:8081' };
type Person = { id: string; token: string; name: string };

async function signUp(name: string, email: string): Promise<Person> {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/register',
    headers: ORIGIN,
    payload: { displayName: name, email, password: 'a-long-test-password' },
  });
  assert.equal(r.statusCode, 200, r.body);
  const [u] = await db.query('SELECT id FROM users WHERE email=$1', [email]);
  return { id: u.id, token: r.json().token, name };
}

const call = (who: Person | null, method: any, url: string, payload?: any) =>
  app.inject({
    method,
    url,
    headers: { ...ORIGIN, ...(who ? { authorization: `Bearer ${who.token}` } : {}) },
    payload,
  });

let ann: Person, bob: Person, cat: Person;

before(async () => {
  await seed();
  app = await buildApp();
  ann = await signUp('Ann Runner', 'ann@example.com');
  bob = await signUp('Bob Lifter', 'bob@example.com');
  cat = await signUp('Cat Private', 'cat@example.com');
  await db.query(`UPDATE profiles SET visibility='private' WHERE user_id=$1`, [cat.id]);
});
after(async () => {
  await app?.close();
  await closeDB();
});

test('search finds public people by name with the relation to me', async () => {
  const r = await call(ann, 'GET', '/friends/search?q=bob');
  assert.equal(r.statusCode, 200, r.body);
  const hit = r.json().results.find((x: any) => x.id === bob.id);
  assert.equal(hit.display_name, 'Bob Lifter');
  assert.equal(hit.relation, 'none');
  assert.equal(
    r.json().results.some((x: any) => x.id === ann.id),
    false,
    'not myself',
  );
  const privateHit = await call(ann, 'GET', '/friends/search?q=Cat%20Priv');
  assert.equal(privateHit.json().results.length, 0, 'private profiles are not searchable');
  assert.equal((await call(ann, 'GET', '/friends/search?q=b')).statusCode, 400, 'too short');
  assert.equal((await call(null, 'GET', '/friends/search?q=bob')).statusCode, 401);
  const wild = await call(ann, 'GET', '/friends/search?q=%25%25');
  assert.equal(wild.json().results.length, 0, 'LIKE wildcards are literal');
});

test('request, accept, list and remove', async () => {
  const sent = await call(ann, 'POST', `/friends/${bob.id}`);
  assert.equal(sent.statusCode, 200, sent.body);
  assert.equal(sent.json().relation, 'outgoing');
  assert.equal(
    (await call(ann, 'POST', `/friends/${bob.id}`)).json().relation,
    'outgoing',
    'idempotent',
  );

  const bobView = (await call(bob, 'GET', '/friends')).json();
  assert.deepEqual(
    bobView.incoming.map((x: any) => x.id),
    [ann.id],
  );
  const [note] = await db.query(
    `SELECT title FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [bob.id],
  );
  assert.equal(note.title, 'New friend request');

  const accepted = await call(bob, 'POST', `/friends/${ann.id}/accept`);
  assert.equal(accepted.json().relation, 'friends');
  assert.deepEqual(
    (await call(ann, 'GET', '/friends')).json().friends.map((x: any) => x.id),
    [bob.id],
  );
  assert.deepEqual(
    (await call(bob, 'GET', '/friends')).json().friends.map((x: any) => x.id),
    [ann.id],
  );
  assert.equal(
    (await call(ann, 'GET', '/friends/search?q=bob')).json().results[0].relation,
    'friends',
  );

  const removed = await call(bob, 'DELETE', `/friends/${ann.id}`);
  assert.equal(removed.json().relation, 'none');
  assert.equal((await call(ann, 'GET', '/friends')).json().friends.length, 0);
});

test('a request back to someone who asked first makes you friends', async () => {
  await call(cat, 'POST', `/friends/${ann.id}`);
  const r = await call(ann, 'POST', `/friends/${cat.id}`);
  assert.equal(r.json().relation, 'friends');
  const [row] = await db.query(
    'SELECT count(*)::int n FROM friendships WHERE requester_id IN ($1,$2) AND addressee_id IN ($1,$2)',
    [ann.id, cat.id],
  );
  assert.equal(row.n, 1);
});

test('bad requests are refused', async () => {
  assert.equal((await call(ann, 'POST', `/friends/${ann.id}`)).statusCode, 400);
  assert.equal(
    (await call(ann, 'POST', '/friends/00000000-0000-4000-8000-000000000000')).statusCode,
    404,
  );
  assert.equal(
    (await call(bob, 'POST', `/friends/${cat.id}/accept`)).statusCode,
    404,
    'no request',
  );
  await db.query('INSERT INTO blocks(blocker_id, blocked_id) VALUES($1,$2)', [bob.id, ann.id]);
  assert.equal((await call(ann, 'POST', `/friends/${bob.id}`)).statusCode, 404, 'blocked');
  await db.query('DELETE FROM blocks WHERE blocker_id=$1', [bob.id]);
});

test('leaderboard: reps and wins by period, friends and country scopes', async () => {
  const now = new Date();
  const lastYear = new Date(now.getTime() - 400 * 86400000);
  const match = (user: string, ext: string, won: boolean, reps: number, at: Date) =>
    db.query(
      `INSERT INTO rep_matches(id,user_id,external_id,mode,exercise,won,reason,reps,team_score,opponent_score,played_at)
       VALUES(gen_random_uuid(),$1,$2,'1v1','pushup',$3,'target',$4,$4,0,$5)`,
      [user, ext, won, reps, at],
    );
  await match(ann.id, 'lb-a1', true, 20, now);
  await match(ann.id, 'lb-a2', true, 20, lastYear);
  await match(bob.id, 'lb-b1', false, 35, now);
  await db.query(
    `INSERT INTO rep_sessions(id,user_id,external_id,exercise,reps,best_set,seconds,performed_at)
     VALUES(gen_random_uuid(),$1,'lb-s1','squat',30,30,60,$2)`,
    [bob.id, now],
  );
  await db.query(`UPDATE user_accounts SET country_code='PL' WHERE user_id IN ($1,$2)`, [
    ann.id,
    bob.id,
  ]);

  const get = async (who: Person | null, query: string) => {
    const r = await call(who, 'GET', `/reps/leaderboard?${query}`);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const rank = (data: any, person: Person) => data.rows.find((x: any) => x.id === person.id);

  const repsWeek = await get(ann, 'metric=reps&period=weekly&limit=50');
  assert.equal(rank(repsWeek, bob).value, 65, 'match reps + solo reps');
  assert.equal(rank(repsWeek, ann).value, 20, 'last year not in this week');
  assert.ok(rank(repsWeek, bob).rank < rank(repsWeek, ann).rank);
  assert.equal(repsWeek.me.id, ann.id);

  const winsAll = await get(null, 'metric=wins&period=all&limit=50');
  assert.equal(rank(winsAll, ann).value, 2);
  assert.equal(rank(winsAll, bob), undefined, 'no wins, not listed');

  const squats = await get(ann, 'metric=reps&period=all&exercise=squat&limit=50');
  assert.equal(rank(squats, bob).value, 30);
  assert.equal(rank(squats, ann), undefined);

  // Friends: only me and my friends, even with a private profile (cat is ann's friend).
  await db.query(
    `INSERT INTO rep_sessions(id,user_id,external_id,exercise,reps,best_set,seconds) VALUES(gen_random_uuid(),$1,'lb-c1','pushup',12,12,30)`,
    [cat.id],
  );
  const friends = await get(ann, 'metric=reps&period=all&scope=friends&limit=50');
  assert.deepEqual(
    friends.rows.map((x: any) => x.id).sort(),
    [ann.id, cat.id].sort(),
    'bob is not a friend any more; cat is private but a friend',
  );
  const global = await get(ann, 'metric=reps&period=all&limit=50');
  assert.equal(rank(global, cat), undefined, 'private profiles stay off global');

  const pl = await get(ann, 'metric=reps&period=all&scope=country&limit=50');
  assert.deepEqual(pl.rows.map((x: any) => x.id).sort(), [ann.id, bob.id].sort());
  assert.equal((await call(null, 'GET', '/reps/leaderboard?scope=friends')).statusCode, 401);

  const paged = await get(ann, 'metric=reps&period=all&limit=1');
  assert.equal(paged.rows.length, 1);
  assert.equal(paged.nextOffset, 1);
  assert.ok(paged.total >= 2);
});

test('starting a workout tells friends once, and nobody else', async () => {
  // Ann and Cat become friends; Bob is not Ann's friend at this point in the file.
  await call(ann, 'POST', `/friends/${cat.id}`);
  await call(cat, 'POST', `/friends/${ann.id}/accept`);
  await db.query('DELETE FROM friend_activity_pushes');

  const started = await call(ann, 'POST', '/workouts/started', { activity: 'Cycling' });
  assert.equal(started.statusCode, 200, started.body);
  assert.equal(started.json().notified, 1);
  const [note] = await db.query(
    `SELECT title, body FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [cat.id],
  );
  assert.match(note.title, /Ann Runner is out training/);
  assert.match(note.body, /started a ride/);

  // A second start within three hours does not ping the same friend again.
  const again = await call(ann, 'POST', '/workouts/started', { activity: 'Running' });
  assert.equal(again.json().notified, 0);
  // Signed out, nothing happens.
  assert.equal((await call(null, 'POST', '/workouts/started', {})).statusCode, 401);
});
