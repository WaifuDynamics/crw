# Switching the alarm off with a printed QR code

Date: 21 September 2026
Scope: `apps/mobile/src/alarms/model.ts`, a new `apps/mobile/src/alarms/qr.ts`, a new
`apps/mobile/src/components/AlarmQrCard.tsx`, `apps/mobile/src/screens/Alarms.tsx` split into
a list screen and a new `apps/mobile/src/screens/AlarmSheet.tsx`,
`apps/mobile/src/screens/AlarmRing.tsx`, `apps/mobile/src/translations.ts`.

Builds on [2026-09-20-alarm-challenge-design.md](./2026-09-20-alarm-challenge-design.md).

## Goal

A third way to switch the alarm off: scan a QR code that lives on paper, somewhere you have
to walk to. You save the code as a picture, print it or leave it on a second screen, and pin
it to the fridge in another room. In the morning the phone will not go quiet until its camera
sees that exact code, which means you are out of bed and across the flat before you decide
whether to go back to sleep.

The same round restyles the alarm list to match the sheet, and widens the challenge chooser
so three options fit honestly.

## Nothing new has to be installed

Every piece already ships in the app, which is why this is wiring rather than building:

- `react-native-qrcode-svg` draws ticket QR codes in `Event.tsx`.
- `expo-camera`'s `CameraView` with `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}` scans
  tickets in `Organizer.tsx`.
- `exportPhoto(ref, share)` in `src/tracking/exportPhoto.ts` already captures a view at
  1080×1350 and either saves it to Photos or opens the share sheet.

## The challenge becomes a type

`Alarm.exercise` stops carrying the decision and a new field makes it:

```ts
challenge: 'pushup' | 'squat' | 'qr'
code?: string        // only for 'qr'
```

`exercise` stays, because the rep counter and `recordSolo` both need a real exercise and
neither can accept `'qr'`. Alarms already on phones have `exercise` and no `challenge`, so
`normalise()` migrates them: `challenge = exercise` when `challenge` is missing. A `qr` alarm
that somehow arrives without a code is given one rather than being left unusable.

## The code

One code per alarm, generated when the QR challenge is first chosen. Two alarms can therefore
send you to two different rooms, which is the point of the feature; the cost is one printed
sheet per alarm, which the instructions say plainly.

The QR encodes `crw-alarm:<code>` where the code is a short random string. The scheme prefix
is what stops a stray QR in the kitchen — a parcel label, a food packet, a bus ticket — from
silencing the alarm by accident. A scan matches only when the payload is exactly the alarm's
own.

## Instructions, before the choice is made

Tapping the QR option opens an explanation **before** the challenge is selected, because
choosing it without a printed code would leave a morning with no way out but the emergency
hold. It covers what happens, the three steps (save the picture, print it or keep it on a
second screen, hang it somewhere you have to walk to), the warning that the code has to be
reachable in the morning, and the reminder that the emergency hold still works. It closes on
either "Save the code" or "Use this challenge".

## What lands in Photos

Not a bare QR code. A card built to be pinned up: the CRW+ wordmark, the code, the alarm time
and one line of instruction, captured through the existing `exportPhoto` at 1080×1350. A
share button sits next to the save button, for sending it straight to a printer.

The card can be reopened from the alarm at any time, so a lost sheet is reprinted rather than
being a reason to rebuild the alarm.

## The ringing screen

When `challenge === 'qr'` the counting phase is a `CameraView` scanner instead of the rep
counter's WebView — the same shape as the ticket scanner in `Organizer.tsx`. A matching
payload stops the alarm and adds the day to the streak. Nothing is written to `/reps/sessions`,
because no reps were done.

The emergency hold is unchanged and still breaks the streak, and it matters more here: a code
can be thrown away, left in another flat, or simply too dark to read.

## The list, and the chooser

The alarm list moves onto the same clay as the sheet and the Tracking page: each alarm a
`Slab` with the time in Display, the days and the challenge as `ClayTag`s, and a
`ClayIconButton` for on and off. The streak and permission cards become slabs, and adding an
alarm becomes a `ClayButton`.

The challenge chooser stops being a row of side-by-side chips. Three options across a phone
would be cramped, and the QR option needs a sentence to explain itself, so they become
full-width stacked rows: icon, name, and a line of description each.

## Splitting the file

`Alarms.tsx` is 691 lines and holds the time wheel, the editing sheet, the permission cards
and the list at once. This round would push it past 900, so it splits along the seam that is
already there: `Alarms.tsx` keeps the list, `AlarmSheet.tsx` takes editing one alarm,
`alarms/qr.ts` owns the code and the matching, and `components/AlarmQrCard.tsx` owns the
printable card.

## Tests

Pure functions under the existing `tsx --test` runner, in `apps/mobile/src/alarms/qr.test.ts`:

- a generated code has the expected shape, and two codes in a row differ;
- `qrPayload(code)` round-trips through `matchesCode(payload, code)`;
- a payload without the `crw-alarm:` prefix never matches, including a bare code;
- another alarm's code never matches;
- surrounding whitespace is tolerated and case is not.

And in `schedule.test.ts`, extending what is there: `normalise()` migrates an old alarm with
`exercise` and no `challenge`, and gives a `qr` alarm without a code one.

The camera, the capture and the save are verified by hand on the phone; the repo has no
harness that can drive them.

## Order of work

1. The model, the code and the matching, with their tests.
2. The file split, so the rest lands in files that are the right size.
3. The chooser, the instructions and the printable card.
4. The scanner branch in the ringing screen.
5. The list restyle and the translations.
