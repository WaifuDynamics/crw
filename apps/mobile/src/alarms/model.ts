import type { Exercise } from '../reps';
import { newCode } from './qr';

// The alarm list, and the arithmetic around it that has no side effects: when an alarm
// rings next, and what finishing or skipping a challenge does to the streak.
//
// The scheduling itself belongs to the native module, which keeps its own copy of this
// list - after a restart JavaScript does not run until somebody opens the app. What is
// here is for showing the user "rings in 8 h" and for deciding what to store. If the two
// ever disagree, the native side is the one that wakes anybody up.

/**
 * How the alarm is switched off. `exercise` stays a real exercise alongside this, because
 * the rep counter and recordSolo both need one and neither can accept 'qr'.
 */
export type Challenge = Exercise | 'qr';

export type Alarm = {
  id: string;
  hour: number;
  minute: number;
  /** ISO weekdays, Monday is 1. Empty means it rings once and switches itself off. */
  days: number[];
  enabled: boolean;
  challenge: Challenge;
  /** Which exercise the counter runs. Ignored while the challenge is 'qr'. */
  exercise: Exercise;
  /** How many reps switch the alarm off. Ignored while the challenge is 'qr'. */
  reps: number;
  /** The printed code that switches this alarm off. Only set for the 'qr' challenge. */
  code?: string;
  snooze: boolean;
};

export const MIN_REPS = 1;
export const MAX_REPS = 100;
export const SNOOZE_MINUTES = [5, 10] as const;
/** How long the emergency button has to be held before it gives in. */
export const EMERGENCY_HOLD_MS = 10_000;

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function newAlarm(id: string): Alarm {
  return {
    id,
    hour: 7,
    minute: 0,
    days: [1, 2, 3, 4, 5],
    enabled: true,
    challenge: 'pushup',
    exercise: 'pushup',
    reps: 10,
    snooze: true,
  };
}

/** Trims whatever came out of storage back into something the rest of the app can trust. */
export function normalise(raw: any, fallbackId: string): Alarm | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : fallbackId;
  const days: number[] = Array.isArray(raw.days)
    ? [...new Set<number>(raw.days.map(Number).filter((d: number) => d >= 1 && d <= 7))].sort(
        (a, b) => a - b,
      )
    : [];
  const exercise: Exercise = raw.exercise === 'squat' ? 'squat' : 'pushup';
  // Alarms saved before the QR challenge existed carry only `exercise`.
  const challenge: Challenge =
    raw.challenge === 'qr' || raw.challenge === 'squat' || raw.challenge === 'pushup'
      ? raw.challenge
      : exercise;
  const stored = typeof raw.code === 'string' ? raw.code.trim() : '';
  return {
    id,
    hour: clamp(Math.round(Number(raw.hour)) || 0, 0, 23),
    minute: clamp(Math.round(Number(raw.minute)) || 0, 0, 59),
    days,
    enabled: raw.enabled !== false,
    challenge,
    exercise,
    reps: clamp(Math.round(Number(raw.reps)) || 10, MIN_REPS, MAX_REPS),
    // A QR alarm with no code could never be switched off the intended way, so it is
    // given one rather than left broken.
    ...(challenge === 'qr' ? { code: stored || newCode() } : {}),
    snooze: raw.snooze !== false,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Monday is 1 and Sunday is 7, where JavaScript counts Sunday as 0. */
export function isoDay(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/**
 * When this alarm rings next after `from`, or null when it never will.
 *
 * Walks forward a day at a time and sets the wall-clock hour on each one, rather than
 * adding milliseconds, so 7:00 stays 7:00 across a daylight-saving change instead of
 * sliding to 6:00 or 8:00.
 */
export function nextOccurrence(alarm: Alarm, from: Date = new Date()): Date | null {
  if (!alarm.enabled) return null;
  for (let add = 0; add <= 7; add++) {
    const at = new Date(from.getFullYear(), from.getMonth(), from.getDate() + add);
    at.setHours(alarm.hour, alarm.minute, 0, 0);
    if (at.getTime() <= from.getTime()) continue;
    if (alarm.days.length === 0) return at;
    if (alarm.days.includes(isoDay(at))) return at;
  }
  return null;
}

/** "in 8 h 20 min", for the line under an alarm in the list. */
export function ringsIn(at: Date, from: Date = new Date()) {
  const minutes = Math.max(0, Math.round((at.getTime() - from.getTime()) / 60_000));
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

// --- the streak ------------------------------------------------------------

export type Streak = { count: number; lastDate: string | null; best: number };

export const NO_STREAK: Streak = { count: 0, lastDate: null, best: 0 };

/** A calendar day as YYYY-MM-DD in the phone's own time zone. */
export function dayKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysBetween(from: string, to: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** A finished challenge. A second one on the same day changes nothing. */
export function completeStreak(streak: Streak, today: string = dayKey()): Streak {
  if (streak.lastDate === today) return streak;
  const gap = streak.lastDate ? daysBetween(streak.lastDate, today) : null;
  const count = gap === 1 ? streak.count + 1 : 1;
  return { count, lastDate: today, best: Math.max(streak.best, count) };
}

/** The emergency hold. Keeping the record of the best run, losing the current one. */
export function breakStreak(streak: Streak): Streak {
  return { count: 0, lastDate: null, best: streak.best };
}

/** A streak goes stale on its own once a day has been missed. */
export function currentStreak(streak: Streak, today: string = dayKey()): number {
  if (!streak.lastDate) return 0;
  const gap = daysBetween(streak.lastDate, today);
  return gap <= 1 ? streak.count : 0;
}
