import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { patch, request } from '../api';
import { mergeRuns, Run } from './model';
import { updateJournal } from './store';
import { workoutCalories } from './activities';
import { exportBody, exportRepSessions, exportRun, importHealth } from './health';
import type { RepSession } from './healthConnectMapping';

// One place that moves data between CRW+ and the phone's health app.

export const healthAppName = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
/** Writing workouts is available in the Android app (Health Connect). */
export const canWriteHealth = Platform.OS === 'android';

const autoSaveKey = (owner: string) => `crw.health.autosave.${owner}`;
const repsCursorKey = (owner: string) => `crw.health.reps-since.${owner}`;

export async function getAutoSave(owner: string) {
  return canWriteHealth && (await AsyncStorage.getItem(autoSaveKey(owner))) === '1';
}
export async function setAutoSave(owner: string, on: boolean) {
  await AsyncStorage.setItem(autoSaveKey(owner), on ? '1' : '0');
}

type Account = { weight_kg?: number | null; height_cm?: number | null } | undefined;

/** Writes one finished CRW+ run and remembers that it was written. */
export async function saveRunToHealth(owner: string, run: Run, weightKg?: number | null) {
  const withCalories = { ...run, calories: run.calories ?? workoutCalories(run, weightKg) };
  const id = await exportRun(withCalories, weightKg);
  if (!id) throw new Error(`Allow CRW+ to write workouts in ${healthAppName} first.`);
  return updateJournal(owner, (j) => ({
    ...j,
    runs: j.runs.map((r) =>
      r.id === run.id ? { ...r, calories: withCalories.calories, healthConnectId: id } : r,
    ),
  }));
}

async function exportNewRepSessions(owner: string, weightKg?: number | null) {
  const since = (await AsyncStorage.getItem(repsCursorKey(owner))) || undefined;
  const q = since ? `?since=${encodeURIComponent(since)}` : '';
  const { sessions } = await request<{ sessions: RepSession[] }>(`/reps/sessions${q}`);
  const written = await exportRepSessions(sessions, weightKg);
  if (written && sessions.length)
    await AsyncStorage.setItem(repsCursorKey(owner), sessions[sessions.length - 1].performedAt);
  return written;
}

export type SyncResult = {
  imported: number;
  exportedRuns: number;
  exportedReps: number;
  bodyFilled: string[];
  /** Why saving to the health app failed, if it did. Reading still succeeded. */
  saveError?: string;
};

/**
 * Full sync: read today's totals and recent workouts, fill missing weight/height on the
 * account (or share the account's with the health app), and when saving is on, write
 * CRW+ runs and solo rep sessions that are not there yet.
 */
export async function syncHealth(
  owner: string,
  account: Account,
  signedIn: boolean,
  refreshAccount?: () => Promise<unknown>,
): Promise<SyncResult> {
  const result = await importHealth();
  const journal = await updateJournal(owner, (j) => ({
    ...j,
    health: result.health,
    runs: mergeRuns(j.runs, result.runs),
  }));
  const out: SyncResult = {
    imported: result.runs.length,
    exportedRuns: 0,
    exportedReps: 0,
    bodyFilled: [],
  };

  // Body details: the health app fills gaps in CRW+, and CRW+ fills gaps in the health app.
  const body = result.body || {};
  if (signedIn && account) {
    const fill: Record<string, number> = {};
    if (!account.weight_kg && body.weightKg) fill.weightKg = body.weightKg;
    if (!account.height_cm && body.heightCm) fill.heightCm = body.heightCm;
    if (Object.keys(fill).length) {
      await patch('/account', fill);
      out.bodyFilled = Object.keys(fill).map((k) => (k === 'weightKg' ? 'weight' : 'height'));
      await refreshAccount?.();
    }
    if (canWriteHealth) {
      const share = {
        weightKg: !body.weightKg && account.weight_kg ? account.weight_kg : undefined,
        heightCm: !body.heightCm && account.height_cm ? account.height_cm : undefined,
      };
      if (share.weightKg || share.heightCm) await exportBody(share).catch(() => 0);
    }
  }

  if (await getAutoSave(owner)) {
    const weight = account?.weight_kg ?? body.weightKg;
    try {
      for (const run of journal.runs) {
        if (run.source !== 'CRW+ GPS' || run.healthConnectId || run.status !== 'finished') continue;
        await saveRunToHealth(owner, run, weight);
        out.exportedRuns++;
      }
      if (signedIn) out.exportedReps = await exportNewRepSessions(owner, weight);
    } catch (e: any) {
      out.saveError = e?.message || String(e);
    }
  }
  return out;
}
