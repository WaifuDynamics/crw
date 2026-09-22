import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { actor, authenticated, requireValue, uuid, id } from '../security.js';
import { challengeProgress, award } from '../competition.js';
import { pathId } from './discovery.js';
import { notify } from '../notifications.js';
export async function competeRoutes(app: FastifyInstance) {
  app.get('/leaderboard', async (req) => {
    const u = await actor(req, true);
    const q = z
      .object({
        scope: z.enum(['friends', 'city', 'country', 'global']).default('global'),
        period: z.enum(['weekly', 'monthly', 'all']).default('weekly'),
        season: uuid.optional(),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(req.query);
    if (q.scope !== 'global') requireValue(u, 401, 'Sign in to see this leaderboard');
    const [me] = u
      ? await db.query(
          'SELECT p.city_id,c.country_code FROM profiles p LEFT JOIN cities c ON c.id=p.city_id WHERE p.user_id=$1',
          [u.id],
        )
      : [];
    if (q.scope === 'city' || q.scope === 'country')
      requireValue(me?.city_id, 400, 'Set your city in profile settings first');
    const [season] = q.season
      ? await db.query('SELECT * FROM seasons WHERE id=$1', [q.season])
      : [];
    if (q.season) requireValue(season, 404, 'Season not found');
    const cutoff =
      q.period === 'weekly'
        ? `date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`
        : q.period === 'monthly'
          ? `date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`
          : `'1970-01-01'::timestamptz`;
    const filters = [
      `u.status='active'`,
      `p.visibility='public'`,
      `p.compete`,
      `NOT EXISTS(SELECT 1 FROM blocks bl WHERE(bl.blocker_id=$1 AND bl.blocked_id=u.id)OR(bl.blocked_id=$1 AND bl.blocker_id=u.id))`,
    ];
    if (q.scope === 'friends')
      filters.push(
        `(u.id=$1 OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.id))`,
      );
    if (q.scope === 'city') filters.push(`p.city_id=$2`);
    if (q.scope === 'country') filters.push(`c.country_code=$3`);
    const params = [
      u?.id || null,
      me?.city_id || null,
      me?.country_code || null,
      season?.starts_at || null,
      season?.ends_at || null,
    ];
    const cte = `WITH scores AS(SELECT u.id,p.display_name,p.avatar_url,CASE WHEN p.show_location THEN c.name END city,COALESCE(sum(x.points),0)::bigint score FROM users u JOIN profiles p ON p.user_id=u.id LEFT JOIN cities c ON c.id=p.city_id JOIN xp_transactions x ON x.user_id=u.id WHERE ${filters.join(' AND ')} AND ($2::uuid IS NULL OR true) AND ($3::text IS NULL OR true) AND x.created_at>=COALESCE($4::timestamptz,${cutoff}) AND ($5::timestamptz IS NULL OR x.created_at<$5) GROUP BY u.id,p.display_name,p.avatar_url,p.show_location,c.name HAVING sum(x.points)>0),ranked AS(SELECT *,rank() OVER(ORDER BY score DESC)::int rank FROM scores)`;
    const rows = await db.query(`${cte} SELECT * FROM ranked ORDER BY rank,id LIMIT $6 OFFSET $7`, [
      ...params,
      q.limit,
      q.offset,
    ]);
    const [position] = u ? await db.query(`${cte} SELECT * FROM ranked WHERE id=$1`, params) : [];
    const nearby = position
      ? await db.query(
          `${cte} SELECT * FROM ranked WHERE rank BETWEEN $6 AND $7 ORDER BY rank,id LIMIT 7`,
          [...params, Math.max(1, position.rank - 2), position.rank + 2],
        )
      : [];
    const scopeKey =
      q.scope === 'city'
        ? `city:${me.city_id}`
        : q.scope === 'country'
          ? `country:${me.country_code}`
          : q.scope;
    const previous = await db.query(
      `SELECT DISTINCT ON(user_id) user_id,rank FROM leaderboard_snapshots WHERE scope=$1 AND period=$2 AND snapshot_date<current_date ORDER BY user_id,snapshot_date DESC`,
      [scopeKey, q.period],
    );
    const map = new Map(previous.map((p) => [p.user_id, p.rank]));
    for (const row of rows) {
      row.previous_rank = map.get(row.id) || null;
      row.change = row.previous_rank ? row.previous_rank - row.rank : null;
      row.level = Math.floor(Math.sqrt(Number(row.score) / 100)) + 1;
    }
    return {
      rows,
      me: position || null,
      nearby,
      nextOffset: rows.length === q.limit ? q.offset + q.limit : null,
      period: q.period,
      timezone: 'UTC',
    };
  });
  app.get('/challenges', async (req) => {
    const u = await actor(req, true);
    const rows = await db.query(
      `SELECT c.*,p.joined_at,p.completed_at FROM challenges c LEFT JOIN challenge_participants p ON p.challenge_id=c.id AND p.user_id=$1 WHERE c.enabled AND c.ends_at>now() ORDER BY c.ends_at`,
      [u?.id || null],
    );
    for (const row of rows) row.progress = u ? await challengeProgress(db, row, u.id) : 0;
    return rows;
  });
  app.post('/challenges/:id/join', async (req) => {
    const u = await authenticated(req, true);
    return tx(async (c) => {
      const [challenge] = await c.query(
        'SELECT * FROM challenges WHERE id=$1 AND enabled AND starts_at<=now() AND ends_at>now()',
        [pathId(req)],
      );
      requireValue(challenge, 404, 'Challenge is not available');
      await c.query(
        'INSERT INTO challenge_participants(challenge_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [challenge.id, u.id],
      );
      const progress = await challengeProgress(c, challenge, u.id);
      if (progress >= challenge.target) {
        const updated = await c.query(
          'UPDATE challenge_participants SET completed_at=now() WHERE challenge_id=$1 AND user_id=$2 AND completed_at IS NULL RETURNING user_id',
          [challenge.id, u.id],
        );
        if (updated.length) {
          await award(
            c,
            u.id,
            'challenge',
            challenge.id,
            challenge.reward_xp,
            `challenge:${challenge.id}:${u.id}`,
          );
          await notify(
            c,
            u.id,
            'Challenge complete',
            `${challenge.title} · +${challenge.reward_xp} XP`,
            'compete',
          );
        }
      }
      return { ok: true, progress };
    });
  });
  app.get('/achievements', async (req) => {
    const u = await actor(req, true);
    return db.query(
      `SELECT a.*,ua.unlocked_at FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id=a.id AND ua.user_id=$1 WHERE a.enabled ORDER BY a.threshold`,
      [u?.id || null],
    );
  });
  app.get('/seasons', async () =>
    db.query('SELECT * FROM seasons ORDER BY starts_at DESC LIMIT 20'),
  );
}
