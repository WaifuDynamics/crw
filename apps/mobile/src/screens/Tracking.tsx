import ProfileButton from '../components/ProfileButton';
import { tint, themed } from '../theme';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View, ScrollView, StyleSheet, Platform } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { watchIllustration } from '../components/watchIllustration';
import MobileModal from '../components/MobileModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, Heading, Icon, Label, S, T, Tap, Toggle } from '../ui';
import { post, useAction, useSession } from '../api';
import {
  duration,
  elapsed,
  emptyJournal,
  Journal,
  pace,
  Run,
  workoutTitle,
} from '../tracking/model';
import { readJournal, updateJournal } from '../tracking/store';
import { deleteWorkout, syncWorkouts } from '../tracking/serverSync';
import {
  askForWorkoutNotifications,
  clearWorkoutNotification,
  showWorkoutNotification,
} from '../tracking/workoutNotification';
import {
  ensureLocationReady,
  newRun,
  recoverRecording,
  startLocation,
  stopLocation,
} from '../tracking/recorder';
import WorkoutSession, { ActivityPicker, Countdown } from '../components/WorkoutSession';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityId, activityById } from '../tracking/activities';

const LAST_ACTIVITY = 'crw.tracking.lastActivity';
import { connectHealth, healthStatus, openHealthSettings } from '../tracking/health';
import {
  canWriteHealth,
  getAutoSave,
  healthAppName,
  saveRunToHealth,
  setAutoSave,
  syncHealth,
} from '../tracking/healthSync';
import { workoutCalories, activityOf, speedKmh } from '../tracking/activities';
import WorkoutDetail from '../components/WorkoutDetail';
import RunPhoto from '../components/RunPhoto';
import TrackingDashboard from '../components/TrackingDashboard';
import { CLAY, ClayButton, ClayIconButton, ClayTag, Slab, Well, clay } from '../components/clay';
import { ClayMedal, ClayProvider, ClayStep } from '../components/ClayArt';
import { t } from '../translations';
import { errorKey } from '../errors';

