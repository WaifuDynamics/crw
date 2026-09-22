import { Health, Run } from './model';
import {
  isOwnRecord,
  repSessionToRecords,
  runToRecords,
  sessionToRun,
  type HcSession,
  type RepSession,
} from './healthConnectMapping';
import type { BodyData, HealthImport } from './health';

type HC = typeof import('react-native-health-connect');
type Grant = { accessType: string; recordType: string };

// Everything CRW+ asks Health Connect for. People can grant any subset; each feature
// checks its own permissions and quietly skips what was not granted.
const READ = [
  'Steps',
  'ActiveCaloriesBurned',
  'HeartRate',
  'ExerciseSession',
  'Distance',
  'Weight',
  'Height',
] as const;
const WRITE = ['ExerciseSession', 'Distance', 'ActiveCaloriesBurned', 'Weight', 'Height'] as const;

function load(): HC {
  try {
    return require('react-native-health-connect');
  } catch {
    throw new Error(
      'Install a CRW+ native build to connect Health Connect. Expo Go cannot access health data.',
    );
  }
}

/** Runs one Health Connect call and names it in the error, so failures are traceable. */
async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e: any) {
    const detail = e?.message || String(e);
    console.warn(`[health-connect] ${name} failed:`, e?.code ?? '', detail);
    const error: any = new Error(`Health Connect (${name}): ${detail}`);
    error.code = e?.code;
    throw error;
  }
}

let ready: Promise<HC> | null = null;
async function client(): Promise<HC> {
  ready ??= (async () => {
    const hc = load();
    const status = await step('status', () => hc.getSdkStatus());
    if (status !== hc.SdkAvailabilityStatus.SDK_AVAILABLE)
      throw new Error(
        status === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
          ? 'Update Health Connect from the Play Store, then try again.'
          : 'Health Connect is not available on this phone. Install it from the Play Store.',
      );
    if (!(await step('initialize', () => hc.initialize())))
      throw new Error('Install or update Health Connect on this phone, then try again.');
    return hc;
  })();
  try {
    return await ready;
  } catch (e) {
    ready = null;
    throw e;
  }
}

const has = (granted: Grant[], access: 'read' | 'write', type: string) =>
  granted.some((p) => p.accessType === access && p.recordType === type);

async function granted(hc: HC): Promise<Grant[]> {
  return (await step('permissions', () => hc.getGrantedPermissions())) as Grant[];
}

/** Opens the Health Connect permission sheet for everything CRW+ can use. */
export async function connectHealth(): Promise<Grant[]> {
  const hc = await client();
  const result = (await step('request permissions', () =>
    hc.requestPermission([
      ...READ.map((recordType) => ({ accessType: 'read' as const, recordType })),
      ...WRITE.map((recordType) => ({ accessType: 'write' as const, recordType })),
      { accessType: 'write', recordType: 'ExerciseRoute' },
    ] as any),
  )) as Grant[];
  if (!result.length)
    throw new Error('No health access was granted. Choose the data you want to share with CRW+.');
  return result;
}

export async function healthStatus() {
  try {
    const hc = await client();
    const g = await granted(hc);
    return {
      available: true,
      connected: g.length > 0,
      canRead: has(g, 'read', 'ExerciseSession'),
      canWrite: has(g, 'write', 'ExerciseSession'),
    };
  } catch {
    return { available: false, connected: false, canRead: false, canWrite: false };
  }
}

export function openHealthSettings() {
  try {
    load().openHealthConnectSettings();
  } catch {
    /* no native module */
  }
}

async function latestBody(hc: HC, g: Grant[]): Promise<BodyData> {
  const filter = {
    operator: 'after' as const,
    startTime: new Date(Date.now() - 5 * 365 * 86400000).toISOString(),
  };
  const [w, h] = await Promise.all([
    has(g, 'read', 'Weight')
      ? hc.readRecords('Weight', { timeRangeFilter: filter, ascendingOrder: false, pageSize: 1 })
      : undefined,
    has(g, 'read', 'Height')
      ? hc.readRecords('Height', { timeRangeFilter: filter, ascendingOrder: false, pageSize: 1 })
      : undefined,
  ]);
  const kg = w?.records[0]?.weight?.inKilograms;
  const m = h?.records[0]?.height?.inMeters;
  return {
    weightKg: kg ? Math.round(kg * 10) / 10 : undefined,
    heightCm: m ? Math.round(m * 100) : undefined,
  };
}

