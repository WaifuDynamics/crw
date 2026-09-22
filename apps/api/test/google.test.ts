import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

// A local stand-in for Google's key endpoint, so the real verification path runs
// against tokens this test signs itself.
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const { publicKey, privateKey } = await generateKeyPair('RS256');
const { privateKey: strangerKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
const jwks: Server = createServer((_, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
});
await new Promise<void>((r) => jwks.listen(0, '127.0.0.1', r));
const port = (jwks.address() as any).port;

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.SEED_PASSWORD = 'Development-test-password-123';
process.env.DATABASE_URL = '';
process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
process.env.GOOGLE_JWKS_URL = `http://127.0.0.1:${port}/certs`;

const { buildApp } = await import('../src/app.js');
const { db, closeDB } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
let app: Awaited<ReturnType<typeof buildApp>>;

const ORIGIN = { origin: 'http://localhost:8081' };

async function googleToken(claims: Record<string, any> = {}, opts: any = {}) {
  return new SignJWT({
    email: 'nowa.osoba@gmail.com',
    email_verified: true,
    given_name: 'Nowa',
    family_name: 'Osoba',
    name: 'Nowa Osoba',
    picture: 'https://lh3.googleusercontent.com/a/photo',
    locale: 'pl',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(opts.issuer ?? 'https://accounts.google.com')
    .setAudience(opts.audience ?? CLIENT_ID)
    .setSubject(opts.sub ?? '1234567890')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '10m')
    .sign(opts.key ?? privateKey);
}

async function google(credential: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/auth/google',
    headers: { ...ORIGIN, ...headers },
    payload: { credential },
  });
}

before(async () => {
  await seed();
  app = await buildApp();
});
after(async () => {
  // Close the key server first: if setup failed, `app` is undefined and the open
  // server would otherwise keep the test process alive forever.
  jwks.close();
  await app?.close();
  await closeDB();
});

test('public config exposes the web client id', async () => {
  const r = await app.inject({ method: 'GET', url: '/auth/google/config', headers: ORIGIN });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().clientId, CLIENT_ID);
});

test('first Google sign-in creates a verified account with its details', async () => {
  const r = await google(await googleToken());
  assert.equal(r.statusCode, 200, r.body);
  const { token, created } = r.json();
  assert.equal(created, true);

  const me = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { ...ORIGIN, authorization: `Bearer ${token}` },
  });
  assert.equal(me.statusCode, 200, me.body);
  const body = me.json();
  assert.equal(body.verified, true);
  assert.equal(body.display_name, 'Nowa Osoba');
  assert.deepEqual(
    {
      first: body.account.first_name,
      last: body.account.last_name,
      email: body.account.email,
      avatar: body.account.avatar_url,
      language: body.account.language,
      country: body.account.country_code,
      google: body.account.google_linked,
    },
    {
      first: 'Nowa',
      last: 'Osoba',
      email: 'nowa.osoba@gmail.com',
      avatar: 'https://lh3.googleusercontent.com/a/photo',
      language: 'pl',
      country: null,
      google: true,
    },
  );
  const [row] = await db.query('SELECT password_hash FROM users WHERE email=$1', [
    'nowa.osoba@gmail.com',
  ]);
  assert.equal(row.password_hash, null);
});

test('signing in again reuses the same account', async () => {
  const first = (await google(await googleToken())).json();
  const again = (await google(await googleToken())).json();
  assert.equal(again.created, false);
  assert.equal(again.userId, first.userId);
  const [{ n }] = await db.query('SELECT count(*)::int n FROM users WHERE email=$1', [
    'nowa.osoba@gmail.com',
  ]);
  assert.equal(n, 1);
});

test('a verified Google email links to the existing password account', async () => {
  const [alex] = await db.query(`SELECT id FROM users WHERE email='alex@pace.local'`);
  const r = await google(await googleToken({ email: 'alex@pace.local' }, { sub: 'alex-google' }));
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().userId, alex.id);
  assert.equal(r.json().created, false);

  // the password still works
  const pw = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: ORIGIN,
    payload: { email: 'alex@pace.local', password: process.env.SEED_PASSWORD },
  });
  assert.equal(pw.statusCode, 200, pw.body);
});

test('an unverified Google email cannot take over an account', async () => {
  const r = await google(
    await googleToken({ email: 'organizer@pace.local', email_verified: false }, { sub: 'evil' }),
  );
  assert.equal(r.statusCode, 403);
});

test('a second Google identity cannot claim an already linked account', async () => {
  const r = await google(await googleToken({ email: 'alex@pace.local' }, { sub: 'someone-else' }));
  assert.equal(r.statusCode, 409);
});

