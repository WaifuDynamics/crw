import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITIES,
  activityOf,
  metFor,
  MORE_ACTIVITIES,
  PRIMARY_ACTIVITIES,
  speedKmh,
  workoutCalories,
} from './activities';
import { addPoint, Run, workoutTitle } from './model';

const hour = 3600;

test('calories follow the activity and the speed', () => {
  // 10 km in an hour: ACSM running cost is about 10.5 MET.
  assert.equal(workoutCalories({ activity: 'Running', meters: 10_000, seconds: hour }, 70), 737);
  assert.equal(workoutCalories({ activity: 'Running', meters: 10_000, seconds: hour }, 60), 631);
  // The same hour walking 5 km costs far less.
  const walk = workoutCalories({ activity: 'Walking', meters: 5_000, seconds: hour }, 70);
  assert.ok(walk > 200 && walk < 300, `walk ${walk}`);
  // Hiking at the same speed costs more than walking.
  assert.ok(workoutCalories({ activity: 'Hiking', meters: 5_000, seconds: hour }, 70) > walk);
  // Cycling uses the Compendium speed bands.
  assert.equal(workoutCalories({ activity: 'Cycling', meters: 20_000, seconds: hour }, 70), 560);
  assert.equal(workoutCalories({ activity: 'Cycling', meters: 32_000, seconds: hour }, 70), 1106);
  // No weight: 70 kg. No time: nothing.
  assert.equal(workoutCalories({ activity: 'Cycling', meters: 20_000, seconds: hour }), 560);
  assert.equal(workoutCalories({ activity: 'Running', meters: 0, seconds: 0 }, 70), 0);
});

test('a slow "run" is priced as walking, and walking never drops under 2 MET', () => {
  assert.equal(metFor('running', 1.2), metFor('walking', 1.2));
  assert.equal(metFor('walking', 0), 2);
});

test('activities are recognised from stored names, old runs are runs', () => {
  assert.equal(activityOf({}).id, 'running');
  assert.equal(activityOf({ activity: 'Cycling' }).id, 'cycling');
  assert.equal(activityOf({ activity: 'Biking' }).id, 'cycling');
  assert.equal(activityOf({ activity: 'Hiking' }).id, 'hiking');
  assert.equal(activityOf({ activity: 'walking' }).id, 'walking');
  assert.equal(speedKmh(20_000, hour), '20.0');
  const morning = new Date(2026, 8, 17, 8).getTime();
  assert.equal(workoutTitle({ startedAt: morning, activity: 'Cycling' }), 'Morning ride');
  assert.equal(workoutTitle({ startedAt: morning }), 'Morning run');
  assert.equal(workoutTitle({ startedAt: morning, activity: 'Yoga' }), 'Morning yoga');
});

test('GPS jumps are judged by the activity: a bike may go 15 m/s, a walker may not', () => {
  const base = (activity: string): Run => ({
    id: 'x',
    startedAt: 0,
    seconds: 0,
    meters: 0,
    points: [],
    source: 'CRW+ GPS',
    status: 'running',
    resumedAt: 0,
    segment: 1,
    splits: [],
    activity,
  });
  const fix = (t: number, lat: number) => ({
    latitude: lat,
    longitude: 21,
    timestamp: t,
    accuracy: 5,
  });
  // 15 m/s: 0.000135 degrees of latitude per second.
  const move = (activity: string) =>
    addPoint(addPoint(base(activity), fix(1000, 52)), fix(2000, 52.000135)).meters;
  assert.ok(move('Cycling') > 14, 'bike keeps the fix');
  assert.equal(move('Walking'), 0, 'walker drops it');
});

test('a workout that covers no ground is timed, and priced by its own effort', () => {
  // An hour of yoga at 3 MET, whatever the GPS says: 3 x 70 kg x 1 h.
  assert.equal(workoutCalories({ activity: 'Yoga', meters: 0, seconds: hour }, 70), 210);
  // Stray GPS drift during an indoor workout cannot inflate it.
  assert.equal(workoutCalories({ activity: 'Yoga', meters: 4_000, seconds: hour }, 70), 210);
  // The harder ones cost more: an hour of martial arts beats an hour of stretching.
  const martial = workoutCalories({ activity: 'Martial arts', meters: 0, seconds: hour }, 70);
  const stretch = workoutCalories({ activity: 'Stretching', meters: 0, seconds: hour }, 70);
  assert.ok(martial > 700 && stretch < 200, `${martial} / ${stretch}`);
  // Half an hour is half the calories.
  assert.equal(workoutCalories({ activity: 'Pool swim', meters: 0, seconds: hour / 2 }, 70), 291);
});

test('the long list is complete, named and typed', () => {
  assert.equal(PRIMARY_ACTIVITIES.length, 4, 'four on the start screen');
  assert.ok(MORE_ACTIVITIES.length >= 40, `${MORE_ACTIVITIES.length} behind More`);
  // Every activity is found by its own name, has an icon and a Health Connect type.
  for (const a of ACTIVITIES) {
    assert.equal(activityOf({ activity: a.name }).id, a.id, a.name);
    assert.ok(a.icon && a.emoji, a.id);
    assert.ok(a.healthConnectType >= 0, a.id);
    // Anything that does not measure ground needs a fixed cost instead.
    if (!a.tracksDistance) assert.ok((a.met ?? 0) > 0, `${a.id} has no MET`);
  }
  // Ids are unique.
  assert.equal(new Set(ACTIVITIES.map((a) => a.id)).size, ACTIVITIES.length);
});
