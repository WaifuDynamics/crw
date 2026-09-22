import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.SEED_PASSWORD = 'Development-test-password-123';
process.env.DATABASE_URL = '';

const { buildApp } = await import('../src/app.js');
const { db, closeDB } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { categoryOf } = await import('../src/notifications.js');
const { fcmMessage, sendPush } = await import('../src/push.js');
let app: Awaited<ReturnType<typeof buildApp>>;

const ORIGIN = { origin: 'http://localhost:8081' };
type Person = { id: string; token: string };
const FCM_TOKEN = `fcm-${'a'.repeat(140)}:APA91b`;

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

let ann: Person, bob: Person, cat: Person;

before(async () => {
  await seed();
  app = await buildApp();
  ann = await signUp('Ann Pusher', 'ann.push@example.com');
  bob = await signUp('Bob Friend', 'bob.push@example.com');
  cat = await signUp('Cat Quiet', 'cat.push@example.com');
  for (const other of [bob, cat]) {
    await call(ann, 'POST', `/friends/${other.id}`);
    await call(other, 'POST', `/friends/${ann.id}/accept`);
  }
});
after(async () => {
  await app?.close();
  await closeDB();
});

test('notification categories follow the link', () => {
  assert.equal(categoryOf('friends'), 'social');
  assert.equal(categoryOf(`profile/x`), 'social');
  assert.equal(categoryOf('event/1'), 'events');
  assert.equal(categoryOf('compete'), 'compete');
  assert.equal(categoryOf(undefined), 'general');
});

test('FCM messages carry the channel, colour, icon and link', () => {
  const m = fcmMessage('tok', {
    title: 'Hi',
    body: 'There',
    link: 'friends',
    category: 'friends',
    image: 'http://insecure/img.jpg',
    tag: 'friend-1',
  });
  assert.equal(m.android.notification.channel_id, 'friends');
  assert.equal(m.android.notification.icon, 'notification_icon');
  assert.match(m.android.notification.color, /^#[0-9A-F]{6}$/i);
  assert.equal(m.android.notification.tag, 'friend-1');
  assert.deepEqual(m.data, { link: 'friends', category: 'friends' });
  assert.equal('image' in m.notification, false, 'only https pictures');
});

test('Android devices register Firebase tokens; junk is rejected', async () => {
  const ok = await call(ann, 'POST', '/devices', {
    token: FCM_TOKEN,
    platform: 'android',
    provider: 'fcm',
  });
  assert.equal(ok.statusCode, 200, ok.body);
  const [row] = await db.query('SELECT provider, user_id FROM device_tokens WHERE token=$1', [
    FCM_TOKEN,
  ]);
  assert.deepEqual({ ...row }, { provider: 'fcm', user_id: ann.id });
  const bad = await call(ann, 'POST', '/devices', {
    token: 'short',
    platform: 'android',
    provider: 'fcm',
  });
  assert.equal(bad.statusCode, 400);
  const expo = await call(ann, 'POST', '/devices', {
    token: 'ExponentPushToken[abc123]',
    platform: 'ios',
  });
  assert.equal(expo.statusCode, 200, expo.body);
  assert.equal((await call(ann, 'DELETE', '/devices', { token: FCM_TOKEN })).statusCode, 200);
  assert.equal(
    (await db.query('SELECT 1 FROM device_tokens WHERE token=$1', [FCM_TOKEN])).length,
    0,
  );
});

test('friends hear about a fresh workout once, unless they muted it', async () => {
  const muted = await call(cat, 'PATCH', '/account', { pushFriendActivity: false });
  assert.equal(muted.statusCode, 200, muted.body);
  assert.equal(muted.json().push_friend_activity ?? muted.json().account?.push_friend_activity, false);

  const count = async (who: Person) =>
    (
      await db.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND category='friends'`, [
        who.id,
      ])
    )[0].n;
  const send = (id: string, startedAt: number, meters = 5200) =>
    call(ann, 'POST', '/workouts', {
      workouts: [{ id, activity: 'Running', meters, seconds: 1800, startedAt, source: 'gps' }],
    });

  assert.equal((await send('old-run', Date.now() - 3 * 86400_000)).statusCode, 200);
  assert.equal(await count(bob), 0, 'old imported workouts stay quiet');

  assert.equal((await send('fresh-run', Date.now() - 600_000)).statusCode, 200);
  assert.equal(await count(bob), 1);
  const [n] = await db.query(
    `SELECT title, body, link FROM notifications WHERE user_id=$1 AND category='friends'`,
    [bob.id],
  );
  assert.match(n.title, /Ann Pusher/);
  assert.match(n.body, /5\.20 km run/);
  assert.equal(n.link, `profile/${ann.id}`);
  assert.equal(await count(cat), 0, 'muted friend is skipped');

  await send('second-run', Date.now() - 300_000);
  assert.equal(await count(bob), 1, 'at most one every 3 hours');
});

test('FCM delivery signs in with the service account and drops dead tokens', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.FCM_SERVICE_ACCOUNT = Buffer.from(
    JSON.stringify({
      project_id: 'crw-test',
      client_email: 'push@crw-test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
  ).toString('base64');
  const calls: { url: string; body: any }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    const body = String(init?.body ?? '');
    calls.push({ url: String(url), body });
    if (String(url).includes('oauth2'))
      return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 });
    const msg = JSON.parse(body).message;
    if (msg.token === 'gone')
      return new Response(
        JSON.stringify({
          error: { message: 'Requested entity was not found.', details: [{ errorCode: 'UNREGISTERED' }] },
        }),
        { status: 404 },
      );
    return new Response('{}', { status: 200 });
  }) as any;
  try {
    const result = await sendPush(
      [
        { token: 'live', provider: 'fcm' },
        { token: 'gone', provider: 'fcm' },
      ],
      { title: 'T', body: 'B', category: 'social' },
    );
    assert.deepEqual(result.dead, ['gone']);
    const auth = calls.find((c) => c.url.includes('oauth2'))!;
    assert.match(new URLSearchParams(auth.body).get('assertion')!, /^[\w-]+\.[\w-]+\.[\w-]+$/);
    const sends = calls.filter((c) => c.url.includes('/projects/crw-test/messages:send'));
    assert.equal(sends.length, 2);
    assert.equal(JSON.parse(sends[0].body).message.android.notification.channel_id, 'social');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.FCM_SERVICE_ACCOUNT;
  }
});
