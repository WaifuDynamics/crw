# Run camera redesign: editorial viewfinder

Date: 15 September 2026
Scope: `apps/mobile/src/components/RunPhoto.tsx`, `RunFrame.tsx`, new camera primitives,
`apps/mobile/src/tracking/exportPhoto.web.ts`, the tracking smoke script.

## Goal

Make the run camera feel like a camera. The photo is the interface, chrome recedes
into frosted glass, and the runner shares a 9:16 story image that matches exactly
what they framed on screen.

## Decisions already made

- Direction: option 1, "editorial viewfinder". Clay primitives are not used on this screen.
- One overlay layout, **Hero**. An earlier draft carried a second "Ticker" layout and a
  swipeable rail; both were cut so the screen has a single, strong signature.
- No app-icon tile on the overlay. The `CRW+` wordmark carries the brand on its own.
- Export format: 9:16 story only, rendered at 1080 x 1920.
- The Tracking screen call site (`<RunPhoto run onBack />`) does not change.

## Screen structure

Three vertical bands on a `#05070A` page.

1. **Chrome row** (absolute, over the stage top): Back (left), status pill (centre), Flash (right).
   Status pill text: `VIEWFINDER` in blue tint while live, `YOUR SHOT` in lime tint after capture,
   `CAMERA OFF` neutral when there is no permission.
2. **Stage**: a strict 9:16 frame. Width is the smaller of the available width and
   `availableHeight * 9 / 16`, centred horizontally, `borderRadius` 22, `overflow: hidden`.
   The page colour shows as margin around it. The camera preview or captured image fills it,
   the active overlay layout sits on top. Horizontal swipe on the stage changes layout.
3. **Deck**: toggle pills, shutter row, primary action, hint. Bottom safe area respected.

The stage is measured with `onLayout` on a flexible container; the frame is sized from that
measurement so short or wide viewports shrink the stage rather than cropping it.

## Chrome style (glass)

- Fill `rgba(0,0,0,0.45)`, 1px border `rgba(255,255,255,0.18)`, fully rounded.
- Icons and text white. Disabled: opacity 0.4. Active accent: brand blue `#168BFF`.
- Shutter: 84px outer ring (3px white border, transparent fill), 4px gap, 66px solid white core.
  Retake mode: blue core with a `refresh` icon. Enable-camera mode: white core with `camera-outline`.
- Primary share action: full-width pill, blue fill, white text, `share-outline` icon.

Primitives live in a new `apps/mobile/src/components/glass.tsx`:
`GlassIconButton`, `GlassPill` (switch role, checked state), `GlassTag`, `Shutter`, `GlassButton`.

## The overlay

`apps/mobile/src/components/RunFrame.tsx` draws the CRW+ signature over the stage.

- Top row: `CRW+` in `DisplayItalic` 30 on the left, `MAKE YOUR MOVE.` small caps on the right.
  No icon tile.
- Bottom block: the date line (`15 SEPTEMBER 2026 · RUN`), distance in `DisplayItalic` 96 with a
  `KM` label on the baseline, a hairline rule, then `TIME` and `AVG PACE` side by side.
- The gradient covers only the bottom 58 percent, so faces and sky stay clear.
- Route on: a 96px route trace above the date line.
- Watermark, camera-off only: rotated `GO BEYOND. GO AGAIN. GO CRW+.` at very low opacity.
- Ink: white over a dark gradient by default, `#101216` over a light haze when Light ink is on.

## Controls and states

- Toggle pills: `Light ink` (switch) and `Include route` (switch; only when `run.points.length > 1`).
- Viewfinder: Gallery · Shutter (Take photo) · Flip camera. Hint: `Tap the shutter when the moment lines up.` or `Warming up the lens…`.
- After capture: Gallery · Retake · Save photo, then the full-width `Share my CRW+` button.
- Camera off: Gallery · Enable camera · Save photo, share button, and the permission hint.
  The stage shows the navy backdrop with the overlay on top. The backdrop must live on the
  captured frame view itself, not its parent: the web path captures only the frame node, and
  without a background the PNG comes out transparent and the white ink disappears.
- Permission prompting, gallery picking, error toasts and `useAction` busy handling stay as today.

## Export

`exportPhoto(frameRef, share, 1920)` on native. The web helper scales to 1080 wide from the
stage's own 9:16 box, so the output is 1080 x 1920. The `shape` state and the derived height
are removed.

**Pre-existing web bug, fixed here.** `html-to-image` caches the stylesheets it fetches, and on
the second and later captures it returns an incomplete set of `@font-face` rules: the Barlow
Condensed faces drop out, the overlay re-wraps in a fallback face, and the stats overlap. Every
shared photo after the first was corrupted. `exportPhoto.web.ts` now resolves the embed CSS once
with `getFontEmbedCSS` and passes it to every `toBlob` call, so captures two and beyond match the
first.

## Testing

- `npm run typecheck -w @crw/mobile`.
- `node scripts/tracking-smoke.mjs` against the running dev server, updated for the new switch
  name (`Light ink`) and saving an extra `artifacts/tracking-photo-light.png` screenshot.
- `node --test scripts/tracking-model.test.mjs`.
- View `artifacts/tracking-photo.png`, `artifacts/tracking-export.png` and
  `artifacts/tracking-photo-export.png` and confirm: 9:16 frame with margin, glass chrome,
  light ink works, the camera-off state is intact, and the second export keeps the display face
  rather than falling back and wrapping.
