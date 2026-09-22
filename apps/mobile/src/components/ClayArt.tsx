import { tint } from '../theme';
import React, { useId } from 'react';
import Svg, { Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { CLAY, ClayTone } from './clay';

/**
 * Claymorphic sport illustrations for Tracking.
 * Every shape is a "puff": a soft drop shadow, a radial-shaded body lit from
 * the top-left and, when it helps, a small white glint. The stopwatch mascot
 * fronts the page, standing on a running track; the rest speak the language
 * of run tracking: a round GPS watch with a progress ring, an ECG heart, a
 * pair of footprints, a burning flame, a racing flat and a race medal.
 */

const f = (n: number) => Math.round(n * 100) / 100;

const circ = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
const rrect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
/**
 * Three overlapping bumps on a flat base: one cloud, anchored at its top-left, scaled by `s`.
 * The outer lobes overhang the base so both ends round off rather than ending in a straight cut.
 */
const cloud = (x: number, y: number, s: number) =>
  `${circ(x + 12 * s, y + 8 * s, 13 * s)} ${circ(x + 30 * s, y, 17 * s)} ${circ(x + 47 * s, y + 9 * s, 13 * s)} ${rrect(x, y + 8 * s, 57 * s, 14 * s, 7 * s)}`;
/** Stadium: two straights joined by elliptical ends, as a running track seen from a low angle. */
const stadium = (cx: number, cy: number, hw: number, hh: number, rx: number) =>
  `M${cx - hw + rx} ${cy - hh}H${cx + hw - rx}A${rx} ${hh} 0 0 1 ${cx + hw - rx} ${cy + hh}H${cx - hw + rx}A${rx} ${hh} 0 0 1 ${cx - hw + rx} ${cy - hh}Z`;
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [f(cx + r * Math.cos(a)), f(cy + r * Math.sin(a))];
};
/** Clockwise arc from `from` to `to` degrees, 0 at twelve o'clock. */
const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M${x1} ${y1}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

function useIds() {
  return useId().replace(/[^a-zA-Z0-9]/g, '');
}

function Grads({ uid }: { uid: string }) {
  return (
    <Defs>
      {(Object.keys(CLAY) as ClayTone[]).map((tone) => (
        <RadialGradient key={tone} id={`${uid}-${tone}`} cx="32%" cy="28%" r="85%">
          <Stop offset="0" stopColor={CLAY[tone].hi} />
          <Stop offset="0.45" stopColor={CLAY[tone].base} />
          <Stop offset="1" stopColor={CLAY[tone].lo} />
        </RadialGradient>
      ))}
    </Defs>
  );
}

function Puff({
  uid,
  d,
  tone,
  dx = 2,
  dy = 3.5,
  shadow = 0.45,
  glint,
  transform,
}: {
  uid: string;
  d: string;
  tone: ClayTone;
  dx?: number;
  dy?: number;
  shadow?: number;
  glint?: [number, number, number, number, number?];
  transform?: string;
}) {
  return (
    <G transform={transform}>
      {shadow > 0 && (
        <Path d={d} fill={CLAY[tone].lo} opacity={shadow} transform={`translate(${dx} ${dy})`} />
      )}
      <Path d={d} fill={`url(#${uid}-${tone})`} />
      {glint && (
        <Ellipse
          cx={glint[0]}
          cy={glint[1]}
          rx={glint[2]}
          ry={glint[3]}
          fill={'#FFFFFF'}
          opacity={0.55}
          transform={`rotate(${glint[4] ?? -30} ${glint[0]} ${glint[1]})`}
        />
      )}
    </G>
  );
}

/** A coloured stroke sitting on the clay, with an optional darker offset so it reads as raised. */
function Ink({
  d,
  color,
  width,
  shade,
  dash,
  opacity = 1,
}: {
  d: string;
  color: string;
  width: number;
  shade?: string;
  dash?: string;
  opacity?: number;
}) {
  const shared = {
    d,
    strokeWidth: width,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <G>
      {shade && (
        <Path {...shared} stroke={shade} opacity={0.5 * opacity} transform="translate(1 2)" />
      )}
      <Path {...shared} stroke={color} strokeDasharray={dash} opacity={opacity} />
    </G>
  );
}

/* ----- Reusable parts, each drawn in its own 64-unit (watch: 64x84) box ----- */

