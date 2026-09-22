import { Point } from '../tracking/model';

export type MapPoint = { lat: number; lng: number; segment: number };

/**
 * The route as map points, thinned to at most `max` so a long run stays quick to draw
 * and to send to the native map. Segment ends (pauses) are always kept.
 */
export function routeForMap(points: Point[], max = 1500): MapPoint[] {
  const step = Math.max(1, Math.ceil(points.length / max));
  const out: MapPoint[] = [];
  points.forEach((p, i) => {
    const edge =
      i === 0 ||
      i === points.length - 1 ||
      p.segment !== points[i - 1].segment ||
      p.segment !== points[i + 1]?.segment;
    if (edge || i % step === 0) out.push({ lat: p.latitude, lng: p.longitude, segment: p.segment });
  });
  return out;
}
