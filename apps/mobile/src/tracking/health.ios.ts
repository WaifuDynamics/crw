import { Run } from './model';
import type { RepSession } from './healthConnectMapping';
import type { BodyData, HealthImport, HealthStatus } from './health';
export async function importHealth(): Promise<HealthImport> {
  let hk: typeof import('@kingstinct/react-native-healthkit');
  try {
    hk = require('@kingstinct/react-native-healthkit');
  } catch {
    throw new Error(
      'Install a CRW+ native build to connect Apple Health. Expo Go cannot access HealthKit.',
    );
  }
  if (!(await hk.isHealthDataAvailable()))
    throw new Error('Apple Health is unavailable on this device.');
  await hk.requestAuthorization({
    toRead: [
      'HKWorkoutTypeIdentifier',
      'HKQuantityTypeIdentifierStepCount',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierHeartRate',
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
    ],
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const filter = { date: { startDate: today, endDate: new Date() } };
  const [steps, calories, heart, workouts] = await Promise.all([
    hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
      filter,
      unit: 'count',
    }),
    hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], {
      filter,
      unit: 'kcal',
    }),
    hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierHeartRate', ['discreteAverage'], {
      filter,
      unit: 'count/min',
    }),
    hk.queryWorkoutSamples({
      limit: 0,
      ascending: false,
      filter: {
        workoutActivityType: hk.WorkoutActivityType.running,
        date: { startDate: new Date(Date.now() - 30 * 86400000), endDate: new Date() },
      },
    }),
  ]);
  const runs: Run[] = [];
  for (const w of workouts) {
    const stat = await w.getStatistic('HKQuantityTypeIdentifierDistanceWalkingRunning', 'm');
    const meters =
      stat?.sumQuantity?.quantity ??
      (w.totalDistance?.unit === 'm'
        ? w.totalDistance.quantity
        : w.totalDistance?.unit === 'km'
          ? w.totalDistance.quantity * 1000
          : undefined);
    if (meters === undefined || meters <= 0) continue;
    runs.push({
      id: `apple-${w.uuid}`,
      startedAt: w.startDate.getTime(),
      endedAt: w.endDate.getTime(),
      seconds: w.duration.quantity,
      meters,
      points: [],
      splits: [],
      source: 'Apple Health',
      status: 'finished',
      segment: 0,
    });
  }
  return {
    health: {
      syncedAt: Date.now(),
      steps: steps.sumQuantity?.quantity,
      calories: calories.sumQuantity?.quantity,
      heartRate: heart.averageQuantity?.quantity,
      source: 'Apple Health',
    },
    runs,
  };
}

// Writing to Apple Health is not built yet; the Android app writes to Health Connect.
export async function connectHealth(): Promise<unknown[]> {
  await importHealth();
  return [];
}
export async function healthStatus(): Promise<HealthStatus> {
  return { available: true, connected: false, canRead: true, canWrite: false };
}
export function openHealthSettings() {}
export async function exportRun(_run: Run, _weightKg?: number | null): Promise<string | null> {
  return null;
}
export async function exportRepSessions(_s: RepSession[], _weightKg?: number | null) {
  return 0;
}
export async function exportBody(_body: BodyData) {
  return 0;
}
