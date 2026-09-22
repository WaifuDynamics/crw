// The development seed stamps xp_transactions with now(), so a database seeded in an
// earlier week leaves the weekly leaderboard empty while monthly and all-time still fill.
// The ledger is append-only (see the xp_no_mutation trigger), so rather than re-dating the
// seeded rows this appends one compensating entry per competitor in the current week,
// carrying each competitor's existing all-time total so the standings match.
// The idempotency key is scoped to the week, so re-running within a week changes nothing.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import { PGlite } from '@electric-sql/pglite';

const apply = process.argv.includes('--apply');
const apiDir = new URL('../apps/api/', import.meta.url);
const env = parse(await readFile(new URL('.env', apiDir)));
if (env.NODE_ENV === 'production') throw new Error('Demo refresh is forbidden in production.');
if (env.DATABASE_URL)
  throw new Error('Demo refresh only supports the embedded development database.');

const db = new PGlite(fileURLToPath(new URL(env.DATA_DIR || './data/pace', apiDir)));
try {
  const [{ week_start }] = (
    await db.query(
      `SELECT date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' week_start`,
    )
  ).rows;
  const week = new Date(week_start).toISOString().slice(0, 10);

  // Only competitors the leaderboard would actually show are worth topping up.
  const { rows: standings } = await db.query(
    `SELECT x.user_id, p.display_name, sum(x.points)::int total,
            count(*) FILTER(WHERE x.created_at>=$1)::int this_week,
            (array_agg(x.source_id ORDER BY x.created_at DESC))[1] source_id
     FROM xp_transactions x
     JOIN users u ON u.id=x.user_id
     JOIN profiles p ON p.user_id=x.user_id
     WHERE u.status='active' AND p.visibility='public' AND p.compete
     GROUP BY x.user_id,p.display_name
     HAVING sum(x.points)>0
     ORDER BY sum(x.points) DESC`,
    [week_start],
  );
  if (!standings.length) throw new Error('No competitors found; run npm run seed first.');

  const stale = standings.filter((row) => !row.this_week);
  console.info(`competitors ${standings.length}`);
  console.info(`week starts ${new Date(week_start).toISOString()}`);
  console.info(`missing     ${stale.length} with no entry this week`);

  if (!stale.length) {
    console.info('\nThe weekly leaderboard already has entries; nothing to do.');
  } else if (!apply) {
    for (const row of stale.slice(0, 10))
      console.info(`  would add ${String(row.total).padStart(5)} pts  ${row.display_name}`);
    if (stale.length > 10) console.info(`  ...and ${stale.length - 10} more`);
    console.info('\nPass --apply to append these entries.');
  } else {
    await db.query('BEGIN');
    try {
      for (const row of stale)
        await db.query(
          `INSERT INTO xp_transactions(id,user_id,source_type,source_id,points,idempotency_key,metadata)
           VALUES($1,$2,'attendance',$3,$4,$5,$6) ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            randomUUID(),
            row.user_id,
            row.source_id,
            row.total,
            `demo:week:${week}:${row.user_id}`,
            JSON.stringify({ demo: true, note: 'development leaderboard refresh' }),
          ],
        );
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    const [{ n }] = (
      await db.query('SELECT count(*)::int n FROM xp_transactions WHERE created_at>=$1', [
        week_start,
      ])
    ).rows;
    console.info(`\nAppended ${stale.length} entries; ${n} now fall in the current week.`);
  }
} finally {
  await db.close();
}
