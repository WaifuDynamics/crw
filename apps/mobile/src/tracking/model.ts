import { activityOf } from './activities';
export type Point = {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
  segment: number;
  elapsed: number;
};
export type Run = {
  id: string;
  startedAt: number;
  endedAt?: number;
  seconds: number;
  meters: number;
  points: Point[];
  source: 'CRW+ GPS' | 'Apple Health' | 'Health Connect';
  status: 'running' | 'paused' | 'finished';
  resumedAt?: number;
  segment: number;
  splits: number[];
  /** What kind of workout, e.g. "Running" or "Yoga". Missing on older runs, which are runs. */
  activity?: string;
  /** Health Connect exercise type number, when the workout came from or went to Health Connect. */
  exerciseType?: number;
  calories?: number;
  heartRate?: number;
  steps?: number;
  /** Set once this CRW+ workout has been written to Health Connect. */
  healthConnectId?: string;
  /** Set once the server has this workout for the km leaderboard. */
  uploaded?: boolean;
  /** 2 once the server has the whole workout (route, splits, health data). */
  serverRev?: number;
};

/** "Morning run", "Evening ride", "Afternoon yoga" ... */
export function workoutTitle(run: Pick<Run, 'startedAt' | 'activity'>) {
  const h = new Date(run.startedAt).getHours();
  const part = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  // CRW+ activities have a short noun; imported ones (yoga, tennis...) keep their name.
  const known = !run.activity || /run|walk|hik|cycl|bik|ride/i.test(run.activity);
  return `${part} ${known ? activityOf(run).noun : run.activity!.toLowerCase()}`;
}
export const isRun = (run: Pick<Run, 'activity'>) =>
  !run.activity || /run|treadmill|walk|hik/i.test(run.activity);
export type Health = {
  syncedAt: number;
  steps?: number;
  calories?: number;
  heartRate?: number;
  source: string;
};
export type Journal = { runs: Run[]; active: Run | null; health: Health | null };
export const emptyJournal = (): Journal => ({ runs: [], active: null, health: null });
export function distance(
  a: Pick<Point, 'latitude' | 'longitude'>,
  b: Pick<Point, 'latitude' | 'longitude'>,
) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export const elapsed = (run: Run, now = Date.now()) =>
  run.seconds +
  (run.status === 'running' && run.resumedAt ? Math.max(0, now - run.resumedAt) / 1000 : 0);
export function addPoint(run: Run, point: Omit<Point, 'segment' | 'elapsed'>): Run {
  if (
    run.status !== 'running' ||
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180 ||
    !Number.isFinite(point.timestamp) ||
    !Number.isFinite(point.accuracy) ||
    point.accuracy < 0 ||
    point.accuracy > 35 ||
    point.timestamp < (run.resumedAt || run.startedAt)
  )
    return run;
  const last = run.points[run.points.length - 1];
  if (last && point.timestamp <= last.timestamp) return run;
  const gap = last ? (point.timestamp - last.timestamp) / 1000 : 0;
  const delta = last && last.segment === run.segment && gap <= 30 ? distance(last, point) : 0;
  // Jumps faster than the activity allows are GPS noise (a bike is allowed more than a walk).
  if (last && delta && (delta / gap > activityOf(run).maxSpeed || delta < 2)) return run;
  const segment = last && gap > 30 ? run.segment + 1 : run.segment;
  const next = { ...point, segment, elapsed: elapsed(run, point.timestamp) };
  const meters = run.meters + delta;
  const splits = [...run.splits];
  if (delta && Math.floor(meters / 1000) > Math.floor(run.meters / 1000)) {
    const fraction = ((splits.length + 1) * 1000 - run.meters) / delta;
    const crossing = last.elapsed + (next.elapsed - last.elapsed) * fraction;
    splits.push(crossing - splits.reduce((a, b) => a + b, 0));
  }
  return { ...run, meters, points: [...run.points, next], segment, splits };
}
export function duration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export const pace = (meters: number, seconds: number) =>
  meters >= 20 && seconds > 0 ? duration(seconds / (meters / 1000)) : '—';
export function currentPace(run: Run, now = Date.now()) {
  if (run.status !== 'running') return '—';
  const points = run.points.filter((p) => p.segment === run.segment && now - p.timestamp < 20000);
  if (points.length < 2 || now - points[points.length - 1].timestamp > 10000) return '—';
  const meters = points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
  return pace(meters, (points[points.length - 1].timestamp - points[0].timestamp) / 1000);
}
export function mergeRuns(existing: Run[], imported: Run[]) {
  const result = [...existing];
  for (const run of imported) {
    const exact = result.findIndex((r) => r.id === run.id);
    if (exact >= 0) {
      result[exact] = run;
      continue;
    }
    const duplicate = result.some(
      (r) =>
        Math.abs(r.startedAt - run.startedAt) < 120000 &&
        Math.abs(r.seconds - run.seconds) < Math.max(120, r.seconds * 0.1),
    );
    if (!duplicate) result.push(run);
  }
  return result.sort((a, b) => b.startedAt - a.startedAt);
}
