import { tint, themed } from '../theme';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { C } from '../ui';

// Recognizable equipment silhouettes with small, playful character details.
function HighTopSneaker() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 260 150" fill="none">
      <G stroke={tint('#AFC4D3')} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <Path
          d="M24 109 30 39Q30 27 40 25L65 19Q76 17 88 26L96 32 102 17Q105 12 111 17L121 36 140 66Q148 78 164 81L211 88Q228 90 236 102L239 111 238 127Q222 136 195 136H57Q34 136 23 128Z"
          fill={tint('#AFC4D308')}
        />
        <Path
          d="M30 39Q52 28 71 31L96 44 96 32M31 46l32-8q8-2 16 3l19 10-7 15-29-13-33 8Z"
          fill={tint('#168BFF19')}
        />
        <Path d="m29 62 28-6 12 18-6 38-39-3Z" fill={tint('#168BFF14')} />
        <Path d="m98 45 14-13 29 39 15 11-11 15-37-40Z" fill={tint('#168BFF16')} />
        <Path d="M161 83q-14 8-10 28h45q26 0 42-5M24 109q17 7 39 7h133q25 0 43-5" />
        <Path d="M24 124q18 6 39 6h135q24 0 40-7" stroke={C.blue} strokeWidth={1.2} />
        <Path
          d="M79 80c-13 20-1 29 18 20l65-17-58 5q-18 7-25-8Z"
          fill={tint('#168BFF25')}
          stroke={C.blue}
          strokeWidth={1.3}
        />
        <Path d="m102 43 15-2m-9 10 15-3m-9 11 15-3m-9 12 15-3m-8 12 15-3" strokeWidth={1.5} />
        <Path d="m35 34 3 13m-1 18-3 38M102 25l8-3 5 9-9 3" strokeWidth={0.85} opacity={0.7} />
        <Circle cx={69} cy={47} r={5} strokeWidth={0.8} />
        <Path d="m62 43-10-2m9 5-12-1m13 4-10 1m24-4 9 4m-10-1 8 4m-10-1 6 4" strokeWidth={0.8} />
        <Path d="M179 92q3-5 6 0m12 0q3-5 6 0M185 100q7 7 14-1" stroke={C.blue} strokeWidth={1.8} />
        <Path
          d="m45 131v4m22-4v5m23-5v5m23-5v5m23-5v5m23-5v5m23-5v5m23-6v5m19-9v5"
          strokeWidth={0.75}
          opacity={0.65}
        />
      </G>
    </Svg>
  );
}

function Basketball() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 160 160" fill="none">
      <G stroke={tint('#BBCCA7')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx={80} cy={80} r={56} fill={tint('#BBCCA707')} />
        <Path d="M47 35C30 67 37 103 61 133M113 35C130 67 123 103 99 133M25 68Q80 112 135 68" />
        <Path d="M63 58v7m26-4 7-4 5 5M72 76q10 12 22-2" strokeWidth={2.3} />
        <Path d="m59 49 8-2m24-4 9 4" strokeWidth={1.3} />
      </G>
    </Svg>
  );
}

function PadelRacket() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 160 230" fill="none">
      <G stroke={tint('#AFC4D3')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <Path
          d="M80 17C49 17 29 36 29 65C29 95 46 112 61 130L72 151V191Q80 195 88 191V151L99 130C114 112 131 95 131 65C131 36 111 17 80 17Z"
          fill={tint('#9AAFBF07')}
        />
        <Path
          d="M80 24C53 24 36 41 36 66C36 87 48 103 61 116Q80 128 99 116C112 103 124 87 124 66C124 41 107 24 80 24Z"
          strokeWidth={0.85}
        />
        <Path d="m66 129 14 19 14-19q-14 5-28 0Z" />
        <Path
          d="M72 155h16m-16 7 16-4m-16 11 16-4m-16 11 16-4m-16 11 16-4m-16 11 16-4"
          strokeWidth={0.85}
        />
        <Path d="M71 191h18M80 194c-13 8-12 21-2 22s18-11 10-18" strokeWidth={1} />
        {[3, 5, 5, 5, 3].map((count, row) =>
          Array.from({ length: count }, (_, column) => {
            if ((row === 2 || row === 3) && column > 0 && column < count - 1) return null;
            return (
              <Circle
                key={`${row}-${column}`}
                cx={80 + (column - (count - 1) / 2) * 13}
                cy={43 + row * 14}
                r={2.3}
                strokeWidth={0.85}
                opacity={0.8}
              />
            );
          }),
        )}
        <Path d="m65 70 6-3-6-3m22 2v5M71 84q9 10 19-2" stroke={C.blue} strokeWidth={2} />
      </G>
    </Svg>
  );
}

