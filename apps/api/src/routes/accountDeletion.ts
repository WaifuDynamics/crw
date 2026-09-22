import type { FastifyInstance } from 'fastify';
import { deleteHealthData } from './workouts.js';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db, tx, type DB } from '../db.js';
import { config } from '../config.js';
import { audit, authenticated, hash, id, requireValue } from '../security.js';
import { email } from '../notifications.js';
import {
  accountDeletedPage,
  deleteAccountEmail,
  deleteConfirmPage,
  deleteLinkProblemPage,
} from '../emails.js';

// Deleting an account takes two steps: the signed-in app asks for it, and the owner
// confirms with the button in the email we send. The link opens a page on the API;
// only its form POST deletes anything, because mail scanners open links on their own.

async function upcomingBookings(c: DB, userId: string) {
  return (
    await c.query(
      `SELECT 1 FROM bookings WHERE user_id=$1 AND status IN ('reserved','confirmed','refund_pending')
       AND event_id IN (SELECT id FROM events WHERE ends_at>now()) LIMIT 1`,
      [userId],
    )
  ).length;
}

export async function deleteAccount(c: DB, userId: string, via: string) {
  await c.query(`UPDATE users SET status='deleted',deleted_at=now(),email=$2 WHERE id=$1`, [
    userId,
    `deleted-${userId}@invalid.local`,
  ]);
  await c.query(
    `UPDATE profiles SET display_name='Deleted account',bio='',avatar_url=NULL,visibility='private',compete=false,show_attendance=false WHERE user_id=$1`,
    [userId],
  );
  // Personal account details go too; the row stays so foreign keys and the audit log hold.
  await c.query(
    `UPDATE user_accounts SET google_sub=NULL, avatar_url=NULL, first_name='', last_name='',
       email=$2, age=NULL, weight_kg=NULL, height_cm=NULL,
       marketing_opt_in=false, marketing_opt_out_at=now(), updated_at=now()
     WHERE user_id=$1`,
    [userId, `deleted-${userId}@invalid.local`],
  );
  await c.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [userId]);
  await c.query('DELETE FROM device_tokens WHERE user_id=$1', [userId]);
  // Workouts, routes and health data are personal: they go completely.
  await deleteHealthData(c, userId);
  await c.query('DELETE FROM friendships WHERE requester_id=$1 OR addressee_id=$1', [userId]);
  await c.query('UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [
    userId,
  ]);
  await audit(c, userId, 'account.deleted', 'user', userId, { via });
}

export const maskEmail = (address: string) =>
  address.replace(
    /^(.)(.*)(@.*)$/,
    (_, first: string, middle: string, domain: string) =>
      `${first}${'•'.repeat(Math.min(6, middle.length))}${domain}`,
  );

const tokenOf = (req: any) =>
  z
    .string()
    .min(20)
    .max(200)
    .safeParse(req.query?.token ?? req.body?.token).data;

