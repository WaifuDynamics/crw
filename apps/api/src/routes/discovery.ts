import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { actor, authenticated, id, uuid, requireValue } from '../security.js';
export const pathId = (req: any) => uuid.parse(req.params.id);
export const publicPerson = `p.visibility='public' AND p.show_attendance AND u.status='active' AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$1 AND bl.blocked_id=u.id) OR (bl.blocked_id=$1 AND bl.blocker_id=u.id))`;
export const eventSelect = `SELECT e.*,co.name community_name,co.verified,co.logo_url,ci.name city,ci.country_code,ci.timezone,
 (SELECT count(*)::int FROM bookings b WHERE b.event_id=e.id AND b.status='confirmed') attendee_count,
 e.capacity-(SELECT count(*)::int FROM bookings b WHERE b.event_id=e.id AND (b.status='confirmed' OR(b.status='reserved' AND b.expires_at>now()))) spots_remaining,
 COALESCE((SELECT json_agg(a) FROM (SELECT u.id,p.display_name,p.avatar_url FROM bookings b JOIN users u ON u.id=b.user_id JOIN profiles p ON p.user_id=u.id WHERE b.event_id=e.id AND b.status='confirmed' AND ${publicPerson} ORDER BY b.confirmed_at LIMIT 5) a),'[]') attendees,
 (SELECT count(*)::int FROM bookings b JOIN follows f ON f.following_id=b.user_id JOIN profiles p ON p.user_id=b.user_id JOIN users u ON u.id=b.user_id WHERE b.event_id=e.id AND b.status='confirmed' AND f.follower_id=$1 AND ${publicPerson}) friends_going
 FROM events e JOIN communities co ON co.id=e.community_id JOIN cities ci ON ci.id=e.city_id`;
