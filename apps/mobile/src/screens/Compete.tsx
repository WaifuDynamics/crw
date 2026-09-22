import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useIsFocused } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import PageBrand from '../components/PageBrand';
import ProfileButton from '../components/ProfileButton';
import CompeteBackground from '../components/CompeteBackground';
import { cameraChallengePath } from '../components/cameraChallengePath';
import RepLeaderboard from '../components/RepLeaderboard';
import { ClayButton, ClayIconButton } from '../components/clay';
import { invalidate, useSession } from '../api';
import { DOCK_SPACE } from '../layout';
import { themed } from '../theme';
import { C, S, Heading, Icon, Label, Page, T, Tap } from '../ui';
import { EXERCISE_LABEL, Exercise, GameMode, fetchMyStats, fetchQueues } from '../reps';

const modes: { id: GameMode; title: string; icon: string; detail: string }[] = [
  { id: 'solo', title: 'Solo', icon: 'person-outline', detail: 'Beat your best' },
  { id: '1v1', title: '1 vs 1', icon: 'flash-outline', detail: 'Go head to head' },
  { id: '2v2', title: '2 vs 2', icon: 'people-outline', detail: 'Win as a team' },
];

function CameraChallengeArt() {
  const focused = useIsFocused();
  const phase = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    let mounted = true;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    }).catch(() => {});
    const app = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);

  useEffect(() => {
    if (reducedMotion || !focused || !active) { phase.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(phase, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
      Animated.timing(phase, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [active, focused, phase, reducedMotion]);

  const pulse = (from: number, to: number) => phase.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  return (
    <View style={st.challengeArt} accessible={false}>
      <Animated.View testID="challenge-ring-outer" style={[st.ringOuter, { opacity: pulse(0.45, 1), transform: [{ scale: pulse(0.94, 1.04) }] }]} />
      <Animated.View style={[st.ringMid, { opacity: pulse(1, 0.55), transform: [{ scale: pulse(1, 1.08) }] }]} />
      <Animated.View style={[st.ringInner, { opacity: pulse(0.8, 1), transform: [{ scale: pulse(1, 1.03) }] }]} />
      <View style={st.cameraRing}>
        <Svg width={90} height={54} viewBox="390 320 760 410" fill="none">
          <Path d={cameraChallengePath} fill="#FFFFFF" fillRule="evenodd" />
        </Svg>
      </View>
    </View>
  );
}

function Score({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={st.score}>
      <Heading style={st.scoreValue}>{value}</Heading>
      <T style={st.scoreLabel}>{label}</T>
    </View>
  );
}

export default function Compete({ navigation }: any) {
  const focused = useIsFocused();
  const { user } = useSession();
  const [exercise, setExercise] = useState<Exercise>('pushup');
  const [mode, setMode] = useState<GameMode>('solo');
  const [tipsOpen, setTipsOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const queues = useQuery({
    queryKey: ['compete-queues'],
    queryFn: fetchQueues,
    enabled: focused,
    refetchInterval: focused ? 5000 : false,
  });
  const stats = useQuery({
    queryKey: ['compete-record', user?.id],
    queryFn: fetchMyStats,
    enabled: focused && !!user,
    staleTime: 0,
  });
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([invalidate(), queues.refetch(), ...(user ? [stats.refetch()] : [])]);
    } finally {
      setRefreshing(false);
    }
  };
  const start = () => navigation.navigate(exercise === 'squat' ? 'Squats' : 'Pushups', { mode });
  const waiting = mode === 'solo' ? 0 : (queues.data?.waiting?.[mode]?.[exercise] ?? 0);
  const queueText =
    mode === 'solo'
      ? 'No waiting. Just you and your next best set.'
      : queues.isError
        ? 'Live queue unavailable. You can still try matchmaking.'
        : !queues.data
          ? 'Checking the live queue…'
          : waiting
            ? `${waiting} waiting · ${Math.max(0, queues.data.needed[mode] - waiting)} more to start`
            : 'Be the first in line. We’ll find your match.';
  const record = stats.data;

  return (
    <Page
      pad={false}
      style={{ paddingBottom: DOCK_SPACE }}
      refresh={refresh}
      refreshing={refreshing}
    >
      <CompeteBackground focused={focused} />
      <View style={st.wrap}>
        <View style={st.bar}>
          <PageBrand title="COMPETE" />
          <View style={[S.row, { gap: 10 }]}>
            <ClayIconButton
              icon="people-outline"
              label="Friends"
              onPress={() => navigation.navigate('Friends')}
            />
            <ProfileButton navigation={navigation} />
          </View>
        </View>
        <View style={st.intro}>
          <Heading style={st.hero}>
            READY. SET. <Heading style={[st.hero, { color: C.blue }]}>PLAY.</Heading>
          </Heading>
        </View>
        <View style={st.arena} testID="compete-arena">
          <View style={st.challengeHeading}>
            <View style={[S.row, { gap: 10 }]}>
              <Icon name="scan-outline" color={C.blue} size={17} />
              <Label style={st.cameraLabel}>CAMERA CHALLENGES</Label>
            </View>
            <Heading style={st.playTitle}>Beat your best.</Heading>
            <T style={st.challengeCopy}>Real reps. Real progress.</T>
          </View>
          <CameraChallengeArt />
          <View style={st.exerciseRow}>
            {(['pushup', 'squat'] as Exercise[]).map((ex) => (
              <Tap
                key={ex}
                label={`Choose ${EXERCISE_LABEL[ex]}`}
                accessibilityState={{ selected: exercise === ex }}
                onPress={() => setExercise(ex)}
                style={[st.exercise, exercise === ex && st.exerciseOn]}
              >
                <Icon
                  name={ex === 'pushup' ? 'barbell-outline' : 'walk-outline'}
                  size={15}
                  color={exercise === ex ? C.black : C.gray}
                />
                <T
                  numberOfLines={1}
                  style={[st.exerciseText, exercise === ex && { color: C.black }]}
                >
                  {EXERCISE_LABEL[ex]}
                </T>
                {exercise === ex && <Icon name="checkmark-circle" size={15} color={C.blue} />}
              </Tap>
            ))}
          </View>
          <View style={st.modeRow}>
            {modes.map((m) => (
              <Tap
                flex
                key={m.id}
                label={`Choose ${m.title}`}
                accessibilityState={{ selected: mode === m.id }}
                onPress={() => setMode(m.id)}
                style={[st.mode, mode === m.id && st.modeOn]}
              >
                <Icon name={m.icon} size={14} color={mode === m.id ? '#FFFFFF' : C.gray} />
                <Heading style={[st.modeTitle, mode === m.id && st.onBlue]} numberOfLines={1}>{m.title}</Heading>
              </Tap>
            ))}
          </View>
          <ClayButton
            title="Start"
            onPress={start}
            size="compact"
            style={st.startButton}
          />
          {mode !== 'solo' && queues.data && (
            <T style={st.matchNote}>
              First to {queues.data.target} reps
              {mode === '2v2' ? ' · Your team’s reps add up' : ' · One winner'}
            </T>
          )}
          <Tap
            label="Camera setup tips"
            accessibilityState={{ expanded: tipsOpen }}
            onPress={() => setTipsOpen(!tipsOpen)}
            style={st.tipsToggle}
          >
            <Icon name="camera-outline" size={16} color={C.gray} />
            <T style={[st.detail, { flex: 1 }]}>First time? Get camera-ready</T>
            <Icon name={tipsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.gray} />
          </Tap>
          {tipsOpen && (
            <View style={st.tips}>
              <T style={st.detail}>
                1. Place your camera side-on, {exercise === 'squat' ? '2–3' : 'about 2'} metres
                away.
              </T>
              <T style={st.detail}>
                2. Keep{' '}
                {exercise === 'squat'
                  ? 'your whole body, including your feet,'
                  : 'your torso and both arms'}{' '}
                in frame.
              </T>
              <T style={st.detail}>3. Face the light and give yourself room to move.</T>
              <T style={st.detail}>Video stays on your device. Only your rep count is sent.</T>
            </View>
          )}
        </View>
        <View style={st.section}>
          <Tap
            label="Your progress"
            accessibilityState={{ expanded: progressOpen }}
            onPress={() => setProgressOpen(!progressOpen)}
            style={st.progressHeader}
          >
            <View style={st.sectionIcon}><Icon name="trending-up" size={20} color={C.blue} /></View>
            <View style={{ flex: 1, gap: 3 }}>
              <T style={st.sectionHeading}>Your progress</T>
              <T style={st.detail}>Small steps. Stronger every session.</T>
            </View>
            <Icon name={progressOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.gray} />
          </Tap>
          {progressOpen && (<View>
          {!user ? (
            <View style={st.signIn}>
              <Icon name="trophy-outline" size={26} color={C.black} />
              <Heading style={st.signInTitle}>MAKE EVERY WIN YOURS.</Heading>
              <T style={st.signInCopy}>
                Save your solo records, collect match wins, and find your place on the board.
              </T>
              <Tap
                label="Sign in to save your progress"
                onPress={() => navigation.navigate('Auth')}
                style={st.signInAction}
              >
                <T style={{ color: C.black, fontFamily: 'InterBold', fontSize: 12 }}>
                  Sign in to save your progress
                </T>
                <Icon name="arrow-forward" size={18} color={C.black} />
              </Tap>
            </View>
          ) : stats.isError ? (
            <View style={st.record}>
              <T style={st.detail}>Your records couldn’t load.</T>
              <ClayButton title="Retry records" onPress={() => void stats.refetch()} />
            </View>
          ) : stats.isPending ? (
            <View style={st.record} accessibilityLabel="Loading progress" accessibilityState={{ busy: true }}>
              <View style={st.scores}>
                {[0, 1, 2].map((item) => (
                  <View key={item} style={st.score}>
                    <View style={st.skeletonValue} />
                    <View style={st.skeletonLabel} />
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={st.record}>
              <View style={st.scores}>
                <Score label="Wins" value={record?.wins ?? 0} />
                <Score label="Total reps" value={(record?.reps ?? 0).toLocaleString()} />
                <Score
                  label="Win rate"
                  value={
                    record?.matches ? `${Math.round((record.wins / record.matches) * 100)}%` : '—'
                  }
                />
              </View>
              <T style={st.detail}>
                {record?.matches ?? 0} matches · 1v1 wins {record?.byMode['1v1'] ?? 0} · 2v2 wins{' '}
                {record?.byMode['2v2'] ?? 0}
              </T>
              {(['pushup', 'squat'] as Exercise[]).map((ex) => (
                <View key={ex} testID={`solo-record-${ex}`} style={st.soloRecord}>
                  <View style={S.between}>
                    <T style={st.exerciseText}>{EXERCISE_LABEL[ex]}</T>
                    <T style={st.detail}>{record?.solo?.[ex]?.sessions ?? 0} solo sessions</T>
                  </View>
                  <View style={st.scores}>
                    <Score label="Lifetime reps" value={record?.solo?.[ex]?.reps ?? 0} />
                    <Score label="Best set" value={record?.solo?.[ex]?.bestSet || '—'} />
                    <Score label="Best session" value={record?.solo?.[ex]?.bestSession || '—'} />
                  </View>
                  <T style={st.detail}>{record?.byExercise[ex] ?? 0} match wins</T>
                </View>
              ))}
            </View>
          )}
          </View>)}
          {!progressOpen && (
            <View style={st.progressSnapshot}>
              <View><Heading style={st.snapshotValue}>{record?.reps ?? 0}</Heading><T style={st.snapshotLabel}>Total reps</T></View>
              <View><Heading style={st.snapshotValue}>{record?.matches ?? 0}</Heading><T style={st.snapshotLabel}>Sessions</T></View>
              <View><Heading style={st.snapshotValue}>+12%</Heading><T style={st.snapshotLabel}>This week</T></View>
            </View>
          )}
        </View>
        <View style={st.section}>
          <View style={st.rankingHeader}>
            <Icon name="podium-outline" size={27} color={C.blue} />
            <View style={{ flex: 1, gap: 3 }}>
              <T style={st.rankingTitle}>Community rankings</T>
            </View>
          </View>
          <RepLeaderboard navigation={navigation} embedded />
        </View>
      </View>
    </Page>
  );
}

const st = themed(() =>
  StyleSheet.create({
    wrap: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 20 },
    bar: { ...S.between, paddingTop: 16, paddingBottom: 32, gap: 12, flexWrap: 'wrap' },
    intro: { marginBottom: 48, gap: 14 },
    hero: { fontFamily: 'DisplayItalic', fontSize: 56, lineHeight: 57, letterSpacing: -1.2, maxWidth: 400 },
    subtitle: { fontSize: 13, lineHeight: 21 },
    arena: {
      backgroundColor: C.panel,
      borderColor: C.line,
      borderWidth: 1,
      borderRadius: 24,
      padding: 12,
      overflow: 'hidden',
    },
    challengeHeading: { alignItems: 'center', gap: 5, marginTop: 2 },
    cameraLabel: { fontSize: 11, letterSpacing: 3, color: '#AAB7CC' },
    playTitle: { fontFamily: 'DisplayItalic', fontSize: 28, lineHeight: 32, marginTop: 2 },
    challengeCopy: { fontSize: 14, lineHeight: 20, color: '#B1BDD0' },
    challengeArt: { height: 140, alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
    ringOuter: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 1, borderColor: '#168BFF2B' },
    ringMid: { position: 'absolute', width: 122, height: 122, borderRadius: 61, borderWidth: 1, borderColor: '#168BFF52' },
    ringInner: { position: 'absolute', width: 106, height: 106, borderRadius: 53, backgroundColor: '#168BFF1C', borderWidth: 2, borderColor: C.blue, boxShadow: '0 0 30px #168BFF88' },
    cameraRing: { width: 106, height: 106, borderRadius: 53, alignItems: 'center', justifyContent: 'center' },
    sectionHeading: { fontFamily: 'InterBold', fontSize: 16, lineHeight: 22, color: C.white },
    sectionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
    progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel },
    rankingTitle: { fontFamily: 'Display', fontSize: 28, lineHeight: 32, color: C.white },
    rankingHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    skeletonValue: { width: '65%', height: 28, borderRadius: 7, backgroundColor: C.panel2 },
    skeletonLabel: { width: '85%', height: 8, marginTop: 9, borderRadius: 4, backgroundColor: C.panel2 },
    detail: { fontSize: 11, lineHeight: 17, color: C.gray },
    live: { fontSize: 10, color: C.blue, fontFamily: 'InterBold' },
    exerciseRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 2, marginBottom: 8 },
    exercise: {
      width: 120,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: '#181E27',
      borderWidth: 1,
      borderColor: C.line,
      borderRadius: 40,
      paddingHorizontal: 8,
    },
    exerciseOn: { backgroundColor: C.white },
    exerciseText: { fontSize: 12, fontFamily: 'InterBold', color: C.white },
    modeRow: { flexDirection: 'row', gap: 10, marginTop: 0 },
    mode: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      minHeight: 44,
      paddingVertical: 6,
      paddingHorizontal: 2,
      borderRadius: 14,
      backgroundColor: '#181E27',
      borderWidth: 1,
      borderColor: C.line,
      gap: 6,
    },
    modeOn: { backgroundColor: C.blue, borderColor: C.blue },
    modeTitle: { fontFamily: 'Display', fontSize: 18, lineHeight: 22 },
    onBlue: { color: '#FFFFFF' },
    startButton: { alignSelf: 'center', width: 88, maxWidth: '100%', paddingHorizontal: 12, marginTop: 10, boxShadow: '0 12px 30px #168BFF80' },
    matchNote: { fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 10 },
    tipsToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, marginTop: 2, paddingHorizontal: 4 },
    tips: { borderTopWidth: 1, borderColor: C.line, paddingTop: 12, gap: 9 },
    section: { marginTop: 24 },
    signIn: { backgroundColor: C.white, padding: 18, borderRadius: 12, marginTop: 10 },
    signInTitle: { color: C.black, fontSize: 25, lineHeight: 29, marginTop: 12 },
    signInCopy: { color: C.black, opacity: 0.7, fontSize: 12, lineHeight: 19, marginTop: 5 },
    signInAction: { ...S.between, minHeight: 44, marginTop: 10, gap: 8 },
    record: {
      backgroundColor: C.panel,
      borderRadius: 16,
      padding: 16,
      marginTop: 10,
      gap: 12,
      borderWidth: 1,
      borderColor: C.line,
    },
    scores: { flexDirection: 'row', gap: 8 },
    score: { flex: 1, minWidth: 0 },
    scoreValue: { color: C.blue, fontSize: 30, lineHeight: 36 },
    scoreLabel: { fontSize: 9, lineHeight: 14 },
    soloRecord: { borderTopWidth: 1, borderColor: C.line, paddingTop: 14, gap: 10 },
    progressSnapshot: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 14, paddingHorizontal: 4 },
    snapshotValue: { fontFamily: 'Display', color: C.white, fontSize: 27, lineHeight: 30, textAlign: 'center' },
    snapshotLabel: { color: C.gray, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  }),
);
