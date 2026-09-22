import { db, tx, type DB } from './db.js';
import { config } from './config.js';
import { id } from './security.js';
import type { EmailContent } from './emails.js';
import { sendPush, type Device, type PushCategory } from './push.js';

/** The category a notification falls in when the caller does not say: taken from its link. */
export function categoryOf(link?: string | null): PushCategory {
  if (!link) return 'general';
  if (link === 'friends' || link.startsWith('profile/')) return 'social';
  if (link.startsWith('event/') || link.startsWith('booking/') || link === 'bookings')
    return 'events';
  if (link.startsWith('compete') || link === 'play') return 'compete';
  return 'general';
}

export async function notify(
  c: DB,
  userId: string,
  title: string,
  body: string,
  link?: string,
  options: { category?: PushCategory; image?: string | null; tag?: string } = {},
) {
  const notificationId = id();
  const category = options.category || categoryOf(link);
  await c.query(
    'INSERT INTO notifications(id,user_id,title,body,link,category) VALUES($1,$2,$3,$4,$5,$6)',
    [notificationId, userId, title, body, link || null, category],
  );
  await c.query(
    `INSERT INTO notification_outbox(id,notification_id,kind,payload) VALUES($1,$2,'push',$3)`,
    [
      id(),
      notificationId,
      JSON.stringify({
        userId,
        title,
        body,
        link,
        category,
        image: options.image || null,
        tag: options.tag,
      }),
    ],
  );
}
export async function email(c: DB, to: string, content: EmailContent) {
  const { subject, html, text, headers } = content;
  await c.query(`INSERT INTO notification_outbox(id,kind,payload) VALUES($1,'email',$2)`, [
    id(),
    JSON.stringify({ to, subject, html, text, ...(headers ? { headers } : {}) }),
  ]);
}
export async function deliverNotifications() {
  await db.query(
    `UPDATE notification_outbox SET status='pending' WHERE status='processing' AND available_at<now()-interval '10 minutes'`,
  );
  const jobs = await tx(async (c) => {
    const rows = await c.query(
      `SELECT * FROM notification_outbox WHERE status='pending' AND available_at<=now() AND attempts<8 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 25`,
    );
    for (const row of rows)
      await c.query(
        `UPDATE notification_outbox SET status='processing',attempts=attempts+1,available_at=now() WHERE id=$1`,
        [row.id],
      );
    return rows;
  });
  for (const job of jobs) {
    try {
      if (job.kind === 'email') {
        if (
          !config.production &&
          (!process.env.MAIL_PROVIDER || process.env.MAIL_PROVIDER === 'console')
        )
          console.info('[DEV EMAIL]', {
            to: job.payload.to,
            subject: job.payload.subject,
            text: job.payload.text,
          });
        else {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': job.id,
            },
            body: JSON.stringify({ ...job.payload, from: process.env.MAIL_FROM }),
          });
          if (!response.ok) throw new Error(`Email provider ${response.status}`);
        }
      } else {
        const devices = await db.query(
          'SELECT token, provider FROM device_tokens WHERE user_id=$1',
          [job.payload.userId],
        );
        if (devices.length && !config.test) {
          const { dead } = await sendPush(devices as unknown as Device[], job.payload);
          if (dead.length)
            await db.query('DELETE FROM device_tokens WHERE token = ANY($1)', [dead]);
        }
      }
      await db.query(`UPDATE notification_outbox SET status='sent',last_error=NULL WHERE id=$1`, [
        job.id,
      ]);
    } catch (e) {
      await db.query(
        `UPDATE notification_outbox SET status=$2,last_error=$3,available_at=now()+interval '1 minute' * power(2,LEAST(attempts,8)) WHERE id=$1`,
        [job.id, job.attempts >= 7 ? 'failed' : 'pending', String(e).slice(0, 500)],
      );
    }
  }
}