/** Today's totals, the last 30 days of workouts, and the latest weight and height. */
export async function importHealth(): Promise<HealthImport> {
  const hc = await client();
  let g = await granted(hc);
  if (!has(g, 'read', 'ExerciseSession') && !has(g, 'read', 'Steps')) {
    await connectHealth();
    g = await granted(hc);
  }
  if (!g.length)
    throw new Error('No health access was granted. Choose the data you want to share with CRW+.');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRange = {
    operator: 'between' as const,
    startTime: today.toISOString(),
    endTime: new Date().toISOString(),
  };
  const [steps, calories, heart] = await step('today totals', () =>
    Promise.all([
      has(g, 'read', 'Steps')
        ? hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter: todayRange })
        : undefined,
      has(g, 'read', 'ActiveCaloriesBurned')
        ? hc.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: todayRange })
        : undefined,
      has(g, 'read', 'HeartRate')
        ? hc.aggregateRecord({ recordType: 'HeartRate', timeRangeFilter: todayRange })
        : undefined,
    ]),
  );

  const runs: Run[] = [];
  if (has(g, 'read', 'ExerciseSession')) {
    let pageToken: string | undefined;
    do {
      const page = await step('read workouts', () =>
        hc.readRecords('ExerciseSession', {
          timeRangeFilter: {
            operator: 'between',
            startTime: new Date(Date.now() - 30 * 86400000).toISOString(),
            endTime: new Date().toISOString(),
          },
          pageSize: 100,
          ...(pageToken ? { pageToken } : {}),
        }),
      );
      for (const w of page.records as unknown as HcSession[]) {
        if (isOwnRecord(w)) continue;
        const range = { operator: 'between' as const, startTime: w.startTime, endTime: w.endTime };
        const origins = w.metadata?.dataOrigin ? [w.metadata.dataOrigin] : undefined;
        const agg = <
          T extends 'Distance' | 'ExerciseSession' | 'ActiveCaloriesBurned' | 'HeartRate' | 'Steps',
        >(
          recordType: T,
          allowed: boolean,
        ) =>
          allowed
            ? hc
                .aggregateRecord({
                  recordType,
                  timeRangeFilter: range,
                  dataOriginFilter: origins,
                } as any)
                .catch(() => undefined)
            : Promise.resolve(undefined);
        const [distance, activity, kcal, bpm, count]: any[] = await Promise.all([
          agg('Distance', has(g, 'read', 'Distance')),
          agg('ExerciseSession', true),
          agg('ActiveCaloriesBurned', has(g, 'read', 'ActiveCaloriesBurned')),
          agg('HeartRate', has(g, 'read', 'HeartRate')),
          agg('Steps', has(g, 'read', 'Steps')),
        ]);
        const run = sessionToRun(w, {
          meters: distance?.DISTANCE?.inMeters,
          activeSeconds: activity?.EXERCISE_DURATION_TOTAL?.inSeconds,
          calories: kcal?.ACTIVE_CALORIES_TOTAL?.inKilocalories,
          heartRate: bpm?.BPM_AVG,
          steps: count?.COUNT_TOTAL,
        });
        if (run) runs.push(run);
      }
      pageToken = page.pageToken;
    } while (pageToken);
  }

  const health: Health = {
    syncedAt: Date.now(),
    steps: steps?.COUNT_TOTAL,
    calories: calories?.ACTIVE_CALORIES_TOTAL?.inKilocalories,
    heartRate: heart?.BPM_AVG,
    source: 'Health Connect',
  };
  return { health, runs, body: await latestBody(hc, g).catch(() => ({})) };
}

/**
 * Inserts records of mixed types. react-native-health-connect only accepts one record
 * type per insertRecords call, so records are grouped by type (at most 50 per call).
 * Returns the ids in the order of the input records.
 */
async function insertAll(hc: HC, name: string, records: any[]): Promise<(string | undefined)[]> {
  const ids: (string | undefined)[] = new Array(records.length);
  const groups = new Map<string, number[]>();
  records.forEach((r, i) => groups.set(r.recordType, [...(groups.get(r.recordType) || []), i]));
  for (const [type, indexes] of groups)
    for (let i = 0; i < indexes.length; i += 50) {
      const chunk = indexes.slice(i, i + 50);
      const result = await step(`${name}: ${type}`, () =>
        hc.insertRecords(chunk.map((k) => records[k])),
      );
      chunk.forEach((k, j) => (ids[k] = result[j]));
    }
  return ids;
}

/** Writes a finished CRW+ run (session, route, distance, calories). Returns the session id. */
export async function exportRun(run: Run, weightKg?: number | null): Promise<string | null> {
  const hc = await client();
  const g = await granted(hc);
  if (!has(g, 'write', 'ExerciseSession')) return null;
  const records = runToRecords(run, weightKg).filter(
    (r) => r.recordType === 'ExerciseSession' || has(g, 'write', r.recordType),
  );
  const ids = await insertAll(hc, 'save run', records);
  return ids[0] ?? null;
}

/** Writes solo push-up and squat sessions. Client record ids make repeats harmless. */
export async function exportRepSessions(sessions: RepSession[], weightKg?: number | null) {
  if (!sessions.length) return 0;
  const hc = await client();
  const g = await granted(hc);
  if (!has(g, 'write', 'ExerciseSession')) return 0;
  const records = sessions
    .flatMap((s) => repSessionToRecords(s, weightKg))
    .filter((r) => r.recordType === 'ExerciseSession' || has(g, 'write', r.recordType));
  await insertAll(hc, 'save rep sessions', records);
  return sessions.length;
}

/** Saves weight and height from the CRW+ profile as today's measurements. */
export async function exportBody(body: BodyData) {
  const hc = await client();
  const g = await granted(hc);
  const time = new Date().toISOString();
  const day = time.slice(0, 10);
  const records: any[] = [];
  const meta = (kind: string) => ({
    clientRecordId: `crw-${kind}-${day}`,
    clientRecordVersion: Date.now(),
    recordingMethod: 3,
    device: { type: 2, manufacturer: '', model: '' },
  });
  if (body.weightKg && has(g, 'write', 'Weight'))
    records.push({
      recordType: 'Weight',
      time,
      weight: { value: body.weightKg, unit: 'kilograms' },
      metadata: meta('weight'),
    });
  if (body.heightCm && has(g, 'write', 'Height'))
    records.push({
      recordType: 'Height',
      time,
      height: { value: body.heightCm / 100, unit: 'meters' },
      metadata: meta('height'),
    });
  if (records.length) await insertAll(hc, 'save body data', records);
  return records.length;
}
