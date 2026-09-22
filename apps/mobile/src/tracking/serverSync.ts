import AsyncStorage from '@react-native-async-storage/async-storage';
import { request } from '../api';
import { Run } from './model';
import { applyRemote, batches, REV, serverId, toWire, WireWorkout } from './workoutWire';
import { readJournal, updateJournal } from './store';

// Keeps the phone's workout history and the account on the server in step.
//
// Push: every finished workout goes up whole (route, splits, calories, heart rate, steps).
// Pull: changes made on the account's other devices come down, deletions included.
// Delete: removing a workout sends a delete, queued while offline, so it goes everywhere.
// Health: today's totals from the health app are stored per day.
//
// A run with serverRev 2 is on the server in full. Older builds only sent a summary
// (the `uploaded` flag), so those runs are sent again with everything.

const cursorKey = (owner: string) => `crw.sync.cursor.${owner}`;
const deletesKey = (owner: string) => `crw.sync.deletes.${owner}`;

const ready = (r: Run) =>
  r.status === 'finished' &&
  r.serverRev !== REV &&
  r.seconds >= 1 &&
  // The server rejects averages over 100 km/h; such a run would fail its whole batch.
  r.meters / r.seconds <= 28 &&
  r.startedAt >= Date.UTC(2020, 0, 1) &&
  r.startedAt <= Date.now() + 3600_000;

async function pendingDeletes(owner: string): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(deletesKey(owner))) || '[]');
  } catch {
    return [];
  }
}

async function pushDeletes(owner: string) {
  const left: string[] = [];
  for (const id of await pendingDeletes(owner)) {
    try {
      await request(`/workouts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      left.push(id);
    }
  }
  await AsyncStorage.setItem(deletesKey(owner), JSON.stringify(left));
}

async function pushWorkouts(owner: string) {
  const pending = (await readJournal(owner)).runs.filter(ready);
  let changed = 0;
  for (const batch of batches(pending.map(toWire))) {
    const res = await request<{ recorded: number; ids: string[]; deleted: string[] }>('/workouts', {
      method: 'POST',
      body: JSON.stringify({ workouts: batch }),
    });
    const saved = new Set(res.ids);
    const gone = new Set(res.deleted);
    await updateJournal(owner, (j) => ({
      ...j,
      runs: j.runs
        // Deleted on another device while this one was offline.
        .filter((r) => !gone.has(serverId(r.id)))
        .map((r) => (saved.has(serverId(r.id)) ? { ...r, uploaded: true, serverRev: REV } : r)),
    }));
    changed += res.recorded + gone.size;
  }
  return changed;
}

async function pullWorkouts(owner: string) {
  let since = (await AsyncStorage.getItem(cursorKey(owner))) || '';
  let changed = 0;
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ routes: '1', limit: '25' });
    if (since) q.set('since', since);
    const res = await request<{ workouts: WireWorkout[]; cursor: string | null; more: boolean }>(
      `/workouts?${q}`,
    );
    if (res.workouts.length) {
      await updateJournal(owner, (j) => applyRemote(j, res.workouts));
      changed += res.workouts.length;
    }
    if (res.cursor) {
      since = res.cursor;
      await AsyncStorage.setItem(cursorKey(owner), since);
    }
    if (!res.more) break;
  }
  return changed;
}

async function pushHealth(owner: string) {
  const health = (await readJournal(owner)).health;
  if (!health) return;
  const d = new Date(health.syncedAt);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await request('/health/days', {
    method: 'PUT',
    body: JSON.stringify({
      days: [
        {
          day,
          steps: health.steps != null ? Math.round(health.steps) : null,
          calories: health.calories ?? null,
          heartRate:
            health.heartRate != null && health.heartRate >= 20 && health.heartRate <= 250
              ? health.heartRate
              : null,
          source: health.source.slice(0, 40),
          syncedAt: Math.round(health.syncedAt),
        },
      ],
    }),
  });
}

let running: Promise<number> | null = null;

/**
 * Two-way sync of the signed-in account's workouts. Returns how many local workouts
 * changed, so the caller knows whether to redraw. Guests stay local.
 */
export function syncWorkouts(owner: string): Promise<number> {
  if (owner === 'guest') return Promise.resolve(0);
  running ??= (async () => {
    try {
      await pushDeletes(owner);
      let changed = await pushWorkouts(owner);
      changed += await pullWorkouts(owner);
      await pushHealth(owner).catch(() => {});
      return changed;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Removes a workout on this phone now and on the account (queued if offline). */
export async function deleteWorkout(owner: string, runId: string) {
  const journal = await updateJournal(owner, (j) => ({
    ...j,
    runs: j.runs.filter((r) => r.id !== runId),
  }));
  if (owner !== 'guest') {
    const queue = await pendingDeletes(owner);
    await AsyncStorage.setItem(
      deletesKey(owner),
      JSON.stringify([...new Set([...queue, serverId(runId)])]),
    );
    void pushDeletes(owner).catch(() => {});
  }
  return journal;
}
