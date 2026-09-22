import type { FastifyInstance } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { z } from 'zod';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, tx, type DB } from '../db.js';
import { config, sessionCookie } from '../config.js';
import { audit, authenticated, HttpError, id, newSession, requireValue } from '../security.js';
import { LEGAL_VERSION } from '../legal.js';

// Google signs ID tokens with rotating keys published here; jose caches them.
const googleKeys = createRemoteJWKSet(new URL(config.google.jwksUrl));

type GoogleClaims = JWTPayload & {
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
  locale?: string;
};

const language = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Use a language tag such as en, pl or pt-BR');
const country = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Use a two-letter country code such as PL');

// The shape returned to the app. Keep it explicit so new columns are opt-in.
const ACCOUNT_COLUMNS = `user_id AS id, avatar_url, first_name, last_name, email, country_code, language,
  age, weight_kg::float8 AS weight_kg, height_cm, onboarding_completed_at,
  marketing_opt_in, marketing_consent_at, push_friend_activity, legal_version, legal_accepted_at,
  google_sub IS NOT NULL AS google_linked, apple_sub IS NOT NULL AS apple_linked,
  created_at, updated_at`;

export async function accountFor(c: DB, userId: string) {
  // Users created outside the sign-up paths (seed, bootstrap admin) have no row yet;
  // create it on first read so every account looks the same.
  await c.query(
    `INSERT INTO user_accounts(user_id, avatar_url, first_name, email)
     SELECT u.id, p.avatar_url, left(coalesce(p.display_name, ''), 80), u.email
     FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=$1
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const [a] = await c.query(`SELECT ${ACCOUNT_COLUMNS} FROM user_accounts WHERE user_id=$1`, [
    userId,
  ]);
  return a || null;
}

// "pl-PL,pl;q=0.9,en" -> "pl-PL"; anything unusable falls back to English.
function languageFrom(...candidates: (string | undefined)[]) {
  for (const raw of candidates) {
    const tag = raw?.split(',')[0]?.split(';')[0]?.trim();
    if (!tag) continue;
    const [lang, region] = tag.split(/[-_]/);
    const normal = region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase();
    if (language.safeParse(normal).success) return normal;
  }
  return 'en';
}

async function verifyGoogle(credential: string): Promise<GoogleClaims> {
  requireValue(config.google.clientIds.length, 503, 'Google sign-in is not configured');
  try {
    const { payload } = await jwtVerify(credential, googleKeys, {
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
      audience: config.google.clientIds,
      algorithms: ['RS256'],
    });
    return payload as GoogleClaims;
  } catch {
    throw new HttpError(401, 'Google sign-in could not be verified');
  }
}

const appleKeys = createRemoteJWKSet(new URL(config.apple.jwksUrl));

type AppleClaims = JWTPayload & {
  email?: string;
  /** Apple sends a boolean in the app flow and the string "true" on the web. */
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
};

async function verifyApple(credential: string): Promise<AppleClaims> {
  requireValue(config.apple.clientIds.length, 503, 'Sign in with Apple is not configured');
  try {
    const { payload } = await jwtVerify(credential, appleKeys, {
      issuer: 'https://appleid.apple.com',
      audience: config.apple.clientIds,
      algorithms: ['RS256'],
    });
    return payload as AppleClaims;
  } catch {
    throw new HttpError(401, 'Apple sign-in could not be verified');
  }
}

export async function accountRoutes(app: FastifyInstance) {
  // Apple answers the browser flow with a form post.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))),
  );

  app.get('/auth/google/config', async () => ({
    // Public by design: the browser needs it to render the Google button.
    clientId: config.google.clientIds[0] || null,
  }));

  // One account may be reached through a password, through Google and through Apple. The
  // provider tells us a stable identifier (the "sub") and an address the provider itself
  // has verified, which is what lets it match an account that already exists.
  type Identity = {
    provider: 'google' | 'apple';
    sub: string;
    email: string;
    firstName: string;
    lastName: string;
    displayName?: string;
    picture: string | null;
    language: string;
  };

  async function signInWith(i: Identity) {
    const column = `${i.provider}_sub`;
    return tx(async (c) => {
      const [linked] = await c.query(
        `SELECT a.user_id FROM user_accounts a JOIN users u ON u.id=a.user_id
         WHERE a.${column}=$1 AND u.status='active'`,
        [i.sub],
      );
      if (linked) {
        await c.query(
          `UPDATE user_accounts SET avatar_url=coalesce($2, avatar_url), updated_at=now() WHERE user_id=$1`,
          [linked.user_id, i.picture],
        );
        return { userId: linked.user_id as string, created: false };
      }

      const [existing] = await c.query(`SELECT id, status FROM users WHERE email=$1`, [i.email]);
      if (existing) {
        requireValue(existing.status === 'active', 403, 'This account is not active');
        const [taken] = await c.query(
          `SELECT ${column} FROM user_accounts WHERE user_id=$1 AND ${column} IS NOT NULL`,
          [existing.id],
        );
        requireValue(!taken, 409, `This account is linked to a different ${i.provider} account`);
        await c.query(
          `INSERT INTO user_accounts(user_id, ${column}, avatar_url, first_name, last_name, email, language)
           VALUES($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (user_id) DO UPDATE SET ${column}=excluded.${column},
             avatar_url=coalesce(user_accounts.avatar_url, excluded.avatar_url), updated_at=now()`,
          [existing.id, i.sub, i.picture, i.firstName, i.lastName, i.email, i.language],
        );
        // The provider has verified the address, which is what our own link would do.
        await c.query(
          'UPDATE users SET email_verified_at=coalesce(email_verified_at, now()) WHERE id=$1',
          [existing.id],
        );
        await audit(c, existing.id, `account.${i.provider}_linked`, 'user', existing.id);
        return { userId: existing.id as string, created: false };
      }

      const userId = id();
      const displayName = (
        i.displayName ||
        [i.firstName, i.lastName].filter(Boolean).join(' ') ||
        i.email.split('@')[0]
      )
        .trim()
        .slice(0, 60)
        .padEnd(2, '.');
      await c.query(
        'INSERT INTO users(id, email, password_hash, email_verified_at) VALUES($1,$2,NULL,now())',
        [userId, i.email],
      );
      await c.query('INSERT INTO profiles(user_id, display_name, avatar_url) VALUES($1,$2,$3)', [
        userId,
        displayName,
        i.picture,
      ]);
      await c.query(`INSERT INTO user_roles(user_id, role) VALUES($1,'USER')`, [userId]);
      await c.query(
        `INSERT INTO user_accounts(user_id, ${column}, avatar_url, first_name, last_name, email, language)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [userId, i.sub, i.picture, i.firstName, i.lastName, i.email, i.language],
      );
      await audit(c, userId, `account.${i.provider}_created`, 'user', userId);
      return { userId, created: true };
    });
  }

  async function startSession(reply: any, result: { userId: string; created: boolean }) {
    const token = await newSession(result.userId);
    reply.setCookie('pace_session', token, { ...sessionCookie });
    return { token, userId: result.userId, created: result.created };
  }

  app.post(
    '/auth/google',
    { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const { credential } = z.object({ credential: z.string().min(20).max(4096) }).parse(req.body);
      const g = await verifyGoogle(credential);
      requireValue(g.sub, 401, 'Google sign-in could not be verified');
      // Only an address Google itself has verified may match an existing account;
      // otherwise anyone could create a Google account claiming someone's email.
      requireValue(g.email && g.email_verified === true, 403, 'Your Google email is not verified');
      return startSession(
        reply,
        await signInWith({
          provider: 'google',
          sub: g.sub!,
          email: g.email!.toLowerCase().trim(),
          firstName: (g.given_name || '').slice(0, 80),
          lastName: (g.family_name || '').slice(0, 80),
          displayName: g.name,
          picture: g.picture || null,
          language: languageFrom(g.locale, req.headers['accept-language']),
        }),
      );
    },
  );

  app.get('/auth/apple/config', async () => ({
    // Public by design: the browser needs it to start the Apple flow, and the app needs
    // to know whether to offer the button at all.
    enabled: config.apple.clientIds.length > 0,
    clientId: config.apple.servicesId || null,
    redirectUri: config.apple.redirectUri || null,
  }));

  app.post(
    '/auth/apple',
    { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      // Apple sends the name only the first time somebody signs in, and only to the app,
      // so the client passes it along for the account it is about to create.
      const b = z
        .object({
          credential: z.string().min(20).max(8192),
          firstName: z.string().trim().max(80).optional(),
          lastName: z.string().trim().max(80).optional(),
        })
        .parse(req.body);
      const a = await verifyApple(b.credential);
      requireValue(a.sub, 401, 'Apple sign-in could not be verified');
      requireValue(a.email, 403, 'Apple did not share an email address for this account');
      // Apple writes the flag as a boolean or as the string "true" depending on the flow.
      requireValue(
        a.email_verified === true || a.email_verified === 'true',
        403,
        'Your Apple email is not verified',
      );
      return startSession(
        reply,
        await signInWith({
          provider: 'apple',
          sub: a.sub!,
          email: a.email!.toLowerCase().trim(),
          firstName: (b.firstName || '').slice(0, 80),
          lastName: (b.lastName || '').slice(0, 80),
          picture: null,
          language: languageFrom(req.headers['accept-language']),
        }),
      );
    },
  );

  // Sign in with Apple away from an Apple device (Android, and any browser that cannot
  // open Apple's own sheet): Apple is opened in a browser tab and posts the identity
  // token straight back here. The state is signed with the session secret, so a reply
  // that did not start with us is refused, and it carries where to go afterwards.
  const stateSecret = () => createHmac('sha256', config.secret);
  function signState(target: 'app' | 'web') {
    const raw = `${target}.${Date.now()}.${randomBytes(9).toString('base64url')}`;
    return `${raw}.${stateSecret().update(raw).digest('base64url')}`;
  }
  function readState(state: string): 'app' | 'web' {
    const at = state.lastIndexOf('.');
    const raw = state.slice(0, at);
    const given = Buffer.from(state.slice(at + 1));
    const want = Buffer.from(stateSecret().update(raw).digest('base64url'));
    requireValue(
      given.length === want.length && timingSafeEqual(given, want),
      400,
      'That sign-in did not start here',
    );
    const [target, started] = raw.split('.');
    requireValue(Date.now() - Number(started) < 15 * 60_000, 400, 'That sign-in link has expired');
    return target === 'app' ? 'app' : 'web';
  }

  app.get('/auth/apple/start', async (req, reply) => {
    requireValue(
      config.apple.servicesId && config.apple.redirectUri,
      503,
      'Sign in with Apple is not configured for the browser',
    );
    const { target } = z.object({ target: z.enum(['app', 'web']).default('app') }).parse(req.query);
    const url = new URL('https://appleid.apple.com/auth/authorize');
    url.searchParams.set('client_id', config.apple.servicesId);
    url.searchParams.set('redirect_uri', config.apple.redirectUri);
    url.searchParams.set('response_type', 'code id_token');
    // Apple only sends the name with form_post, and only the first time.
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set('scope', 'name email');
    url.searchParams.set('state', signState(target));
    return reply.redirect(url.toString(), 302);
  });

  // Where Apple posts the answer. It is a browser navigation, so it ends in a redirect
  // rather than JSON: back into the app through its own scheme, or to the website.
  app.post('/auth/apple/callback', async (req, reply) => {
    const b = z
      .object({
        id_token: z.string().min(20).max(8192).optional(),
        state: z.string().min(10).max(300),
        user: z.string().max(2000).optional(),
        error: z.string().max(200).optional(),
      })
      .parse(req.body ?? {});
    const target = readState(b.state);
    const home = target === 'app' ? `${config.appScheme}://sign-in` : `${config.appUrl}/`;
    if (b.error || !b.id_token)
      return reply.redirect(`${home}?error=${encodeURIComponent(b.error || 'cancelled')}`, 302);

    const a = await verifyApple(b.id_token);
    requireValue(a.sub, 401, 'Apple sign-in could not be verified');
    requireValue(a.email, 403, 'Apple did not share an email address for this account');
    requireValue(
      a.email_verified === true || a.email_verified === 'true',
      403,
      'Your Apple email is not verified',
    );
    // On the very first sign-in Apple posts the name once, as JSON, next to the token.
    let firstName = '';
    let lastName = '';
    try {
      const person = b.user ? JSON.parse(b.user) : null;
      firstName = String(person?.name?.firstName ?? '').slice(0, 80);
      lastName = String(person?.name?.lastName ?? '').slice(0, 80);
    } catch {
      // A name we cannot read is no reason to refuse the sign-in.
    }
    const result = await signInWith({
      provider: 'apple',
      sub: a.sub!,
      email: a.email!.toLowerCase().trim(),
      firstName,
      lastName,
      picture: null,
      language: languageFrom(req.headers['accept-language']),
    });
    const session = await startSession(reply, result);
    return reply.redirect(
      `${home}?token=${encodeURIComponent(session.token)}&created=${result.created}`,
      302,
    );
  });

  app.get('/account', async (req) => {
    const u = await authenticated(req);
    const account = await accountFor(db, u.id);
    requireValue(account, 404, 'Account details not found');
    return account;
  });

  // Acceptance of the Terms of Service, Privacy Policy and Community Guidelines, with the
  // age confirmation. Only the current version can be accepted.
  app.post('/account/legal', async (req) => {
    const u = await authenticated(req);
    const b = z
      .object({
        version: z.literal(LEGAL_VERSION, {
          message: 'The terms were updated. Reload the app to read the current version.',
        }),
        ageConfirmed: z.literal(true, { message: 'CRW+ is for people aged 13 or older' }),
        platform: z.enum(['ios', 'android', 'web']).optional(),
      })
      .strict()
      .parse(req.body);
    return tx(async (c) => {
      await accountFor(c, u.id);
      await c.query(
        `INSERT INTO legal_acceptances(user_id, version, age_confirmed, platform)
         VALUES($1,$2,true,$3) ON CONFLICT (user_id, version) DO NOTHING`,
        [u.id, b.version, b.platform ?? null],
      );
      await c.query(
        `UPDATE user_accounts SET legal_version=$2, legal_accepted_at=now(), updated_at=now()
         WHERE user_id=$1`,
        [u.id, b.version],
      );
      await audit(c, u.id, 'legal.accepted', 'user', u.id, {
        version: b.version,
        platform: b.platform ?? null,
      });
      return accountFor(c, u.id);
    });
  });

  app.patch('/account', async (req) => {
    const u = await authenticated(req);
    const body = z
      .object({
        firstName: z.string().trim().max(80),
        lastName: z.string().trim().max(80),
        avatarUrl: z.url().max(2048).nullable(),
        countryCode: country.nullable(),
        language,
        // Body details from the sign-up questions. null clears a value the person skipped.
        age: z.number().int().min(13).max(120).nullable(),
        weightKg: z
          .number()
          .min(25)
          .max(350)
          .transform((v) => Math.round(v * 10) / 10)
          .nullable(),
        heightCm: z.number().int().min(90).max(250).nullable(),
        // Sent when the sign-up questions are finished, answered or skipped.
        onboardingComplete: z.literal(true),
        // Consent to the daily marketing email. Off unless the person turns it on.
        marketingOptIn: z.boolean(),
        // Pushes when a friend finishes a workout.
        pushFriendActivity: z.boolean(),
      })
      .partial()
      .strict()
      .parse(req.body);
    const sets: string[] = [];
    const values: any[] = [u.id];
    const column = {
      firstName: 'first_name',
      lastName: 'last_name',
      avatarUrl: 'avatar_url',
      countryCode: 'country_code',
      language: 'language',
      age: 'age',
      weightKg: 'weight_kg',
      heightCm: 'height_cm',
      pushFriendActivity: 'push_friend_activity',
    } as const;
    for (const [key, col] of Object.entries(column)) {
      const v = (body as any)[key];
      if (v === undefined) continue;
      values.push(v);
      sets.push(`${col}=$${values.length}`);
    }
    if (body.onboardingComplete)
      sets.push('onboarding_completed_at=coalesce(onboarding_completed_at, now())');
    if (body.marketingOptIn === true)
      sets.push('marketing_opt_in=true', 'marketing_consent_at=now()', 'marketing_opt_out_at=NULL');
    if (body.marketingOptIn === false)
      sets.push('marketing_opt_in=false', 'marketing_opt_out_at=now()');
    return tx(async (c) => {
      if (body.marketingOptIn !== undefined) {
        const [before] = await c.query(
          'SELECT marketing_opt_in FROM user_accounts WHERE user_id=$1',
          [u.id],
        );
        if (before && before.marketing_opt_in !== body.marketingOptIn)
          await audit(
            c,
            u.id,
            body.marketingOptIn ? 'marketing.consented' : 'marketing.unsubscribed',
            'user',
            u.id,
            { via: 'settings' },
          );
      }
      if (sets.length)
        await c.query(
          `UPDATE user_accounts SET ${sets.join(', ')}, updated_at=now() WHERE user_id=$1`,
          values,
        );
      const account = await accountFor(c, u.id);
      requireValue(account, 404, 'Account details not found');
      return account;
    });
  });
}
