import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Svg, { Defs, Line, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { activityOf, speedKmh, workoutCalories } from '../tracking/activities';
import { duration, pace, Run, workoutTitle } from '../tracking/model';
import {
  bestSplit,
  SPEED_COLORS,
  speedColor,
  speedProfile,
  topSpeed,
} from '../tracking/routeStats';
import { themed, tint } from '../theme';
import { C, Heading, T } from '../ui';
import { MOBILE_WEB_WIDTH } from '../layout';
import { CLAY, ClayButton, ClayIconButton, ClayTag, Slab, Well, clay } from './clay';
import { ClayShoe } from './ClayArt';
import MapCard, { MAP_RADIUS } from './MapCard';
import MobileModal from './MobileModal';
import RouteMap from './RouteMap';
import { HoldButton } from './WorkoutSession';

// The summary of a saved workout, dressed in the same clay as the tracking dashboard and
// the live session: the route is a well pressed into a slab, the headline numbers sit on
// the blue hero slab, every metric is a puffy slab of its own, and the photo and delete
// controls are the pills used everywhere else.

/** Breathing room between the chart well's rounded corners and the first axis label. */
const CHART_INSET = 10;

/** The activity badge. ClayTag draws Ionicons; activities carry MaterialCommunityIcons. */
function KindTag({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={[clay('blue', 0.55), st.kindTag]}>
      <MaterialCommunityIcons name={icon as any} size={12} color={CLAY.blue.ink} />
      <T style={st.kindTagText}>{label}</T>
    </View>
  );
}

/** A section heading in the voice of the dashboard: a Display title with a tag beside it. */
function Head({ title, detail }: { title: string; detail?: React.ReactNode }) {
  return (
    <View style={st.head}>
      <T style={st.headTitle}>{title}</T>
      {detail}
    </View>
  );
}

type Metric = { label: string; value: string; unit?: string; accent?: string };

/**
 * One metric on a clay slab. An odd metric left over at the end of the grid runs the full
 * width and lays its label and value on one line, so it reads as a row rather than as a
 * half-empty card.
 */
function Tile({ label, value, unit, accent, wide }: Metric & { wide?: boolean }) {
  return (
    <Slab radius={26} style={wide ? [st.tile, st.tileWide] : st.tile}>
      <T style={st.tileLabel}>{label}</T>
      <T
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[st.tileValue, accent ? { color: accent } : null]}
      >
        {value}
        {unit ? <T style={st.tileUnit}> {unit}</T> : null}
      </T>
    </Slab>
  );
}

