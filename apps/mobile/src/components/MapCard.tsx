import { isLight, themed, tint } from '../theme';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, T } from '../ui';
import { CLAY, ClayTone, Well, Slab, clay } from './clay';

// The map panel: a raised clay slab like every other card on the page, with the map
// pressed into it as a well. A soft shade at the top keeps the chips readable on any
// tiles, and a hairline rim over the map softens the tile edges in the corners.

/** Corner radius of the map itself - the well inside the panel. */
export const MAP_RADIUS = 20;

type Chip = { label: string; tone?: ClayTone; dot?: boolean };

function MapChip({ label, tone = 'graphite', dot }: Chip) {
  const ink = CLAY[tone].ink;
  return (
    <View style={[clay(tone, 0.55), st.chip]}>
      {dot && <View style={[st.chipDot, { backgroundColor: ink }]} />}
      <T style={[st.chipText, { color: ink }]}>{label}</T>
    </View>
  );
}

export default function MapCard({
  height,
  title,
  detail,
  chips = [],
  children,
  style,
}: {
  height: number;
  /** Panel heading, in the same voice as the section titles around it. */
  title?: string;
  /** Sits at the right end of the heading row, usually a `ClayTag`. */
  detail?: React.ReactNode;
  chips?: Chip[];
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <Slab radius={30} style={[st.panel, style || {}]}>
      {(title || detail) && (
        <View style={st.head}>
          {title ? <T style={st.title}>{title}</T> : <View />}
          {detail}
        </View>
      )}
      <Well radius={MAP_RADIUS} style={{ height }}>
        {children}
        <LinearGradient pointerEvents="none" colors={shade.top as any} style={st.topShade} />
        <View pointerEvents="none" style={st.rim} />
        {chips.length > 0 && (
          <View pointerEvents="none" style={st.chips}>
            {chips.map((chip) => (
              <MapChip key={chip.label} {...chip} />
            ))}
          </View>
        )}
      </Well>
    </Slab>
  );
}

// A dark scrim on the dark map, a light one on the light map.
const shade = themed(() => ({
  top: isLight()
    ? ['rgba(247,248,250,0.72)', 'rgba(247,248,250,0)']
    : ['rgba(8,9,11,0.55)', 'rgba(8,9,11,0)'],
}));

const st = themed(() =>
  StyleSheet.create({
    panel: { padding: 12 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: 6,
      paddingTop: 2,
      paddingBottom: 12,
    },
    title: { fontFamily: 'Display', fontSize: 22, lineHeight: 26, color: C.white, letterSpacing: 0 },
    topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 64, zIndex: 900 },
    rim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: MAP_RADIUS,
      borderWidth: 1,
      borderColor: tint('#FFFFFF14'),
      zIndex: 950,
    },
    chips: {
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      zIndex: 1000,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 14,
    },
    chipDot: { width: 7, height: 7, borderRadius: 4 },
    chipText: { fontFamily: 'InterBold', fontSize: 10, lineHeight: 13, letterSpacing: 0.8 },
  }),
);
