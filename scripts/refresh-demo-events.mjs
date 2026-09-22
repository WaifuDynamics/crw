import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const apply = process.argv.includes('--apply');
const env = parse(await readFile(fileURLToPath(new URL('../apps/api/.env', import.meta.url))));
// A deployed sandbox needs --remote plus its own credentials; nothing is read
// from the local .env in that case, so a stray API_URL can never reach it.
const remote = process.argv.includes('--remote') ? process.env.DEMO_API_URL : undefined;
if (process.argv.includes('--remote') && !remote)
  throw new Error('--remote needs DEMO_API_URL and SEED_PASSWORD for the target sandbox.');
const api = new URL(remote || env.API_URL || 'http://localhost:4000');
const seedPassword = remote ? process.env.SEED_PASSWORD : env.SEED_PASSWORD;
const local = ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname);
if (!local && !remote) {
  throw new Error(
    'Demo refresh only supports a local development API. Pass --remote to target a sandbox.',
  );
}
if (!local && api.protocol !== 'https:') {
  throw new Error('A remote demo refresh must use https.');
}
async function request(path, token, body) {
  const response = await fetch(new URL(path, api), {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path}: ${result.error || response.status}`);
  return result;
}

const health = await request('/health');
if (health.environment !== 'development' || health.payments !== 'sandbox') {
  throw new Error('Demo refresh requires development mode and sandbox payments.');
}
if (!seedPassword) throw new Error('Missing SEED_PASSWORD for the target API.');
const session = await request('/auth/login', null, {
  email: 'organizer@pace.local',
  password: seedPassword,
});
const overview = await request('/organizer/overview', session.token);

// Only the original, recognizable sample activities may get new occurrences.
const samples = [
  ['Run, coffee & good company.', 'running', 'photo-1552674605-db6ffd4facb5', 1, 5],
  ['Chasing the last light.', 'running', 'photo-1476480862126-209bfaa8edc8', 0, 16],
  ['A little higher. A little freer.', 'hiking', 'photo-1551632811-561732d1e306', 4, 4],
  ['Your court. Your people.', 'padel', 'photo-1622279457486-62dcc4a431d6', 1, 17],
  ['Breathe in. Branch out.', 'yoga', 'photo-1506126613408-eca07ce68773', 2, 6],
  ['The city before it wakes.', 'cycling', 'photo-1544191696-15693072a251', 3, 4],
  ['After hours, on the move.', 'running', 'photo-1538805060514-97d9cc17730c', 0, 18],
];
const now = new Date();
const plans = [];
for (const [title, category, image, offset, hour] of samples) {
  const matches = overview.events.filter(
    (event) =>
      event.title === title &&
      event.category === category &&
      event.status === 'published' &&
      event.cover_url &&
      new URL(event.cover_url).pathname === `/dev-media/${image}.jpg`,
  );
  if (matches.some((event) => new Date(event.ends_at) > now)) continue;
  const source = matches.find((event) => event.checked_in === 0);
  if (!source) continue;
  const startsAt = new Date(now);
  startsAt.setUTCDate(startsAt.getUTCDate() + offset);
  startsAt.setUTCHours(hour, 0, 0, 0);
  if (startsAt <= now) startsAt.setUTCDate(startsAt.getUTCDate() + 1);
  const duration = new Date(source.ends_at) - new Date(source.starts_at);
  plans.push({ source, startsAt, endsAt: new Date(startsAt.getTime() + duration) });
}

for (const { source, startsAt, endsAt } of plans) {
  if (apply) {
    await request('/organizer/events', session.token, {
      communityId: source.community_id,
      title: source.title,
      description: source.description,
      category: source.category,
      difficulty: source.difficulty,
      cityId: source.city_id,
      locationName: source.location_name,
      latitude: source.latitude,
      longitude: source.longitude,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      capacity: source.capacity,
      priceMinor: source.price_minor,
      currency: source.currency,
      coverUrl: source.cover_url,
      tags: source.tags,
      requirements: source.requirements,
      included: source.included,
      safetyInfo: source.safety_info,
      cancellationHours: source.cancellation_hours,
      status: 'published',
    });
  }
  console.log(`${apply ? 'Created' : 'Would create'}: ${source.title} / ${startsAt.toISOString()}`);
}
console.log(
  plans.length
    ? `${plans.length} demo occurrences ${apply ? 'created' : 'planned; pass --apply to create them'}.`
    : 'Demo activities are already current. No changes needed.',
);
