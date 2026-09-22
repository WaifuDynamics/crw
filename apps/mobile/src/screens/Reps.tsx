import { clay } from '../claySurface';
import { themed, tint } from '../theme';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { Button, C, Header, Icon, Label, OfflineState, S, T } from '../ui';
import { useOnline } from '../network';
import { useSession } from '../api';

// The rep counter (camera, pose model, the race screen) ships inside the app: on a phone it
// is copied out of the app's own files and opened in a WebView, on the website it is served
// next to the app and framed in an iframe. Matchmaking is part of the CRW+ API. Either way
// the page reports finished matches and solo sessions to us, and we save them to the
// account. Solo needs no connection at all; only a race needs somebody to race.
import { MATCH_API, fetchMyStats, recordResult, recordSolo } from '../reps';
import { embeddedCounterPage } from '../reps/embedded';
import RepCounterView from '../components/RepCounterView';
import { t } from '../translations';

const THEME = themed(() => ({
  bg: C.bg,
  panel: C.panel,
  panel2: C.panel2,
  line: C.line,
  ink: C.white,
  muted: C.gray,
  me: C.blue, // you
  op: C.green, // the other side
  onme: C.onAccent, // text on the accent
  fonts: 'crw', // Barlow Condensed + Inter, the CRW+ type
  brand: '0', // this screen has its own header, so hide the counter title
  skin: 'crw', // CRW+ layout and type inside the counter
}));

export function counterQuery(exercise: string, name?: string, mode?: string, lang?: string) {
  const q = new URLSearchParams({ embed: '1', exercise, match: MATCH_API, ...THEME });
  if (name) q.set('name', String(name).slice(0, 16));
  // Picked on Compete: the counter joins that queue straight away.
  if (mode && ['solo', '1v1', '2v2'].includes(mode)) q.set('mode', mode);
  if (lang) q.set('lang', lang);
  return q.toString();
}

/** The counter's page with the query attached, once it is ready on this device. */
function useCounterPage(query: string) {
  const [page, setPage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError('');
    embeddedCounterPage()
      .then((base) => live && setPage(`${base}?${query}`))
      .catch(() => live && setError(t('errors.counter')));
    return () => {
      live = false;
    };
  }, [query, attempt]);
  return { page, error, retry: () => setAttempt((n) => n + 1) };
}

type Reply = (msg: Record<string, unknown>) => void;

// A finished solo session: save it to the account, then hand the account's records back
// to the counter so its summary shows lifetime reps and the best set ever.
async function saveSolo(d: any, reply: Reply, signedIn: boolean) {
  const exercise = d.exercise === 'squat' ? 'squat' : 'pushup';
  const answer = (msg: Record<string, unknown>) =>
    reply({ source: 'crw', type: 'records', sessionId: d.sessionId, ...msg });
  if (!signedIn) {
    answer({ saved: false, message: 'Saved on this device · sign in to keep your records' });
    return;
  }
  const reps = Math.round(Number(d.reps) || 0);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(d.sessionId)) || reps < 1) return;
  try {
    const before = await fetchMyStats().catch(() => null);
    const { solo } = await recordSolo({
      sessionId: String(d.sessionId),
      exercise,
      reps,
      bestSet: Math.max(1, Math.min(reps, Math.round(Number(d.bestSet) || 0))),
      seconds: Math.max(0, Math.min(86400, Math.round(Number(d.seconds) || 0))),
    });
    answer({
      saved: true,
      records: solo[exercise],
      ...(before ? { previousBestSet: before.solo?.[exercise]?.bestSet ?? 0 } : {}),
    });
  } catch {
    answer({ saved: false, message: 'Could not reach CRW+ · saved on this device' });
  }
}

/** Handles a message from the counter page, wherever it runs. */
function handleCounterMessage(d: any, reply: Reply, signedIn: boolean) {
  if (!d || d.source !== 'pushups' || d.type !== 'result') return;
  if (d.mode === 'solo') {
    void saveSolo(d, reply, signedIn);
    return;
  }
  if (!signedIn || !d.matchId || !['1v1', '2v2'].includes(d.mode)) return;
  recordResult({
    matchId: String(d.matchId),
    mode: d.mode,
    exercise: d.exercise === 'squat' ? 'squat' : 'pushup',
    won: Boolean(d.won),
    reason: d.reason === 'walkover' ? 'walkover' : 'target',
    reps: Math.max(0, Math.round(Number(d.reps) || 0)),
    score: [Number(d.score?.[0]) || 0, Number(d.score?.[1]) || 0],
    opponents: (Array.isArray(d.opponents) ? d.opponents : []).slice(0, 3).map(String),
  }).catch(() => {
    /* a lost report only costs one row in the stats, never the match itself */
  });
}

