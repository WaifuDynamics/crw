import AsyncStorage from '@react-native-async-storage/async-storage';
import { CrwAlarm } from '../../modules/crw-alarm';
import { NO_STREAK, normalise, type Alarm, type Streak } from './model';

// Where the alarms live between launches, and how they reach the native module.
//
// The phone keeps two copies on purpose: this one, which the app reads and writes, and
// the native module's, which survives a restart without anybody opening the app. Every
// write goes through `saveAlarms`, so the two cannot drift apart.

const ALARMS_KEY = 'crw.alarms.v1';
const STREAK_KEY = 'crw.alarms.streak';

export async function loadAlarms(): Promise<Alarm[]> {
  const raw = await AsyncStorage.getItem(ALARMS_KEY).catch(() => null);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .map((a, i) => normalise(a, `alarm-${i}`))
      .filter((a): a is Alarm => a !== null);
  } catch {
    return [];
  }
}

/** Saves the list and hands the native module the part it needs to ring. */
export async function saveAlarms(alarms: Alarm[]): Promise<void> {
  await AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(alarms)).catch(() => {});
  await syncToNative(alarms);
}

export async function syncToNative(alarms: Alarm[]): Promise<void> {
  if (!CrwAlarm.available) return;
  await Promise.resolve(
    CrwAlarm.schedule(
      alarms.map((a) => ({
        id: a.id,
        hour: a.hour,
        minute: a.minute,
        days: a.days,
        enabled: a.enabled,
      })),
    ),
  ).catch(() => {
    /* a failed arm is worth no crash; the next save tries again */
  });
}

export async function loadStreak(): Promise<Streak> {
  const raw = await AsyncStorage.getItem(STREAK_KEY).catch(() => null);
  if (!raw) return NO_STREAK;
  try {
    const s = JSON.parse(raw);
    return {
      count: Math.max(0, Math.round(Number(s?.count)) || 0),
      lastDate: typeof s?.lastDate === 'string' ? s.lastDate : null,
      best: Math.max(0, Math.round(Number(s?.best)) || 0),
    };
  } catch {
    return NO_STREAK;
  }
}

export async function saveStreak(streak: Streak): Promise<void> {
  await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(streak)).catch(() => {});
}

/** A new id that does not depend on a library. */
export const alarmId = () =>
  `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
