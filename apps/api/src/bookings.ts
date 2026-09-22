import { db, tx, type DB } from './db.js';
import { id, hash, ticketToken, requireValue, audit } from './security.js';
import { notify, email } from './notifications.js';
import { providerForCountry, providerByName, type ProviderEvent } from './payments.js';
import { bookingConfirmed } from './emails.js';
import { eventTime, formatMoney } from './marketing.js';
export async function issueTicket(c: DB, booking: any) {
  const ticketId = id();
  const token = ticketToken(ticketId, booking.id, booking.user_id, booking.event_id);
  await c.query(
    `INSERT INTO tickets(id,booking_id,token_hash) VALUES($1,$2,$3) ON CONFLICT(booking_id) DO NOTHING`,
    [ticketId, booking.id, hash(token)],
  );
  await notify(
    c,
    booking.user_id,
    "You're on the list",
    'Your CRW+ ticket is ready. See you out there.',
    `booking/${booking.id}`,
  );
  const [user] = await c.query('SELECT email FROM users WHERE id=$1', [booking.user_id]);
  const [event] = await c.query(
    `SELECT e.title, e.starts_at, e.location_name, ci.name city, ci.timezone
     FROM events e JOIN cities ci ON ci.id=e.city_id WHERE e.id=$1`,
    [booking.event_id],
  );
  await email(
    c,
    user.email,
    bookingConfirmed({
      bookingId: booking.id,
      title: event?.title || 'Your CRW+ activity',
      when: event ? eventTime(new Date(event.starts_at), event.timezone) : '',
      place: event ? `${event.location_name}, ${event.city}` : '',
      total: formatMoney(booking.total_minor, booking.currency),
    }),
  );
}
export async function reserve(userId: string, eventId: string, key: string) {
  return tx(async (c) => {
    const [existing] = await c.query(
      'SELECT * FROM bookings WHERE user_id=$1 AND idempotency_key=$2',
      [userId, key],
    );
    if (existing) {
      requireValue(
        existing.event_id === eventId,
        409,
        'Idempotency key already used for another event',
      );
      return existing;
    }
    const [e] = await c.query(
      `SELECT e.*,ci.country_code,co.verified,co.status community_status FROM events e JOIN cities ci ON ci.id=e.city_id JOIN communities co ON co.id=e.community_id WHERE e.id=$1 FOR UPDATE OF e`,
      [eventId],
    );
    requireValue(
      e && e.status === 'published' && e.verified && e.community_status === 'active',
      404,
      'Activity is unavailable',
    );
    requireValue(new Date(e.starts_at).getTime() > Date.now(), 409, 'Bookings have closed');
    await c.query(
      `UPDATE bookings SET status='expired' WHERE event_id=$1 AND status='reserved' AND expires_at<=now()`,
      [eventId],
    );
    const [own] = await c.query(
      `SELECT * FROM bookings WHERE user_id=$1 AND event_id=$2 AND status IN ('reserved','confirmed')`,
      [userId, eventId],
    );
    if (own) return own;
    const [count] = await c.query(
      `SELECT count(*)::int value FROM bookings WHERE event_id=$1 AND (status='confirmed' OR (status='reserved' AND expires_at>now()))`,
      [eventId],
    );
    requireValue(count.value < e.capacity, 409, 'This activity is full');
    const [fee] = await c.query(
      'SELECT * FROM platform_fee_rules WHERE country_code=$1 AND currency=$2 AND enabled',
      [e.country_code, e.currency],
    );
    let feeMinor = 0;
    if (e.price_minor) {
      providerForCountry(e.country_code);
      requireValue(fee, 503, 'Pricing is not configured for this currency');
      feeMinor = fee.fixed_minor + Math.round((e.price_minor * fee.basis_points) / 10000);
    }
    const [booking] = await c.query(
      `INSERT INTO bookings(id,user_id,event_id,status,ticket_minor,fee_minor,total_minor,currency,idempotency_key,expires_at,confirmed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '35 minutes',CASE WHEN $4='confirmed' THEN now() END) RETURNING *`,
      [
        id(),
        userId,
        eventId,
        e.price_minor ? 'reserved' : 'confirmed',
        e.price_minor,
        feeMinor,
        e.price_minor + feeMinor,
        e.currency,
        key,
      ],
    );
    for (const [kind, amount] of [
      ['ticket', e.price_minor],
      ['service_fee', feeMinor],
    ])
      await c.query(
        'INSERT INTO booking_items(id,booking_id,description,amount_minor,kind) VALUES($1,$2,$3,$4,$5)',
        [id(), booking.id, kind === 'ticket' ? e.title : 'CRW+ service fee', amount, kind],
      );
    await c.query('INSERT INTO analytics_events(id,user_id,event_id,name) VALUES($1,$2,$3,$4)', [
      id(),
      userId,
      eventId,
      'checkout_started',
    ]);
    if (!e.price_minor) await issueTicket(c, booking);
    return booking;
  });
}
export async function checkout(userId: string, bookingId: string) {
  const [b] = await db.query(
    `SELECT b.*,e.title,c.country_code,u.email FROM bookings b JOIN events e ON e.id=b.event_id JOIN cities c ON c.id=e.city_id JOIN users u ON u.id=b.user_id WHERE b.id=$1 AND b.user_id=$2`,
    [bookingId, userId],
  );
  requireValue(b, 404, 'Booking not found');
  requireValue(
    b.status === 'reserved' && new Date(b.expires_at) > new Date(),
    409,
    'Reservation is no longer payable',
  );
  const provider = providerForCountry(b.country_code);
  await db.query(
    `INSERT INTO payments(id,booking_id,provider,amount_minor,currency,status) VALUES($1,$2,$3,$4,$5,'created') ON CONFLICT(booking_id) DO NOTHING`,
    [id(), b.id, provider.name, b.total_minor, b.currency],
  );
  const [payment] = await db.query('SELECT * FROM payments WHERE booking_id=$1', [b.id]);
  if (payment.checkout_url) return payment;
  const result = await providerByName(payment.provider).checkout({
    id: b.id,
    total_minor: b.total_minor,
    currency: b.currency,
    title: b.title,
    email: b.email,
    expires_at: new Date(b.expires_at).toISOString(),
  });
  const [updated] = await db.query(
    `UPDATE payments SET provider_reference=$2,checkout_url=$3,status='pending',updated_at=now() WHERE id=$1 AND status IN ('created','pending') RETURNING *`,
    [payment.id, result.reference, result.url],
  );
  return updated || payment;
}
export async function settle(provider: string, event: ProviderEvent) {
  return tx(async (c) => {
    const inserted = await c.query(
      'INSERT INTO webhook_events(provider,external_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING external_id',
      [provider, event.id],
    );
    if (!inserted.length) return { duplicate: true };
    const [lookup] = await c.query('SELECT event_id FROM bookings WHERE id=$1', [event.bookingId]);
    requireValue(lookup, 404, 'Unknown booking');
    const [e] = await c.query('SELECT * FROM events WHERE id=$1 FOR UPDATE', [lookup.event_id]);
    const [b] = await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [event.bookingId]);
    const [p] = await c.query('SELECT * FROM payments WHERE booking_id=$1 FOR UPDATE', [b.id]);
    requireValue(
      p &&
        p.provider === provider &&
        p.provider_reference === event.reference &&
        p.amount_minor === event.amount &&
        p.currency === event.currency,
      400,
      'Payment verification mismatch',
    );
    if (!event.paid) return { pending: true };
    if (p.status === 'paid' || p.status === 'refunded' || p.status === 'refund_pending')
      return { duplicate: true };
    if (
      b.status !== 'reserved' ||
      new Date(b.expires_at) <= new Date() ||
      e.status !== 'published'
    ) {
      await c.query(`UPDATE payments SET status='refund_pending',updated_at=now() WHERE id=$1`, [
        p.id,
      ]);
      await c.query(`UPDATE bookings SET status='refund_pending' WHERE id=$1`, [b.id]);
      await c.query(
        `INSERT INTO refunds(id,booking_id,payment_id,amount_minor,status,reason) VALUES($1,$2,$3,$4,'pending','Payment arrived after reservation closed') ON CONFLICT(booking_id) DO NOTHING`,
        [id(), b.id, p.id, p.amount_minor],
      );
      return { refundPending: true };
    }
    await c.query(`UPDATE payments SET status='paid',updated_at=now() WHERE id=$1`, [p.id]);
    await c.query(`UPDATE bookings SET status='confirmed',confirmed_at=now() WHERE id=$1`, [b.id]);
    await issueTicket(c, b);
    await audit(c, null, 'payment.confirmed', 'booking', b.id, {
      provider,
      amountMinor: p.amount_minor,
    });
    return { confirmed: true };
  });
}
export async function cancelBooking(userId: string, bookingId: string, staff = false) {
  return tx(async (c) => {
    const [lookup] = await c.query('SELECT event_id FROM bookings WHERE id=$1', [bookingId]);
    requireValue(lookup, 404, 'Booking not found');
    const [e] = await c.query('SELECT * FROM events WHERE id=$1 FOR UPDATE', [lookup.event_id]);
    const [b] = await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId]);
    requireValue(staff || b.user_id === userId, 403, 'This is not your booking');
    if (['cancelled', 'refunded', 'refund_pending', 'expired'].includes(b.status)) return b;
    requireValue(
      !(await c.query('SELECT 1 FROM payout_items WHERE booking_id=$1', [b.id])).length,
      409,
      'This booking is assigned to a payout. Finance must recover or release its settlement before refunding.',
    );
    const checked = await c.query('SELECT 1 FROM checkins WHERE event_id=$1 AND user_id=$2', [
      b.event_id,
      b.user_id,
    ]);
    requireValue(!checked.length, 409, 'Checked-in bookings cannot be cancelled');
    requireValue(
      staff ||
        b.status === 'reserved' ||
        Date.now() < new Date(e.starts_at).getTime() - e.cancellation_hours * 3600000,
      409,
      'The cancellation window has closed',
    );
    const [p] = await c.query('SELECT * FROM payments WHERE booking_id=$1', [b.id]);
    const refund = p?.status === 'paid';
    await c.query('UPDATE bookings SET status=$2,cancelled_at=now() WHERE id=$1', [
      b.id,
      refund ? 'refund_pending' : 'cancelled',
    ]);
    await c.query('UPDATE tickets SET revoked_at=now() WHERE booking_id=$1', [b.id]);
    if (refund) {
      await c.query(`UPDATE payments SET status='refund_pending' WHERE id=$1`, [p.id]);
      await c.query(
        `INSERT INTO refunds(id,booking_id,payment_id,amount_minor,status,reason) VALUES($1,$2,$3,$4,'pending','Booking cancellation') ON CONFLICT(booking_id) DO NOTHING`,
        [id(), b.id, p.id, p.amount_minor],
      );
    }
    await notify(
      c,
      b.user_id,
      'Booking cancelled',
      refund ? 'Your refund has been queued.' : 'Your place has been released.',
      `booking/${b.id}`,
    );
    await audit(c, userId, 'booking.cancelled', 'booking', b.id, { refund });
    return { ...b, status: refund ? 'refund_pending' : 'cancelled' };
  });
}
export async function processRefunds() {
  await db.query(
    `UPDATE refunds SET status='pending' WHERE status='processing' AND updated_at<now()-interval '10 minutes'`,
  );
  const jobs = await tx(async (c) => {
    const rows = await c.query(
      `SELECT r.*,p.provider,p.provider_reference payment_reference FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.status='pending' AND r.attempts<8 ORDER BY r.created_at FOR UPDATE OF r SKIP LOCKED LIMIT 10`,
    );
    for (const r of rows)
      await c.query(
        `UPDATE refunds SET status='processing',attempts=attempts+1,updated_at=now() WHERE id=$1`,
        [r.id],
      );
    return rows;
  });
  for (const job of jobs) {
    try {
      const result = await providerByName(job.provider).refund(
        job.payment_reference,
        job.amount_minor,
        `refund:${job.id}`,
      );
      await tx(async (c) => {
        await c.query(
          'UPDATE refunds SET status=$2,provider_reference=$3,attempts=0,last_error=NULL,updated_at=now() WHERE id=$1',
          [job.id, result.complete ? 'succeeded' : 'pending', result.reference],
        );
        if (result.complete) {
          await c.query(`UPDATE bookings SET status='refunded' WHERE id=$1`, [job.booking_id]);
          await c.query(`UPDATE payments SET status='refunded' WHERE id=$1`, [job.payment_id]);
          await audit(c, null, 'refund.succeeded', 'refund', job.id, {
            amountMinor: job.amount_minor,
          });
        }
      });
    } catch (e) {
      await db.query('UPDATE refunds SET status=$2,last_error=$3,updated_at=now() WHERE id=$1', [
        job.id,
        job.attempts >= 7 ? 'failed' : 'pending',
        String(e).slice(0, 500),
      ]);
    }
  }
}
