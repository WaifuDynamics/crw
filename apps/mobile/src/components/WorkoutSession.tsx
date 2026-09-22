import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { currentPace, distance, duration, elapsed, pace, Run } from '../tracking/model';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  ActivityId,
  activityById,
  activityLabel,
  activityOf,
  GROUP_NAMES,
  MORE_ACTIVITIES,
  PRIMARY_ACTIVITIES,
  speedKmh,
  workoutCalories,
} from '../tracking/activities';
import { useTranslation } from '../translations';
import { C, Heading, Icon, S, T, Tap } from '../ui';
import { isLight, themed, tint } from '../theme';
import Logo from './Logo';
import { CLAY, ClayButton, ClayTag, Slab, Well, clay, well } from './clay';
import LiveMap from './LiveMap';
import RunMap from './RunMap';

// The live map leads into a single floating metrics and controls panel.

const buzz = (style: 'light' | 'medium' | 'heavy' | 'success') => {
  if (Platform.OS === 'web') return;
  if (style === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else
    void Haptics.impactAsync(
      style === 'light'
        ? Haptics.ImpactFeedbackStyle.Light
        : style === 'medium'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Heavy,
    );
};

/** A button that fills up while held and fires when full. Releasing early drains it. */
export function HoldButton({
  label,
  holdingLabel = 'Keep holding…',
  icon,
  onConfirm,
  duration: holdMs = 1500,
  disabled = false,
}: {
  label: string;
  holdingLabel?: string;
  icon?: string;
  onConfirm: () => void;
  duration?: number;
  disabled?: boolean;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const [width, setWidth] = useState(0);

  const press = () => {
    if (disabled) return;
    setHolding(true);
    buzz('light');
    Animated.timing(progress, {
      toValue: 1,
      duration: holdMs,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      buzz('heavy');
      setHolding(false);
      progress.setValue(0);
      onConfirm();
    });
  };
  const release = () => {
    setHolding(false);
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  };

  // A well pressed into the page that fills with red clay as it is held.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Press and hold.`}
      accessibilityHint="Hold for a moment to confirm"
      // Screen readers cannot hold: a double tap confirms straight away.
      onAccessibilityTap={onConfirm}
      disabled={disabled}
      onPressIn={press}
      onPressOut={release}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[well('dark'), st.hold, disabled && { opacity: 0.5 }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          clay('red', 0.7),
          st.holdFill,
          {
            width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, width] }),
          },
        ]}
      />
      <View style={st.holdContent} pointerEvents="none">
        {icon ? (
          <Icon name={icon} size={16} color={holding ? CLAY.red.ink : tint('#FF7A7F')} />
        ) : null}
        <T style={[st.holdText, holding && { color: CLAY.red.ink }]}>
          {holding ? holdingLabel : label}
        </T>
      </View>
    </Pressable>
  );
}

