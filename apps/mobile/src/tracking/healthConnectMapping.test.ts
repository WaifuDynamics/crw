/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exerciseName,
  isOwnRecord,
  repSessionToRecords,
  runToRecords,
  sessionToRun,
  HC_EXERCISE,
} from './healthConnectMapping';
import { repCalories } from './calories';
import { isRun, workoutTitle, type Run } from './model';

const run: Run = {
  id: 'gps-1',
  startedAt: Date.parse('2031-03-04T06:00:00Z'),
  endedAt: Date.parse('2031-03-04T06:30:00Z'),
  seconds: 1700,
  meters: 5000,
  points: [0, 1, 2].map((i) => ({
    latitude: 52.23 + i * 0.001,
    longitude: 21.01,
    timestamp: Date.parse('2031-03-04T06:00:00Z') + i * 60000,
    accuracy: 6,
    segment: 0,
    elapsed: i * 60,
  })),
  source: 'CRW+ GPS',
  status: 'finished',
  segment: 0,
  splits: [],
};

test('a Health Connect session becomes a history entry with its totals', () => {
  const r = sessionToRun(
    {
      startTime: '2031-03-01T17:00:00Z',
      endTime: '2031-03-01T18:00:00Z',
      exerciseType: 83,
      metadata: { id: 'abc', dataOrigin: 'com.google.android.apps.fitness' },
    },
    { calories: 210.6, heartRate: 98.2, activeSeconds: 3300 },
  )!;
  assert.equal(r.id, 'android-abc');
  assert.equal(r.activity, 'Yoga');
  assert.equal(r.meters, 0);
  assert.equal(r.seconds, 3300);
  assert.equal(r.calories, 211);
  assert.equal(r.heartRate, 98);
  assert.equal(r.source, 'Health Connect');
  assert.equal(isRun(r), false);
  assert.match(workoutTitle(r), / yoga$/);
});

test('routes are kept only when Health Connect returned the data', () => {
  const base = {
    startTime: '2031-03-01T06:00:00Z',
    endTime: '2031-03-01T06:20:00Z',
    exerciseType: 56,
    metadata: { id: 'r1' },
  };
  const point = { time: '2031-03-01T06:01:00Z', latitude: 52, longitude: 21 };
  assert.equal(
    sessionToRun({ ...base, exerciseRoute: { type: 0, route: [point] } }, {})!.points.length,
    1,
  );
  assert.equal(
    sessionToRun({ ...base, exerciseRoute: { type: 2, route: [point] } }, {})!.points.length,
    0,
  );
  // What the library actually returns.
  assert.equal(
    sessionToRun({ ...base, exerciseRoute: { type: 'DATA', route: [point] } }, {})!.points.length,
    1,
  );
  assert.equal(
    sessionToRun({ ...base, exerciseRoute: { type: 'CONSENT_REQUIRED', route: [point] } }, {})!
      .points.length,
    0,
  );
  assert.equal(sessionToRun({ ...base, metadata: {} }, {}), null, 'no id');
  assert.equal(sessionToRun({ ...base, endTime: base.startTime }, {}), null, 'no duration');
  assert.equal(workoutTitle(sessionToRun(base, {})!), 'Morning run');
});

test('a CRW+ run is written as session, route, distance and calories', () => {
  const records = runToRecords(run, 80);
  assert.deepEqual(
    records.map((r) => r.recordType),
    ['ExerciseSession', 'Distance', 'ActiveCaloriesBurned'],
  );
  const [session, distance, kcal] = records;
  assert.equal(session.exerciseType, HC_EXERCISE.RUNNING);
  assert.equal(session.startTime, '2031-03-04T06:00:00.000Z');
  assert.equal(session.endTime, '2031-03-04T06:30:00.000Z');
  assert.deepEqual(session.exerciseRoute, { route: [] }, 'route map not written (library limit)');
  assert.equal(typeof session.notes, 'string');
  assert.deepEqual(session.metadata.device, { type: 2, manufacturer: '', model: '' });
  assert.equal(session.metadata.clientRecordId, 'crw-gps-1-session');
  assert.equal(distance.distance.value, 5000);
  // 5 km in 30 min at 80 kg: running MET (ACSM, about 10.5) x 80 kg x 0.5 h.
  assert.equal(kcal.energy.value, 419);
  const ride = runToRecords({ ...run, activity: 'Cycling' }, 80)[0];
  assert.equal(ride.exerciseType, HC_EXERCISE.BIKING);
  assert.equal(ride.title, 'CRW+ ride');
  // No GPS points or distance: no distance record, but the time still burns calories.
  assert.deepEqual(
    runToRecords({ ...run, points: [], meters: 0 }).map((r) => r.recordType),
    ['ExerciseSession', 'ActiveCaloriesBurned'],
  );
});

test('rep sessions: squats are strength training, push-ups are calisthenics', () => {
  const squats = repSessionToRecords(
    {
      id: 's1',
      exercise: 'squat',
      reps: 40,
      bestSet: 25,
      seconds: 120,
      performedAt: '2031-03-04T07:02:00Z',
    },
    70,
  );
  assert.equal(squats[0].exerciseType, HC_EXERCISE.STRENGTH_TRAINING);
  // No segments: the library would write them from the wrong field.
  assert.equal(squats[0].segments, undefined);
  assert.equal(squats[0].startTime, '2031-03-04T07:00:00.000Z');
  assert.equal(squats[0].title, 'Squats · 40 reps');
  assert.equal(squats[1].recordType, 'ActiveCaloriesBurned');
  const push = repSessionToRecords({
    id: 'p1',
    exercise: 'pushup',
    reps: 30,
    bestSet: 30,
    seconds: 60,
    performedAt: '2031-03-04T07:02:00Z',
  });
  assert.equal(push[0].exerciseType, HC_EXERCISE.CALISTHENICS);
  assert.equal(push[0].segments, undefined);
  assert.equal(push[0].title, 'Push-ups · 30 reps');
  assert.equal(push[0].metadata.clientRecordId, 'crw-reps-p1-session');
});

test('records written by CRW+ are not imported again', () => {
  assert.equal(isOwnRecord({ metadata: { dataOrigin: 'app.crwplus.fitness' } }), true);
  assert.equal(isOwnRecord({ metadata: { clientRecordId: 'crw-gps-1-session' } }), true);
  assert.equal(isOwnRecord({ metadata: { dataOrigin: 'com.samsung.health' } }), false);
});

test('calorie estimates', () => {
  assert.ok(repCalories('pushup', 30, 60, 70) >= 8);
  assert.ok(repCalories('squat', 100, 600, 90) > repCalories('squat', 100, 600, 60));
  assert.equal(exerciseName(999), 'Workout');
});
