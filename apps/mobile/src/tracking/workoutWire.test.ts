import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyJournal, Run } from './model';
import { applyRemote, batches, fromWire, serverId, toWire } from './workoutWire';

const start = Date.UTC(2026, 8, 15, 7, 0, 0);
const run = (over: Partial<Run> = {}): Run => ({
  id: 'gps-1',
  startedAt: start,
  endedAt: start + 1900_000,
  seconds: 1800.4,
  meters: 5203.7,
  points: [
    {
      latitude: 52.2297123456,
      longitude: 21.0122,
      timestamp: start + 1000,
      accuracy: 4.26,
      segment: 1,
      elapsed: 1,
    },
    {
      latitude: 52.2301,
      longitude: 21.0125,
      timestamp: start + 4000,
      accuracy: 5,
      segment: 2,
      elapsed: 4.04,
    },
  ],
  source: 'CRW+ GPS',
  status: 'finished',
  segment: 2,
  splits: [341.6, 350],
  activity: 'Running',
  calories: 380.4,
  heartRate: 0,
  ...over,
});

test('a run goes to the server whole and comes back the same', () => {
  const wire = toWire(run());
  assert.equal(wire.id, 'gps-1');
  assert.equal(wire.source, 'gps');
  assert.equal(wire.seconds, 1800);
  assert.equal(wire.calories, 380);
  assert.equal(wire.heartRate, null, 'an impossible heart rate is dropped');
  assert.deepEqual(wire.splits, [342, 350]);
  assert.deepEqual(wire.route![0], [52.229712, 21.0122, 1000, 4.3, 1, 1]);

  const back = fromWire(wire);
  assert.equal(back.status, 'finished');
  assert.equal(back.source, 'CRW+ GPS');
  assert.equal(back.serverRev, 2);
  assert.equal(back.points.length, 2);
  assert.equal(back.points[1].timestamp, start + 4000);
  assert.equal(back.segment, 2);
});

test('ids the server does not accept are made safe', () => {
  assert.equal(serverId('android-abc/def ghi'), 'android-abc-def-ghi');
  assert.equal(serverId('x'.repeat(100)).length, 64);
});

test('remote changes add, update and delete local workouts', () => {
  const local = {
    ...emptyJournal(),
    runs: [run(), run({ id: 'gps-2', startedAt: start - 86400_000 })],
  };
  const updated = { ...toWire(run({ calories: 500 })), route: [] };
  const added = toWire(run({ id: 'gps-3', startedAt: start + 3600_000 }));
  const next = applyRemote(local, [
    updated,
    added,
    { ...toWire(run({ id: 'gps-2' })), deleted: true },
  ]);
  assert.deepEqual(
    next.runs.map((r) => r.id),
    ['gps-3', 'gps-1'],
  );
  const one = next.runs.find((r) => r.id === 'gps-1')!;
  assert.equal(one.calories, 500);
  assert.equal(one.points.length, 2, 'a server copy without a route keeps the local route');
});

test('uploads are split by count and by route size', () => {
  const big = (id: string) => ({
    ...toWire(run({ id })),
    route: Array.from({ length: 9000 }, () => [0, 0, 0, 0, 0, 0]),
  });
  const small = (id: string) => toWire(run({ id }));
  const groups = batches([
    big('a'),
    big('b'),
    ...Array.from({ length: 25 }, (_, i) => small(`s${i}`)),
  ]);
  assert.deepEqual(
    groups.map((g) => g.length),
    [1, 20, 6],
  );
  assert.ok(batches([]).length === 0);
});
