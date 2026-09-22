import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const root = new URL('../', import.meta.url);
for (const name of ['api', 'mobile']) {
  const file = new URL(`apps/${name}/.env`, root);
  try {
    await access(file);
    console.log(`${name}: existing .env retained`);
  } catch {
    let template = await readFile(new URL(`apps/${name}/.env.example`, root), 'utf8');
    if (name === 'api') {
      template = template
        .replace('replace-with-at-least-32-random-characters', randomBytes(48).toString('hex'))
        .replace('SEED_PASSWORD=', 'SEED_PASSWORD=' + randomBytes(18).toString('base64url'));
    }
    await writeFile(file, template);
    console.log(`${name}: .env created`);
  }
}
console.log(
  'Run npm run seed, then npm run dev. Development credentials are printed by seed; SEED_PASSWORD is stored only in apps/api/.env.',
);
