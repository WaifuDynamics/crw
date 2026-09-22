import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, tx, type DB } from '../db.js';
import { authenticated, id, requireValue } from '../security.js';
import { notifyFriends } from './friends.js';
import { displayName } from './reps.js';

// A user's complete workout history, synced between their devices.
//
// The app uploads each workout it records or imports (with its GPS route) and pulls the
// changes made on other devices with GET /workouts?since=. Deleting a workout keeps a
// tombstone (deleted_at) without the personal data, so every device learns about it.
// The distance leaderboard in reps.ts reads the same table.

const MAX_POINTS = 20_000;
const externalId = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/);

/** A route point on the wire: [lat, lng, ms since start, accuracy m, segment, seconds]. */
const routePoint = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z
    .number()
    .int()
    .min(0)
    .max(8 * 86400_000),
  z.number().min(0).max(1000),
  z.number().int().min(0).max(10_000),
  z
    .number()
    .min(0)
    .max(8 * 86400),
]);

const workout = z
  .object({
    id: externalId,
    activity: z.string().trim().min(1).max(40),
    meters: z.number().min(0).max(1_000_000),
    seconds: z.number().min(1).max(604_800),
    startedAt: z
      .number()
      .int()
      .min(Date.UTC(2020, 0, 1)),
    endedAt: z
      .number()
      .int()
      .min(Date.UTC(2020, 0, 1))
      .nullish(),
    source: z.enum(['gps', 'health']),
    calories: z.number().min(0).max(20_000).nullish(),
    heartRate: z.number().min(20).max(250).nullish(),
    steps: z.number().int().min(0).max(500_000).nullish(),
    splits: z.array(z.number().min(0).max(86_400)).max(1000).default([]),
    exerciseType: z.number().int().min(0).max(10_000).nullish(),
    healthConnectId: z.string().max(128).nullish(),
    route: z.array(routePoint).max(MAX_POINTS).nullish(),
  })
  .strict()
  // Averages over 100 km/h are GPS noise or a car.
  .refine((w) => w.meters / w.seconds <= 28, { message: 'Implausible speed', path: ['meters'] })
  .refine((w) => w.startedAt <= Date.now() + 3600_000, {
    message: 'Workout starts in the future',
    path: ['startedAt'],
  });

type Workout = z.infer<typeof workout>;

const km = (meters: number) => (meters / 1000).toFixed(meters < 10000 ? 2 : 1);
const verb = (activity: string) => {
  const a = activity.toLowerCase();
  if (/run|treadmill/.test(a)) return 'run';
  if (/walk/.test(a)) return 'walk';
  if (/hik/.test(a)) return 'hike';
  if (/cycl|bik|rid/.test(a)) return 'ride';
  return a;
};
const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);
const ms = (v: any) => (v ? new Date(v).getTime() : null);

/** Saves one workout. Returns what happened, so the caller can report and notify. */
async function save(c: DB, userId: string, w: Workout) {
  const [row] = await c.query(
    `INSERT INTO workouts(id, user_id, external_id, activity, meters, seconds, started_at, source,
       ended_at, calories, heart_rate, steps, splits, exercise_type, health_connect_id, point_count)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (user_id, external_id) DO UPDATE SET
       activity=EXCLUDED.activity, meters=EXCLUDED.meters, seconds=EXCLUDED.seconds,
       started_at=EXCLUDED.started_at, source=EXCLUDED.source, ended_at=EXCLUDED.ended_at,
       calories=EXCLUDED.calories, heart_rate=EXCLUDED.heart_rate, steps=EXCLUDED.steps,
       splits=EXCLUDED.splits, exercise_type=EXCLUDED.exercise_type,
       health_connect_id=EXCLUDED.health_connect_id,
       point_count=CASE WHEN $17 THEN EXCLUDED.point_count ELSE workouts.point_count END,
       updated_at=now()
     WHERE workouts.deleted_at IS NULL
     RETURNING id, (xmax = 0) AS inserted`,
    [
      id(),
      userId,
      w.id,
      w.activity,
      Math.round(w.meters),
      Math.round(w.seconds),
      iso(w.startedAt),
      w.source,
      iso(w.endedAt),
      w.calories == null ? null : Math.round(w.calories),
      w.heartRate == null ? null : Math.round(w.heartRate),
      w.steps ?? null,
      w.splits.map((s) => Math.round(s)),
      w.exerciseType ?? null,
      w.healthConnectId ?? null,
      w.route?.length ?? 0,
      w.route != null,
    ],
  );
  // No row: the workout was deleted on another device and stays deleted.
  if (!row) return { status: 'deleted' as const };
  if (w.route)
    await c.query(
      `INSERT INTO workout_routes(workout_id, points) VALUES($1,$2)
       ON CONFLICT (workout_id) DO UPDATE SET points=EXCLUDED.points, updated_at=now()`,
      [row.id, JSON.stringify(w.route)],
    );
  return { status: row.inserted ? ('created' as const) : ('updated' as const) };
}

