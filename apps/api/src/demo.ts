// Development demo accounts: clearly fictional people with account details and a
// history of camera-counted matches, so the Play screen has something to show.
//
// Used by the seed for new databases, and runnable on its own for an existing
// development database (`npm run demo:accounts`, with the API stopped, because the
// embedded database allows one process at a time). Re-running changes nothing new.
import { tx, closeDB, type DB } from './db.js';
import { config } from './config.js';
import { id } from './security.js';

// Deliberately not real-sounding names, and no photos of real people.
export const DEMO_PEOPLE: [first: string, last: string][] = [
  ['Alex', 'Demo'],
  ['Olivia', 'Organizer'],
  ['Adam', 'Admin'],
  ['Pushup', 'Pete'],
  ['Squat', 'Sally'],
  ['Rep', 'Randy'],
  ['Plank', 'Paula'],
  ['Burpee', 'Ben'],
  ['Lunge', 'Lucy'],
  ['Sprint', 'Sam'],
  ['Core', 'Cora'],
  ['Stretch', 'Steve'],
];

export const demoEmail = (i: number) =>
  i === 0
    ? 'alex@pace.local'
    : i === 1
      ? 'organizer@pace.local'
      : i === 2
        ? 'admin@pace.local'
        : `member${i}@pace.local`;

export const demoName = (i: number) => DEMO_PEOPLE[i].join(' ');

const MATCHES = 60;
const TARGET = 20;

// Small deterministic generator: the same demo history on every machine and test run.
function generator(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export async function applyDemoAccounts(c: DB, now = new Date()) {
  const users: { id: string; name: string; skill: number }[] = [];
  for (let i = 0; i < DEMO_PEOPLE.length; i++) {
    const [u] = await c.query('SELECT id FROM users WHERE email=$1', [demoEmail(i)]);
    if (!u) continue;
    const [first, last] = DEMO_PEOPLE[i];
    await c.query('UPDATE profiles SET display_name=$2, avatar_url=NULL WHERE user_id=$1', [
      u.id,
      demoName(i),
    ]);
    // A Google-linked account belongs to a real person; leave its details alone.
    // Demo people have answered the sign-up questions, so they are never prompted.
    const body = [24 + ((i * 7) % 30), 58 + ((i * 11) % 40), 160 + ((i * 13) % 32)];
    await c.query(
      `INSERT INTO user_accounts(user_id, first_name, last_name, email, country_code, language,
         age, weight_kg, height_cm, onboarding_completed_at)
       VALUES($1,$2,$3,$4,'LB','en',$5,$6,$7,now())
       ON CONFLICT (user_id) DO UPDATE SET first_name=excluded.first_name,
         last_name=excluded.last_name, avatar_url=NULL, country_code='LB', language='en',
         age=excluded.age, weight_kg=excluded.weight_kg, height_cm=excluded.height_cm,
         onboarding_completed_at=coalesce(user_accounts.onboarding_completed_at, now()),
         updated_at=now()
       WHERE user_accounts.google_sub IS NULL`,
      [u.id, first, last, demoEmail(i), ...body],
    );
    // Earlier people in the list are stronger, so the ranking has a clear order.
    users.push({ id: u.id, name: demoName(i), skill: DEMO_PEOPLE.length - i + 4 });
  }
  if (users.length < 4) return { people: users.length, matches: 0, workouts: 0 };

  // Recent fictional workouts keep the distance leaderboard useful in development.
  // Stable external IDs make this safe to re-run; refreshing the timestamps also keeps
  // the weekly and monthly filters populated on long-lived local databases.
  for (const [i, user] of users.entries()) {
    const base = 3500 + (users.length - i) * 2300;
    for (const [session, scale, activity] of [
      [1, 1, 'Running'],
      [2, 0.75, 'Cycling'],
      [3, 0.55, 'Walking'],
    ] as const) {
      const meters = Math.round(base * scale);
      const startedAt = new Date(now.getTime() - session * 10 * 60_000);
      await c.query(
        `INSERT INTO workouts(id, user_id, external_id, activity, meters, seconds, started_at, source)
         VALUES($1,$2,$3,$4,$5,$6,$7,'gps')
         ON CONFLICT (user_id, external_id) DO UPDATE SET activity=excluded.activity,
           meters=excluded.meters, seconds=excluded.seconds, started_at=excluded.started_at,
           deleted_at=NULL, updated_at=now()`,
        [
          id(),
          user.id,
          `demo-distance-${session}`,
          activity,
          meters,
          Math.max(900, Math.round(meters / (activity === 'Cycling' ? 5.5 : 2.7))),
          startedAt,
        ],
      );
    }
  }

  const rand = generator(20260916);
  const pick = (count: number) => {
    const pool = [...users];
    const chosen = [];
    for (let k = 0; k < count; k++)
      chosen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    return chosen;
  };
  for (let n = 0; n < MATCHES; n++) {
    const mode = rand() < 0.65 ? '1v1' : '2v2';
    const exercise = rand() < 0.6 ? 'pushup' : 'squat';
    const players = pick(mode === '1v1' ? 2 : 4);
    const teams = [players.filter((_, k) => k % 2 === 0), players.filter((_, k) => k % 2 === 1)];
    const strength = teams.map(
      (t) => t.reduce((sum, p) => sum + p.skill, 0) * (0.7 + rand() * 0.6),
    );
    const winner = strength[0] >= strength[1] ? 0 : 1;
    const walkover = rand() < 0.08;
    const scores = [0, 0];
    scores[winner] = walkover ? 5 + Math.floor(rand() * 12) : TARGET;
    scores[1 - winner] = Math.min(scores[winner] - 1, 3 + Math.floor(rand() * 16));
    // spread over the last three weeks
    const playedAt = new Date(now.getTime() - (MATCHES - n) * 8 * 3600_000 - rand() * 3600_000);

    for (const side of [0, 1]) {
      let left = scores[side];
      for (const [k, p] of teams[side].entries()) {
        const reps = k === teams[side].length - 1 ? left : Math.round(left * (0.35 + rand() * 0.3));
        left -= reps;
        // sequential on purpose: these run inside the caller's transaction
        await c.query(
          `INSERT INTO rep_matches(id, user_id, external_id, mode, exercise, won, reason, reps,
               team_score, opponent_score, opponents, played_at)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (user_id, external_id) DO NOTHING`,
          [
            id(),
            p.id,
            `demo-${n + 1}`,
            mode,
            exercise,
            side === winner,
            walkover ? 'walkover' : 'target',
            reps,
            scores[side],
            scores[1 - side],
            teams[1 - side].map((o) => o.name.slice(0, 24)),
            playedAt,
          ],
        );
      }
    }
  }
  return { people: users.length, matches: MATCHES, workouts: users.length * 3 };
}

if (/\/demo\.(ts|js)$/.test(process.argv[1]?.replaceAll('\\', '/') || '')) {
  if (config.production) throw new Error('Demo accounts are forbidden in production');
  const result = await tx((c) => applyDemoAccounts(c));
  console.info(
    `Demo accounts ready: ${result.people} people, ${result.matches} demo matches, ${result.workouts ?? 0} leaderboard workouts (existing ones kept).`,
  );
  await closeDB();
}