function WebCounter({ src, title, signedIn }: { src: string; title: string; signedIn: boolean }) {
  useEffect(() => {
    // The counter is served next to the website, from the same origin.
    const origin = window.location.origin;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin) return;
      const frame = e.source as Window | null;
      handleCounterMessage(e.data, (msg) => frame?.postMessage(msg, origin), signedIn);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [signedIn]);
  // A real DOM iframe: react-native-web renders View as a div, and the browser only
  // hands the camera to a frame that is explicitly allowed to use it.
  return React.createElement('iframe', {
    src,
    title,
    allow: 'camera; fullscreen',
    style: { flex: 1, width: '100%', border: 'none', background: C.bg },
  });
}

export function CameraGate({ children }: { children: React.ReactNode }) {
  const [permission, request, refresh] = useCameraPermissions();
  const asked = useRef(false);

  // Ask once, straight away; people opened this screen to use the camera.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && !asked.current) {
      asked.current = true;
      void request();
    }
  }, [permission?.status]);

  // Coming back from system settings: re-check.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, []);

  if (!permission)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.blue} />
      </View>
    );
  if (permission.granted) return <>{children}</>;
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          ...clay('blue', 0.7),
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
        }}
      >
        <Icon name="camera-outline" size={30} color={C.blue} />
      </View>
      <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 17, textAlign: 'center' }}>
        The camera counts your reps
      </T>
      <T style={{ fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
        CRW+ watches your movement on the phone to count push-ups and squats. The video never leaves
        your phone - only the rep count is shared in a match.
      </T>
      {permission.canAskAgain ? (
        <Button title="Allow camera" icon="camera-outline" onPress={() => void request()} />
      ) : (
        <>
          <T style={{ fontSize: 12, textAlign: 'center', color: tint('#FFD18B') }}>
            Camera access is turned off for CRW+. Turn it on in the phone settings.
          </T>
          <Button
            title="Open settings"
            icon="settings-outline"
            onPress={() => Linking.openSettings()}
          />
        </>
      )}
    </View>
  );
}

function NativeCounter({ src, signedIn }: { src: string; signedIn: boolean }) {
  return (
    <RepCounterView
      src={src}
      onMessage={(data, reply) => handleCounterMessage(data, reply, signedIn)}
    />
  );
}

function Counter({ exercise, title, eyebrow, navigation, route }: any) {
  const { user } = useSession();
  const lang = user?.account?.language || undefined;
  const query = counterQuery(exercise, user?.display_name, route?.params?.mode, lang);
  const { page, error, retry } = useCounterPage(query);
  const signedIn = !!user;
  const online = useOnline();
  return (
    <View style={S.page}>
      <Header
        title={title}
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
        right={
          <Label numberOfLines={1} style={{ fontSize: 9, textAlign: 'right', maxWidth: 200 }}>
            {eyebrow}
          </Label>
        }
      />
      {/* Edge to edge: during a set the counter page turns the whole area into the camera. */}
      <View style={{ flex: 1, backgroundColor: C.bg, overflow: 'hidden' }}>
        {Platform.OS === 'web' && !online ? (
          // The website itself needs the connection to serve the counter.
          <OfflineState />
        ) : error ? (
          <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14 }}>
            <T
              style={{ color: C.white, fontFamily: 'InterBold', fontSize: 16, textAlign: 'center' }}
            >
              The rep counter did not start
            </T>
            <T style={{ fontSize: 12, textAlign: 'center' }}>{error}</T>
            <Button title="Try again" icon="refresh" onPress={retry} />
          </View>
        ) : !page ? (
          // The first open after an install copies the counter out of the app.
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ActivityIndicator color={C.blue} />
            <T style={{ fontSize: 12 }}>Getting the counter ready…</T>
          </View>
        ) : Platform.OS === 'web' ? (
          <WebCounter src={page} title={title} signedIn={signedIn} />
        ) : (
          <CameraGate>
            <NativeCounter src={page} signedIn={signedIn} />
          </CameraGate>
        )}
      </View>
    </View>
  );
}

export function PushupsScreen(props: any) {
  return (
    <Counter {...props} exercise="pushup" title="Push-ups" eyebrow="SIDE-ON · TORSO IN FRAME" />
  );
}

export function SquatsScreen(props: any) {
  return <Counter {...props} exercise="squat" title="Squats" eyebrow="SIDE-ON · FEET IN FRAME" />;
}
