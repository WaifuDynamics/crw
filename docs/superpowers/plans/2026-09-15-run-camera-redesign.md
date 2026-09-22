# Run Camera Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the run camera as a 9:16 editorial viewfinder with frosted-glass chrome and a single Hero overlay, exporting 1080 x 1920.

**Architecture:** `RunPhoto.tsx` owns the screen: it measures the stage area, fits a 9:16 frame, hosts the camera or picked photo, and renders the overlay on top. `RunFrame.tsx` draws the CRW+ signature. Camera-only glass primitives live in `glass.tsx` so the clay design system is untouched. The captured node is the frame itself, so the export is exactly the on-screen composition.

**Tech Stack:** Expo SDK 57, React Native 0.86, expo-camera, expo-linear-gradient, react-native-view-shot (native) / html-to-image (web), Playwright smoke script.

Spec: `docs/superpowers/specs/2026-09-15-run-camera-redesign-design.md`

---

### Task 1: Glass primitives

**Files:**
- Create: `apps/mobile/src/components/glass.tsx`

- [x] **Step 1: Write the primitives**

```tsx
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
  icon: string;
  tone?: 'white' | 'blue';
  disabled?: boolean;
  onPress: () => void;
}) {
  const core = tone === 'blue' ? GLASS.blue : GLASS.white;
  const ink = tone === 'blue' ? GLASS.white : '#0B0F15';
  return (
    <Tap label={label} disabled={disabled} onPress={onPress} style={st.ring}>
      <View style={[st.core, { backgroundColor: core }]}>
        <Icon name={icon} size={24} color={ink} />
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
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: GLASS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
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
```

- [x] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no output, exit 0.

### Task 2: The overlay

**Files:**
- Modify: `apps/mobile/src/components/RunFrame.tsx` (full rewrite)

The wordmark carries the brand alone; there is no app-icon tile. The gradient covers only the
bottom 58 percent so the top of the shot stays clear.

- [x] **Step 1: Rewrite the overlay**

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heading, Label } from '../ui';
import { Run, duration, pace } from '../tracking/model';
import RunRoute from './RunRoute';

/**
 * The CRW+ signature that rides on top of the shot: wordmark, date, distance
 * and splits. It is drawn over the live camera while framing and over the
 * captured still before export, so what you compose is exactly what you share.
 */
export type FrameProps = {
  run: Run;
  /** Black ink over a light haze, for bright scenes. Default is white ink. */
  light?: boolean;
  /** Draw the GPS trace when the run has one. */
  route?: boolean;
  /** Camera-off backdrop: a faint rotated brand chant behind the stats. */
  watermark?: boolean;
};

/** Clears the floating chrome row so the wordmark never sits under it. */
const CHROME_CLEARANCE = 82;
const DARK = '#040A14';
const LIGHT = '#F3F8FF';

