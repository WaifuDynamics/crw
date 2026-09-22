import React from 'react';
import { ActivityIndicator, StyleSheet, View, ViewStyle } from 'react-native';
import { C, Icon, T, Tap } from '../ui';

/**
 * Frosted-glass primitives for the run camera. Unlike the clay slabs used on the
 * rest of the app, these recede: translucent black, a hairline rim, white ink.
 * The photograph is the interface; the chrome only has to be findable.
 */
export const GLASS = {
  fill: 'rgba(0,0,0,0.45)',
  line: 'rgba(255,255,255,0.18)',
  activeFill: 'rgba(22,139,255,0.30)',
  activeLine: 'rgba(140,203,255,0.75)',
  white: '#FFFFFF',
  blue: C.blue,
  lime: C.green,
};

export type GlassTone = 'neutral' | 'blue' | 'lime';

export function glass(active = false): ViewStyle {
  return {
    backgroundColor: active ? GLASS.activeFill : GLASS.fill,
    borderWidth: 1,
    borderColor: active ? GLASS.activeLine : GLASS.line,
  };
}

/** Round glass button for the chrome row and the shutter deck. */
export function GlassIconButton({
  icon,
  label,
  onPress,
  size = 46,
  disabled = false,
  active = false,
  color,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  size?: number;
  disabled?: boolean;
  active?: boolean;
  color?: string;
}) {
  return (
    <Tap
      label={label}
      onPress={onPress}
      disabled={disabled}
      style={[glass(active), st.round, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Icon name={icon} size={Math.round(size * 0.44)} color={color || GLASS.white} />
    </Tap>
  );
}

/** Glass pill that reads as a switch so the overlay options stay assistive-tech friendly. */
export function GlassPill({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Tap
      flex
      label={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[glass(value), st.pill]}
    >
      <Icon name={icon} size={14} color={value ? '#BFE0FF' : GLASS.white} />
      <T style={[st.pillText, { color: value ? '#BFE0FF' : GLASS.white }]}>{label}</T>
    </Tap>
  );
}

/** Small status tag with a coloured dot: viewfinder, your shot, camera off. */
export function GlassTag({ text, tone = 'neutral' }: { text: string; tone?: GlassTone }) {
  const dot = tone === 'blue' ? GLASS.blue : tone === 'lime' ? GLASS.lime : '#8E96A3';
  return (
    <View style={[glass(), st.tag]}>
      <View style={[st.dot, { backgroundColor: dot }]} />
      <T style={st.tagText}>{text}</T>
    </View>
  );
}

/** Classic camera key: thin white ring, solid core. */
export function Shutter({
  label,
  icon,
  tone = 'white',
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: string;
  tone?: 'white' | 'blue';
  disabled?: boolean;
  onPress: () => void;
}) {
  const core = tone === 'blue' ? GLASS.blue : GLASS.white;
  const ink = tone === 'blue' ? GLASS.white : '#0B0F15';
  return (
    <Tap label={label} disabled={disabled} onPress={onPress} style={st.ring}>
      <View style={[st.core, { backgroundColor: core }]}>
        {icon && <Icon name={icon} size={24} color={ink} />}
      </View>
    </Tap>
  );
}

/** Full-width primary action under the shutter row. */
export function GlassButton({
  title,
  icon,
  onPress,
  loading = false,
  disabled = false,
}: {
  title: string;
  icon: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tap label={title} onPress={onPress} disabled={disabled || loading} style={st.button}>
      {loading ? (
        <ActivityIndicator color={GLASS.white} size="small" />
      ) : (
        <Icon name={icon} size={18} color={GLASS.white} />
      )}
      <T style={st.buttonText}>{title}</T>
    </Tap>
  );
}

const st = StyleSheet.create({
  round: { alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  pillText: { fontFamily: 'InterBold', fontSize: 11, lineHeight: 15 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 15,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  tagText: {
    fontFamily: 'InterBold',
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1,
    color: GLASS.white,
  },
  ring: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2.5,
    borderColor: GLASS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: { width: 55, height: 55, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  button: {
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: C.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  buttonText: { fontFamily: 'InterBold', fontSize: 15, lineHeight: 19, color: GLASS.white },
});
