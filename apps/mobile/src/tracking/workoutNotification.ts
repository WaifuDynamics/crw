import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { currentPace, duration, elapsed, pace, Run } from './model';
import { activityOf, speedKmh, workoutCalories } from './activities';

// The live notification shown while a workout is recorded: time, distance and pace,
// with Pause / Resume and Finish buttons. It stays in the shade (it cannot be swiped
// away) until the workout is finished or discarded. The background location task
// refreshes it, so it keeps counting while the phone is locked.

export const WORKOUT_NOTIFICATION = 'crw-workout';
export const WORKOUT_CHANNEL = 'workout';
export const WORKOUT_ACTIONS = {
  pause: 'workout-pause',
  resume: 'workout-resume',
  finish: 'workout-finish',
} as const;

const RUNNING = 'workout-running';
const PAUSED = 'workout-paused';
const EVERY_MS = 10_000;
let lastShown = 0;
let lastKey = '';
let allowed: boolean | null = null;
// Bumped when the notification is cleared, so an update already on its way is dropped.
let generation = 0;

const EMOJI: Record<string, string> = {
  running: '🏃',
  walking: '🚶',
  hiking: '🥾',
  cycling: '🚴',
  biking: '🚴',
  yoga: '🧘',
  swimming: '🏊',
};

/** Channel and buttons. Safe to call more than once. */
export async function setupWorkoutNotifications() {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync(WORKOUT_CHANNEL, {
      name: 'Workout in progress',
      description: 'Live time, distance and pace while CRW+ records a workout.',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      enableVibrate: false,
      vibrationPattern: null,
      showBadge: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      lightColor: '#168BFF',
    });
  const finish = {
    identifier: WORKOUT_ACTIONS.finish,
    buttonTitle: '■  Finish',
    options: { opensAppToForeground: true },
  };
  await Notifications.setNotificationCategoryAsync(RUNNING, [
    {
      identifier: WORKOUT_ACTIONS.pause,
      buttonTitle: '❚❚  Pause',
      options: { opensAppToForeground: true },
    },
    finish,
  ]);
  await Notifications.setNotificationCategoryAsync(PAUSED, [
    {
      identifier: WORKOUT_ACTIONS.resume,
      buttonTitle: '▶  Resume',
      options: { opensAppToForeground: true },
    },
    finish,
  ]);
}

async function canNotify() {
  if (allowed === null) allowed = (await Notifications.getPermissionsAsync()).granted;
  return allowed;
}

/** Asks for notification permission when a workout starts, once. */
export async function askForWorkoutNotifications() {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  allowed = current.granted;
  if (!current.granted && current.canAskAgain)
    allowed = (await Notifications.requestPermissionsAsync()).granted;
  return allowed;
}

export function workoutText(run: Run, now = Date.now()) {
  const activity = run.activity || 'Running';
  const kind = activityOf(run);
  const icon = EMOJI[activity.toLowerCase()] || kind.emoji;
  const time = duration(elapsed(run, now));
  const km = (run.meters / 1000).toFixed(2);
  const live = currentPace(run, now);
  const average = pace(run.meters, elapsed(run, now));
  const shownPace = live !== '—' ? live : average;
  const paused = run.status !== 'running';
  return {
    title: paused ? `⏸ Paused · ${time}` : `${icon} ${activity} · ${time}`,
    body: [
      `${km} km`,
      kind.showSpeed
        ? speedKmh(run.meters, elapsed(run, now)) !== '—'
          ? `${speedKmh(run.meters, elapsed(run, now))} km/h`
          : null
        : shownPace !== '—'
          ? `${shownPace} /km`
          : null,
      `${Math.round(run.calories ?? workoutCalories({ ...run, seconds: elapsed(run, now) }))} kcal`,
    ]
      .filter(Boolean)
      .join('  ·  '),
    paused,
  };
}

/**
 * Shows or refreshes the workout notification. `force` skips the 10-second throttle
 * (start, pause, resume); location updates call it without.
 */
export async function showWorkoutNotification(run: Run | null | undefined, force = false) {
  if (Platform.OS === 'web' || !run || run.status === 'finished') return;
  const now = Date.now();
  const { title, body, paused } = workoutText(run, now);
  const key = `${paused}`;
  if (!force && key === lastKey && now - lastShown < EVERY_MS) return;
  const mine = generation;
  if (!(await canNotify()) || mine !== generation) return;
  lastShown = now;
  lastKey = key;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: WORKOUT_NOTIFICATION,
      content: {
        title,
        body,
        data: { link: 'tracking' },
        sticky: true,
        autoDismiss: false,
        color: '#168BFF',
        sound: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
        categoryIdentifier: paused ? PAUSED : RUNNING,
      },
      trigger: Platform.OS === 'android' ? { channelId: WORKOUT_CHANNEL } : null,
    });
  } catch {
    // A notification is a nicety; recording must never fail because of it.
  }
}

export async function clearWorkoutNotification() {
  if (Platform.OS === 'web') return;
  lastKey = '';
  generation++;
  try {
    await Notifications.dismissNotificationAsync(WORKOUT_NOTIFICATION);
  } catch {}
}