/** The sheet that opens from Start: pick what you are about to do. */
export function ActivityPicker({
  last,
  onPick,
  onClose,
}: {
  last?: ActivityId | null;
  onPick: (id: ActivityId) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [browsing, setBrowsing] = useState(false);
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(rise, { toValue: 1, speed: 16, bounciness: 4, useNativeDriver: true }).start();
  }, []);
  return (
    <View style={st.sheetWrap} accessibilityViewIsModal>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={st.backdrop}
        onPress={onClose}
      />
      {browsing && <ActivityList last={last} onPick={onPick} onBack={() => setBrowsing(false)} />}
      <Animated.View
        style={[
          st.sheet,
          browsing && { display: 'none' },
          {
            transform: [
              { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) },
            ],
          },
        ]}
      >
        <View style={st.grabber} />
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <Heading style={st.sheetTitle}>{t('tracking.chooseActivity')}</Heading>
        <T style={st.sheetSub}>{t('tracking.chooseActivitySub')}</T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tracking.activities.running')}
          onPress={() => { buzz('light'); onPick('running'); }}
          style={({ pressed }) => [st.runningHero, pressed && { opacity: 0.85 }]}
        >
          <View style={st.runningArt}>
            <MaterialCommunityIcons name="run-fast" size={86} color="#29AEFF" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={st.popularBadge}><T style={st.popularText}>{last === 'running' ? t('tracking.lastUsed').toUpperCase() : 'POPULAR'}</T></View>
            <T style={st.runningTitle}>{t('tracking.activities.running')}</T>
            <T style={st.runningHint}>{t('tracking.activityHints.running')}</T>
          </View>
          <Icon name="chevron-forward" size={23} color="#91A0B5" />
        </Pressable>
        <View style={st.grid}>
          {PRIMARY_ACTIVITIES.filter((a) => a.id !== 'running').map((a) => {
            const isLast = a.id === last;
            return (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={t(`tracking.activities.${a.id}`)}
                onPress={() => {
                  buzz('light');
                  onPick(a.id);
                }}
                style={({ pressed }) => [
                  st.option,
                  isLast && st.optionLast,
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
              >
                <View style={st.activityTileIcon}>
                  <MaterialCommunityIcons
                    name={a.icon as any}
                    size={34}
                    color="#29AEFF"
                  />
                </View>
                <T style={st.activityTileTitle}>{t(`tracking.activities.${a.id}`)}</T>
                <T style={st.activityTileHint}>
                  {t(`tracking.activityHints.${a.id}`)}
                </T>
                {isLast && <T style={st.optionBadge}>{t('tracking.lastUsed').toUpperCase()}</T>}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'More workouts'}
          onPress={() => {
            buzz('light');
            setBrowsing(true);
          }}
          style={({ pressed }) => [st.moreButton, pressed && { opacity: 0.8 }]}
        >
          <MaterialCommunityIcons name="view-grid-plus-outline" size={20} color="#4FA8FF" />
          <T style={st.moreButtonText}>{'More workouts'}</T>
          <T style={st.moreButtonCount}>{MORE_ACTIVITIES.length}</T>
          <Icon name="chevron-forward" size={21} color={C.gray} />
        </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/** Everything that is not one of the four, searchable and grouped. */
function ActivityList({
  last,
  onPick,
  onBack,
}: {
  last?: ActivityId | null;
  onPick: (id: ActivityId) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const found = MORE_ACTIVITIES.filter(
    (a) => !needle || `${a.name} ${activityLabel(a, t)}`.toLowerCase().includes(needle),
  );
  const groups = (['outdoors', 'gym', 'sports', 'water', 'snow'] as const)
    .map((group) => ({ group, items: found.filter((a) => a.group === group) }))
    .filter((g) => g.items.length);

  return (
    <View style={[st.sheet, { maxHeight: '86%' }]}>
      <View style={st.grabber} />
      <View style={[S.row, { gap: 12, alignItems: 'center', marginBottom: 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Back'}
          onPress={onBack}
          style={st.listBack}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color={C.white} />
        </Pressable>
        <Heading style={{ fontFamily: 'DisplayItalic', fontSize: 28, flex: 1 }}>
          {'More workouts'.toUpperCase()}
        </Heading>
      </View>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={'Search workouts'}
        placeholderTextColor={C.gray}
        style={st.listSearch}
        autoCorrect={false}
      />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {groups.map(({ group, items }) => (
          <View key={group} style={{ marginBottom: 6 }}>
            <T style={st.listGroup}>{GROUP_NAMES[group].toUpperCase()}</T>
            {items.map((a) => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={activityLabel(a, t)}
                onPress={() => {
                  buzz('light');
                  onPick(a.id);
                }}
                style={({ pressed }) => [
                  st.listRow,
                  a.id === last && { borderColor: '#168BFF' },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View style={st.listIcon}>
                  <MaterialCommunityIcons name={a.icon as any} size={22} color="#4FA8FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <T style={st.listTitle}>{activityLabel(a, t)}</T>
                  <T style={st.listHint}>
                    {a.tracksDistance
                      ? 'Distance and pace from GPS'
                      : 'Timed, calories from effort'}
                  </T>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={C.gray} />
              </Pressable>
            ))}
          </View>
        ))}
        {!groups.length && <T style={{ fontSize: 12, marginTop: 20 }}>{'Nothing matches that.'}</T>}
      </ScrollView>
    </View>
  );
}

/** Full-screen 3 · 2 · 1 · GO before a workout starts. */
/**
 * The three seconds between picking an activity and recording it. The tracking page stays
 * visible under a scrim, and the count sits on the same blue hero slab the dashboard uses,
 * so the picker, the countdown and the session read as one surface.
 */
export function Countdown({
  onDone,
  kind,
  from = 3,
}: {
  onDone: () => void;
  kind?: ActivityId | null;
  from?: number;
}) {
  const { t } = useTranslation();
  const [n, setN] = useState(from);
  const scale = useRef(new Animated.Value(0.6)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;
  const activity = kind ? activityById(kind) : null;

  // The card itself only arrives once; the number inside it springs on every tick.
  useEffect(() => {
    Animated.spring(rise, { toValue: 1, speed: 16, bounciness: 5, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    let reduced = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => (reduced = r));
    scale.setValue(reduced ? 1 : 0.55);
    fade.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, speed: 18, bounciness: 9, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
    buzz(n > 0 ? 'medium' : 'success');
    if (n > 0) AccessibilityInfo.announceForAccessibility?.(String(n));
    const t = setTimeout(() => (n > 0 ? setN(n - 1) : done.current()), n > 0 ? 1000 : 650);
    return () => clearTimeout(t);
  }, [n]);

  const go = n === 0;
  return (
    <View style={st.countdown} accessibilityViewIsModal accessibilityLiveRegion="assertive">
      <View style={st.backdrop} />
      <Animated.View
        style={{
          opacity: rise,
          transform: [
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
          ],
        }}
      >
        <Slab tone="blue" radius={34} style={st.countdownCard}>
          {activity ? (
            <View style={st.countdownTag}>
              <ClayTag text={t(`tracking.activities.${activity.id}`).toUpperCase()} tone="cream" />
            </View>
          ) : null}
          <Well tone="blue" radius={90} style={st.countdownWell}>
            <Animated.View style={{ transform: [{ scale }], opacity: fade }}>
              <Heading style={[st.countdownNumber, go && st.countdownGo]}>{go ? 'GO' : n}</Heading>
            </Animated.View>
          </Well>
          <T style={st.countdownLabel}>{go ? 'LET’S GO' : 'GET READY'}</T>
          <View style={st.countdownDots}>
            {Array.from({ length: from }, (_, i) => {
              const lit = from - n > i;
              return (
                <View
                  key={i}
                  style={[
                    lit ? clay('cream', 0.6) : well('blue'),
                    st.countdownDot,
                    lit && st.countdownDotLit,
                  ]}
                />
              );
            })}
          </View>
        </Slab>
      </Animated.View>
    </View>
  );
}

/** Speed over the last 20 seconds of fixes, like currentPace but in km/h. */
function liveSpeed(run: Run, now: number) {
  if (run.status !== 'running') return '—';
  const pts = run.points.filter((p) => p.segment === run.segment && now - p.timestamp < 20000);
  if (pts.length < 2 || now - pts[pts.length - 1].timestamp > 10000) return '—';
  let meters = 0;
  for (let i = 1; i < pts.length; i++) meters += distance(pts[i - 1], pts[i]);
  return speedKmh(meters, (pts[pts.length - 1].timestamp - pts[0].timestamp) / 1000);
}

/** Compact metrics share the session's single floating control panel. */
function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={st.stat}>
      <T numberOfLines={1} adjustsFontSizeToFit style={st.statLabel}>{label}</T>
      <T numberOfLines={1} adjustsFontSizeToFit style={st.statValue}>{value}</T>
      {unit ? <T style={st.statUnit}>{unit}</T> : null}
    </View>
  );
}

export default function WorkoutSession({
  run,
  now,
  busy,
  weightKg,
  onPause,
  onResume,
  onFinish,
}: {
  run: Run;
  now: number;
  busy: boolean;
  weightKg?: number | null;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
}) {
  const { height, width } = useWindowDimensions();
  const compact = width < 370;
  const running = run.status === 'running';
  const seconds = elapsed(run, now);
  const { t } = useTranslation();
  const kind = activityOf(run);
  const distanceText = (run.meters / 1000).toFixed(2);
  const timeText = duration(seconds);
  const mapHeight = Math.max(250, height - (compact ? 442 : 426));
  const lastFix = run.points[run.points.length - 1];
  const gpsConnected = !!lastFix && now - lastFix.timestamp < 20000;

  return (
    <View style={st.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.page}>
        <View style={[st.mapStage, { height: mapHeight }]}>
          {!kind.tracksDistance ? (
            <View style={st.indoor}>
              <MaterialCommunityIcons name={kind.icon as any} size={84} color="#168BFF" />
              <T style={st.indoorName}>{activityLabel(kind, t).toUpperCase()}</T>
            </View>
          ) : run.points.length ? <RunMap points={run.points} /> : <LiveMap height={mapHeight} />}
          <View pointerEvents="box-none" style={st.header}>
            <Logo height={compact ? 34 : 40} />
            <Slab radius={28} style={st.timer}>
              <T style={st.timerLabel}>TIME</T>
              <T numberOfLines={1} adjustsFontSizeToFit style={st.heroClock}>{timeText}</T>
            </Slab>
          </View>
        </View>

        <Slab radius={34} style={st.panel}>
          <T style={st.heroLabel}>{kind.tracksDistance ? t('tracking.distance').toUpperCase() : 'TIME'}</T>
          <T numberOfLines={1} adjustsFontSizeToFit style={[st.heroValue, compact && st.heroValueCompact]}>
            {kind.tracksDistance ? distanceText : timeText}
            {kind.tracksDistance ? <T style={st.heroUnit}> km</T> : null}
          </T>
          <View style={st.divider} />
          <View style={st.stats}>
            {kind.tracksDistance && <>
              <Stat label={kind.showSpeed ? t('tracking.speed').toUpperCase() : t('tracking.pace').toUpperCase()}
                value={kind.showSpeed ? liveSpeed(run, now) : currentPace(run, now)} unit={kind.showSpeed ? 'km/h' : '/km'} />
              <View style={st.statDivider} />
              <Stat label={kind.showSpeed ? t('tracking.avgSpeed').toUpperCase() : t('tracking.avgPace').toUpperCase()}
                value={kind.showSpeed ? speedKmh(run.meters, seconds) : pace(run.meters, seconds)} unit={kind.showSpeed ? 'km/h' : '/km'} />
              <View style={st.statDivider} />
            </>}
            <Stat label="CALORIES" value={String(run.calories ?? workoutCalories({ ...run, seconds }, weightKg))} unit="kcal" />
          </View>
          <View style={st.status}>
            <View style={[st.statusDot, { backgroundColor: !running ? '#FFBF69' : !kind.tracksDistance || gpsConnected ? '#3BF46B' : '#FFBF69' }]} />
            <View style={{ flex: 1 }}>
              <T style={st.statusText}>{!running ? 'Workout paused' : !kind.tracksDistance ? 'Recording workout' : gpsConnected ? 'GPS connected' : 'Waiting for GPS'}</T>
              <T style={st.hint}>{!running ? 'Tap Resume when you?re ready.' : Platform.OS === 'web' ? 'Keep CRW+ open - switching apps pauses the run.' : kind.tracksDistance && !gpsConnected ? 'Step outside for a precise signal. The clock is running.' : 'You?re recording. Keep going.'}</T>
            </View>
          </View>
          <View style={st.controls}>
            <Tap label={running ? 'Pause workout' : 'Resume workout'} disabled={busy}
              onPress={() => { buzz('medium'); (running ? onPause : onResume)(); }} style={[clay('blue', 0.9), st.round]}>
              <Icon name={running ? 'pause' : 'play'} size={30} color={CLAY.blue.ink} />
            </Tap>
            <View style={st.finish}>
              <ClayButton title="Finish" tone="cream" icon="flag" size="large" style={{ minHeight: 70 }} disabled={busy}
                onPress={() => { buzz('success'); onFinish(); }} />
            </View>
          </View>
          <View style={st.handle} />
        </Slab>
      </ScrollView>
    </View>
  );
}

const st = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    page: { flexGrow: 1, width: '100%', maxWidth: 480, alignSelf: 'center', paddingBottom: 8 },
    mapStage: { width: '100%', overflow: 'hidden', backgroundColor: C.bg },
    header: { position: 'absolute', top: 20, left: 20, right: 20, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 1100 },
    timer: { width: 150, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
    timerLabel: { fontFamily: 'InterBold', fontSize: 11, letterSpacing: 1.2, color: C.gray },
    heroClock: { fontFamily: 'Display', fontSize: 46, lineHeight: 50, color: C.white, letterSpacing: 0 },
    panel: { marginHorizontal: 9, marginTop: 0, padding: 20, paddingTop: 19, paddingBottom: 12, zIndex: 1200 },
    heroLabel: { fontFamily: 'InterSemi', fontSize: 12, lineHeight: 17, letterSpacing: 1.2, color: C.gray },
    heroValue: { fontFamily: 'Display', fontSize: 84, lineHeight: 88, color: C.white, letterSpacing: 0 },
    heroValueCompact: { fontSize: 70, lineHeight: 76 },
    heroUnit: { fontFamily: 'Display', fontSize: 38, color: C.blue },
    divider: { height: 1.5, backgroundColor: C.line, marginTop: 10, marginBottom: 18 },
    stats: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
    stat: { flex: 1, minWidth: 0 },
    statDivider: { width: 1, backgroundColor: C.line },
    statLabel: { fontFamily: 'InterSemi', fontSize: 10, lineHeight: 14, color: C.gray },
    statValue: { fontFamily: 'Display', fontSize: 37, lineHeight: 41, color: C.white, letterSpacing: 0 },
    statUnit: { fontFamily: 'Inter', fontSize: 15, lineHeight: 20, color: C.gray },
    status: { flexDirection: 'row', gap: 10, marginTop: 22, marginBottom: 20 },
    statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    statusText: { fontFamily: 'InterSemi', fontSize: 12, lineHeight: 18, color: C.white },
    hint: { fontSize: 10.5, lineHeight: 16, marginTop: 3, color: C.gray },
    controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    round: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
    finish: { flex: 1, minWidth: 0 },
    handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 14, backgroundColor: C.line },
    hold: { height: 54, borderRadius: 27, overflow: 'hidden', justifyContent: 'center' },
    holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 27 },
    holdContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    holdText: {
      fontFamily: 'InterBold',
      fontSize: 13,
      lineHeight: 18,
      color: tint('#FF7A7F'),
      letterSpacing: 0.2,
    },
    sheetWrap: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 4000,
      justifyContent: 'flex-end',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(3,4,5,0.6)',
    },
    sheet: {
      maxHeight: '90%',
      backgroundColor: C.bg,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      borderWidth: 1,
      borderColor: C.line,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 30,
    },
    grabber: {
      alignSelf: 'center',
      width: 42,
      height: 5,
      borderRadius: 3,
      backgroundColor: C.line,
      marginBottom: 16,
    },
    sheetTitle: { fontFamily: 'DisplayItalic', fontSize: 36, lineHeight: 38 },
    sheetSub: { fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 16 },
    runningHero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 154, marginBottom: 10, borderRadius: 22, borderWidth: 1.5, borderColor: '#176AC0', backgroundColor: isLight() ? '#E3F1FF' : '#061D33' },
    runningArt: { width: 92, height: 104, alignItems: 'center', justifyContent: 'center', borderRadius: 52, backgroundColor: isLight() ? '#CEE7FF' : '#082642' },
    popularBadge: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#1975D2', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: isLight() ? '#D0E9FF' : '#0C3157' },
    popularText: { fontFamily: 'InterBold', fontSize: 9, color: isLight() ? '#0066AB' : '#39C8FF', letterSpacing: 0.6 },
    runningTitle: { fontFamily: 'DisplayItalic', fontSize: 37, lineHeight: 43, color: C.white, marginTop: 5 },
    runningHint: { fontSize: 12, lineHeight: 18, color: C.gray },
    activityTileIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: isLight() ? '#D9EDFF' : '#082A49', marginBottom: 4 },
    activityTileTitle: { fontFamily: 'Display', fontSize: 23, lineHeight: 28, color: C.white },
    activityTileHint: { fontSize: 11, lineHeight: 16, color: C.gray },
    grid: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
    option: {
      flex: 1,
      minWidth: 0,
      minHeight: 160,
      padding: 10,
      borderRadius: 18,
      backgroundColor: C.panel,
      borderWidth: 1,
      borderColor: C.line,
      gap: 6,
    },
    optionLast: { borderColor: '#168BFF', borderWidth: 2 },
    indoor: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      backgroundColor: isLight() ? '#E8EFF9' : '#0B1622',
    },
    indoorName: {
      fontFamily: 'Display',
      fontSize: 26,
      letterSpacing: 1,
      color: C.white,
    },
    moreButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 12,
      paddingVertical: 16,
      paddingHorizontal: 18,
      borderRadius: 20,
      backgroundColor: C.panel,
      borderWidth: 1,
      borderColor: C.line,
    },
    moreButtonText: { flex: 1, fontFamily: 'InterBold', fontSize: 15, color: C.white },
    moreButtonCount: { fontFamily: 'InterBold', fontSize: 13, color: C.gray },
    listBack: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.panel,
    },
    listSearch: {
      height: 46,
      borderRadius: 14,
      paddingHorizontal: 16,
      marginBottom: 14,
      backgroundColor: C.panel,
      borderWidth: 1,
      borderColor: C.line,
      color: C.white,
      fontFamily: 'Inter',
      fontSize: 14,
    },
    listGroup: {
      fontFamily: 'InterBold',
      fontSize: 9,
      letterSpacing: 1.4,
      color: C.gray,
      marginTop: 12,
      marginBottom: 8,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      marginBottom: 8,
      borderRadius: 16,
      backgroundColor: C.panel,
      borderWidth: 1,
      borderColor: C.line,
    },
    listIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isLight() ? '#E3EEFB' : '#0C2949',
    },
    listTitle: { fontFamily: 'InterBold', fontSize: 14, color: C.white },
    listHint: { fontSize: 11, marginTop: 2 },
    optionIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isLight() ? '#E3EEFB' : '#0C2949',
      marginBottom: 4,
    },
    optionTitle: { fontFamily: 'Display', fontSize: 24, lineHeight: 26, color: C.white },
    optionHint: { fontSize: 11, lineHeight: 15 },
    optionBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
      fontFamily: 'InterBold',
      fontSize: 8,
      letterSpacing: 1,
      color: '#4FA8FF',
    },
    countdown: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 5000,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    // The hero slab from the dashboard, holding the count instead of the start button.
    countdownCard: {
      width: '100%',
      maxWidth: 340,
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 26,
    },
    countdownTag: { marginBottom: 20 },
    countdownWell: {
      width: 180,
      height: 180,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countdownNumber: {
      fontFamily: 'DisplayItalic',
      fontSize: 132,
      lineHeight: 150,
      color: CLAY.blue.ink,
      textAlign: 'center',
    },
    countdownGo: { fontSize: 76, lineHeight: 150, color: '#A9F06A' },
    countdownLabel: {
      fontFamily: 'InterBold',
      fontSize: 12,
      letterSpacing: 3,
      color: CLAY.blue.soft,
      marginTop: 18,
    },
    countdownDots: { flexDirection: 'row', gap: 8, marginTop: 22 },
    countdownDot: { width: 10, height: 10, borderRadius: 5 },
    countdownDotLit: { width: 26 },
  }),
);
