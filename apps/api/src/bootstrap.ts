import { z } from 'zod';
import { migrate, db, tx, closeDB } from './db.js';
import { passwordHash, id, audit, password } from './security.js';
await migrate();
const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
const stored = await passwordHash(password.parse(process.env.ADMIN_PASSWORD));
await tx(async (c) => {
  const [existing] = await c.query('SELECT id FROM users WHERE email=$1', [email]);
  if (existing)
    throw new Error(
      'Account already exists; bootstrap cannot overwrite existing accounts or permissions',
    );
  const userId = id();
  await c.query(
    'INSERT INTO users(id,email,password_hash,email_verified_at) VALUES($1,$2,$3,now())',
    [userId, email, stored],
  );
  await c.query(
    'INSERT INTO profiles(user_id,display_name,visibility,compete,show_attendance) VALUES($1,$2,$3,false,false)',
    [userId, 'CRW+ Operations', 'private'],
  );
  await c.query(`INSERT INTO user_roles(user_id,role) VALUES($1,'USER'),($1,'ADMIN')`, [userId]);
  await c.query(
    `INSERT INTO countries(code,name,timezone,enabled) VALUES('LB','Lebanon','Asia/Beirut',true) ON CONFLICT DO NOTHING`,
  );
  await c.query(
    `INSERT INTO currencies(code,minor_digits) VALUES('USD',2),('LBP',2),('EUR',2) ON CONFLICT DO NOTHING`,
  );
  await c.query(
    `INSERT INTO cities(id,country_code,name,latitude,longitude,timezone) VALUES($1,'LB','Beirut',33.8938,35.5018,'Asia/Beirut') ON CONFLICT(country_code,name) DO NOTHING`,
    [id()],
  );
  for (const name of [
    'Running',
    'Hiking',
    'Cycling',
    'Yoga',
    'Padel',
    'Football',
    'Basketball',
    'Volleyball',
    'Bootcamp',
    'Wellness',
    'Other',
  ])
    await c.query('INSERT INTO event_categories(slug,name) VALUES($1,$2) ON CONFLICT DO NOTHING', [
      name.toLowerCase(),
      name,
    ]);
  await c.query(
    `INSERT INTO xp_rules(source,points) VALUES('attendance',100),('exploration',25) ON CONFLICT DO NOTHING`,
  );
  await audit(c, userId, 'platform.bootstrapped', 'user', userId);
});
console.info(
  'Admin created. Sign in and configure fees, challenges, achievements and supported regions before accepting bookings.',
);
await closeDB();
