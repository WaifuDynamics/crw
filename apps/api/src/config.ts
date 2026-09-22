import 'dotenv/config';
import { randomBytes } from 'node:crypto';
export const config = {
  production: process.env.NODE_ENV === 'production',
  test: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT || 4000),
  appUrl: process.env.APP_URL || 'http://localhost:8081',
  apiUrl: process.env.API_URL || 'http://localhost:4000',
  origins: (process.env.ALLOWED_ORIGINS || 'http://localhost:8081,http://localhost:8082').split(
    ',',
  ),
  secret: process.env.SESSION_SECRET || randomBytes(48).toString('hex'),
  // The oldest app version this API still serves, the newest one published, and whether
  // CRW+ is down for maintenance: the apps read them from /v1/meta.
  minAppVersion: process.env.MIN_APP_VERSION || '2.0.0',
  latestAppVersion: process.env.LATEST_APP_VERSION || null,
  maintenance: process.env.MAINTENANCE === 'true',
  // Where a phone gets the new version: the store page once there is one.
  updateUrl: process.env.UPDATE_URL || null,
  // The mobile app's URL scheme (app.config.ts), used to hand a browser sign-in back.
  appScheme: process.env.APP_SCHEME || 'crw',
  payments: process.env.PAYMENT_PROVIDER || 'sandbox',
  google: {
    // OAuth client IDs from Google Cloud (web, and later iOS/Android), comma separated.
    // Sign-in is disabled until at least one is set.
    clientIds: (process.env.GOOGLE_CLIENT_ID || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    // Overridable only so tests can sign their own tokens.
    jwksUrl: process.env.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs',
  },
  apple: {
    // The audiences Apple issues tokens for: the iOS bundle identifier for the app and
    // the Services ID for the website, comma separated. Sign in with Apple is disabled
    // until at least one is set.
    clientIds: (process.env.APPLE_CLIENT_ID || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    // What the browser needs to start the web flow.
    servicesId: process.env.APPLE_SERVICES_ID || '',
    redirectUri: process.env.APPLE_REDIRECT_URI || '',
    jwksUrl: process.env.APPLE_JWKS_URL || 'https://appleid.apple.com/auth/keys',
  },
};
// Production must be configured on purpose: refuse to start rather than fall back to a
// development default (a random session secret, localhost, a sandbox payment provider),
// and list every problem at once so a new server is fixed in one pass, not one at a time.
if (config.production) {
  const problems: string[] = [];
  for (const name of [
    'DATABASE_URL',
    'REDIS_URL',
    'APP_URL',
    'API_URL',
    'ALLOWED_ORIGINS',
    'MAIL_PROVIDER',
    'S3_BUCKET',
  ])
    if (!process.env[name]) problems.push(`${name} must be set`);
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length < 32 || secret.includes('replace-with'))
    problems.push('SESSION_SECRET must be set to a strong secret, at least 32 characters');
  for (const name of ['APP_URL', 'API_URL', 'ALLOWED_ORIGINS']) {
    const value = process.env[name];
    if (value && value.split(',').some((u) => !u.trim().startsWith('https://')))
      problems.push(`${name} must use https:// (got ${value})`);
  }
  if (config.payments === 'sandbox' || process.env.MAIL_PROVIDER === 'console')
    problems.push('development adapters (sandbox payments, console mail) are not allowed');
  if (problems.length)
    throw new Error(`CRW+ API is not configured for production:\n  - ${problems.join('\n  - ')}`);
}

// The browser app and the API are separate deployments when their origins differ.
// Cross-site session cookies are only delivered with SameSite=None, which browsers
// accept only over HTTPS, so the two attributes are decided together.
// SameSite is scoped to the site, not the origin: a differing port (localhost:8081 to
// localhost:4000 in development) stays same-site, so only the host is compared here.
const host = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};
export const crossSite = host(config.appUrl) !== host(config.apiUrl);
export const sessionCookie = {
  httpOnly: true,
  secure: config.production || crossSite,
  sameSite: crossSite ? ('none' as const) : ('lax' as const),
  path: '/',
  maxAge: 30 * 86400,
};
if (crossSite && !config.apiUrl.startsWith('https://'))
  throw new Error('A cross-origin APP_URL/API_URL pair requires an HTTPS API for session cookies');
if (!config.production && !config.test && !process.env.SESSION_SECRET)
  throw new Error(
    'Run npm run setup to generate a persistent development SESSION_SECRET before starting or seeding CRW+.',
  );
