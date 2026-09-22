# CRW+

**Get out. Get going.** A mobile social fitness marketplace, built with Expo, a protected TypeScript API and PostgreSQL.

This repository contains a working end-to-end application, development database, migrations, integration adapters, operational screens and automated tests. It has not been certified for live financial operation or released to app stores. External credentials, provider onboarding and device/release validation are still required; see [deployment](docs/DEPLOYMENT.md) and [payment operations](docs/PAYMENTS.md).

## Production

How sport.konekocode.pl, the API, the database, media storage, the rep counter
(`apps/reps-counter`) and the tunnels fit together, and how to start them from a fresh
checkout: [docs/STACK.md](docs/STACK.md).

## Run locally

Requires Node.js 24 and npm. No Docker is needed for the embedded PostgreSQL development mode.

```sh
npm ci
npm run setup
npm run seed
npm run dev
```

- Mobile browser preview: **http://localhost:8081**
- API health: **http://localhost:4000/health**
- Persistent local database: `apps/api/data/pace`
- Development settings and generated credentials: `apps/api/.env` (gitignored)

If Discover's sample activities have expired, run `npm run demo:refresh` with the local API running. It creates upcoming occurrences of the original demo activities while preserving past events and bookings; repeat runs skip activities that are already current. Preview the dates without creating events with `node scripts/refresh-demo-events.mjs`.

`setup` generates persistent secrets and preserves existing environment files. `seed` is explicitly development-only and never runs at production startup. The curated images are checked into `apps/api/public/demo`; future organizer media is uploaded through the API. Development checkout is visibly labeled and charges no money.

| Development account | Email | Password |
|---|---|---|
| Member (Alex Demo) | `alex@pace.local` | `SEED_PASSWORD` in `apps/api/.env` |
| Organizer (Olivia Organizer) | `organizer@pace.local` | Same generated development password |
| Administrator (Adam Admin) | `admin@pace.local` | Same generated development password |

There is no automatic login. The credentials above exist only after running the development seed command. New accounts use real registration and email verification; development verification/reset links appear in the API's console email adapter.

For a physical phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` and `API_URL` in `apps/api/.env` to your computer's LAN address, e.g. `http://192.168.1.50:4000`, before initializing that development database so seeded media URLs are reachable from the phone. Run `npm run mobile`. Use an Expo development build for complete native maps, camera and push testing.

## Implemented

- **Sign-in:** email/password and Google; per-user account details (photo, name, email, country, app language). See [sign-in and accounts](docs/AUTH.md).
- **Play:** camera-counted push-ups and squats, Solo / 1v1 / 2v2 matchmaking, wins and a world top 3 stored per account. See [Play](docs/PLAY.md).

- **Discover:** database-backed activity cards, imagery, category/city/search/time/free/paid/trending/followed-people/beginner/location filtering; actual attendance and activity counts; community discovery and challenge widgets.
- **Events and commerce:** approved-host publishing, capacity locking, price/fee snapshots, free and paid reservations, hosted checkout, payment verification, cancellation, durable refunds, receipts and QR tickets.
- **Community and social:** verified community pages, profile editing, following people/communities, public attendance, reactions, blocking, privacy settings, activity calendars and account removal.
- **Competition:** append-only XP ledger, verified check-in rewards, category exploration, backend challenge progress, collectible achievements, weekly/monthly/all-time individual rankings, current-user position, nearby competitors, scopes, seasons and ranking snapshots.
- **Food:** CRW+-branded kitchen directory with a dedicated menu screen for each store. The 49 selected dishes from SALATA, BôCafé and Slice & Bowl stay in their respective menus, with category filters, menu search, photos, source links, listed prices and serving-specific nutrition where published. This is a dated menu snapshot, not live stock or checkout. Run `node scripts/scrape-food.mjs` to refresh public restaurant sources into `apps/mobile/src/content/food-catalog.json`; failed scrapes preserve the previous snapshot.
- **Organizer studio:** applications, event creation/editing, community editing, photo uploads, attendee lists, announcements, camera/token check-in, refunds, sales metrics and payout status.
- **Administration:** audited organizer review and suspension, account moderation, activity management, financial records, payout creation/transfer recording, configurable fees/countries/currencies/categories/cities/challenges/achievements/XP, reports, notification campaigns and audit history.
- **Platform:** scrypt passwords, email verification/reset, revocable hashed sessions, server-side RBAC, validation, security headers, production Redis rate limits, privacy-aware queries, S3 uploads with a signed development adapter, email/push outbox and deployment configuration.

Regular users have exactly **Discover · Food · Compete · Profile**. Publishing controls are in the protected organizer studio. The server rejects attempts to bypass these roles.

## Verify

```sh
npm run typecheck
npm test
npm run build
npm audit
```

The API integration suite covers authorization, concurrency, payment tampering/retries, refunds, ticket forgery/reuse, immutable ledgers, privacy, ranking integrity, application review, uploads, payouts and worker finalization. Tests use a fresh in-memory PostgreSQL instance. CI also defines a PostgreSQL 17 service test job; set `TEST_DATABASE_URL` to a fresh dedicated database ending in `_test` to run that job locally.

With `npm run dev` already running and Chrome installed:

```sh
npm run test:ui
```

The browser test uses the actual app and API, creates an isolated development event, exercises booking through QR confirmation and cancellation, then cancels its test event. Screenshots are written to `artifacts/`.

Native JavaScript/asset export:

```sh
cd apps/mobile
npx expo export --platform android --platform ios --output-dir dist-native
```

Bundle export is not a substitute for signed native builds or device testing.

## Project map

```text
apps/mobile/          Expo app, screens, navigation, native capabilities
apps/api/src/         Fastify API, domain services, providers, workers
apps/api/migrations/  PostgreSQL schema and integrity constraints
apps/api/test/        Integration tests
apps/api/public/demo/ Cached development imagery
docs/                Architecture, deployment, payment contracts, asset sources
scripts/             Setup, assets, browser verification, dependency compatibility
```

See [architecture](docs/ARCHITECTURE.md) for data boundaries and security, [payment operations](docs/PAYMENTS.md) for provider contracts and manual payouts, and [release status](docs/RELEASE_STATUS.md) for remaining validation.
