import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Point } from './model';
import {
  bestSplit,
  kmMarkers,
  routeDrawing,
  speedColor,
  speedProfile,
  SPEED_COLORS,
  steps,
  topSpeed,
} from './routeStats';

// A straight line north: 0.009 degrees of latitude is about 1 km.
const DEG_PER_M = 0.009 / 1000;
function route(speeds: number[], segmentAt = Infinity): Point[] {
  const out: Point[] = [];
  let lat = 52;
  let t = 0;
  speeds.forEach((v, i) => {
    out.push({
      latitude: lat,
      longitude: 21,
      timestamp: t * 1000,
      accuracy: 5,
      segment: i >= segmentAt ? 2 : 1,
      elapsed: t,
    });
    lat += v * 5 * DEG_PER_M; // 5 s between fixes
    t += 5;
  });
  return out;
}

test('distance adds up within segments and speed is smoothed', () => {
  const list = steps(route(Array(100).fill(3)));
  assert.ok(Math.abs(list[99].meters - 99 * 15) < 20, `${list[99].meters}`);
  assert.ok(Math.abs(list[50].speed - 3) < 0.1, `${list[50].speed}`);
  // A pause (new segment) adds no distance across the gap.
  const paused = steps(route(Array(10).fill(3), 5));
  assert.ok(paused[9].meters < 9 * 15);
});

test('colours run from slow blue to fast orange', () => {
  assert.equal(speedColor(0), SPEED_COLORS[0].toUpperCase());
  assert.equal(speedColor(1), SPEED_COLORS[SPEED_COLORS.length - 1].toUpperCase());
  assert.match(speedColor(0.5), /^#[0-9A-F]{6}$/);
});

test('the drawing colours fast and slow stretches differently and marks the km', () => {
  // About 1.5 km slow (2 m/s) then 1.5 km fast (5 m/s), just under 3 km in total.
  const points = route([...Array(150).fill(2), ...Array(60).fill(5)]);
  const d = routeDrawing(points);
  assert.equal(d.casings.length, 1);
  assert.ok(d.lines.length >= 2, 'at least two colours');
  const firstColor = d.lines[0].color;
  const lastColor = d.lines[d.lines.length - 1].color;
  assert.notEqual(firstColor, lastColor);
  // Lines join without gaps.
  for (let i = 1; i < d.lines.length; i++)
    assert.deepEqual(d.lines[i].points[0], d.lines[i - 1].points[d.lines[i - 1].points.length - 1]);
  const km = d.markers.filter((m) => m.kind === 'km').map((m) => m.label);
  assert.deepEqual(km, ['1', '2']);
  assert.deepEqual(
    d.markers.filter((m) => m.kind !== 'km').map((m) => m.kind),
    ['start', 'finish'],
  );
  assert.ok(d.bounds && d.bounds[0][0] === 52 && d.bounds[1][0] > 52);
});

test('long routes mark every 5 km and stay within the point budget', () => {
  const points = route(Array(3000).fill(2));
  // About 30 km: a marker every 5 km, none past the finish.
  const labels = kmMarkers(steps(points)).map((m) => Number(m.label));
  assert.deepEqual(labels.slice(0, 5), [5, 10, 15, 20, 25]);
  assert.ok(labels.every((v) => v % 5 === 0) && labels.length <= 6);
  const d = routeDrawing(points, 500);
  const drawn = d.lines.reduce((n, l) => n + l.points.length, 0);
  assert.ok(drawn <= 700, `${drawn}`);
});

test('an empty route draws nothing', () => {
  assert.deepEqual(routeDrawing([]), { casings: [], lines: [], markers: [], bounds: null });
});

test('speed profile, top speed and best split', () => {
  const points = route([...Array(100).fill(2), ...Array(100).fill(4)]);
  const profile = speedProfile(points, 40);
  assert.ok(profile.length >= 30 && profile.length <= 45, `${profile.length}`);
  assert.ok(profile[0].speed < profile[profile.length - 1].speed);
  assert.ok(Math.abs(topSpeed(points) - 4) < 0.2);
  assert.equal(bestSplit([300, 280, 310]), 1);
  assert.equal(bestSplit([]), -1);
  assert.deepEqual(speedProfile(route([1])), []);
});