/** The app's shape of a stored workout. */
function out(r: any, withRoute: boolean) {
  if (r.deleted_at) return { id: r.external_id, deleted: true, updatedAt: r.updated_at };
  return {
    id: r.external_id,
    activity: r.activity,
    meters: r.meters,
    seconds: r.seconds,
    startedAt: ms(r.started_at),
    endedAt: ms(r.ended_at),
    source: r.source,
    calories: r.calories,
    heartRate: r.heart_rate,
    steps: r.steps,
    splits: r.splits || [],
    exerciseType: r.exercise_type,
    healthConnectId: r.health_connect_id,
    pointCount: r.point_count,
    ...(withRoute ? { route: r.points ?? [] } : {}),
    updatedAt: r.updated_at,
  };
}

const healthDay = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    steps: z.number().int().min(0).max(500_000).nullish(),
    calories: z.number().min(0).max(50_000).nullish(),
    heartRate: z.number().min(20).max(250).nullish(),
    source: z.string().trim().min(1).max(40),
    syncedAt: z
      .number()
      .int()
      .min(Date.UTC(2020, 0, 1)),
  })
  .strict();

export async function workoutRoutes(app: FastifyInstance) {
  // Workouts from the signed-in user's own app, sent in batches (with routes). Trusts the
  // client like any self-reported score; the app's run id makes uploads idempotent.
  app.post(
    '/workouts',
    { bodyLimit: 16 * 1024 * 1024, config: { rateLimit: { max: 120, timeWindow: '15 minutes' } } },
    async (req) => {
      const u = await authenticated(req);
      const { workouts } = z
        .object({ workouts: z.array(workout).min(1).max(200) })
        .strict()
        .parse(req.body);
      const points = workouts.reduce((n, w) => n + (w.route?.length ?? 0), 0);
      requireValue(points <= 60_000, 413, 'Send fewer routes at once');
      let recorded = 0;
      const deleted: string[] = [];
      let newest: Workout | undefined;
      await tx(async (c) => {
        for (const w of workouts) {
          const r = await save(c, u.id, w);
          if (r.status === 'deleted') deleted.push(w.id);
          if (r.status !== 'created') continue;
          recorded++;
          // Friends hear about fresh workouts only, not a month of imported history.
          if (w.meters >= 500 && w.startedAt > Date.now() - 12 * 3600_000)
            newest = !newest || w.startedAt > newest.startedAt ? w : newest;
        }
      });
      if (newest)
        await notifyFriends(
          db,
          u.id,
          `${await displayName(u.id)} just moved 💪`,
          `Finished a ${km(newest.meters)} km ${verb(newest.activity)}. Your turn?`,
        ).catch((e) => req.log.warn(e, 'friend activity push failed'));
      return {
        recorded,
        ids: workouts.map((w) => w.id).filter((x) => !deleted.includes(x)),
        deleted,
      };
    },
  );

  // Changes after a cursor, oldest first, including deletions. Without `since`, the
  // whole (live) history. Routes only with routes=1. The cursor is "<updated_at>|<row id>":
  // one upload saves many rows with the same updated_at, so the time alone could skip rows.
  // A workout has just begun on a phone: friends hear about it while it is happening, so
  // they can cheer or join in. notifyFriends keeps it to one push per friend every three
  // hours, which also stands in for the "finished" push of the same workout.
  app.post('/workouts/started', async (req) => {
    const u = await authenticated(req);
    const b = z
      .object({ activity: z.string().trim().min(1).max(40).default('Running') })
      .parse(req.body ?? {});
    const noun = verb(b.activity);
    const notified = await notifyFriends(
      db,
      u.id,
      `${await displayName(u.id)} is out training 🔥`,
      `Just started a ${noun}. Cheer them on - or go and join them.`,
    ).catch((e) => {
      req.log.warn(e, 'friend start push failed');
      return 0;
    });
    return { ok: true, notified };
  });

  app.get('/workouts', async (req) => {
    const u = await authenticated(req);
    const q = z
      .object({
        since: z
          .string()
          .regex(/^[^|]{10,40}\|[0-9a-f-]{36}$/)
          .optional(),
        routes: z.enum(['0', '1']).default('0'),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);
    const [sinceTime, sinceId] = q.since ? q.since.split('|') : [null, null];
    const withRoute = q.routes === '1';
    const rows = await db.query(
      `SELECT w.*, w.updated_at::text AS cursor_time, ${withRoute ? 'r.points' : 'NULL AS points'}
       FROM workouts w ${withRoute ? 'LEFT JOIN workout_routes r ON r.workout_id=w.id' : ''}
       WHERE w.user_id=$1
         AND ($2::timestamptz IS NULL OR (w.updated_at, w.id) > ($2::timestamptz, $3::uuid))
         AND ($2::timestamptz IS NOT NULL OR w.deleted_at IS NULL)
       ORDER BY w.updated_at, w.id LIMIT $4`,
      [u.id, sinceTime, sinceId, q.limit + 1],
    );
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      workouts: page.map((r: any) => out(r, withRoute)),
      // Where the next call continues. Unchanged when nothing new came back.
      cursor: last ? `${last.cursor_time}|${last.id}` : (q.since ?? null),
      more: rows.length > q.limit,
    };
  });

  app.get('/workouts/:id', async (req) => {
    const u = await authenticated(req);
    const wid = externalId.parse((req.params as any).id);
    const [row] = await db.query(
      `SELECT w.*, r.points FROM workouts w LEFT JOIN workout_routes r ON r.workout_id=w.id
       WHERE w.user_id=$1 AND w.external_id=$2 AND w.deleted_at IS NULL`,
      [u.id, wid],
    );
    requireValue(row, 404, 'Workout not found');
    return out(row, true);
  });

  // Deleting keeps only a tombstone: no route, no numbers.
  app.delete('/workouts/:id', async (req) => {
    const u = await authenticated(req);
    const wid = externalId.parse((req.params as any).id);
    await tx(async (c) => {
      const [row] = await c.query(
        `INSERT INTO workouts(id, user_id, external_id, activity, meters, seconds, started_at, source, deleted_at)
         VALUES($1,$2,$3,'Deleted',0,1,now(),'gps',now())
         ON CONFLICT (user_id, external_id) DO UPDATE SET
           deleted_at=coalesce(workouts.deleted_at, now()), updated_at=now(),
           meters=0, calories=NULL, heart_rate=NULL, steps=NULL, splits='{}', point_count=0,
           health_connect_id=NULL
         RETURNING id`,
        [id(), u.id, wid],
      );
      await c.query('DELETE FROM workout_routes WHERE workout_id=$1', [row.id]);
    });
    return { ok: true };
  });

  // Daily totals from the health app. A day only moves forward: an older sync never
  // overwrites a newer one.
  app.put('/health/days', async (req) => {
    const u = await authenticated(req);
    const { days } = z
      .object({ days: z.array(healthDay).min(1).max(400) })
      .strict()
      .parse(req.body);
    for (const d of days)
      await db.query(
        `INSERT INTO health_days(user_id, day, steps, calories, heart_rate, source, synced_at)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id, day) DO UPDATE SET steps=EXCLUDED.steps, calories=EXCLUDED.calories,
           heart_rate=EXCLUDED.heart_rate, source=EXCLUDED.source, synced_at=EXCLUDED.synced_at,
           updated_at=now()
         WHERE health_days.synced_at < EXCLUDED.synced_at`,
        [
          u.id,
          d.day,
          d.steps ?? null,
          d.calories == null ? null : Math.round(d.calories),
          d.heartRate == null ? null : Math.round(d.heartRate),
          d.source,
          iso(d.syncedAt),
        ],
      );
    return { ok: true, days: days.length };
  });

  app.get('/health/days', async (req) => {
    const u = await authenticated(req);
    const q = z
      .object({
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(req.query);
    const rows = await db.query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, steps, calories, heart_rate, source, synced_at
       FROM health_days WHERE user_id=$1
         AND ($2::date IS NULL OR day >= $2::date) AND ($3::date IS NULL OR day <= $3::date)
       ORDER BY day DESC LIMIT 400`,
      [u.id, q.from ?? null, q.to ?? null],
    );
    return {
      days: rows.map((r: any) => ({
        day: r.day,
        steps: r.steps,
        calories: r.calories,
        heartRate: r.heart_rate,
        source: r.source,
        syncedAt: ms(r.synced_at),
      })),
    };
  });
}

/** Removes every workout, route and health day of an account (account deletion). */
export async function deleteHealthData(c: DB, userId: string) {
  await c.query('DELETE FROM health_days WHERE user_id=$1', [userId]);
  await c.query('DELETE FROM workouts WHERE user_id=$1', [userId]);
}