/** Round GPS sports watch: tick bezel, blue face, lime progress ring, pace readout. */
function WatchParts({ uid }: { uid: string }) {
  return (
    <G>
      <Puff uid={uid} tone="navy" d={rrect(19, 0, 26, 26, 8)} dy={2} />
      <Puff uid={uid} tone="navy" d={rrect(19, 58, 26, 26, 8)} dy={2} />
      <Puff uid={uid} tone="graphite" d={rrect(54, 30, 7, 9, 3)} dy={1.5} />
      <Puff uid={uid} tone="graphite" d={rrect(54, 45, 7, 9, 3)} dy={1.5} />
      <Puff uid={uid} tone="graphite" d={circ(32, 42, 26)} dx={2.5} dy={4} shadow={0.55} />
      <Path
        d={circ(32, 42, 22.5)}
        fill="none"
        stroke={tint('#04060A')}
        strokeWidth={2}
        strokeDasharray="1.5 4.4"
        opacity={0.7}
      />
      <Path
        d={circ(32, 42, 18)}
        fill={tint('#0A4FA8')}
        opacity={0.7}
        transform="translate(0.5 1)"
      />
      <Path d={circ(32, 42, 18)} fill={`url(#${uid}-blue)`} />
      <Path
        d={arc(32, 42, 13.5, -135, 135)}
        stroke={tint('#0A4FA8')}
        strokeWidth={3.5}
        fill="none"
        strokeLinecap="round"
        opacity={0.8}
      />
      <Path
        d={arc(32, 42, 13.5, -135, 75)}
        stroke={tint('#A9F06A')}
        strokeWidth={3.5}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M26 40h12M28 46h8"
        stroke={'#FFFFFF'}
        strokeWidth={2.4}
        strokeLinecap="round"
        opacity={0.9}
      />
      <Ellipse
        cx={22}
        cy={30}
        rx={4}
        ry={2}
        fill={'#FFFFFF'}
        opacity={0.4}
        transform="rotate(-30 22 30)"
      />
    </G>
  );
}

const HEART = 'M32 58L12 39Q1 28 8 16Q14 6 25 8Q30 9 32 15Q34 9 40 8Q51 6 57 16Q64 28 52 39Z';
const ECG = 'M13 34h9l4-7 6 16 5-12 3 5h12';

/** Coral heart with an ECG trace across it. */
function HeartParts({ uid }: { uid: string }) {
  return (
    <G>
      <Puff uid={uid} tone="coral" d={HEART} glint={[19, 20, 6, 3, -35]} />
      <Ink d={ECG} color={'#FFFFFF'} width={3} shade={tint('#B03F5C')} />
    </G>
  );
}

const FLAME_OUTER =
  'M35 2C33 10 40 15 46 22C55 32 56 50 44 59C33 66 14 62 11 48C9 39 15 33 19 27C19 33 23 36 27 35C24 27 26 15 35 2Z';
const FLAME_INNER =
  'M34 24C36 32 44 36 45 45C46 54 40 59 33 59C25 59 20 54 21 46C22 41 25 39 27 36C27 41 30 42 31 41C30 35 31 30 34 24Z';

/** Ember flame with an amber tongue, a white-hot core and stray sparks: active energy burned. */
function FlameParts({ uid }: { uid: string }) {
  return (
    <G>
      <Puff
        uid={uid}
        tone="ember"
        d={FLAME_OUTER}
        dx={2}
        dy={4}
        shadow={0.5}
        glint={[17, 46, 3, 1.5, -60]}
      />
      <Puff uid={uid} tone="amber" d={FLAME_INNER} dy={1.5} shadow={0.3} />
      <Puff uid={uid} tone="cream" d={ellipse(33, 51, 4.5, 5.5)} dy={1} shadow={0} />
      <Puff uid={uid} tone="ember" d={circ(55, 11, 2.6)} dy={1.5} shadow={0.3} />
      <Puff uid={uid} tone="amber" d={circ(12, 16, 2)} dy={1.5} shadow={0.3} />
      <Puff uid={uid} tone="amber" d={circ(50, 3, 1.5)} dy={1} shadow={0} />
    </G>
  );
}

const SOLE =
  'M-8 -10C-5 -15.5 5 -15.5 8 -10C10.5 -3 9.5 6 7 13C5.5 17.5 -3 17.5 -5 13C-6.5 8 -2.5 5 -3.5 0C-4.5 -4 -9 -5 -8 -10Z';
