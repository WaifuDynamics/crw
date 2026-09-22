import React, { useEffect, useRef } from 'react';
import { Point } from '../tracking/model';
import { MapHandle, MapWebView } from './MapWebView';

// The route of the run in progress, drawn on the Mapbox map (native, WebView).
export default function RunMap({ points }: { points: Point[] }) {
  const map = useRef<MapHandle>(null);
  const last = points[points.length - 1];

  useEffect(() => {
    map.current?.run({
      type: 'route',
      points: points.map((p) => ({ lat: p.latitude, lng: p.longitude, segment: p.segment })),
    });
  }, [points.length, last?.timestamp]);

  return (
    <MapWebView
      ref={map}
      label="Map of your run so far"
      center={{ latitude: last?.latitude ?? 52.2297, longitude: last?.longitude ?? 21.0122 }}
      zoom={16}
      zoomControl={false}
    />
  );
}
