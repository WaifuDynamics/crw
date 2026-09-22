# Tracking

Tracking replaces the Profile tab. Compete's profile avatar opens the existing Profile screen, with a back button. Public profile links continue using the Person route.

## Recording and storage

Guests and signed-in users can record GPS runs with kilometres, active elapsed time, current and average pace, route segments, and complete kilometre splits. Pause/resume breaks the route so movement while paused does not add distance. Inaccurate locations, out-of-order samples and implausible jumps are rejected. Gaps over 30 seconds start a new segment instead of inventing a connecting distance.

Each account has a separate AsyncStorage journal on the current device. Run recording and saving do not need the API or a network connection; map tiles do. Data is not synced to the server or included in public rankings. Android backup is disabled. Signing out or replacing a session pauses recording. Recovery preserves the last recorded active duration if a recorder is no longer running.

Guest tracking uses a separate `guest` journal and supports local recording, native health imports and run-photo creation. Login/signup offers Continue as guest, and the guest Profile links directly to Tracking. Guest history is not automatically transferred to an account. API authentication remains required for private account features and server mutations.

Native background location uses the globally registered `pace-run-location-v1` TaskManager task with an Android foreground notification and iOS background location indicator. Browsers only record while visible and pause when hidden. A browser reload recovers an interrupted run as paused. Current pace is unavailable until enough recent GPS movement is recorded; missing values use an em dash.

## Health Connect (Android) and Apple Health

Open **Tracking → watch icon** (Connected health). Everything is opt-in and people can grant any subset of permissions; each feature checks its own permission and skips what was not granted.

**Read** (Sync with Health Connect / Apple Health):

- today's steps, active energy and average heart rate for the dashboard;
- every workout type from the last 30 days, not only runs (yoga, cycling, gym, …) with distance, active time, calories, average heart rate and steps per session, and the route when Health Connect returns it;
- the latest weight and height. They fill the CRW+ profile when it has none, which improves calorie estimates.

Imports use provider ids and an overlap heuristic, so refreshing does not duplicate workouts. Records CRW+ wrote itself (package `app.crwplus.fitness` or a `crw-` client record id) are never imported back.

**Write** (Android, toggle *Save CRW+ workouts to Health Connect*, off by default):

- finished CRW+ GPS runs: an `ExerciseSession` (running) with the GPS route, `Distance` and `ActiveCaloriesBurned`. Saved automatically on Finish when the toggle is on, or with *Save to Health Connect* in a run summary;
- solo push-up and squat sessions from the camera counter (fetched from `GET /reps/sessions`): squats as strength training with a squat segment and repetitions, push-ups as calisthenics (Health Connect has no push-up segment) with the count in the title and notes;
- weight and height from the CRW+ profile when Health Connect has none.

Every written record has a `clientRecordId` (`crw-<run id>-session`, `crw-reps-<id>-…`), so writing the same workout twice updates it instead of duplicating it. Without the route permission a run is written without its map.

Calories for CRW+ workouts are estimates (`src/tracking/calories.ts`): about 1 kcal per kg per km for runs, MET values for push-ups and squats, 70 kg when no weight is known.

Apple Health currently reads only (runs, daily totals); writing is Android-only for now.

Code: `src/tracking/health.android.ts` (native calls), `healthConnectMapping.ts` (pure mapping, unit tested with `npm test -w @crw/mobile`), `healthSync.ts` (sync orchestration), `health.ios.ts`, `health.ts` (browser + shared types).

### Building and releasing

Health Connect needs a native build; Expo Go and the website cannot use it.

1. `cd apps/mobile && npx eas build --profile development --platform android` (or `preview` for an installable APK), install it on a phone with Health Connect (built into Android 14+, a Play Store app on 9–13).
2. Open Tracking → watch icon → *Connect & sync*, grant permissions, then turn on saving and record a short run.
3. Check the data in Health Connect → Data and access.

The manifest (checked with `npx expo config --type introspect`) declares the 13 health permissions and the permission-rationale entry points added by the `react-native-health-connect` plugin. Before publishing on Google Play: fill in the Health apps declaration form, link a privacy policy that covers health data (the rationale screen currently just opens the app — add a privacy policy page), and justify each permission. Google reviews apps that request health permissions.

## Run photos

Completed runs can be composed over a new camera photo, a gallery photo, or the built-in typographic background. Both light and dark overlays include the CRW+ logo, date and actual workout metrics. The route silhouette is opt-in. Save and Share render a 1080 × 1350 PNG; the browser downloads when file sharing is unavailable. Export requires the selected image to finish loading.

## Validation

- `npm run test:tracking`: known-distance and unit checks, GPS filtering, pause/gap handling, split interpolation, and import deduplication.
- `npm run test:tracking:ui`: run the API and Expo web server first. Uses an isolated browser with a stubbed account and real browser geolocation callbacks; exercises navigation, distance accumulation, pause/resume, save/reload/delete, native-only health availability, gallery composition, route/overlay controls and PNG downloads.
- `npm run typecheck -w @crw/mobile` and `npm run build -w @crw/mobile`.
- From `apps/mobile`, `npx expo export --platform ios --platform android --output-dir dist/native-check` validates both native JavaScript bundles. This does not compile or validate the native binaries.

Native background recording and health imports require a rebuilt development or production app, not Expo Go. Native plugin configuration includes HealthKit, Health Connect read permissions, background location, photo saving and Android minimum SDK 26. EAS development configuration and expo-dev-client are present.

Before device release, build signed iOS/Android binaries and validate: precise/background permission denial and revocation; a 20-minute locked-screen run; pause/resume and GPS loss; app termination/recovery; account changes; partial health permissions and no data; Apple Watch and Android companion-app imports including duplicate refresh; physical camera, photo-library saving and native share sheets. Complete the health permission rationale/privacy-policy entry points and store health/background-location declarations as part of native release review. These device and store checks have not been performed in this Windows workspace.
