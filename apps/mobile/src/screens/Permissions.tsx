import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import { useSession } from '../api';
import { registerForPush } from '../push';
import { connectHealth, healthStatus } from '../tracking/health';
import { tint } from '../theme';
import { Button, C, Heading, Icon, Label, Page, S, T, Tap } from '../ui';

// What CRW+ asks the phone for, once, right after signing in: one card per permission,
// what it is actually used for in plain words, and a button that opens the system dialog.
// Nothing here is required - every card can be left alone and the app still works, with
// the part that needs it switched off. A refused permission cannot be asked for twice by
// the system, so the button then opens the phone's settings instead.

const SEEN_KEY = (userId: string) => `crw.permissions.v1.${userId}`;

/** Whether this account has already been walked through the permissions. */
export async function permissionsAsked(userId: string) {
  try {
    return (await AsyncStorage.getItem(SEEN_KEY(userId))) === 'yes';
  } catch {
    // A phone that cannot read its own storage should not be asked on every launch.
    return true;
  }
}

async function remember(userId: string) {
  try {
    await AsyncStorage.setItem(SEEN_KEY(userId), 'yes');
  } catch {
    // Not worth interrupting anybody over.
  }
}

type State = 'unknown' | 'granted' | 'ask' | 'blocked';

type Permission = {
  key: string;
  icon: string;
  title: string;
  why: string;
  /** Left out where the platform has no such permission. */
  platforms?: ('ios' | 'android')[];
  check: () => Promise<State>;
  request: () => Promise<State>;
};

const fromExpo = (p: { granted: boolean; canAskAgain?: boolean }): State =>
  p.granted ? 'granted' : p.canAskAgain === false ? 'blocked' : 'ask';

const PERMISSIONS: Permission[] = [
  {
    key: 'location',
    icon: 'navigate-outline',
    title: 'Location',
    why: 'Draws the route of your run, ride or walk on the map and measures distance and pace. CRW+ reads your location only while a workout is running.',
    check: async () => fromExpo(await Location.getForegroundPermissionsAsync()),
    request: async () => fromExpo(await Location.requestForegroundPermissionsAsync()),
  },
  {
    key: 'locationAlways',
    icon: 'walk-outline',
    title: 'Location with the screen off',
    why: 'Keeps recording when you lock the phone or put it in a pocket mid-workout. Without it the track stops when the screen goes dark.',
    check: async () => fromExpo(await Location.getBackgroundPermissionsAsync()),
    request: async () => fromExpo(await Location.requestBackgroundPermissionsAsync()),
  },
  {
    key: 'notifications',
    icon: 'notifications-outline',
    title: 'Notifications',
    why: 'Shows your live workout on the lock screen, and tells you when a friend finishes a session or an activity you booked is about to start.',
    check: async () => fromExpo(await Notifications.getPermissionsAsync()),
    request: async () => {
      const status = await registerForPush(true);
      return status === 'registered' ? 'granted' : status === 'denied' ? 'blocked' : 'ask';
    },
  },
  {
    key: 'camera',
    icon: 'camera-outline',
    title: 'Camera',
    why: 'Counts your push-ups and squats in Compete, takes the photo with your stats on it, and scans tickets at an activity.',
    check: async () => fromExpo(await Camera.getCameraPermissionsAsync()),
    request: async () => fromExpo(await Camera.requestCameraPermissionsAsync()),
  },
  {
    key: 'photos',
    icon: 'images-outline',
    title: 'Photos',
    why: 'Saves the picture of a finished workout to your gallery and lets you pick a profile photo.',
    check: async () => fromExpo(await MediaLibrary.getPermissionsAsync()),
    request: async () => fromExpo(await MediaLibrary.requestPermissionsAsync()),
  },
  {
    key: 'health',
    icon: 'heart-outline',
    title: Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect',
    why: 'Brings in workouts, steps and heart rate recorded by your watch or another app, and writes your CRW+ workouts back so everything lives in one place.',
    check: async () => ((await healthStatus()).connected ? 'granted' : 'ask'),
    request: async () => {
      await connectHealth();
      return (await healthStatus()).connected ? 'granted' : 'ask';
    },
  },
];

