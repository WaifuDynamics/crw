import React, { useEffect, useId, useMemo, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { isLight } from '../theme';

// A liquid glass surface (web).
//
// The page behind the element is refracted, not just blurred: an SVG filter displaces
// the backdrop pixels with a map drawn for this exact shape. Near the rim the pixels are
// pulled in from further inside, like light bending through the rounded edge of a glass
// lens, and the three colour channels bend by slightly different amounts (a touch of
// chromatic aberration). The centre stays almost clear. Chromium-based browsers run the
// SVG backdrop filter; others get a frosted blur instead.

const BEZEL = 22; // px of the rim that bends on a large surface
const STRENGTH = 42; // largest pixel shift at the very edge
const GLOW = 18; // px of inner white glow at the rim
// A chip is a fraction of the dock's size, so its rim bends over fewer pixels.
const COMPACT_BEZEL = 9;

// The rim is a fraction of the shape, never a fixed slab: on a small round button a
// 22px bezel would swallow the whole face and the glass would read as a white disc.
// The caps keep large surfaces (the dock capsule, radius 32) exactly as they were.
const bezelFor = (radius: number, compact: boolean) =>
  Math.min(compact ? COMPACT_BEZEL : BEZEL, radius * 0.7);
const glowFor = (radius: number) => Math.min(GLOW, radius * 0.6);

const supportsRefraction = () => {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
  // The backdrop has to be filterable at all - Safari only knows the -webkit- name.
  const backdrop =
    CSS.supports('backdrop-filter', 'blur(1px)') ||
    CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
  // Only Blink applies an SVG filter to a backdrop. The CSS Paint API is Blink-only too,
  // and unlike the user agent string it is not rewritten by Chrome's device toolbar or
  // by a phone's "desktop site" switch, so the glass survives both. The user agent is
  // only a fallback for a Blink build without the paint worklet.
  const ua = navigator.userAgent;
  const blink =
    'paintWorklet' in CSS ||
    CSS.supports('background', 'paint(x)') ||
    (/Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua));
  return backdrop && blink;
};

/**
 * Displacement map for a rounded rectangle: red = x shift, green = y shift, 128 = none.
 * Each pixel near the edge samples from further inside along the edge normal.
 */
