import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { config, sessionCookie } from '../config.js';
import {
  id,
  hash,
  password,
  passwordHash,
  passwordMatches,
  newSession,
  authenticated,
  requireValue,
  audit,
} from '../security.js';
import { email } from '../notifications.js';
import { accountFor } from './account.js';
import { resetPassword, verifyEmail } from '../emails.js';
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().max(128),
});
export async function authRoutes(app: FastifyInstance) {
  if (!config.production) {
    app.post('/auth/dev-session', async (_req, reply) => {
      const [user] = await db.query(
        `SELECT id FROM users WHERE email='alex@pace.local' AND status='active'`,
      );
      requireValue(user, 503, 'Run npm run seed before using the development sign-in');
      const token = await newSession(user.id);
      reply.setCookie('pace_session', token, {
        ...sessionCookie,
      });
      return { token, userId: user.id };
    });
  }
  app.post(
    '/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const body = credentials
        .extend({ password, displayName: z.string().trim().min(2).max(60) })
        .parse(req.body);
      const userId = id();
      const token = randomBytes(32).toString('base64url');
      const stored = await passwordHash(body.password);
      await tx(async (c) => {
        await c.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)', [
          userId,
          body.email,
          stored,
        ]);
        await c.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$2)', [
          userId,
          body.displayName,
        ]);
        await c.query(`INSERT INTO user_roles(user_id,role) VALUES($1,'USER')`, [userId]);
        await c.query('INSERT INTO user_accounts(user_id,first_name,email) VALUES($1,$2,$3)', [
          userId,
          body.displayName.slice(0, 80),
          body.email,
        ]);
        await c.query(
          `INSERT INTO auth_tokens(id,user_id,token_hash,kind,expires_at) VALUES($1,$2,$3,'verify',now()+interval '24 hours')`,
          [id(), userId, hash(token)],
        );
        await email(
          c,
          body.email,
          verifyEmail(`${config.appUrl}/?verify=${token}`, body.displayName),
        );
      });
      const session = await newSession(userId);
      reply.setCookie('pace_session', session, {
        ...sessionCookie,
      });
      return { token: session, userId, verificationRequired: true };
    },
  );
  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const body = credentials.parse(req.body);
      const [user] = await db.query(`SELECT * FROM users WHERE email=$1 AND status='active'`, [
        body.email,
      ]);
      const fallback = '00000000000000000000000000000000:' + '00'.repeat(64);
      const valid = await passwordMatches(body.password, user?.password_hash || fallback);
      requireValue(user && valid, 401, 'Email or password is incorrect');
      const token = await newSession(user.id);
      reply.setCookie('pace_session', token, {
        ...sessionCookie,
      });
      return { token, userId: user.id };
    },
  );
  app.post('/auth/logout', async (req, reply) => {
    const token = req.headers.authorization?.slice(7) || req.cookies.pace_session;
    if (token)
      await db.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [hash(token)]);
    reply.clearCookie('pace_session', { ...sessionCookie, maxAge: 0 });
    return { ok: true };
  });
  app.get('/auth/me', async (req) => {
    const u = await authenticated(req);
    const [p] = await db.query('SELECT * FROM profiles WHERE user_id=$1', [u.id]);
    return { ...u, ...p, account: await accountFor(db, u.id) };
  });
  app.post('/auth/verify', async (req) => {
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(req.body);
    return tx(async (c) => {
      const [t] = await c.query(
        `UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1 AND kind='verify' AND used_at IS NULL AND expires_at>now() RETURNING *`,
        [hash(token)],
      );
      requireValue(t, 400, 'This verification link is invalid or expired');
      await c.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [t.user_id]);
      return { ok: true };
    });
  });
  app.post(
    '/auth/resend',
    { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } },
    async (req) => {
      const u = await authenticated(req);
      if (!u.verified) {
        const token = randomBytes(32).toString('base64url');
        await tx(async (c) => {
          await c.query(
            `INSERT INTO auth_tokens(id,user_id,token_hash,kind,expires_at) VALUES($1,$2,$3,'verify',now()+interval '24 hours')`,
            [id(), u.id, hash(token)],
          );
          await email(c, u.email, verifyEmail(`${config.appUrl}/?verify=${token}`));
        });
      }
      return { ok: true };
    },
  );
  app.post(
    '/auth/forgot',
    { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } },
    async (req) => {
      const { email: address } = z
        .object({ email: z.email().transform((v) => v.toLowerCase()) })
        .parse(req.body);
      const [u] = await db.query(`SELECT id FROM users WHERE email=$1 AND status='active'`, [
        address,
      ]);
      if (u) {
        const token = randomBytes(32).toString('base64url');
        await tx(async (c) => {
          await c.query(
            `INSERT INTO auth_tokens(id,user_id,token_hash,kind,expires_at) VALUES($1,$2,$3,'reset',now()+interval '1 hour')`,
            [id(), u.id, hash(token)],
          );
          await email(c, address, resetPassword(`${config.appUrl}/?reset=${token}`));
        });
      }
      return { message: 'If an account exists, a reset link has been sent.' };
    },
  );
  app.post(
    '/auth/reset',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req) => {
      const body = z.object({ token: z.string().min(20).max(200), password }).parse(req.body);
      const stored = await passwordHash(body.password);
      return tx(async (c) => {
        const [t] = await c.query(
          `UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1 AND kind='reset' AND used_at IS NULL AND expires_at>now() RETURNING *`,
          [hash(body.token)],
        );
        requireValue(t, 400, 'Reset link is invalid or expired');
        await c.query('UPDATE users SET password_hash=$2 WHERE id=$1', [t.user_id, stored]);
        await c.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1', [t.user_id]);
        await audit(c, t.user_id, 'password.reset', 'user', t.user_id);
        return { ok: true };
      });
    },
  );
}