/** The slow-to-fast key for the route colours, as a small clay pill. */
function SpeedLegend() {
  return (
    <View style={[clay('graphite', 0.55), st.legend]}>
      <T style={st.legendText}>SLOW</T>
      <LinearGradient
        colors={SPEED_COLORS as unknown as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={st.legendBar}
      />
      <T style={st.legendText}>FAST</T>
    </View>
  );
}

/** Speed (or pace) over the distance with the average as a dashed line. */
function ProfileChart({ run, width }: { run: Run; width: number }) {
  const kind = activityOf(run);
  const profile = useMemo(() => speedProfile(run.points), [run.points]);
  if (profile.length < 4) return null;
  const h = 130,
    top = 10,
    bottom = 22;
  const speeds = profile.map((p) => p.speed);
  const max = Math.max(...speeds) * 1.08;
  const min = Math.max(0, Math.min(...speeds) * 0.85);
  const km = profile[profile.length - 1].km;
  const x = (d: number) => (d / km) * width;
  const y = (v: number) => top + (1 - (v - min) / (max - min || 1)) * (h - top - bottom);
  const line = profile
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.speed).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${width},${h - bottom} L0,${h - bottom} Z`;
  const avg = run.seconds > 0 ? run.meters / run.seconds : 0;
  const ticks = km > 12 ? 5 : km > 5 ? 2 : 1;
  const fmt = (v: number) =>
    kind.showSpeed ? `${(v * 3.6).toFixed(0)} km/h` : v > 0 ? duration(1000 / v) : '—';
  return (
    <Slab radius={28} style={st.card}>
      <Head
        title={kind.showSpeed ? 'Speed along the route' : 'Pace along the route'}
        detail={
          <ClayTag
            tone="blue"
            text={`AVG ${
              kind.showSpeed
                ? `${speedKmh(run.meters, run.seconds)} KM/H`
                : `${pace(run.meters, run.seconds)} /KM`
            }`}
          />
        }
      />
      <Well radius={MAP_RADIUS} style={st.chartWell}>
        <Svg width={width} height={h}>
          <Defs>
            <SvgGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={tint('#168BFF')} stopOpacity={0.4} />
              <Stop offset="1" stopColor={tint('#168BFF')} stopOpacity={0} />
            </SvgGradient>
            <SvgGradient id="stroke" x1="0" y1="1" x2="0" y2="0">
              {SPEED_COLORS.map((c, i) => (
                <Stop key={c} offset={i / (SPEED_COLORS.length - 1)} stopColor={c} />
              ))}
            </SvgGradient>
          </Defs>
          <Path d={area} fill="url(#fill)" />
          <Path
            d={line}
            stroke="url(#stroke)"
            strokeWidth={2.5}
            fill="none"
            strokeLinejoin="round"
          />
          {avg > 0 && (
            <Line
              x1={0}
              x2={width}
              y1={y(avg)}
              y2={y(avg)}
              stroke={C.gray}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}
        </Svg>
        <View style={st.axis}>
          {Array.from({ length: Math.floor(km / ticks) + 1 }, (_, i) => i * ticks).map((k) => (
            <T key={k} style={[st.axisText, { left: Math.min(width - 30, x(k)) }]}>
              {k} km
            </T>
          ))}
        </View>
      </Well>
      <View style={st.cardFoot}>
        <T style={st.detail}>fastest {fmt(Math.max(...speeds))}</T>
        <T style={st.detail}>slowest {fmt(Math.min(...speeds))}</T>
      </View>
    </Slab>
  );
}

function Splits({ run }: { run: Run }) {
  const best = bestSplit(run.splits);
  const fastest = Math.min(...run.splits),
    slowest = Math.max(...run.splits);
  const kind = activityOf(run);
  return (
    <Slab radius={28} style={st.card}>
      <Head title="Kilometre splits" detail={<ClayTag text={`${run.splits.length} FULL KM`} />} />
      {run.splits.map((s, i) => {
        const level = slowest > fastest ? (slowest - s) / (slowest - fastest) : 0.5;
        return (
          <View key={i} style={st.split}>
            <T style={st.splitKm}>{i + 1}</T>
            <Well radius={7} style={st.splitTrack}>
              <View
                style={[
                  st.splitBar,
                  {
                    width: `${Math.max(12, (fastest / s) * 100)}%`,
                    backgroundColor: speedColor(level),
                  },
                ]}
              />
            </Well>
            <T style={[st.splitTime, i === best && { color: tint('#FFD18B') }]}>
              {kind.showSpeed ? `${(3600 / s).toFixed(1)} km/h` : `${duration(s)} /km`}
            </T>
            <View style={st.medal}>
              {i === best && (
                <MaterialCommunityIcons name="medal" size={17} color={tint('#FFD18B')} />
              )}
            </View>
          </View>
        );
      })}
    </Slab>
  );
}

function FullMap({ run, onClose }: { run: Run; onClose: () => void }) {
  return (
    <MobileModal visible fullBleed animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <RouteMap points={run.points} interactive padding={[90, 30, 70, 30]} />
        <SafeAreaView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View pointerEvents="box-none" style={st.mapTop}>
            <ClayIconButton icon="close" label="Close map" onPress={onClose} />
            <View style={{ flexShrink: 1 }}>
              <ClayTag
                tone="blue"
                text={`${workoutTitle(run).toUpperCase()} · ${(run.meters / 1000).toFixed(2)} KM`}
              />
            </View>
          </View>
          <View pointerEvents="none" style={{ flex: 1 }} />
          <View pointerEvents="none" style={st.mapBottom}>
            <SpeedLegend />
          </View>
        </SafeAreaView>
      </View>
    </MobileModal>
  );
}

export default function WorkoutDetail({
  run,
  weightKg,
  busy,
  healthLabel,
  onClose,
  onPhoto,
  onDelete,
}: {
  run: Run;
  weightKg?: number | null;
  busy: boolean;
  /** Save-to-health control, or its "saved" note; the screen owns the logic. */
  healthLabel?: React.ReactNode;
  onClose: () => void;
  onPhoto: () => void;
  onDelete: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const compact = width < 370;
  const kind = activityOf(run);
  const hasRoute = run.points.length > 1;
  const mapHeight = Math.max(210, Math.min(340, Math.round(height * 0.34)));
  // The page, less its padding, the slab's and the well's, is what a chart may draw into.
  const chartWidth = Math.min(width, MOBILE_WEB_WIDTH) - 40 - 32 - CHART_INSET * 2;
  const calories = run.calories ?? workoutCalories(run, weightKg);
  const top = useMemo(() => (hasRoute ? topSpeed(run.points) : 0), [run.points]);
  const best = bestSplit(run.splits);
  const when = new Date(run.startedAt);
  const date = when.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const distanceText = (run.meters / 1000).toFixed(2);
  const metrics: Metric[] = [
    kind.showSpeed
      ? { label: 'AVG SPEED', value: speedKmh(run.meters, run.seconds), unit: 'km/h' }
      : { label: 'AVG PACE', value: pace(run.meters, run.seconds), unit: '/km' },
    {
      label: run.calories != null ? 'CALORIES' : 'CALORIES · EST.',
      value: String(calories),
      unit: 'kcal',
      accent: tint('#AAFA60'),
    },
    ...(top > 0
      ? [
          {
            label: kind.showSpeed ? 'TOP SPEED' : 'BEST PACE',
            value: kind.showSpeed ? (top * 3.6).toFixed(1) : duration(1000 / top),
            unit: kind.showSpeed ? 'km/h' : '/km',
          },
        ]
      : []),
    ...(best >= 0
      ? [
          {
            label: 'FASTEST KM',
            value: kind.showSpeed
              ? (3600 / run.splits[best]).toFixed(1)
              : duration(run.splits[best]),
            unit: kind.showSpeed ? `km/h · km ${best + 1}` : `/km · km ${best + 1}`,
            accent: tint('#FFD18B'),
          },
        ]
      : []),
    // Heart rate and steps only come from a watch, so the tiles stay away when
    // nothing recorded them rather than showing an empty dash.
    ...(run.heartRate
      ? [
          {
            label: 'AVG HEART RATE',
            value: String(run.heartRate),
            unit: 'bpm',
            accent: tint('#F27894'),
          },
        ]
      : []),
    ...(run.steps ? [{ label: 'STEPS', value: run.steps.toLocaleString() }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.page}>
          <View style={st.header}>
            <ClayIconButton icon="arrow-back" label="Close summary" onPress={onClose} />
            <KindTag icon={kind.icon} label={kind.name.toUpperCase()} />
          </View>

          <Heading style={[st.title, compact && st.titleCompact]}>{workoutTitle(run)}</Heading>
          <T style={st.subtitle}>
            {date} · {time} · {run.source}
          </T>

          <Slab tone="blue" radius={30} style={st.hero}>
            <View style={st.heroRow}>
              <View style={st.heroDistance}>
                <T style={st.heroLabel}>{kind.id === 'running' ? 'RUN COMPLETE' : 'WORKOUT COMPLETE'}</T>
                <T
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[st.heroValue, compact && st.heroValueCompact]}
                >
                  {distanceText}
                  <T style={st.heroUnit}> km</T>
                </T>
              </View>
              <View style={st.heroTime}>
                <T style={st.heroLabel}>MOVING TIME</T>
                <T numberOfLines={1} style={st.heroClock}>
                  {duration(run.seconds)}
                </T>
              </View>
            </View>
          </Slab>

          <View style={st.grid}>
            {metrics.map((m, i) => (
              <Tile
                key={m.label}
                {...m}
                wide={metrics.length % 2 === 1 && i === metrics.length - 1}
              />
            ))}
          </View>
          {hasRoute ? (
            <MapCard
              height={mapHeight}
              style={st.map}
              title="Route"
              detail={<ClayTag text="TAP TO EXPAND" tone="blue" icon="expand" />}
            >
              <RouteMap points={run.points} padding={[26, 22, 44, 22]} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open the map full screen"
                onPress={() => setExpanded(true)}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={st.legendSlot}>
                <SpeedLegend />
              </View>
            </MapCard>
          ) : (
            <Slab radius={28} style={st.noRoute}>
              <View style={st.shoeArt}>
                <ClayShoe width={compact ? 72 : 88} height={compact ? 44 : 54} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T style={st.noRouteTitle}>No route on this one.</T>
                <T style={st.detail}>
                  No GPS trace was recorded, so the numbers are the whole story.
                </T>
              </View>
            </Slab>
          )}

          {run.calories == null && !weightKg && (
            <T style={[st.detail, { marginTop: 9, textAlign: 'center' }]}>
              Calories estimated for 70 kg. Add your weight in Profile.
            </T>
          )}

          {hasRoute && <ProfileChart run={run} width={chartWidth} />}
          {!!run.splits.length && <Splits run={run} />}

          {healthLabel ? <View style={{ marginTop: 18 }}>{healthLabel}</View> : null}

          {/* Keep actions near the bottom of short summaries. */}
          <View style={st.fillWide} />

          {/* What you can do with this workout, side by side: keep it or lose it. */}
          <View style={st.actions}>
            <View style={st.action}>
              <ClayButton title="Brag a little" tone="cream" icon="camera" onPress={onPhoto} />
            </View>
            <View style={st.action}>
              <HoldButton
                label="Hold to delete"
                holdingLabel="Keep holding…"
                icon="trash-outline"
                disabled={busy}
                onConfirm={onDelete}
              />
            </View>
          </View>
          <T style={st.actionsNote}>
            {run.meters > 0 ? `${distanceText} km` : duration(run.seconds)} looks good on a photo.
          </T>
        </ScrollView>
      </SafeAreaView>
      {expanded && hasRoute && <FullMap run={run} onClose={() => setExpanded(false)} />}
    </View>
  );
}

const st = themed(() =>
  StyleSheet.create({
    page: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 28,
      width: '100%',
      maxWidth: MOBILE_WEB_WIDTH,
      alignSelf: 'center',
    },
    // The footer settles at the bottom on short summaries.
    fillWide: { flexGrow: 1, minHeight: 4 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 18,
    },
    kindTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 14,
    },
    kindTagText: {
      fontFamily: 'InterBold',
      fontSize: 10,
      lineHeight: 13,
      letterSpacing: 0.8,
      color: CLAY.blue.ink,
    },
    title: { fontFamily: 'DisplayItalic', fontSize: 46, lineHeight: 48, color: C.white },
    titleCompact: { fontSize: 34, lineHeight: 36 },
    subtitle: { fontSize: 11, lineHeight: 17, color: C.gray, marginTop: 6 },
    detail: { fontSize: 11, lineHeight: 17, color: C.gray, letterSpacing: 0 },

    map: { marginTop: 18 },
    legendSlot: { position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 1000 },
    legend: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
    },
    legendBar: { flex: 1, height: 6, borderRadius: 3 },
    legendText: { color: C.white, fontFamily: 'InterBold', fontSize: 9, letterSpacing: 1 },

    noRoute: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      marginTop: 14,
      minHeight: 88,
    },
    shoeArt: { width: 88, alignItems: 'center' },
    noRouteTitle: {
      color: C.white,
      fontFamily: 'InterSemi',
      fontSize: 14,
      lineHeight: 19,
      marginBottom: 2,
    },

    hero: { marginTop: 24, padding: 22, paddingTop: 20, paddingBottom: 16 },
    heroRow: { alignItems: 'stretch' },
    heroDistance: { minWidth: 0 },
    heroLabel: {
      fontFamily: 'InterSemi',
      fontSize: 10,
      lineHeight: 15,
      letterSpacing: 1.4,
      color: CLAY.blue.soft,
    },
    heroValue: {
      fontFamily: 'Display',
      fontSize: 138,
      lineHeight: 142,
      textAlign: 'center',
      letterSpacing: 0,
      color: '#FFFFFF',
      marginTop: 2,
    },
    heroValueCompact: { fontSize: 106, lineHeight: 114 },
    heroUnit: { fontFamily: 'Display', fontSize: 36, color: CLAY.blue.soft },
    heroTime: { alignItems: 'center', paddingTop: 12, marginTop: 10, borderTopWidth: 1, borderTopColor: '#FFFFFF40' },
    heroClock: {
      fontFamily: 'Display',
      fontSize: 60,
      lineHeight: 62,
      letterSpacing: 0,
      color: '#FFFFFF',
      marginTop: 2,
    },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 12 },
    tile: { width: '48%', flexGrow: 1, minWidth: 0, padding: 16, paddingVertical: 16, gap: 3 },
    tileWide: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 18,
    },
    tileLabel: {
      fontFamily: 'InterSemi',
      fontSize: 9,
      lineHeight: 14,
      letterSpacing: 1.2,
      color: C.gray,
    },
    tileValue: {
      fontFamily: 'Display',
      fontSize: 38,
      lineHeight: 44,
      color: C.white,
      letterSpacing: 0,
    },
    tileUnit: { fontFamily: 'Inter', fontSize: 12, color: C.gray },

    card: { marginTop: 18, padding: 16, paddingTop: 14 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      flexWrap: 'wrap',
      paddingHorizontal: 2,
      marginBottom: 12,
    },
    headTitle: {
      fontFamily: 'Display',
      fontSize: 22,
      lineHeight: 26,
      color: C.white,
      letterSpacing: 0,
    },
    chartWell: { paddingTop: 6, paddingBottom: 4, paddingHorizontal: CHART_INSET },
    cardFoot: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 10,
      paddingHorizontal: 2,
    },
    axis: { height: 16, position: 'relative', marginTop: -16, marginBottom: 2 },
    axisText: { position: 'absolute', fontSize: 9, color: C.gray },

    split: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
    splitKm: {
      width: 22,
      fontFamily: 'InterBold',
      fontSize: 12,
      color: C.white,
      textAlign: 'right',
    },
    splitTrack: { flex: 1, height: 14, justifyContent: 'center' },
    splitBar: {
      height: 14,
      borderRadius: 7,
      boxShadow: 'inset 2px 2px 4px #FFFFFF55, inset -2px -3px 5px #00000066',
    },
    splitTime: {
      width: 78,
      textAlign: 'right',
      fontFamily: 'InterSemi',
      fontSize: 12,
      color: C.white,
    },
    medal: { width: 20, alignItems: 'center' },

    actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 26 },
    action: { flex: 1, minWidth: 0 },
    actionsNote: {
      fontSize: 11,
      lineHeight: 17,
      color: C.gray,
      textAlign: 'center',
      marginTop: 12,
    },

    mapTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 10,
    },
    mapBottom: { padding: 16 },
  }),
);