test('tokens that fail verification are rejected', async () => {
  const cases = {
    'wrong audience': await googleToken({}, { audience: 'another-app' }),
    'wrong issuer': await googleToken({}, { issuer: 'https://evil.example' }),
    expired: await googleToken({}, { exp: Math.floor(Date.now() / 1000) - 60 }),
    'foreign signature': await googleToken({}, { key: strangerKey }),
  };
  for (const [label, token] of Object.entries(cases)) {
    const r = await google(token);
    assert.equal(r.statusCode, 401, `${label}: ${r.statusCode} ${r.body}`);
  }
});

test('Google-only accounts cannot sign in with an empty password', async () => {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: ORIGIN,
    payload: { email: 'nowa.osoba@gmail.com', password: '' },
  });
  assert.equal(r.statusCode, 401);
});

test('account details can be read and updated', async () => {
  const { token } = (await google(await googleToken())).json();
  const auth = { ...ORIGIN, authorization: `Bearer ${token}` };

  const upd = await app.inject({
    method: 'PATCH',
    url: '/account',
    headers: auth,
    payload: { countryCode: 'pl', language: 'pl-PL', lastName: 'Kowalska' },
  });
  assert.equal(upd.statusCode, 200, upd.body);
  assert.equal(upd.json().country_code, 'PL');
  assert.equal(upd.json().language, 'pl-PL');
  assert.equal(upd.json().last_name, 'Kowalska');
  assert.equal(upd.json().first_name, 'Nowa');

  for (const bad of [
    { countryCode: 'Poland' },
    { language: 'polish' },
    { avatarUrl: 'not a url' },
    { email: 'x@y.z' }, // email is not editable here
  ]) {
    const r = await app.inject({ method: 'PATCH', url: '/account', headers: auth, payload: bad });
    assert.equal(r.statusCode, 400, `${JSON.stringify(bad)} -> ${r.statusCode}`);
  }

  const read = await app.inject({ method: 'GET', url: '/account', headers: auth });
  assert.equal(read.json().country_code, 'PL');
  const anon = await app.inject({ method: 'GET', url: '/account', headers: ORIGIN });
  assert.equal(anon.statusCode, 401);
});

test('password sign-up also gets an account row', async () => {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/register',
    headers: ORIGIN,
    payload: { email: 'nowy@example.com', password: 'Str0ng-password-123', displayName: 'Nowy' },
  });
  assert.equal(r.statusCode, 200, r.body);
  const acc = await app.inject({
    method: 'GET',
    url: '/account',
    headers: { ...ORIGIN, authorization: `Bearer ${r.json().token}` },
  });
  assert.equal(acc.statusCode, 200, acc.body);
  assert.equal(acc.json().email, 'nowy@example.com');
  assert.equal(acc.json().google_linked, false);
});

test('seeded users without a row get one on first read', async () => {
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: ORIGIN,
    payload: { email: 'organizer@pace.local', password: process.env.SEED_PASSWORD },
  });
  const r = await app.inject({
    method: 'GET',
    url: '/account',
    headers: { ...ORIGIN, authorization: `Bearer ${login.json().token}` },
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().email, 'organizer@pace.local');
  assert.equal(r.json().language, 'en');
});

test('sign-up questions: body details are optional and onboarding is recorded', async () => {
  const { token } = (await google(await googleToken({ email: 'onboard@gmail.com' }, { sub: 'onboard' })))
    .json();
  const auth = { ...ORIGIN, authorization: `Bearer ${token}` };

  const fresh = (await app.inject({ method: 'GET', url: '/auth/me', headers: auth })).json().account;
  assert.equal(fresh.onboarding_completed_at, null);
  assert.deepEqual([fresh.age, fresh.weight_kg, fresh.height_cm], [null, null, null]);

  // answered two, skipped the rest
  const done = await app.inject({
    method: 'PATCH',
    url: '/account',
    headers: auth,
    payload: { countryCode: 'PL', age: 31, weightKg: 72.46, heightCm: null, onboardingComplete: true },
  });
  assert.equal(done.statusCode, 200, done.body);
  const a = done.json();
  assert.equal(a.age, 31);
  assert.equal(a.weight_kg, 72.5); // one decimal, returned as a number
  assert.equal(a.height_cm, null);
  assert.equal(a.country_code, 'PL');
  assert.ok(a.onboarding_completed_at);

  // finishing again keeps the first completion time
  const again = await app.inject({
    method: 'PATCH',
    url: '/account',
    headers: auth,
    payload: { onboardingComplete: true },
  });
  assert.equal(again.json().onboarding_completed_at, a.onboarding_completed_at);

  for (const bad of [
    { age: 5 },
    { age: 30.5 },
    { weightKg: 900 },
    { heightCm: 20 },
    { onboardingComplete: false },
  ]) {
    const r = await app.inject({ method: 'PATCH', url: '/account', headers: auth, payload: bad });
    assert.equal(r.statusCode, 400, `${JSON.stringify(bad)} -> ${r.statusCode}`);
  }
});
