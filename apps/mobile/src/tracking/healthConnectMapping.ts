// Translation between Health Connect records and CRW+ workouts. Plain data only, no
// native module, so it can be unit tested away from a phone.
import type { Run } from './model';
import { repCalories } from './calories';
import { activityOf, workoutCalories } from './activities';

/** The Android package of CRW+; records with this origin were written by us. */
export const CRW_PACKAGE = 'app.crwplus.fitness';

// Values of Health Connect's ExerciseSessionRecord.EXERCISE_TYPE_* and
// ExerciseSegment.EXERCISE_SEGMENT_TYPE_* that CRW+ uses.
export const HC_EXERCISE = {
  OTHER_WORKOUT: 0,
  BIKING: 8,
  CALISTHENICS: 13,
  HIKING: 37,
  RUNNING: 56,
  RUNNING_TREADMILL: 57,
  STRENGTH_TRAINING: 70,
  WALKING: 79,
} as const;
export const HC_SEGMENT = { SQUAT: 51 } as const;

const NAMES: Record<number, string> = {
  0: 'Workout',
  2: 'Badminton',
  4: 'Baseball',
  5: 'Basketball',
  8: 'Cycling',
  9: 'Indoor cycling',
  10: 'Bootcamp',
  11: 'Boxing',
  13: 'Calisthenics',
  14: 'Cricket',
  16: 'Dancing',
  25: 'Elliptical',
  26: 'Exercise class',
  27: 'Fencing',
  28: 'American football',
  29: 'Australian football',
  31: 'Frisbee',
  32: 'Golf',
  33: 'Guided breathing',
  34: 'Gymnastics',
  35: 'Handball',
  36: 'HIIT',
  37: 'Hiking',
  38: 'Ice hockey',
  39: 'Ice skating',
  44: 'Martial arts',
  46: 'Paddling',
  47: 'Paragliding',
  48: 'Pilates',
  50: 'Racquetball',
  51: 'Rock climbing',
  52: 'Roller hockey',
  53: 'Rowing',
  54: 'Rowing machine',
  55: 'Rugby',
  56: 'Running',
  57: 'Treadmill run',
  58: 'Sailing',
  59: 'Scuba diving',
  60: 'Skating',
  61: 'Skiing',
  62: 'Snowboarding',
  63: 'Snowshoeing',
  64: 'Football',
  65: 'Softball',
  66: 'Squash',
  68: 'Stair climbing',
  69: 'Stair machine',
  70: 'Strength training',
  71: 'Stretching',
  72: 'Surfing',
  73: 'Open water swim',
  74: 'Pool swim',
  75: 'Table tennis',
  76: 'Tennis',
  78: 'Volleyball',
  79: 'Walking',
  80: 'Water polo',
  81: 'Weightlifting',
  82: 'Wheelchair',
  83: 'Yoga',
};

export const exerciseName = (type: number) => NAMES[type] || 'Workout';

export type HcSession = {
  startTime: string;
  endTime: string;
  exerciseType: number;
  title?: string;
  metadata?: { id?: string; dataOrigin?: string; clientRecordId?: string };
  exerciseRoute?: {
    // The library reports "DATA" / "NO_DATA" / "CONSENT_REQUIRED" (typed as a number).
    type?: number | string;
    route: {
      time: string;
      latitude: number;
      longitude: number;
      horizontalAccuracy?: { inMeters?: number };
    }[];
  };
};

export type SessionTotals = {
  meters?: number;
  activeSeconds?: number;
  calories?: number;
  heartRate?: number;
  steps?: number;
};

