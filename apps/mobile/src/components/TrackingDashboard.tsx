import PageBrand from './PageBrand';
import { tint, themed } from '../theme';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { C, Heading, Icon, S, T, Tap } from '../ui';
import { DOCK_SPACE } from '../layout';
import { duration, Health, pace, Run, workoutTitle } from '../tracking/model';
import RunRoute from './RunRoute';
import { CLAY, ClayIconButton, ClayTag, Slab, Well, clay } from './clay';
import { ClayFlame, ClayHeart, ClayShoe, ClaySteps, ClayWatch } from './ClayArt';
import { useTranslation } from '../translations';

type Props = {
  now: number;
  days: { date: Date; meters: number }[];
  runs: Run[];
  health: Health | null;
  busy: boolean;
  loaded: boolean;
  all: boolean;
  onStart: () => void;
  onConnect: () => void;
  onSelect: (run: Run) => void;
  onPhoto: (run: Run) => void;
  /** Shown at the right end of the header, after the camera button (the profile). */
  headerRight?: React.ReactNode;
  onToggleAll: () => void;
  /** Pull-to-refresh: pull the latest from the health app. */
  onRefresh?: () => Promise<unknown> | void;
  /** The run in progress. Replaces the start section while a run is active. */
  children?: React.ReactNode;
};

function Section({ title, detail }: { title: string; detail?: React.ReactNode }) {
  return (
    <View style={st.sectionHeading}>
      <T style={st.sectionTitle}>{title}</T>
      {detail}
    </View>
  );
}

const dayName = (d: Date) => d.toLocaleDateString('en', { weekday: 'short' });

