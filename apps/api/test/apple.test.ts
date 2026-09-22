import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

// A local stand-in for Apple's key endpoint, so the real verification path runs against
// tokens this test signs itself.
const CLIENT_ID = 'app.crwplus.fitness';
const { publicKey, privateKey } = await generateKeyPair('RS256');
const { privateKey: strangerKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'apple-test-key', alg: 'RS256', use: 'sig' };
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
process.env.APPLE_CLIENT_ID = CLIENT_ID;
process.env.APPLE_SERVICES_ID = 'com.crwplus.web';
process.env.APPLE_JWKS_URL = `http://127.0.0.1:${port}/keys`;

const { buildApp } = await import('../src/app.js');
const { db, closeDB } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
let app: Awaited<ReturnType<typeof buildApp>>;

const ORIGIN = { origin: 'http://localhost:8081' };

const appleToken = (claims: Record<string, any> = {}, opts: any = {}) =>
  new SignJWT({
    email: 'private-relay@privaterelay.appleid.com',
    email_verified: 'true',
    is_private_email: 'true',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'apple-test-key' })
    .setIssuer(opts.issuer ?? 'https://appleid.apple.com')
    .setAudience(opts.audience ?? CLIENT_ID)
    .setSubject(opts.sub ?? '001234.abcdef.0001')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '10m')
    .sign(opts.key ?? privateKey);

const apple = (payload: any) =>
  app.inject({ method: 'POST', url: '/auth/apple', headers: ORIGIN, payload });

before(async () => {
  await seed();
  app = await buildApp();
});
after(async () => {
  await app?.close();
  await closeDB();
  jwks.close();
});

test('the browser is told which Apple client to use', async () => {
  const r = await app.inject({ method: 'GET', url: '/auth/apple/config', headers: ORIGIN });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().clientId, 'com.crwplus.web');
});

test('a first Apple sign-in creates the account with the name the app passes', async () => {
  const r = await apple({
    credential: await appleToken(),
    firstName: 'Ola',
    lastName: 'Nowak',
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().created, true);
  const [user] = await db.query(
    `SELECT u.id, u.email_verified_at, p.display_name, a.apple_sub
     FROM users u JOIN profiles p ON p.user_id=u.id JOIN user_accounts a ON a.user_id=u.id
     WHERE u.email='private-relay@privaterelay.appleid.com'`,
  );
  assert.equal(user.display_name, 'Ola Nowak');
  assert.equal(user.apple_sub, '001234.abcdef.0001');
  assert.ok(user.email_verified_at, 'Apple has verified the address for us');
});

test('signing in again reuses the same account', async () => {
  const r = await apple({ credential: await appleToken() });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().created, false);
  const rows = await db.query(
    `SELECT id FROM users WHERE email='private-relay@privaterelay.appleid.com'`,
  );
  assert.equal(rows.length, 1);
});

test('Apple and Google can reach one account, and a second Apple ID cannot take it', async () => {
  // The seeded member already exists with a password.
  const linked = await apple({
    credential: await appleToken({ email: 'alex@pace.local' }, { sub: '001234.abcdef.0002' }),
  });
  assert.equal(linked.statusCode, 200);
  assert.equal(linked.json().created, false);
  const [account] = await db.query(
    `SELECT a.apple_sub FROM user_accounts a JOIN users u ON u.id=a.user_id WHERE u.email='alex@pace.local'`,
  );
  assert.equal(account.apple_sub, '001234.abcdef.0002');

  const stranger = await apple({
    credential: await appleToken({ email: 'alex@pace.local' }, { sub: '001234.abcdef.9999' }),
  });
  assert.equal(stranger.statusCode, 409);
});

test('a token that is not really from Apple is refused', async () => {
  assert.equal((await apple({ credential: await appleToken({}, { key: strangerKey }) })).statusCode, 401);
  assert.equal(
    (await apple({ credential: await appleToken({}, { audience: 'someone.else' }) })).statusCode,
    401,
  );
  assert.equal(
    (await apple({ credential: await appleToken({}, { issuer: 'https://evil.example' }) }))
      .statusCode,
    401,
  );
  assert.equal(
    (await apple({ credential: await appleToken({ email_verified: 'false' }, { sub: 'x.1' }) }))
      .statusCode,
    403,
  );
  assert.equal(
    (await apple({ credential: await appleToken({ email: undefined }, { sub: 'x.2' }) })).statusCode,
    403,
  );
});
