import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { db, tx } from '../db.js';
import { admin, audit, hash, id, requireValue, uuid } from '../security.js';
import { config } from '../config.js';
import { email } from '../notifications.js';
import { escapeHtml, layout, headline, paragraph, eyebrow, invitation } from '../emails.js';
import { deleteAccount } from './accountDeletion.js';

// What administrators do beyond moderating events: run the food catalogue, remove an
// account for good, write to people over email, and decide who else is an administrator.
// Everything here is audited, and nothing here is reachable without the ADMIN role.

const text = (max: number, min = 1) => z.string().trim().min(min).max(max);
const storeInput = z.object({
  id: text(60),
  name: text(120),
  area: text(120, 0).default(''),
  specialty: text(200, 0).default(''),
  sourceUrl: text(500, 0).default(''),
  enabled: z.boolean().default(true),
});
const itemInput = z.object({
  id: text(80),
  storeId: text(60),
  name: text(200),
  category: text(60, 0).default(''),
  imageUrl: text(800, 0).nullable().default(null),
  sourceUrl: text(800, 0).default(''),
  // A price label often lists several variants, and protein is quoted in half grams.
  priceLabel: text(200, 0).nullable().default(null),
  calories: z
    .number()
    .min(0)
    .max(10000)
    .nullable()
    .default(null)
    .transform((v) => (v == null ? null : Math.round(v))),
  proteinGrams: z
    .number()
    .min(0)
    .max(1000)
    .nullable()
    .default(null)
    .transform((v) => (v == null ? null : Math.round(v * 10) / 10)),
  nutritionBasis: text(120, 0).nullable().default(null),
  enabled: z.boolean().default(true),
});
type Store = z.infer<typeof storeInput>;
type Item = z.infer<typeof itemInput>;

const upsertStore = (c: any, s: Store) =>
  c.query(
    `INSERT INTO food_stores(id,name,area,specialty,source_url,enabled,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,area=EXCLUDED.area,specialty=EXCLUDED.specialty,
       source_url=EXCLUDED.source_url,enabled=EXCLUDED.enabled,updated_at=now()`,
    [s.id, s.name, s.area, s.specialty, s.sourceUrl, s.enabled],
  );
const upsertItem = (c: any, i: Item) =>
  c.query(
    `INSERT INTO food_items(id,store_id,name,category,image_url,source_url,price_label,calories,protein_grams,nutrition_basis,enabled,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
     ON CONFLICT(id) DO UPDATE SET store_id=EXCLUDED.store_id,name=EXCLUDED.name,category=EXCLUDED.category,
       image_url=EXCLUDED.image_url,source_url=EXCLUDED.source_url,price_label=EXCLUDED.price_label,
       calories=EXCLUDED.calories,protein_grams=EXCLUDED.protein_grams,nutrition_basis=EXCLUDED.nutrition_basis,
       enabled=EXCLUDED.enabled,updated_at=now()`,
    [
      i.id,
      i.storeId,
      i.name,
      i.category,
      i.imageUrl,
      i.sourceUrl,
      i.priceLabel,
      i.calories,
      i.proteinGrams,
      i.nutritionBasis,
      i.enabled,
    ],
  );

const wire = {
  store: (r: any) => ({
    id: r.id,
    name: r.name,
    area: r.area,
    specialty: r.specialty,
    sourceUrl: r.source_url,
    enabled: r.enabled,
  }),
  item: (r: any) => ({
    id: r.id,
    storeId: r.store_id,
    name: r.name,
    category: r.category,
    imageUrl: r.image_url,
    sourceUrl: r.source_url,
    priceLabel: r.price_label,
    calories: r.calories,
    // Postgres hands a numeric column back as a string.
    proteinGrams: r.protein_grams == null ? null : Number(r.protein_grams),
    nutritionBasis: r.nutrition_basis,
    enabled: r.enabled,
  }),
};

