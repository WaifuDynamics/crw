import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { tint, themed } from '../theme';
import { C } from '../ui';

function NumberOne() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 160 170" fill="none">
      <G stroke={tint('#AFC4D3')} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <SvgText x={18} y={119} fill={C.blue} stroke="none" fontFamily="DisplayItalic" fontSize={104}>#</SvgText>
        <SvgText x={89} y={119} fill={C.blue} stroke="none" fontFamily="DisplayItalic" fontSize={126}>1</SvgText>
        <Path d="M32 145h100M40 154h84M48 163h68" strokeWidth={0.8} opacity={0.72} />
        <Path d="m18 36 7-8m108 0 7 8M8 96h12m120 0h12" strokeWidth={0.9} />
      </G>
    </Svg>
  );
}

export default function CompeteBackground({ focused }: { focused: boolean }) {
  const phase = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => {});
    const app = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => { motion.remove(); app.remove(); };
  }, []);

  useEffect(() => {
    if (reducedMotion || !focused || !active) { phase.setValue(0); return; }
    const motion = Animated.loop(Animated.sequence([
      Animated.timing(phase, { toValue: 1, duration: 6200, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
      Animated.timing(phase, { toValue: 0, duration: 6200, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
    ]));
    motion.start();
    return () => motion.stop();
  }, [active, focused, phase, reducedMotion]);

  const float = (from: number, to: number) => phase.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.background}>
      <Svg width="100%" height={520} viewBox="0 0 480 520" preserveAspectRatio="xMaxYMin slice" style={styles.lines} fill="none">
        <G stroke={C.blue} strokeWidth={0.8} opacity={0.07}>
          {[0, 18, 36].map((offset) => <Path key={offset} d={`M${438 + offset} 182V284Q${438 + offset} 366 ${350 + offset} 412L225 482`} />)}
        </G>
      </Svg>
      <Animated.View testID="compete-number-one-drawing" style={[styles.numberOne, { transform: [{ translateY: float(0, -5) }, { rotate: '-10deg' }] }]}><NumberOne /></Animated.View>
      <Svg width={190} height={250} viewBox="0 0 190 250" style={styles.podium} fill="none">
        <G stroke={tint('#AFC4D3')} strokeWidth={0.8} opacity={0.08}>
          <Rect x={20} y={120} width={48} height={80} /><Rect x={71} y={72} width={48} height={128} /><Rect x={122} y={101} width={48} height={99} />
          <Path d="M20 200h150M43 137h2m49-48h2m49 30h2" />
        </G>
      </Svg>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  background: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  lines: { position: 'absolute', top: 0, right: 0 },
  numberOne: { position: 'absolute', top: 64, right: -20, width: 142, height: 151, opacity: 0.42 },
  podium: { position: 'absolute', top: 925, right: -62 },
}));
