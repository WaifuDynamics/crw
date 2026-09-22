import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, type DB } from '../db.js';
import { actor, authenticated, id, requireValue } from '../security.js';
import { friendIdsSql, notifyFriends } from './friends.js';

export async function displayName(userId: string) {
  const [p] = await db.query('SELECT display_name FROM profiles WHERE user_id=$1', [userId]);
  return p?.display_name || 'A friend';
}

// Wins and reps from camera-counted matches, for the Play screen.
export async function repStats(c: DB, userId: string) {
  const [s] = await c.query(
    `SELECT count(*)::int matches,
       count(*) FILTER (WHERE won)::int wins,
       coalesce(sum(reps), 0)::int reps,
       count(*) FILTER (WHERE won AND mode='1v1')::int wins_1v1,
       count(*) FILTER (WHERE won AND mode='2v2')::int wins_2v2,
       count(*) FILTER (WHERE won AND exercise='pushup')::int wins_pushup,
       count(*) FILTER (WHERE won AND exercise='squat')::int wins_squat
     FROM rep_matches WHERE user_id=$1`,
    [userId],
  );
  return {
    matches: s.matches,
    wins: s.wins,
    reps: s.reps,
    byMode: { '1v1': s.wins_1v1, '2v2': s.wins_2v2 },
    byExercise: { pushup: s.wins_pushup, squat: s.wins_squat },
  };
}

export type SoloRecord = {
  sessions: number;
  reps: number;
  bestSet: number;
  bestSession: number;
  seconds: number;
  lastAt: string | null;
};

// Personal records from solo sessions, per exercise.
export async function soloStats(c: DB, userId: string) {
  const rows = await c.query(
    `SELECT exercise, count(*)::int sessions, sum(reps)::int reps, max(best_set)::int best_set,
       max(reps)::int best_session, sum(seconds)::int seconds, max(performed_at) last_at
     FROM rep_sessions WHERE user_id=$1 GROUP BY exercise`,
    [userId],
  );
  const empty = (): SoloRecord => ({
    sessions: 0,
    reps: 0,
    bestSet: 0,
    bestSession: 0,
    seconds: 0,
    lastAt: null,
  });
  const out = { pushup: empty(), squat: empty() };
  for (const r of rows)
    out[r.exercise as 'pushup' | 'squat'] = {
      sessions: r.sessions,
      reps: r.reps,
      bestSet: r.best_set,
      bestSession: r.best_session,
      seconds: r.seconds,
      lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
    };
  return out;
}

const score = z.number().int().min(0).max(10000);
const session = z
  .object({
    sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    exercise: z.enum(['pushup', 'squat']),
    reps: z.number().int().min(1).max(10000),
    bestSet: z.number().int().min(1).max(10000),
    seconds: z.number().int().min(0).max(86400),
  })
  .strict()
  .refine((s) => s.bestSet <= s.reps, { message: 'bestSet cannot exceed reps', path: ['bestSet'] });
const result = z
  .object({
    matchId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    mode: z.enum(['1v1', '2v2']),
    exercise: z.enum(['pushup', 'squat']),
    won: z.boolean(),
    reason: z.enum(['target', 'walkover']),
    reps: score,
    score: z.tuple([score, score]),
    opponents: z.array(z.string().trim().min(1).max(24)).max(3).default([]),
  })
  .strict();

