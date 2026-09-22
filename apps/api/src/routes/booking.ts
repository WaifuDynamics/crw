import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { config } from '../config.js';
import {
  authenticated,
  organizer,
  requireValue,
  uuid,
  hash,
  id,
  ticketToken,
} from '../security.js';
import { pathId } from './discovery.js';
import { reserve, checkout, settle, cancelBooking } from '../bookings.js';
import { providerByName } from '../payments.js';
import { updateRewards } from '../competition.js';
export async function bookingRoutes(app: FastifyInstance) {
  app.post('/bookings', async (req) => {
    const u = await authenticated(req, true);
    const b = z.object({ eventId: uuid }).parse(req.body);
    const key = z.string().min(8).max(100).parse(req.headers['idempotency-key']);
    return reserve(u.id, b.eventId, key);
  });
  app.get('/bookings', async (req) => {
    const u = await authenticated(req);
    return db.query(
      `SELECT b.*,e.title,e.cover_url,e.starts_at,e.location_name,ci.timezone FROM bookings b JOIN events e ON e.id=b.event_id JOIN cities ci ON ci.id=e.city_id WHERE b.user_id=$1 ORDER BY b.created_at DESC LIMIT 100`,
      [u.id],
    );
  });
  app.get('/bookings/:id', async (req) => {
    const u = await authenticated(req);
    const [b] = await db.query(
      `SELECT b.*,e.title,e.cover_url,e.starts_at,e.location_name,ci.timezone,p.display_name,t.id ticket_id,t.revoked_at,(SELECT created_at FROM checkins WHERE ticket_id=t.id) checked_in_at FROM bookings b JOIN events e ON e.id=b.event_id JOIN cities ci ON ci.id=e.city_id JOIN profiles p ON p.user_id=b.user_id LEFT JOIN tickets t ON t.booking_id=b.id WHERE b.id=$1 AND b.user_id=$2`,
      [pathId(req), u.id],
    );
    requireValue(b, 404, 'Booking not found');
    b.qr =
      b.ticket_id && !b.revoked_at && b.status === 'confirmed'
        ? ticketToken(b.ticket_id, b.id, b.user_id, b.event_id)
        : null;
    b.items = await db.query(
      'SELECT description,amount_minor,kind FROM booking_items WHERE booking_id=$1',
      [b.id],
    );
    b.payment =
      (
        await db.query(
          'SELECT provider,status,amount_minor,currency FROM payments WHERE booking_id=$1',
          [b.id],
        )
      )[0] || null;
    return b;
  });
  app.post('/bookings/:id/checkout', async (req) => {
    const u = await authenticated(req, true);
    return checkout(u.id, pathId(req));
  });
  app.post('/bookings/:id/cancel', async (req) => {
    const u = await authenticated(req);
    return cancelBooking(u.id, pathId(req));
  });
  app.post('/organizer/checkin', async (req) => {
    const u = await organizer(req);
    const { token } = z.object({ token: z.string().min(60).max(300) }).parse(req.body);
    return tx(async (c) => {
      const [t] = await c.query(
        `SELECT t.*,b.user_id,b.event_id,b.status,e.community_id,e.starts_at,e.ends_at,e.status event_status,p.display_name FROM tickets t JOIN bookings b ON b.id=t.booking_id JOIN events e ON e.id=b.event_id JOIN profiles p ON p.user_id=b.user_id WHERE t.token_hash=$1 FOR UPDATE OF t`,
        [hash(token)],
      );
      requireValue(
        t &&
          !t.revoked_at &&
          t.status === 'confirmed' &&
          ['published', 'completed'].includes(t.event_status),
        400,
        'Ticket is invalid or cancelled',
      );
      if (!u.roles.includes('ADMIN'))
        requireValue(
          (
            await c.query(
              `SELECT 1 FROM organizer_members m JOIN communities co ON co.id=m.community_id WHERE m.user_id=$1 AND m.community_id=$2 AND co.verified AND co.status='active'`,
              [u.id, t.community_id],
            )
          ).length,
          403,
          'This ticket belongs to another organizer',
        );
      requireValue(
        Date.now() >= new Date(t.starts_at).getTime() - 2 * 3600000 &&
          Date.now() <= new Date(t.ends_at).getTime() + 4 * 3600000,
        409,
        'Check-in opens 2 hours before and closes 4 hours after the activity',
      );
      const check = await c.query(
        'INSERT INTO checkins(id,ticket_id,event_id,user_id,checked_in_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(ticket_id) DO NOTHING RETURNING *',
        [id(), t.id, t.event_id, t.user_id, u.id],
      );
      requireValue(check.length, 409, 'This ticket has already been checked in');
      await updateRewards(c, t.user_id, t.event_id);
      const [rule] = await c.query(
        `SELECT points FROM xp_rules WHERE source='attendance' AND enabled`,
      );
      return { ok: true, name: t.display_name, xp: rule?.points || 0 };
    });
  });
  app.register(async (webhook) => {
    webhook.removeContentTypeParser('application/json');
    webhook.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) =>
      done(null, body),
    );
    webhook.post('/webhooks/:provider', async (req, reply) => {
      const name = z.enum(['stripe', 'gateway']).parse((req.params as any).provider);
      try {
        const event = await providerByName(name).webhook(
          String(req.body),
          String(req.headers[name === 'stripe' ? 'stripe-signature' : 'x-gateway-signature'] || ''),
        );
        return await settle(name, event);
      } catch (e: any) {
        if (e.statusCode === 422) return reply.code(200).send({ ignored: true });
        throw e;
      }
    });
  });
  if (!config.production) {
    app.get('/sandbox/checkout/:id', async (req, reply) => {
      const u = await authenticated(req);
      const [b] = await db.query(
        `SELECT b.* FROM bookings b JOIN payments p ON p.booking_id=b.id WHERE b.id=$1 AND b.user_id=$2 AND p.provider='sandbox'`,
        [pathId(req), u.id],
      );
      requireValue(b, 404, 'Sandbox booking not found');
      return reply
        .type('text/html')
        .send(
          `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRW+ development checkout</title><body style="background:#080808;color:white;font:18px system-ui;max-width:420px;margin:80px auto;padding:24px"><h1>CRW+ / SANDBOX</h1><p>Development payment. No money is charged.</p><p>${b.total_minor / 100} ${b.currency}</p><form method="POST" action="/sandbox/checkout/${b.id}/pay"><input type="hidden" name="confirm" value="yes"><button style="padding:18px;background:#168bff;border:0;color:white;border-radius:12px;font-size:18px">Complete sandbox payment</button></form><p>Close this window and refresh your ticket after payment.</p></body></html>`,
        );
    });
    app.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))),
    );
    app.post('/sandbox/checkout/:id/pay', async (req, reply) => {
      const u = await authenticated(req);
      const [b] = await db.query(
        `SELECT b.*,p.provider_reference FROM bookings b JOIN payments p ON p.booking_id=b.id WHERE b.id=$1 AND b.user_id=$2 AND p.provider='sandbox'`,
        [pathId(req), u.id],
      );
      requireValue(b, 404, 'Booking not found');
      const result = await settle('sandbox', {
        id: `sandbox-paid-${b.id}`,
        bookingId: b.id,
        reference: b.provider_reference,
        amount: b.total_minor,
        currency: b.currency,
        paid: true,
      });
      if (req.headers.accept?.includes('text/html'))
        return reply.redirect(`${config.appUrl}/?booking=${b.id}`);
      return result;
    });
  }
}
