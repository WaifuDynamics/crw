import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.SEED_PASSWORD = 'Development-test-password-123';
process.env.DATABASE_URL = '';

const { buildApp } = await import('../src/app.js');
const { db, closeDB } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { maskEmail } = await import('../src/routes/accountDeletion.js');
let app: Awaited<ReturnType<typeof buildApp>>;

const ORIGIN = { origin: 'http://localhost:8081' };
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

async function signUp(email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/register',
    headers: ORIGIN,
    payload: { displayName: 'Leaving Soon', email, password: 'a-long-test-password' },
  });
  assert.equal(r.statusCode, 200, r.body);
  const token = r.json().token as string;
  await db.query(`UPDATE users SET email_verified_at=now() WHERE email=$1`, [email]);
  const [u] = await db.query('SELECT id FROM users WHERE email=$1', [email]);
  return { token, id: u.id as string };
}

// The app sends DELETE without a body; this is exactly what used to fail.
const requestDeletion = (token: string, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'DELETE',
    url: '/account',
    headers: { ...ORIGIN, authorization: `Bearer ${token}`, ...headers },
  });

async function linkFor(userId: string, email: string) {
  const [mail] = await db.query(
    `SELECT payload FROM notification_outbox WHERE kind='email' AND payload->>'to'=$1
       AND payload->>'subject' LIKE 'Confirm deleting%' ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  assert.ok(mail, `no deletion email for ${userId}`);
  assert.match(mail.payload.html, /Confirm account deletion/);
  const url = new URL(mail.payload.text.match(/https?:\/\/\S+token=\S+/)[0]);
  return { path: `${url.pathname}${url.search}`, token: url.searchParams.get('token')! };
}

before(async () => {
  await seed();
  app = await buildApp();
});
after(async () => {
  await app?.close();
  await closeDB();
});

test('requesting deletion only sends an email; the account stays until confirmed', async () => {
  const email = 'leaving@example.com';
  const me = await signUp(email);

  // A bodiless DELETE is accepted even with a JSON content type header.
  const r = await requestDeletion(me.token, { 'content-type': 'application/json' });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().emailSent, true);
  assert.equal(r.json().email, 'l••••••@example.com');

  const [u] = await db.query('SELECT status FROM users WHERE id=$1', [me.id]);
  assert.equal(u.status, 'active');
  const still = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { ...ORIGIN, authorization: `Bearer ${me.token}` },
  });
  assert.equal(still.statusCode, 200);

  const link = await linkFor(me.id, email);

  // Opening the link (as a mail scanner would) deletes nothing.
  const page = await app.inject({ method: 'GET', url: link.path });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Yes, delete my account/);
  assert.match(page.body, /l••••••@example\.com/);
  assert.equal(
    (await db.query('SELECT status FROM users WHERE id=$1', [me.id]))[0].status,
    'active',
  );

  // Pressing the button deletes the account and signs it out.
  const done = await app.inject({
    method: 'POST',
    url: '/account/delete/confirm',
    headers: FORM,
    payload: `token=${encodeURIComponent(link.token)}`,
  });
  assert.equal(done.statusCode, 200, done.body);
  assert.match(done.body, /is deleted/);
  const [gone] = await db.query(
    `SELECT u.status, u.email, a.first_name, a.email account_email, a.marketing_opt_in
     FROM users u JOIN user_accounts a ON a.user_id=u.id WHERE u.id=$1`,
    [me.id],
  );
  assert.equal(gone.status, 'deleted');
  assert.match(gone.email, /@invalid\.local$/);
  assert.equal(gone.first_name, '');
  assert.match(gone.account_email, /@invalid\.local$/);
  assert.equal(gone.marketing_opt_in, false);
  const after = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { ...ORIGIN, authorization: `Bearer ${me.token}` },
  });
  assert.equal(after.statusCode, 401);

  // The link works once.
  const again = await app.inject({
    method: 'POST',
    url: '/account/delete/confirm',
    headers: FORM,
    payload: `token=${encodeURIComponent(link.token)}`,
  });
  assert.equal(again.statusCode, 400);
});

test('only the newest link works, and bad or expired links fail', async () => {
  const email = 'twice@example.com';
  const me = await signUp(email);
  await requestDeletion(me.token);
  const first = await linkFor(me.id, email);
  await requestDeletion(me.token);
  const second = await linkFor(me.id, email);
  assert.notEqual(first.token, second.token);

  const old = await app.inject({ method: 'GET', url: first.path });
  assert.equal(old.statusCode, 400);
  assert.match(old.body, /didn’t work/);

  const junk = await app.inject({
    method: 'POST',
    url: '/account/delete/confirm',
    headers: FORM,
    payload: 'token=' + 'x'.repeat(40),
  });
  assert.equal(junk.statusCode, 400);

  await db.query(
    `UPDATE auth_tokens SET expires_at=now()-interval '1 minute' WHERE user_id=$1 AND kind='delete_account'`,
    [me.id],
  );
  const expired = await app.inject({
    method: 'POST',
    url: '/account/delete/confirm',
    headers: FORM,
    payload: `token=${encodeURIComponent(second.token)}`,
  });
  assert.equal(expired.statusCode, 400);
  assert.equal(
    (await db.query('SELECT status FROM users WHERE id=$1', [me.id]))[0].status,
    'active',
  );
});

test('deletion needs a signed-in, verified account', async () => {
  const anon = await app.inject({ method: 'DELETE', url: '/account', headers: ORIGIN });
  assert.equal(anon.statusCode, 401);
  const r = await app.inject({
    method: 'POST',
    url: '/auth/register',
    headers: ORIGIN,
    payload: {
      displayName: 'Unverified',
      email: 'unverified@example.com',
      password: 'a-long-test-password',
    },
  });
  const unverified = await requestDeletion(r.json().token);
  assert.equal(unverified.statusCode, 403);
});

test('email addresses are masked', () => {
  assert.equal(maskEmail('michal@gmail.com'), 'm•••••@gmail.com');
  assert.equal(maskEmail('a@b.pl'), 'a@b.pl');
});

test('invalid JSON is still a 400', async () => {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { ...ORIGIN, 'content-type': 'application/json' },
    payload: '{nope',
  });
  assert.equal(r.statusCode, 400);
});

test('web deletion request sends confirmation email without requiring authorization', async () => {
  const email = 'webdelete@example.com';
  const me = await signUp(email);

  const r = await app.inject({
    method: 'POST',
    url: '/account/delete/request-web',
    headers: { ...ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ email }),
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().ok, true);

  const link = await linkFor(me.id, email);
  assert.ok(link.token);

  // Unknown email still returns 200 ok to prevent email enumeration
  const unknown = await app.inject({
    method: 'POST',
    url: '/account/delete/request-web',
    headers: { ...ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ email: 'nonexistent@example.com' }),
  });
  assert.equal(unknown.statusCode, 200);
  assert.equal(unknown.json().ok, true);

  // Invalid email returns 400
  const bad = await app.inject({
    method: 'POST',
    url: '/account/delete/request-web',
    headers: { ...ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ email: 'not-an-email' }),
  });
  assert.equal(bad.statusCode, 400);

  // GET /delete-account redirects to appUrl
  const redir = await app.inject({
    method: 'GET',
    url: '/delete-account',
  });
  assert.equal(redir.statusCode, 302);
  assert.match(redir.headers.location!, /\/delete-account$/);
});

