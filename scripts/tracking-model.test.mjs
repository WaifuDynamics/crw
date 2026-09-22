import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
const source = await readFile('apps/mobile/src/tracking/model.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { distance, addPoint, elapsed, pace, duration, mergeRuns } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);
const run = () => ({
  id: 'one',
  startedAt: 1000,
  resumedAt: 1000,
  seconds: 0,
  meters: 0,
  points: [],
  source: 'CRW+ GPS',
  status: 'running',
  segment: 0,
  splits: [],
});
const point = (latitude, timestamp, extra = {}) => ({
  latitude,
  longitude: 0,
  timestamp,
  accuracy: 5,
  ...extra,
});
test('known distance and pace units', () => {
  assert.ok(Math.abs(distance(point(0), point(0.01)) - 1111.949) < 1);
  assert.equal(pace(5000, 1500), '5:00');
  assert.equal(pace(0, 1), '—');
  assert.equal(duration(3601), '1:00:01');
  assert.equal(elapsed({ ...run(), seconds: 10 }, 6000), 15);
});
test('reject poor accuracy, out-of-order data and GPS teleports', () => {
  const first = addPoint(run(), point(0, 1000));
  assert.deepEqual(addPoint(first, point(0.001, 2000, { accuracy: 80 })), first);
  assert.deepEqual(addPoint(first, point(0.001, 500)), first);
  assert.deepEqual(addPoint(first, point(1, 2000)), first);
  assert.deepEqual(addPoint(first, point(0, 2000, { accuracy: -1 })), first);
});
test('pause and GPS gaps do not join route segments or add distance', () => {
  const first = addPoint(run(), point(0, 1000));
  assert.equal(addPoint({ ...first, status: 'paused' }, point(0.01, 4000)).meters, 0);
  const resumed = addPoint({ ...first, segment: 1, resumedAt: 4000 }, point(0.01, 5000));
  assert.equal(resumed.meters, 0);
  const gap = addPoint(first, point(0.01, 40000));
  assert.equal(gap.meters, 0);
  assert.equal(gap.segment, 1);
});
test('kilometre crossing interpolates split duration', () => {
  let r = run();
  for (let i = 0; i <= 110; i++) r = addPoint(r, point(i * 0.00009, 1000 + i * 3000));
  assert.equal(r.splits.length, 1);
  assert.ok(Math.abs(r.splits[0] - 299.77) < 1);
});
test('repeat imports and overlapping watch/phone recordings deduplicate', () => {
  const original = { ...run(), status: 'finished', seconds: 1800, meters: 5000 };
  const imported = { ...original, id: 'watch', startedAt: 3000, source: 'Apple Health' };
  assert.equal(mergeRuns([original], [imported]).length, 1);
  assert.equal(mergeRuns([imported], [imported]).length, 1);
  assert.equal(mergeRuns([original], [{ ...imported, startedAt: 9999999 }]).length, 2);
});