export async function discoveryRoutes(app: FastifyInstance) {
  app.get('/catalog', async () => ({
    categories: await db.query('SELECT * FROM event_categories WHERE enabled ORDER BY name'),
    cities: await db.query(
      'SELECT ci.* FROM cities ci JOIN countries c ON c.code=ci.country_code WHERE c.enabled ORDER BY ci.name',
    ),
    currencies: await db.query('SELECT * FROM currencies'),
    countries: await db.query('SELECT * FROM countries WHERE enabled'),
  }));
  app.get('/events', async (req) => {
    const u = await actor(req, true);
    const q = z
      .object({
        q: z.string().max(100).optional(),
        category: z.string().max(40).optional(),
        city: uuid.optional(),
        when: z.enum(['now', 'today', 'tonight', 'tomorrow', 'weekend']).optional(),
        free: z.enum(['true', 'false']).optional(),
        maxPrice: z.coerce.number().int().min(0).optional(),
        beginner: z.enum(['true']).optional(),
        friends: z.enum(['true']).optional(),
        sort: z.enum(['trending', 'soon']).default('soon'),
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
        radius: z.coerce.number().min(1).max(500).default(25),
        limit: z.coerce.number().int().min(1).max(100).default(30),
        offset: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .parse(req.query);
    const params: any[] = [u?.id || null];
    const where = [`e.status='published'`, `co.verified`, `co.status='active'`, `e.ends_at>now()`];
    const add = (sql: string, value: any) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (q.q)
      add(
        `(e.title ILIKE ? OR e.description ILIKE ? OR co.name ILIKE ? OR ci.name ILIKE ?)`,
        `%${q.q}%`,
      ); // same bound parameter for all search fields
    if (q.q) where[where.length - 1] = where[where.length - 1].replaceAll('?', `$${params.length}`);
    if (q.category) add('e.category=?', q.category);
    if (q.city) add('e.city_id=?', q.city);
    if (q.free) where.push(q.free === 'true' ? 'e.price_minor=0' : 'e.price_minor>0');
    if (q.maxPrice !== undefined) add('e.price_minor<=?', q.maxPrice);
    if (q.beginner) where.push(`e.difficulty IN ('beginner','all')`);
    const local = `e.starts_at AT TIME ZONE ci.timezone`,
      today = `date_trunc('day',now() AT TIME ZONE ci.timezone)`;
    if (q.when === 'now') where.push(`e.starts_at<=now() AND e.ends_at>now()`);
    if (q.when === 'today') where.push(`${local}>=${today} AND ${local}<${today}+interval '1 day'`);
    if (q.when === 'tonight')
      where.push(`${local}>=${today}+interval '18 hours' AND ${local}<${today}+interval '1 day'`);
    if (q.when === 'tomorrow')
      where.push(`${local}>=${today}+interval '1 day' AND ${local}<${today}+interval '2 days'`);
    if (q.when === 'weekend')
      where.push(
        `${local}>=${today} AND extract(isodow FROM ${local}) IN (6,7) AND ${local}<date_trunc('week',now() AT TIME ZONE ci.timezone)+interval '1 week'`,
      );
    if (q.friends) {
      requireValue(u, 401, 'Sign in to see your people');
      where.push(
        `EXISTS(SELECT 1 FROM bookings b JOIN follows f ON f.following_id=b.user_id JOIN profiles p ON p.user_id=b.user_id JOIN users u ON u.id=b.user_id WHERE b.event_id=e.id AND b.status='confirmed' AND f.follower_id=$1 AND ${publicPerson})`,
      );
    }
    let distance = '';
    if (q.lat !== undefined && q.lng !== undefined) {
      params.push(q.lat, q.lng, q.radius);
      const i = params.length;
      distance = `6371*acos(least(1.0,greatest(-1.0,sin(radians($${i - 2}::float8))*sin(radians(e.latitude))+cos(radians($${i - 2}::float8))*cos(radians(e.latitude))*cos(radians(e.longitude-$${i - 1}::float8)))))`;
      where.push(`${distance}<=$${i}`);
    }
    const order = q.sort === 'trending' ? 'attendee_count DESC,e.starts_at' : 'e.starts_at';
    params.push(q.limit, q.offset);
    let select = eventSelect;
    if (distance) select = select.replace('SELECT e.*,', `SELECT ${distance} distance_km,e.*,`);
    const rows = await db.query(
      `${select} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { events: rows, nextOffset: rows.length === q.limit ? q.offset + q.limit : null };
  });
  app.get('/events/:id', async (req) => {
    const u = await actor(req, true);
    const [e] = await db.query(
      `${eventSelect} WHERE e.id=$2 AND e.status IN ('published','completed') AND co.verified AND co.status='active'`,
      [u?.id || null, pathId(req)],
    );
    requireValue(e, 404, 'Activity not found');
    const [fee] = await db.query(
      'SELECT * FROM platform_fee_rules WHERE country_code=$1 AND currency=$2 AND enabled',
      [e.country_code, e.currency],
    );
    e.fee_minor =
      e.price_minor && fee
        ? fee.fixed_minor + Math.round((e.price_minor * fee.basis_points) / 10000)
        : 0;
    e.total_minor = e.price_minor + e.fee_minor;
    e.media = await db.query('SELECT * FROM event_media WHERE event_id=$1 ORDER BY position', [
      e.id,
    ]);
    return e;
  });
  // What is happening today. With a position it counts only what is within `radius` of
  // it, which is what the "the city is moving" card on Discover shows; without one it
  // counts everywhere, and the app is careful not to name a city in that case.
  app.get('/discover/stats', async (req) => {
    const u = await actor(req, true);
    const q = z
      .object({
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
        radius: z.coerce.number().min(1).max(500).default(25),
      })
      .parse(req.query);
    const params: any[] = [u?.id || null];
    let near = '';
    if (q.lat !== undefined && q.lng !== undefined) {
      params.push(q.lat, q.lng, q.radius);
      const i = params.length;
      // The same great-circle distance /discover uses for "near me", in kilometres.
      near = ` AND 6371*acos(least(1.0,greatest(-1.0,sin(radians($${i - 2}::float8))*sin(radians(e.latitude))+cos(radians($${i - 2}::float8))*cos(radians(e.latitude))*cos(radians(e.longitude-$${i - 1}::float8)))))<=$${i}`;
    }
    const [s] = await db.query(
      `SELECT count(DISTINCT e.id)::int activities,count(DISTINCT b.user_id) FILTER(WHERE b.status='confirmed')::int people,count(DISTINCT e.id) FILTER(WHERE e.category='running')::int runs,count(DISTINCT e.id) FILTER(WHERE e.category='hiking')::int hikes,count(DISTINCT e.id) FILTER(WHERE e.category IN ('padel','football','basketball','volleyball'))::int games,count(DISTINCT b.user_id) FILTER(WHERE b.status='confirmed' AND EXISTS(SELECT 1 FROM follows f JOIN profiles p ON p.user_id=f.following_id JOIN users u ON u.id=p.user_id WHERE f.follower_id=$1 AND f.following_id=b.user_id AND ${publicPerson}))::int friends FROM events e JOIN cities ci ON ci.id=e.city_id JOIN communities co ON co.id=e.community_id LEFT JOIN bookings b ON b.event_id=e.id WHERE e.status='published' AND co.verified AND co.status='active' AND (e.starts_at AT TIME ZONE ci.timezone)::date=(now() AT TIME ZONE ci.timezone)::date${near}`,
      params,
    );
    return s;
  });
  app.get('/search', async (req) => {
    const u = await actor(req, true);
    const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query);
    const term = `%${q}%`;
    const [events, communities, cities, categories, people] = await Promise.all([
      db.query(
        `SELECT e.id,e.title,e.cover_url FROM events e JOIN communities c ON c.id=e.community_id WHERE e.status='published' AND e.ends_at>now() AND c.verified AND c.status='active' AND e.title ILIKE $1 LIMIT 8`,
        [term],
      ),
      db.query(
        `SELECT id,name,logo_url FROM communities WHERE verified AND status='active' AND name ILIKE $1 LIMIT 8`,
        [term],
      ),
      db.query('SELECT * FROM cities WHERE name ILIKE $1 LIMIT 8', [term]),
      db.query('SELECT * FROM event_categories WHERE enabled AND name ILIKE $1 LIMIT 8', [term]),
      db.query(
        `SELECT u.id,p.display_name,p.avatar_url FROM users u JOIN profiles p ON p.user_id=u.id WHERE p.display_name ILIKE $2 AND ${publicPerson} LIMIT 8`,
        [u?.id || null, term],
      ),
    ]);
    if (u)
      await db.query(
        'INSERT INTO recent_searches(user_id,term) VALUES($1,$2) ON CONFLICT(user_id,term) DO UPDATE SET searched_at=now()',
        [u.id, q],
      );
    return { events, communities, cities, categories, people };
  });
  app.get('/search/suggestions', async (req) => {
    const u = await actor(req, true);
    return {
      recent: u
        ? await db.query(
            'SELECT term FROM recent_searches WHERE user_id=$1 ORDER BY searched_at DESC LIMIT 8',
            [u.id],
          )
        : [],
      trending: await db.query(
        `SELECT term,count(*)::int count FROM recent_searches WHERE searched_at>now()-interval '7 days' GROUP BY term HAVING count(*)>=3 ORDER BY count DESC LIMIT 8`,
      ),
    };
  });
  app.post('/analytics', async (req) => {
    const u = await actor(req, true);
    const b = z
      .object({ eventId: uuid, name: z.enum(['event_view', 'share', 'checkout_started']) })
      .parse(req.body);
    await db.query('INSERT INTO analytics_events(id,user_id,event_id,name) VALUES($1,$2,$3,$4)', [
      id(),
      u?.id || null,
      b.eventId,
      b.name,
    ]);
    return { ok: true };
  });
}