export default function DiscoverBackground({
  focused,
  controlsTop,
}: {
  focused: boolean;
  controlsTop: number;
}) {
  const phase = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  const [compact, setCompact] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      preferenceChanged = true;
      setReducedMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted && !preferenceChanged) setReducedMotion(value);
      })
      .catch(() => {});
    const app = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => {
      mounted = false;
      motion.remove();
      app.remove();
    };
  }, []);

  useEffect(() => {
    if (reducedMotion || !focused || !active) {
      phase.setValue(0);
      return;
    }
    const motion = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, {
          toValue: 1,
          duration: 6200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== 'web',
          isInteraction: false,
        }),
        Animated.timing(phase, {
          toValue: 0,
          duration: 6200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== 'web',
          isInteraction: false,
        }),
      ]),
    );
    motion.start();
    return () => motion.stop();
  }, [active, focused, phase, reducedMotion]);

  const between = (from: number, to: number) =>
    phase.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  const rotate = (from: string, to: string) =>
    phase.interpolate({ inputRange: [0, 1], outputRange: [from, to] });

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="discover-sports-background"
      onLayout={({ nativeEvent }) => setCompact(nativeEvent.layout.width < 400)}
      style={styles.background}
    >
      <Svg
        width="100%"
        height={560}
        viewBox="0 0 480 560"
        preserveAspectRatio="xMaxYMin slice"
        style={styles.track}
        fill="none"
      >
        <G stroke={C.blue} strokeWidth={0.8} opacity={0.075}>
          {[0, 18, 36].map((offset) => (
            <Path
              key={offset}
              d={`M${438 + offset} 190V320Q${438 + offset} 402 ${350 + offset} 448L225 518`}
            />
          ))}
        </G>
      </Svg>
      <Animated.View
        testID="discover-shoe-drawing"
        style={[
          styles.shoe,
          compact && styles.compactShoe,
          { transform: [{ translateY: between(0, -5) }, { rotate: rotate('-12deg', '-9deg') }] },
        ]}
      >
        <HighTopSneaker />
      </Animated.View>
      <Animated.View
        testID="discover-ball-drawing"
        style={[
          styles.ball,
          {
            top: controlsTop - 62,
            transform: [{ translateY: between(0, -5) }, { rotate: rotate('-8deg', '1deg') }],
          },
        ]}
      >
        <Basketball />
      </Animated.View>
      <Animated.View
        testID="discover-padel-drawing"
        style={[
          styles.padel,
          {
            top: controlsTop + 48,
            transform: [{ translateY: between(0, 4) }, { rotate: rotate('26deg', '29deg') }],
          },
        ]}
      >
        <PadelRacket />
      </Animated.View>
      <Svg width={240} height={440} viewBox="0 0 240 440" style={styles.court} fill="none">
        <G stroke={tint('#AFC4D3')} strokeWidth={0.8} opacity={0.08} rotation={24} origin="120,220">
          <Rect x={-70} y={30} width={260} height={360} />
          <Path d="M-70 115h260M-70 305h260M60 115v90m0 10v90" />
          <Path d="M-70 210h260" strokeDasharray="2 4" />
        </G>
      </Svg>
      <Animated.View
        style={[
          styles.finish,
          { transform: [{ translateY: between(-2, 2) }, { rotate: rotate('9deg', '12deg') }] },
        ]}
      >
        <HighTopSneaker />
      </Animated.View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    background: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
    track: { position: 'absolute', top: 0, right: 0 },
    shoe: { position: 'absolute', top: 66, right: -6, width: 169, height: 98, opacity: 0.48 },
    compactShoe: { top: 66, right: -12, width: 139, height: 81, opacity: 0.36 },
    ball: { position: 'absolute', left: -19, width: 112, height: 112, opacity: 0.36 },
    padel: { position: 'absolute', right: 2, width: 105, height: 151, opacity: 0.4 },
    court: { position: 'absolute', top: 910, left: -80 },
    finish: { position: 'absolute', bottom: 8, left: -35, width: 152, height: 88, opacity: 0.17 },
  }),
);
