#!/usr/bin/env node
// App version helpers for releases. The version lives in apps/mobile/package.json;
// app.config.ts reads it and derives the store build numbers from it.
//
//   node scripts/release/version.mjs current            -> 1.4.2
//   node scripts/release/version.mjs next patch|minor|major -> 1.4.3 (prints only)
//   node scripts/release/version.mjs set 1.5.0          -> writes package.json
//   node scripts/release/version.mjs code 1.5.0         -> 1005000 (Android versionCode)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parse(version) {
  const m = SEMVER.exec(String(version).replace(/^v/, ''));
  if (!m) throw new Error(`Not a version (expected 1.2.3 or 1.2.3-beta.1): ${version}`);
  const [major, minor, patch] = [m[1], m[2], m[3]].map(Number);
  if (minor > 999 || patch > 999) throw new Error(`Minor and patch must be below 1000: ${version}`);
  return { major, minor, patch, pre: m[4] || null };
}

/** Android versionCode / iOS build number: always increases with the version. */
export function buildNumber(version) {
  const { major, minor, patch } = parse(version);
  const code = major * 1_000_000 + minor * 1_000 + patch;
  if (code < 1 || code > 2_100_000_000) throw new Error(`versionCode out of range: ${code}`);
  return code;
}

export function next(version, bump) {
  const v = parse(version);
  if (bump === 'major') return `${v.major + 1}.0.0`;
  if (bump === 'minor') return `${v.major}.${v.minor + 1}.0`;
  if (bump === 'patch') return v.pre ? `${v.major}.${v.minor}.${v.patch}` : `${v.major}.${v.minor}.${v.patch + 1}`;
  parse(bump);
  return bump.replace(/^v/, '');
}

const readPkg = () => JSON.parse(readFileSync(pkgPath, 'utf8'));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === 'current') console.log(readPkg().version);
    else if (cmd === 'next') console.log(next(readPkg().version, arg));
    else if (cmd === 'code') console.log(buildNumber(arg ?? readPkg().version));
    else if (cmd === 'set') {
      const version = next('0.0.0', arg);
      const pkg = readPkg();
      pkg.version = version;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(version);
    } else {
      console.error('usage: version.mjs current | next <patch|minor|major|x.y.z> | set <x.y.z> | code [x.y.z]');
      process.exit(2);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
