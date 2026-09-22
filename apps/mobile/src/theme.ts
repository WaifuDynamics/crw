import { useEffect, useState } from 'react';
import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Dark and light appearance.
//
// The app was designed dark, and its colours are read from `C` (and from literal
// colours wrapped in `tint`) while rendering. Switching the theme swaps the values in
// `C`, rebuilds every stylesheet made with `themed`, and remounts the app, so nothing
// has to subscribe to the theme to pick it up.

export type ThemeMode = 'dark' | 'light' | 'system';
export type Scheme = 'dark' | 'light';

const DARK = {
  bg: '#08090B',
  panel: '#17191D',
  panel2: '#22252A',
  blue: '#168BFF',
  /** Main text and icons. Light on dark, dark on light. */
  white: '#F7F8FA',
  gray: '#969AA3',
  line: '#2B2E34',
  /** The inverse of `white`: text on a `white` surface. */
  black: '#101216',
  green: '#A9F06A',
  /** Always white: text and icons on blue, on photos and on other fixed dark surfaces. */
  onAccent: '#FFFFFF',
  error: '#FFA6A6',
  /** Behind the phone-width web app. */
  outside: '#030405',
};
const LIGHT: typeof DARK = {
  bg: '#F2F4F7',
  panel: '#FFFFFF',
  panel2: '#E7EBF0',
  blue: '#0A7CF0',
  white: '#101216',
  gray: '#5E6571',
  line: '#DCE1E8',
  black: '#FFFFFF',
  green: '#3E8E12',
  onAccent: '#FFFFFF',
  error: '#C62835',
  outside: '#DDE2E8',
};

export const C = { ...DARK };

let mode: ThemeMode = 'dark';
let scheme: Scheme = 'dark';
const rebuilders: (() => void)[] = [];
const listeners = new Set<() => void>();
const cache = new Map<string, string>();
const KEY = 'crw.theme';

export const isLight = () => scheme === 'light';
export const themeMode = () => mode;

/**
 * A stylesheet (or any object of styles) that is rebuilt when the theme changes.
 * `make` reads `C` and `tint`; the returned object keeps its identity.
 */
export function themed<T extends object>(make: () => T): T {
  const target = make();
  rebuilders.push(() => Object.assign(target, make()));
  return target;
}

const hex2 = (n: number) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

function hsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function rgb(h: number, s: number, l: number) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
    p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/**
 * The light-theme counterpart of a colour from the dark design.
 *
 * Near-black surfaces become near-white, light text becomes dark text, and dark tinted
 * panels (navy cards) become pale tints of the same hue. Bright accents keep their
 * colour. Black shadows stay black but lighter; white highlights become faint dark ones.
 */
export function lightOf(color: string): string {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const alpha = m[2] ? parseInt(m[2], 16) : 255;
  const { h, s, l } = hsl(r, g, b);
  // Shadows and scrims keep their darkness, a little softer.
  if (m[2] && l < 0.06) return `#${m[1]}${hex2(alpha * 0.55)}`;
  // Translucent white highlights read as faint dark overlays on a light page.
  if (m[2] && l > 0.94) return `#000000${hex2(alpha * 0.6)}`;
  let nl = l,
    ns = s;
  if (s < 0.2)
    nl = l < 0.25 ? 1 - l * 0.75 : l > 0.75 ? Math.max(0.07, 1 - l * 0.95) : 0.45 - (l - 0.5) * 0.3;
  else if (l < 0.35) {
    nl = 0.97 - l * 0.35;
    ns = Math.min(s, 0.75);
  } else if (l > 0.72) {
    nl = 0.32;
    ns = Math.min(1, s + 0.1);
  }
  const [nr, ng, nb] = rgb(h, ns, nl);
  return `#${hex2(nr * 255)}${hex2(ng * 255)}${hex2(nb * 255)}${m[2] ? m[2].toUpperCase() : ''}`;
}

/** A literal colour from the dark design, adapted to the current theme. */
export function tint(color: string): string {
  if (scheme === 'dark') return color;
  let out = cache.get(color);
  if (out === undefined) cache.set(color, (out = lightOf(color)));
  return out;
}

function resolve(m: ThemeMode): Scheme {
  if (m !== 'system') return m;
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

function apply() {
  const next = resolve(mode);
  if (next === scheme) return false;
  scheme = next;
  Object.assign(C, scheme === 'light' ? LIGHT : DARK);
  for (const rebuild of rebuilders) rebuild();
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.style.colorScheme = scheme;
    document.body.style.backgroundColor = C.outside;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', C.bg);
  }
  listeners.forEach((l) => l());
  return true;
}

/** Reads the saved choice. Call before the first render; dark when nothing is saved. */
export async function loadTheme() {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system') mode = saved;
  } catch {}
  apply();
  Appearance.addChangeListener(() => {
    if (mode === 'system') apply();
  });
}

export async function setThemeMode(next: ThemeMode) {
  mode = next;
  apply();
  listeners.forEach((l) => l());
  try {
    await AsyncStorage.setItem(KEY, next);
  } catch {}
}

/** The current mode and scheme; re-renders when either changes. */
export function useTheme() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { mode, scheme };
}