/** A Health Connect exercise session as a CRW+ history entry. */
export function sessionToRun(s: HcSession, t: SessionTotals): Run | null {
  const id = s.metadata?.id;
  const start = Date.parse(s.startTime);
  const end = Date.parse(s.endTime);
  if (!id || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const route =
    s.exerciseRoute?.type === 'DATA' ||
    s.exerciseRoute?.type === 0 ||
    s.exerciseRoute?.type === undefined
      ? s.exerciseRoute?.route || []
      : [];
  const points = route
    .map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: Date.parse(p.time),
      accuracy: p.horizontalAccuracy?.inMeters ?? 10,
      segment: 0,
      elapsed: (Date.parse(p.time) - start) / 1000,
    }))
    .filter((p) => Number.isFinite(p.timestamp));
  const round = (v?: number) => (v == null || !Number.isFinite(v) ? undefined : Math.round(v));
  return {
    id: `android-${id}`,
    startedAt: start,
    endedAt: end,
    seconds: t.activeSeconds ?? (end - start) / 1000,
    meters: t.meters ?? 0,
    points,
    splits: [],
    source: 'Health Connect',
    status: 'finished',
    segment: 0,
    activity: s.title?.trim() || exerciseName(s.exerciseType),
    exerciseType: s.exerciseType,
    calories: round(t.calories),
    heartRate: round(t.heartRate),
    steps: round(t.steps),
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

// react-native-health-connect 4.1 reads every optional field with getString/getMap, so
// written records spell them all out instead of leaving keys missing.
const PHONE = { type: 2, manufacturer: '', model: '' };

/** The Health Connect records for a finished CRW+ GPS run. */
export function runToRecords(run: Run, weightKg?: number | null) {
  const start = run.startedAt;
  const end = run.endedAt ?? start + Math.max(1, run.seconds) * 1000;
  const metadata = (suffix: string) => ({
    clientRecordId: `crw-${run.id}-${suffix}`,
    clientRecordVersion: 1,
    recordingMethod: 1, // actively recorded
    device: PHONE,
  });
  const session: any = {
    recordType: 'ExerciseSession',
    startTime: iso(start),
    endTime: iso(end),
    exerciseType: activityOf(run).healthConnectType,
    title: `CRW+ ${activityOf(run).noun}`,
    notes: `Recorded with CRW+. ${(run.meters / 1000).toFixed(2)} km.`,
    // The GPS route is not written: the library throws for route points without an
    // altitude, which the phone recorder does not store.
    exerciseRoute: { route: [] },
    metadata: metadata('session'),
  };
  const records: any[] = [session];
  if (run.meters > 0)
    records.push({
      recordType: 'Distance',
      startTime: iso(start),
      endTime: iso(end),
      distance: { value: Math.round(run.meters), unit: 'meters' },
      metadata: metadata('distance'),
    });
  const kcal = run.calories ?? workoutCalories(run, weightKg);
  if (kcal > 0)
    records.push({
      recordType: 'ActiveCaloriesBurned',
      startTime: iso(start),
      endTime: iso(end),
      energy: { value: kcal, unit: 'kilocalories' },
      metadata: metadata('calories'),
    });
  return records;
}

export type RepSession = {
  id: string;
  exercise: 'pushup' | 'squat';
  reps: number;
  bestSet: number;
  seconds: number;
  performedAt: string;
};

/** The Health Connect records for a solo push-up or squat session from the camera counter. */
export function repSessionToRecords(s: RepSession, weightKg?: number | null) {
  const end = Date.parse(s.performedAt);
  const start = end - Math.max(1, s.seconds) * 1000;
  const squat = s.exercise === 'squat';
  const metadata = (suffix: string) => ({
    clientRecordId: `crw-reps-${s.id}-${suffix}`,
    clientRecordVersion: 1,
    recordingMethod: 1,
    device: PHONE,
  });
  const session: any = {
    recordType: 'ExerciseSession',
    startTime: iso(start),
    endTime: iso(end),
    // Health Connect has a squat segment but no push-up one, so push-ups are calisthenics
    // with the count in the title and notes.
    exerciseType: squat ? HC_EXERCISE.STRENGTH_TRAINING : HC_EXERCISE.CALISTHENICS,
    title: `${squat ? 'Squats' : 'Push-ups'} · ${s.reps} reps`,
    notes: `CRW+ camera counter. ${s.reps} reps, best set ${s.bestSet}.`,
    exerciseRoute: { route: [] },
    metadata: metadata('session'),
  };
  // Squat segments are not written: react-native-health-connect 4.1 reads segments from
  // the wrong field when writing. The count is in the title and notes instead.
  return [
    session,
    {
      recordType: 'ActiveCaloriesBurned',
      startTime: iso(start),
      endTime: iso(end),
      energy: { value: repCalories(s.exercise, s.reps, s.seconds, weightKg), unit: 'kilocalories' },
      metadata: metadata('calories'),
    },
  ];
}

/** True for records CRW+ wrote itself, which must not come back as imports. */
export const isOwnRecord = (s: Pick<HcSession, 'metadata'>) =>
  s.metadata?.dataOrigin === CRW_PACKAGE || !!s.metadata?.clientRecordId?.startsWith('crw-');
