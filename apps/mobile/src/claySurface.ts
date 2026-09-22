import { C, isLight, themed } from './theme';
import type { ViewStyle } from 'react-native';

// The clay surfaces themselves, with no UI components attached.
//
// Split out of components/clay.tsx so ui.tsx can dress its own primitives in clay:
// clay.tsx imports C, Icon, T and Tap from ui, so ui importing clay.tsx back would be a
// cycle. Nothing here imports anything but the theme.

/**
 * Claymorphism primitives for the CRW+ palette, dark or light.
 * Every clay surface is a puffy slab: a light rim on the top-left, a deep
 * shade on the bottom-right and a soft coloured drop shadow underneath.
 * Wells are the opposite: pressed into the page with inset shading.
 */
export type ClayTone =
  'graphite' | 'blue' | 'lime' | 'cream' | 'coral' | 'amber' | 'ember' | 'red' | 'navy';

type Recipe = { base: string; hi: string; lo: string; glow: string; ink: string; soft: string };

// Accent tones look the same in both themes. The neutral slabs swap: graphite and navy
// become white and pale clay on the light page, and cream (the contrasting slab) turns dark.
export const CLAY: Record<ClayTone, Recipe> = themed(() => ({
  graphite: isLight()
    ? {
        base: '#FFFFFF',
        hi: '#FFFFFF',
        lo: '#C5CFDB',
        glow: '#1B2A4024',
        ink: C.white,
        soft: '#5E6571',
      }
    : {
        base: '#1C2129',
        hi: '#3B4452',
        lo: '#04060A',
        glow: '#00000073',
        ink: C.white,
        soft: '#9AA3B2',
      },
  navy: isLight()
    ? {
        base: '#E8EEF5',
        hi: '#FFFFFF',
        lo: '#B7C4D4',
        glow: '#1B2A401C',
        ink: C.white,
        soft: '#5B6B80',
      }
    : {
        base: '#101722',
        hi: '#2A3646',
        lo: '#02040A',
        glow: '#00000066',
        ink: C.white,
        soft: '#8E9AAD',
      },
  blue: {
    base: C.blue,
    hi: '#8CCBFF',
    lo: '#0A4FA8',
    glow: '#168BFF55',
    ink: '#FFFFFF',
    soft: '#DCEEFF',
  },
  lime: {
    base: '#A9F06A',
    hi: '#E6FFCB',
    lo: '#5D9F2C',
    glow: '#A9F06A40',
    ink: '#0F1A08',
    soft: '#2F4C18',
  },
  cream: isLight()
    ? {
        base: '#1C2129',
        hi: '#3B4452',
        lo: '#04060A',
        glow: '#0000004D',
        ink: '#F7F8FA',
        soft: '#9AA3B2',
      }
    : {
        base: '#F1F4F8',
        hi: '#FFFFFF',
        lo: '#B4BFCD',
        glow: '#00000070',
        ink: '#0F141B',
        soft: '#5A6474',
      },
  coral: {
    base: '#F27894',
    hi: '#FFC5D2',
    lo: '#B03F5C',
    glow: '#F2789445',
    ink: '#FFFFFF',
    soft: '#FFE3EA',
  },
  amber: {
    base: '#FFD18B',
    hi: '#FFF0D6',
    lo: '#C2853A',
    glow: '#FFD18B40',
    ink: '#2B1D07',
    soft: '#5C4416',
  },
  // The destructive tone: deleting a run, discarding a workout.
  red: {
    base: '#E5484D',
    hi: '#FF9DA0',
    lo: '#8C1E24',
    glow: '#E5484D45',
    ink: '#FFFFFF',
    soft: '#FFDDDE',
  },
  ember: {
    base: '#FF7A3D',
    hi: '#FFB68F',
    lo: '#B5381A',
    glow: '#FF7A3D45',
    ink: '#FFFFFF',
    soft: '#FFE0CF',
  },
}));

/** Raised clay slab. `depth` scales the whole shading recipe. */
export function clay(tone: ClayTone = 'graphite', depth = 1): ViewStyle {
  const r = CLAY[tone];
  const d = depth;
  return {
    backgroundColor: r.base,
    boxShadow: [
      `inset ${2.5 * d}px ${2.5 * d}px ${5 * d}px ${r.hi}${tone === 'graphite' || tone === 'navy' ? '80' : 'C8'}`,
      `inset ${-4 * d}px ${-5 * d}px ${9 * d}px ${r.lo}D0`,
      `0 ${12 * d}px ${26 * d}px ${r.glow}`,
    ].join(', '),
  };
}

/** Pressed-in clay well for content that sits inside a slab (maps, routes, tracks). */
export function well(tone: 'dark' | 'blue' = 'dark'): ViewStyle {
  return tone === 'blue'
    ? {
        backgroundColor: '#0E6BD1',
        boxShadow: 'inset 4px 5px 10px #06407ECC, inset -2px -2px 5px #63B4FF70',
      }
    : isLight()
      ? {
          backgroundColor: '#E3E9F0',
          boxShadow: 'inset 4px 5px 10px #B3C0D0CC, inset -2px -2px 5px #FFFFFFE0',
        }
      : {
          backgroundColor: '#0D1015',
          boxShadow: 'inset 4px 5px 10px #020305E0, inset -2px -2px 5px #2C3440A0',
        };
}