export default function RunFrame({ run, light = false, route = false, watermark = false }: FrameProps) {
  const ink = light ? '#101216' : '#FFFFFF';
  const rule = light ? '#10121633' : '#FFFFFF44';
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={
          light ? ['#F3F8FF00', `${LIGHT}99`, `${LIGHT}F0`] : [`${DARK}00`, `${DARK}8C`, `${DARK}EB`]
        }
        locations={[0, 0.5, 1]}
        style={st.gradient}
      />
      {watermark && (
        <View style={st.watermark}>
          <Heading style={[st.watermarkText, { color: light ? '#07111E12' : '#FFFFFF0C' }]}>
            GO BEYOND.{`\n`}GO AGAIN.{`\n`}GO CRW+.
          </Heading>
        </View>
      )}
      <View style={st.inner}>
        <View style={st.top}>
          <Heading style={[st.wordmark, { color: ink }]}>CRW+</Heading>
          <Label style={[st.tagline, { color: ink }]}>MAKE YOUR MOVE.</Label>
        </View>
        <View>
          {route && run.points.length > 1 && (
            <View style={st.route}>
              <RunRoute points={run.points} color={ink} />
            </View>
          )}
          <Label style={[st.caption, { color: ink }]}>
            {new Date(run.startedAt)
              .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
              .toUpperCase()}{' '}
            · RUN
          </Label>
          <View style={st.distanceRow}>
            <Heading style={[st.distance, { color: ink }]}>
              {(run.meters / 1000).toFixed(2)}
            </Heading>
            <Label style={[st.unit, { color: ink }]}>KM</Label>
          </View>
          <View style={[st.stats, { borderColor: rule }]}>
            {[
              ['TIME', duration(run.seconds)],
              ['AVG PACE', `${pace(run.meters, run.seconds)} /km`],
            ].map(([label, value]) => (
              <View key={label}>
                <Label style={[st.statLabel, { color: ink }]}>{label}</Label>
                <Heading style={[st.statValue, { color: ink }]}>{value}</Heading>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  gradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '58%' },
  watermark: {
    position: 'absolute',
    top: '16%',
    left: -24,
    right: -24,
    transform: [{ rotate: '-12deg' }],
  },
  watermarkText: { fontSize: 100, lineHeight: 92 },
  inner: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: CHROME_CLEARANCE,
    paddingBottom: 30,
    justifyContent: 'space-between',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontFamily: 'DisplayItalic', fontSize: 30, lineHeight: 34 },
  tagline: { fontSize: 8 },
  route: { height: 96, marginBottom: 10 },
  caption: { fontSize: 8, opacity: 0.8 },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 2 },
  distance: { fontFamily: 'DisplayItalic', fontSize: 96, lineHeight: 100 },
  unit: { fontSize: 10 },
  statLabel: { fontSize: 7, opacity: 0.75 },
  stats: { flexDirection: 'row', gap: 28, borderTopWidth: 1, paddingTop: 14, marginTop: 4 },
  statValue: { fontSize: 26, lineHeight: 30, marginTop: 3 },
});
```


### Task 3: The camera screen

**Files:**
- Modify: `apps/mobile/src/components/RunPhoto.tsx` (full rewrite)

- [x] **Step 1: Rewrite the screen**

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraType, CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { S, T } from '../ui';
import { GlassButton, GlassIconButton, GlassPill, GlassTag, Shutter } from './glass';
import RunFrame from './RunFrame';
import { Run } from '../tracking/model';
import { exportPhoto } from '../tracking/exportPhoto';
import { useAction, useSession } from '../api';

/** Every export is a 9:16 story, rendered at 1080 x 1920. */
const STORY = 9 / 16;
const EXPORT_HEIGHT = 1920;

/**
 * The run camera. Opening it goes straight to the lens: a 9:16 stage shows the
 * live preview with the CRW+ overlay already on it, so the shot you frame is
 * the shot you share.
 */
export default function RunPhoto({ run, onBack }: { run: Run; onBack: () => void }) {
  const [photo, setPhoto] = useState<string>(),
    [facing, setFacing] = useState<CameraType>('back'),
    [flash, setFlash] = useState<FlashMode>('off'),
    [light, setLight] = useState(false),
    [route, setRoute] = useState(false),
    [ready, setReady] = useState(true),
    [live, setLive] = useState(false),
    [asked, setAsked] = useState(false),
    [box, setBox] = useState({ width: 0, height: 0 });
  const frame = useRef<View>(null),
    camera = useRef<CameraView>(null),
    { busy, run: act } = useAction(),
    { say } = useSession();
  const [permission, ask] = useCameraPermissions();
  // The viewfinder runs until a shot is taken. Without camera access the stage
  // falls back to the stats over the navy backdrop, which still exports.
  const viewfinder = !photo && !!permission?.granted;

  // Fit a 9:16 frame inside whatever the stage area gives us.
  const stage = useMemo(() => {
    const width = Math.floor(Math.min(box.width, box.height * STORY));
    return { width, height: Math.floor(width / STORY) };
  }, [box]);

  // Ask the moment the camera opens: no extra tap between the icon and the lens.
  useEffect(() => {
    if (!permission || permission.granted || asked) return;
    setAsked(true);
    if (permission.canAskAgain) void ask().catch(() => {});
  }, [permission, asked]);
  useEffect(() => {
    if (!viewfinder) setLive(false);
  }, [viewfinder]);

  async function enable() {
    const result = await ask();
    if (!result.granted)
      throw new Error('Allow camera access in your settings to shoot inside CRW+.');
  }
  async function shoot() {
    const shot = await camera.current?.takePictureAsync({ quality: 1 });
    if (!shot?.uri) throw new Error('That shot did not come through. Please try again.');
    setReady(false);
    setPhoto(shot.uri);
  }
  async function gallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1,
    });
    if (!result.canceled) {
      setReady(false);
      setPhoto(result.assets[0].uri);
    }
  }
  const retake = () => {
    setPhoto(undefined);
    setReady(true);
  };
  const save = (share: boolean) =>
    act(async () => {
      await exportPhoto(frame, share, EXPORT_HEIGHT);
      if (!share) say('Your CRW+ photo is saved.');
    });

  return (
    <View style={st.screen}>
      <SafeAreaView edges={['top']} style={st.stageArea}>
        <View
          style={st.stageFit}
          onLayout={(e: LayoutChangeEvent) => {
            const { width, height } = e.nativeEvent.layout;
            if (width !== box.width || height !== box.height) setBox({ width, height });
          }}
        >
          {stage.width > 0 && (
            <View style={[st.stage, stage]}>
              <View ref={frame} collapsable={false} pointerEvents="none" style={st.frame}>
                {viewfinder && (
                  <CameraView
                    ref={camera}
                    style={StyleSheet.absoluteFill}
                    facing={facing}
                    flash={flash}
                    mirror={facing === 'front'}
                    animateShutter={false}
                    onCameraReady={() => setLive(true)}
                    onMountError={() =>
                      say('This device camera could not start. Use Gallery instead.')
                    }
                  />
                )}
                {photo && (
                  <Image
                    source={{ uri: photo }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    onLoad={() => setReady(true)}
                    onError={() => {
                      retake();
                      say('Could not load that photo. Please choose another.');
                    }}
                  />
                )}
                <RunFrame run={run} light={light} route={route} watermark={!photo && !viewfinder} />
              </View>

              <View style={[S.between, st.chrome]} pointerEvents="box-none">
                <GlassIconButton icon="arrow-back" label="Back to run" onPress={onBack} />
                <GlassTag
                  text={photo ? 'YOUR SHOT' : viewfinder ? 'VIEWFINDER' : 'CAMERA OFF'}
                  tone={photo ? 'lime' : viewfinder ? 'blue' : 'neutral'}
                />
                <GlassIconButton
                  icon={flash === 'off' ? 'flash-off-outline' : 'flash-outline'}
                  label={flash === 'off' ? 'Turn flash on' : 'Turn flash off'}
                  active={flash !== 'off'}
                  color={flash !== 'off' ? '#FFD18B' : undefined}
                  disabled={!viewfinder}
                  onPress={() => setFlash(flash === 'off' ? 'on' : 'off')}
                />
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={st.deck}>
        <View style={[S.row, st.pills]}>
          <GlassPill label="Light ink" icon="sunny-outline" value={light} onChange={setLight} />
          {run.points.length > 1 && (
            <GlassPill
              label="Include route"
              icon="analytics-outline"
              value={route}
              onChange={setRoute}
            />
          )}
        </View>
        <View style={S.between}>
          <GlassIconButton
            icon="images-outline"
            label="Gallery"
            size={52}
            disabled={busy}
            onPress={() => act(gallery)}
          />
          {photo ? (
            <Shutter label="Retake" icon="refresh" tone="blue" disabled={busy} onPress={retake} />
          ) : viewfinder ? (
            <Shutter
              label="Take photo"
              icon="camera"
              disabled={busy || !live}
              onPress={() => act(shoot)}
            />
          ) : (
            <Shutter
              label="Enable camera"
              icon="camera-outline"
              disabled={busy}
              onPress={() => act(enable)}
            />
          )}
          {viewfinder ? (
            <GlassIconButton
              icon="camera-reverse-outline"
              label="Flip camera"
              size={52}
              onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
            />
          ) : (
            <GlassIconButton
              icon="download-outline"
              label="Save photo"
              size={52}
              active
              disabled={busy || !ready}
              onPress={() => save(false)}
            />
          )}
        </View>
        {viewfinder ? (
          <T style={st.hint}>
            {live ? 'Tap the shutter when the moment lines up.' : 'Warming up the lens…'}
          </T>
        ) : (
          <GlassButton
            title="Share my CRW+"
            icon="share-outline"
            loading={busy}
            disabled={!ready}
            onPress={() => save(true)}
          />
        )}
        {!photo && !viewfinder && (
          <T style={st.hint}>
            {Platform.OS === 'web'
              ? 'Camera access is off. Allow it in your browser, or pick a photo from your gallery.'
              : 'Camera access is off. Enable it, or pick a photo from your gallery.'}
          </T>
        )}
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#05070A' },
  stageArea: { flex: 1 },
  stageFit: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  stage: { borderRadius: 22, overflow: 'hidden' },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#112B44' },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, padding: 12 },
  deck: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: '#05070A',
  },
  pills: { gap: 10 },
  hint: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
```

