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

let app: Awaited<ReturnType<typeof buildApp>>;
const ORIGIN = { origin: 'http://localhost:8081' };
let adminToken = '';
let memberToken = '';
let memberId = '';

const signIn = async (email: string) =>
  (
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: ORIGIN,
      payload: { email, password: process.env.SEED_PASSWORD },
    })
  ).json().token;

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  token: string,
  payload?: any,
) =>
  app.inject({
    method,
    url,
    headers: { ...ORIGIN, authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  });

const STORES = [
  { id: 'salata', name: 'Salata', area: 'Centrum', specialty: 'Bowls', sourceUrl: '' },
];
const ITEMS = [
  {
    id: 'salata-quinoa',
    storeId: 'salata',
    name: 'Quinoa bowl',
    category: 'Bowls',
    imageUrl: null,
    sourceUrl: '',
    priceLabel: '32 zl',
    calories: 540,
    proteinGrams: 24,
    nutritionBasis: 'per bowl',
  },
];

before(async () => {
  await seed();
  app = await buildApp();
  adminToken = await signIn('admin@pace.local');
  const registered = await app.inject({
    method: 'POST',
    url: '/auth/register',
    headers: ORIGIN,
    payload: {
      displayName: 'Mary Member',
      email: 'member@example.com',
      password: 'a-long-test-password',
    },
  });
  memberToken = registered.json().token;
  memberId = (await db.query(`SELECT id FROM users WHERE email='member@example.com'`))[0].id;
  // Administrating needs a verified address, which registration alone does not give.
  await db.query(`UPDATE users SET email_verified_at=now() WHERE id=$1`, [memberId]);
});
after(async () => {
  await app?.close();
  await closeDB();
});

test('the food catalogue is public to read and admin-only to change', async () => {
  const before = await app.inject({ method: 'GET', url: '/food', headers: ORIGIN });
  assert.equal(before.statusCode, 200);
  assert.deepEqual(before.json().items, []);

  assert.equal(
    (await call('POST', '/admin/food/import', memberToken, { stores: STORES, items: ITEMS }))
      .statusCode,
    403,
  );

  const imported = await call('POST', '/admin/food/import', adminToken, {
    stores: STORES,
    items: ITEMS,
  });
  assert.equal(imported.statusCode, 200);
  assert.equal(imported.json().items, 1);

  const live = (await app.inject({ method: 'GET', url: '/food', headers: ORIGIN })).json();
  assert.equal(live.items.length, 1);
  assert.equal(live.items[0].calories, 540);
  assert.equal(live.stores[0].name, 'Salata');
});

test('a dish can be renamed, hidden and deleted', async () => {
  const renamed = await call('PUT', '/admin/food/items', adminToken, {
    ...ITEMS[0],
    name: 'Big quinoa bowl',
  });
  assert.equal(renamed.statusCode, 200);

  await call('PUT', '/admin/food/items', adminToken, { ...ITEMS[0], enabled: false });
  const hidden = (await app.inject({ method: 'GET', url: '/food', headers: ORIGIN })).json();
  assert.equal(hidden.items.length, 0, 'a hidden dish does not reach the app');

  assert.equal(
    (await call('DELETE', `/admin/food/items/${ITEMS[0].id}`, memberToken)).statusCode,
    403,
  );
  assert.equal(
    (await call('DELETE', `/admin/food/items/${ITEMS[0].id}`, adminToken)).statusCode,
    200,
  );
  assert.equal(
    (await call('DELETE', `/admin/food/items/${ITEMS[0].id}`, adminToken)).statusCode,
    404,
  );
  const [audited] = await db.query(
    `SELECT action FROM audit_logs WHERE action='food.item.deleted' ORDER BY created_at DESC LIMIT 1`,
  );
  assert.ok(audited, 'the deletion is in the audit log');
});

test('an administrator is named by email and cannot drop their own role', async () => {
  const granted = await call('POST', '/admin/people/role', adminToken, {
    email: 'member@example.com',
    role: 'ADMIN',
    grant: true,
  });
  assert.equal(granted.statusCode, 200);
  const people = (await call('GET', '/admin/people', adminToken)).json();
  assert.ok(people.find((p: any) => p.email === 'member@example.com')?.roles.includes('ADMIN'));

  // The new administrator can work, and cannot take the role away from themselves.
  assert.equal((await call('GET', '/admin/food', memberToken)).statusCode, 200);
  const suicide = await call('POST', '/admin/people/role', memberToken, {
    email: 'member@example.com',
    role: 'ADMIN',
    grant: false,
  });
  assert.equal(suicide.statusCode, 409);

  assert.equal(
    (
      await call('POST', '/admin/people/role', adminToken, {
        email: 'nobody@example.com',
        role: 'ADMIN',
        grant: true,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await call('POST', '/admin/people/role', adminToken, {
        email: 'member@example.com',
        role: 'ADMIN',
        grant: false,
      })
    ).statusCode,
    200,
  );
});

test('email goes to the outbox, and only to the audience asked for', async () => {
  const test = await call('POST', '/admin/email', adminToken, {
    subject: 'Hello there',
    body: 'First paragraph.\n\nSecond paragraph.',
    test: true,
  });
  assert.equal(test.statusCode, 200);
  assert.equal(test.json().recipients, 1);

  const none = await call('POST', '/admin/email', adminToken, {
    subject: 'Nobody',
    body: 'This has no audience at all.',
    audience: 'selected',
    userIds: [],
  });
  assert.equal(none.statusCode, 400);

  const everyone = await call('POST', '/admin/email', adminToken, {
    subject: 'Everyone',
    body: 'A message for every account.',
    audience: 'all',
  });
  assert.equal(everyone.statusCode, 200);
  assert.ok(everyone.json().recipients > 1);

  const queued = await db.query(
    `SELECT payload FROM notification_outbox WHERE kind='email' ORDER BY created_at DESC LIMIT 1`,
  );
  const payload =
    typeof queued[0].payload === 'string' ? JSON.parse(queued[0].payload) : queued[0].payload;
  assert.equal(payload.subject, 'Everyone');
  assert.match(payload.html, /A message for every account\./);
});

test('deleting an account erases it and is refused for administrators', async () => {
  assert.equal(
    (await call('DELETE', `/admin/users/${memberId}`, memberToken, { reason: 'wants out' }))
      .statusCode,
    403,
  );
  const deleted = await call('DELETE', `/admin/users/${memberId}`, adminToken, {
    reason: 'asked us to remove the account',
  });
  assert.equal(deleted.statusCode, 200);
  const [row] = await db.query('SELECT status,email FROM users WHERE id=$1', [memberId]);
  assert.equal(row.status, 'deleted');
  assert.match(row.email, /^deleted-/);

  const [self] = await db.query(`SELECT id FROM users WHERE email='admin@pace.local'`);
  assert.equal(
    (await call('DELETE', `/admin/users/${self.id}`, adminToken, { reason: 'no way out' }))
      .statusCode,
    409,
  );
});

test('members can be searched, invited, given a role and removed', async () => {
  const created = await call('POST', '/admin/members', adminToken, {
    email: 'Newcomer@Example.com',
    displayName: 'New Comer',
    roles: ['ORGANIZER'],
  });
  assert.equal(created.statusCode, 200);
  const newId = created.json().id;

  // The address is stored lowercase and the same one cannot be used twice.
  const [row] = await db.query('SELECT email, password_hash FROM users WHERE id=$1', [newId]);
  assert.equal(row.email, 'newcomer@example.com');
  assert.equal(row.password_hash, null, 'the invitation is how they set a password');
  assert.equal(
    (
      await call('POST', '/admin/members', adminToken, {
        email: 'newcomer@example.com',
        displayName: 'Twice',
      })
    ).statusCode,
    409,
  );

  // An invitation email is queued with a link that works for a week.
  const [queued] = await db.query(
    `SELECT payload FROM notification_outbox WHERE kind='email' ORDER BY created_at DESC LIMIT 1`,
  );
  const payload = typeof queued.payload === 'string' ? JSON.parse(queued.payload) : queued.payload;
  assert.equal(payload.to, 'newcomer@example.com');
  assert.match(payload.html, /reset=/);
  const [token] = await db.query(
    `SELECT kind, expires_at > now() + interval '6 days' AS long FROM auth_tokens WHERE user_id=$1`,
    [newId],
  );
  assert.equal(token.kind, 'reset');
  assert.equal(token.long, true);

  // Search finds them, and the roles came along.
  const found = (await call('GET', '/admin/members?query=newcomer', adminToken)).json();
  assert.equal(found.length, 1);
  assert.deepEqual([...found[0].roles].sort(), ['ORGANIZER', 'USER']);
  assert.equal(found[0].display_name, 'New Comer');
  const organizers = (await call('GET', '/admin/members?filter=organizers', adminToken)).json();
  assert.ok(organizers.some((m: any) => m.id === newId));

  // Resending the invitation works, and a member may be deleted.
  assert.equal((await call('POST', `/admin/members/${newId}/invite`, adminToken)).statusCode, 200);
  assert.equal(
    (await call('DELETE', `/admin/users/${newId}`, adminToken, { reason: 'joined by mistake' }))
      .statusCode,
    200,
  );
  const gone = (await call('GET', '/admin/members?query=newcomer', adminToken)).json();
  assert.equal(gone.length, 0, 'a deleted member is out of the default list');
});

test('only an administrator may manage members', async () => {
  // A fresh, ordinary account: the earlier one was deleted, which would answer 401.
  const ordinary = (
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: ORIGIN,
      payload: {
        displayName: 'Plain Person',
        email: 'plain@example.com',
        password: 'a-long-test-password',
      },
    })
  ).json().token;
  assert.equal((await call('GET', '/admin/members', ordinary)).statusCode, 403);
  assert.equal(
    (
      await call('POST', '/admin/members', ordinary, {
        email: 'sneaky@example.com',
        displayName: 'Sneaky',
      })
    ).statusCode,
    403,
  );
});

test('the catalogue bundled with the app imports as it is', async () => {
  // The real menus, not a sample: one price label lists three variants and one dish has
  // half a gram of protein, both of which the first schema refused.
  const bundled = JSON.parse(
    readFileSync(new URL('../../mobile/src/content/food-catalog.json', import.meta.url), 'utf8'),
  );
  const imported = await call('POST', '/admin/food/import', adminToken, {
    stores: bundled.stores,
    items: bundled.items,
    replace: true,
  });
  assert.equal(imported.statusCode, 200, imported.body);
  assert.equal(imported.json().items, bundled.items.length);

  const live = (await app.inject({ method: 'GET', url: '/food', headers: ORIGIN })).json();
  assert.equal(live.items.length, bundled.items.length);
  const half = live.items.find((i: any) => i.proteinGrams === 48.5);
  assert.ok(half, 'half grams of protein survive the round trip');
  assert.ok(live.items.some((i: any) => (i.priceLabel || '').length > 40), 'long price labels too');
});
