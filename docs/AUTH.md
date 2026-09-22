# Sign-in and user accounts

CRW+ supports email/password, **Sign in with Google** and **Sign in with Apple**. All of
them end in the same server session (`pace_session` cookie on web, bearer token on
native), and one account can be reached through any of them.

## Google sign-in

### Flow

1. The web app asks the API for the client ID (`GET /auth/google/config`), or reads
   `EXPO_PUBLIC_GOOGLE_CLIENT_ID` if it is set at build time.
2. Google Identity Services renders its button and returns an **ID token**.
3. The app posts it to `POST /auth/google { credential }`.
4. The API verifies the token with Google's published keys
   (`https://www.googleapis.com/oauth2/v3/certs`): RS256 signature, issuer
   `accounts.google.com`, audience = one of `GOOGLE_CLIENT_ID`, not expired, and
   `email_verified` must be true.
5. The account is resolved in this order:
   - **Known Google identity** (`user_accounts.google_sub`) → sign in.
   - **Existing user with the same, Google-verified email** → link Google to it and
     sign in. The password keeps working. A user already linked to a *different*
     Google identity is refused (409).
   - **Otherwise** → create a user with no password, email already verified, the
     USER role, a public profile and an account row.

Google-only users cannot sign in with a password (there is none); they can set one
later through the password-reset flow.

### Configure

1. Google Cloud Console → *APIs & Services* → *Credentials* → *Create credentials* →
   *OAuth client ID* → **Web application**.
2. *Authorized JavaScript origins*: every origin that shows the button, e.g.
   `http://localhost:8081` and your production `APP_URL`. No redirect URI is needed.
3. Configure the OAuth consent screen (app name, support email; scopes: the default
   `openid`, `email`, `profile`).
4. Put the client ID in `apps/api/.env`:

   ```sh
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```

   Several IDs (web, iOS, Android) can be listed comma-separated; any of them is
   accepted as the token audience.
5. Restart the API. The button appears on the sign-in screen; while the variable is
   empty it is hidden and `POST /auth/google` answers 503.

The client ID is public by design; there is no client secret in this flow.

### Native apps

Not wired yet. iOS/Android need a development build and platform client IDs; the API
side already accepts their tokens once those IDs are added to `GOOGLE_CLIENT_ID`.

## Sign in with Apple

### Flow

Same shape as Google, with `apple_sub` in place of `google_sub`:

1. iOS opens Apple's own sheet (`expo-apple-authentication`); the website loads Apple's
   script and opens a popup with the Services ID from `GET /auth/apple/config`.
2. Both return an **identity token**, posted to
   `POST /auth/apple { credential, firstName?, lastName? }`.
3. The API verifies it against `https://appleid.apple.com/auth/keys`: RS256, issuer
   `https://appleid.apple.com`, audience = one of `APPLE_CLIENT_ID`, not expired, and
   `email_verified` true (Apple writes it as a boolean or as the string `"true"`).
4. The account is resolved exactly as for Google: known Apple identity, then an existing
   user with the same address (linked, 409 if a different Apple ID already holds it),
   otherwise a new account.

Apple sends the person's name **only on the first sign-in**, and only to the client, so
the app passes `firstName`/`lastName` along and they are used only when the account is
created. Addresses can be private relay ones (`...@privaterelay.appleid.com`): that is
the address Apple forwards mail through, so it is stored as-is.

Android has no native Apple sign-in, so the button is hidden there.

### Configure

1. Apple Developer → *Certificates, Identifiers & Profiles*.
2. Enable the **Sign in with Apple** capability on the app identifier
   `app.crwplus.fitness` (the app config already sets `usesAppleSignIn`).
3. For the website create a **Services ID**, enable Sign in with Apple on it, and add
   the app's origin and return URL.
4. In `apps/api/.env`:

   ```sh
   APPLE_CLIENT_ID=app.crwplus.fitness,com.crwplus.web
   APPLE_SERVICES_ID=com.crwplus.web
   APPLE_REDIRECT_URI=https://sport.konekocode.pl
   ```

5. Restart the API. While `APPLE_CLIENT_ID` is empty the button is hidden and
   `POST /auth/apple` answers 503.

No client secret is needed: the identity token is verified against Apple's public keys.

## `user_accounts` table

One row per user with private account details. Added in
`migrations/004_google_accounts.sql`; separate from `profiles`, which is the public
social profile.

| column | type | notes |
|---|---|---|
| `user_id` | uuid, PK → `users` | the account id |
| `google_sub` | text, unique | Google's stable user id; null if never linked |
| `avatar_url` | text | profile picture (Google photo on first sign-in) |
| `first_name`, `last_name` | text, ≤ 80 | from Google on first sign-in |
| `email` | text | copy of the sign-in email |
| `country_code` | char(2) | ISO 3166-1 alpha-2, e.g. `PL`; not a foreign key, because `countries` lists only CRW+ markets |
| `language` | text | app language, BCP 47 (`en`, `pl`, `pt-BR`); from Google's locale or `Accept-Language`, default `en` |
| `created_at`, `updated_at` | timestamptz | |

Every sign-up path creates a row. Users created elsewhere (seed, bootstrap admin) get
one on first read. Rows for accounts that existed before the migration hold the whole
display name in `first_name`, because the old profile had a single name field.

Future data such as training history should go into its own tables keyed by
`user_id`, rather than widening this one.

### API

| endpoint | auth | body / result |
|---|---|---|
| `GET /auth/google/config` | none | `{ clientId }` |
| `POST /auth/google` | none | `{ credential }` → `{ token, userId, created }` |
| `GET /auth/me` | session | now also contains `account` |
| `GET /account` | session | the account row |
| `PATCH /account` | session | any of `firstName`, `lastName`, `avatarUrl`, `countryCode`, `language` |

`PATCH` rejects unknown fields; the email is not editable there.

## Tests

`apps/api/test/google.test.ts` runs the real verification path against a local key
server with tokens it signs itself: new account, repeat sign-in, linking by verified
email, unverified email, a second Google identity, wrong audience / issuer / expiry /
signature, Google-only password login, account read and update, and account rows for
password and seeded users.

> The migration runner splits files on **every** semicolon, including ones inside
> `--` comments, and treats `$` as the start of a quoted body. Migrations must not
> contain a semicolon in a comment or a bare dollar sign (end regexes with `\Z`).
