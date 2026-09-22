import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  breakStreak,
  completeStreak,
  currentStreak,
  dayKey,
  isoDay,
  newAlarm,
  nextOccurrence,
  normalise,
  NO_STREAK,
  ringsIn,
} from './model';
import type { Alarm } from './model';

const at = (hour: number, minute: number, days: number[]): Alarm => ({
  ...newAlarm('a'),
  hour,
  minute,
  days,
});

test('Monday is 1 and Sunday is 7', () => {
  assert.equal(isoDay(new Date(2026, 8, 21)), 1, '21 September 2026 is a Monday');
  assert.equal(isoDay(new Date(2026, 8, 20)), 7, 'and the day before it is a Sunday');
});

test('an alarm later today rings today', () => {
  const now = new Date(2026, 8, 21, 6, 0); // Monday
  const next = nextOccurrence(at(7, 0, [1]), now);
  assert.equal(next?.getDate(), 21);
  assert.equal(next?.getHours(), 7);
});

test('an alarm whose time has passed waits for the next chosen day', () => {
  const now = new Date(2026, 8, 21, 8, 0); // Monday, after 7:00
  const next = nextOccurrence(at(7, 0, [1, 3]), now);
  assert.equal(next?.getDate(), 23, 'Wednesday, not this morning again');
});

test('the same minute does not count as still to come', () => {
  const now = new Date(2026, 8, 21, 7, 0, 0, 0);
  const next = nextOccurrence(at(7, 0, [1]), now);
  assert.equal(next?.getDate(), 28, 'a week later, not this instant');
});

test('a weekday alarm crosses the weekend', () => {
  const now = new Date(2026, 8, 25, 9, 0); // Friday morning, after it rang
  const next = nextOccurrence(at(7, 0, [1, 2, 3, 4, 5]), now);
  assert.equal(next?.getDate(), 28, 'Monday');
  assert.equal(isoDay(next!), 1);
});

test('no days chosen means it rings once, at the next chance', () => {
  const evening = new Date(2026, 8, 21, 23, 0);
  const next = nextOccurrence(at(7, 0, []), evening);
  assert.equal(next?.getDate(), 22, 'tomorrow morning');

  const morning = new Date(2026, 8, 21, 5, 0);
  assert.equal(nextOccurrence(at(7, 0, []), morning)?.getDate(), 21, 'still today');
});

test('a disabled alarm never rings', () => {
  const alarm = { ...at(7, 0, [1]), enabled: false };
  assert.equal(nextOccurrence(alarm, new Date(2026, 8, 21, 6, 0)), null);
});

test('the hour survives a daylight-saving change', () => {
  // Europe/Warsaw goes back an hour in the small hours of Sunday 25 October 2026.
  const before = new Date(2026, 9, 24, 12, 0); // Saturday
  const next = nextOccurrence(at(7, 0, [7]), before);
  assert.equal(next?.getHours(), 7, 'still 7:00 on the Sunday, not 6:00 or 8:00');
  assert.equal(next?.getDate(), 25);
});

test('the countdown splits into hours and minutes', () => {
  const now = new Date(2026, 8, 21, 22, 40);
  const next = nextOccurrence(at(7, 0, [1, 2]), now)!;
  assert.deepEqual(ringsIn(next, now), { hours: 8, minutes: 20 });
});

test('stored rubbish is trimmed back into an alarm', () => {
  const alarm = normalise(
    { hour: 99, minute: -4, days: [0, 3, 3, 12], reps: 5000, exercise: 'nonsense' },
    'fallback',
  );
  assert.equal(alarm?.id, 'fallback');
  assert.equal(alarm?.hour, 23);
  assert.equal(alarm?.minute, 0);
  assert.deepEqual(alarm?.days, [3], 'only real weekdays, and no duplicates');
  assert.equal(alarm?.reps, 100);
  assert.equal(alarm?.exercise, 'pushup');
  assert.equal(normalise(null, 'x'), null);
});

test('a day key is the local calendar day', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

test('the streak counts consecutive mornings', () => {
  let streak = completeStreak(NO_STREAK, '2026-09-21');
  assert.equal(streak.count, 1);
  streak = completeStreak(streak, '2026-09-22');
  assert.equal(streak.count, 2);
  assert.equal(streak.best, 2);
});

test('a second challenge on the same morning changes nothing', () => {
  const first = completeStreak(NO_STREAK, '2026-09-21');
  assert.deepEqual(completeStreak(first, '2026-09-21'), first);
});

test('a missed day starts the streak over but keeps the record', () => {
  let streak = completeStreak(NO_STREAK, '2026-09-21');
  streak = completeStreak(streak, '2026-09-22');
  streak = completeStreak(streak, '2026-09-25');
  assert.equal(streak.count, 1, 'two days were missed');
  assert.equal(streak.best, 2, 'the best run is still on the board');
});

test('the emergency hold breaks the streak and keeps the record', () => {
  let streak = completeStreak(NO_STREAK, '2026-09-21');
  streak = completeStreak(streak, '2026-09-22');
  const broken = breakStreak(streak);
  assert.equal(broken.count, 0);
  assert.equal(broken.best, 2);
  assert.equal(completeStreak(broken, '2026-09-23').count, 1, 'and it starts again at one');
});

test('a streak goes stale once a day has been missed', () => {
  const streak = completeStreak(NO_STREAK, '2026-09-21');
  assert.equal(currentStreak(streak, '2026-09-21'), 1, 'today');
  assert.equal(currentStreak(streak, '2026-09-22'), 1, 'still alive the next morning');
  assert.equal(currentStreak(streak, '2026-09-23'), 0, 'gone once a day was skipped');
});

test('an alarm saved before the QR challenge existed keeps working', () => {
  const old = normalise(
    { id: 'a', hour: 7, minute: 0, days: [1], enabled: true, exercise: 'squat', reps: 12 },
    'x',
  );
  assert.equal(old?.challenge, 'squat', 'the old exercise becomes the challenge');
  assert.equal(old?.exercise, 'squat');
  assert.equal(old?.reps, 12);
  assert.equal(old?.code, undefined, 'and it is given no code it does not need');
});

test('a QR alarm always ends up with a code', () => {
  const missing = normalise({ id: 'a', challenge: 'qr' }, 'x');
  assert.equal(missing?.challenge, 'qr');
  assert.ok(missing?.code, 'one without a code could never be switched off as intended');

  const kept = normalise({ id: 'a', challenge: 'qr', code: 'K7M29QX4PB3D' }, 'x');
  assert.equal(kept?.code, 'K7M29QX4PB3D', 'an existing code is left alone');
});

test('a challenge the app does not know falls back to the exercise', () => {
  const odd = normalise({ id: 'a', challenge: 'cartwheels', exercise: 'squat' }, 'x');
  assert.equal(odd?.challenge, 'squat');
});