- [x] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit 0.

Note: the navy backdrop must sit on the captured frame view, not on the outer stage view. The web
export captures the frame node only; without a background the PNG is transparent and white ink vanishes.

### Task 4: Fix repeat exports on web

**Files:**
- Modify: `apps/mobile/src/tracking/exportPhoto.web.ts`

Pre-existing bug, not introduced by the redesign: `html-to-image` caches fetched stylesheets and
returns an incomplete set of `@font-face` rules from the second capture onward. The Barlow
Condensed faces drop out, the overlay re-wraps in a fallback face and the stats overlap, so every
shared photo after the first is corrupted. Resolving the embed CSS once and reusing it fixes it.

- [x] **Step 1: Rewrite the web export helper**

```ts
import { getFontEmbedCSS, toBlob } from 'html-to-image';

/**
 * html-to-image caches the stylesheets it fetches, and on the second capture it
 * hands back an incomplete set of @font-face rules: the Barlow Condensed faces
 * drop out and the overlay re-wraps in a fallback face. Resolving the embed CSS
 * once and passing it to every capture keeps exports two and beyond identical
 * to the first.
 */
let fontCSS: Promise<string> | undefined;
const embedCSS = (node: HTMLElement) => (fontCSS ??= getFontEmbedCSS(node));

export async function exportPhoto(ref: any, share: boolean) {
  await document.fonts.ready;
  const node = ref.current as HTMLElement;
  const blob = await toBlob(node, {
    pixelRatio: 1080 / node.clientWidth,
    cacheBust: false,
    fontEmbedCSS: await embedCSS(node),
  });
  if (!blob) throw new Error('Could not create your photo. Please try again.');
  const file = new File([blob], 'my-crwplus.png', { type: 'image/png' });
  if (share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'My CRW+' });
  } else {
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = 'my-crwplus.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
```

