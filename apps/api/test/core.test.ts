import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.SEED_PASSWORD = 'Development-test-password-123';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
if (
  process.env.TEST_DATABASE_URL &&
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')
)
  throw new Error('TEST_DATABASE_URL must point to a dedicated database ending in _test');
const { buildApp } = await import('../src/app.js');
const { db, closeDB, tx } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { id, hash } = await import('../src/security.js');
const { settle, processRefunds } = await import('../src/bookings.js');
let app: Awaited<ReturnType<typeof buildApp>>,
  userToken: string,
  organizerToken: string,
  adminToken: string,
  userId: string,
  orgId: string,
  communityId: string,
  cityId: string;
const auth = (token: string) => ({
  authorization: `Bearer ${token}`,
  origin: 'http://localhost:8081',
});
async function call(method: any, url: string, token?: string, payload?: any, extra: any = {}) {
  return app.inject({ method, url, headers: { ...(token ? auth(token) : {}), ...extra }, payload });
}
async function login(email: string) {
  const r = await call('POST', '/auth/login', undefined, {
    email,
    password: process.env.SEED_PASSWORD,
  });
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
}
async function event(overrides: any = {}) {
  const b = {
    communityId,
    title: 'Test real activity',
    description: 'A controlled integration test activity for real booking flows.',
    category: 'running',
    difficulty: 'beginner',
    cityId,
    locationName: 'Beirut test meeting point',
    latitude: 33.8938,
    longitude: 35.5018,
    startsAt: new Date(Date.now() + 3600000).toISOString(),
    endsAt: new Date(Date.now() + 7200000).toISOString(),
    capacity: 10,
    priceMinor: 0,
    currency: 'USD',
    coverUrl: null,
    tags: [],
    requirements: 'Water',
    included: 'A guided experience',
    safetyInfo: 'Follow your activity host at all times.',
    cancellationHours: 0,
    status: 'published',
    ...overrides,
  };
  const r = await call('POST', '/organizer/events', organizerToken, b);
  assert.equal(r.statusCode, 200, r.body);
  return r.json().id as string;
}
async function book(eventId: string, token = userToken, key = id()) {
  const r = await call('POST', '/bookings', token, { eventId }, { 'idempotency-key': key });
  return r;
}
before(async () => {
  await seed();
  app = await buildApp();
  const user = await login('alex@pace.local');
  userToken = user.token;
  userId = user.userId;
  const org = await login('organizer@pace.local');
  organizerToken = org.token;
  orgId = org.userId;
  adminToken = (await login('admin@pace.local')).token;
  const [co] = await db.query('SELECT * FROM communities LIMIT 1');
  communityId = co.id;
  cityId = co.city_id;
});
after(async () => {
  await app?.close();
  await closeDB();
});
test('public discovery, search, categories and real aggregates work', async () => {
  for (const url of [
    '/health',
    '/catalog',
    '/events',
    '/discover/stats',
    // The card on Discover counts only what is near you.
    '/discover/stats?lat=33.89&lng=35.50&radius=25',
    '/communities',
    '/challenges',
    '/achievements',
    '/seasons',
    '/search?q=run',
    '/events?q=coffee',
    '/events?when=tonight',
    '/events?when=weekend',
    '/events?lat=33.89&lng=35.50&radius=25',
    '/events?free=true',
    '/events?category=running',
  ]) {
    const r = await call('GET', url);
    assert.equal(r.statusCode, 200, `${url}: ${r.body}`);
  }
  const r = (await call('GET', '/events?free=true')).json();
  assert(r.events.every((e: any) => e.price_minor === 0));
});
test('password login is real and invalid passwords fail', async () => {
  const r = await call('POST', '/auth/login', undefined, {
    email: 'alex@pace.local',
    password: 'incorrect',
  });
  assert.equal(r.statusCode, 401);
  const [u] = await db.query('SELECT password_hash FROM users WHERE id=$1', [userId]);
  assert(!u.password_hash.includes(process.env.SEED_PASSWORD!));
});
test('registration requires verification and one-use verification tokens', async () => {
  const r = await call('POST', '/auth/register', undefined, {
    displayName: 'New Member',
    email: 'new@pace.local',
    password: 'a-long-test-password',
  });
  assert.equal(r.statusCode, 200, r.body);
  const token = r.json().token;
  const e = await event();
  assert.equal((await book(e, token)).statusCode, 403);
  const [mail] = await db.query(
    `SELECT payload FROM notification_outbox WHERE kind='email' AND payload->>'to'='new@pace.local' ORDER BY created_at DESC LIMIT 1`,
  );
  const verify = new URL(mail.payload.text.match(/https?:\/\/\S+verify=\S+/)[0]).searchParams.get(
    'verify',
  );
  assert.equal(mail.payload.subject, 'Verify your CRW+ email');
  assert.match(mail.payload.html, /Verify my email/);
  assert.equal((await call('POST', '/auth/verify', undefined, { token: verify })).statusCode, 200);
  assert.equal((await call('POST', '/auth/verify', undefined, { token: verify })).statusCode, 400);
  assert.equal((await book(e, token)).statusCode, 200);
});
test('normal users cannot publish, scan, review or change fees', async () => {
  for (const url of ['/organizer/overview', '/admin/overview', '/admin/data/users'])
    assert.equal((await call('GET', url, userToken)).statusCode, 403, url);
  assert.equal(
    (await call('POST', '/organizer/checkin', userToken, { token: 'x'.repeat(80) })).statusCode,
    403,
  );
  const r = await call('PUT', '/admin/config/fees', userToken, {});
  assert.equal(r.statusCode, 403);
});
test('free booking creates a secure ticket and idempotent retries do not duplicate', async () => {
  const e = await event(),
    key = id();
  const a = await book(e, userToken, key),
    b = await book(e, userToken, key);
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(a.json().id, b.json().id);
  assert.equal(a.json().status, 'confirmed');
  assert.equal(
    (
      await db.query(
        "SELECT id FROM analytics_events WHERE event_id=$1 AND name='checkout_started'",
        [e],
      )
    ).length,
    1,
  );
  const ticket = (await call('GET', `/bookings/${a.json().id}`, userToken)).json();
  assert(ticket.qr.length > 60);
  assert.equal(ticket.total_minor, 0);
  assert.equal((await call('GET', `/bookings/${a.json().id}`, organizerToken)).statusCode, 404);
});
test('capacity transaction prevents overselling under concurrent requests', async () => {
  const e = await event({ capacity: 1 });
  const results = await Promise.all([
    book(e, userToken),
    book(e, adminToken),
    book(e, organizerToken),
  ]);
  assert.equal(results.filter((r) => r.statusCode === 200).length, 1);
  assert.equal(results.filter((r) => r.statusCode === 409).length, 2);
  const [count] = await db.query(
    `SELECT count(*)::int n FROM bookings WHERE event_id=$1 AND status='confirmed'`,
    [e],
  );
  assert.equal(count.n, 1);
});
test('check-in rejects forged tickets and repeated attendance cannot duplicate XP', async () => {
  const e = await event(),
    b = (await book(e)).json();
  const t = (await call('GET', `/bookings/${b.id}`, userToken)).json();
  assert.equal(
    (
      await call('POST', '/organizer/checkin', organizerToken, {
        token: t.qr.slice(0, -5) + 'aaaaa',
      })
    ).statusCode,
    400,
  );
  const a = await call('POST', '/organizer/checkin', organizerToken, { token: t.qr });
  assert.equal(a.statusCode, 200, a.body);
  const again = await call('POST', '/organizer/checkin', organizerToken, { token: t.qr });
  assert.equal(again.statusCode, 409, again.body);
  const rows = await db.query(
    `SELECT * FROM xp_transactions WHERE user_id=$1 AND source_id=$2 AND source_type='attendance'`,
    [userId, e],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].points, 100);
});
test('check-in outside the attendance window is denied', async () => {
  const e = await event({
      startsAt: new Date(Date.now() + 10 * 86400000).toISOString(),
      endsAt: new Date(Date.now() + 10 * 86400000 + 3600000).toISOString(),
    }),
    b = (await book(e)).json(),
    t = (await call('GET', `/bookings/${b.id}`, userToken)).json();
  assert.equal(
    (await call('POST', '/organizer/checkin', organizerToken, { token: t.qr })).statusCode,
    409,
  );
});
test('ledger and audit records cannot be edited or deleted', async () => {
  await assert.rejects(
    () => db.query('UPDATE xp_transactions SET points=999 WHERE user_id=$1', [userId]),
    /append-only/,
  );
  await assert.rejects(() => db.query('DELETE FROM audit_logs'), /append-only/);
});
test('paid booking snapshots fee rules, rejects tampering, confirms only once', async () => {
  const e = await event({ priceMinor: 1000 }),
    b = (await book(e)).json();
  assert.equal(b.ticket_minor, 1000);
  assert.equal(b.fee_minor, 100);
  assert.equal(b.total_minor, 1100);
  assert.equal(b.status, 'reserved');
  const p = (await call('POST', `/bookings/${b.id}/checkout`, userToken, {})).json();
  assert.equal(p.provider, 'sandbox');
  await assert.rejects(
    () =>
      settle('sandbox', {
        id: id(),
        bookingId: b.id,
        reference: p.provider_reference,
        amount: 1,
        currency: 'USD',
        paid: true,
      }),
    /mismatch/,
  );
  const payment = {
    id: id(),
    bookingId: b.id,
    reference: p.provider_reference,
    amount: 1100,
    currency: 'USD',
    paid: true,
  };
  assert.deepEqual(await settle('sandbox', payment), { confirmed: true });
  assert.deepEqual(await settle('sandbox', payment), { duplicate: true });
  const t = (await call('GET', `/bookings/${b.id}`, userToken)).json();
  assert.equal(t.status, 'confirmed');
  assert(t.qr);
});
test('cancellation revokes QR and completes idempotent sandbox refunds', async () => {
  const e = await event({ priceMinor: 1200 }),
    b = (await book(e)).json();
  await call('POST', `/bookings/${b.id}/checkout`, userToken, {});
  assert.equal(
    (await call('POST', `/sandbox/checkout/${b.id}/pay`, userToken, {})).statusCode,
    200,
  );
  const r = await call('POST', `/bookings/${b.id}/cancel`, userToken, {});
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().status, 'refund_pending');
  await processRefunds();
  const t = (await call('GET', `/bookings/${b.id}`, userToken)).json();
  assert.equal(t.status, 'refunded');
  assert.equal(t.qr, null);
  await processRefunds();
  assert.equal((await db.query('SELECT * FROM refunds WHERE booking_id=$1', [b.id])).length, 1);
});
test('late successful payments trigger refunds and cannot steal a released spot', async () => {
  const e = await event({ priceMinor: 500, capacity: 1 }),
    b = (await book(e)).json();
  const p = (await call('POST', `/bookings/${b.id}/checkout`, userToken, {})).json();
  await db.query(`UPDATE bookings SET expires_at=now()-interval '1 minute' WHERE id=$1`, [b.id]);
  const next = await book(e, organizerToken);
  assert.equal(next.statusCode, 200, next.body);
  const result = await settle('sandbox', {
    id: id(),
    bookingId: b.id,
    reference: p.provider_reference,
    amount: b.total_minor,
    currency: 'USD',
    paid: true,
  });
  assert(result.refundPending);
  await processRefunds();
  assert.equal((await call('GET', `/bookings/${b.id}`, userToken)).json().qr, null);
});
test('private profiles do not leak on attendance lists or leaderboards', async () => {
  await db.query(`UPDATE profiles SET visibility='private' WHERE user_id=$1`, [userId]);
  const board = await call('GET', '/leaderboard?period=all', organizerToken);
  assert.equal(board.statusCode, 200, board.body);
  assert(!board.json().rows.some((r: any) => r.id === userId));
  const p = (await call('GET', `/profiles/${userId}`, organizerToken)).json();
  assert.equal(p.xp, undefined);
  const e = await event();
  await book(e);
  const eventResult = (await call('GET', `/events/${e}`, organizerToken)).json();
  assert(!eventResult.attendees.some((a: any) => a.id === userId));
  await db.query(`UPDATE profiles SET visibility='public' WHERE user_id=$1`, [userId]);
});
test('leaderboard equals authoritative ledger and includes current user position', async () => {
  for (const scope of ['global', 'friends', 'city', 'country']) {
    const r = await call('GET', `/leaderboard?period=all&scope=${scope}`, userToken);
    assert.equal(r.statusCode, 200, `${scope}: ${r.body}`);
    assert(r.json().me);
  }
  const r = (await call('GET', '/leaderboard?period=all&limit=1', userToken)).json();
  const [sum] = await db.query('SELECT sum(points)::int xp FROM xp_transactions WHERE user_id=$1', [
    userId,
  ]);
  assert.equal(Number(r.me.score), sum.xp);
  assert(r.rows.every((row: any) => row.display_name && !row.community_id));
});
test('challenge joins use verified historical progress and never double reward', async () => {
  const [challenge] = await db.query('SELECT * FROM challenges LIMIT 1');
  await call('POST', `/challenges/${challenge.id}/join`, userToken, {});
  await call('POST', `/challenges/${challenge.id}/join`, userToken, {});
  assert(
    (
      await db.query(
        `SELECT * FROM xp_transactions WHERE user_id=$1 AND source_type='challenge' AND source_id=$2`,
        [userId, challenge.id],
      )
    ).length <= 1,
  );
});
test('organizer approval grants access only through an audited admin decision', async () => {
  const member = await login('member3@pace.local');
  const body = {
    name: 'Approved Test Crew',
    category: 'running',
    description: 'A welcoming local running community with experienced hosts.',
    cityId,
    contactEmail: 'crew@pace.local',
    phone: '+96171123456',
    verificationInfo: 'Experienced local group with references supplied for review.',
  };
  const a = await call('POST', '/organizer/apply', member.token, body);
  assert.equal(a.statusCode, 200, a.body);
  assert.equal((await call('GET', '/organizer/overview', member.token)).statusCode, 403);
  assert.equal(
    (
      await call('POST', `/admin/applications/${a.json().id}/review`, member.token, {
        status: 'approved',
        note: 'I approve myself',
      })
    ).statusCode,
    403,
  );
  const approved = await call('POST', `/admin/applications/${a.json().id}/review`, adminToken, {
    status: 'approved',
    note: 'References and identity verified by reviewer',
  });
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal((await call('GET', '/organizer/overview', member.token)).statusCode, 200);
  const mine = (await call('GET', '/organizer/overview', member.token)).json();
  assert.equal(mine.communities.length, 1);
});
test('organizer cannot change another organization event', async () => {
  const other = await login('member3@pace.local');
  const e = await event();
  assert.equal((await call('GET', `/organizer/events/${e}/bookings`, other.token)).statusCode, 403);
});
test('fee changes are audited and do not alter existing reservation prices', async () => {
  const e = await event({ priceMinor: 2000 }),
    b = (await book(e)).json();
  const [fee] = await db.query(`SELECT * FROM platform_fee_rules WHERE currency='USD'`);
  const change = await call('PUT', '/admin/config/fees', adminToken, {
    id: fee.id,
    country_code: 'LB',
    currency: 'USD',
    fixed_minor: 200,
    basis_points: 1000,
    enabled: true,
  });
  assert.equal(change.statusCode, 200, change.body);
  const current = (await call('GET', `/bookings/${b.id}`, userToken)).json();
  assert.equal(current.total_minor, b.total_minor);
  assert((await db.query(`SELECT * FROM audit_logs WHERE action='config.updated'`)).length > 0);
});
test('untrusted origins and invalid webhook signatures are rejected', async () => {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { origin: 'https://evil.example' },
    payload: { email: 'alex@pace.local', password: process.env.SEED_PASSWORD },
  });
  assert.equal(r.statusCode, 403);
  process.env.GATEWAY_WEBHOOK_SECRET = 'gateway-test-secret';
  const payload = JSON.stringify({
    id: 'gateway-event',
    reference: 'ref',
    bookingId: id(),
    amount: 100,
    currency: 'USD',
    paid: true,
  });
  const bad = await app.inject({
    method: 'POST',
    url: '/webhooks/gateway',
    headers: { 'content-type': 'application/json', 'x-gateway-signature': 't=0,v1=bad' },
    payload,
  });
  assert.equal(bad.statusCode, 400, bad.body);
});
test('profile, notification, organizer and admin screens have working API data', async () => {
  for (const [url, token] of [
    [`/profiles/${userId}`, userToken],
    ['/notifications', userToken],
    ['/organizer/overview', organizerToken],
    ['/admin/overview', adminToken],
    ['/admin/data/applications', adminToken],
    ['/admin/data/audit', adminToken],
    ['/events?friends=true', userToken],
  ]) {
    const r = await call('GET', url, token);
    assert.equal(r.statusCode, 200, `${url}: ${r.body}`);
  }
});
test('reset token is one-use and revokes existing sessions', async () => {
  const member = await login('member4@pace.local');
  const r = await call('POST', '/auth/forgot', undefined, { email: 'member4@pace.local' });
  assert.equal(r.statusCode, 200);
  const [mail] = await db.query(
    `SELECT payload FROM notification_outbox WHERE kind='email' AND payload->>'to'='member4@pace.local' AND payload->>'subject'='Reset your CRW+ password' ORDER BY created_at DESC LIMIT 1`,
  );
  const token = new URL(mail.payload.text.match(/https?:\/\/\S+reset=\S+/)[0]).searchParams.get(
    'reset',
  );
  const reset = await call('POST', '/auth/reset', undefined, {
    token,
    password: 'Another-secure-password-123',
  });
  assert.equal(reset.statusCode, 200, reset.body);
  assert.equal((await call('GET', '/auth/me', member.token)).statusCode, 401);
  assert.equal(
    (
      await call('POST', '/auth/reset', undefined, {
        token,
        password: 'Another-secure-password-123',
      })
    ).statusCode,
    400,
  );
});
test('signed development uploads enforce ownership, content type, size and single use', async () => {
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile('public/demo/avatar-12.jpg');
  const r = await call('POST', '/uploads/presign', userToken, {
    contentType: 'image/jpeg',
    size: bytes.length,
    purpose: 'avatar',
  });
  assert.equal(r.statusCode, 200, r.body);
  const upload = r.json(),
    url = new URL(upload.uploadUrl);
  const path = url.pathname + url.search;
  const bad = await app.inject({
    method: 'PUT',
    url: path,
    headers: { 'content-type': 'image/jpeg' },
    payload: Buffer.from('not-an-image'),
  });
  assert.equal(bad.statusCode, 400, bad.body);
  const good = await app.inject({
    method: 'PUT',
    url: path,
    headers: { 'content-type': 'image/jpeg' },
    payload: bytes,
  });
  assert.equal(good.statusCode, 200, good.body);
  const again = await app.inject({
    method: 'PUT',
    url: path,
    headers: { 'content-type': 'image/jpeg' },
    payload: bytes,
  });
  assert.equal(again.statusCode, 403);
  assert.equal(
    (
      await call('POST', '/uploads/presign', userToken, {
        contentType: 'image/svg+xml',
        size: 50,
        purpose: 'avatar',
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call('POST', '/uploads/presign', userToken, {
        contentType: 'image/jpeg',
        size: 50,
        purpose: 'event',
      })
    ).statusCode,
    403,
  );
  const media = await call('GET', new URL(upload.mediaUrl).pathname);
  assert.equal(media.statusCode, 200);
});
test('payouts only assign settled eligible proceeds once and block unsafe refunds', async () => {
  const e = await event({ priceMinor: 1800 }),
    b = (await book(e)).json();
  await call('POST', `/bookings/${b.id}/checkout`, userToken, {});
  await call('POST', `/sandbox/checkout/${b.id}/pay`, userToken, {});
  await db.query(
    `UPDATE events SET starts_at=now()-interval '10 days',ends_at=now()-interval '9 days' WHERE id=$1`,
    [e],
  );
  const payout = await call('POST', '/admin/payouts', adminToken, { communityId, currency: 'USD' });
  assert.equal(payout.statusCode, 200, payout.body);
  assert.equal(payout.json().amount_minor, 1800);
  const repeated = await call('POST', '/admin/payouts', adminToken, {
    communityId,
    currency: 'USD',
  });
  assert.equal(repeated.statusCode, 409);
  const refund = await call('POST', `/organizer/bookings/${b.id}/refund`, organizerToken, {});
  assert.equal(refund.statusCode, 409);
  const transfer = await call(
    'POST',
    `/admin/payouts/${payout.json().id}/record-transfer`,
    adminToken,
    { reference: 'TEST-BANK-REFERENCE-001' },
  );
  assert.equal(transfer.statusCode, 200, transfer.body);
  assert.equal(
    (
      await call('POST', `/admin/payouts/${payout.json().id}/record-transfer`, adminToken, {
        reference: 'TEST-BANK-REFERENCE-001',
      })
    ).statusCode,
    409,
  );
});
test('workers create real scope snapshots and finalize seasons idempotently', async () => {
  const { runJobs } = await import('../src/worker.js');
  await db.query(`UPDATE notification_outbox SET status='sent'`);
  const seasonId = id();
  await db.query(
    `INSERT INTO seasons(id,name,starts_at,ends_at) VALUES($1,'Completed test season',now()-interval '2 days',now()-interval '1 day')`,
    [seasonId],
  );
  await runJobs();
  await runJobs();
  const [season] = await db.query('SELECT finalized_at FROM seasons WHERE id=$1', [seasonId]);
  assert(season.finalized_at);
  assert.equal(
    (
      await db.query(`SELECT * FROM audit_logs WHERE action='season.finalized' AND target_id=$1`, [
        seasonId,
      ])
    ).length,
    1,
  );
  assert(
    (await db.query(`SELECT * FROM leaderboard_snapshots WHERE scope LIKE 'city:%'`)).length > 0,
  );
});
