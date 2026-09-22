import { id } from './security.js';
import { notify } from './notifications.js';
import { type DB } from './db.js';
export async function award(
  c: DB,
  userId: string,
  source: string,
  sourceId: string,
  points: number,
  key: string,
  metadata: any = {},
) {
  await c.query(
    `INSERT INTO xp_transactions(id,user_id,source_type,source_id,points,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(idempotency_key) DO NOTHING`,
    [id(), userId, source, sourceId, points, key, JSON.stringify(metadata)],
  );
}
export async function streak(c: DB, userId: string, start?: string, end?: string) {
  const rows = await c.query(
    `SELECT DISTINCT date_trunc('week',e.starts_at AT TIME ZONE ci.timezone)::date week FROM checkins ch JOIN events e ON e.id=ch.event_id JOIN cities ci ON ci.id=e.city_id WHERE ch.user_id=$1 AND ($2::timestamptz IS NULL OR e.starts_at>=$2) AND ($3::timestamptz IS NULL OR e.starts_at<=$3) ORDER BY week DESC`,
    [userId, start || null, end || null],
  );
  let longest = 0,
    current = 0,
    previous: number | undefined;
  for (const r of rows) {
    const value = new Date(r.week).getTime();
    current = previous === undefined || previous - value === 7 * 86400000 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = value;
  }
  return longest;
}
export async function challengeProgress(c: DB, challenge: any, userId: string) {
  if (challenge.kind === 'streak') return streak(c, userId, challenge.starts_at, challenge.ends_at);
  const [row] = await c.query(
    `SELECT count(*)::int attended,count(DISTINCT e.category)::int categories FROM checkins ch JOIN events e ON e.id=ch.event_id WHERE ch.user_id=$1 AND e.starts_at>=$2 AND e.starts_at<=$3 AND ($4::text IS NULL OR e.category=$4)`,
    [
      userId,
      challenge.starts_at,
      challenge.ends_at,
      challenge.kind === 'category' ? challenge.category : null,
    ],
  );
  return challenge.kind === 'explorer' ? row.categories : row.attended;
}
export async function updateRewards(c: DB, userId: string, eventId: string) {
  const [rule] = await c.query(`SELECT points FROM xp_rules WHERE source='attendance' AND enabled`);
  if (rule)
    await award(c, userId, 'attendance', eventId, rule.points, `attendance:${eventId}:${userId}`);
  const [counts] = await c.query(
    `SELECT count(*)::int activities,count(DISTINCT e.category)::int categories,count(*) FILTER(WHERE extract(hour FROM e.starts_at AT TIME ZONE ci.timezone)<9)::int early,count(*) FILTER(WHERE extract(hour FROM e.starts_at AT TIME ZONE ci.timezone)>=19)::int night FROM checkins ch JOIN events e ON e.id=ch.event_id JOIN cities ci ON ci.id=e.city_id WHERE ch.user_id=$1`,
    [userId],
  );
  const [event] = await c.query('SELECT category FROM events WHERE id=$1', [eventId]);
  const [exploreRule] = await c.query(
    `SELECT points FROM xp_rules WHERE source='exploration' AND enabled`,
  );
  if (exploreRule)
    await award(
      c,
      userId,
      'exploration',
      eventId,
      exploreRule.points,
      `exploration:${event.category}:${userId}`,
      { category: event.category },
    );
  const challenges = await c.query(
    `SELECT c.* FROM challenges c JOIN challenge_participants p ON p.challenge_id=c.id WHERE p.user_id=$1 AND p.completed_at IS NULL AND c.enabled AND c.ends_at>=now()`,
    [userId],
  );
  for (const challenge of challenges) {
    const progress = await challengeProgress(c, challenge, userId);
    if (progress >= challenge.target) {
      await c.query(
        'UPDATE challenge_participants SET completed_at=now() WHERE challenge_id=$1 AND user_id=$2 AND completed_at IS NULL',
        [challenge.id, userId],
      );
      await award(
        c,
        userId,
        'challenge',
        challenge.id,
        challenge.reward_xp,
        `challenge:${challenge.id}:${userId}`,
      );
      await notify(
        c,
        userId,
        'Challenge complete',
        `${challenge.title} · +${challenge.reward_xp} XP`,
        'compete',
      );
    }
  }
  const bestStreak = await streak(c, userId);
  const achievements = await c.query('SELECT * FROM achievements WHERE enabled');
  for (const a of achievements) {
    const value = (
      {
        attendance: counts.activities,
        explorer: counts.categories,
        early: counts.early,
        night: counts.night,
        streak: bestStreak,
      } as Record<string, number>
    )[a.kind];
    if (value >= a.threshold) {
      const rows = await c.query(
        `INSERT INTO user_achievements(user_id,achievement_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING achievement_id`,
        [userId, a.id],
      );
      if (rows.length) await notify(c, userId, 'Achievement unlocked', a.title, 'compete');
    }
  }
}
