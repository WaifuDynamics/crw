# Deployment and environment

## API

Provision PostgreSQL 17+, Redis, an HTTPS API endpoint, a transactional email sender and S3-compatible object storage with a CDN. Store secrets in your deployment platform's secret manager. Do not deploy local `.env` files or development database data.

| Variable | Purpose |
|---|---|
| `NODE_ENV=production` | Enables production guards; disables seeds, local media/checkout adapters |
| `DATABASE_URL` | PostgreSQL connection string; use TLS per your database provider |
| `REDIS_URL` | Shared production rate-limit storage |
| `SESSION_SECRET` | At least 32 random characters; keep stable to preserve ticket verification |
| `APP_URL`, `API_URL` | Public HTTPS origins |
| `ALLOWED_ORIGINS` | Comma-separated browser origins permitted to call the API |
| `PAYMENT_PROVIDER` | Non-sandbox provider configuration; routing still uses explicit country lists |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_COUNTRIES` | Stripe merchant configuration where contracted/supported |
| `GATEWAY_URL`, `GATEWAY_API_KEY`, `GATEWAY_WEBHOOK_SECRET`, `GATEWAY_COUNTRIES` | Contracted regional hosted gateway protocol |
| `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM` | Verified transactional email sender |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | Object storage; endpoint optional for AWS |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Least-privilege storage credentials, or use workload IAM |
| `MEDIA_PUBLIC_URL` | HTTPS media CDN base URL |
| `EXPO_ACCESS_TOKEN` | Expo push security token when push access security is enabled (iOS pushes) |
| `FCM_SERVICE_ACCOUNT` | Firebase service account key (JSON or base64) for Android pushes through FCM. Project `crw-plus`, account `crw-push@crw-plus.iam.gserviceaccount.com`. Test with `npx tsx --env-file=.env.production scripts/check-fcm.ts` |
| `TRUST_PROXY` | Enable only behind your controlled reverse proxy |

Run migrations as a single deployment job before starting multiple replicas:

```sh
npm run build -w @crw/api
cd apps/api
node dist/migrate.js
```

Bootstrap the first administrator through the trusted deployment console by setting `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then running `node dist/bootstrap.js`. It creates the initial country/category catalog and a private admin account, refuses to overwrite an existing account, and writes an audit record. Remove `ADMIN_PASSWORD` from the environment afterward. Sign in to configure fees, challenges, achievements, country routing and organizer approvals.

`Dockerfile` builds a non-root API image. `compose.yaml` provides PostgreSQL/Redis and an optional production API profile. Set `POSTGRES_PASSWORD`; provide `apps/api/.env.production` before `docker compose --profile production up --build`. Terminate TLS through your controlled proxy. The development compose ports bind only to localhost.

The API process runs short durable-job batches every 30 seconds. Transactions and row locks protect outbox/refund claims; abandoned claims recover after ten minutes. Monitor failed refunds/outbox entries, webhook error rates, capacity conflicts and database latency. Application health verifies database connectivity. Back up PostgreSQL and test point-in-time recovery before accepting payments.

## Object storage

Allow only the deployed app origin for browser PUT CORS, with `Content-Type` allowed. The API signs content type, exact content length and a five-minute expiration. Configure bucket credentials for the required object prefix only; forbid public writes, bucket listing and ACL changes. Serve image objects through a CDN with correct content types, `X-Content-Type-Options: nosniff` and appropriate cross-origin resource policy. Enable lifecycle cleanup for orphaned uploads. Private verification documents, if added later, must use a separate private prefix and signed reads rather than the public media path.

## Mobile

Set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_URL` and `EXPO_PUBLIC_MAPBOX_TOKEN` (the `preview` and `production` profiles in `apps/mobile/eas.json` already do). Maps on every platform are Leaflet with Mapbox tiles; the native app shows them in a WebView, so no Google Maps key or billing account is needed. Public Expo variables are embedded in the app; never put payment, email, session or storage secrets in them. Configure map keys with platform/package/signing restrictions. The web preview uses `EXPO_PUBLIC_MAP_TILE_URL`; use a contracted tile plan for a production web release.

```sh
cd apps/mobile
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile production --platform all
```

Set your own bundle identifiers and store metadata in `app.config.ts`. Configure APNs and FCM credentials in EAS and test physical-device push registration, camera scanning, permission denials, deep links, uploads and accessibility. iOS signing/builds need Apple credentials and EAS or macOS/Xcode. Android distribution needs a keystore and Play credentials. This session did not create store accounts or publish binaries.

The `crw://` custom scheme is configured. To support verified HTTPS universal/app links, add your domain's association files and native associated-domain/intent-filter configuration after obtaining the actual domains and signing identifiers. Hosted payment return links currently target the browser preview; native users return to the app and refresh their ticket after hosted checkout.

## Dependency pinning

The lockfile pins patched `uuid` and `decode-uri-component` versions. `scripts/patch-compat.cjs` supplies a small CommonJS-to-ESM bridge for React Navigation's `query-string` dependency and verifies decoding during install. Preserve this postinstall step. CI fails on moderate-or-higher audit findings. Re-review the bridge when upgrading React Navigation.

Official build reference: [Expo builds](https://docs.expo.dev/build/introduction/). Mapping reference: [React Native Maps](https://github.com/react-native-maps/react-native-maps).