const TOES: [number, number, number][] = [
  [-5.8, -19.2, 4],
  [1.8, -20.2, 3.3],
  [8.2, -17.4, 2.7],
];

/** One bare footprint: an arched sole and three toes. Drawn as a right foot; mirror for the left. */
function Footprint({
  uid,
  tone,
  transform,
  mirror,
}: {
  uid: string;
  tone: ClayTone;
  transform: string;
  mirror?: boolean;
}) {
  return (
    <G transform={`${transform}${mirror ? ' scale(-1 1)' : ''}`}>
      <Puff
        uid={uid}
        tone={tone}
        d={SOLE}
        dx={1.5}
        dy={3}
        shadow={0.5}
        glint={[-3, -8, 3.2, 1.6, -30]}
      />
      {TOES.map(([x, y, r]) => (
        <Puff
          key={`${x}${y}`}
          uid={uid}
          tone={tone}
          d={circ(x, y, r)}
          dx={1}
          dy={2}
          shadow={0.45}
        />
      ))}
    </G>
  );
}

/** A pair of staggered footprints: steps taken. */
function StepsParts({ uid, tone }: { uid: string; tone: ClayTone }) {
  return (
    <G>
      <Footprint uid={uid} tone={tone} transform="translate(43 25) rotate(10)" />
      <Footprint uid={uid} tone={tone} transform="translate(21 41) rotate(-10)" mirror />
    </G>
  );
}

/* ----- Exported illustrations ----- */

