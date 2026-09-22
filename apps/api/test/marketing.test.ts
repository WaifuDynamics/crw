import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.SEED_PASSWORD = 'Development-test-password-123';
process.env.DATABASE_URL = '';
process.env.MARKETING_SEND_HOUR_UTC = '7';

const { buildApp } = await import('../src/app.js');
const { db, closeDB } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { queueDailyDigests } = await import('../src/marketing.js');
const { unsubscribeToken, verifyUnsubscribeToken, escapeHtml } = await import('../src/emails.js');
let app: Awaited<ReturnType<typeof buildApp>>;

const ORIGIN = { origin: 'http://localhost:8081' };
const MORNING = new Date('2031-03-04T08:00:00Z');

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
const as = (t: string) => ({ ...ORIGIN, authorization: `Bearer ${t}` });
const digests = (userId: string) =>
  db.query(
    `SELECT o.payload FROM notification_outbox o JOIN users u ON u.email=o.payload->>'to'
     WHERE o.kind='email' AND u.id=$1 AND o.payload->>'subject' LIKE '%your CRW+ day'`,
    [userId],
  );

let alex: { id: string; token: string };

before(async () => {
  await seed();
  app = await buildApp();
  const token = await login('alex@pace.local');
  const [u] = await db.query(`SELECT id FROM users WHERE email='alex@pace.local'`);
  await db.query(`UPDATE users SET email_verified_at=now() WHERE email LIKE '%@pace.local'`);
  alex = { id: u.id, token };
});
after(async () => {
  await app?.close();
  await closeDB();
});

test('nobody gets marketing email without opting in', async () => {
  assert.equal(await queueDailyDigests(MORNING), 0);
  const me = await app.inject({ method: 'GET', url: '/account', headers: as(alex.token) });
  assert.equal(me.json().marketing_opt_in, false);
});

test('opted-in people get one branded digest a day, after the send hour', async () => {
  const on = await app.inject({
    method: 'PATCH',
    url: '/account',
    headers: as(alex.token),
    payload: { marketingOptIn: true },
  });
  assert.equal(on.statusCode, 200, on.body);
  assert.equal(on.json().marketing_opt_in, true);
  assert.ok(on.json().marketing_consent_at);

  assert.equal(await queueDailyDigests(new Date('2031-03-04T05:00:00Z')), 0, 'too early');
  assert.equal(await queueDailyDigests(MORNING), 1);
  assert.equal(await queueDailyDigests(new Date('2031-03-04T20:00:00Z')), 0, 'same day');
  const [mail] = await digests(alex.id);
  const p = mail.payload;
  assert.match(p.subject, /your CRW\+ day$/);
  assert.match(p.html, /<table role="presentation"/);
  assert.match(p.html, /Today&#39;s challenge|Today's challenge/);
  assert.match(p.html, /Unsubscribe/);
  assert.match(p.text, /Unsubscribe: http/);
  assert.equal(p.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(p.headers['List-Unsubscribe'], /^<http.+\/email\/unsubscribe\?token=.+>$/);

  assert.equal(await queueDailyDigests(new Date('2031-03-05T08:00:00Z')), 1, 'next day');
  assert.equal((await digests(alex.id)).length, 2);
});

test('unverified addresses are skipped', async () => {
  const other = await login('pete@pace.local').catch(() => null);
  const [u] = await db.query(
    `SELECT u.id FROM users u WHERE u.email LIKE '%@pace.local' AND u.id<>$1 LIMIT 1`,
    [alex.id],
  );
  await db.query(`UPDATE users SET email_verified_at=NULL WHERE id=$1`, [u.id]);
  await db.query(`UPDATE user_accounts SET marketing_opt_in=true WHERE user_id=$1`, [u.id]);
  await queueDailyDigests(new Date('2031-03-06T08:00:00Z'));
  assert.equal((await digests(u.id)).length, 0);
  void other;
});

test('unsubscribe links: GET only confirms, POST opts out, bad tokens fail', async () => {
  const token = unsubscribeToken(alex.id);
  assert.equal(verifyUnsubscribeToken(token), alex.id);
  assert.equal(verifyUnsubscribeToken(token.slice(0, -2) + 'xx'), null);
  assert.equal(verifyUnsubscribeToken(`${alex.id}`), null);

  const page = await app.inject({
    method: 'GET',
    url: `/email/unsubscribe?token=${encodeURIComponent(token)}`,
  });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /<form method="POST"/);
  let [a] = await db.query('SELECT marketing_opt_in FROM user_accounts WHERE user_id=$1', [
    alex.id,
  ]);
  assert.equal(a.marketing_opt_in, true, 'a GET must not unsubscribe');

  const bad = await app.inject({
    method: 'POST',
    url: '/email/unsubscribe?token=nope',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'List-Unsubscribe=One-Click',
  });
  assert.equal(bad.statusCode, 400);

  // One-click, the way mail clients send it (RFC 8058).
  const click = await app.inject({
    method: 'POST',
    url: `/email/unsubscribe?token=${encodeURIComponent(token)}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'List-Unsubscribe=One-Click',
  });
  assert.equal(click.statusCode, 200);
  assert.match(click.body, /unsubscribed/i);
  [a] = await db.query(
    'SELECT marketing_opt_in, marketing_opt_out_at FROM user_accounts WHERE user_id=$1',
    [alex.id],
  );
  assert.equal(a.marketing_opt_in, false);
  assert.ok(a.marketing_opt_out_at);
  assert.equal(await queueDailyDigests(new Date('2031-03-07T08:00:00Z')), 0);

  // The confirmation page form works too.
  await db.query('UPDATE user_accounts SET marketing_opt_in=true WHERE user_id=$1', [alex.id]);
  const form = await app.inject({
    method: 'POST',
    url: '/email/unsubscribe',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: `token=${encodeURIComponent(token)}`,
  });
  assert.equal(form.statusCode, 200);
  [a] = await db.query('SELECT marketing_opt_in FROM user_accounts WHERE user_id=$1', [alex.id]);
  assert.equal(a.marketing_opt_in, false);
});

test('email text is escaped', () => {
  assert.equal(escapeHtml('<b>"x"</b>&'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;&amp;');
});
