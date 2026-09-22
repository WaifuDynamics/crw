// Health data bridge. The real implementations live in health.android.ts (Health Connect)
// and health.ios.ts (Apple Health); this file is the browser build and the shared types.
import { Health, Run } from './model';
import type { RepSession } from './healthConnectMapping';

export type BodyData = { weightKg?: number; heightCm?: number };
export type HealthImport = { health: Health; runs: Run[]; body?: BodyData };
export type HealthStatus = {
  available: boolean;
  connected: boolean;
  canRead: boolean;
  canWrite: boolean;
};

const unavailable = () =>
  new Error(
    'Open CRW+ on iPhone or Android to connect your health data. Watch imports are not available in a browser.',
  );

export async function importHealth(): Promise<HealthImport> {
  throw unavailable();
}
export async function connectHealth(): Promise<unknown[]> {
  throw unavailable();
}
export async function healthStatus(): Promise<HealthStatus> {
  return { available: false, connected: false, canRead: false, canWrite: false };
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