export async function accountDeletionRoutes(app: FastifyInstance) {
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))),
  );

  // Step 1, from the app: email a confirmation link. Nothing is deleted yet.
  app.delete(
    '/account',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req) => {
      const u = await authenticated(req, true);
      return tx(async (c) => {
        requireValue(
          !(await upcomingBookings(c, u.id)),
          409,
          'Cancel upcoming bookings before deleting your account',
        );
        const [user] = await c.query('SELECT email FROM users WHERE id=$1', [u.id]);
        const [account] = await c.query('SELECT first_name FROM user_accounts WHERE user_id=$1', [
          u.id,
        ]);
        // Only the newest link works.
        await c.query(
          `UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND kind='delete_account' AND used_at IS NULL`,
          [u.id],
        );
        const token = randomBytes(32).toString('base64url');
        await c.query(
          `INSERT INTO auth_tokens(id,user_id,token_hash,kind,expires_at)
           VALUES($1,$2,$3,'delete_account',now()+interval '1 hour')`,
          [id(), u.id, hash(token)],
        );
        const link = `${config.apiUrl}/account/delete/confirm?token=${encodeURIComponent(token)}`;
        await email(c, user.email, deleteAccountEmail(link, account?.first_name));
        await audit(c, u.id, 'account.deletion_requested', 'user', u.id);
        return {
          emailSent: true,
          email: maskEmail(user.email),
          message: 'Check your inbox and confirm with the button in the email.',
        };
      });
    },
  );

  // Web deletion request without requiring active login session
  app.post(
    '/account/delete/request-web',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const emailInput = z
        .string()
        .email()
        .safeParse((req.body as any)?.email).data;
      if (!emailInput) {
        return reply.code(400).send({ error: 'Valid email address is required' });
      }
      await tx(async (c) => {
        const [user] = await c.query(
          `SELECT id, email FROM users WHERE LOWER(email)=LOWER($1) AND status<>'deleted'`,
          [emailInput],
        );
        if (user) {
          const [account] = await c.query(
            'SELECT first_name FROM user_accounts WHERE user_id=$1',
            [user.id],
          );
          await c.query(
            `UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND kind='delete_account' AND used_at IS NULL`,
            [user.id],
          );
          const token = randomBytes(32).toString('base64url');
          await c.query(
            `INSERT INTO auth_tokens(id,user_id,token_hash,kind,expires_at)
             VALUES($1,$2,$3,'delete_account',now()+interval '1 hour')`,
            [id(), user.id, hash(token)],
          );
          const link = `${config.apiUrl}/account/delete/confirm?token=${encodeURIComponent(token)}`;
          await email(c, user.email, deleteAccountEmail(link, account?.first_name));
          await audit(c, user.id, 'account.deletion_requested_web', 'user', user.id);
        }
      });
      return {
        ok: true,
        message: 'If an account exists with this email, a confirmation link has been sent.',
      };
    },
  );

  app.get('/delete-account', async (_req, reply) => {
    return reply.redirect(`${config.appUrl}/delete-account`, 302);
  });

  // Step 2a: the link from the email shows what will happen.
  app.get(
    '/account/delete/confirm',
    { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      reply.type('text/html').header('Cache-Control', 'no-store');
      const token = tokenOf(req);
      const [t] = token
        ? await db.query(
            `SELECT u.email FROM auth_tokens t JOIN users u ON u.id=t.user_id
             WHERE t.token_hash=$1 AND t.kind='delete_account' AND t.used_at IS NULL
               AND t.expires_at>now() AND u.status<>'deleted'`,
            [hash(token)],
          )
        : [];
      if (!t) return reply.code(400).send(deleteLinkProblemPage());
      return deleteConfirmPage(token!, maskEmail(t.email));
    },
  );

  // Step 2b: the button on that page deletes the account.
  app.post(
    '/account/delete/confirm',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      reply.type('text/html').header('Cache-Control', 'no-store');
      const token = tokenOf(req);
      if (!token) return reply.code(400).send(deleteLinkProblemPage());
      const outcome = await tx(async (c) => {
        const [t] = await c.query(
          `SELECT t.id, t.user_id FROM auth_tokens t JOIN users u ON u.id=t.user_id
           WHERE t.token_hash=$1 AND t.kind='delete_account' AND t.used_at IS NULL
             AND t.expires_at>now() AND u.status<>'deleted'
           FOR UPDATE OF t`,
          [hash(token)],
        );
        if (!t) return 'invalid' as const;
        if (await upcomingBookings(c, t.user_id)) return 'bookings' as const;
        await c.query('UPDATE auth_tokens SET used_at=now() WHERE id=$1', [t.id]);
        await deleteAccount(c, t.user_id, 'email-confirmation');
        return 'deleted' as const;
      });
      if (outcome === 'invalid') return reply.code(400).send(deleteLinkProblemPage());
      if (outcome === 'bookings')
        return reply
          .code(409)
          .send(
            deleteLinkProblemPage(
              'You have upcoming bookings. Cancel them in CRW+ first, then request a new link.',
            ),
          );
      return accountDeletedPage();
    },
  );
}
