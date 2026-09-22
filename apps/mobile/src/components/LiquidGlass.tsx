import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { C, isLight } from '../theme';

// A glass surface.
//
// iOS 26+ draws Apple's own Liquid Glass: the content behind really bends through the edge
// of the shape. Older iOS blurs the backdrop natively.
//
// Android does NOT get liquid glass. The AndroidLiquidGlassView shader has to be pointed at
// a view whose contents it copies, and our dock and chips live inside the page they would
// refract - the copy then contains the surface, the render tree loops, and the render
// thread dies of a stack overflow (SIGSEGV in libhwui, prepareTreeImpl / computeTransformImpl
// on Android 16). It looked great on some devices and hard-crashed on others, so it is gone.
//
// Android does not get the frosted blur either any more. dimezisBlurView snapshots the
// backdrop on every frame, which costs more than it is worth on a surface that floats over
// a near-black page, and the translucency it bought made the dock read as smudged rather
// than solid. Android gets a plain panel instead: one flat colour, one soft shadow.
//
// Older iOS - before Apple's own Liquid Glass exists - still gets the glassmorphism below.

const isNativeGlassAvailable = (): boolean => {
  try {
    return (
      Platform.OS === 'ios' &&
      typeof isLiquidGlassAvailable === 'function' &&
      isLiquidGlassAvailable()
    );
  } catch {
    return false;
  }
};

const nativeGlass = isNativeGlassAvailable();
/** Only iOS frosts the backdrop now; Android is a flat panel. */
const canBlurBackdrop = Platform.OS === 'ios';

export default function LiquidGlass({
  radius,
  style,
  sheen = true,
  children,
  /** A small surface (a chip) wants a lighter rim and less lift. */
  compact = false,
  /** Kept for API compatibility; nothing refracts outside Apple's own Liquid Glass. */
  refracts: _refracts = false,
}: {
  radius: number;
  style?: StyleProp<ViewStyle>;
  /** The white rim, inner glow and specular cap. Off leaves only the blurred body. */
  sheen?: boolean;
  children?: React.ReactNode;
  compact?: boolean;
  refracts?: boolean;
}) {
  if (nativeGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
      >
        {children}
      </GlassView>
    );
  }

  const light = isLight();

  if (Platform.OS === 'android') {
    // A plain surface: the panel colour that sits on the page in each theme - a shade
    // lighter than the near-black background in the dark one, white on the grey one -
    // with a shadow to lift it and nothing else.
    return (
      <View
        style={[
          {
            borderRadius: radius,
            backgroundColor: light ? C.panel : C.panel2,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: compact ? 3 : 8 },
            shadowOpacity: light ? (compact ? 0.1 : 0.16) : compact ? 0.35 : 0.5,
            shadowRadius: compact ? 6 : 14,
            elevation: compact ? 3 : 10,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  // With no blur behind it the body carries the glass on its own, so it is a little
  // more opaque there.
  const glassFill = light
    ? canBlurBackdrop
      ? 'rgba(255, 255, 255, 0.74)'
      : 'rgba(255, 255, 255, 0.84)'
    : canBlurBackdrop
      ? 'rgba(18, 22, 30, 0.70)'
      : 'rgba(18, 22, 30, 0.84)';
  const rimTop = light ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.35)';
  const rimBorder = light ? 'rgba(255, 255, 255, 0.60)' : 'rgba(255, 255, 255, 0.12)';
  const rimBottom = light ? 'rgba(16, 18, 22, 0.08)' : 'rgba(0, 0, 0, 0.40)';

  return (
    <View
      style={[
        {
          borderRadius: radius,
          backgroundColor: glassFill,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: compact ? 4 : 10 },
          shadowOpacity: light ? (compact ? 0.08 : 0.14) : compact ? 0.3 : 0.48,
          shadowRadius: compact ? 8 : 18,
          elevation: compact ? 4 : 12,
        },
        style,
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            overflow: 'hidden',
            ...(sheen
              ? {
                  borderWidth: 1,
                  borderColor: rimBorder,
                  borderTopColor: rimTop,
                  borderTopWidth: compact ? 1 : 1.5,
                  borderBottomColor: rimBottom,
                }
              : null),
          },
        ]}
      >
        {/* iOS only by this point: Android returned above with a flat panel. */}
        {canBlurBackdrop && (
          <BlurView
            intensity={light ? 60 : 45}
            tint={light ? 'light' : 'dark'}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Translucent glass body. */}
        <LinearGradient
          pointerEvents="none"
          colors={
            light
              ? ['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.25)']
              : ['rgba(25, 30, 40, 0.45)', 'rgba(14, 17, 23, 0.55)']
          }
          style={StyleSheet.absoluteFill}
        />

        {/* Specular sheen: light hits the top curved edge of the glass. */}
        {sheen && (
          <LinearGradient
            pointerEvents="none"
            colors={
              light
                ? [
                    'rgba(255, 255, 255, 0.85)',
                    'rgba(255, 255, 255, 0.20)',
                    'rgba(255, 255, 255, 0.0)',
                  ]
                : [
                    'rgba(255, 255, 255, 0.22)',
                    'rgba(255, 255, 255, 0.04)',
                    'rgba(255, 255, 255, 0.0)',
                  ]
            }
            locations={[0, 0.48, 1]}
            style={[StyleSheet.absoluteFill, { height: '52%' }]}
          />
        )}

        {/* The glossy highlight along the top edge. */}
        {sheen && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: compact ? 1 : 2,
              left: radius * 0.55,
              right: radius * 0.55,
              height: compact ? 1 : 1.5,
              borderRadius: 1,
              backgroundColor: light ? 'rgba(255, 255, 255, 0.90)' : 'rgba(255, 255, 255, 0.35)',
            }}
          />
        )}
      </View>

      {children}
    </View>
  );
}