export async function repsRoutes(app: FastifyInstance) {
  // Reported by the signed-in player's own app when the counter announces a result.
  // Trusts the client, like any self-reported score; the unique match id stops a
  // result from being counted twice.
  app.post(
    '/reps/results',
    { config: { rateLimit: { max: 60, timeWindow: '15 minutes' } } },
    async (req) => {
      const u = await authenticated(req);
      const r = result.parse(req.body);
      const inserted = await db.query(
        `INSERT INTO rep_matches(id, user_id, external_id, mode, exercise, won, reason, reps,
           team_score, opponent_score, opponents)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (user_id, external_id) DO NOTHING RETURNING id`,
        [
          id(),
          u.id,
          r.matchId,
          r.mode,
          r.exercise,
          r.won,
          r.reason,
          r.reps,
          r.score[0],
          r.score[1],
          r.opponents,
        ],
      );
      return { recorded: inserted.length > 0, stats: await repStats(db, u.id) };
    },
  );

  // A finished solo session, reported by the player's own app. Empty sessions are not sent.
  app.post(
    '/reps/sessions',
    { config: { rateLimit: { max: 120, timeWindow: '15 minutes' } } },
    async (req) => {
      const u = await authenticated(req);
      const s = session.parse(req.body);
      const inserted = await db.query(
        `INSERT INTO rep_sessions(id, user_id, external_id, exercise, reps, best_set, seconds)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id, external_id) DO NOTHING RETURNING id`,
        [id(), u.id, s.sessionId, s.exercise, s.reps, s.bestSet, s.seconds],
      );
      if (inserted.length && s.reps >= 20)
        await notifyFriends(
          db,
          u.id,
          `${await displayName(u.id)} is on fire 🔥`,
          `Just did ${s.reps} ${s.exercise === 'pushup' ? 'push-ups' : 'squats'} in one session. Can you beat it?`,
          { category: 'compete', link: 'play' },
        ).catch((e) => req.log.warn(e, 'friend activity push failed'));
      return { recorded: inserted.length > 0, solo: await soloStats(db, u.id) };
    },
  );

  // Recent solo sessions, oldest first, for syncing to Health Connect / Apple Health.
  app.get('/reps/sessions', async (req) => {
    const u = await authenticated(req);
    const q = z
      .object({
        since: z.coerce.date().default(() => new Date(Date.now() - 30 * 86400000)),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .parse(req.query);
    const rows = await db.query(
      `SELECT id, exercise, reps, best_set, seconds, performed_at FROM rep_sessions
       WHERE user_id=$1 AND performed_at > $2 ORDER BY performed_at LIMIT $3`,
      [u.id, q.since.toISOString(), q.limit],
    );
    return {
      sessions: rows.map((r: any) => ({
        id: r.id,
        exercise: r.exercise,
        reps: r.reps,
        bestSet: r.best_set,
        seconds: r.seconds,
        performedAt: new Date(r.performed_at).toISOString(),
      })),
    };
  });

  app.get('/reps/me', async (req) => {
    const u = await authenticated(req);
    return { ...(await repStats(db, u.id)), solo: await soloStats(db, u.id) };
  });

  // The CRW+ ranking: reps from matches and solo sessions, or wins, for a period and a
  // circle of people. Global and country rankings list public profiles that compete;
  // friends see each other whatever their profile visibility.
  app.get('/reps/leaderboard', async (req) => {
    const viewer = await actor(req, true);
    const q = z
      .object({
        metric: z.enum(['reps', 'wins', 'km']).default('wins'),
        period: z.enum(['weekly', 'monthly', 'all']).default('all'),
        scope: z.enum(['global', 'friends', 'country']).default('global'),
        exercise: z.enum(['all', 'pushup', 'squat']).default('all'),
        limit: z.coerce.number().int().min(1).max(50).default(3),
        offset: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .parse(req.query);
    if (q.scope !== 'global') requireValue(viewer, 401, 'Sign in to see this ranking');
    const [mine] = viewer
      ? await db.query('SELECT country_code FROM user_accounts WHERE user_id=$1', [viewer.id])
      : [];
    if (q.scope === 'country')
      requireValue(mine?.country_code, 400, 'Set your country in your profile first');

    const cutoff =
      q.period === 'weekly'
        ? `date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`
        : q.period === 'monthly'
          ? `date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`
          : `'1970-01-01'::timestamptz`;
    const exercise = q.exercise === 'all' ? '' : `AND exercise='${q.exercise}'`;
    const visible =
      q.scope === 'friends'
        ? `(u.id=$1 OR u.id IN (${friendIdsSql('$1')}))`
        : `p.visibility='public' AND p.compete`;
    // $2 is always referenced (typed) so Postgres can infer it; null means any country.
    const country = `AND ($2::text IS NULL OR acc.country_code=$2::text)`;
    const blocked = `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))`;
    const value = q.metric === 'wins' ? 't.wins' : q.metric === 'km' ? 't.meters' : 't.reps';
    // Distance has no exercise: the km ranking counts every tracked workout.
    const reps = q.metric === 'km' ? '' : exercise;
    const distance =
      q.metric === 'km'
        ? `UNION ALL SELECT user_id, 0, 0, 0, meters FROM workouts WHERE started_at >= ${cutoff} AND deleted_at IS NULL`
        : '';

    const ranked = `
      WITH activity AS (
        SELECT user_id, reps, CASE WHEN won THEN 1 ELSE 0 END wins, 1 matches, 0 meters
        FROM rep_matches WHERE played_at >= ${cutoff} ${reps}
        UNION ALL
        SELECT user_id, reps, 0, 0, 0 FROM rep_sessions WHERE performed_at >= ${cutoff} ${reps}
        ${distance}
      ),
      totals AS (
        SELECT user_id, sum(reps)::int reps, sum(wins)::int wins, sum(matches)::int matches,
          sum(meters)::int meters
        FROM activity GROUP BY user_id
      ),
      ranked AS (
        SELECT u.id, p.display_name, p.avatar_url,
          CASE WHEN p.show_location THEN acc.country_code END country_code,
          t.reps, t.wins, t.matches, t.meters, ${value} AS value,
          rank() OVER (ORDER BY ${value} DESC)::int rank
        FROM totals t
        JOIN users u ON u.id=t.user_id
        JOIN profiles p ON p.user_id=u.id
        LEFT JOIN user_accounts acc ON acc.user_id=u.id
        WHERE u.status='active' AND ${value} > 0 AND ${visible} ${country}
          AND ($1::uuid IS NULL OR ${blocked})
      )`;
    const params = [viewer?.id ?? null, q.scope === 'country' ? mine.country_code : null];
    const rows = await db.query(
      `${ranked} SELECT * FROM ranked ORDER BY rank, reps DESC, meters DESC, id LIMIT $3 OFFSET $4`,
      [...params, q.limit + 1, q.offset],
    );
    const [me] = viewer ? await db.query(`${ranked} SELECT * FROM ranked WHERE id=$1`, params) : [];
    const [{ total }] = await db.query(`${ranked} SELECT count(*)::int total FROM ranked`, params);
    const page = rows.slice(0, q.limit);
    return {
      metric: q.metric,
      period: q.period,
      scope: q.scope,
      exercise: q.exercise,
      rows: page,
      // Kept for the Play screen's podium.
      top: page,
      me: me ?? null,
      total,
      nextOffset: rows.length > q.limit ? q.offset + q.limit : null,
      timezone: 'UTC',
    };
  });
}
