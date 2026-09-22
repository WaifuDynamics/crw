# Releasing the apps

`.github/workflows/release-apps.yml` builds the Android and iOS apps and publishes them as a
GitHub Release with a version number.

## Cutting a release

**From GitHub:** Actions → **Release apps** → **Run workflow** → choose `patch`, `minor` or
`major` (or type an exact version such as `1.4.0` or `2.0.0-beta.1`).

The workflow then:

1. takes the newest `vX.Y.Z` tag (or `apps/mobile/package.json` when there is none) and bumps it;
2. writes the version to `apps/mobile/package.json`, commits `Release vX.Y.Z` and pushes the tag;
3. creates a draft release with generated notes;
4. builds Android (Ubuntu) and iOS (macOS) in parallel;
5. uploads the files and publishes the release. A version with a `-suffix` becomes a pre-release.

**From a terminal:** push a tag and the same builds run for it (the version in the tag wins):

```
git tag v1.2.0
git push origin v1.2.0
```

## Version numbers

The app version is `apps/mobile/package.json` → `app.config.ts` (`expo.version`). Store build
numbers are derived from it, so they always go up:

`versionCode` (Android) = `buildNumber` (iOS) = `major × 1 000 000 + minor × 1 000 + patch`
(1.4.2 → 1004002). Minor and patch must stay below 1000. A pre-release shares the build number of its final
version (2.0.0-beta.1 and 2.0.0 are both 2000000), so Google Play will not accept both; for
store builds, bump the patch instead of using pre-release suffixes.

Helpers: `node apps/mobile/scripts/release/version.mjs current | next minor | code 1.4.2`
(tested by `npm run test:release -w @crw/mobile`).

## Release files

| File | When |
| --- | --- |
| `crw-plus-X.Y.Z-android.apk` | always – install it directly on a phone |
| `crw-plus-X.Y.Z-android.aab` | when the release keystore is configured – for Google Play |
| `crw-plus-X.Y.Z-ios.ipa` | when iOS signing is configured |
| `crw-plus-X.Y.Z-ios-simulator.zip` | without iOS signing – runs in the iOS Simulator only |
| `SHA256SUMS.txt` | always |

The apps talk to production: `EXPO_PUBLIC_*` values come from the `production` profile in
`apps/mobile/eas.json` (`scripts/release/app-env.mjs`).

## Secrets

Settings → Secrets and variables → Actions → New repository secret.

### Android (strongly recommended)

Without these the APK is signed with Expo's public debug key: anyone could sign an "update",
it cannot be updated over the current phone install, and Google sign-in fails because the
SHA-1 does not match the OAuth client.

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the release keystore, base64 (`base64 -w0 crw-release.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `crw-release` |
| `ANDROID_KEY_PASSWORD` | key password |

Use the same keystore as local builds (`%USERPROFILE%\.crw\crw-release.jks`, passwords in
`android-signing.properties` next to it). Its SHA-1 is registered for the "CRW+ Android"
Google OAuth client. Keep a backup: releases signed with a different key cannot update the app.

### iOS (needs an Apple Developer account, 99 USD/year)

| Secret | Value |
| --- | --- |
| `IOS_CERTIFICATE_P12_BASE64` | Apple Distribution certificate + private key exported as .p12, base64 |
| `IOS_CERTIFICATE_PASSWORD` | the .p12 password |
| `IOS_PROVISIONING_PROFILE_BASE64` | provisioning profile for `app.crwplus.fitness` with HealthKit, base64 |
| `IOS_TEAM_ID` | 10-character Apple team ID |
| `IOS_EXPORT_METHOD` | optional: `release-testing` (ad hoc, default), `app-store-connect` or `enterprise` |

An ad hoc IPA only installs on devices listed in the profile. For TestFlight / App Store use
an App Store profile and `app-store-connect`, then upload the IPA with Transporter.

## Notes

- Tag pushes made by the workflow itself do not trigger a second run (GitHub does not start
  workflows from `GITHUB_TOKEN` pushes).
- If the default branch is protected, allow GitHub Actions to push, or release by pushing a tag.
- Local Android builds on Windows still use `apps/mobile/scripts/build-android.ps1`.
