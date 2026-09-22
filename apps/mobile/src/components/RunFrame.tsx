import Logo from './Logo';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, T } from '../ui';
import { Run, duration, pace } from '../tracking/model';

export type FrameProps = {
  run: Run;
  bottomInset?: number;
  topInset?: number;
  light?: boolean;
};

/** The masthead line under the wordmark, one word per line. */
const TAGLINE = ['MOVEMENT', 'BUILDS', 'A BRIGHTER', 'YOU'];
/** The right rail standing under the date. */
const STANDARDS = ['SAME', 'EFFORT', 'HIGHER', 'STANDARDS'];

/** A compact photo caption, shared by the live viewfinder and exported image. */
export default function RunFrame({
  run,
  light = false,
  bottomInset = 30,
  topInset = 60,
}: FrameProps) {
  const [width, setWidth] = useState(390);
  const compact = width < 360;
  // The photo caption keeps its own colours: it is drawn on a photo, not on the app page.
  const ink = light ? '#101216' : '#F7F8FA';
  const base = light ? '#F7F8FA' : '#08090B';
  const pad = compact ? 22 : 28;
  // The rail reads as two stacked lines: "17 SEP" over the year.
  const started = new Date(run.startedAt);
  // Sliced to three letters: some locales render September as "Sept", the rail wants "SEP".
  const month = started
    .toLocaleDateString('en-GB', { month: 'short' })
    .slice(0, 3)
    .toUpperCase();
  const day = `${started.getDate()} ${month}`;
  const year = String(started.getFullYear());
  const metrics = [
    { value: (run.meters / 1000).toFixed(2), label: 'DISTANCE', unit: 'KM' },
    { value: duration(run.seconds), label: 'TIME', unit: '' },
    { value: pace(run.meters, run.seconds), label: 'PACE', unit: '/KM' },
  ];
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout } }) => setWidth(layout.width)}
    >
      {/* Both scrims live inside the exported frame, so the caption stays readable on any photo. */}
      <LinearGradient
        colors={[`${base}A6`, `${base}00`]}
        style={[st.topGradient, { height: topInset + 240 }]}
      />
      <LinearGradient
        colors={[`${base}00`, `${base}80`, `${base}E6`]}
        locations={[0, 0.48, 1]}
        style={[st.gradient, { height: bottomInset + 260 }]}
      />

      <View style={[st.masthead, { top: topInset, left: pad, right: pad }]}>
        <View style={st.brand}>
          <Logo height={compact ? 36 : 44} color={ink} />
          {TAGLINE.map((line) => (
            <T key={line} style={[st.tagline, { color: ink }]}>
              {line}
            </T>
          ))}
          <View style={[st.brandRule, { backgroundColor: C.blue }]} />
        </View>

        <View style={st.rail}>
          <T style={[st.date, { color: ink }]}>{day}</T>
          <T style={[st.date, { color: ink }]}>{year}</T>
          <View style={[st.railRule, { backgroundColor: `${ink}59` }]} />
          {STANDARDS.map((line) => (
            <T key={line} style={[st.standard, { color: ink }]}>
              {line}
            </T>
          ))}
        </View>
      </View>

      <View style={[st.caption, { bottom: bottomInset, paddingHorizontal: pad }]}>
        <View style={st.metrics}>
          {metrics.map(({ value, label, unit }, index) => (
            <React.Fragment key={label}>
              {index > 0 && <View style={[st.divider, { backgroundColor: `${ink}3D` }]} />}
              <View style={st.metric}>
                <T style={[st.label, { color: ink }]}>{label}</T>
                <T
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}
                  style={[st.value, { color: ink, fontSize: compact ? 28 : 35 }]}
                >
                  {value}
                </T>
                <T style={[st.unit, { color: ink }]}>{unit}</T>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0 },
  masthead: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between' },
  brand: { flexShrink: 1 },
  tagline: {
    fontFamily: 'Inter',
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 3.4,
    opacity: 0.75,
    marginTop: 2,
  },
  brandRule: { width: 52, height: 3, marginTop: 14, borderRadius: 2 },
  rail: { alignItems: 'flex-end', paddingTop: 4 },
  date: {
    fontFamily: 'InterBold',
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 1.8,
    textAlign: 'right',
  },
  railRule: { width: 46, height: 1, marginTop: 10, marginBottom: 20 },
  standard: {
    fontFamily: 'Inter',
    fontSize: 10,
    lineHeight: 16,
    letterSpacing: 2.4,
    textAlign: 'right',
    opacity: 0.7,
  },
  caption: { position: 'absolute', left: 0, right: 0 },
  metrics: { flexDirection: 'row', alignItems: 'stretch' },
  metric: { flex: 1, minWidth: 0 },
  divider: { width: 1, marginHorizontal: 14 },
  label: { fontFamily: 'InterSemi', fontSize: 10, lineHeight: 16, letterSpacing: 2.4, opacity: 0.8 },
  value: {
    fontFamily: 'InterBold',
    lineHeight: 44,
    letterSpacing: 0.4,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  unit: { fontFamily: 'Inter', fontSize: 10, lineHeight: 16, letterSpacing: 2.2, opacity: 0.7 },
});
