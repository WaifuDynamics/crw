import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';
import staticFiles from '@fastify/static';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { localUploadRoutes } from './routes/uploads.js';
import { ZodError } from 'zod';
import { config } from './config.js';
import { db } from './db.js';
import { hash } from './security.js';
import { authRoutes } from './routes/auth.js';
import { accountRoutes } from './routes/account.js';
import { repsRoutes } from './routes/reps.js';
import { workoutRoutes } from './routes/workouts.js';
import { discoveryRoutes } from './routes/discovery.js';
import { bookingRoutes } from './routes/booking.js';
import { socialRoutes } from './routes/social.js';
import { competeRoutes } from './routes/compete.js';
import { managementRoutes } from './routes/management.js';
import { adminRoutes } from './routes/admin.js';
import { repsMatchRoutes } from './routes/repsMatch.js';
import { emailRoutes } from './routes/email.js';
import { friendRoutes } from './routes/friends.js';
import { accountDeletionRoutes } from './routes/accountDeletion.js';
export async function buildApp() {
  const app = Fastify({
    logger: !config.test
      ? {
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers.set-cookie',
            'req.body.password',
            'req.body.token',
          ],
        }
      : false,
    bodyLimit: 1024 * 1024,
    // The API is addressed as /v1/...: the app, the website and anything else that talks to
    // CRW+ go through it. The routes themselves are written without the prefix, so /v1/x and
    // the older /x reach the same handler while apps from before v1 are still installed.
    // A breaking change gets a /v2 of its own; /v1 keeps working until nobody calls it.
    rewriteUrl: (req) => {
      const url = req.url || '/';
      if (url === '/v1' || url.startsWith('/v1?')) return '/' + url.slice(3);
      return url.startsWith('/v1/') ? url.slice(3) : url;
    },
    trustProxy: process.env.TRUST_PROXY === 'true',
    requestTimeout: 30000,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        formAction: ["'self'"],
      },
    },
  });
  await app.register(cookie);
  // Accept an empty JSON body (e.g. DELETE from older app builds that always send the
  // JSON content type) instead of rejecting the request.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = String(body);
    if (!text.trim()) return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      const error: any = new Error('Request body is not valid JSON');
      error.statusCode = 400;
      done(error, undefined);
    }
  });
  if (!config.production) {
    await mkdir(resolve('data/uploads'), { recursive: true });
    await app.register(staticFiles, {
      root: resolve('public/demo'),
      prefix: '/dev-media/',
      maxAge: '1d',
    });
    await app.register(staticFiles, {
      root: resolve('data/uploads'),
      prefix: '/media/local/',
      maxAge: '1d',
      decorateReply: false,
    });
    app.addHook('onSend', async (req, reply, payload) => {
      if (req.url.startsWith('/dev-media/') || req.url.startsWith('/media/local/'))
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      return payload;
    });
  }
  // Matchmaking for the rep counter is anonymous and is called by a page loaded from the
  // app's own files, whose origin is `null`: those routes answer any origin, without
  // credentials. Everything else keeps to the known origins.
  await app.register(cors, () => (req: any, callback: any) => {
    const open = String(req.url || '').startsWith('/reps/match/');
    callback(null, {
      origin: open ? true : config.origins,
      credentials: !open,
      // @fastify/cors only allows GET, HEAD and POST by default.
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    });
  });
  const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
    : undefined;
  if (redis)
    app.addHook('onClose', async () => {
      await redis.quit();
    });
  // Requests are counted per signed-in session rather than per address: a whole household
  // shares one public IP, and one misbehaving phone - one that once re-registered its push
  // token in a loop, eight times a second - used to spend the budget of every other device
  // at home, so their screens came up empty. Anonymous requests still count by address.
  await app.register(rateLimit, {
    max: config.test ? 10000 : 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const session = bearer || (req.cookies as any)?.pace_session;
      return session ? `s:${hash(session)}` : `ip:${req.ip}`;
    },
    ...(redis ? { redis } : {}),
  });
  app.addHook('onRequest', async (req, reply) => {
    if (
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) &&
      !req.url.startsWith('/webhooks/') &&
      !req.url.startsWith('/reps/match/')
    ) {
      const origin = req.headers.origin;
      if (origin && !config.origins.includes(origin))
        return reply.code(403).send({ error: 'Origin is not allowed' });
      if (
        req.cookies.pace_session &&
        !req.headers.authorization &&
        !origin &&
        req.headers['sec-fetch-site'] === 'cross-site'
      )
        return reply.code(403).send({ error: 'Cross-site request blocked' });
    }
  });
  app.setErrorHandler((error: any, req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: 'Please check your input',
        issues: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    if (error.code === '23505')
      return reply
        .code(409)
        .send({ error: 'This record already exists or the operation has already been completed' });
    if (error.code === '23503' || error.code === '22P02' || error.code === '23514')
      return reply.code(400).send({ error: 'Invalid reference or field value' });
    const status = error.statusCode || 500;
    if (status >= 500) req.log.error({ err: error }, 'Request failed');
    return reply.code(status).send({
      error: status >= 500 ? 'Service temporarily unavailable. Please try again.' : error.message,
      requestId: req.id,
    });
  });
  app.get('/health', { config: { rateLimit: false } }, async () => {
    await db.query('SELECT 1');
    return {
      status: 'ok',
      environment: config.production ? 'production' : 'development',
      payments: config.payments,
    };
  });
  // What the apps need to know about this API before anything else: which version it is,
  // the oldest app it still serves (older ones show an "update CRW+" screen instead of
  // failing in odd ways), and whether it is down for maintenance.
  app.get('/meta', { config: { rateLimit: false } }, async () => ({
    api: 'v1',
    minAppVersion: config.minAppVersion,
    latestAppVersion: config.latestAppVersion,
    maintenance: config.maintenance,
    updateUrl: config.updateUrl,
  }));
  // Calls without /v1 still work, for apps from before it; they are marked so the logs show
  // who still uses them. Addresses that live outside the API's versions - health checks,
  // payment webhooks, links in emails and the pages behind them - are left alone.
  const unversioned =
    /^\/(health|webhooks|delete-account|unsubscribe|legal|uploads|auth\/apple\/callback)(\/|\?|$)/;
  app.addHook('onRequest', async (req, reply) => {
    const original = req.originalUrl || req.url;
    if (!original.startsWith('/v1') && !unversioned.test(original)) {
      reply.header('Deprecation', 'true');
      reply.header('Link', '</v1>; rel="successor-version"');
    }
  });
  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(repsRoutes);
  await app.register(workoutRoutes);
  await app.register(friendRoutes);
  await app.register(emailRoutes);
  await app.register(accountDeletionRoutes);
  await app.register(discoveryRoutes);
  await app.register(bookingRoutes);
  await app.register(socialRoutes);
  await app.register(competeRoutes);
  await app.register(managementRoutes);
  await app.register(adminRoutes);
  await app.register(repsMatchRoutes);
  await app.register(localUploadRoutes);
  return app;
}
