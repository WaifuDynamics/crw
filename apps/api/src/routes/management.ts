import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db, tx } from '../db.js';
import {
  authenticated,
  organizer,
  admin,
  uuid,
  id,
  hash,
  requireValue,
  audit,
  safeURL,
} from '../security.js';
import { config } from '../config.js';
import { pathId } from './discovery.js';
import { notify } from '../notifications.js';
import { award } from '../competition.js';
import { cancelBooking } from '../bookings.js';
export const eventInput = z
  .object({
    communityId: uuid,
    title: z.string().trim().min(3).max(120),
    description: z.string().min(20).max(10000),
    category: z.string().max(40),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'all']),
    cityId: uuid,
    locationName: z.string().min(3).max(200),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    capacity: z.number().int().min(1).max(100000),
    priceMinor: z.number().int().min(0).max(100000000),
    currency: z.string().length(3),
    coverUrl: safeURL.nullable(),
    tags: z.array(z.string().max(30)).max(10),
    requirements: z.string().max(3000),
    included: z.string().max(3000),
    safetyInfo: z.string().min(10).max(3000),
    cancellationHours: z.number().int().min(0).max(720),
    status: z.enum(['draft', 'published']),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), 'End time must follow start time');
const columns = [
  'community_id',
  'title',
  'description',
  'category',
  'difficulty',
  'city_id',
  'location_name',
  'latitude',
  'longitude',
  'starts_at',
  'ends_at',
  'capacity',
  'price_minor',
  'currency',
  'cover_url',
  'tags',
  'requirements',
  'included',
  'safety_info',
  'cancellation_hours',
  'status',
];
function eventValues(b: z.infer<typeof eventInput>) {
  return [
    b.communityId,
    b.title,
    b.description,
    b.category,
    b.difficulty,
    b.cityId,
    b.locationName,
    b.latitude,
    b.longitude,
    b.startsAt,
    b.endsAt,
    b.capacity,
    b.priceMinor,
    b.currency,
    b.coverUrl,
    b.tags,
    b.requirements,
    b.included,
    b.safetyInfo,
    b.cancellationHours,
    b.status,
  ];
}
export async function managementRoutes(app: FastifyInstance) {
  app.patch('/organizer/communities/:id', async (req) => {
    const communityId = pathId(req);
    const u = await organizer(req, communityId);
    const b = z
      .object({
        name: z.string().min(3).max(120),
        description: z.string().min(20).max(5000),
        coverUrl: safeURL.nullable(),
        logoUrl: safeURL.nullable(),
      })
      .parse(req.body);
    await tx(async (c) => {
      await c.query(
        'UPDATE communities SET name=$2,description=$3,cover_url=$4,logo_url=$5 WHERE id=$1',
        [communityId, b.name, b.description, b.coverUrl, b.logoUrl],
      );
      await audit(c, u.id, 'community.updated', 'community', communityId);
    });
    return { ok: true };
  });
  app.post('/organizer/events/:id/media', async (req) => {
    const eventId = pathId(req);
    const [e] = await db.query('SELECT community_id FROM events WHERE id=$1', [eventId]);
    requireValue(e, 404, 'Event not found');
    const u = await organizer(req, e.community_id);
    const b = z.object({ url: safeURL, position: z.number().int().min(0).max(20) }).parse(req.body);
    const mediaId = id();
    await db.query(
      `INSERT INTO event_media(id,event_id,url,kind,position) VALUES($1,$2,$3,'image',$4)`,
      [mediaId, eventId, b.url, b.position],
    );
    return { id: mediaId };
  });
  app.get('/organizer/application', async (req) => {
    const u = await authenticated(req);
    return (
      (
        await db.query(
          'SELECT * FROM organizer_applications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
          [u.id],
        )
      )[0] || null
    );
  });
  app.post('/organizer/apply', async (req) => {
    const u = await authenticated(req, true);
    const b = z
      .object({
        name: z.string().trim().min(3).max(120),
        category: z.string().max(40),
        description: z.string().min(30).max(5000),
        cityId: uuid,
        contactEmail: z.email(),
        phone: z.string().min(6).max(30),
        socialUrl: safeURL.optional(),
        verificationInfo: z.string().min(20).max(5000),
        draft: z.boolean().default(false),
      })
      .parse(req.body);
    const applicationId = id();
    await db.query(
      'INSERT INTO organizer_applications(id,user_id,name,category,description,city_id,contact_email,phone,social_url,verification_info,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [
        applicationId,
        u.id,
        b.name,
        b.category,
        b.description,
        b.cityId,
        b.contactEmail,
        b.phone,
        b.socialUrl || null,
        b.verificationInfo,
        b.draft ? 'draft' : 'submitted',
      ],
    );
    return { id: applicationId, status: b.draft ? 'draft' : 'submitted' };
  });
  app.get('/organizer/overview', async (req) => {
    const u = await organizer(req);
    const communities = await db.query(
      `SELECT c.* FROM communities c JOIN organizer_members m ON m.community_id=c.id WHERE m.user_id=$1 AND c.verified AND c.status='active'`,
      [u.id],
    );
    const events = await db.query(
      `SELECT e.*,(SELECT count(*)::int FROM bookings b WHERE b.event_id=e.id AND b.status='confirmed') booked,(SELECT count(*)::int FROM checkins ch WHERE ch.event_id=e.id) checked_in,(SELECT count(*)::int FROM analytics_events a WHERE a.event_id=e.id AND a.name='event_view') views FROM events e JOIN organizer_members m ON m.community_id=e.community_id WHERE m.user_id=$1 ORDER BY e.starts_at DESC`,
      [u.id],
    );
    const earnings = await db.query(
      `SELECT b.currency,COALESCE(sum(b.total_minor),0)::bigint gross,COALESCE(sum(b.fee_minor),0)::bigint fees,COALESCE(sum(b.ticket_minor),0)::bigint net FROM bookings b JOIN events e ON e.id=b.event_id JOIN organizer_members m ON m.community_id=e.community_id WHERE m.user_id=$1 AND b.status='confirmed' GROUP BY b.currency`,
      [u.id],
    );
    const payouts = await db.query(
      'SELECT p.* FROM payouts p JOIN organizer_members m ON m.community_id=p.community_id WHERE m.user_id=$1 ORDER BY p.created_at DESC',
      [u.id],
    );
    return { communities, events, earnings, payouts };
  });
  app.post('/organizer/events', async (req) => {
    const b = eventInput.parse(req.body);
    const u = await organizer(req, b.communityId);
    requireValue(new Date(b.startsAt) > new Date(), 400, 'Choose a future start time');
    const eventId = id();
    await tx(async (c) => {
      await c.query(
        `INSERT INTO events(id,created_by,${columns.join(',')}) VALUES(${Array.from({ length: 23 }, (_, i) => `$${i + 1}`).join(',')})`,
        [eventId, u.id, ...eventValues(b)],
      );
      await audit(c, u.id, 'event.created', 'event', eventId);
    });
    return { id: eventId };
  });
  app.patch('/organizer/events/:id', async (req) => {
    const b = eventInput.parse(req.body);
    const u = await organizer(req, b.communityId);
    const eventId = pathId(req);
    const [old] = await db.query('SELECT * FROM events WHERE id=$1', [eventId]);
    requireValue(old, 404, 'Event not found');
    await organizer(req, old.community_id);
    return tx(async (c) => {
      const [e] = await c.query('SELECT * FROM events WHERE id=$1 FOR UPDATE', [eventId]);
      requireValue(['draft', 'published'].includes(e.status), 409, 'This event is closed');
      const [count] = await c.query(
        `SELECT count(*)::int value FROM bookings WHERE event_id=$1 AND (status='confirmed' OR(status='reserved' AND expires_at>now()))`,
        [eventId],
      );
      requireValue(b.capacity >= count.value, 409, 'Capacity cannot be below active bookings');
      if (count.value) {
        requireValue(
          b.communityId === e.community_id &&
            b.priceMinor === e.price_minor &&
            b.currency === e.currency &&
            b.startsAt === new Date(e.starts_at).toISOString() &&
            b.status === 'published' &&
            b.cancellationHours === e.cancellation_hours,
          409,
          'With active bookings, price, start time, ownership, publishing status and cancellation policy are locked',
        );
      }
      await c.query(
        `UPDATE events SET ${columns.map((v, i) => `${v}=$${i + 2}`).join(',')},updated_at=now() WHERE id=$1`,
        [eventId, ...eventValues(b)],
      );
      await audit(c, u.id, 'event.updated', 'event', eventId);
      return { ok: true };
    });
  });
  app.post('/organizer/events/:id/cancel', async (req) => {
    const eventId = pathId(req);
    const [e] = await db.query('SELECT community_id FROM events WHERE id=$1', [eventId]);
    requireValue(e, 404, 'Event not found');
    const u = await organizer(req, e.community_id);
    await tx(async (c) => {
      await c.query(`UPDATE events SET status='cancelled',updated_at=now() WHERE id=$1`, [eventId]);
      await audit(c, u.id, 'event.cancelled', 'event', eventId);
    });
    const bookings = await db.query(
      `SELECT id FROM bookings WHERE event_id=$1 AND status IN ('reserved','confirmed')`,
      [eventId],
    );
    for (const b of bookings) await cancelBooking(u.id, b.id, true);
    return { ok: true };
  });
  app.get('/organizer/events/:id/bookings', async (req) => {
    const eventId = pathId(req);
    const [e] = await db.query('SELECT community_id FROM events WHERE id=$1', [eventId]);
    requireValue(e, 404, 'Event not found');
    await organizer(req, e.community_id);
    return db.query(
      `SELECT b.id,b.status,b.ticket_minor,b.fee_minor,b.total_minor,b.currency,p.display_name,p.avatar_url,ch.created_at checked_in_at FROM bookings b JOIN profiles p ON p.user_id=b.user_id LEFT JOIN checkins ch ON ch.event_id=b.event_id AND ch.user_id=b.user_id WHERE b.event_id=$1 ORDER BY b.created_at`,
      [eventId],
    );
  });
  app.post('/organizer/bookings/:id/refund', async (req) => {
    const bookingId = pathId(req);
    const [e] = await db.query(
      'SELECT e.community_id FROM bookings b JOIN events e ON e.id=b.event_id WHERE b.id=$1',
      [bookingId],
    );
    requireValue(e, 404, 'Booking not found');
    const u = await organizer(req, e.community_id);
    return cancelBooking(u.id, bookingId, true);
  });
  app.post('/organizer/events/:id/announce', async (req) => {
    const eventId = pathId(req);
    const [e] = await db.query('SELECT community_id,title FROM events WHERE id=$1', [eventId]);
    requireValue(e, 404, 'Event not found');
    const u = await organizer(req, e.community_id);
    const { message } = z.object({ message: z.string().min(5).max(2000) }).parse(req.body);
    await tx(async (c) => {
      for (const b of await c.query(
        `SELECT user_id FROM bookings WHERE event_id=$1 AND status='confirmed'`,
        [eventId],
      ))
        await notify(c, b.user_id, e.title, message, `event/${eventId}`);
      await audit(c, u.id, 'event.announced', 'event', eventId);
    });
    return { ok: true };
  });
  app.post('/uploads/presign', async (req) => {
    const u = await authenticated(req, true);
    const b = z
      .object({
        contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        size: z
          .number()
          .int()
          .positive()
          .max(8 * 1024 * 1024),
        purpose: z.enum(['avatar', 'event', 'community']),
      })
      .parse(req.body);
    if (b.purpose !== 'avatar') await organizer(req);
    const uploadId = id();
    if (!config.production && !process.env.S3_BUCKET) {
      const key = `${uploadId}.${b.contentType.split('/')[1]}`,
        token = randomBytes(32).toString('base64url');
      await db.query(
        `INSERT INTO media_uploads(id,user_id,storage_key,content_type,expected_size,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '5 minutes')`,
        [uploadId, u.id, key, b.contentType, b.size, hash(token)],
      );
      return {
        uploadUrl: `${config.apiUrl}/uploads/local/${uploadId}?token=${token}`,
        key,
        mediaUrl: `${config.apiUrl}/media/local/${key}`,
        expiresIn: 300,
      };
    }
    requireValue(
      process.env.S3_BUCKET && process.env.S3_REGION,
      503,
      'Media storage is not configured. Set S3_BUCKET and S3_REGION.',
    );
    const key = `${b.purpose}/${u.id}/${uploadId}.${b.contentType.split('/')[1]}`;
    const client = new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: !!process.env.S3_ENDPOINT,
    });
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ContentType: b.contentType,
        ContentLength: b.size,
        Metadata: { owner: u.id },
      }),
      { expiresIn: 300 },
    );
    const publicBase = process.env.MEDIA_PUBLIC_URL;
    requireValue(publicBase, 503, 'Set MEDIA_PUBLIC_URL to your media CDN');
    await db.query(
      `INSERT INTO media_uploads(id,user_id,storage_key,content_type,expected_size,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '5 minutes')`,
      [uploadId, u.id, key, b.contentType, b.size],
    );
    return { uploadUrl: url, key, mediaUrl: `${publicBase}/${key}`, expiresIn: 300 };
  });
  app.get('/admin/overview', async (req) => {
    await admin(req);
    const [counts] = await db.query(
      `SELECT (SELECT count(*)::int FROM users WHERE status='active') users,(SELECT count(*)::int FROM communities WHERE verified AND status='active') organizers,(SELECT count(*)::int FROM organizer_applications WHERE status IN ('submitted','under_review')) applications,(SELECT count(*)::int FROM bookings WHERE status='confirmed') bookings,(SELECT count(*)::int FROM reports WHERE status='open') reports`,
    );
    return {
      ...counts,
      revenue: await db.query(
        `SELECT currency,sum(total_minor)::bigint gross,sum(fee_minor)::bigint fees,sum(ticket_minor)::bigint organizer_earnings FROM bookings WHERE status='confirmed' GROUP BY currency`,
      ),
    };
  });
  const tables: Record<string, { table: string; select?: string }> = {
    users: { table: 'users', select: 'id,email,status,email_verified_at,created_at' },
    applications: { table: 'organizer_applications' },
    communities: { table: 'communities' },
    events: { table: 'events' },
    bookings: { table: 'bookings' },
    payments: { table: 'payments' },
    refunds: { table: 'refunds' },
    payouts: { table: 'payouts' },
    categories: { table: 'event_categories' },
    cities: { table: 'cities' },
    countries: { table: 'countries' },
    currencies: { table: 'currencies' },
    fees: { table: 'platform_fee_rules' },
    challenges: { table: 'challenges' },
    achievements: { table: 'achievements' },
    seasons: { table: 'seasons' },
    reports: { table: 'reports' },
    audit: { table: 'audit_logs' },
    xp: { table: 'xp_transactions' },
    xp_rules: { table: 'xp_rules' },
    notifications: { table: 'notification_outbox' },
  };
  app.get('/admin/data/:resource', async (req) => {
    await admin(req);
    const resource = z.string().parse((req.params as any).resource);
    const table = tables[resource];
    requireValue(table, 404, 'Unknown resource');
    const q = z.object({ offset: z.coerce.number().int().min(0).default(0) }).parse(req.query);
    return db.query(
      `SELECT ${table.select || '*'} FROM ${table.table} ORDER BY 1 LIMIT 100 OFFSET $1`,
      [q.offset],
    );
  });
  app.post('/admin/applications/:id/review', async (req) => {
    const u = await admin(req);
    const applicationId = pathId(req);
    const b = z
      .object({
        status: z.enum(['under_review', 'approved', 'rejected', 'suspended']),
        note: z.string().min(5).max(2000),
      })
      .parse(req.body);
    return tx(async (c) => {
      const [a] = await c.query('SELECT * FROM organizer_applications WHERE id=$1 FOR UPDATE', [
        applicationId,
      ]);
      requireValue(a, 404, 'Application not found');
      requireValue(!['rejected', 'draft'].includes(a.status), 409, 'Application is not reviewable');
      if (a.status === 'approved')
        requireValue(b.status === 'suspended', 409, 'Approved applications can only be suspended');
      await c.query(
        'UPDATE organizer_applications SET status=$2,review_note=$3,reviewed_by=$4,updated_at=now() WHERE id=$1',
        [a.id, b.status, b.note, u.id],
      );
      if (b.status === 'approved') {
        await c.query(
          `INSERT INTO user_roles(user_id,role) VALUES($1,'ORGANIZER') ON CONFLICT DO NOTHING`,
          [a.user_id],
        );
        await c.query(
          `INSERT INTO communities(id,name,description,city_id,category,verified,application_id) VALUES($1,$2,$3,$4,$5,true,$6) ON CONFLICT(application_id) DO UPDATE SET verified=true,status='active'`,
          [id(), a.name, a.description, a.city_id, a.category, a.id],
        );
        const [co] = await c.query('SELECT id FROM communities WHERE application_id=$1', [a.id]);
        await c.query(
          'INSERT INTO organizer_members(community_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [co.id, a.user_id],
        );
      }
      if (b.status === 'suspended') {
        await c.query(
          `UPDATE communities SET verified=false,status='suspended' WHERE application_id=$1`,
          [a.id],
        );
        await c.query(
          `DELETE FROM user_roles WHERE user_id=$1 AND role='ORGANIZER' AND NOT EXISTS(SELECT 1 FROM organizer_members m JOIN communities co ON co.id=m.community_id WHERE m.user_id=$1 AND co.status='active' AND co.verified)`,
          [a.user_id],
        );
      }
      await notify(
        c,
        a.user_id,
        'Organizer application update',
        `Your application is ${b.status}. ${b.note}`,
        'profile',
      );
      await audit(c, u.id, `application.${b.status}`, 'application', a.id, { note: b.note });
      return { ok: true };
    });
  });
  app.post('/admin/users/:id/status', async (req) => {
    const u = await admin(req);
    const target = pathId(req);
    requireValue(target !== u.id, 409, 'You cannot suspend yourself');
    const b = z
      .object({ status: z.enum(['active', 'suspended']), reason: z.string().min(5).max(1000) })
      .parse(req.body);
    await tx(async (c) => {
      await c.query('UPDATE users SET status=$2 WHERE id=$1', [target, b.status]);
      if (b.status === 'suspended')
        await c.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [target]);
      await audit(c, u.id, `user.${b.status}`, 'user', target, { reason: b.reason });
    });
    return { ok: true };
  });
  app.post('/admin/xp', async (req) => {
    const u = await admin(req);
    const b = z
      .object({
        userId: uuid,
        points: z
          .number()
          .int()
          .min(-100000)
          .max(100000)
          .refine((n) => n !== 0),
        reason: z.string().min(10).max(1000),
        key: z.string().min(8).max(100),
      })
      .parse(req.body);
    await tx(async (c) => {
      await award(c, b.userId, 'admin_adjustment', u.id, b.points, `admin:${b.key}`, {
        reason: b.reason,
        actor: u.id,
      });
      await audit(c, u.id, 'xp.adjusted', 'user', b.userId, {
        points: b.points,
        reason: b.reason,
        key: b.key,
      });
    });
    return { ok: true };
  });
  app.post('/admin/reports/:id/resolve', async (req) => {
    const u = await admin(req);
    const reportId = pathId(req);
    const b = z
      .object({ status: z.enum(['resolved', 'dismissed']), note: z.string().min(5).max(2000) })
      .parse(req.body);
    await tx(async (c) => {
      await c.query('UPDATE reports SET status=$2 WHERE id=$1', [reportId, b.status]);
      await c.query(
        'INSERT INTO moderation_actions(id,report_id,admin_id,action,note) VALUES($1,$2,$3,$4,$5)',
        [id(), reportId, u.id, b.status, b.note],
      );
      await audit(c, u.id, 'report.reviewed', 'report', reportId, b);
    });
    return { ok: true };
  });
  app.post('/admin/events/:id/feature', async (req) => {
    const u = await admin(req);
    const { featured } = z.object({ featured: z.boolean() }).parse(req.body);
    await tx(async (c) => {
      await c.query('UPDATE events SET featured=$2 WHERE id=$1', [pathId(req), featured]);
      await audit(c, u.id, 'event.featured', 'event', pathId(req), { featured });
    });
    return { ok: true };
  });
  app.post('/admin/campaign', async (req) => {
    const u = await admin(req);
    const b = z
      .object({
        title: z.string().min(3).max(100),
        body: z.string().min(5).max(1000),
        userIds: z.array(uuid).min(1).max(500),
      })
      .parse(req.body);
    await tx(async (c) => {
      for (const target of [...new Set(b.userIds)]) await notify(c, target, b.title, b.body);
      await audit(c, u.id, 'notification.campaign', 'campaign', id(), {
        recipients: b.userIds.length,
      });
    });
    return { ok: true };
  });
  app.post('/admin/payouts', async (req) => {
    const u = await admin(req);
    const b = z.object({ communityId: uuid, currency: z.string().length(3) }).parse(req.body);
    return tx(async (c) => {
      await c.query('SELECT id FROM communities WHERE id=$1 FOR UPDATE', [b.communityId]);
      const bookings = await c.query(
        `SELECT b.id,b.ticket_minor FROM bookings b JOIN events e ON e.id=b.event_id JOIN payments p ON p.booking_id=b.id WHERE e.community_id=$1 AND b.currency=$2 AND b.status='confirmed' AND p.status='paid' AND e.ends_at<now()-interval '7 days' AND b.ticket_minor>0 AND NOT EXISTS(SELECT 1 FROM payout_items pi WHERE pi.booking_id=b.id) FOR UPDATE OF b`,
        [b.communityId, b.currency],
      );
      const amount = bookings.reduce((n, b) => n + b.ticket_minor, 0);
      requireValue(amount > 0, 409, 'No settled earnings are eligible for payout');
      const payoutId = id();
      await c.query(
        `INSERT INTO payouts(id,community_id,amount_minor,currency,status) VALUES($1,$2,$3,$4,'pending')`,
        [payoutId, b.communityId, amount, b.currency],
      );
      for (const row of bookings)
        await c.query(
          'INSERT INTO payout_items(payout_id,booking_id,amount_minor) VALUES($1,$2,$3)',
          [payoutId, row.id, row.ticket_minor],
        );
      await audit(c, u.id, 'payout.created', 'payout', payoutId, { amount, currency: b.currency });
      return { id: payoutId, amount_minor: amount, status: 'pending' };
    });
  });
  app.post('/admin/payouts/:id/record-transfer', async (req) => {
    const u = await admin(req);
    const b = z.object({ reference: z.string().min(8).max(200) }).parse(req.body);
    return tx(async (c) => {
      const [p] = await c.query('SELECT * FROM payouts WHERE id=$1 FOR UPDATE', [pathId(req)]);
      requireValue(p && p.status === 'pending', 409, 'Payout is not pending');
      await c.query(
        `UPDATE payouts SET status='paid',provider_reference=$2,updated_at=now() WHERE id=$1`,
        [p.id, b.reference],
      );
      await audit(c, u.id, 'payout.transfer_recorded', 'payout', p.id, {
        reference: b.reference,
        amountMinor: p.amount_minor,
      });
      return { ok: true };
    });
  });
  const catalogSchemas: Record<string, { schema: z.ZodType; key: string; fields: string[] }> = {
    fees: {
      key: 'id',
      schema: z.object({
        id: uuid,
        country_code: z.string().length(2),
        currency: z.string().length(3),
        fixed_minor: z.number().int().min(0),
        basis_points: z.number().int().min(0).max(10000),
        enabled: z.boolean(),
      }),
      fields: ['id', 'country_code', 'currency', 'fixed_minor', 'basis_points', 'enabled'],
    },
    categories: {
      key: 'slug',
      schema: z.object({
        slug: z.string().regex(/^[a-z-]{2,40}$/),
        name: z.string().min(2).max(60),
        enabled: z.boolean(),
      }),
      fields: ['slug', 'name', 'enabled'],
    },
    countries: {
      key: 'code',
      schema: z.object({
        code: z.string().length(2),
        name: z.string().min(2),
        timezone: z.string().min(3),
        enabled: z.boolean(),
      }),
      fields: ['code', 'name', 'timezone', 'enabled'],
    },
    currencies: {
      key: 'code',
      schema: z.object({
        code: z.string().length(3),
        minor_digits: z.number().int().min(0).max(3),
      }),
      fields: ['code', 'minor_digits'],
    },
    cities: {
      key: 'id',
      schema: z.object({
        id: uuid,
        country_code: z.string().length(2),
        name: z.string().min(2),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        timezone: z.string().min(3),
      }),
      fields: ['id', 'country_code', 'name', 'latitude', 'longitude', 'timezone'],
    },
    challenges: {
      key: 'id',
      schema: z
        .object({
          id: uuid,
          title: z.string().min(3),
          description: z.string().min(10),
          starts_at: z.iso.datetime(),
          ends_at: z.iso.datetime(),
          kind: z.enum(['attendance', 'category', 'explorer', 'streak']),
          category: z.string().nullable(),
          target: z.number().int().positive(),
          reward_xp: z.number().int().min(0).max(10000),
          badge: z.string().min(1),
          enabled: z.boolean(),
        })
        .refine((v) => new Date(v.ends_at) > new Date(v.starts_at)),
      fields: [
        'id',
        'title',
        'description',
        'starts_at',
        'ends_at',
        'kind',
        'category',
        'target',
        'reward_xp',
        'badge',
        'enabled',
      ],
    },
    achievements: {
      key: 'id',
      schema: z.object({
        id: uuid,
        slug: z.string().min(2),
        title: z.string().min(3),
        description: z.string().min(5),
        kind: z.enum(['attendance', 'explorer', 'early', 'night', 'streak', 'ranking']),
        threshold: z.number().int().positive(),
        badge: z.string().min(1),
        enabled: z.boolean(),
      }),
      fields: ['id', 'slug', 'title', 'description', 'kind', 'threshold', 'badge', 'enabled'],
    },
    seasons: {
      key: 'id',
      schema: z
        .object({
          id: uuid,
          name: z.string().min(3),
          starts_at: z.iso.datetime(),
          ends_at: z.iso.datetime(),
        })
        .refine((v) => new Date(v.ends_at) > new Date(v.starts_at)),
      fields: ['id', 'name', 'starts_at', 'ends_at'],
    },
    xp_rules: {
      key: 'source',
      schema: z.object({
        source: z.enum(['attendance', 'exploration']),
        points: z.number().int().min(0).max(10000),
        enabled: z.boolean(),
      }),
      fields: ['source', 'points', 'enabled'],
    },
  };
  app.put('/admin/config/:resource', async (req) => {
    const u = await admin(req);
    const resource = z.string().parse((req.params as any).resource);
    const entry = catalogSchemas[resource];
    requireValue(entry, 404, 'Unknown configurable resource');
    const b = entry.schema.parse(req.body) as any;
    await tx(async (c) => {
      await c.query(
        `INSERT INTO ${tables[resource].table}(${entry.fields.join(',')}) VALUES(${entry.fields.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT(${entry.key}) DO UPDATE SET ${entry.fields
          .filter((f) => f !== entry.key)
          .map((f) => `${f}=EXCLUDED.${f}`)
          .join(',')}`,
        entry.fields.map((f) => b[f]),
      );
      await audit(c, u.id, 'config.updated', resource, b[entry.key], b);
    });
    return { ok: true };
  });
  // Removing a configured row (an achievement, a challenge, a season) rather than only
  // switching it off.
  app.delete('/admin/config/:resource/:id', async (req) => {
    const u = await admin(req);
    const resource = z.string().parse((req.params as any).resource);
    const entry = catalogSchemas[resource];
    requireValue(entry, 404, 'Unknown configurable resource');
    const key = z
      .string()
      .min(1)
      .max(100)
      .parse((req.params as any).id);
    await tx(async (c) => {
      const rows = await c.query(
        `DELETE FROM ${tables[resource].table} WHERE ${entry.key}=$1 RETURNING ${entry.key}`,
        [key],
      );
      requireValue(rows.length, 404, 'Nothing to delete');
      await audit(c, u.id, 'config.deleted', resource, key, {});
    });
    return { ok: true };
  });
}
