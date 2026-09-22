#!/usr/bin/env node
// Renders every CRW+ brand image. Icons (app, Android adaptive, splash, favicon, PWA,
// notification) use the C+ mark in assets/crw-mark.svg; the email header uses the CRW+
// wordmark in assets/crw-logo.svg. Uses Playwright's Chromium (a dev dependency of the repo root).
//
//   node scripts/brand-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const app = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(path.join(app, 'package.json'));
const { chromium } = require('playwright');

const BG = '#08090B';
/** Reads a two-part brand SVG: the main shape (white) and the plus (blue). */
function art(file) {
  const source = fs.readFileSync(path.join(app, file), 'utf8');
  const viewBox = source.match(/viewBox="([^"]+)"/)[1];
  const [x, y, w, h] = viewBox.split(' ').map(Number);
  const [body, plus] = [...source.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  return { viewBox, x, y, w, h, body, plus };
}
const ART = { mark: art('assets/crw-mark.svg'), wordmark: art('assets/crw-logo.svg') };

/** Brand art as SVG markup, `width` px wide. */
const drawing = (a, width, { letters: ink = '#F7F8FA', plus: accent = '#168BFF' } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${a.viewBox}" width="${width}" height="${(width * a.h) / a.w}">` +
  `<path fill="${ink}" fill-rule="evenodd" d="${a.body}"/><path fill="${accent}" d="${a.plus}"/></svg>`;

/**
 * A square (or `height`-tall) canvas with the wordmark centred at `share` of the width.
 * `radius` rounds the background; `bg: null` keeps it transparent.
 */
const canvas = ({ size, height = size, share, bg = BG, radius = 0, colors, use = 'mark' }) =>
  `<div style="width:${size}px;height:${height}px;display:flex;align-items:center;justify-content:center;` +
  `background:${bg ?? 'transparent'};border-radius:${radius}px">${drawing(ART[use], Math.round(size * share), colors)}</div>`;

const WHITE = { letters: '#FFFFFF', plus: '#FFFFFF' };
const outputs = [
  // iOS and store icon: the system rounds the corners.
  ['assets/icon.png', { size: 1024, share: 0.72 }],
  // Android adaptive icon foreground: launchers crop to the middle 66%, so the mark stays small.
  ['assets/adaptive-icon.png', { size: 1024, share: 0.5, bg: null }],
  ['assets/android-icon-foreground.png', { size: 1024, share: 0.5, bg: null }],
  ['assets/android-icon-monochrome.png', { size: 1024, share: 0.5, bg: null, colors: WHITE }],
  ['assets/splash-icon.png', { size: 1024, share: 0.5, bg: null }],
  ['assets/favicon.png', { size: 64, share: 0.8, radius: 14 }],
  ['public/icons/favicon-32.png', { size: 32, share: 0.84, radius: 7 }],
  ['public/icons/icon-192.png', { size: 192, share: 0.72, radius: 40 }],
  ['public/icons/icon-512.png', { size: 512, share: 0.72, radius: 108 }],
  // Maskable icons get cropped to a circle: keep the mark inside the 80% safe zone.
  ['public/icons/maskable-192.png', { size: 192, share: 0.56 }],
  ['public/icons/maskable-512.png', { size: 512, share: 0.56 }],
  ['public/icons/apple-touch-icon.png', { size: 180, share: 0.7 }],
  // Status bar icon: Android draws only the alpha channel, so it is all white.
  ['assets/notification-icon.png', { size: 96, share: 0.96, bg: null, colors: WHITE }],
  // Email header (shown 150 px wide, rendered at 2x).
  ['public/brand/crw-logo-email.png', { size: 300, height: 106, share: 0.96, bg: null, use: 'wordmark' }],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
for (const [file, options] of outputs) {
  await page.setContent(`<html><body style="margin:0;background:transparent">${canvas(options)}</body></html>`);
  const target = path.join(app, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await page.locator('body > div').screenshot({ path: target, omitBackground: true });
  console.log('wrote', file);
}
await browser.close();

// Vector icons: the browser favicon (transparent) and the square app mark (dark tile).
const m = ART.mark;
const markPaths = `<path fill="#F7F8FA" fill-rule="evenodd" d="${m.body}"/><path fill="#168BFF" d="${m.plus}"/>`;
fs.writeFileSync(
  path.join(app, 'public/icons/favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${BG}"/>` +
    `<g transform="translate(6 6) scale(${52 / m.w}) translate(${-m.x} ${-m.y})">${markPaths}</g></svg>
`,
);
fs.writeFileSync(
  path.join(app, 'assets/crw-icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="224" fill="${BG}"/>` +
    `<g transform="translate(143 143) scale(${738 / m.w}) translate(${-m.x} ${-m.y})">${markPaths}</g></svg>
`,
);
console.log('wrote public/icons/favicon.svg, assets/crw-icon.svg');