- [x] **Step 2: Verify two consecutive exports match**

Export twice in a row from the camera with a photo picked, and confirm both PNGs render `CRW+`
and the distance in the condensed italic face with no wrapping.

### Task 5: Smoke test update and visual check

**Files:**
- Modify: `scripts/tracking-smoke.mjs`

- [x] **Step 1: Rename the ink switch and capture the light-ink state**

Replace `name: 'Light overlay'` with `name: 'Light ink'`, and after that click add:

```js
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'artifacts/tracking-photo-light.png' });
```

- [x] **Step 2: Run the tests**

Run from the repo root, with `npm run dev` serving http://localhost:8081:

```bash
node scripts/tracking-smoke.mjs
node --test scripts/tracking-model.test.mjs
```

Expected: the smoke script's last line is `Tracking UI passed: navigation, GPS distance, pause/resume, save/reload/delete, health availability, photo export.` and the model tests report `pass 5`, `fail 0`.

- [x] **Step 3: Inspect the screenshots**

Open `artifacts/tracking-photo.png` (camera off), `artifacts/tracking-photo-light.png`
(photo, light ink, route on), `artifacts/tracking-export.png` and
`artifacts/tracking-photo-export.png` (both 1080 x 1920). Confirm the 9:16 stage with margin,
glass chrome, light ink, and that the second export keeps the condensed italic face.

- [ ] **Step 4: Commit** (left for the user: the working tree holds unrelated uncommitted Tracking work that the smoke script also depends on)

```bash
git add apps/mobile/src/components/glass.tsx apps/mobile/src/components/RunFrame.tsx   apps/mobile/src/components/RunPhoto.tsx apps/mobile/src/tracking/exportPhoto.web.ts   scripts/tracking-smoke.mjs artifacts/tracking-photo.png artifacts/tracking-photo-light.png   artifacts/tracking-export.png artifacts/tracking-photo-export.png
git commit -m "Redesign the run camera as a 9:16 viewfinder"
```
