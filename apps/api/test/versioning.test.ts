import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.SEED_PASSWORD = 'Development-test-password-123';
process.env.DATABASE_URL = '';
process.env.MIN_APP_VERSION = '2.6.0';

const { buildApp } = await import('../src/app.js');
const { closeDB } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
let app: Awaited<ReturnType<typeof buildApp>>;
const ORIGIN = { origin: 'http://localhost:8081' };

before(async () => {
  await seed();
  app = await buildApp();
});
after(async () => {
  await app?.close();
  await closeDB();
});

test('the same routes answer under /v1 and, for older apps, without it', async () => {
  const v1 = await app.inject({ method: 'GET', url: '/v1/catalog', headers: ORIGIN });
  const old = await app.inject({ method: 'GET', url: '/catalog', headers: ORIGIN });
  assert.equal(v1.statusCode, 200);
  assert.equal(old.statusCode, 200);
  assert.deepEqual(v1.json(), old.json());
  // Only the old address is marked, and it points at its successor.
  assert.equal(v1.headers.deprecation, undefined);
  assert.equal(old.headers.deprecation, 'true');
  assert.match(String(old.headers.link), /\/v1/);

  // Query strings and posts come through the prefix intact.
  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: ORIGIN,
    payload: { email: 'admin@pace.local', password: process.env.SEED_PASSWORD },
  });
  assert.equal(login.statusCode, 200, login.body);
  const events = await app.inject({ method: 'GET', url: '/v1/events?limit=2', headers: ORIGIN });
  assert.equal(events.statusCode, 200);
});

test('fixed addresses outside the versions are not marked as deprecated', async () => {
  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);
  assert.equal(health.headers.deprecation, undefined);
  // And /v1/health works too, for anything that prefers it.
  assert.equal((await app.inject({ method: 'GET', url: '/v1/health' })).statusCode, 200);
});

test('/v1/meta tells the apps the oldest version it still serves', async () => {
  const meta = (await app.inject({ method: 'GET', url: '/v1/meta' })).json();
  assert.equal(meta.api, 'v1');
  assert.equal(meta.minAppVersion, '2.6.0');
  assert.equal(meta.maintenance, false);
});

test('production refuses to start when it is not configured', () => {
  // A separate process: the configuration is checked once, at import.
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', '-e', "import('./src/config.ts').then(() => console.log('started'))"],
    {
      cwd: new URL('..', import.meta.url),
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        NODE_ENV: 'production',
        SESSION_SECRET: 'short',
        APP_URL: 'http://insecure.example',
      },
      encoding: 'utf8',
    },
  );
  assert.notEqual(r.status, 0, 'it must not start');
  const why = r.stderr + r.stdout;
  assert.doesNotMatch(why, /started/);
  assert.match(why, /SESSION_SECRET must be set/);
  assert.match(why, /APP_URL must use https/);
  assert.match(why, /DATABASE_URL must be set/);
});
