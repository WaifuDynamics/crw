# The alarm clock you switch off with push-ups

Date: 20 September 2026
Scope: a new Android module `apps/mobile/modules/crw-alarm`, a new
`apps/mobile/src/alarms/` folder, `apps/mobile/src/screens/Alarms.tsx`,
`apps/mobile/src/screens/AlarmRing.tsx`, `apps/mobile/App.tsx`,
`apps/mobile/src/screens/Profile.tsx`, `apps/mobile/src/translations.ts`.

## Goal

Set an alarm for, say, 7:00 together with a challenge — twenty push-ups or twenty squats.
When it goes off the phone rings like a real alarm clock, wakes its own screen, and shows a
full-screen challenge. The reps are counted by the camera, and only finishing them stops
the ringing. An emergency hold is there so nobody is ever trapped by a phone they cannot
silence.

## Direction

Two shapes were considered for where the ringing screen lives.

1. **React Native over the navigator.** Chosen. The alarm screen is ordinary app UI drawn
   above the whole navigator, so it inherits the CRW+ design language, the 24 locales and —
   decisively — the existing MediaPipe rep counter.
2. A native Kotlin activity with native UI. Rejected: it would mean rebuilding the camera
   counter, the brand styling and the translations a second time, in a second language, for
   one screen.

The trigger itself cannot be JavaScript. `expo-notifications` schedules *notifications*, and
a notification is not an alarm: it stays silent under Do Not Disturb, it can be swiped away,
and under Doze its timing is a suggestion. A real alarm needs `AlarmManager.setAlarmClock`,
an alarm-stream sound and a full-screen intent, so it needs a native module.

## The native module

`apps/mobile/modules/crw-alarm`, Android only, following the `modules/liquid-glass`
precedent so Expo autolinking picks it up. Because `expo prebuild --clean` deletes and
regenerates `android/`, every manifest entry lives in the module's **own**
`android/src/main/AndroidManifest.xml` and is merged at build time. Nothing is ever
hand-edited in the generated project.

Permissions declared there: `SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`,
`RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`,
`WAKE_LOCK`, `VIBRATE`.

Components:

- **`AlarmReceiver`** — a `BroadcastReceiver` woken by the alarm; starts the service and
  arms the next occurrence.
- **`AlarmService`** — a foreground service. Takes a `WAKE_LOCK`, loops the alarm sound
  through `AudioAttributes.USAGE_ALARM` so it plays through silent mode, vibrates, and posts
  a notification carrying `setFullScreenIntent` on a dedicated `alarm` channel
  (`IMPORTANCE_HIGH`).
- **`BootReceiver`** — `BOOT_COMPLETED`, `TIME_SET`, `TIMEZONE_CHANGED` and
  `MY_PACKAGE_REPLACED`; re-arms every alarm from native storage.

The alarm list is mirrored into `SharedPreferences` on the Kotlin side. This is not a
duplicate for convenience: after a reboot JavaScript does not run until somebody opens the
app, so without a native copy every alarm would silently disappear.

The JS surface:

```
schedule(alarms: NativeAlarm[]): Promise<void>
cancel(id: string): Promise<void>
snooze(minutes: number): Promise<void>
stopRinging(): Promise<void>
firingAlarmId(): Promise<string | null>
permissions(): Promise<{ exactAlarm: boolean; fullScreenIntent: boolean; notifications: boolean }>
openExactAlarmSettings(): void
openFullScreenIntentSettings(): void
openBatterySettings(): void
```

plus an `onAlarmFire` event for the case where the app is already open.

## Waking up

`setAlarmClock` fires `AlarmReceiver`, which starts `AlarmService`. The service rings and
posts the full-screen intent; the main activity is brought up with `showWhenLocked` and
`turnScreenOn`, so it appears over the lock screen and lights the display.

JavaScript learns which alarm is ringing in two ways, because both are possible: on a cold
start it calls `firingAlarmId()` during boot, and while the app is already running it
receives `onAlarmFire`.

## The ringing screen

`AlarmRing.tsx`, rendered in `App.tsx` above the navigator rather than as a stack screen.
That placement is the point: there is nowhere to navigate away to, and the hardware back
button is swallowed.

