import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { request } from './api';
import { setupWorkoutNotifications, WORKOUT_NOTIFICATION } from './tracking/workoutNotification';

// Push notifications from the CRW+ server.
//
// Android registers its Firebase (FCM) token, so the server can style each push
// (channel, colour, icon, picture). iOS registers an Expo push token. The channels
// below match the categories the server sends (apps/api/src/push.ts).

const TOKEN_KEY = 'crw.push.token';

type Channel = {
  id: string;
  name: string;
  description: string;
  importance: Notifications.AndroidImportance;
  color: string;
};
const CHANNELS: Channel[] = [
  {
    id: 'general',
    name: 'General',
    description: 'Account and app updates.',
    importance: Notifications.AndroidImportance.DEFAULT,
    color: '#168BFF',
  },
  {
    id: 'social',
    name: 'Friend requests',
    description: 'New friend requests and accepted invitations.',
    importance: Notifications.AndroidImportance.HIGH,
    color: '#168BFF',
  },
  {
    id: 'friends',
    name: 'Friend activity',
    description: 'When a friend finishes a workout or sets a record.',
    importance: Notifications.AndroidImportance.HIGH,
    color: '#A9F06A',
  },
  {
    id: 'events',
    name: 'Activities and bookings',
    description: 'Booking confirmations, reminders and changes to activities you joined.',
    importance: Notifications.AndroidImportance.HIGH,
    color: '#FF7A3D',
  },
  {
    id: 'compete',
    name: 'Rankings and achievements',
    description: 'Badges, challenges and leaderboard moments.',
    importance: Notifications.AndroidImportance.DEFAULT,
    color: '#FFD18B',
  },
  {
    id: 'marketing',
    name: 'Tips and offers',
    description: 'Occasional ideas for your next move.',
    importance: Notifications.AndroidImportance.LOW,
    color: '#F27894',
  },
];

let setup: Promise<void> | null = null;

/** Channels, buttons and how pushes show while the app is open. Runs once per launch. */
export function setupNotifications() {
  if (Platform.OS === 'web') return Promise.resolve();
  setup ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async (n) => {
        // The live workout notification updates silently; everything else pops up.
        const quiet = n.request.identifier === WORKOUT_NOTIFICATION;
        return {
          shouldShowBanner: !quiet,
          shouldShowList: true,
          shouldPlaySound: !quiet,
          shouldSetBadge: false,
        };
      },
    });
    if (Platform.OS === 'android')
      for (const c of CHANNELS)
        await Notifications.setNotificationChannelAsync(c.id, {
          name: c.name,
          description: c.description,
          importance: c.importance,
          lightColor: c.color,
          enableLights: true,
          vibrationPattern:
            c.importance >= Notifications.AndroidImportance.HIGH ? [0, 180, 90, 180] : null,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
          showBadge: true,
        });
    await setupWorkoutNotifications();
  })().catch((e) => {
    setup = null;
    throw e;
  });
  return setup;
}

export type PushStatus = 'registered' | 'denied' | 'unavailable';

async function deviceRegistration() {
  if (Platform.OS === 'android') {
    // Needs google-services.json in the build; without it this throws.
    const { data } = await Notifications.getDevicePushTokenAsync();
    return { token: String(data), platform: 'android', provider: 'fcm' } as const;
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return { token: data, platform: 'ios', provider: 'expo' } as const;
}

let inFlight: Promise<PushStatus> | null = null;
let lastRegisteredToken: string | null = null;

/**
 * Sends this phone's push token to the signed-in account. With `ask`, asks for the
 * notification permission first; without it, only registers when already allowed
 * (used on every launch so a rotated token reaches the server).
 */
export async function registerForPush(ask: boolean): Promise<PushStatus> {
  if (Platform.OS === 'web') return 'unavailable';
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      await setupNotifications();
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted && ask && permission.canAskAgain)
        permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) return 'denied';
      let device;
      try {
        device = await deviceRegistration();
      } catch {
        return 'unavailable';
      }
      const savedToken = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
      if (savedToken === device.token && lastRegisteredToken === device.token) {
        return 'registered';
      }
      await request('/devices', { method: 'POST', body: JSON.stringify(device) });
      lastRegisteredToken = device.token;
      await AsyncStorage.setItem(TOKEN_KEY, device.token).catch(() => {});
      return 'registered';
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Stops pushes for the account that is signing out on this phone. */
export async function unregisterPush() {
  if (Platform.OS === 'web') return;
  lastRegisteredToken = null;
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  await request('/devices', { method: 'DELETE', body: JSON.stringify({ token }) }).catch(() => {});
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/** Re-registers when Firebase rotates the token while the app runs. */
export function watchPushToken(signedIn: () => boolean) {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addPushTokenListener(async (event) => {
    if (!signedIn()) return;
    const rawToken = event?.data ? String(event.data) : null;
    if (!rawToken) return;
    const saved = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
    if (saved === rawToken && lastRegisteredToken === rawToken) return;

    const platform = Platform.OS === 'android' ? 'android' : 'ios';
    const provider = Platform.OS === 'android' ? 'fcm' : 'expo';
    await request('/devices', {
      method: 'POST',
      body: JSON.stringify({ token: rawToken, platform, provider }),
    }).catch(() => {});
    lastRegisteredToken = rawToken;
    await AsyncStorage.setItem(TOKEN_KEY, rawToken).catch(() => {});
  });
  return () => sub.remove();
}
