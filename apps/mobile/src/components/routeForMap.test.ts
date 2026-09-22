import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeForMap } from './routeForMap';

const point = (i: number, segment = 1) => ({
  latitude: 52 + i / 10000,
  longitude: 21,
  timestamp: i * 1000,
  accuracy: 5,
  segment,
  elapsed: i,
});

test('short routes are kept whole', () => {
  const route = routeForMap([point(0), point(1), point(2)]);
  assert.equal(route.length, 3);
  assert.deepEqual(route[0], { lat: 52, lng: 21, segment: 1 });
});

test('long routes are thinned but keep both ends and every pause', () => {
  const points = Array.from({ length: 10000 }, (_, i) => point(i, i < 5000 ? 1 : 2));
  const route = routeForMap(points, 500);
  assert.ok(route.length <= 510, `got ${route.length}`);
  assert.equal(route[0].lat, points[0].latitude);
  assert.equal(route[route.length - 1].lat, points[9999].latitude);
  // Last point of segment 1 and first point of segment 2 survive.
  assert.ok(route.some((p) => p.lat === points[4999].latitude));
  assert.ok(route.some((p) => p.lat === points[5000].latitude && p.segment === 2));
});