function Metric({
  label,
  value,
  unit,
  color = C.white,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  return (
    <Well radius={18} style={styles.metric}>
      <T style={styles.metricLabel}>{label}</T>
      <T numberOfLines={1} adjustsFontSizeToFit style={[styles.metricValue, { color }]}>
        {value}
        {unit ? <T style={styles.metricUnit}> {unit}</T> : null}
      </T>
    </Well>
  );
}
function Section({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={[S.between, { marginBottom: 14 }]}>
      <Heading style={{ fontSize: 26, lineHeight: 30 }}>{title}</Heading>
      {right}
    </View>
  );
}
export default function Tracking({ navigation, route }: any) {
  const { user, say, refresh: refreshSession } = useSession(),
    owner = user?.id ? String(user.id) : 'guest';
  const [journal, setJournal] = useState<Journal>(emptyJournal),
    [loaded, setLoaded] = useState(false),
    [clock, setClock] = useState(Date.now());
  const [selected, setSelected] = useState<Run | null>(null),
    [photo, setPhoto] = useState(false),
    [connections, setConnections] = useState(false),
    [all, setAll] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, run: act } = useAction();
  // The 3-2-1 before a new workout; recording starts when it ends.
  const [counting, setCounting] = useState<ActivityId | null>(null);
  // Start opens the activity list; the last pick is remembered on this device.
  const [picking, setPicking] = useState(false);
  const [lastActivity, setLastActivity] = useState<ActivityId | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem(LAST_ACTIVITY)
      .then((v) => setLastActivity((v as ActivityId) || null))
      .catch(() => {});
  }, []);
  const [autoSave, setAutoSaveState] = useState(false);
  const [hcStatus, setHcStatus] = useState({
    available: false,
    connected: false,
    canRead: false,
    canWrite: false,
  });
  const weightKg: number | undefined = user?.account?.weight_kg ?? undefined;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const active = journal.active;
  const notified = useRef(false);
  const autoSyncing = useRef(false);
  async function refresh() {
    const data = await readJournal(owner);
    if (ownerRef.current === owner) {
      setJournal(data);
      setLoaded(true);
      // Keeps the live notification's clock moving even when GPS has nothing new.
      if (data.active) {
        notified.current = true;
        void showWorkoutNotification(data.active);
      } else if (notified.current) {
        notified.current = false;
        void clearWorkoutNotification();
      }
    }
  }
  useEffect(() => {
    setJournal(emptyJournal());
    setLoaded(false);
    setSelected(null);
    setPhoto(false);
    setConnections(false);
    void recoverRecording(owner)
      .then(refresh)
      .then(() => syncWorkouts(owner).catch(() => 0))
      .then((n) => (n ? refresh() : undefined))
      // Every launch, pull the latest from the health app so history is up to date.
      .then(() => autoSyncHealth())
      .catch(() => say('Could not load your tracking history. Please reopen Tracking.'));
    void getAutoSave(owner).then(setAutoSaveState);
    void healthStatus().then(setHcStatus);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setClock(Date.now());
        void refresh().catch(() => {});
        // Reopening the app also refreshes from the health app, quietly.
        void autoSyncHealth();
      }
    });
    return () => {
      sub.remove();
    };
  }, [owner]);
  // The live clock and journal re-read only run while a workout is recording. Idle Tracking
  // does no periodic work, so it stops re-rendering (and reading storage) every couple of
  // seconds - the screen stays cheap when you are just looking at your history.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setClock(Date.now());
      void refresh().catch(() => {});
    }, 1000);
    return () => clearInterval(timer);
  }, [!!active]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const hidden = () => {
      if (document.hidden)
        void updateJournal(owner, (j) => ({
          ...j,
          active:
            j.active?.status === 'running'
              ? { ...j.active, status: 'paused', seconds: elapsed(j.active), resumedAt: undefined }
              : j.active,
        }))
          .then(refresh)
          .catch(() => {});
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [owner]);
  // The browser stops GPS when the phone screen locks, so keep it awake during a run.
  const isRunning = active?.status === 'running';
  useEffect(() => {
    if (Platform.OS !== 'web' || !isRunning) return;
    const nav = navigator as any;
    if (!nav.wakeLock) return;
    let lock: any = null;
    let stopped = false;
    const acquire = () => {
      if (stopped || document.hidden) return;
      nav.wakeLock
        .request('screen')
        .then((l: any) => {
          if (stopped) void l.release();
          else lock = l;
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, [isRunning]);
  // Only the workout on screen: the dock hides while one is recorded or counting down.
  const focused = !!active || !!counting || picking;
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: focused ? { display: 'none' } : undefined });
  }, [focused]);
  // A smooth run clock; the journal itself is still re-read every 2 s.
  useEffect(() => {
    if (!isRunning) return;
    const tick = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [isRunning]);
  async function start(kind?: ActivityId) {
    const wasNew = !active;
    if (wasNew) await updateJournal(owner, (j) => ({ ...j, active: newRun(kind) }));
    // Android 13+ asks before the first notification; a "no" only hides the live card.
    await askForWorkoutNotifications().catch(() => false);
    // Indoors the clock is the whole recording: no location, so no permission prompt and
    // no GPS draining the battery for a treadmill or a yoga mat.
    // A resumed workout carries the activity's name, not its id, so it is matched the
    // same way a saved workout is.
    const outdoors = (kind ? activityById(kind) : activityOf({ activity: active?.activity }))
      .tracksDistance;
    let started: Journal;
    try {
      if (outdoors) await startLocation(owner);
      started = await updateJournal(owner, (j) => ({
        ...j,
        active: j.active
          ? { ...j.active, status: 'running', resumedAt: Date.now(), segment: j.active.segment + 1 }
          : null,
      }));
    } catch (e) {
      if (wasNew) await updateJournal(owner, (j) => ({ ...j, active: null }));
      throw e;
    }
    notified.current = true;
    await showWorkoutNotification(started.active, true);
    // Friends hear about a new workout while it is happening (not about a resume). A
    // failure here never stops the workout itself.
    if (wasNew && user)
      void post('/workouts/started', { activity: started.active?.activity || 'Running' }).catch(
        () => {},
      );
    await refresh();
  }
  // Pause / Resume / Finish pressed on the workout notification.
  const requested = route?.params?.action as 'pause' | 'resume' | 'finish' | undefined;
  useEffect(() => {
    if (!requested || !loaded) return;
    navigation.setParams({ action: undefined });
    const status = journal.active?.status;
    if (requested === 'pause' && status === 'running') act(pause);
    else if (requested === 'resume' && status === 'paused') act(start);
    else if (requested === 'finish' && journal.active) act(finish);
  }, [requested, loaded]);
  async function pause() {
    const paused = await updateJournal(owner, (j) => ({
      ...j,
      active: j.active
        ? { ...j.active, status: 'paused', seconds: elapsed(j.active), resumedAt: undefined }
        : null,
    }));
    await stopLocation();
    await showWorkoutNotification(paused.active, true);
    await refresh();
  }
  async function finish() {
    const j = await updateJournal(owner, (j) => {
      if (!j.active) return j;
      const saved: Run = {
        ...j.active,
        status: 'finished',
        seconds: elapsed(j.active),
        endedAt: Date.now(),
        resumedAt: undefined,
      };
      return { ...j, active: null, runs: [saved, ...j.runs] };
    });
    await stopLocation();
    notified.current = false;
    await clearWorkoutNotification();
    const done = j.runs[0];
    setJournal(j);
    setSelected(done);
    // Counts the distance on the km leaderboard; retried the next time Tracking opens.
    void syncWorkouts(owner).catch(() => {});
    // Saving to the health app never blocks the finish; a failure is only reported.
    if (done && (await getAutoSave(owner)))
      try {
        const saved = await saveRunToHealth(owner, done, weightKg);
        setJournal(saved);
        setSelected(saved.runs.find((r) => r.id === done.id) || done);
        say(`Run saved to ${healthAppName}.`);
      } catch (e: any) {
        say(t(errorKey(e)), 'error');
      }
  }
  /** After picking the activity: permissions first, then the countdown, then recording. */
  async function beginWorkout(kind: ActivityId) {
    setPicking(false);
    setLastActivity(kind);
    void AsyncStorage.setItem(LAST_ACTIVITY, kind).catch(() => {});
    if (activityById(kind).tracksDistance) await ensureLocationReady();
    await askForWorkoutNotifications().catch(() => false);
    setCounting(kind);
  }
  // Pull the latest from the health app without a prompt or a toast. Runs only when the
  // read permission is already granted, so opening the app never triggers a permission
  // dialog; the manual sync() below is what asks for access.
  async function autoSyncHealth() {
    if (Platform.OS === 'web' || autoSyncing.current) return;
    const status = await healthStatus().catch(() => null);
    if (!status?.canRead) return;
    autoSyncing.current = true;
    try {
      await syncHealth(owner, user?.account, !!user, refreshSession);
      if (ownerRef.current !== owner) return;
      await syncWorkouts(owner).catch(() => 0);
      await refresh();
      setHcStatus(await healthStatus());
    } catch {
      // A quiet background refresh never interrupts the screen.
    } finally {
      autoSyncing.current = false;
    }
  }
  async function sync() {
    const r = await syncHealth(owner, user?.account, !!user, refreshSession);
    if (ownerRef.current !== owner) return;
    await syncWorkouts(owner).catch(() => 0);
    await refresh();
    setHcStatus(await healthStatus());
    const parts = [
      r.imported
        ? `${r.imported} ${r.imported === 1 ? 'workout' : 'workouts'} imported`
        : 'no new workouts in the last 30 days',
      r.exportedRuns && `${r.exportedRuns} ${r.exportedRuns === 1 ? 'run' : 'runs'} saved`,
      r.exportedReps &&
        `${r.exportedReps} rep ${r.exportedReps === 1 ? 'session' : 'sessions'} saved`,
      r.bodyFilled.length && `${r.bodyFilled.join(' and ')} added to your profile`,
    ].filter(Boolean);
    say(
      r.saveError
        ? `${healthAppName}: ${parts.join(', ')}. Saving failed - ${r.saveError}`
        : `${healthAppName} synced: ${parts.join(', ')}.`,
    );
  }
  async function toggleAutoSave(on: boolean) {
    if (on) {
      await connectHealth();
      const status = await healthStatus();
      setHcStatus(status);
      if (!status.canWrite)
        throw new Error(`Allow CRW+ to write exercise data in ${healthAppName} to turn this on.`);
    }
    await setAutoSave(owner, on);
    setAutoSaveState(on);
    say(on ? `New workouts will be saved to ${healthAppName}.` : `Workouts stay in CRW+ only.`);
  }
  // The 7-day bar chart only changes when the day rolls over or the runs change, not on
  // every unrelated re-render (selecting a run, opening a sheet, the live timer tick).
  const today = new Date(clock).toDateString();
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(clock);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - 6 + i);
        const end = new Date(d);
        end.setDate(end.getDate() + 1);
        return {
          date: d,
          meters: journal.runs
            .filter((r) => r.startedAt >= +d && r.startedAt < +end)
            .reduce((sum, r) => sum + r.meters, 0),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, journal.runs],
  );
  const health =
    journal.health &&
    new Date(journal.health.syncedAt).toDateString() === new Date(clock).toDateString()
      ? journal.health
      : null;
  const seconds = active ? elapsed(active, clock) : 0;
  const running = active?.status === 'running';
  return (
    <View style={S.page}>
      {active ? (
        <WorkoutSession
          run={active}
          now={clock}
          busy={busy}
          weightKg={weightKg}
          onPause={() => act(pause)}
          onResume={() => act(start)}
          onFinish={() => act(finish)}
        />
      ) : (
        <TrackingDashboard
          now={clock}
          days={days}
          runs={journal.runs}
          health={health}
          busy={busy}
          loaded={loaded}
          all={all}
          onStart={() => setPicking(true)}
          onConnect={() => setConnections(true)}
          onRefresh={() => sync()}
          onSelect={(run) => {
            setSelected(run);
            setPhoto(false);
            setConfirmDelete(false);
          }}
          headerRight={<ProfileButton navigation={navigation} />}
          onPhoto={(run) => {
            setSelected(run);
            setPhoto(true);
            setConfirmDelete(false);
          }}
          onToggleAll={() => setAll(!all)}
        />
      )}
      {picking && (
        <ActivityPicker
          last={lastActivity}
          onClose={() => setPicking(false)}
          onPick={(kind) => act(() => beginWorkout(kind))}
        />
      )}
      {counting && (
        <Countdown
          kind={counting}
          onDone={() => {
            const kind = counting;
            setCounting(null);
            act(() => start(kind));
          }}
        />
      )}

      <MobileModal
        visible={!!selected}
        fullBleed={photo}
        animationType="slide"
        onRequestClose={() => {
          setSelected(null);
          setPhoto(false);
        }}
      >
        {selected && photo ? (
          <RunPhoto run={selected} onBack={() => setPhoto(false)} />
        ) : (
          selected && (
            <WorkoutDetail
              run={selected}
              weightKg={weightKg}
              busy={busy}
              onClose={() => setSelected(null)}
              onPhoto={() => setPhoto(true)}
              onDelete={() =>
                void act(async () => {
                  // Gone from this phone now and from the account's other devices.
                  const j = await deleteWorkout(owner, selected.id);
                  setJournal(j);
                  setSelected(null);
                  say('Workout deleted.');
                })
              }
              healthLabel={
                canWriteHealth && selected.source === 'CRW+ GPS' ? (
                  selected.healthConnectId ? (
                    <View style={[S.row, { gap: 8, justifyContent: 'center' }]}>
                      <Icon name="checkmark-circle" color={C.green} size={18} />
                      <T style={{ color: C.white, fontSize: 12 }}>Saved to {healthAppName}</T>
                    </View>
                  ) : (
                    <ClayButton
                      title={`Save to ${healthAppName}`}
                      icon="heart-outline"
                      tone="navy"
                      loading={busy}
                      onPress={() =>
                        act(async () => {
                          await connectHealth();
                          const j = await saveRunToHealth(owner, selected, weightKg);
                          setJournal(j);
                          setSelected(j.runs.find((r) => r.id === selected.id) || selected);
                          say(`Workout saved to ${healthAppName}.`);
                        })
                      }
                    />
                  )
                ) : undefined
              }
            />
          )
        )}
      </MobileModal>

      <MobileModal
        visible={connections}
        animationType="slide"
        onRequestClose={() => setConnections(false)}
      >
        <SafeAreaView style={S.page}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 22, paddingBottom: 40 }}
          >
            <View style={S.between}>
              <ClayIconButton
                icon="arrow-back"
                label="Close health connections"
                onPress={() => setConnections(false)}
              />
              <ClayTag text="CONNECTED HEALTH" tone="coral" icon="heart" />
            </View>
            <Slab tone="navy" radius={36} style={styles.healthHero}>
              <SvgXml xml={watchIllustration} width="100%" height="100%" />
            </Slab>
            <Heading style={{ fontFamily: 'DisplayItalic', fontSize: 50, lineHeight: 50 }}>
              ONE YOU.{`\n`}ALL YOUR MOVES.
            </Heading>
            <T style={{ marginTop: 14 }}>
              Connect the health app on your phone. Bring in completed runs from your watch, plus
              today’s steps, active energy and average heart rate.
            </T>
            {['Apple Health', 'Health Connect'].map((name, i) => {
              const available = Platform.OS === (i ? 'android' : 'ios');
              return (
                <Slab key={name} radius={26} style={styles.connection}>
                  <ClayProvider kind={i ? 'connect' : 'apple'} size={46} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Heading style={{ fontSize: 24, lineHeight: 26 }}>{name}</Heading>
                    <T style={{ fontSize: 11, lineHeight: 16 }}>
                      {i
                        ? 'Android · Compatible watch companion apps'
                        : 'iPhone · Apple Watch & compatible apps'}
                    </T>
                  </View>
                  <ClayTag
                    text={available ? 'AVAILABLE' : i ? 'ANDROID' : 'IPHONE'}
                    tone={available ? 'lime' : 'navy'}
                  />
                </Slab>
              );
            })}
            <Slab radius={30} style={{ marginTop: 22, padding: 20, gap: 18 }}>
              {(
                [
                  [
                    'sync',
                    'Sync your watch',
                    'Finish a run in your watch app and let it sync to your phone’s health app.',
                  ],
                  [
                    'share',
                    'Choose what to share',
                    'CRW+ only reads the health categories you allow. Missing data stays blank.',
                  ],
                  [
                    'import',
                    'Bring it into CRW+',
                    'Import the last 30 days of workouts – runs, rides, gym, yoga and more. Repeat imports are deduplicated.',
                  ],
                ] as const
              ).map(([kind, title, body], i) => (
                <View key={kind} style={[S.row, { gap: 14, alignItems: 'flex-start' }]}>
                  <View style={styles.stepArt}>
                    <ClayStep kind={kind} size={46} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T style={styles.stepNumber}>STEP 0{i + 1}</T>
                    <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 13 }}>{title}</T>
                    <T style={{ fontSize: 11, lineHeight: 18, marginTop: 4 }}>{body}</T>
                  </View>
                </View>
              ))}
            </Slab>
            {canWriteHealth && (
              <Slab
                radius={26}
                style={{ marginTop: 18, paddingHorizontal: 18, paddingVertical: 6 }}
              >
                <View style={[S.row, { gap: 8, paddingTop: 12 }]}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: hcStatus.connected ? C.green : C.gray,
                    }}
                  />
                  <T style={{ color: C.white, fontSize: 12, fontFamily: 'InterBold' }}>
                    {!hcStatus.available
                      ? 'Health Connect not found on this phone'
                      : hcStatus.connected
                        ? 'Connected to Health Connect'
                        : 'Not connected yet'}
                  </T>
                </View>
                <Toggle
                  title="Save CRW+ workouts to Health Connect"
                  description="Runs with their distance and calories, plus your solo push-up and squat sessions. Weight and height are shared both ways."
                  value={autoSave}
                  onChange={(v: boolean) => act(() => toggleAutoSave(v))}
                />
                {hcStatus.available && (
                  <Tap
                    label="Manage Health Connect permissions"
                    onPress={openHealthSettings}
                    style={[S.row, { gap: 8, paddingBottom: 14 }]}
                  >
                    <Icon name="settings-outline" color={C.blue} size={16} />
                    <T style={{ color: C.blue, fontSize: 12, fontFamily: 'InterBold' }}>
                      Manage permissions in Health Connect
                    </T>
                  </Tap>
                )}
              </Slab>
            )}
            <ClayButton
              title={
                Platform.OS === 'web'
                  ? 'Available in the mobile app'
                  : journal.health
                    ? `Sync with ${healthAppName}`
                    : 'Connect & sync'
              }
              icon="sync-outline"
              tone="blue"
              size="large"
              style={{ marginTop: 24 }}
              loading={busy}
              disabled={Platform.OS === 'web'}
              onPress={() => act(sync)}
            />
            <T style={{ marginTop: 18, fontSize: 11 }}>
              Imported health data stays on this device, separate from public profiles and rankings.
              CRW+ only writes to {healthAppName} when you turn saving on. You can revoke access at
              any time in your phone’s health settings.
            </T>
            {journal.health && (
              <ClayButton
                title="Remove daily health data"
                tone="navy"
                icon="trash-outline"
                style={{ marginTop: 18 }}
                disabled={busy}
                onPress={() =>
                  act(async () => {
                    const j = await updateJournal(owner, (j) => ({ ...j, health: null }));
                    setJournal(j);
                    say('Daily health data removed. Imported runs remain in your history.');
                  })
                }
              />
            )}
          </ScrollView>
        </SafeAreaView>
      </MobileModal>
    </View>
  );
}
const styles = themed(() =>
  StyleSheet.create({
    activeRun: { padding: 16, paddingTop: 16, marginBottom: 6 },
    navBubble: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    locateBubble: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    liveDistance: {
      fontSize: 66,
      lineHeight: 74,
      fontFamily: 'Display',
      letterSpacing: 0,
      color: tint('#6FB7FF'),
      marginBottom: 12,
    },
    metric: { flex: 1, padding: 12, paddingVertical: 10, gap: 4 },
    metricLabel: { fontFamily: 'InterBold', fontSize: 9, letterSpacing: 1.2, color: C.gray },
    metricValue: { fontFamily: 'Display', fontSize: 26, lineHeight: 30, letterSpacing: 0 },
    metricUnit: { fontFamily: 'Inter', fontSize: 10, color: C.gray },
    splitIndex: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    splitIndexText: { fontFamily: 'InterBold', fontSize: 11, color: C.white },
    healthHero: {
      alignItems: 'center',
      justifyContent: 'center',
      height: 208,
      borderRadius: 36,
      overflow: 'hidden',
      backgroundColor: '#0C141F',
      marginTop: 24,
      marginBottom: 26,
    },
    connection: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      padding: 14,
      paddingRight: 14,
      marginTop: 14,
    },
    stepArt: { width: 50, alignItems: 'center', paddingTop: 2 },
    stepNumber: {
      fontFamily: 'InterBold',
      fontSize: 9,
      letterSpacing: 1.2,
      color: C.gray,
      marginBottom: 3,
    },
  }),
);
