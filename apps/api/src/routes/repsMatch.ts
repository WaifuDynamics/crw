import type { FastifyInstance } from 'fastify';

// Matchmaking for the rep counter (1v1 and 2v2 push-up and squat races), served by the
// CRW+ API. The counter itself ships inside the app, so the only thing it still needs
// from a server is somebody to race - and that now lives behind the CRW+ address rather
// than behind a public site of its own.
//
// The pairing engine stays the one the counter was built and tested with (Python, in the
// `reps` container on the internal Docker network); these routes pass requests through.
// They are anonymous - a player is only a random id and a name - so they carry no session
// and answer any origin, including `null`, which is what a page loaded from the app's own
// files reports.

const ENGINE = (process.env.REPS_INTERNAL_URL || 'http://reps:8000').replace(/\/+$/, '');

export async function repsMatchRoutes(app: FastifyInstance) {
  // A closing page reports with navigator.sendBeacon, which sends its JSON as text/plain.
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, body ? JSON.parse(String(body)) : {});
    } catch (e) {
      done(e as Error, undefined);
    }
  });

  // Each player polls about four times a second while it plays, so the general limit
  // (300 a minute per session) would cut a race short. A household racing together still
  // fits comfortably under this one.
  const limit = { rateLimit: { max: 1500, timeWindow: '1 minute' } };

  app.post('/reps/match/sync', { config: limit }, async (req, reply) => {
    const upstream = await fetch(`${ENGINE}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
      // The engine may hold a request open while it waits for the state to change.
      signal: AbortSignal.timeout(35_000),
    }).catch(() => null);
    if (!upstream) return reply.code(503).send({ error: 'Matchmaking is not available' });
    reply.code(upstream.status).header('content-type', 'application/json');
    return reply.send(await upstream.text());
  });

  app.get('/reps/match/queues', { config: limit }, async (_req, reply) => {
    const upstream = await fetch(`${ENGINE}/api/queues`, {
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!upstream) return reply.code(503).send({ error: 'Matchmaking is not available' });
    reply.code(upstream.status).header('content-type', 'application/json');
    return reply.send(await upstream.text());
  });
}
