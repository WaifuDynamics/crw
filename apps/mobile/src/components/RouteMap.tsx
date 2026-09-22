import React, { useEffect, useMemo, useRef } from 'react';
import { Point } from '../tracking/model';
import { routeDrawing } from '../tracking/routeStats';
import { MapHandle, MapWebView } from './MapWebView';

// Where a finished workout went (native, WebView): the route coloured by speed, with
// km markers, start and finish, fitted to the view. `interactive` turns on pan and zoom
// (the full-screen map); otherwise it is a still preview inside the scrolling summary.
export default function RouteMap({
  points,
  interactive = false,
  padding = [24, 24, 24, 24],
}: {
  points: Point[];
  interactive?: boolean;
  padding?: [number, number, number, number];
}) {
  const map = useRef<MapHandle>(null);
  const drawing = useMemo(() => routeDrawing(points), [points]);
  const first = points[0];

  useEffect(() => {
    map.current?.run({ type: 'drawing', drawing, fit: true, padding });
  }, [drawing, padding.join(',')]);

  return (
    <MapWebView
      ref={map}
      label="Map of the route, coloured by speed"
      center={{ latitude: first?.latitude ?? 52.2297, longitude: first?.longitude ?? 21.0122 }}
      zoom={15}
      zoomControl={interactive}
      interactive={interactive}
    />
  );
}
