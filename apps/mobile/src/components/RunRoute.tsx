import { tint } from '../theme';
import React from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { Point } from '../tracking/model';
export default function RunRoute({
  points,
  color = tint('#168BFF'),
  decorative = false,
}: {
  points: Point[];
  color?: string;
  decorative?: boolean;
}) {
  const lat = points.map((p) => p.latitude),
    lon = points.map((p) => p.longitude);
  const minLat = Math.min(...lat),
    maxLat = Math.max(...lat),
    minLon = Math.min(...lon),
    maxLon = Math.max(...lon);
  const cos = points.length ? Math.cos((points[0].latitude * Math.PI) / 180) : 1;
  const spanX = (maxLon - minLon) * cos,
    spanY = maxLat - minLat;
  const scale = Math.min(270 / (spanX || 0.0001), 145 / (spanY || 0.0001));
  const xy = points.map((p) => [
    160 + ((p.longitude - minLon) * cos - spanX / 2) * scale,
    90 - (p.latitude - minLat - spanY / 2) * scale,
  ]);
  const d = xy
    .map(
      ([x, y], i) =>
        `${i === 0 || points[i].segment !== points[i - 1].segment ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`,
    )
    .join(' ');
  return (
    <Svg viewBox="0 0 320 180" width="100%" height="100%">
      {decorative &&
        Array.from({ length: 10 }, (_, i) => (
          <Line
            key={i}
            x1={i * 42 - 80}
            y1="0"
            x2={i * 42 + 30}
            y2="180"
            stroke={tint('#FFFFFF')}
            strokeOpacity=".06"
          />
        ))}
      {decorative &&
        Array.from({ length: 6 }, (_, i) => (
          <Line
            key={`h${i}`}
            x1="0"
            y1={i * 36}
            x2="320"
            y2={i * 36 - 30}
            stroke={tint('#FFFFFF')}
            strokeOpacity=".06"
          />
        ))}
      {!!points.length && (
        <>
          <Path
            d={d}
            stroke={color}
            strokeWidth="12"
            strokeOpacity=".12"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d={d}
            stroke={color}
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={xy[0][0]} cy={xy[0][1]} r="5" fill={color} stroke="white" strokeWidth="2" />
          <Circle
            cx={xy[xy.length - 1][0]}
            cy={xy[xy.length - 1][1]}
            r="5"
            fill="white"
            stroke={color}
            strokeWidth="2"
          />
        </>
      )}
    </Svg>
  );
}