async function catalogue(all: boolean) {
  const where = all ? '' : ' WHERE enabled';
  const [stores, items, [latest]] = await Promise.all([
    db.query(`SELECT * FROM food_stores${where} ORDER BY name`),
    db.query(`SELECT * FROM food_items${where} ORDER BY name`),
    db.query(
      `SELECT greatest(coalesce(max(s.updated_at),'epoch'),coalesce(max(i.updated_at),'epoch')) updated_at
       FROM food_stores s FULL JOIN food_items i ON false`,
    ),
  ]);
  return {
    updatedAt: latest?.updated_at ?? null,
    stores: stores.map(wire.store),
    items: items.map(wire.item),
  };
}

export async function adminRoutes(app: FastifyInstance) {
  // The catalogue the app shows. Empty until an administrator imports one, and the app
  // falls back to its bundled snapshot in that case.
  app.get('/food', async () => catalogue(false));

  app.get('/admin/food', async (req) => {
    await admin(req);
    return catalogue(true);
  });

  // Replaces the catalogue with the one posted, which is how the bundled snapshot gets in.
  app.post('/admin/food/import', async (req) => {
    const u = await admin(req);
    const b = z
      .object({
        stores: z.array(storeInput).min(1).max(200),
        items: z.array(itemInput).max(5000),
        replace: z.boolean().default(false),
      })
      .parse(req.body);
    const known = new Set(b.stores.map((s) => s.id));
    requireValue(
      b.items.every((i) => known.has(i.storeId)),
      400,
      'Every dish must belong to one of the posted places',
    );
    await tx(async (c) => {
      if (b.replace) {
        await c.query('DELETE FROM food_items');
        await c.query('DELETE FROM food_stores');
      }
      for (const s of b.stores) await upsertStore(c, s);
      for (const i of b.items) await upsertItem(c, i);
      await audit(c, u.id, 'food.imported', 'food', 'catalogue', {
        stores: b.stores.length,
        items: b.items.length,
        replace: b.replace,
      });
    });
    return { ok: true, stores: b.stores.length, items: b.items.length };
  });

  app.put('/admin/food/items', async (req) => {
    const u = await admin(req);
    const b = itemInput.parse(req.body);
    await tx(async (c) => {
      const [store] = await c.query('SELECT id FROM food_stores WHERE id=$1', [b.storeId]);
      requireValue(store, 404, 'Unknown place');
      await upsertItem(c, b);
      await audit(c, u.id, 'food.item.saved', 'food_item', b.id, { name: b.name });
    });
    return { ok: true };
  });

  app.put('/admin/food/stores', async (req) => {
    const u = await admin(req);
    const b = storeInput.parse(req.body);
    await tx(async (c) => {
      await upsertStore(c, b);
      await audit(c, u.id, 'food.store.saved', 'food_store', b.id, { name: b.name });
    });
    return { ok: true };
  });

  app.delete('/admin/food/items/:id', async (req) => {
    const u = await admin(req);
    const itemId = text(80).parse((req.params as any).id);
    await tx(async (c) => {
      const [row] = await c.query('DELETE FROM food_items WHERE id=$1 RETURNING name', [itemId]);
      requireValue(row, 404, 'Unknown dish');
      await audit(c, u.id, 'food.item.deleted', 'food_item', itemId, { name: row.name });
    });
    return { ok: true };
  });

  app.delete('/admin/food/stores/:id', async (req) => {
    const u = await admin(req);
    const storeId = text(60).parse((req.params as any).id);
    await tx(async (c) => {
      const [row] = await c.query('DELETE FROM food_stores WHERE id=$1 RETURNING name', [storeId]);
      requireValue(row, 404, 'Unknown place');
      await audit(c, u.id, 'food.store.deleted', 'food_store', storeId, { name: row.name });
    });
    return { ok: true };
  });

  // Deleting a person: the same erasure the account owner can ask for, so the data goes
  // the same way and the audit trail records who did it.
  app.delete('/admin/users/:id', async (req) => {
    const u = await admin(req);
    const target = uuid.parse((req.params as any).id);
    const b = z.object({ reason: text(1000, 5) }).parse((req.body as any) ?? {});
    requireValue(target !== u.id, 409, 'You cannot delete your own account here');
    await tx(async (c) => {
      const [row] = await c.query(`SELECT status FROM users WHERE id=$1`, [target]);
      requireValue(row, 404, 'Unknown account');
      requireValue(row.status !== 'deleted', 409, 'That account is already deleted');
      const [protectedAdmin] = await c.query(
        `SELECT 1 FROM user_roles WHERE user_id=$1 AND role='ADMIN'`,
        [target],
      );
      requireValue(!protectedAdmin, 409, 'Take the administrator role away first');
      await deleteAccount(c, target, `admin:${u.id}`);
      await audit(c, u.id, 'admin.user.deleted', 'user', target, { reason: b.reason });
    });
    return { ok: true };
  });

  // Everybody with a CRW+ account, and what an administrator can do about them: search,
  // invite, change roles, suspend and delete. Suspending and deleting already live at
  // /admin/users/:id.
  const MEMBER_COLUMNS = `u.id, u.email, u.status, u.created_at,
    u.email_verified_at IS NOT NULL AS verified, p.display_name, p.avatar_url,
    coalesce(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles`;

  app.get('/admin/members', async (req) => {
    await admin(req);
    const q = z
      .object({
        query: z.string().trim().max(120).default(''),
        filter: z.enum(['all', 'admins', 'organizers', 'suspended', 'deleted']).default('all'),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const needle = `%${q.query.toLowerCase()}%`;
    // An empty search becomes '%%', which matches everyone, so $1 is always in the query.
    const where = [`(lower(u.email) LIKE $1 OR lower(coalesce(p.display_name,'')) LIKE $1)`];
    if (q.filter === 'suspended') where.push(`u.status='suspended'`);
    else if (q.filter === 'deleted') where.push(`u.status='deleted'`);
    else where.push(`u.status<>'deleted'`);
    if (q.filter === 'admins' || q.filter === 'organizers')
      where.push(
        `EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id=u.id AND x.role=${
          q.filter === 'admins' ? "'ADMIN'" : "'ORGANIZER'"
        })`,
      );
    return db.query(
      `SELECT ${MEMBER_COLUMNS} FROM users u
       LEFT JOIN profiles p ON p.user_id=u.id
       LEFT JOIN user_roles r ON r.user_id=u.id
       WHERE ${where.join(' AND ')}
       GROUP BY u.id, p.display_name, p.avatar_url
       ORDER BY u.created_at DESC LIMIT 50 OFFSET $2`,
      [needle, q.offset],
    );
  });

  /** A fresh invitation link, valid for a week, mailed to the address. */
  async function invite(
    c: any,
    member: { id: string; email: string; name?: string },
    from: string,
  ) {
    const token = randomBytes(32).toString('base64url');
    await c.query(
      `INSERT INTO auth_tokens(id,user_id,token_hash,kind,expires_at)
       VALUES($1,$2,$3,'reset',now()+interval '7 days')`,
      [id(), member.id, hash(token)],
    );
    await email(c, member.email, invitation(`${config.appUrl}/?reset=${token}`, member.name, from));
  }

  app.post('/admin/members', async (req) => {
    const u = await admin(req);
    const b = z
      .object({
        email: z.email().max(200),
        displayName: text(60, 2),
        roles: z.array(z.enum(['USER', 'ORGANIZER', 'ADMIN'])).default([]),
      })
      .parse(req.body);
    const address = b.email.toLowerCase().trim();
    const userId = await tx(async (c) => {
      const [taken] = await c.query('SELECT id FROM users WHERE lower(email)=$1', [address]);
      requireValue(!taken, 409, 'That address already has an account');
      const newId = id();
      // No password: the invitation link is how the person sets their own.
      await c.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,NULL)', [
        newId,
        address,
      ]);
      await c.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$2)', [
        newId,
        b.displayName,
      ]);
      for (const role of new Set(['USER', ...b.roles]))
        await c.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)', [newId, role]);
      await c.query('INSERT INTO user_accounts(user_id,first_name,email) VALUES($1,$2,$3)', [
        newId,
        b.displayName.slice(0, 80),
        address,
      ]);
      await invite(c, { id: newId, email: address, name: b.displayName }, u.email);
      await audit(c, u.id, 'member.created', 'user', newId, { email: address, roles: b.roles });
      return newId;
    });
    return { ok: true, id: userId };
  });

  app.post('/admin/members/:id/invite', async (req) => {
    const u = await admin(req);
    const target = uuid.parse((req.params as any).id);
    await tx(async (c) => {
      const [member] = await c.query(
        `SELECT u.id, u.email, u.status, p.display_name FROM users u
         LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=$1`,
        [target],
      );
      requireValue(member, 404, 'Unknown account');
      requireValue(member.status === 'active', 409, 'That account is not active');
      await invite(c, { id: member.id, email: member.email, name: member.display_name }, u.email);
      await audit(c, u.id, 'member.invited', 'user', target, {});
    });
    return { ok: true };
  });

  // Who can administer the site, and the way in and out of that group.
  app.get('/admin/people', async (req) => {
    await admin(req);
    return db.query(
      `SELECT u.id,u.email,u.status,array_agg(r.role ORDER BY r.role) roles,p.display_name
       FROM users u JOIN user_roles r ON r.user_id=u.id LEFT JOIN profiles p ON p.user_id=u.id
       WHERE r.role IN ('ADMIN','ORGANIZER') GROUP BY u.id,p.display_name ORDER BY u.email`,
    );
  });

  app.post('/admin/people/role', async (req) => {
    const u = await admin(req);
    const b = z
      .object({
        email: z.email().max(200),
        role: z.enum(['ADMIN', 'ORGANIZER']),
        grant: z.boolean(),
      })
      .parse(req.body);
    const address = b.email.toLowerCase();
    await tx(async (c) => {
      const [target] = await c.query(`SELECT id,status FROM users WHERE lower(email)=$1`, [
        address,
      ]);
      requireValue(target, 404, 'No account uses that address');
      requireValue(target.status === 'active', 409, 'That account is not active');
      requireValue(
        b.grant || !(target.id === u.id && b.role === 'ADMIN'),
        409,
        'You cannot take your own administrator role away',
      );
      if (b.grant)
        await c.query(`INSERT INTO user_roles(user_id,role) VALUES($1,$2) ON CONFLICT DO NOTHING`, [
          target.id,
          b.role,
        ]);
      else
        await c.query(`DELETE FROM user_roles WHERE user_id=$1 AND role=$2`, [target.id, b.role]);
      await audit(c, u.id, b.grant ? 'role.granted' : 'role.revoked', 'user', target.id, {
        role: b.role,
      });
    });
    return { ok: true };
  });

  // Email written by an administrator, delivered by the same outbox (Resend) as every
  // other message the platform sends.
  app.post('/admin/email', async (req) => {
    const u = await admin(req);
    const b = z
      .object({
        subject: text(120, 2),
        heading: text(120, 2).optional(),
        body: text(8000, 2),
        audience: z.enum(['selected', 'marketing', 'all']).default('selected'),
        userIds: z.array(uuid).max(2000).default([]),
        test: z.boolean().default(false),
      })
      .parse(req.body);
    const recipients: { id: string; email: string }[] = b.test
      ? [{ id: u.id, email: u.email }]
      : b.audience === 'selected'
        ? b.userIds.length
          ? await db.query(
              `SELECT id,email FROM users WHERE id=ANY($1::uuid[]) AND status='active'`,
              [b.userIds],
            )
          : []
        : await db.query(
            `SELECT u.id,u.email FROM users u LEFT JOIN user_accounts a ON a.user_id=u.id
             WHERE u.status='active' AND u.email NOT LIKE 'deleted-%'
             ${b.audience === 'marketing' ? 'AND coalesce(a.marketing_opt_in,false)' : ''}`,
          );
    requireValue(recipients.length, 400, 'Nobody matches that audience');
    const paragraphs = b.body
      .split(/\n{2,}/)
      .map((part) => paragraph(escapeHtml(part).replace(/\n/g, '<br>')))
      .join('');
    const content = {
      subject: b.subject,
      html: layout({
        preheader: b.subject,
        body: `${eyebrow('CRW+')}${headline(b.heading || b.subject)}${paragraphs}`,
      }),
      text: b.body,
    };
    await tx(async (c) => {
      for (const person of recipients) await email(c, person.email, content);
      await audit(c, u.id, 'email.sent', 'email', id(), {
        subject: b.subject,
        audience: b.test ? 'test' : b.audience,
        recipients: recipients.length,
      });
    });
    return { ok: true, recipients: recipients.length };
  });
}
