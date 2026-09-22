import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, tx, type DB } from '../db.js';
import { audit, authenticated, requireValue, uuid } from '../security.js';
import { notify } from '../notifications.js';
import type { PushCategory } from '../push.js';

// Friends are mutual: one person sends a request, the other accepts it. Search finds
// public profiles by name; incoming requests are visible whatever the requester's privacy.

const notBlocked = (me: string, other: string) =>
  `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=${me} AND b.blocked_id=${other}) OR (b.blocker_id=${other} AND b.blocked_id=${me}))`;

const PERSON = `u.id, p.display_name, p.avatar_url,
  CASE WHEN p.show_location THEN acc.country_code END country_code`;

export type Relation = 'none' | 'friends' | 'incoming' | 'outgoing' | 'self';

export async function relation(c: DB, me: string, other: string): Promise<Relation> {
  if (me === other) return 'self';
  const [f] = await c.query(
    `SELECT requester_id, status FROM friendships
     WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
    [me, other],
  );
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.requester_id === me ? 'outgoing' : 'incoming';
}

/** Ids of everyone this person is friends with (accepted only). */
export const friendIdsSql = (me: string) =>
  `SELECT CASE WHEN requester_id=${me} THEN addressee_id ELSE requester_id END FROM friendships
   WHERE status='accepted' AND (requester_id=${me} OR addressee_id=${me})`;

/**
 * Tells this person's friends about something they just did ("Ola finished a 5.2 km run").
 * Friends who turned friend activity off are skipped, and each friend hears from the same
 * person at most once every 3 hours, so a busy day does not flood them.
 */
export async function notifyFriends(
  c: DB,
  userId: string,
  title: string,
  body: string,
  options: { category?: PushCategory; link?: string } = {},
) {
  const recipients = await c.query(
    `SELECT f.id FROM (${friendIdsSql('$1')}) AS f(id)
     JOIN users u ON u.id=f.id AND u.status='active'
     LEFT JOIN user_accounts a ON a.user_id=f.id
     WHERE coalesce(a.push_friend_activity, true)
       AND NOT EXISTS (SELECT 1 FROM friend_activity_pushes p
         WHERE p.sender_id=$1 AND p.recipient_id=f.id AND p.sent_at > now() - interval '3 hours')`,
    [userId],
  );
  for (const r of recipients) {
    await notify(c, r.id, title, body, options.link || `profile/${userId}`, {
      category: options.category || 'friends',
      tag: `friend-${userId}`,
    });
    await c.query('INSERT INTO friend_activity_pushes(sender_id, recipient_id) VALUES($1,$2)', [
      userId,
      r.id,
    ]);
  }
  return recipients.length;
}

async function person(c: DB, id: string) {
  const [p] = await c.query(
    `SELECT u.id, p.display_name FROM users u JOIN profiles p ON p.user_id=u.id
     WHERE u.id=$1 AND u.status='active'`,
    [id],
  );
  return p;
}

export async function friendRoutes(app: FastifyInstance) {
  app.get('/friends', async (req) => {
    const u = await authenticated(req);
    const [friends, incoming, outgoing] = await Promise.all([
      db.query(
        `SELECT ${PERSON}, f.accepted_at since FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END
         JOIN profiles p ON p.user_id=u.id LEFT JOIN user_accounts acc ON acc.user_id=u.id
         WHERE f.status='accepted' AND (f.requester_id=$1 OR f.addressee_id=$1) AND u.status='active'
         ORDER BY lower(p.display_name)`,
        [u.id],
      ),
      db.query(
        `SELECT ${PERSON}, f.created_at requested_at FROM friendships f
         JOIN users u ON u.id=f.requester_id JOIN profiles p ON p.user_id=u.id
         LEFT JOIN user_accounts acc ON acc.user_id=u.id
         WHERE f.addressee_id=$1 AND f.status='pending' AND u.status='active' AND ${notBlocked('$1', 'u.id')}
         ORDER BY f.created_at DESC`,
        [u.id],
      ),
      db.query(
        `SELECT ${PERSON}, f.created_at requested_at FROM friendships f
         JOIN users u ON u.id=f.addressee_id JOIN profiles p ON p.user_id=u.id
         LEFT JOIN user_accounts acc ON acc.user_id=u.id
         WHERE f.requester_id=$1 AND f.status='pending' AND u.status='active'
         ORDER BY f.created_at DESC`,
        [u.id],
      ),
    ]);
    return { friends, incoming, outgoing };
  });

  app.get(
    '/friends/search',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req) => {
      const u = await authenticated(req);
      const { q } = z.object({ q: z.string().trim().min(2).max(60) }).parse(req.query);
      const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      const rows = await db.query(
        `SELECT ${PERSON},
           CASE
             WHEN f.status='accepted' THEN 'friends'
             WHEN f.requester_id=$1 THEN 'outgoing'
             WHEN f.addressee_id=$1 THEN 'incoming'
             ELSE 'none'
           END relation
         FROM users u JOIN profiles p ON p.user_id=u.id
         LEFT JOIN user_accounts acc ON acc.user_id=u.id
         LEFT JOIN friendships f ON (f.requester_id=$1 AND f.addressee_id=u.id) OR (f.requester_id=u.id AND f.addressee_id=$1)
         WHERE u.id<>$1 AND u.status='active' AND p.visibility='public'
           AND p.display_name ILIKE $2 AND ${notBlocked('$1', 'u.id')}
         ORDER BY (lower(p.display_name) LIKE lower($3)) DESC, lower(p.display_name)
         LIMIT 20`,
        [u.id, pattern, `${q}%`],
      );
      return { results: rows };
    },
  );

  // Send a request, or accept theirs if they already asked.
  app.post(
    '/friends/:id',
    { config: { rateLimit: { max: 40, timeWindow: '15 minutes' } } },
    async (req) => {
      const u = await authenticated(req);
      const other = uuid.parse((req.params as any).id);
      requireValue(other !== u.id, 400, 'You cannot add yourself');
      return tx(async (c) => {
        const target = await person(c, other);
        requireValue(target, 404, 'Person is unavailable');
        const [blocked] = await c.query(
          `SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)`,
          [u.id, other],
        );
        requireValue(!blocked, 404, 'Person is unavailable');
        const current = await relation(c, u.id, other);
        if (current === 'friends' || current === 'outgoing') return { relation: current };
        const [me] = await c.query('SELECT display_name FROM profiles WHERE user_id=$1', [u.id]);
        if (current === 'incoming') {
          await c.query(
            `UPDATE friendships SET status='accepted', accepted_at=now() WHERE requester_id=$1 AND addressee_id=$2`,
            [other, u.id],
          );
          await notify(
            c,
            other,
            'You’re friends now',
            `${me.display_name} accepted your friend request.`,
            `profile/${u.id}`,
          );
          await audit(c, u.id, 'friend.accepted', 'user', other);
          return { relation: 'friends' as Relation };
        }
        await c.query('INSERT INTO friendships(requester_id, addressee_id) VALUES($1,$2)', [
          u.id,
          other,
        ]);
        await notify(
          c,
          other,
          'New friend request',
          `${me.display_name} wants to be friends on CRW+.`,
          'friends',
        );
        await audit(c, u.id, 'friend.requested', 'user', other);
        return { relation: 'outgoing' as Relation };
      });
    },
  );

  app.post('/friends/:id/accept', async (req) => {
    const u = await authenticated(req);
    const other = uuid.parse((req.params as any).id);
    return tx(async (c) => {
      const updated = await c.query(
        `UPDATE friendships SET status='accepted', accepted_at=now()
         WHERE requester_id=$1 AND addressee_id=$2 AND status='pending' RETURNING requester_id`,
        [other, u.id],
      );
      requireValue(updated.length, 404, 'Friend request not found');
      const [me] = await c.query('SELECT display_name FROM profiles WHERE user_id=$1', [u.id]);
      await notify(
        c,
        other,
        'You’re friends now',
        `${me.display_name} accepted your friend request.`,
        `profile/${u.id}`,
      );
      await audit(c, u.id, 'friend.accepted', 'user', other);
      return { relation: 'friends' as Relation };
    });
  });

  // Decline an incoming request, cancel an outgoing one, or remove a friend.
  app.delete('/friends/:id', async (req) => {
    const u = await authenticated(req);
    const other = uuid.parse((req.params as any).id);
    await db.query(
      `DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
      [u.id, other],
    );
    return { relation: 'none' as Relation };
  });
}
