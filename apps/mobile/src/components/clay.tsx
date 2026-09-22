import { themed } from '../theme';
import React from 'react';
import { ActivityIndicator, StyleSheet, View, ViewStyle } from 'react-native';
import { C, Icon, T, Tap } from '../ui';
import { CLAY, clay, well, type ClayTone } from '../claySurface';

// The surfaces live in ../claySurface so ui.tsx can use them without an import cycle.
export { CLAY, clay, well };
export type { ClayTone };

export function Slab({
  tone = 'graphite',
  radius = 28,
  depth = 1,
  style,
  children,
  ...props
}: {
  tone?: ClayTone;
  radius?: number;
  depth?: number;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
  [key: string]: any;
}) {
  return (
    <View {...props} style={[clay(tone, depth), { borderRadius: radius }, style]}>
      {children}
    </View>
  );
}

export function Well({
  radius = 22,
  tone = 'dark',
  style,
  children,
}: {
  radius?: number;
  tone?: 'dark' | 'blue';
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}) {
  return (
    <View style={[well(tone), { borderRadius: radius, overflow: 'hidden' }, style]}>
      {children}
    </View>
  );
}

/** Puffy pill button. Keeps the accessible name equal to its title. */
export function ClayButton({
  title,
  onPress,
  tone = 'blue',
  icon,
  trailing,
  loading = false,
  disabled = false,
  style,
  size = 'regular',
}: {
  title: string;
  onPress?: () => void;
  tone?: ClayTone;
  icon?: string;
  trailing?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  size?: 'compact' | 'regular' | 'large';
}) {
  const r = CLAY[tone];
  const bubble: ClayTone =
    tone === 'cream' ? 'blue' : tone === 'lime' ? 'navy' : tone === 'blue' ? 'cream' : 'blue';
  return (
    <Tap
      label={title}
      onPress={onPress}
      disabled={disabled || loading}
      style={[clay(tone), st.button, size === 'large' && st.buttonLarge, size === 'compact' && st.buttonCompact, style]}
    >
      {icon || loading ? (
        <View style={[clay(bubble, 0.7), st.bubble, size === 'large' && st.bubbleLarge, size === 'compact' && st.bubbleCompact]}>
          {loading ? (
            <ActivityIndicator color={CLAY[bubble].ink} size="small" />
          ) : (
            <Icon name={icon} size={size === 'large' ? 18 : size === 'compact' ? 12 : 15} color={CLAY[bubble].ink} />
          )}
        </View>
      ) : null}
      <T style={[st.buttonText, size === 'large' && st.buttonTextLarge, size === 'compact' && st.buttonTextCompact, !icon && !loading && !trailing && { textAlign: 'center' }, { color: r.ink }]}>
        {title}
      </T>
      {trailing ? <Icon name={trailing} size={size === 'compact' ? 15 : 19} color={r.ink} /> : null}
    </Tap>
  );
}

/** Round clay icon button for headers and modal chrome. */
export function ClayIconButton({
  icon,
  label,
  onPress,
  tone = 'graphite',
  size = 46,
  color,
  disabled = false,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  tone?: ClayTone;
  size?: number;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Tap
      label={label}
      onPress={onPress}
      disabled={disabled}
      style={[
        clay(tone, 0.8),
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Icon name={icon} size={size * 0.46} color={color || CLAY[tone].ink} />
    </Tap>
  );
}

/** Small rounded clay tag, used for statuses and counts. */
export function ClayTag({
  text,
  tone = 'graphite',
  icon,
}: {
  text: string;
  tone?: ClayTone;
  icon?: string;
}) {
  return (
    <View style={[clay(tone, 0.55), st.tag]}>
      {icon ? <Icon name={icon} size={11} color={CLAY[tone].ink} /> : null}
      <T style={[st.tagText, { color: CLAY[tone].ink }]}>{text}</T>
    </View>
  );
}

const st = themed(() =>
  StyleSheet.create({
    button: {
      minHeight: 56,
      borderRadius: 28,
      paddingLeft: 10,
      paddingRight: 20,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    buttonCompact: { minHeight: 44, borderRadius: 22, paddingLeft: 8, paddingRight: 12, paddingVertical: 6, gap: 8 },
    bubbleCompact: { width: 26, height: 26, borderRadius: 13 },
    buttonTextCompact: { fontSize: 12, lineHeight: 16 },
    buttonLarge: { minHeight: 66, borderRadius: 33, paddingLeft: 12, paddingRight: 24 },
    bubble: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bubbleLarge: { width: 44, height: 44, borderRadius: 22 },
    buttonText: { flex: 1, fontFamily: 'InterBold', fontSize: 14, lineHeight: 18 },
    buttonTextLarge: { fontSize: 17, lineHeight: 22 },
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 14,
    },
    tagText: { fontFamily: 'InterBold', fontSize: 10, lineHeight: 13, letterSpacing: 0.8 },
  }),
);
