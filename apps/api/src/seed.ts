import { randomBytes } from 'node:crypto';
import { db, tx, migrate, closeDB } from './db.js';
import { id, passwordHash } from './security.js';
import { config } from './config.js';
import { issueTicket } from './bookings.js';
import { updateRewards } from './competition.js';
import { applyDemoAccounts, demoEmail, demoName, DEMO_PEOPLE } from './demo.js';
export async function seed() {
  if (config.production) throw new Error('Development seed is forbidden in production');
  await migrate();
  // Whether the seed has run is decided by the accounts it creates, not by reference
  // data. Migration 018 fills countries, cities and currencies, so asking about those
  // answered "already seeded" on an empty database from the moment it landed - the seed
  // then created no users at all and every test that signs in failed with a 401.
  if ((await db.query('SELECT 1 FROM users LIMIT 1')).length) {
    console.info('Database already initialized; seed skipped.');
    return;
  }
  const password = process.env.SEED_PASSWORD || randomBytes(15).toString('base64url');
  const stored = await passwordHash(password);
  await tx(async (c) => {
    await c.query(
      `INSERT INTO countries(code,name,timezone,enabled) VALUES('LB','Lebanon','Asia/Beirut',true)`,
    );
    await c.query(`INSERT INTO currencies(code,minor_digits) VALUES('USD',2),('LBP',2),('EUR',2)`);
    const beirut = id(),
      saida = id(),
      jounieh = id();
    for (const [cityId, name, lat, lng] of [
      [beirut, 'Beirut', 33.8938, 35.5018],
      [saida, 'Saida', 33.5571, 35.3729],
      [jounieh, 'Jounieh', 33.9808, 35.6178],
    ])
      await c.query(
        `INSERT INTO cities(id,country_code,name,latitude,longitude,timezone) VALUES($1,'LB',$2,$3,$4,'Asia/Beirut')`,
        [cityId, name, lat, lng],
      );
    const categories = [
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
    ];
    for (const name of categories)
      await c.query('INSERT INTO event_categories(slug,name) VALUES($1,$2)', [
        name.toLowerCase(),
        name,
      ]);
    await c.query(
      `INSERT INTO platform_fee_rules(id,country_code,currency,fixed_minor,basis_points) VALUES($1,'LB','USD',50,500)`,
      [id()],
    );
    await c.query(
      `INSERT INTO platform_fee_rules(id,country_code,currency,fixed_minor,basis_points) VALUES($1,'LB','LBP',0,700)`,
      [id()],
    );
    await c.query(
      `INSERT INTO xp_rules(source,points) VALUES('attendance',100),('exploration',25)`,
    );
    // Clearly fictional demo people; see demo.ts.
    const names = DEMO_PEOPLE.map((_, i) => demoName(i));
    const users: string[] = [];
    for (let i = 0; i < names.length; i++) {
      const userId = id();
      users.push(userId);
      const email = demoEmail(i);
      await c.query(
        'INSERT INTO users(id,email,password_hash,email_verified_at) VALUES($1,$2,$3,now())',
        [userId, email, stored],
      );
      await c.query(
        `INSERT INTO profiles(user_id,display_name,bio,avatar_url,city_id,interests) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          userId,
          names[i],
          i === 0
            ? 'Here for the early starts & good company.'
            : 'A little movement. A lot of good company.',
          null, // no photos of real people on demo accounts
          beirut,
          ['running', 'hiking'],
        ],
      );
      await c.query(`INSERT INTO user_roles(user_id,role) VALUES($1,'USER')`, [userId]);
    }
    await c.query(`INSERT INTO user_roles(user_id,role) VALUES($1,'ORGANIZER'),($2,'ADMIN')`, [
      users[1],
      users[2],
    ]);
    for (let i = 1; i < 7; i++)
      await c.query('INSERT INTO follows(follower_id,following_id) VALUES($1,$2)', [
        users[0],
        users[i],
      ]);
    const communities = [
      {
        id: id(),
        name: 'Beirut Morning Crew',
        category: 'running',
        description:
          'Early starts. Easy miles. Really good coffee. A welcoming running community moving through Beirut together.',
        image: 'photo-1552674605-db6ffd4facb5',
      },
      {
        id: id(),
        name: 'Outside the Ordinary',
        category: 'hiking',
        description:
          'Leave the routine behind. Thoughtfully guided hikes, fresh mountain air, and a table full of new friends.',
        image: 'photo-1551632811-561732d1e306',
      },
      {
        id: id(),
        name: 'The Social Club',
        category: 'padel',
        description:
          'Come for the game. Stay for the people. Friendly games and active evenings for every level.',
        image: 'photo-1622279457486-62dcc4a431d6',
      },
      {
        id: id(),
        name: 'Slow Sunday',
        category: 'yoga',
        description:
          'Space to breathe, stretch, and reconnect. Mindful movement, outdoors and together.',
        image: 'photo-1506126613408-eca07ce68773',
      },
    ];
    for (const co of communities) {
      await c.query(
        'INSERT INTO communities(id,name,description,city_id,category,cover_url,logo_url,verified) VALUES($1,$2,$3,$4,$5,$6,$7,true)',
        [
          co.id,
          co.name,
          co.description,
          beirut,
          co.category,
          `${config.apiUrl}/dev-media/${co.image}.jpg`,
          null,
        ],
      );
      await c.query('INSERT INTO organizer_members(community_id,user_id) VALUES($1,$2)', [
        co.id,
        users[1],
      ]);
      for (const u of users.slice(0, 8))
        await c.query('INSERT INTO community_follows(community_id,user_id) VALUES($1,$2)', [
          co.id,
          u,
        ]);
    }
    const today = new Date();
    const day = (offset: number, hour: number) => {
      const d = new Date(today);
      d.setUTCHours(hour, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() + offset);
      return d;
    };
    const eventSpecs = [
      {
        title: 'Run, coffee & good company.',
        co: 0,
        category: 'running',
        image: 'photo-1552674605-db6ffd4facb5',
        location: 'Zaitunay Bay',
        lat: 33.9018583,
        lng: 35.4964278,
        price: 800,
        offset: 1,
        hour: 5,
        tags: ['5 KM', 'SOCIAL PACE'],
        capacity: 40,
      },
      {
        title: 'Chasing the last light.',
        co: 0,
        category: 'running',
        image: 'photo-1476480862126-209bfaa8edc8',
        location: 'Beirut Corniche · Demo meeting point',
        lat: 33.9011111,
        lng: 35.4797222,
        price: 0,
        offset: 0,
        hour: 16,
        tags: ['SUNSET RUN', 'ALL LEVELS'],
        capacity: 60,
      },
      {
        title: 'A little higher. A little freer.',
        co: 1,
        category: 'hiking',
        image: 'photo-1551632811-561732d1e306',
        location: 'Jabal Moussa · Reserve area (demo)',
        lat: 34.062,
        lng: 35.7694,
        price: 2500,
        offset: 4,
        hour: 4,
        tags: ['GUIDED HIKE', 'BREAKFAST'],
        capacity: 24,
      },
      {
        title: 'Your court. Your people.',
        co: 2,
        category: 'padel',
        image: 'photo-1622279457486-62dcc4a431d6',
        location: 'Beirut · Venue confirmed by organizer',
        lat: 33.8938,
        lng: 35.5018,
        price: 1800,
        offset: 1,
        hour: 17,
        tags: ['DOUBLES', 'SOCIAL GAMES'],
        capacity: 16,
      },
      {
        title: 'Breathe in. Branch out.',
        co: 3,
        category: 'yoga',
        image: 'photo-1506126613408-eca07ce68773',
        location: 'Horsh Beirut',
        lat: 33.8717333,
        lng: 35.5094639,
        price: 1200,
        offset: 2,
        hour: 6,
        tags: ['OUTDOOR YOGA', 'BEGINNER'],
        capacity: 20,
      },
      {
        title: 'The city before it wakes.',
        co: 0,
        category: 'cycling',
        image: 'photo-1544191696-15693072a251',
        location: 'Zaitunay Bay',
        lat: 33.9018583,
        lng: 35.4964278,
        price: 0,
        offset: 3,
        hour: 4,
        tags: ['20 KM', 'BRING YOUR BIKE'],
        capacity: 30,
      },
      {
        title: 'After hours, on the move.',
        co: 0,
        category: 'running',
        image: 'photo-1538805060514-97d9cc17730c',
        location: 'Beirut Corniche · Demo meeting point',
        lat: 33.9011111,
        lng: 35.4797222,
        price: 500,
        offset: 0,
        hour: 18,
        tags: ['NIGHT RUN', 'REFLECTIVE KIT'],
        capacity: 40,
      },
    ];
    const events: any[] = [];
    for (const spec of eventSpecs) {
      let start = day(spec.offset, spec.hour);
      if (start < today) start = day(spec.offset + 1, spec.hour);
      const e = { ...spec, id: id(), starts: start };
      events.push(e);
      await c.query(
        `INSERT INTO events(id,community_id,created_by,title,description,category,difficulty,city_id,location_name,latitude,longitude,starts_at,ends_at,capacity,price_minor,currency,cover_url,tags,requirements,included,safety_info,status,featured) VALUES($1,$2,$3,$4,$5,$6,'beginner',$7,$8,$9,$10,$11,$12,$13,$14,'USD',$15,$16,$17,$18,$19,'published',$20)`,
        [
          e.id,
          communities[e.co].id,
          users[1],
          e.title,
          'A good day starts with getting out there. Join a small, welcoming group for movement, conversation, and a fresh perspective on the city. Our experienced hosts keep things easy and inclusive. Come solo or bring a friend — you will leave with a few more.',
          e.category,
          beirut,
          e.location,
          e.lat,
          e.lng,
          e.starts,
          new Date(e.starts.getTime() + 2 * 3600000),
          e.capacity,
          e.price,
          `${config.apiUrl}/dev-media/${e.image}.jpg`,
          e.tags,
          'Bring water, comfortable shoes, and sun protection. Let the organizer know about accessibility requirements.',
          'A friendly host, a guided experience, and great company.',
          'Follow your host’s instructions and stay with the group. Activities may be rescheduled for unsafe weather. Emergency contact: the organizer in your booking.',
          e.co === 0,
        ],
      );
    }
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      for (const user of users.slice(1, 5 + i)) {
        const booking = {
          id: id(),
          user_id: user,
          event_id: e.id,
          total_minor: e.price + (e.price ? 50 + Math.round(e.price * 0.05) : 0),
          currency: 'USD',
        };
        await c.query(
          `INSERT INTO bookings(id,user_id,event_id,status,ticket_minor,fee_minor,total_minor,currency,idempotency_key,expires_at,confirmed_at) VALUES($1,$2,$3,'confirmed',$4,$5,$6,'USD',$7,now(),now())`,
          [
            booking.id,
            user,
            e.id,
            e.price,
            booking.total_minor - e.price,
            booking.total_minor,
            `seed:${e.id}:${user}`,
          ],
        );
        await issueTicket(c, booking);
      }
    }
    const challengeId = id();
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
      monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    await c.query(
      `INSERT INTO challenges(id,title,description,starts_at,ends_at,kind,target,reward_xp,badge) VALUES($1,'MAKE YOUR MOVES','Four activities. One more reason to get out there.',$2,$3,'attendance',4,300,'bolt')`,
      [challengeId, monthStart, monthEnd],
    );
    await c.query(
      `INSERT INTO challenges(id,title,description,starts_at,ends_at,kind,target,reward_xp,badge) VALUES($1,'OUTSIDE YOUR USUAL','Try three different categories this month.',$2,$3,'explorer',3,200,'compass')`,
      [id(), monthStart, monthEnd],
    );
    for (const u of users)
      await c.query('INSERT INTO challenge_participants(challenge_id,user_id) VALUES($1,$2)', [
        challengeId,
        u,
      ]);
    for (const [slug, title, kind, threshold, badge] of [
      ['first-move', 'FIRST MOVE', 'attendance', 1, 'flash'],
      ['ten-activities', 'IN YOUR STRIDE', 'attendance', 10, 'footsteps'],
      ['fifty-activities', 'UNSTOPPABLE', 'attendance', 50, 'flame'],
      ['explorer', 'THE EXPLORER', 'explorer', 3, 'compass'],
      ['early-bird', 'EARLY BIRD', 'early', 1, 'sunny'],
      ['night-runner', 'AFTER HOURS', 'night', 1, 'moon'],
      ['five-weeks', 'KEEP SHOWING UP', 'streak', 5, 'calendar'],
    ])
      await c.query(
        'INSERT INTO achievements(id,slug,title,description,kind,threshold,badge) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [id(), slug, title, `${threshold} verified ${kind} milestone`, kind, threshold, badge],
      );
    await c.query(
      `INSERT INTO seasons(id,name,starts_at,ends_at) VALUES($1,'THE OUTSIDE SEASON',$2,$3)`,
      [id(), monthStart, new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 1))],
    );
    // Historical development attendance exercises exactly the same rewards engine.
    for (let n = 1; n <= 10; n++) {
      const e = id(),
        start = day(-n, 5);
      await c.query(
        `INSERT INTO events(id,community_id,created_by,title,description,category,difficulty,city_id,location_name,latitude,longitude,starts_at,ends_at,capacity,price_minor,currency,safety_info,status) VALUES($1,$2,$3,$4,'Development historical activity','running','all',$5,'Zaitunay Bay',33.9018583,35.4964278,$6,$7,40,0,'USD','Stay with your host','completed')`,
        [
          e,
          communities[0].id,
          users[1],
          `Morning miles · ${start.toLocaleDateString('en-GB')}`,
          beirut,
          start,
          new Date(start.getTime() + 3600000),
        ],
      );
      for (let j = 0; j < users.length; j++) {
        if (n > (j === 0 ? 3 : ((j * 3) % 10) + 1)) continue;
        const b = { id: id(), user_id: users[j], event_id: e, total_minor: 0, currency: 'USD' };
        await c.query(
          `INSERT INTO bookings(id,user_id,event_id,status,ticket_minor,fee_minor,total_minor,currency,idempotency_key,expires_at,confirmed_at) VALUES($1,$2,$3,'confirmed',0,0,0,'USD',$4,$5,$5)`,
          [b.id, b.user_id, e, `history:${e}:${b.user_id}`, start],
        );
        await issueTicket(c, b);
        const [t] = await c.query('SELECT id FROM tickets WHERE booking_id=$1', [b.id]);
        await c.query(
          'INSERT INTO checkins(id,ticket_id,event_id,user_id,checked_in_by,created_at) VALUES($1,$2,$3,$4,$5,$6)',
          [id(), t.id, e, b.user_id, users[1], start],
        );
        await updateRewards(c, b.user_id, e);
      }
    }
    // Account details and camera-game match history for the demo people.
    await applyDemoAccounts(c);
    // Development email/push notifications remain visible in-app but do not leave the machine.
    await c.query(`UPDATE notification_outbox SET status='sent'`);
  });
  console.info(
    '\nCRW+ development database created. These are development accounts only.\nUser: alex@pace.local\nOrganizer: organizer@pace.local\nAdmin: admin@pace.local\nPassword:',
    password,
    '\n',
  );
}
// Matches both the tsx entry point and the compiled dist/seed.js used by deployments.
if (/\/seed\.(ts|js)$/.test(process.argv[1]?.replaceAll('\\', '/') || '')) {
  await seed();
  await closeDB();
}