export default function PermissionsScreen({ navigation }: any) {
  const { user } = useSession();
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<State>('unknown');
  const [busy, setBusy] = useState(false);

  const list = PERMISSIONS.filter(
    (p) => !p.platforms || p.platforms.includes(Platform.OS as 'ios' | 'android'),
  );
  const permission = list[Math.min(index, list.length - 1)];
  const last = index >= list.length - 1;

  const look = useCallback(async () => {
    try {
      setState(await permission.check());
    } catch {
      // A phone without Health Connect, for example.
      setState('ask');
    }
  }, [permission]);

  useEffect(() => {
    void look();
    // Someone may grant a permission in the settings and come back.
    return navigation.addListener('focus', () => void look());
  }, [navigation, look]);

  const leave = async () => {
    if (user?.id) await remember(String(user.id));
    navigation.canGoBack()
      ? navigation.goBack()
      : navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const next = () => (last ? void leave() : setIndex(index + 1));

  const allow = async () => {
    setBusy(true);
    try {
      const answer = state === 'blocked' ? 'blocked' : await permission.request();
      if (answer === 'blocked') {
        // The system will not ask twice; the phone's settings are the only way back.
        await Linking.openSettings();
        setState('blocked');
        return;
      }
      setState(answer);
      // Answered, so move on: the next permission gets its own screen.
      if (answer === 'granted') setTimeout(next, 350);
    } catch {
      setState('ask');
    } finally {
      setBusy(false);
    }
  };

  const done = state === 'granted';
  const blocked = state === 'blocked';

  return (
    <Page>
      <View style={{ flex: 1, paddingTop: 18, paddingBottom: 12 }}>
        {/* One dot per permission, filled up to the one being asked about. */}
        <View style={[S.row, { gap: 6, marginBottom: 26 }]}>
          {list.map((p, i) => (
            <View
              key={p.key}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: i <= index ? C.blue : C.line,
              }}
            />
          ))}
        </View>

        <Label style={{ color: C.blue }}>
          STEP {index + 1} OF {list.length}
        </Label>

        <View
          style={{
            width: 86,
            height: 86,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 22,
            backgroundColor: done ? tint('#1E3016') : tint('#0C2949'),
          }}
        >
          <Icon
            name={done ? 'checkmark' : permission.icon}
            size={40}
            color={done ? C.green : C.blue}
          />
        </View>

        <Heading style={{ fontSize: 40, marginTop: 20 }}>{permission.title.toUpperCase()}</Heading>
        <T style={{ fontSize: 13, lineHeight: 20, marginTop: 14 }}>{permission.why}</T>

        {done && <Label style={{ fontSize: 9, marginTop: 18, color: C.green }}>ALLOWED</Label>}
        {blocked && (
          <T style={{ fontSize: 11, lineHeight: 17, marginTop: 18, color: C.error }}>
            Your phone will not ask again. Turn it on in the settings if you change your mind.
          </T>
        )}

        <View style={{ flex: 1 }} />

        {!done && (
          <Button
            title={blocked ? 'Open phone settings' : 'Allow'}
            loading={busy}
            onPress={() => void allow()}
            style={{ minHeight: 52 }}
          />
        )}
        <Button
          title={last ? (done ? 'Done' : 'Finish') : done ? 'Next' : 'Skip this one'}
          variant={done ? 'white' : 'outline'}
          onPress={next}
          style={{ marginTop: 10, minHeight: 52 }}
        />
        <Tap label="Skip all" onPress={() => void leave()} style={{ paddingVertical: 16 }}>
          <T style={{ textAlign: 'center', fontSize: 12 }}>
            Skip all - you can turn these on later in Settings
          </T>
        </Tap>
      </View>
    </Page>
  );
}