/** A smiling stopwatch sprinting on tiny sneakers around a running track. The Tracking mascot. */
export function HeroScene({
  width = 171,
  height = 136,
  compact,
}: {
  width?: number;
  height?: number;
  /** Narrow layouts wrap the headline onto a third line, so the track reaches less far right. */
  compact?: boolean;
}) {
  const uid = useIds();
  // The mascot stands at the left; the track is anchored under it and stretches right, and the
  // viewBox grows to fit. Cloud positions follow the track's right edge so the sky stays over it.
  const hw = compact ? 87 : 110;
  const cx = 2 + hw;
  const right = Math.max(220, cx + hw + 4);
  // The mascot is drawn around x=134; shifting the whole figure puts it over the left of the track.
  // It is then scaled about the point its sneakers rest on, so it shrinks without leaving the track.
  const shift = -48;
  const scale = 0.78;
  const stand = `translate(${shift} 0) translate(134 174) scale(${scale}) translate(-134 -174)`;
  const r = cx + hw;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${right} 180`} accessible={false} aria-hidden>
      <Grads uid={uid} />
      {/* running track: a wide stadium of ember lanes around a lime infield, finish line up front */}
      <Puff uid={uid} tone="ember" d={stadium(cx, 137, hw, 41.6, 46)} dx={1} dy={2} shadow={0.35} />
      <Path
        d={stadium(cx, 137, hw - 7, 32.2, 41)}
        fill="none"
        stroke={'#FFFFFF'}
        strokeWidth={1.3}
        strokeDasharray="4 4"
        opacity={0.7}
      />
      <Path
        d={stadium(cx, 137, hw - 14, 22.9, 36)}
        fill="none"
        stroke={'#FFFFFF'}
        strokeWidth={1.3}
        strokeDasharray="4 4"
        opacity={0.7}
      />
      <Puff uid={uid} tone="lime" d={stadium(cx, 137, hw - 23, 14, 28)} shadow={0} />
      <Path
        d="M138 155L141 177"
        stroke={'#FFFFFF'}
        strokeWidth={2.4}
        strokeLinecap="round"
        opacity={0.9}
      />
      {/* three clouds spread across the sky above the track: small left, large and medium right */}
      <Puff uid={uid} tone="cream" d={cloud(6, 14, 0.5)} glint={[17, 10, 3, 1.5]} />
      <Puff uid={uid} tone="cream" d={cloud(r - 80, 18, 0.9)} glint={[r - 53, 12, 5.4, 2.7]} />
      <Puff uid={uid} tone="cream" d={cloud(r - 46, 58, 0.62)} glint={[r - 32, 54, 3.7, 1.9]} />
      {/* crown + side button */}
      <G transform={stand}>
        <Puff uid={uid} tone="navy" d={rrect(130, 36, 10, 14, 3)} />
        <Puff uid={uid} tone="navy" d={rrect(125, 24, 20, 14, 5)} glint={[131, 28, 4, 1.6]} />
        <Puff uid={uid} tone="navy" d={rrect(172, 46, 16, 9, 4.5)} transform="rotate(42 180 50)" />
        {/* legs */}
        <Path
          d="M118 144 L110 162 M148 144 L158 160"
          stroke={tint('#0E1520')}
          strokeWidth={7.5}
          strokeLinecap="round"
        />
        {/* sneakers */}
        <Puff uid={uid} tone="cream" d={rrect(92, 166, 32, 7, 3.5)} dy={2} />
        <Puff uid={uid} tone="blue" d={rrect(93, 156, 30, 13, 6.5)} glint={[101, 159, 4, 1.6]} />
        <G transform="rotate(-16 168 160)">
          <Puff uid={uid} tone="cream" d={rrect(150, 165, 32, 7, 3.5)} dy={2} />
          <Puff uid={uid} tone="blue" d={rrect(151, 155, 30, 13, 6.5)} glint={[159, 158, 4, 1.6]} />
        </G>
        {/* body ring + face */}
        <Puff
          uid={uid}
          tone="navy"
          d={circ(134, 95, 53)}
          dx={3}
          dy={6}
          shadow={0.5}
          glint={[105, 62, 10, 4]}
        />
        <Puff uid={uid} tone="cream" d={circ(134, 95, 42)} dx={1} dy={2} shadow={0.35} />
        {/* ticks */}
        <Path
          d="M134 58v6M134 126v6M97 95h6M165 95h6M108 69l4 4M156 117l4 4M160 69l-4 4M112 117l-4 4"
          stroke={tint('#0E1520')}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.75}
        />
        {/* hand */}
        <Path
          d="M134 95 L157 72"
          stroke={tint('#5D9F2C')}
          strokeWidth={6.5}
          strokeLinecap="round"
          opacity={0.5}
          transform="translate(1 2)"
        />
        <Path
          d="M134 95 L157 72"
          stroke={tint('#A9F06A')}
          strokeWidth={6.5}
          strokeLinecap="round"
        />
        <Puff uid={uid} tone="blue" d={circ(134, 95, 5.5)} dy={1.5} shadow={0.3} />
        {/* face */}
        <Path d={`${circ(122, 106, 3.6)} ${circ(146, 106, 3.6)}`} fill={tint('#0E1520')} />
        <Ellipse cx={114} cy={114} rx={5.5} ry={3.2} fill={tint('#F27894')} opacity={0.7} />
        <Ellipse cx={154} cy={114} rx={5.5} ry={3.2} fill={tint('#F27894')} opacity={0.7} />
        <Path
          d="M124 116 Q134 126 144 116"
          stroke={tint('#0E1520')}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
      </G>
    </Svg>
  );
}

/** Low-profile racing flat with a lime outsole and speed lines. */
export function ClayShoe({ width = 96, height = 58 }: { width?: number; height?: number }) {
  const uid = useIds();
  return (
    <Svg width={width} height={height} viewBox="0 0 120 72" accessible={false} aria-hidden>
      <Grads uid={uid} />
      <Ellipse cx={66} cy={69} rx={46} ry={3} fill={tint('#000000')} opacity={0.35} />
      <Path d={rrect(0, 30, 18, 5, 2.5)} fill={tint('#F1F4F8')} opacity={0.7} />
      <Path d={rrect(6, 41, 13, 5, 2.5)} fill={tint('#F1F4F8')} opacity={0.45} />
      <Path d={rrect(2, 52, 10, 5, 2.5)} fill={tint('#F1F4F8')} opacity={0.28} />
      <Puff uid={uid} tone="lime" d="M18 56Q14 68 28 68L106 68Q120 66 116 56Z" dy={2.5} />
      <Path
        d="M34 63h8M50 63h8M66 63h8M82 63h8"
        stroke={tint('#5D9F2C')}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.8}
      />
      <Puff
        uid={uid}
        tone="blue"
        d="M20 56L24 36Q26 22 38 20L54 16Q62 15 68 22L88 44L106 50Q116 52 116 56Z"
        glint={[38, 27, 7, 3]}
      />
      <Puff uid={uid} tone="navy" d={rrect(24, 26, 9, 12, 4)} dy={1.5} shadow={0.3} />
      <G transform="rotate(34 60 34)">
        <Puff uid={uid} tone="cream" d={rrect(48, 26, 14, 4.5, 2.2)} dy={1.5} shadow={0.3} />
        <Puff uid={uid} tone="cream" d={rrect(48, 34, 14, 4.5, 2.2)} dy={1.5} shadow={0.3} />
        <Puff uid={uid} tone="cream" d={rrect(48, 42, 14, 4.5, 2.2)} dy={1.5} shadow={0.3} />
      </G>
      <Path
        d="M50 30l6 4M56 25l6 4"
        stroke={tint('#101722')}
        strokeWidth={2.2}
        strokeLinecap="round"
        opacity={0.7}
      />
      <Path
        d="M26 57Q60 54 112 57"
        stroke={'#FFFFFF'}
        strokeWidth={1.8}
        strokeLinecap="round"
        opacity={0.5}
      />
    </Svg>
  );
}

/** A pair of staggered footprints. */
export function ClaySteps({
  size = 44,
  tone = 'blue' as ClayTone,
}: {
  size?: number;
  tone?: ClayTone;
}) {
  const uid = useIds();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false} aria-hidden>
      <Grads uid={uid} />
      <StepsParts uid={uid} tone={tone} />
    </Svg>
  );
}

/** Ember flame with a white-hot core. */
export function ClayFlame({ size = 44 }: { size?: number }) {
  const uid = useIds();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false} aria-hidden>
      <Grads uid={uid} />
      <FlameParts uid={uid} />
    </Svg>
  );
}

/** Coral heart with an ECG trace. */
export function ClayHeart({ size = 44 }: { size?: number }) {
  const uid = useIds();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false} aria-hidden>
      <Grads uid={uid} />
      <HeartParts uid={uid} />
    </Svg>
  );
}

/** Round GPS sports watch with a lime progress ring. */
export function ClayWatch({ width = 44, height = 58 }: { width?: number; height?: number }) {
  const uid = useIds();
  return (
    <Svg width={width} height={height} viewBox="0 0 64 84" accessible={false} aria-hidden>
      <Grads uid={uid} />
      <WatchParts uid={uid} />
    </Svg>
  );
}

/** Race medal: striped ribbon, lime disc, lightning mark. The "in the books" badge. */
export function ClayMedal({ size = 84 }: { size?: number }) {
  const uid = useIds();
  return (
    <Svg
      width={size}
      height={size * (110 / 90)}
      viewBox="0 0 90 110"
      accessible={false}
      aria-hidden
    >
      <Grads uid={uid} />
      <Puff uid={uid} tone="blue" d="M22 2L46 54L34 63L6 2Z" />
      <Path
        d="M15 4L40 58"
        stroke={'#FFFFFF'}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.35}
      />
      <Puff uid={uid} tone="navy" d="M68 2L84 2L56 63L44 54Z" />
      <Path
        d="M75 4L50 58"
        stroke={tint('#8CCBFF')}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.45}
      />
      <Puff uid={uid} tone="graphite" d={rrect(39, 44, 12, 9, 3)} dy={1.5} />
      <Puff
        uid={uid}
        tone="lime"
        d={circ(45, 77, 29)}
        dx={2.5}
        dy={5}
        shadow={0.5}
        glint={[31, 61, 7, 3.5]}
      />
      <Path
        d={circ(45, 77, 22)}
        fill="none"
        stroke={tint('#5D9F2C')}
        strokeWidth={2.5}
        opacity={0.7}
      />
      <Path
        d="M49 59L35 81H45L41 96L56 73H46Z"
        fill={tint('#5D9F2C')}
        opacity={0.5}
        transform="translate(0 1.5)"
      />
      <Path d="M49 59L35 81H45L41 96L56 73H46Z" fill={tint('#0F1A08')} />
    </Svg>
  );
}

/** Health provider app tiles: a cream tile with a coral heart for Apple Health, a lime tile with a pulse heart for Health Connect. */
export function ClayProvider({ kind, size = 48 }: { kind: 'apple' | 'connect'; size?: number }) {
  const uid = useIds();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false} aria-hidden>
      <Grads uid={uid} />
      <Puff
        uid={uid}
        tone={kind === 'apple' ? 'cream' : 'lime'}
        d={rrect(5, 5, 54, 54, 15)}
        dx={2.5}
        dy={4}
        shadow={0.5}
        glint={[15, 13, 6, 2.5]}
      />
      <G transform="translate(14 14) scale(0.56)">
        {kind === 'apple' ? (
          <Puff uid={uid} tone="coral" d={HEART} dx={2.5} dy={4} glint={[19, 20, 6, 3, -35]} />
        ) : (
          <>
            <Puff uid={uid} tone="navy" d={HEART} dx={2.5} dy={4} />
            <Ink d={ECG} color={tint('#A9F06A')} width={3.4} />
          </>
        )}
      </G>
    </Svg>
  );
}

/** Setup step drawings for the connections sheet: a syncing watch, a sharing toggle, a route flowing into the phone. */
export function ClayStep({
  kind,
  size = 44,
}: {
  kind: 'sync' | 'share' | 'import';
  size?: number;
}) {
  const uid = useIds();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false} aria-hidden>
      <Grads uid={uid} />
      {kind === 'sync' && (
        <>
          <G transform="translate(10 4) scale(0.66)">
            <WatchParts uid={uid} />
          </G>
          <Puff uid={uid} tone="lime" d={circ(51, 15, 10)} dy={2} shadow={0.4} />
          <Path
            d={`${arc(51, 15, 5.5, -150, 60)} M55.8 12.3l-3.2 0.3M55.8 12.3l-0.6-3.1`}
            stroke={tint('#0F1A08')}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d={`${arc(51, 15, 5.5, 30, 240)} M46.2 17.8l3.2-0.3M46.2 17.8l0.6 3.1`}
            stroke={tint('#0F1A08')}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {kind === 'share' && (
        <>
          <Puff uid={uid} tone="navy" d={rrect(6, 20, 52, 24, 12)} dx={2} dy={3.5} />
          <Ink d="M16 32l5 5 9-10" color={tint('#A9F06A')} width={3} />
          <Puff
            uid={uid}
            tone="lime"
            d={circ(45, 32, 9)}
            dy={2}
            shadow={0.4}
            glint={[41, 28, 3, 1.4]}
          />
        </>
      )}
      {kind === 'import' && (
        <>
          <Puff uid={uid} tone="navy" d={rrect(28, 4, 30, 56, 8)} dx={2.5} dy={4} shadow={0.5} />
          <Path
            d={rrect(32, 10, 22, 40, 4)}
            fill={tint('#0A4FA8')}
            opacity={0.7}
            transform="translate(0.5 1)"
          />
          <Path d={rrect(32, 10, 22, 40, 4)} fill={`url(#${uid}-blue)`} />
          <Path
            d="M38 54h10"
            stroke={tint('#F1F4F8')}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.8}
          />
          <Ink
            d="M6 46C14 46 14 26 24 26L40 26"
            color={tint('#A9F06A')}
            width={4}
            shade={tint('#5D9F2C')}
          />
          <Ink d="M36 21l5 5-5 5" color={tint('#A9F06A')} width={3} shade={tint('#5D9F2C')} />
          <Puff uid={uid} tone="cream" d={circ(6, 46, 5)} dy={1.5} shadow={0.35} />
          <Path d={circ(6, 46, 2.2)} fill={tint('#168BFF')} />
        </>
      )}
    </Svg>
  );
}

/** GPS watch pulling in the daily health signals, for the connections sheet. */
export function HealthScene({ width = 220, height = 150 }: { width?: number; height?: number }) {
  const uid = useIds();
  return (
    <Svg width={width} height={height} viewBox="0 0 220 150" accessible={false} aria-hidden>
      <Grads uid={uid} />
      <Ellipse cx={110} cy={146} rx={70} ry={4} fill={tint('#000000')} opacity={0.4} />
      <Path
        d={circ(122, 72, 62)}
        fill="none"
        stroke={'#FFFFFF'}
        strokeWidth={1.6}
        strokeDasharray="2 7"
        strokeLinecap="round"
        opacity={0.28}
      />
      <G transform="translate(14 16) scale(0.85) rotate(-10 32 32)">
        <HeartParts uid={uid} />
      </G>
      <G transform="translate(160 6) scale(0.78)">
        <StepsParts uid={uid} tone="blue" />
      </G>
      <G transform="translate(166 86) scale(0.8) rotate(8 32 32)">
        <FlameParts uid={uid} />
      </G>
      <G transform="translate(70 4) scale(1.62)">
        <WatchParts uid={uid} />
      </G>
    </Svg>
  );
}
