# The production stack

Everything that runs https://sport.konekocode.pl lives in this repository. This page
explains the pieces and how to start them in a fresh checkout.

## What runs where

| Piece | Code | Runs as | Local port | Public address |
|---|---|---|---|---|
| Web app (Expo web export) | `apps/mobile` | `web` (nginx) serving `apps/mobile/dist` | 8090 | https://sport.konekocode.pl |
| API | `apps/api` | `api` (+ `migrate` on start) | 4100 | https://sport-api.konekocode.pl |
| Database | `apps/api/migrations` | `postgres` (volume `crw-production_postgres`) | - | - |
| Cache / rate limits | - | `redis` (volume `crw-production_redis`) | - | - |
| Photos and uploads | - | `minio` (volume `crw-production_minio`) | 9100 | https://sport-media.konekocode.pl |
| Rep counter + matchmaking | `apps/reps-counter` | `reps` (volume `crw-production_reps`) | 8000 | https://pompki.szybki-drop.pl |
| Android / iOS apps | `apps/mobile` | GitHub Actions `release-apps.yml` | - | GitHub Releases |

All services are in `deploy/compose.production.yaml` and bind to 127.0.0.1 only. The
public addresses come from two Cloudflare tunnels on the same machine:

- `crw-sport` (config `~/.cloudflared/crw-sport.yml`): sport, sport-api, sport-media.
- `pompki` (credentials in `~/.cloudflared/`): pompki.szybki-drop.pl -> localhost:8000.

Data lives in named Docker volumes, so the stack can be started from any checkout folder
without losing anything, as long as the compose project name stays `crw-production`.

## Secrets (never committed)

| File | What |
|---|---|
| `apps/api/.env.production` | API settings: database URL, session secret, Resend key, Google client IDs, S3, `FCM_SERVICE_ACCOUNT` |
| `deploy/.env` | `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` |
| `~/.crw/` | Android release keystore and `android-signing.properties` |
| `~/.cloudflared/` | Tunnel credentials |

`apps/mobile/google-services.json` is committed on purpose: it is the Firebase config
for the Android app and is safe to ship.

## Start from a fresh checkout

```sh
git clone https://github.com/TKY01/fitness.git crw-plus
cd crw-plus
npm ci
# copy the two env files from the old checkout (see "Secrets")

# web app
cd apps/mobile
EXPO_PUBLIC_API_URL=https://sport-api.konekocode.pl \
EXPO_PUBLIC_APP_URL=https://sport.konekocode.pl \
EXPO_PUBLIC_REPS_URL=https://pompki.szybki-drop.pl \
EXPO_PUBLIC_MAPBOX_TOKEN=<mapbox public token> \
npm run build
cd ../..

# everything else
docker compose -p crw-production -f deploy/compose.production.yaml --env-file deploy/.env up -d --build

# tunnels (keep running; or install them as Windows services)
cloudflared tunnel --config ~/.cloudflared/crw-sport.yml run crw-sport
cloudflared tunnel run --url http://localhost:8000 pompki
```

Check: `curl https://sport-api.konekocode.pl/health`, open the site, open the counter.

## Deploying a change

- API: `docker compose -p crw-production -f deploy/compose.production.yaml --env-file deploy/.env up -d --build migrate api`
- Web app: `npm run build` in `apps/mobile` (nginx serves the new `dist` at once)
- Rep counter: `... up -d --build reps`
- Phone apps: Actions -> "Release apps" -> Run workflow (see `docs/RELEASE.md`)
- Local Android build: `apps/mobile/scripts/build-android.ps1 -Clean`
