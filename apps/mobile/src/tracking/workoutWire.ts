import { Journal, Point, Run } from './model';

// The workout format of the CRW+ API (apps/api/src/routes/workouts.ts) and how it maps to
// the app's Run. Kept free of React Native so it can be tested with plain Node.

export const REV = 2;
const MAX_BATCH = 20;
const MAX_POINTS_PER_BATCH = 15_000;

export const serverId = (id: string) => id.replace(/[^A-Za-z0-9_.:-]/g, '-').slice(0, 64);

export type WireWorkout = {
  id: string;
  activity: string;
  meters: number;
  seconds: number;
  startedAt: number;
  endedAt?: number | null;
  source: 'gps' | 'health';
  calories?: number | null;
  heartRate?: number | null;
  steps?: number | null;
  splits?: number[];
  exerciseType?: number | null;
  healthConnectId?: string | null;
  route?: number[][] | null;
  deleted?: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function toWire(r: Run): WireWorkout {
  return {
    id: serverId(r.id),
    activity: (r.activity || 'Running').slice(0, 40),
    meters: clamp(r.meters, 0, 1_000_000),
    seconds: clamp(Math.round(r.seconds), 1, 604_800),
    startedAt: Math.round(r.startedAt),
    endedAt: r.endedAt ? Math.round(r.endedAt) : null,
    source: r.source === 'CRW+ GPS' ? 'gps' : 'health',
    calories: r.calories != null ? clamp(Math.round(r.calories), 0, 20_000) : null,
    heartRate:
      r.heartRate != null && r.heartRate >= 20 && r.heartRate <= 250
        ? Math.round(r.heartRate)
        : null,
    steps: r.steps != null ? clamp(Math.round(r.steps), 0, 500_000) : null,
    splits: r.splits.slice(0, 1000).map((s) => clamp(Math.round(s), 0, 86_400)),
    exerciseType: r.exerciseType ?? null,
    healthConnectId: r.healthConnectId ?? null,
    route: r.points
      .slice(0, 20_000)
      .map((p) => [
        Math.round(p.latitude * 1e6) / 1e6,
        Math.round(p.longitude * 1e6) / 1e6,
        clamp(Math.round(p.timestamp - r.startedAt), 0, 8 * 86400_000),
        clamp(Math.round(p.accuracy * 10) / 10, 0, 1000),
        clamp(p.segment, 0, 10_000),
        clamp(Math.round(p.elapsed * 10) / 10, 0, 8 * 86400),
      ]),
  };
}

export function fromWire(w: WireWorkout): Run {
  const points: Point[] = (w.route || []).map(([lat, lng, t, accuracy, segment, elapsed]) => ({
    latitude: lat,
    longitude: lng,
    timestamp: w.startedAt + t,
    accuracy,
    segment,
    elapsed,
  }));
  return {
    id: w.id,
    startedAt: w.startedAt,
    endedAt: w.endedAt ?? undefined,
    seconds: w.seconds,
    meters: w.meters,
    points,
    source: w.source === 'gps' ? 'CRW+ GPS' : 'Health Connect',
    status: 'finished',
    segment: points.length ? points[points.length - 1].segment : 0,
    splits: w.splits || [],
    activity: w.activity,
    exerciseType: w.exerciseType ?? undefined,
    calories: w.calories ?? undefined,
    heartRate: w.heartRate ?? undefined,
    steps: w.steps ?? undefined,
    healthConnectId: w.healthConnectId ?? undefined,
    uploaded: true,
    serverRev: REV,
  };
}

/** Applies downloaded changes to the local history. Pure, for tests. */
export function applyRemote(journal: Journal, remote: WireWorkout[]): Journal {
  let runs = [...journal.runs];
  for (const w of remote) {
    const at = runs.findIndex((r) => serverId(r.id) === w.id);
    if (w.deleted) {
      if (at >= 0) runs.splice(at, 1);
      continue;
    }
    const run = fromWire(w);
    if (at >= 0) {
      // Keep the local route when the server copy came without one.
      const local = runs[at];
      runs[at] = { ...run, id: local.id, points: run.points.length ? run.points : local.points };
    } else runs.push(run);
  }
  runs = runs.sort((a, b) => b.startedAt - a.startedAt);
  return { ...journal, runs };
}

/** Splits workouts into requests that stay well under the server's limits. */
export function batches(workouts: WireWorkout[]) {
  const out: WireWorkout[][] = [];
  let current: WireWorkout[] = [];
  let points = 0;
  for (const w of workouts) {
    const n = w.route?.length ?? 0;
    if (current.length && (current.length >= MAX_BATCH || points + n > MAX_POINTS_PER_BATCH)) {
      out.push(current);
      current = [];
      points = 0;
    }
    current.push(w);
    points += n;
  }
  if (current.length) out.push(current);
  return out;
}
