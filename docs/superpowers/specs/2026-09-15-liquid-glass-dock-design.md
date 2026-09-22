# Bottom navigation redesign: the liquid glass dock

Date: 15 September 2026
Scope: `apps/mobile/src/components/BottomBar.tsx`, `apps/mobile/src/layout.ts`,
`apps/mobile/App.tsx`, the four tab screens' bottom padding, a pages-bar smoke script.

## Goal

Replace the flat docked strip with a floating glass capsule in the iPhone "liquid glass"
manner, drawn in the CRW+ brand voice: near-black page, brand blue lens, condensed
uppercase micro-labels. Content passes underneath the dock instead of stopping above it.

## Direction

Three ideas were considered.

1. **Floating glass capsule.** Chosen. It is the closest honest read of liquid glass, and
   letting the page slide under it gives the app depth it does not have anywhere else.
2. Flat strip with a blurred fill. Cheaper, but it keeps the wall across the screen and the
   design reads as a tinted version of today's bar.
3. Glass capsule with a morphing blob behind the icons. More spectacle, more code, and the
   blob fights the brand's straight-edged type. A milder version of this, a blue pill that
   sprang between tabs, was built and then removed for the same reason.

## Structure

The bar is absolutely positioned over the scene (`left`, `right`, `bottom` at 0,
`pointerEvents="box-none"`), so the four tab screens scroll their content beneath it.

1. **Scrim.** A full-bleed `LinearGradient` from transparent to the page colour `#08090B`,
   so content dissolves as it slides under the dock rather than being cut off. It never
   receives touches.
2. **Capsule.** `marginHorizontal` 14, height 64, `borderRadius` 30, translucent fill
   `rgba(19,23,30,0.66)`, hairline rim `rgba(255,255,255,0.10)`. On web it also carries
   `backdropFilter: blur(20px) saturate(160%)`; native falls back to the translucent fill,
   which reads the same against the dark page.
3. **Sheen.** A top-down white gradient inside the capsule, clipped by its radius. This is
   the specular dome that makes the surface read as glass rather than as a grey card.
4. **Tabs.** Four equal flex cells, each an icon over an uppercase label.

Nothing is drawn behind the selected tab. An earlier draft carried a sliding blue lens pill;
it was cut, so ink alone carries the state and the capsule stays one uninterrupted surface.
Selection haptics are unchanged.

## Colour and type

- Active icon brand blue `#4FA8FF`, inactive `#9099A6`.
- Active label `#FFFFFF`, inactive `#8A919E`.
- Labels: `InterBold`, 9px, uppercase, `letterSpacing` 0.8. This matches the `S.label`
  micro-type used across Discover, Compete and Tracking.
- Icons keep the four existing concepts (compass, cloche, trophy, stopwatch) on a shared
  24 viewBox at 1.7 stroke. The selected icon gains a faint blue fill in its main shape.

## Layout budget

`apps/mobile/src/layout.ts` exports the dock metrics so screens and the bar agree:

```
DOCK_HEIGHT = 64
DOCK_INSET  = 12   // gap between the capsule and the safe area
DOCK_SPACE  = 94   // bottom padding a tab screen must reserve
```

Discover, Food and Compete pass `style={{ paddingBottom: DOCK_SPACE }}` to `Page`.
`TrackingDashboard` raises its scroll padding to `DOCK_SPACE`. Stack screens keep `Page`'s
default padding because no dock is drawn over them.

The app shell's safe-area colour moves from `#15181D` to the page colour `#08090B`, since
there is no longer a solid bar to match.

## Accessibility

Unchanged contract: each tab is a button named `<Route> tab`, exposes
`accessibilityState.selected` and `aria-current`, and the bar keeps `testID="pages-bar"`.
Cells are 64px tall and at least 64px wide at 320px viewport width, above the 44px target.

## Verification

- `npm run typecheck`
- `npm run test:pages-bar` captures the dock at 320, 430 and 1440 and on all four tabs, and
  asserts the capsule's floating width and height, the four tab buttons, the selected state
  and a clean console.
- `npm run test:tracking:ui` and `node scripts/mobile-layout-smoke.mjs` both pass.

The layout smoke script was looking for two controls the in-progress run camera work had
already renamed, `Connect health devices` and `Create photo`. It now uses the shipped names,
`Connect your watch` and `Open camera`. `npm run test:ui` still stops on Compete because the
seeded weekly XP window has expired, which `scripts/refresh-demo-xp.mjs` fixes once the API
releases the embedded database. Neither is related to the dock.
