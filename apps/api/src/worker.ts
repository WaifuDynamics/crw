import { db, tx } from './db.js';
import { processRefunds, cancelBooking } from './bookings.js';
import { deliverNotifications } from './notifications.js';
import { queueDailyDigests, queueReminders } from './marketing.js';
import { notify } from './notifications.js';
import { id, audit } from './security.js';
export async function runJobs() {
  await db.query(
    `UPDATE bookings SET status='expired' WHERE status='reserved' AND expires_at<=now()`,
  );
  // Resume partially processed event cancellations after a restart.
  const cancelled = await db.query(
    `SELECT b.id,e.created_by FROM bookings b JOIN events e ON e.id=b.event_id WHERE e.status='cancelled' AND b.status IN ('reserved','confirmed') AND NOT EXISTS(SELECT 1 FROM checkins ch WHERE ch.event_id=e.id AND ch.user_id=b.user_id) LIMIT 100`,
  );
  for (const b of cancelled) await cancelBooking(b.created_by, b.id, true);
  await processRefunds();
  await queueDailyDigests();
  await queueReminders();
  await deliverNotifications();
  for (const period of ['weekly', 'monthly', 'all']) {
    const cutoff =
      period === 'weekly'
        ? `date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`
        : period === 'monthly'
          ? `date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`
          : `'1970-01-01'::timestamptz`;
    for (const scope of ['global', 'city', 'country']) {
      const scopeExpr =
        scope === 'global'
          ? `'global'`
          : scope === 'city'
            ? `'city:'||p.city_id::text`
            : `'country:'||ci.country_code`;
      await db.query(
        `INSERT INTO leaderboard_snapshots(user_id,scope,period,snapshot_date,rank,score) SELECT user_id,scope,$1,current_date,rank() OVER(PARTITION BY scope ORDER BY score DESC),score FROM(SELECT x.user_id,${scopeExpr} scope,sum(x.points) score FROM xp_transactions x JOIN users u ON u.id=x.user_id JOIN profiles p ON p.user_id=u.id LEFT JOIN cities ci ON ci.id=p.city_id WHERE x.created_at>=${cutoff} AND u.status='active' AND p.compete AND p.visibility='public' AND ${scopeExpr} IS NOT NULL GROUP BY x.user_id,p.city_id,ci.country_code HAVING sum(x.points)>0) s ON CONFLICT(user_id,scope,period,snapshot_date) DO UPDATE SET rank=EXCLUDED.rank,score=EXCLUDED.score`,
        [period],
      );
    }
  }
  await tx(async (c) => {
    const awards = await c.query(
      `INSERT INTO user_achievements(user_id,achievement_id) SELECT s.user_id,a.id FROM leaderboard_snapshots s JOIN achievements a ON a.kind='ranking' AND a.enabled AND a.slug<>'season-champion' AND s.rank<=a.threshold WHERE s.scope='global' AND s.period='all' AND s.snapshot_date=current_date ON CONFLICT DO NOTHING RETURNING *`,
    );
    for (const a of awards) {
      const [badge] = await c.query('SELECT title FROM achievements WHERE id=$1', [
        a.achievement_id,
      ]);
      await notify(c, a.user_id, 'A place in the pack', `${badge.title} unlocked`, 'compete');
    }
  });
  await tx(async (c) => {
    const seasons = await c.query(
      'SELECT * FROM seasons WHERE ends_at<now() AND finalized_at IS NULL FOR UPDATE SKIP LOCKED',
    );
    for (const season of seasons) {
      const rankings = await c.query(
        `SELECT user_id,score,rank() OVER(ORDER BY score DESC)::int rank FROM(SELECT x.user_id,sum(x.points)::bigint score FROM xp_transactions x JOIN users u ON u.id=x.user_id JOIN profiles p ON p.user_id=u.id WHERE x.created_at>=$1 AND x.created_at<$2 AND u.status='active' AND p.compete AND p.visibility='public' GROUP BY x.user_id HAVING sum(x.points)>0) s`,
        [season.starts_at, season.ends_at],
      );
      for (const rank of rankings) {
        await c.query(
          `INSERT INTO leaderboard_snapshots(user_id,scope,period,snapshot_date,rank,score) VALUES($1,$2,'season',$3,$4,$5) ON CONFLICT DO NOTHING`,
          [rank.user_id, `season:${season.id}`, season.ends_at, rank.rank, rank.score],
        );
        if (rank.rank === 1) {
          await c.query(
            `INSERT INTO user_achievements(user_id,achievement_id) SELECT $1,id FROM achievements WHERE slug='season-champion' AND enabled ON CONFLICT DO NOTHING`,
            [rank.user_id],
          );
          await notify(
            c,
            rank.user_id,
            'Season champion',
            `You finished first in ${season.name}.`,
            'compete',
          );
        }
      }
      await c.query('UPDATE seasons SET finalized_at=now() WHERE id=$1', [season.id]);
      await audit(c, null, 'season.finalized', 'season', season.id, {
        participants: rankings.length,
      });
    }
  });
}
