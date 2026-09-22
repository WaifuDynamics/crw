import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.SEED_PASSWORD = 'Development-test-password-123';
process.env.DATABASE_URL = '';

const { buildApp } = await import('../src/app.js');
const { db, closeDB } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { LEGAL_VERSION } = await import('../src/legal.js');
let app: Awaited<ReturnType<typeof buildApp>>;
const ORIGIN = { origin: 'http://localhost:8081' };
let token = '';
let userId = '';

before(async () => {
  await seed();
  app = await buildApp();
  const r = await app.inject({
    method: 'POST',
    url: '/auth/register',
    headers: ORIGIN,
    payload: { displayName: 'Legal Lee', email: 'legal@example.com', password: 'a-long-test-password' },
  });
  token = r.json().token;
  userId = (await db.query(`SELECT id FROM users WHERE email='legal@example.com'`))[0].id;
});
after(async () => {
  await app?.close();
  await closeDB();
});
const accept = (payload: any) =>
  app.inject({
    method: 'POST',
    url: '/account/legal',
    headers: { ...ORIGIN, authorization: `Bearer ${token}` },
    payload,
  });

test('the app and the API ask for the same legal version', () => {
  const generated = readFileSync(new URL('../../mobile/src/legal/documents.ts', import.meta.url), 'utf8');
  assert.equal(/LEGAL_VERSION = "([^"]+)"/.exec(generated)?.[1], LEGAL_VERSION);
});

test('a new account has not accepted the terms yet', async () => {
  const me = await app.inject({
    method: 'GET',
    url: '/account',
    headers: { ...ORIGIN, authorization: `Bearer ${token}` },
  });
  assert.equal(me.json().legal_version, null);
});

test('acceptance needs the current version and the age confirmation', async () => {
  assert.equal((await accept({ version: '2020-01-01', ageConfirmed: true })).statusCode, 400);
  assert.equal((await accept({ version: LEGAL_VERSION, ageConfirmed: false })).statusCode, 400);
  const ok = await accept({ version: LEGAL_VERSION, ageConfirmed: true, platform: 'android' });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().legal_version, LEGAL_VERSION);
  assert.ok(ok.json().legal_accepted_at);
  // Accepting twice is harmless and keeps one record.
  assert.equal((await accept({ version: LEGAL_VERSION, ageConfirmed: true })).statusCode, 200);
  const rows = await db.query('SELECT version, age_confirmed, platform FROM legal_acceptances WHERE user_id=$1', [userId]);
  assert.deepEqual(rows.map((r: any) => ({ ...r })), [
    { version: LEGAL_VERSION, age_confirmed: true, platform: 'android' },
  ]);
  const [log] = await db.query(`SELECT count(*)::int n FROM audit_logs WHERE actor_id=$1 AND action='legal.accepted'`, [userId]);
  assert.equal(log.n, 2);
});

test('acceptance needs a signed-in account', async () => {
  const r = await app.inject({
    method: 'POST',
    url: '/account/legal',
    headers: ORIGIN,
    payload: { version: LEGAL_VERSION, ageConfirmed: true },
  });
  assert.equal(r.statusCode, 401);
});
