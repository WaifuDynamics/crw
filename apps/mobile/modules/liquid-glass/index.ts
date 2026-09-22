import { requireNativeModule, requireNativeView } from 'expo';
import { Platform } from 'react-native';
import type { ViewProps } from 'react-native';

// The Android side of the liquid glass (modules/liquid-glass/android). Everywhere else
// this module is absent, so `available` is false and the caller paints its own glass.
//
// Two views: the source marks what may be refracted (the screens), and the glass refracts
// it. The glass must not live inside the source - the shader copies the source, so a glass
// inside it would copy itself and the render tree would loop.

export type LiquidGlassProps = ViewProps & {
  /** Node handle of the source view whose contents to refract. */
  sourceId?: number | null;
  /** Corner radius in density-independent pixels. */
  cornerRadius?: number;
  /** 0.01 to 50. How soft the refracted image is. */
  blurRadius?: number;
  /** 0 to 1. How far apart the colour channels bend at the rim. */
  dispersion?: number;
  /** 12 to 50 dp: how deep the bending rim is. */
  refractionHeight?: number;
  /** 20 to 120 dp: how far the rim pulls the image in. */
  refractionOffset?: number;
  /** Red, green, blue and alpha, each from 0 to 1. */
  tint?: [number, number, number, number];
};

const nativeModule = (() => {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule('CrwLiquidGlass');
  } catch {
    // An older build of the app without the module in it.
    return null;
  }
})();

/** Whether this phone can draw the real thing (Android 13 and up). */
export const available: boolean = !!nativeModule?.isAvailable;

export const NativeLiquidGlass = available
  ? (requireNativeView(
      'CrwLiquidGlass',
      'CrwLiquidGlassView',
    ) as React.ComponentType<LiquidGlassProps>)
  : null;

export const NativeGlassSource = available
  ? (requireNativeView('CrwLiquidGlass', 'CrwLiquidGlassSource') as React.ComponentType<
      ViewProps & { ref?: React.Ref<unknown> }
    >)
  : null;