export default function TrackingDashboard(p: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => {
    if (!p.onRefresh) return;
    setRefreshing(true);
    try {
      await p.onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  const compact = width < 370;
  const meters = p.days.reduce((sum, d) => sum + d.meters, 0);
  const week = p.runs.filter((r) => r.startedAt >= +p.days[0].date && r.startedAt <= p.now);
  const seconds = week.reduce((sum, r) => sum + r.seconds, 0);
  const distanceText = (meters / 1000).toFixed(2);
  const timeText = duration(seconds);
  const paceText = pace(meters, seconds);
  const peak = Math.max(1, ...p.days.map((d) => d.meters));
  const healthMetrics = [
    {
      art: <ClaySteps size={compact ? 34 : 40} />,
      label: t('tracking.steps'),
      value: p.health?.steps,
      unit: 'today',
      color: CLAY.blue.hi,
    },
    {
      art: <ClayFlame size={compact ? 34 : 40} />,
      label: t('tracking.calories'),
      value: p.health?.calories,
      unit: 'active kcal',
      color: CLAY.ember.hi,
    },
    {
      art: <ClayHeart size={compact ? 34 : 40} />,
      label: t('tracking.heartRate'),
      value: p.health?.heartRate,
      unit: 'avg bpm',
      color: CLAY.coral.hi,
    },
  ];
  const visibleRuns = p.all ? p.runs : p.runs.slice(0, 3);
  const title = t('tracking.title');
  const titleParts = title.match(/^([\s\S]*\s)(\S+)$/u);

  return (
    <ScrollView
      testID="tracking-dashboard"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={st.page}
      refreshControl={
        p.onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={doRefresh}
            tintColor={C.gray}
            colors={[C.blue]}
          />
        ) : undefined
      }
    >
      <View style={st.header}>
        <PageBrand title="TRACKING" />
        <View style={[S.row, { gap: 10 }]}>
          <ClayIconButton
            icon="camera-outline"
            label="Open the run camera"
            disabled={!p.runs.length}
            onPress={() => p.runs.length && p.onPhoto(p.runs[0])}
          />
          {p.headerRight}
        </View>
      </View>
      <Heading style={st.title}>
        {titleParts ? (
          <>
            {titleParts[1]}
            <T style={st.titleAccent}>{titleParts[2]}</T>
          </>
        ) : (
          title
        )}
      </Heading>

      {p.children || (
        <View testID="tracking-hero" style={st.hero}>
          <Image
            source={require('../../assets/tracking-hero.png')}
            style={st.heroBackground}
            resizeMode="stretch"
            accessible={false}
          />
          <View style={[st.heroScene, compact && st.heroSceneCompact]}>
            <View style={st.heroCopy}>
              <Heading style={[st.heroTitle, compact && st.heroTitleCompact]}>
                {t('tracking.readyWhenYouAre')}
              </Heading>
              <T style={[st.intro, compact && st.introCompact]}>{t('tracking.heroSub')}</T>
            </View>
          </View>
          <Tap
            label={
              p.busy
                ? t('tracking.gettingReady')
                : !p.loaded
                  ? t('tracking.loadingRuns')
                  : t('tracking.startRun')
            }
            disabled={p.busy || !p.loaded}
            onPress={p.onStart}
            style={st.heroButton}
          >
            <T style={st.heroButtonText}>
              {p.busy
                ? t('tracking.gettingReady')
                : !p.loaded
                  ? t('tracking.loadingRuns')
                  : t('tracking.startRun')}
            </T>
            {p.busy || !p.loaded ? (
              <ActivityIndicator color="#192334" />
            ) : (
              <Icon name="arrow-forward" size={25} color="#192334" />
            )}
          </Tap>
        </View>
      )}

      <View style={st.section}>
        <Section
          title={t('tracking.thisWeek')}
          detail={
            <ClayTag text={`${week.length} ${week.length === 1 ? 'RUN' : 'RUNS'} · 7 DAYS`} />
          }
        />
        <View style={st.weekStats}>
          <Slab radius={26} style={[st.stat, st.statWide]}>
            <T style={st.metricLabel}>{t('tracking.distance')}</T>
            <T
              numberOfLines={1}
              style={[st.distance, { fontSize: Math.min(50, 170 / distanceText.length) }]}
            >
              {distanceText}
            </T>
            <T style={st.detail}>{t('tracking.kilometers')}</T>
          </Slab>
          <View style={[st.stat, { gap: 12 }]}>
            <Slab radius={26} style={st.statSmall}>
              <T style={st.metricLabel}>{t('tracking.duration')}</T>
              <T
                numberOfLines={1}
                style={[st.statValue, { fontSize: Math.min(26, 115 / timeText.length) }]}
              >
                {timeText}
              </T>
            </Slab>
            <Slab radius={26} style={st.statSmall}>
              <T style={st.metricLabel}>{t('tracking.avgPace')}</T>
              <T
                numberOfLines={1}
                style={[st.statValue, { fontSize: Math.min(26, 115 / paceText.length) }]}
              >
                {paceText}
                <T style={st.unit}> /km</T>
              </T>
            </Slab>
          </View>
        </View>
        <Slab radius={26} style={st.chartCard}>
          <View accessibilityLabel="Running distance over the last seven days" style={st.chart}>
            {p.days.map((d, i) => {
              const h = d.meters > 0 ? Math.max(14, 64 * (d.meters / peak)) : 8;
              const today = i === 6;
              return (
                <View
                  key={+d.date}
                  accessible
                  accessibilityLabel={`${d.date.toLocaleDateString('en', { weekday: 'long' })}: ${(d.meters / 1000).toFixed(2)} kilometres`}
                  style={st.day}
                >
                  <View style={st.barTrack}>
                    <View
                      style={[
                        d.meters > 0 ? clay(today ? 'lime' : 'blue', 0.6) : st.emptyBar,
                        { height: h, width: '100%', borderRadius: 9 },
                      ]}
                    />
                  </View>
                  <T style={[st.dayLabel, today && st.dayLabelToday]}>{dayName(d.date)}</T>
                </View>
              );
            })}
          </View>
          {!week.length && <T style={st.chartNote}>Your first run will appear here.</T>}
        </Slab>
      </View>

      <View style={st.section}>
        <Section
          title={t('tracking.todayHealth')}
          detail={
            <ClayTag
              text={p.health ? 'SYNCED TODAY' : 'NOT CONNECTED'}
              tone={p.health ? 'lime' : 'graphite'}
              icon={p.health ? 'checkmark' : undefined}
            />
          }
        />
        <View style={st.healthMetrics}>
          {healthMetrics.map((m) => (
            <Slab key={m.label} radius={26} style={st.healthMetric}>
              <View style={st.healthArt}>{m.art}</View>
              <T
                numberOfLines={1}
                style={[
                  st.healthValue,
                  {
                    color: m.value == null ? C.gray : m.color,
                    fontSize: Math.min(
                      30,
                      120 / (m.value == null ? 2 : Math.round(m.value).toLocaleString().length),
                    ),
                  },
                ]}
              >
                {m.value == null ? '—' : Math.round(m.value).toLocaleString()}
              </T>
              <T style={st.healthLabel}>{m.label}</T>
              <T style={st.detailTiny}>{m.unit}</T>
            </Slab>
          ))}
        </View>
        <Tap
          label={t('tracking.connectWatch')}
          onPress={p.onConnect}
          style={[clay('navy'), st.connectRow]}
        >
          <View style={st.connectArt}>
            <ClayWatch width={40} height={53} />
          </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={st.connectTitle}>
                {p.health ? p.health.source : t('tracking.connectWatch')}
              </T>
              <T style={st.detail}>
                {p.health
                  ? `Updated ${new Date(p.health.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Apple Health or Health Connect'}
              </T>
            </View>
            <View style={[clay('blue', 0.7), st.arrowBubble]}>
              <Icon name="arrow-forward" size={17} color="#FFFFFF" />
            </View>
        </Tap>
      </View>

      <View style={st.section}>
        <Section
          title={t('tracking.recentWorkouts')}
          detail={
            p.runs.length > 3 ? (
              <Tap
                label={p.all ? t('tracking.showLess') : t('tracking.viewAll')}
                onPress={p.onToggleAll}
                style={st.textButton}
              >
                <ClayTag
                  text={p.all ? t('tracking.showLess') : t('tracking.viewAll')}
                  tone="blue"
                  icon={p.all ? 'chevron-up' : 'arrow-forward'}
                />
              </Tap>
            ) : (
              <ClayTag
                text={`${p.runs.length} ${p.runs.length === 1 ? 'ACTIVITY' : 'ACTIVITIES'}`}
              />
            )
          }
        />
        {!p.loaded ? (
          <Slab radius={26} style={st.empty}>
            <ActivityIndicator color={C.blue} />
            <T style={st.detail}>Loading your runs...</T>
          </Slab>
        ) : !p.runs.length ? (
          <Slab radius={28} style={st.empty}>
            <View style={st.shoeArt}>
              <ClayShoe width={compact ? 84 : 100} height={compact ? 50 : 60} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={st.rowTitle}>Your first run starts here.</T>
              <T style={st.connectDescription}>
                Record a run to see your route, distance and pace.
              </T>
            </View>
          </Slab>
        ) : (
          <View style={{ gap: 12 }}>
            {visibleRuns.map((r) => {
              return (
                <Tap
                  key={r.id}
                  label={`View run ${new Date(r.startedAt).toLocaleDateString()} ${(r.meters / 1000).toFixed(2)} km`}
                  onPress={() => p.onSelect(r)}
                  style={[clay('graphite'), st.historyRow]}
                >
                  <Well radius={18} style={st.routeThumbnail}>
                    {r.points.length > 1 ? (
                      <RunRoute points={r.points} color={C.blue} />
                    ) : (
                      <Icon name="fitness-outline" size={24} color={C.blue} />
                    )}
                  </Well>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={[S.between, { gap: 8 }]}>
                      <T style={[st.rowTitle, { flexShrink: 1 }]}>{workoutTitle(r)}</T>
                      <Icon name="arrow-up-right" size={16} color={C.gray} />
                    </View>
                    <T style={st.detail}>
                      {new Date(r.startedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      · {r.source}
                    </T>
                    <View style={st.runStats}>
                      <T style={st.runDistance}>
                        {(r.meters / 1000).toFixed(2)}
                        <T style={st.detail}> km</T>
                      </T>
                      {r.meters > 0 ? (
                        <>
                          <View style={st.dot} />
                          <T style={st.detail}>{pace(r.meters, r.seconds)} /km</T>
                        </>
                      ) : r.calories != null ? (
                        <>
                          <View style={st.dot} />
                          <T style={st.detail}>{r.calories} kcal</T>
                        </>
                      ) : null}
                      <View style={st.dot} />
                      <T style={st.detail}>{duration(r.seconds)}</T>
                    </View>
                  </View>
                </Tap>
              );
            })}
          </View>
        )}
      </View>
      <View style={st.privacy}>
        <Icon name="lock-closed-outline" color={C.gray} size={11} />
        <T style={st.detail}>Just for you. Saved on this device.</T>
      </View>
    </ScrollView>
  );
}

const st = themed(() =>
  StyleSheet.create({
    page: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: DOCK_SPACE,
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      overflow: 'hidden',
    },
    header: { ...S.between, alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' },
    title: { fontFamily: 'DisplayItalic', fontSize: 58, lineHeight: 56, letterSpacing: 0, marginBottom: 18 },
    titleAccent: {
      fontFamily: 'DisplayItalic',
      fontSize: 58,
      lineHeight: 56,
      letterSpacing: 0,
      color: C.blue,
    },
    hero: {
      padding: 12,
      paddingBottom: 15,
      borderRadius: 28,
      borderWidth: 2,
      borderTopColor: '#4CE5FF',
      borderLeftColor: '#20CFFF',
      borderRightColor: '#20CFFF',
      borderBottomColor: '#0074FF',
      backgroundColor: '#009CFF',
      overflow: 'hidden',
      boxShadow: '0 8px 24px #007AFF28',
    },
    heroBackground: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
    heroScene: { minHeight: 164, justifyContent: 'center', paddingLeft: 7, paddingVertical: 18 },
    heroSceneCompact: { minHeight: 144, paddingLeft: 2, paddingVertical: 12 },
    heroCopy: { width: '52%', gap: 13, alignItems: 'flex-start' },
    heroTitle: { fontSize: 32, lineHeight: 32, letterSpacing: 0, color: '#FFFFFF' },
    heroTitleCompact: { fontSize: 24, lineHeight: 25 },
    intro: {
      fontSize: 13,
      lineHeight: 20,
      letterSpacing: 0.1,
      color: '#E6F5FF',
      fontFamily: 'Inter',
    },
    introCompact: { fontSize: 11, lineHeight: 17 },
    heroButton: {
      minHeight: 48,
      borderRadius: 28,
      paddingHorizontal: 19,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: '#F5F8FC',
      borderWidth: 1,
      borderColor: '#FFFFFF',
      boxShadow: '0 4px 10px #004BC52B, inset 0 2px 4px #FFFFFF',
    },
    heroButtonText: { flex: 1, fontFamily: 'InterBold', fontSize: 14, color: '#192334' },
    section: { marginTop: 30 },
    sectionHeading: {
      ...S.between,
      gap: 8,
      flexWrap: 'wrap',
      marginBottom: 14,
      paddingHorizontal: 4,
    },
    sectionTitle: {
      fontFamily: 'Display',
      fontSize: 27,
      lineHeight: 30,
      color: C.white,
      letterSpacing: 0,
    },
    detail: { fontSize: 11, lineHeight: 17, color: C.gray, letterSpacing: 0 },
    detailTiny: { fontSize: 10, lineHeight: 14, color: C.gray, letterSpacing: 0 },
    metricLabel: { fontSize: 11, lineHeight: 16, color: C.gray, fontFamily: 'InterSemi' },
    weekStats: { flexDirection: 'row', gap: 12 },
    stat: { flex: 1, minWidth: 0 },
    statWide: { padding: 18, justifyContent: 'space-between', gap: 4 },
    statSmall: { padding: 14, paddingVertical: 12, gap: 2 },
    distance: { fontFamily: 'Display', lineHeight: 54, color: tint('#6FB7FF'), letterSpacing: 0 },
    statValue: { fontFamily: 'Display', lineHeight: 30, color: C.white, letterSpacing: 0 },
    unit: { fontFamily: 'Inter', fontSize: 10, color: C.gray },
    chartCard: { marginTop: 12, padding: 16, paddingBottom: 14 },
    chart: { flexDirection: 'row', gap: 6, height: 92, alignItems: 'flex-end' },
    day: { flex: 1, alignItems: 'center', gap: 8 },
    barTrack: { height: 64, width: '62%', maxWidth: 26, justifyContent: 'flex-end' },
    emptyBar: {
      backgroundColor: tint('#0D1015'),
      boxShadow: 'inset 2px 2px 5px #020305E0, inset -1px -1px 3px #2C3440A0',
    },
    dayLabel: { fontSize: 9, lineHeight: 12, fontFamily: 'InterSemi', color: C.gray },
    dayLabelToday: { color: C.green },
    chartNote: { fontSize: 11, lineHeight: 16, color: C.gray, textAlign: 'center', marginTop: 12 },
    healthMetrics: { flexDirection: 'row', gap: 10 },
    healthMetric: {
      flex: 1,
      minWidth: 0,
      padding: 12,
      paddingTop: 14,
      alignItems: 'flex-start',
      gap: 2,
    },
    healthArt: { marginBottom: 8 },
    healthValue: { fontFamily: 'Display', lineHeight: 34, letterSpacing: 0 },
    healthLabel: { fontSize: 11, lineHeight: 15, color: C.white, fontFamily: 'InterSemi' },
    connectRow: {
      ...S.row,
      gap: 12,
      marginTop: 12,
      padding: 14,
      paddingRight: 14,
      borderRadius: 26,
    },
    connectArt: { width: 48, height: 56, alignItems: 'center', justifyContent: 'center' },
    connectTitle: { fontFamily: 'InterSemi', fontSize: 13, lineHeight: 19, color: C.white },
    arrowBubble: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    connectDescription: { fontSize: 12, lineHeight: 18, color: C.gray, marginTop: 4 },
    rowTitle: { color: C.white, fontSize: 14, lineHeight: 20, fontFamily: 'InterSemi' },
    textButton: { minHeight: 36, justifyContent: 'center' },
    empty: { ...S.row, gap: 14, minHeight: 92, padding: 16 },
    shoeArt: { width: 100, alignItems: 'center' },
    historyRow: { ...S.row, gap: 14, padding: 12, paddingRight: 16, borderRadius: 26 },
    routeThumbnail: {
      width: 82,
      height: 64,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 4,
    },
    runStats: { ...S.row, gap: 8, flexWrap: 'wrap', marginTop: 6 },
    runDistance: { fontFamily: 'InterBold', fontSize: 14, color: C.white },
    dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: tint('#3B4452') },
    privacy: { ...S.row, justifyContent: 'center', gap: 6, paddingTop: 28 },
  }),
);
