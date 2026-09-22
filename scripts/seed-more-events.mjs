import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

async function seedMoreEvents() {
  const pg = new PGlite('./apps/api/data/pace');

  // Fetch reference IDs
  const citiesRes = await pg.query('SELECT id, name FROM cities');
  const cities = citiesRes.rows;
  const beirut = cities.find(c => c.name === 'Beirut')?.id || cities[0].id;
  const jounieh = cities.find(c => c.name === 'Jounieh')?.id || beirut;
  const saida = cities.find(c => c.name === 'Saida')?.id || beirut;

  const usersRes = await pg.query('SELECT id FROM users LIMIT 5');
  const creatorId = usersRes.rows[0].id;

  const communitiesRes = await pg.query('SELECT id, name, category, city_id FROM communities WHERE verified = true AND status = \'active\'');
  const communities = communitiesRes.rows;
  console.log(`Found ${communities.length} active verified communities.`);

  const commMap = new Map();
  for (const c of communities) {
    commMap.set(c.name, c.id);
  }

  // If some communities are missing, use the first available
  const defaultComm = communities[0]?.id;

  const now = new Date();

  // Helper to create date relative to now
  function datePlus(days, hours, minutes = 0) {
    const d = new Date(now.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hours, minutes, 0, 0);
    return d;
  }

  const newEvents = [
    {
      title: 'Sunrise Marina 5K Shakeout',
      description: 'Start your morning right with an easy-paced 5K run along the marina. Friendly conversational pace, open to all fitness levels, followed by espresso by the docks.',
      community: 'Coastal Striders',
      category: 'running',
      difficulty: 'all',
      cityId: beirut,
      locationName: 'Zaitunay Bay · Marina Promenade',
      lat: 33.9019,
      lng: 35.4964,
      daysOffset: 1,
      hour: 6,
      durationHours: 1.5,
      capacity: 40,
      priceMinor: 0,
      currency: 'USD',
      cover: 'photo-1552674605-db6ffd4facb5',
      tags: ['5K RUN', 'MORNING', 'COMMUNITY', 'FREE'],
      requirements: 'Running shoes and hydration bottle.',
      included: 'Guided group pace leaders and post-run coffee voucher.',
      safetyInfo: 'Stay on the pedestrian walkway. Water refilling available at start and finish.',
      featured: true
    },
    {
      title: 'Sunset Skyline 10K Tempo Run',
      description: 'Chasing the golden hour. A structured tempo run along the coastal route with 5:00/km, 5:30/km, and 6:00/km pace pacers.',
      community: 'Coastal Striders',
      category: 'running',
      difficulty: 'intermediate',
      cityId: beirut,
      locationName: 'Beirut Corniche · Lighthouse Point',
      lat: 33.9011,
      lng: 35.4797,
      daysOffset: 2,
      hour: 17,
      durationHours: 1.5,
      capacity: 35,
      priceMinor: 0,
      currency: 'USD',
      cover: 'photo-1476480862126-209bfaa8edc8',
      tags: ['10 KM', 'TEMPO', 'SUNSET', 'PACERS'],
      requirements: 'Comfortable road running shoes and running watch if desired.',
      included: 'Electrolyte drinks and gear drop at the start point.',
      safetyInfo: 'Stay on the broad sidewalk. Marshals posted at key turnaround points.'
    },
    {
      title: 'Bodyweight Mastery: Calisthenics & Core',
      description: 'Master pull-ups, push-up progressions, muscle-up fundamentals, and isometric core stability with certified bodyweight coaches.',
      community: 'Metro Calisthenics Club',
      category: 'bootcamp',
      difficulty: 'all',
      cityId: beirut,
      locationName: 'Horsh Beirut · Calisthenics Zone',
      lat: 33.8717,
      lng: 35.5095,
      daysOffset: 1,
      hour: 8,
      durationHours: 1.25,
      capacity: 25,
      priceMinor: 800,
      currency: 'USD',
      cover: 'photo-1552674605-db6ffd4facb5',
      tags: ['CALISTHENICS', 'STRENGTH', 'CORE'],
      requirements: 'Athletic wear and chalk or gym gloves if preferred.',
      included: 'Resistance bands, chalk, and professional form coaching.',
      safetyInfo: 'Warm up thoroughly before loading joints. Progressions tailored to all strengths.'
    },
    {
      title: 'Open Doubles Padel Mixer',
      description: 'Social round-robin tournament for padel enthusiasts. Switch partners every 20 minutes, accumulate match points, and compete for community podium spots.',
      community: 'Apex Padel Collective',
      category: 'padel',
      difficulty: 'all',
      cityId: beirut,
      locationName: 'Padel Arena Beirut',
      lat: 33.8938,
      lng: 35.5018,
      daysOffset: 3,
      hour: 18,
      durationHours: 2,
      capacity: 24,
      priceMinor: 1500,
      currency: 'USD',
      cover: 'photo-1622279457486-62dcc4a431d6',
      tags: ['PADEL', 'DOUBLES', 'MIXER', 'TOURNAMENT'],
      requirements: 'Court shoes (non-marking) and padel racket (rentals available).',
      included: 'Court reservations, premium balls, and post-match refreshments.',
      safetyInfo: 'Eye protection recommended. Standard court etiquette applies.'
    },
    {
      title: 'Golden Hour Oceanfront Vinyasa',
      description: 'An energizing and centering flow as the sun dips below the horizon. Synchronize movement with breath against the soothing backdrop of the Mediterranean.',
      community: 'Solar Flow Sanctuary',
      category: 'yoga',
      difficulty: 'all',
      cityId: beirut,
      locationName: 'Zaitunay Bay Boardwalk',
      lat: 33.9019,
      lng: 35.4964,
      daysOffset: 2,
      hour: 18,
      durationHours: 1,
      capacity: 30,
      priceMinor: 1000,
      currency: 'USD',
      cover: 'photo-1506126613408-eca07ce68773',
      tags: ['YOGA', 'VINYASA', 'SUNSET', 'OUTDOOR'],
      requirements: 'Yoga mat or towel, comfortable breathable clothing.',
      included: 'Herbal tea after class and complimentary mat sanitizing.',
      safetyInfo: 'Listen to your body. Modifications provided for beginners and advanced practitioners.'
    },
    {
      title: 'Coastal Century Peloton Ride (60K)',
      description: 'Fast-paced group spin hugging the coastal highway. Smooth double paceline rotating at 32-35 km/h with support vehicle.',
      community: 'Velocita Cycling Crew',
      category: 'cycling',
      difficulty: 'advanced',
      cityId: saida,
      locationName: 'Saida Coastal Highway · Gateway Hub',
      lat: 33.5571,
      lng: 35.3729,
      daysOffset: 4,
      hour: 6,
      durationHours: 3,
      capacity: 25,
      priceMinor: 1200,
      currency: 'USD',
      cover: 'photo-1544191696-15693072a251',
      tags: ['CYCLING', 'PELOTON', 'ROAD BIKE', 'ENDURANCE'],
      requirements: 'Road bike in good mechanical condition, helmet required, spare tube.',
      included: 'Support vehicle with tools, spare parts, and chilled water refills.',
      safetyInfo: 'Helmets mandatory at all times. Obey ride captain commands and traffic rules.'
    },
    {
      title: 'Highland Ridge Mountain Hike',
      description: 'Leave the concrete behind. A guided 12 km trek across cedar ridges and ancient mountain passes with panoramic valley vistas.',
      community: 'Highland Trail Seekers',
      category: 'hiking',
      difficulty: 'intermediate',
      cityId: jounieh,
      locationName: 'Jabal Moussa Trailhead',
      lat: 33.9808,
      lng: 35.6178,
      daysOffset: 5,
      hour: 7,
      durationHours: 4.5,
      capacity: 20,
      priceMinor: 1500,
      currency: 'USD',
      cover: 'photo-1551632811-561732d1e306',
      tags: ['HIKING', 'MOUNTAIN', 'NATURE', 'CEDARS'],
      requirements: 'Sturdy hiking boots, small backpack, 2 liters of water.',
      included: 'Certified mountain guide, reserve entry permits, and trail snacks.',
      safetyInfo: 'Stay on marked trails. Weather can change quickly at altitude; pack a windbreaker.'
    },
    {
      title: 'Midnight Glow 5K Street Run',
      description: 'Light up the night. A fun, neon-themed 5K night run winding through historic districts. Music, glowsticks, and pure nocturnal energy.',
      community: 'Coastal Striders',
      category: 'running',
      difficulty: 'all',
      cityId: beirut,
      locationName: 'Beirut Central District · Clock Tower',
      lat: 33.8969,
      lng: 35.5061,
      daysOffset: 3,
      hour: 21,
      durationHours: 1.5,
      capacity: 50,
      priceMinor: 500,
      currency: 'USD',
      cover: 'photo-1538805060514-97d9cc17730c',
      tags: ['NIGHT RUN', 'GLOW', '5K', 'STREET'],
      requirements: 'Running shoes and reflective clothing if available.',
      included: 'Glowsticks, LED wristbands, and recovery energy bars.',
      safetyInfo: 'Follow safety marshals. Flashing safety beacons provided.'
    },
    {
      title: 'High-Intensity Beach Bootcamp',
      description: 'Functional sand training: battle ropes, slam balls, sprint ladders, and agility drills designed to torch calories and build raw endurance.',
      community: 'Metro Calisthenics Club',
      category: 'bootcamp',
      difficulty: 'intermediate',
      cityId: saida,
      locationName: 'Saida Public Beach · South Shore',
      lat: 33.5510,
      lng: 35.3680,
      daysOffset: 6,
      hour: 7,
      durationHours: 1,
      capacity: 30,
      priceMinor: 700,
      currency: 'USD',
      cover: 'photo-1552674605-db6ffd4facb5',
      tags: ['BOOTCAMP', 'BEACH', 'HIIT', 'AGILITY'],
      requirements: 'Workout clothes you do not mind getting sandy, towel, water.',
      included: 'All specialized equipment provided.',
      safetyInfo: 'Stay hydrated in the sun. Sunscreen and hats strongly advised.'
    },
    {
      title: 'Sunday Morning Yin & Sound Bath',
      description: 'Restorative deep stretching followed by a 30-minute immersive Tibetan singing bowl sound bath to melt away stress and reset your nervous system.',
      community: 'Solar Flow Sanctuary',
      category: 'yoga',
      difficulty: 'all',
      cityId: beirut,
      locationName: 'Horsh Beirut · Shaded Pine Lawn',
      lat: 33.8710,
      lng: 35.5080,
      daysOffset: 7,
      hour: 9,
      durationHours: 1.5,
      capacity: 25,
      priceMinor: 1200,
      currency: 'USD',
      cover: 'photo-1506126613408-eca07ce68773',
      tags: ['WELLNESS', 'SOUND BATH', 'YIN YOGA', 'RECOVERY'],
      requirements: 'Comfortable warm layers and a blanket or yoga mat.',
      included: 'Cushions, essential oils, and organic herbal infusions.',
      safetyInfo: 'Quiet environment. Please arrive 10 minutes early to settle in.'
    },
    {
      title: 'King of the Court: Padel Singles Blitz',
      description: 'Fast-paced 1v1 singles shootout. 10-minute sprint games with continuous winner progression up to the championship court.',
      community: 'Apex Padel Collective',
      category: 'padel',
      difficulty: 'advanced',
      cityId: beirut,
      locationName: 'Padel Arena Beirut',
      lat: 33.8938,
      lng: 35.5018,
      daysOffset: 5,
      hour: 19,
      durationHours: 2,
      capacity: 16,
      priceMinor: 2000,
      currency: 'USD',
      cover: 'photo-1622279457486-62dcc4a431d6',
      tags: ['PADEL', 'SINGLES', 'COMPETITIVE', 'KING OF COURT'],
      requirements: 'Padel racket and competitive mindset.',
      included: 'Trophies for top 3, match stats tracking, and fresh juices.',
      safetyInfo: 'Warm up thoroughly. Aggressive play permitted within fair-play rules.'
    },
    {
      title: 'Dawn Patrol Gravel & Trail Ride',
      description: 'Mixed-terrain cycling session combining asphalt climbs with smooth gravel fire roads through the coastal hills.',
      community: 'Velocita Cycling Crew',
      category: 'cycling',
      difficulty: 'intermediate',
      cityId: jounieh,
      locationName: 'Jounieh Hill Roadside Cafe',
      lat: 33.9850,
      lng: 35.6250,
      daysOffset: 6,
      hour: 6,
      durationHours: 2.5,
      capacity: 20,
      priceMinor: 1000,
      currency: 'USD',
      cover: 'photo-1544191696-15693072a251',
      tags: ['GRAVEL', 'CYCLING', 'DAWN', 'HILLS'],
      requirements: 'Gravel or mountain bike with minimum 35mm tires, helmet.',
      included: 'GPX route file, mid-ride espresso stop, and mechanic support.',
      safetyInfo: 'Loose gravel on descents; control speed and maintain safe distance.'
    },
    {
      title: 'Beginner Run & Form Clinic',
      description: 'New to running or returning after a break? Learn cadence drills, efficient breathing, injury prevention, and run your easiest 3K yet.',
      community: 'Coastal Striders',
      category: 'running',
      difficulty: 'beginner',
      cityId: beirut,
      locationName: 'Zaitunay Bay · Amphitheatre Steps',
      lat: 33.9015,
      lng: 35.4950,
      daysOffset: 4,
      hour: 18,
      durationHours: 1,
      capacity: 30,
      priceMinor: 0,
      currency: 'USD',
      cover: 'photo-1552674605-db6ffd4facb5',
      tags: ['BEGINNER', 'CLINIC', 'TECHNIQUE', 'FREE'],
      requirements: 'Running shoes and questions about training.',
      included: 'Video gait analysis feedback and personalized training tips.',
      safetyInfo: 'Low impact, zero pressure. Walk intervals encouraged.'
    },
    {
      title: 'Sunset Beach Volleyball 4v4',
      description: 'Spike, set, and dive on the sand. Recreational to intermediate 4v4 games under the evening lights by the shore.',
      community: 'Metro Calisthenics Club',
      category: 'volleyball',
      difficulty: 'all',
      cityId: beirut,
      locationName: 'Beirut Sporting Beach Courts',
      lat: 33.8950,
      lng: 35.4740,
      daysOffset: 5,
      hour: 17,
      durationHours: 2,
      capacity: 24,
      priceMinor: 600,
      currency: 'USD',
      cover: 'photo-1476480862126-209bfaa8edc8',
      tags: ['VOLLEYBALL', 'BEACH', 'SOCIAL', 'SUNSET'],
      requirements: 'Beach athletic gear, water.',
      included: 'Court access, tournament balls, and music soundtrack.',
      safetyInfo: 'Watch out for sand holes. Warm up shoulders and knees.'
    },
    {
      title: 'Pickup Football Under The Lights',
      description: 'Competitive yet friendly 6-a-side football on high quality artificial turf. Teams balanced on arrival, continuous fast-paced play.',
      community: 'Metro Calisthenics Club',
      category: 'football',
      difficulty: 'intermediate',
      cityId: beirut,
      locationName: 'Central Beirut Sports Complex',
      lat: 33.8820,
      lng: 35.5120,
      daysOffset: 3,
      hour: 20,
      durationHours: 1.5,
      capacity: 18,
      priceMinor: 1000,
      currency: 'USD',
      cover: 'photo-1552674605-db6ffd4facb5',
      tags: ['FOOTBALL', 'SOCCER', 'NIGHT', '6V6'],
      requirements: 'Turf boots or trainers (no metal studs), shinguards recommended.',
      included: 'Match bibs, referee, match balls, and chilled bottled water.',
      safetyInfo: 'No slide tackles permitted on turf. Fair play is strictly enforced.'
    },
    {
      title: 'Open Streetball 3x3 Run',
      description: 'Call next on the blacktop. Half-court 3x3 pickup games to 15 points. Winner stays on, music pumping all afternoon.',
      community: 'Metro Calisthenics Club',
      category: 'basketball',
      difficulty: 'all',
      cityId: beirut,
      locationName: 'Horsh Outdoor Basketball Courts',
      lat: 33.8730,
      lng: 35.5085,
      daysOffset: 6,
      hour: 16,
      durationHours: 2.5,
      capacity: 24,
      priceMinor: 0,
      currency: 'USD',
      cover: 'photo-1538805060514-97d9cc17730c',
      tags: ['BASKETBALL', '3X3', 'STREETBALL', 'FREE'],
      requirements: 'Basketball shoes, dark and light shirts.',
      included: 'Official 3x3 game balls and sound system.',
      safetyInfo: 'Call your own fouls with respect. Hydrate between games.'
    },
    {
      title: 'Breathwork & Ice Bath Recovery Lab',
      description: 'Elevate mental toughness and slash muscle inflammation. Wim Hof style conscious connected breathing followed by guided 3-minute ice plunge immersion.',
      community: 'Solar Flow Sanctuary',
      category: 'wellness',
      difficulty: 'all',
      cityId: beirut,
      locationName: 'Zaitunay Bay Wellness Deck',
      lat: 33.9025,
      lng: 35.4970,
      daysOffset: 4,
      hour: 10,
      durationHours: 1.5,
      capacity: 16,
      priceMinor: 2500,
      currency: 'USD',
      cover: 'photo-1506126613408-eca07ce68773',
      tags: ['WELLNESS', 'ICE BATH', 'BREATHWORK', 'RECOVERY'],
      requirements: 'Swimwear, 2 towels, warm hoodie for post-bath.',
      included: 'Ice barrels, certified breathwork instructor, warm electrolyte tea.',
      safetyInfo: 'Consult a physician if you have cardiovascular conditions or epilepsy.'
    },
    {
      title: 'Cedar Forest Twilight Hike & Stargazing',
      description: 'Hike through protected old-growth forest as dusk falls, ascending to a scenic overlook for guided astronomy and campfire tea.',
      community: 'Highland Trail Seekers',
      category: 'hiking',
      difficulty: 'all',
      cityId: jounieh,
      locationName: 'Chouf High Reserve · Cedar Gate',
      lat: 33.9780,
      lng: 35.6150,
      daysOffset: 8,
      hour: 17,
      durationHours: 3.5,
      capacity: 25,
      priceMinor: 1800,
      currency: 'USD',
      cover: 'photo-1551632811-561732d1e306',
      tags: ['HIKING', 'STARGAZING', 'NIGHT', 'CEDARS'],
      requirements: 'Headlamp or flashlight, warm jacket, trail shoes.',
      included: 'Telescope observation session, hot cedar-mint tea, trail leader.',
      safetyInfo: 'Night hiking requires staying with the group. Headlamps mandatory.'
    }
  ];

  let added = 0;
  for (const ev of newEvents) {
    // Check if an event with this title already exists
    const check = await pg.query('SELECT id FROM events WHERE title = $1', [ev.title]);
    if (check.rows.length > 0) {
      console.log(`Event already exists: ${ev.title}`);
      continue;
    }

    const eventId = randomUUID();
    const commId = commMap.get(ev.community) || defaultComm;
    const startsAt = datePlus(ev.daysOffset, ev.hour);
    const endsAt = new Date(startsAt.getTime() + ev.durationHours * 3600 * 1000);
    const coverUrl = `http://localhost:4000/dev-media/${ev.cover}.jpg`;

    await pg.query(
      `INSERT INTO events(
        id, community_id, created_by, title, description, category, difficulty,
        city_id, location_name, latitude, longitude, starts_at, ends_at, capacity,
        price_minor, currency, cover_url, tags, requirements, included, safety_info,
        status, featured, cancellation_hours, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21,
        'published', $22, 24, now(), now()
      )`,
      [
        eventId, commId, creatorId, ev.title, ev.description, ev.category, ev.difficulty,
        ev.cityId, ev.locationName, ev.lat, ev.lng, startsAt, endsAt, ev.capacity,
        ev.priceMinor, ev.currency, coverUrl, ev.tags, ev.requirements, ev.included, ev.safetyInfo,
        ev.featured || false
      ]
    );
    added++;
  }

  console.log(`Successfully added ${added} new English upcoming events.`);

  const countRes = await pg.query('SELECT count(*) FROM events WHERE ends_at > now()');
  console.log(`Total upcoming events now in DB: ${countRes.rows[0].count}`);

  await pg.close();
}

seedMoreEvents().catch(err => {
  console.error('Failed to seed events:', err);
  process.exit(1);
});
