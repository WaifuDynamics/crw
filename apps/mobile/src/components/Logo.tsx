import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { C } from '../theme';
import { LOGO_LETTERS, LOGO_PLUS, LOGO_RATIO, LOGO_VIEWBOX } from './logoPaths';

/** Logo height in the header of the tab screens, so Discover, Food and Tracking match. */
export const LOGO_HEIGHT = 32;

/**
 * The CRW+ wordmark. The letters take the theme's text colour (white on dark, near-black
 * on light) unless `color` is given; the plus is always brand blue.
 */
export default function Logo({
  height = 30,
  color,
  plusColor = '#168BFF',
}: {
  height?: number;
  color?: string;
  plusColor?: string;
}) {
  return (
    <Svg
      width={Math.round(height * LOGO_RATIO)}
      height={height}
      viewBox={LOGO_VIEWBOX}
      accessibilityRole="image"
      accessibilityLabel="CRW Plus"
    >
      <Path d={LOGO_LETTERS} fill={color ?? C.white} fillRule="evenodd" />
      <Path d={LOGO_PLUS} fill={plusColor} />
    </Svg>
  );
}
