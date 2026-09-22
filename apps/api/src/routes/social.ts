import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { actor, authenticated, id, uuid, requireValue, safeURL, audit } from '../security.js';
import { pathId, publicPerson, eventSelect } from './discovery.js';
import { streak } from '../competition.js';
import { notify } from '../notifications.js';
import { relation } from './friends.js';
export async function socialRoutes(app: FastifyInstance) {
  app.get('/communities', async (req) => {
    const u = await actor(req, true);
    return db.query(
      `SELECT co.*,ci.name city,(SELECT count(*)::int FROM community_follows f WHERE f.community_id=co.id) followers,EXISTS(SELECT 1 FROM community_follows f WHERE f.community_id=co.id AND f.user_id=$1) followed FROM communities co JOIN cities ci ON ci.id=co.city_id WHERE co.verified AND co.status='active' ORDER BY followers DESC LIMIT 100`,
      [u?.id || null],
    );
  });
  app.get('/communities/:id', async (req) => {
    const u = await actor(req, true);
    const communityId = pathId(req);
    const [co] = await db.query(
      `SELECT co.*,ci.name city,(SELECT count(*)::int FROM community_follows f WHERE f.community_id=co.id) followers,EXISTS(SELECT 1 FROM community_follows f WHERE f.community_id=co.id AND f.user_id=$1) followed FROM communities co JOIN cities ci ON ci.id=co.city_id WHERE co.id=$2 AND co.verified AND co.status='active'`,
      [u?.id || null, communityId],
    );
    requireValue(co, 404, 'Community not found');
    co.events = await db.query(
      `${eventSelect} WHERE e.community_id=$2 AND e.status IN ('published','completed') ORDER BY e.starts_at DESC LIMIT 50`,
      [u?.id || null, communityId],
    );
    return co;
  });
  app.post('/communities/:id/follow', async (req) => {
    const u = await authenticated(req);
    const communityId = pathId(req);
    requireValue(
      (
        await db.query(`SELECT 1 FROM communities WHERE id=$1 AND verified AND status='active'`, [
          communityId,
        ])
      ).length,
      404,
      'Community unavailable',
    );
    await db.query(
      'INSERT INTO community_follows(community_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [communityId, u.id],
    );
    return { followed: true };
  });
  app.delete('/communities/:id/follow', async (req) => {
    const u = await authenticated(req);
    await db.query('DELETE FROM community_follows WHERE community_id=$1 AND user_id=$2', [
      pathId(req),
      u.id,
    ]);
    return { followed: false };
  });
  app.get('/profiles/:id', async (req) => {
    const viewer = await actor(req, true);
    const userId = pathId(req);
    const [p] = await db.query(
      `SELECT p.*,u.status,ci.name city,ci.country_code,(SELECT COALESCE(sum(points),0)::int FROM xp_transactions WHERE user_id=p.user_id) xp,(SELECT count(*)::int FROM checkins WHERE user_id=p.user_id) activities,(SELECT count(*)::int FROM community_follows WHERE user_id=p.user_id) communities,(SELECT count(*)::int FROM follows WHERE following_id=p.user_id) followers,(SELECT count(*)::int FROM follows WHERE follower_id=p.user_id) following,EXISTS(SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=p.user_id) followed FROM profiles p JOIN users u ON u.id=p.user_id LEFT JOIN cities ci ON ci.id=p.city_id WHERE p.user_id=$2 AND u.status='active' AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocked_id=$1 AND blocker_id=$2))`,
      [viewer?.id || null, userId],
    );
    requireValue(p, 404, 'Profile not found');
    const own = viewer?.id === userId;
    const friendship = viewer ? await relation(db, viewer.id, userId) : 'none';
    if (!own && p.visibility === 'private' && friendship !== 'friends')
      return {
        user_id: userId,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        visibility: 'private',
        friendship,
      };
    p.friendship = friendship;
    if (!own && !p.show_location) {
      p.city = null;
      p.city_id = null;
      p.country_code = null;
    }
    p.level = Math.max(1, Math.floor(Math.sqrt(Math.max(0, p.xp) / 100)) + 1);
    p.streak = await streak(db, userId);
    p.achievements = await db.query(
      'SELECT a.*,ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=$1 ORDER BY ua.unlocked_at DESC',
      [userId],
    );
    p.history =
      own || p.show_attendance
        ? await db.query(
            `SELECT ch.id,e.id event_id,e.title,e.category,e.cover_url,e.starts_at,ci.timezone,ch.created_at,(SELECT count(*)::int FROM reactions r WHERE r.checkin_id=ch.id) reactions,EXISTS(SELECT 1 FROM reactions r WHERE r.checkin_id=ch.id AND r.user_id=$2) reacted FROM checkins ch JOIN events e ON e.id=ch.event_id JOIN cities ci ON ci.id=e.city_id WHERE ch.user_id=$1 ORDER BY ch.created_at DESC LIMIT 180`,
            [userId, viewer?.id || null],
          )
        : [];
    // The "art of showing up" grid also counts personal workouts (Tracking), not only
    // event check-ins, so a run or ride you logged colours today's square.
    p.workout_days =
      own || p.show_attendance
        ? await db.query(
            `SELECT to_char(started_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS "day", count(*)::int AS "n"
             FROM workouts
             WHERE user_id=$1 AND deleted_at IS NULL AND started_at > now() - interval '120 days'
             GROUP BY 1`,
            [userId],
          )
        : [];
    p.followed_communities = await db.query(
      `SELECT c.id,c.name,c.logo_url FROM community_follows f JOIN communities c ON c.id=f.community_id WHERE f.user_id=$1 AND c.status='active'`,
      [userId],
    );
    p.mutual = viewer
      ? await db.query(
          `SELECT p.user_id,p.display_name,p.avatar_url FROM follows a JOIN follows b ON b.following_id=a.following_id JOIN profiles p ON p.user_id=a.following_id WHERE a.follower_id=$1 AND b.follower_id=$2 AND p.visibility='public' LIMIT 8`,
          [viewer.id, userId],
        )
      : [];
    return p;
  });
  app.patch('/profile', async (req) => {
    const u = await authenticated(req);
    const b = z
      .object({
        displayName: z.string().trim().min(2).max(60),
        bio: z.string().max(500),
        cityId: uuid.nullable(),
        interests: z.array(z.string().max(40)).max(12),
        visibility: z.enum(['public', 'private']),
        showAttendance: z.boolean(),
        showLocation: z.boolean(),
        compete: z.boolean(),
        avatarUrl: safeURL.nullable().optional(),
      })
      .parse(req.body);
    await db.query(
      'UPDATE profiles SET display_name=$2,bio=$3,city_id=$4,interests=$5,visibility=$6,show_attendance=$7,show_location=$8,compete=$9,avatar_url=COALESCE($10,avatar_url),updated_at=now() WHERE user_id=$1',
      [
        u.id,
        b.displayName,
        b.bio,
        b.cityId,
        b.interests,
        b.visibility,
        b.showAttendance,
        b.showLocation,
        b.compete,
        b.avatarUrl || null,
      ],
    );
    return { ok: true };
  });
  app.post('/profiles/:id/follow', async (req) => {
    const u = await authenticated(req);
    const other = pathId(req);
    requireValue(other !== u.id, 400, 'You cannot follow yourself');
    requireValue(
      (
        await db.query(
          `SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=$2 AND ${publicPerson}`,
          [u.id, other],
        )
      ).length,
      404,
      'Person is unavailable',
    );
    await tx(async (c) => {
      const inserted = await c.query(
        'INSERT INTO follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING following_id',
        [u.id, other],
      );
      if (inserted.length)
        await notify(
          c,
          other,
          'Your circle is growing',
          'Someone new is following you on CRW+.',
          `profile/${u.id}`,
        );
    });
    return { followed: true };
  });
  app.delete('/profiles/:id/follow', async (req) => {
    const u = await authenticated(req);
    await db.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [
      u.id,
      pathId(req),
    ]);
    return { followed: false };
  });
  app.post('/profiles/:id/block', async (req) => {
    const u = await authenticated(req);
    const other = pathId(req);
    requireValue(other !== u.id, 400, 'Invalid target');
    await tx(async (c) => {
      await c.query(
        'INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [u.id, other],
      );
      await c.query(
        'DELETE FROM follows WHERE (follower_id=$1 AND following_id=$2) OR(follower_id=$2 AND following_id=$1)',
        [u.id, other],
      );
    });
    return { ok: true };
  });
  app.post('/activity/:id/react', async (req) => {
    const u = await authenticated(req);
    const checkin = pathId(req);
    requireValue(
      (
        await db.query(
          `SELECT ch.id FROM checkins ch JOIN profiles p ON p.user_id=ch.user_id JOIN users u ON u.id=p.user_id WHERE ch.id=$2 AND ${publicPerson}`,
          [u.id, checkin],
        )
      ).length,
      404,
      'Activity is private',
    );
    await db.query(
      'INSERT INTO reactions(user_id,checkin_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [u.id, checkin],
    );
    return { ok: true };
  });
  app.delete('/activity/:id/react', async (req) => {
    const u = await authenticated(req);
    await db.query('DELETE FROM reactions WHERE user_id=$1 AND checkin_id=$2', [u.id, pathId(req)]);
    return { ok: true };
  });
  app.get('/notifications', async (req) => {
    const u = await authenticated(req);
    return db.query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
      [u.id],
    );
  });
  app.post('/notifications/:id/read', async (req) => {
    const u = await authenticated(req);
    await db.query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2', [
      pathId(req),
      u.id,
    ]);
    return { ok: true };
  });
  const deviceTokenCache = new Map<string, number>();
  // Exempt from the global limit: it is deduplicated right below, and a phone that
  // re-registered in a loop must not spend the budget its other screens need.
  app.post('/devices', { config: { rateLimit: false } }, async (req) => {
    const u = await authenticated(req);
    const b = z
      .union([
        z.object({
          token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/),
          platform: z.enum(['ios', 'android']),
          provider: z.literal('expo').default('expo'),
        }),
        // A Firebase registration token from the Android app.
        z.object({
          token: z.string().regex(/^[\w:.-]{100,4096}$/),
          platform: z.literal('android'),
          provider: z.literal('fcm'),
        }),
      ])
      .parse(req.body);
    const cacheKey = `${u.id}:${b.token}`;
    const now = Date.now();
    const prev = deviceTokenCache.get(cacheKey) ?? 0;
    if (now - prev < 60_000) {
      return { ok: true };
    }
    deviceTokenCache.set(cacheKey, now);
    if (deviceTokenCache.size > 10_000) {
      deviceTokenCache.clear();
    }
    await db.query(
      `INSERT INTO device_tokens(token,user_id,platform,provider) VALUES($1,$2,$3,$4)
       ON CONFLICT(token) DO UPDATE SET user_id=$2, provider=$4, updated_at=now()`,
      [b.token, u.id, b.platform, b.provider],
    );
    return { ok: true };
  });
  // Signing out on a phone stops its pushes for this account.
  app.delete('/devices', async (req) => {
    const u = await authenticated(req);
    const b = z.object({ token: z.string().min(1).max(4096) }).parse(req.body);
    await db.query('DELETE FROM device_tokens WHERE token=$1 AND user_id=$2', [b.token, u.id]);
    return { ok: true };
  });
  app.post('/reports', async (req) => {
    const u = await authenticated(req);
    const b = z
      .object({
        targetType: z.enum(['event', 'user', 'community']),
        targetId: uuid,
        reason: z.string().trim().min(10).max(2000),
      })
      .parse(req.body);
    await db.query(
      'INSERT INTO reports(id,reporter_id,target_type,target_id,reason) VALUES($1,$2,$3,$4,$5)',
      [id(), u.id, b.targetType, b.targetId, b.reason],
    );
    return { ok: true };
  });
}
