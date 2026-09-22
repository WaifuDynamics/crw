#!/usr/bin/env node
// Prints the public app configuration (EXPO_PUBLIC_* etc.) of an eas.json build profile as
// KEY=VALUE lines, ready to append to $GITHUB_ENV. Keeps one source of truth for the
// production API address and map token across EAS, local builds and GitHub Actions.
//
//   node scripts/release/app-env.mjs production >> "$GITHUB_ENV"
import { readFileSync } from 'node:fs';

const profile = process.argv[2] || 'production';
const eas = JSON.parse(readFileSync(new URL('../../eas.json', import.meta.url), 'utf8'));
const env = eas.build?.[profile]?.env;
if (!env) {
  console.error(`No env for build profile "${profile}" in eas.json`);
  process.exit(1);
}
for (const [key, value] of Object.entries(env)) {
  if (/[\r\n]/.test(String(value))) {
    console.error(`${key} contains a newline`);
    process.exit(1);
  }
  console.log(`${key}=${value}`);
}