The screen shows the time, then the challenge, then a start button that mounts the counter
WebView with `embed=1&mode=solo&lock=1&exercise=<pushup|squat>`. The counter already emits a
`rep` message carrying a running `count` (`apps/reps-counter/web/app.js:504,533`), so the
screen counts those events and needs no change to the counter at all.

Three ways out:

- **Finish the reps.** At `count >= target`: `stopRinging()`, save the session, streak + 1,
  and a "Good morning" panel showing the streak.
- **Snooze**, 5 or 10 minutes, when the alarm has snooze enabled.
- **The emergency hold.** A button held for ten seconds. It fills as it is held, counts down
  in words, and taps the wrist once a second, so it is obvious the button is working and how
  much is left. It stops the alarm and **breaks the streak**, which is what keeps it an escape
  hatch rather than the easy path. It is always available: the pose model needs light, and a
  dark bedroom at 7:00 is exactly where an alarm with no way out earns one-star reviews.

While the alarm rings the time breathes — the digits swell slightly and the colon blinks, the
way a clock radio does — and both stand still when the phone asks for reduced motion. The
screen scrolls rather than splitting into three fixed blocks, because a fixed split crops the
challenge on a short screen. Text set in Barlow Condensed carries an explicit line height
throughout: without one Android crops the top and bottom off the line.

## Managing alarms

A clock icon (`alarm-outline`) joins the profile header before the people icon
(`Profile.tsx:341`). It opens `Alarms`, registered in the `screens` map in `App.tsx` — a
pushed screen, so it carries no dock, consistent with the earlier navbar fix.

An alarm with no weekdays selected is a one-shot: it rings at the next occurrence of its
time and then turns itself off.

The screen lists alarms with on/off switches. Adding and editing happen in a `MobileModal`
built the same way as `CityModal` and `LanguageModal`: time, weekday chips, exercise,
rep count, snooze toggle. State is stored in AsyncStorage under `crw.alarms.v1` and pushed
to the native module on every change.

Above the list sit permission cards, each shown only while its permission is missing:
exact alarms, full-screen intent, and battery optimisation.

## Reps and the streak

A finished challenge is saved through the existing `recordSolo` (`POST /reps/solo`) — the
same call `Reps.tsx` makes — so the reps count towards records and the ranking. That
function already swallows network failures, so an alarm finished offline still stops
ringing and still counts locally.

The streak is `{ count, lastDate, best }` in AsyncStorage under `crw.alarms.streak`.
Completing a challenge on a later date increments it; the emergency hold resets it to zero;
a gap of more than one calendar day resets it. Version 1 keeps this on the phone and sends
nothing to the server.

## What the operating system will not give us

Stated plainly, because these are limits rather than bugs:

- **Exact alarms.** On Android 12 and up the user must allow "Alarms & reminders" by hand.
  Without it the alarm can drift by minutes.
- **Full-screen intent.** On Android 14 and up this is not granted automatically to a
  fitness app. Without it the alarm still rings — sound plus a heads-up notification — but
  does not take over the lock screen; the user taps the notification instead. The feature
  degrades, it does not break.
- **Aggressive OEMs.** Xiaomi, Samsung and Huawei may kill the process anyway, which is what
  the battery card addresses.
- **iOS and the PWA.** Neither gets the feature in this round, and the clock button is
  hidden on both. A notification dressed up as an alarm would be a promise the platform
  cannot keep.

`USE_EXACT_ALARM` would be granted automatically, but Google Play reserves it for apps whose
core purpose is an alarm clock. CRW+ ships as an APK from GitHub today, so nothing blocks it
now — but the feature is not built on it.

## Tests

`apps/mobile/src/alarms/schedule.test.ts`, pure functions under the existing `tsx --test`
runner: the next occurrence for a given time and weekday set (the time already passed today,
crossing midnight, a daylight-saving change, and the empty set meaning a one-shot), snooze
arithmetic, and the
streak transitions above.

The Kotlin side is verified by hand on the device — the repo has no instrumentation harness.
The existing 24-locale parity test covers the new translation keys.

## Order of work

1. The native module and ringing, verified on the phone with a hard-coded alarm.
2. The ringing screen with the counter and the three ways out.
3. The alarms screen, the modal and the profile icon.
4. The streak, the solo-session save, the permission cards and the translations.
