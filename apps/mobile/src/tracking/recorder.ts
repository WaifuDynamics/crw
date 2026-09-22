import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACTIVE_OWNER, readJournal, updateJournal } from './store';
import { addPoint, elapsed, Run } from './model';
import { ActivityId, activityById } from './activities';
import { clearWorkoutNotification, showWorkoutNotification } from './workoutNotification';
const TASK = 'pace-run-location-v1';
let foreground: { remove: () => void } | undefined;
async function receive(owner: string, locations: Location.LocationObject[]) {
  return updateJournal(owner, (journal) => {
    let active = journal.active;
    for (const loc of locations.sort((a, b) => a.timestamp - b.timestamp)) {
      if (active)
        active = addPoint(active, {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
          accuracy: loc.coords.accuracy ?? 999,
        });
    }
    return { ...journal, active };
  });
}
if (Platform.OS !== 'web')
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    TASK,
    async ({ data, error }) => {
      const owner = await AsyncStorage.getItem(ACTIVE_OWNER);
      if (!owner) return;
      if (error) {
        const journal = await updateJournal(owner, (j) => ({
          ...j,
          active: j.active
            ? { ...j.active, seconds: elapsed(j.active), status: 'paused', resumedAt: undefined }
            : null,
        }));
        await showWorkoutNotification(journal.active, true);
        return;
      }
      if (data) {
        const journal = await receive(owner, data.locations);
        // Keeps the live notification counting while the phone is locked.
        await showWorkoutNotification(journal.active);
      }
    },
  );
export async function stopLocation() {
  foreground?.remove();
  foreground = undefined;
  if (Platform.OS !== 'web' && (await Location.hasStartedLocationUpdatesAsync(TASK)))
    await Location.stopLocationUpdatesAsync(TASK);
  await AsyncStorage.removeItem(ACTIVE_OWNER);
}
export async function suspendRecording() {
  const owner = await AsyncStorage.getItem(ACTIVE_OWNER);
  if (!owner && !foreground) return;
  if (owner)
    await updateJournal(owner, (j) => ({
      ...j,
      active:
        j.active?.status === 'running'
          ? { ...j.active, status: 'paused', seconds: elapsed(j.active), resumedAt: undefined }
          : j.active,
    }));
  await stopLocation();
  // Signing out: the paused workout belongs to that account, so its notification goes too.
  await clearWorkoutNotification();
}
export async function recoverRecording(owner: string) {
  const journal = await readJournal(owner);
  if (journal.active?.status !== 'running') return;
  const recording =
    Platform.OS === 'web' ? !!foreground : await Location.hasStartedLocationUpdatesAsync(TASK);
  if (recording) return;
  await updateJournal(owner, (j) => {
    if (!j.active || j.active.status !== 'running') return j;
    const last = j.active.points[j.active.points.length - 1];
    return {
      ...j,
      active: {
        ...j.active,
        status: 'paused',
        seconds: Math.max(j.active.seconds, last?.elapsed ?? 0),
        resumedAt: undefined,
      },
    };
  });
}
/**
 * Asks for everything recording needs (location, background location, services on).
 * Called before the start countdown, so no system dialog interrupts it.
 */
export async function ensureLocationReady() {
  if (!(await Location.requestForegroundPermissionsAsync()).granted)
    throw new Error('Allow precise location to record your route and distance.');
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error('Turn on location services to start your run.');
  if (Platform.OS !== 'web') {
    if (!(await TaskManager.isAvailableAsync()))
      throw new Error('Background recording requires the installed CRW+ app.');
    if (!(await Location.requestBackgroundPermissionsAsync()).granted)
      throw new Error('Allow background location so your run continues when your phone locks.');
  }
}
export async function startLocation(owner: string) {
  await ensureLocationReady();
  await suspendRecording();
  await AsyncStorage.setItem(ACTIVE_OWNER, owner);
  try {
    if (Platform.OS === 'web') foreground = watchBrowser(owner);
    else
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 3,
        timeInterval: 1000,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        // Android requires this service notification; the live one with time, distance
        // and buttons comes from ./workoutNotification.
        foregroundService: {
          notificationTitle: 'CRW+ is recording your route',
          notificationBody: 'GPS stays on while the screen is locked.',
          notificationColor: '#168BFF',
        },
      });
  } catch (e) {
    await stopLocation();
    throw e;
  }
}
// expo-location's web watchPositionAsync never delivers updates (it replaces its own
// subscriber id with the browser's watch id) and never clears the browser watch, so the
// web recorder talks to the Geolocation API directly.
function watchBrowser(owner: string) {
  const id = navigator.geolocation.watchPosition(
    (position) => {
      const { coords, timestamp } = position;
      void receive(owner, [
        {
          coords: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            altitude: coords.altitude,
            accuracy: coords.accuracy,
            altitudeAccuracy: coords.altitudeAccuracy,
            heading: coords.heading,
            speed: coords.speed,
          },
          timestamp,
        },
      ]).catch(() => {
        foreground?.remove();
        foreground = undefined;
        void recoverRecording(owner).catch(() => {});
      });
    },
    (error) => {
      // Weak signal and timeouts recover on their own; only a revoked permission stops the run.
      if (error.code === error.PERMISSION_DENIED) void suspendRecording().catch(() => {});
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
  );
  return { remove: () => navigator.geolocation.clearWatch(id) };
}
export const newRun = (activity: ActivityId = 'running'): Run => ({
  id: `gps-${Date.now()}`,
  activity: activityById(activity).name,
  exerciseType: activityById(activity).healthConnectType,
  startedAt: Date.now(),
  seconds: 0,
  meters: 0,
  points: [],
  source: 'CRW+ GPS',
  status: 'paused',
  segment: 0,
  splits: [],
});
