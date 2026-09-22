import LiquidGlass from './LiquidGlass';
import { C, isLight, themed } from '../theme';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Svg, { Circle, Path } from 'react-native-svg';
import { DOCK_HEIGHT, DOCK_INSET, DOCK_SIDE } from '../layout';
import { useTranslation } from '../translations';

/**
 * The liquid glass dock. A floating translucent capsule the tab screens scroll
 * underneath. There is no highlight behind the selected tab: ink alone carries
 * the state, brand blue for the current page against grey for the rest.
 *
 * Web gets a real backdrop blur; native keeps the translucent fill, which reads
 * the same against the near-black page.
 */
const GLASS = themed(() =>
  isLight()
    ? {
        page: C.bg,
        fade: ['rgba(242,244,247,0)', 'rgba(242,244,247,0.50)', 'rgba(242,244,247,0.85)'],
        fill: 'rgba(255,255,255,0.74)',
        rim: 'rgba(16,18,22,0.08)',
        sheen: ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)'],
        shadow: [
          '0 18px 38px rgba(27,42,64,0.16)',
          '0 2px 10px rgba(27,42,64,0.10)',
          'inset 0 1px 0 rgba(255,255,255,0.9)',
          'inset 0 -1px 0 rgba(16,18,22,0.04)',
        ],
        icon: '#6B7380',
        iconOn: C.blue,
        label: '#6B7380',
        labelOn: C.white,
      }
    : {
        page: '#08090B',
        fade: ['rgba(8,9,11,0)', 'rgba(8,9,11,0.50)', 'rgba(8,9,11,0.85)'],
        fill: 'rgba(19,23,30,0.66)',
        rim: 'rgba(255,255,255,0.10)',
        sheen: ['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)'],
        shadow: [
          '0 18px 38px rgba(0,0,0,0.55)',
          '0 2px 10px rgba(0,0,0,0.45)',
          'inset 0 1px 0 rgba(255,255,255,0.20)',
          'inset 0 -1px 0 rgba(255,255,255,0.05)',
        ],
        icon: '#9099A6',
        iconOn: '#4FA8FF',
        label: '#8A919E',
        labelOn: '#FFFFFF',
      },
);

// One stroke weight and one optical size keep the four symbols a family.
function TabIcon({ name, selected }: { name: string; selected: boolean }) {
  const color = selected ? GLASS.iconOn : GLASS.icon;
  const fill = selected ? 'rgba(22,139,255,0.30)' : 'none';
  return (
    <Svg
      width={21}
      height={21}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
      aria-hidden
    >
      {name === 'Discover' && (
        <>
          <Circle cx={12} cy={12} r={8.6} />
          <Path d="m16.2 7.8-2.6 5.8-5.8 2.6 2.6-5.8 5.8-2.6Z" fill={fill} />
        </>
      )}
      {name === 'Food' && (
        <>
          <Path d="M3.9 13.1a8.1 8.1 0 0 1 16.2 0Z" fill={fill} />
          <Path d="M2.3 13.1h19.4M5.2 16.9h13.6" />
          <Circle cx={12} cy={3.8} r={1} fill={color} stroke="none" />
        </>
      )}
      {name === 'Compete' && (
        <>
          <Path d="M7.6 3.4h8.8v5.1a4.4 4.4 0 0 1-8.8 0Z" fill={fill} />
          <Path d="M7.6 5.4H5v1.5a3.6 3.6 0 0 0 3 3.5m8.4-5H19v1.5a3.6 3.6 0 0 1-3 3.5M12 13v3.1m-3.4 4.4h6.8l-1.2-3.3H9.8Z" />
        </>
      )}
      {name === 'Tracking' && (
        <>
          <Circle cx={12} cy={13.4} r={7.8} fill={fill} />
          <Path d="M12 13.4V9.1m-2-6.9h4m-2 0v2.7m6.3 1.6 1.6-1.6" />
          <Circle cx={12} cy={13.4} r={1.1} fill={color} stroke="none" />
        </>
      )}
    </Svg>
  );
}

export default function BottomBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const tabs = state.routes.map((route, index) => ({ route, index }));
  // A screen can hide the dock (Tracking does during a workout).
  const current = descriptors[state.routes[state.index].key]?.options as any;
  if (current?.tabBarStyle?.display === 'none') return null;

  const tabTitles: Record<string, string> = {
    Discover: t('nav.discover'),
    Food: t('nav.food'),
    Compete: t('nav.compete'),
    Tracking: t('nav.tracking'),
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <LinearGradient
        pointerEvents="none"
        colors={GLASS.fade as [string, string, string]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Apple's Liquid Glass on iOS 26+, a flat panel on Android (see LiquidGlass). */}
      <LiquidGlass radius={DOCK_HEIGHT / 2} refracts style={styles.capsule}>
        <View style={styles.row}>
          {tabs.map(({ route, index }) => {
            const selected = state.index === index;
            const { options } = descriptors[route.key];
            const tabLabel = options.title ?? tabTitles[route.name] ?? route.name;
            return (
              <React.Fragment key={route.key}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={options.tabBarAccessibilityLabel ?? `${route.name} tab`}
                  accessibilityState={{ selected }}
                  aria-current={selected ? 'page' : undefined}
                  onPress={() => {
                    if (Platform.OS !== 'web') void Haptics.selectionAsync();
                    const event = navigation.emit({
                      type: 'tabPress',
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!selected && !event.defaultPrevented) {
                      navigation.navigate(route.name, route.params);
                    }
                  }}
                  onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                  style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
                >
                  <TabIcon name={route.name} selected={selected} />
                  <Text style={[styles.label, selected && styles.labelOn]}>
                    {tabLabel.toUpperCase()}
                  </Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      </LiquidGlass>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    // Absolute so the tab screens scroll beneath the glass. Screens reserve the
    // room with DOCK_SPACE from ../layout.
    container: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: DOCK_SIDE,
      paddingBottom: DOCK_INSET,
      paddingTop: 26,
    },
    capsule: {
      height: DOCK_HEIGHT,
      justifyContent: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    tab: {
      flex: 1,
      height: DOCK_HEIGHT - 10,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    pressed: {
      opacity: 0.65,
    },
    label: {
      fontFamily: 'InterBold',
      fontSize: 9,
      lineHeight: 12,
      letterSpacing: 0.8,
      color: GLASS.label,
    },
    labelOn: {
      color: GLASS.labelOn,
    },
  }),
);