function displacementMap(w: number, h: number, radius: number, bezel: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(w, h);
  const r = Math.min(radius, w / 2, h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Distance to the edge of the rounded rectangle and the inward normal.
      const px = x + 0.5,
        py = y + 0.5;
      const cx = Math.min(Math.max(px, r), w - r);
      const cy = Math.min(Math.max(py, r), h - r);
      let nx = 0,
        ny = 0,
        d: number;
      const inCorner = (px < r || px > w - r) && (py < r || py > h - r);
      if (inCorner) {
        const vx = cx - px,
          vy = cy - py;
        const len = Math.hypot(vx, vy) || 1;
        d = r - len;
        nx = vx / len;
        ny = vy / len;
      } else {
        const left = px,
          right = w - px,
          top = py,
          bottom = h - py;
        d = Math.min(left, right, top, bottom);
        if (d === left) nx = 1;
        else if (d === right) nx = -1;
        else if (d === top) ny = 1;
        else ny = -1;
      }
      // Strong at the rim, gone past the bezel: a squared falloff like a curved edge.
      const t = Math.max(0, 1 - d / bezel);
      const mag = t * t;
      const i = (y * w + x) * 4;
      img.data[i] = 128 + nx * mag * 127;
      img.data[i + 1] = 128 + ny * mag * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function channel(id: string, scale: number, keep: 'r' | 'g' | 'b') {
  const m = {
    r: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
    g: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
    b: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
  }[keep];
  return [
    React.createElement('feDisplacementMap', {
      key: `${keep}-d`,
      in: 'SourceGraphic',
      in2: `${id}-map`,
      scale,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: `${id}-${keep}0`,
    }),
    React.createElement('feColorMatrix', {
      key: `${keep}-m`,
      in: `${id}-${keep}0`,
      type: 'matrix',
      values: m,
      result: `${id}-${keep}`,
    }),
  ];
}

export default function LiquidGlass({
  radius,
  style,
  sheen = true,
  children,
  /** A small surface (a chip): the rim bends over fewer pixels. */
  compact = false,
}: {
  radius: number;
  style?: StyleProp<ViewStyle>;
  /** The white rim, inner glow and specular cap. Off leaves only the refraction. */
  sheen?: boolean;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  const raw = useId();
  const id = `lg${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [map, setMap] = useState('');
  const refract = useMemo(supportsRefraction, []);
  const light = isLight();

  const bezel = bezelFor(radius, compact);
  const glow = glowFor(radius);

  useEffect(() => {
    if (!refract || !size.w || !size.h) return;
    setMap(displacementMap(Math.round(size.w), Math.round(size.h), radius, bezel));
  }, [refract, size.w, size.h, radius, bezel]);

  const glass = refract && map;
  const backdrop = glass
    ? `url(#${id}) saturate(1.6) brightness(${light ? 1.08 : 1.05})`
    : `blur(${compact ? 12 : 20}px) saturate(160%)`;

  return (
    <View
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          // The tint stays light so the refracted page shows through.
          backgroundColor: light ? 'rgba(255,255,255,0.28)' : 'rgba(18,22,30,0.28)',
          // Rim light: bright top-left edge, darker bottom edge, soft outer shadow.
          boxShadow: [
            ...(sheen
              ? [
                  light
                    ? 'inset 1px 1px 0 rgba(255,255,255,0.95)'
                    : 'inset 1px 1px 0 rgba(255,255,255,0.35)',
                  light
                    ? 'inset -1px -1px 0 rgba(255,255,255,0.5)'
                    : 'inset -1px -1px 0 rgba(255,255,255,0.10)',
                  `inset 0 0 ${glow}px rgba(255,255,255,0.08)`,
                ]
              : []),
            light ? '0 18px 38px rgba(27,42,64,0.16)' : '0 18px 38px rgba(0,0,0,0.55)',
          ].join(', '),
          backdropFilter: backdrop,
          WebkitBackdropFilter: glass ? undefined : backdrop,
        } as any,
        style,
      ]}
    >
      {refract &&
        map &&
        React.createElement(
          'svg',
          {
            width: 0,
            height: 0,
            'aria-hidden': true,
            style: { position: 'absolute', width: 0, height: 0 },
          },
          React.createElement(
            'filter',
            {
              id,
              x: 0,
              y: 0,
              width: size.w,
              height: size.h,
              filterUnits: 'userSpaceOnUse',
              primitiveUnits: 'userSpaceOnUse',
              colorInterpolationFilters: 'sRGB',
            },
            React.createElement('feImage', {
              href: map,
              x: 0,
              y: 0,
              width: size.w,
              height: size.h,
              preserveAspectRatio: 'none',
              result: `${id}-map`,
            }),
            // Red bends the most, blue the least: a faint rainbow along the rim.
            // The shift follows the bezel, so a narrow rim does not over-displace.
            ...channel(id, STRENGTH * (bezel / BEZEL), 'r'),
            ...channel(id, STRENGTH * (bezel / BEZEL) * 0.92, 'g'),
            ...channel(id, STRENGTH * (bezel / BEZEL) * 0.84, 'b'),
            React.createElement('feBlend', {
              in: `${id}-r`,
              in2: `${id}-g`,
              mode: 'screen',
              result: `${id}-rg`,
            }),
            React.createElement('feBlend', {
              in: `${id}-rg`,
              in2: `${id}-b`,
              mode: 'screen',
              result: `${id}-rgb`,
            }),
            React.createElement('feGaussianBlur', { in: `${id}-rgb`, stdDeviation: 0.7 }),
          ),
        )}
      {/* Specular highlight across the top of the glass. */}
      {sheen && (
        <View
          pointerEvents="none"
          style={
            {
              position: 'absolute',
              left: radius * 0.6,
              right: radius * 0.6,
              top: 1,
              height: '42%',
              borderRadius: radius,
              backgroundImage: light
                ? 'linear-gradient(to bottom, rgba(255,255,255,0.7), rgba(255,255,255,0))'
                : 'linear-gradient(to bottom, rgba(255,255,255,0.16), rgba(255,255,255,0))',
            } as any
          }
        />
      )}
      {children}
    </View>
  );
}
