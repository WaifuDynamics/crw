import { distance, Point } from './model';

// What a recorded route says beyond distance and time: how fast each stretch was, where
// the kilometres fall, the speed profile over the distance, and the drawing both maps
// (web and phone) render. Pure functions, so they can be tested with plain Node.

export type LatLng = [number, number];
export type RouteLine = { color: string; points: LatLng[] };
export type RouteMarker = {
  lat: number;
  lng: number;
  kind: 'start' | 'finish' | 'km';
  label?: string;
};
export type RouteDrawing = {
  /** Dark outline under the coloured line, one per recorded segment (pauses split them). */
  casings: LatLng[][];
  /** The route itself, cut where the speed colour changes. */
  lines: RouteLine[];
  markers: RouteMarker[];
  /** [[south, west], [north, east]], or null for an empty route. */
  bounds: [LatLng, LatLng] | null;
};

/** Slow to fast. */
export const SPEED_COLORS = ['#3D6BFF', '#168BFF', '#22C3C3', '#A9F06A', '#FFD18B', '#FF7A3D'];
const LEVELS = 10;

type Step = { point: Point; meters: number; speed: number };

/** Cumulative distance and a smoothed speed (m/s) at every point. */
export function steps(points: Point[], windowSeconds = 20): Step[] {
  const out: Step[] = [];
  let meters = 0;
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev && prev.segment === p.segment) meters += distance(prev, p);
    out.push({ point: p, meters, speed: 0 });
  });
  // Speed over a window of about 20 s around each point smooths GPS jitter.
  let from = 0;
  for (let i = 0; i < out.length; i++) {
    const t = out[i].point.timestamp;
    while (
      from < i &&
      (t - out[from].point.timestamp > windowSeconds * 1000 ||
        out[from].point.segment !== out[i].point.segment)
    )
      from++;
    const dt = (t - out[from].point.timestamp) / 1000;
    out[i].speed = dt > 0 ? (out[i].meters - out[from].meters) / dt : 0;
  }
  for (let i = 0; i < out.length - 1; i++)
    if (out[i].speed === 0 && out[i + 1].point.segment === out[i].point.segment)
      out[i].speed = out[i + 1].speed;
  return out;
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  ];
};

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16),
    pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[16, 8, 0]
    .map((s) => ch(s).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** Colour of a relative speed (0 = slowest stretch, 1 = fastest). */
export function speedColor(level: number) {
  const x = Math.min(1, Math.max(0, level)) * (SPEED_COLORS.length - 1);
  const i = Math.min(SPEED_COLORS.length - 2, Math.floor(x));
  return mix(SPEED_COLORS[i], SPEED_COLORS[i + 1], x - i);
}

/** Where the route passes each km (or every 5 km on long routes). */
export function kmMarkers(list: Step[]): RouteMarker[] {
  const total = list.length ? list[list.length - 1].meters : 0;
  const every = total > 25_000 ? 5000 : 1000;
  const out: RouteMarker[] = [];
  let next = every;
  for (let i = 1; i < list.length && next < total; i++) {
    const a = list[i - 1],
      b = list[i];
    while (b.meters >= next && next < total) {
      const f = b.meters > a.meters ? (next - a.meters) / (b.meters - a.meters) : 0;
      out.push({
        lat: a.point.latitude + (b.point.latitude - a.point.latitude) * f,
        lng: a.point.longitude + (b.point.longitude - a.point.longitude) * f,
        kind: 'km',
        label: String(next / 1000),
      });
      next += every;
    }
  }
  return out;
}

/** The map drawing of a finished route: speed-coloured line, km, start and finish. */
export function routeDrawing(points: Point[], maxPoints = 2500): RouteDrawing {
  if (!points.length) return { casings: [], lines: [], markers: [], bounds: null };
  const list = steps(points);
  const moving = list.map((s) => s.speed).filter((v) => v > 0.2);
  const slow = percentile(moving, 10),
    fast = percentile(moving, 90);
  const level = (v: number) =>
    fast > slow ? Math.round(((v - slow) / (fast - slow)) * LEVELS) / LEVELS : 0.5;

  // Thin long routes, keeping segment ends and every colour change.
  const step = Math.max(1, Math.ceil(list.length / maxPoints));
  const casings: LatLng[][] = [];
  const lines: RouteLine[] = [];
  let casing: LatLng[] = [];
  let line: RouteLine | null = null;
  list.forEach((s, i) => {
    const at: LatLng = [s.point.latitude, s.point.longitude];
    const newSegment = i === 0 || s.point.segment !== list[i - 1].point.segment;
    const last = i === list.length - 1 || list[i + 1].point.segment !== s.point.segment;
    const color = speedColor(level(s.speed));
    if (newSegment) {
      if (casing.length > 1) casings.push(casing);
      casing = [];
      line = null;
    }
    const changed = line && line.color !== color;
    if (!newSegment && !last && !changed && i % step !== 0) return;
    casing.push(at);
    if (!line || changed) {
      // The new colour starts where the old one ended, so the line has no gaps.
      const start = line ? line.points[line.points.length - 1] : at;
      line = { color, points: line ? [start, at] : [at] };
      lines.push(line);
    } else line.points.push(at);
  });
  if (casing.length > 1) casings.push(casing);

  let south = 90,
    west = 180,
    north = -90,
    east = -180;
  for (const p of points) {
    south = Math.min(south, p.latitude);
    north = Math.max(north, p.latitude);
    west = Math.min(west, p.longitude);
    east = Math.max(east, p.longitude);
  }
  const first = points[0],
    end = points[points.length - 1];
  return {
    casings,
    lines: lines.filter((l) => l.points.length > 1),
    markers: [
      ...kmMarkers(list),
      { lat: first.latitude, lng: first.longitude, kind: 'start' },
      { lat: end.latitude, lng: end.longitude, kind: 'finish' },
    ],
    bounds: [
      [south, west],
      [north, east],
    ],
  };
}

export type ProfilePoint = { km: number; speed: number };

/** Smoothed speed (m/s) over the distance, about `samples` points long, for the chart. */
export function speedProfile(points: Point[], samples = 80): ProfilePoint[] {
  const list = steps(points, 30);
  const total = list.length ? list[list.length - 1].meters : 0;
  if (total < 50) return [];
  const every = total / samples;
  const out: ProfilePoint[] = [];
  let next = 0;
  for (const s of list) {
    if (s.meters < next) continue;
    if (s.speed > 0) out.push({ km: s.meters / 1000, speed: s.speed });
    next = s.meters + every;
  }
  return out;
}

/** Highest smoothed speed (m/s); short spikes are already averaged away. */
export function topSpeed(points: Point[]) {
  return steps(points, 30).reduce((m, s) => Math.max(m, s.speed), 0);
}

/** Index of the fastest full kilometre, or -1. */
export const bestSplit = (splits: number[]) =>
  splits.length ? splits.indexOf(Math.min(...splits)) : -1;
