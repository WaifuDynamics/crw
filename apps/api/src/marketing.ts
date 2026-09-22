import { db, tx } from './db.js';
import { config } from './config.js';
import { email } from './notifications.js';
import { dailyDigest, comeBackReminder } from './emails.js';

// The daily digest for people who opted in to marketing email. Runs with the other
// background jobs; each person gets at most one per UTC day (marketing_sends).

// Hour (UTC) after which the day's digest goes out. 7 UTC is 8-9 in the morning in Poland.
const SEND_HOUR_UTC = Number(process.env.MARKETING_SEND_HOUR_UTC ?? 7);
const BATCH = 50;

const CHALLENGES = [
  {
    title: '3 × 10 push-ups',
    body: 'Three sets of ten, a minute of rest between them. Good form beats speed.',
  },
  {
    title: '50 squats, any way',
    body: 'Split them however you like – just hit fifty before tonight.',
  },
  { title: 'Beat your best set', body: 'One all-out set of push-ups. Can you top your record?' },
  { title: '20-minute walk or run', body: 'Get outside for twenty minutes. Easy pace counts.' },
  {
    title: 'Squat ladder 5-10-15',
    body: 'Five squats, then ten, then fifteen. Rest as long as you need.',
  },
  { title: 'Challenge a stranger', body: 'Jump into a 1v1 and race someone to 20 reps.' },
  {
    title: 'Rest & stretch day',
    body: 'Ten minutes of easy stretching. Recovery is training too.',
  },
];

export const challengeFor = (date: Date) =>
  CHALLENGES[Math.floor(date.getTime() / 86400000) % CHALLENGES.length];

export function formatMoney(minor: number, currency: string) {
  if (!minor) return 'Free';
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

export function eventTime(date: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    }).format(date);
  } catch {
    return date.toUTCString().slice(0, 22);
  }
}

/** Everyone who should get today's digest and has not had one yet. */
async function recipients(today: string, limit: number) {
  return db.query(
    `SELECT u.id, u.email, a.first_name, p.city_id
     FROM user_accounts a
     JOIN users u ON u.id=a.user_id
     LEFT JOIN profiles p ON p.user_id=u.id
     WHERE a.marketing_opt_in AND u.status='active' AND u.email_verified_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM marketing_sends s WHERE s.user_id=u.id AND s.sent_on=$1)
     ORDER BY u.id LIMIT $2`,
    [today, limit],
  );
}

export async function digestFor(
  userId: string,
  firstName: string,
  cityId: string | null,
  now = new Date(),
) {
  const events = await db.query(
    `SELECT e.id, e.title, e.starts_at, e.location_name, e.price_minor, e.currency, e.cover_url,
       ci.name city, ci.timezone
     FROM events e JOIN cities ci ON ci.id=e.city_id
     WHERE e.status='published' AND e.starts_at > $1::timestamptz
       AND e.starts_at < $1::timestamptz + interval '7 days'
     ORDER BY (e.city_id = $2::uuid) DESC NULLS LAST, e.featured DESC, e.starts_at
     LIMIT 3`,
    [now.toISOString(), cityId],
  );
  const [solo] = await db.query(
    `SELECT coalesce(sum(reps),0)::int reps, coalesce(max(best_set),0)::int best_set
     FROM rep_sessions WHERE user_id=$1`,
    [userId],
  );
  const [wins] = await db.query(
    `SELECT count(*) FILTER (WHERE won)::int wins FROM rep_matches WHERE user_id=$1`,
    [userId],
  );
  return dailyDigest({
    userId,
    firstName: (firstName || '').split(' ')[0].slice(0, 30),
    challenge: challengeFor(now),
    events: events.map((e: any) => ({
      title: e.title,
      when: eventTime(new Date(e.starts_at), e.timezone),
      place: `${e.location_name}, ${e.city}`,
      price: formatMoney(e.price_minor, e.currency),
      url: `${config.appUrl}/event/${e.id}`,
      cover: e.cover_url,
    })),
    solo: { reps: solo.reps, bestSet: solo.best_set },
    wins: wins.wins,
    date: new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(now),
  });
}

/** Queue today's digests. Safe to call often: it only acts after the send hour. */
export async function queueDailyDigests(now = new Date()) {
  if (process.env.MARKETING_EMAILS === 'off') return 0;
  if (now.getUTCHours() < SEND_HOUR_UTC) return 0;
  const today = now.toISOString().slice(0, 10);
  let queued = 0;
  for (;;) {
    const people = await recipients(today, BATCH);
    if (!people.length) break;
    for (const person of people) {
      const content = await digestFor(person.id, person.first_name, person.city_id, now);
      await tx(async (c) => {
        // The primary key makes a second send on the same day impossible.
        const claimed = await c.query(
          `INSERT INTO marketing_sends(user_id, sent_on) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id`,
          [person.id, today],
        );
        if (claimed.length) {
          await email(c, person.email, content);
          queued++;
        }
      });
    }
    if (people.length < BATCH) break;
  }
  return queued;
}

// Reminders: nudge opted-in people who have not trained in a while, at most one per
// cooldown window. Reuses the marketing opt-in and the send hour.
const REMINDER_INACTIVE_DAYS = Number(process.env.REMINDER_INACTIVE_DAYS ?? 7);
const REMINDER_COOLDOWN_DAYS = Number(process.env.REMINDER_COOLDOWN_DAYS ?? 10);

export async function queueReminders(now = new Date()) {
  if (process.env.MARKETING_EMAILS === 'off') return 0;
  if (now.getUTCHours() < SEND_HOUR_UTC) return 0;
  const today = now.toISOString().slice(0, 10);
  const people = await db.query(
    `SELECT u.id, u.email, a.first_name,
       GREATEST(
         COALESCE((SELECT max(started_at) FROM workouts WHERE user_id=u.id AND deleted_at IS NULL), 'epoch'::timestamptz),
         COALESCE((SELECT max(created_at) FROM checkins WHERE user_id=u.id), 'epoch'::timestamptz),
         COALESCE((SELECT max(created_at) FROM rep_sessions WHERE user_id=u.id), 'epoch'::timestamptz)
       ) AS last_active
     FROM user_accounts a
     JOIN users u ON u.id=a.user_id
     WHERE a.marketing_opt_in AND u.status='active' AND u.email_verified_at IS NOT NULL
       AND u.created_at < now() - ($1 || ' days')::interval
       AND NOT EXISTS (SELECT 1 FROM reminder_sends r WHERE r.user_id=u.id AND r.sent_on > current_date - $2::int)
     ORDER BY u.id LIMIT $3`,
    [REMINDER_INACTIVE_DAYS, REMINDER_COOLDOWN_DAYS, BATCH],
  );
  let queued = 0;
  for (const person of people) {
    const days = Math.floor((now.getTime() - new Date(person.last_active).getTime()) / 86400000);
    if (days < REMINDER_INACTIVE_DAYS) continue; // trained recently
    await tx(async (c) => {
      const claimed = await c.query(
        `INSERT INTO reminder_sends(user_id, sent_on) VALUES($1,$2)
         ON CONFLICT (user_id) DO UPDATE SET sent_on=$2
           WHERE reminder_sends.sent_on <= current_date - $3::int
         RETURNING user_id`,
        [person.id, today, REMINDER_COOLDOWN_DAYS],
      );
      if (claimed.length) {
        await email(c, person.email, comeBackReminder({ userId: person.id, firstName: person.first_name, days }));
        queued++;
      }
    });
  }
  return queued;
}
