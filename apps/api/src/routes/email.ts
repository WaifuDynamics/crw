import type { FastifyInstance } from 'fastify';
import { tx } from '../db.js';
import { audit } from '../security.js';
import { unsubscribeConfirmPage, unsubscribedPage, verifyUnsubscribeToken } from '../emails.js';

// Unsubscribe links from marketing email. No sign-in needed: the token is an HMAC of the
// user id. GET only shows a confirmation page, because link scanners in mail clients open
// links on their own. POST unsubscribes, from that page or from the one-click
// List-Unsubscribe header (RFC 8058).
export async function emailRoutes(app: FastifyInstance) {
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))),
  );

  const token = (req: any) => String(req.query?.token || req.body?.token || '');

  app.get(
    '/email/unsubscribe',
    { config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const t = token(req);
      reply.type('text/html').header('Cache-Control', 'no-store');
      if (!verifyUnsubscribeToken(t)) return reply.code(400).send(unsubscribedPage(false));
      return unsubscribeConfirmPage(t);
    },
  );

  app.post(
    '/email/unsubscribe',
    { config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const userId = verifyUnsubscribeToken(token(req));
      reply.type('text/html').header('Cache-Control', 'no-store');
      if (!userId) return reply.code(400).send(unsubscribedPage(false));
      await tx(async (c) => {
        const changed = await c.query(
          `UPDATE user_accounts SET marketing_opt_in=false, marketing_opt_out_at=now(), updated_at=now()
           WHERE user_id=$1 AND marketing_opt_in RETURNING user_id`,
          [userId],
        );
        if (changed.length)
          await audit(c, userId, 'marketing.unsubscribed', 'user', userId, { via: 'email-link' });
      });
      return unsubscribedPage(true);
    },
  );
}
