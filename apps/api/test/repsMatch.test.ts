import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

// A stand-in for the pairing engine, so the pass-through runs for real.
const seen: { method: string; url: string; body: string }[] = [];
const engine: Server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    seen.push({ method: req.method || '', url: req.url || '', body });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/queues') return res.end(JSON.stringify({ online: 3, playing: 2 }));
    res.end(JSON.stringify({ playerId: 'abc', v: 1, echo: body ? JSON.parse(body) : null }));
  });
});
await new Promise<void>((r) => engine.listen(0, '127.0.0.1', r));
const port = (engine.address() as any).port;

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.SEED_PASSWORD = 'Development-test-password-123';
process.env.DATABASE_URL = '';
process.env.REPS_INTERNAL_URL = `http://127.0.0.1:${port}`;

const { buildApp } = await import('../src/app.js');
const { closeDB } = await import('../src/db.js');
let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  app = await buildApp();
});
after(async () => {
  await app?.close();
  await closeDB();
  engine.close();
});

test('a counter loaded from the app itself can reach matchmaking', async () => {
  // A page loaded from local files reports its origin as "null".
  const r = await app.inject({
    method: 'POST',
    url: '/reps/match/sync',
    headers: { origin: 'null', 'content-type': 'application/json' },
    payload: { playerId: null, name: 'Tester', count: 0, action: 'queue', mode: '1v1' },
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.headers['access-control-allow-origin'], 'null');
  assert.equal(r.json().playerId, 'abc');
  assert.equal(seen.at(-1)?.url, '/api/sync');
  assert.equal(JSON.parse(seen.at(-1)!.body).action, 'queue');
});

test('a closing page can quit with a beacon, which sends text/plain', async () => {
  const r = await app.inject({
    method: 'POST',
    url: '/reps/match/sync',
    headers: { origin: 'null', 'content-type': 'text/plain;charset=UTF-8' },
    payload: JSON.stringify({ playerId: 'abc', action: 'quit' }),
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(JSON.parse(seen.at(-1)!.body).action, 'quit');
});

test('the queue sizes come through, and other routes keep their origin rules', async () => {
  const q = await app.inject({ method: 'GET', url: '/reps/match/queues', headers: { origin: 'null' } });
  assert.equal(q.statusCode, 200);
  assert.equal(q.json().online, 3);

  // Opening matchmaking to any origin must not open anything else.
  const other = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { origin: 'null', 'content-type': 'application/json' },
    payload: { email: 'x@example.com', password: 'whatever-long-password' },
  });
  assert.equal(other.statusCode, 403);
});
