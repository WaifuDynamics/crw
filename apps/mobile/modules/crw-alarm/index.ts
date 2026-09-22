import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// The Android side of the alarm clock (modules/crw-alarm/android). Everywhere else this
// module is absent: iOS gives no way to take over the screen at a set time, and a browser
// gives no way to ring at all. `available` is false there and the app hides the feature
// rather than promising an alarm it cannot deliver.

export type NativeAlarm = {
  id: string;
  hour: number;
  minute: number;
  /** ISO weekdays, Monday is 1. Empty means it rings once and switches itself off. */
  days: number[];
  enabled: boolean;
};

export type AlarmPermissions = {
  /** Android 12+: rings at the minute asked for instead of whenever Doze allows. */
  exactAlarm: boolean;
  /** Android 14+: takes over the lock screen instead of only showing a notification. */
  fullScreenIntent: boolean;
  notifications: boolean;
};

type NativeModule = {
  schedule(json: string): Promise<number>;
  cancel(id: string): Promise<void>;
  nextTrigger(): Promise<number | null>;
  snooze(minutes: number): Promise<number | null>;
  stopRinging(): Promise<void>;
  firingAlarmId(): Promise<string | null>;
  permissions(): Promise<AlarmPermissions>;
  openExactAlarmSettings(): void;
  openFullScreenIntentSettings(): void;
  openBatterySettings(): void;
  showWhenLocked(enabled: boolean): void;
  addListener(event: 'onAlarmFire', listener: (e: { id: string }) => void): { remove(): void };
};

// requireOptionalNativeModule returns null instead of throwing, which is exactly the
// case here: an older build of the app has no such module in it.
const nativeModule =
  Platform.OS === 'android'
    ? (requireOptionalNativeModule('CrwAlarm') as NativeModule | null)
    : null;

/** Whether this phone can actually ring. */
export const available: boolean = !!nativeModule;

const noPermissions: AlarmPermissions = {
  exactAlarm: false,
  fullScreenIntent: false,
  notifications: false,
};

export const CrwAlarm = {
  available,
  /** Replaces the whole list. Sending everything keeps the native copy from drifting. */
  schedule: (alarms: NativeAlarm[]) => nativeModule?.schedule(JSON.stringify(alarms)) ?? null,
  cancel: (id: string) => nativeModule?.cancel(id) ?? null,
  nextTrigger: () => nativeModule?.nextTrigger() ?? Promise.resolve(null),
  snooze: (minutes: number) => nativeModule?.snooze(minutes) ?? Promise.resolve(null),
  stopRinging: () => nativeModule?.stopRinging() ?? Promise.resolve(),
  firingAlarmId: () => nativeModule?.firingAlarmId() ?? Promise.resolve(null),
  permissions: () => nativeModule?.permissions() ?? Promise.resolve(noPermissions),
  openExactAlarmSettings: () => nativeModule?.openExactAlarmSettings(),
  openFullScreenIntentSettings: () => nativeModule?.openFullScreenIntentSettings(),
  openBatterySettings: () => nativeModule?.openBatterySettings(),
  showWhenLocked: (enabled: boolean) => nativeModule?.showWhenLocked(enabled),
  onFire: (listener: (e: { id: string }) => void) =>
    nativeModule?.addListener('onAlarmFire', listener) ?? { remove: () => {} },
};
