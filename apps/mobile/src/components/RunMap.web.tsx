import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Point } from '../tracking/model';
import { tileLayer, watchUserLocation } from '../mapbox';
export default function RunMap({ points }: { points: Point[] }) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!host.current || !points.length) return;
    const m = L.map(host.current, { zoomControl: false, attributionControl: false }).setView(
      [points[0].latitude, points[0].longitude],
      16,
    );
    tileLayer(L).addTo(m);
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    // Live position on top of the recorded route (the route follows the recorder's fixes).
    const stopLocation = watchUserLocation(L, m, () => {});
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      stopLocation();
      // Stop any pan/zoom animation first; removing mid-animation throws in Leaflet.
      m.stop();
      m.off();
      m.remove();
    };
  }, []);
  useEffect(() => {
    if (!map.current || !layer.current || !points.length) return;
    layer.current.clearLayers();
    for (const segment of new Set(points.map((p) => p.segment))) {
      const line = points
        .filter((p) => p.segment === segment)
        .map((p) => [p.latitude, p.longitude] as L.LatLngTuple);
      // A dark casing under the line keeps it readable on light and dark tiles.
      L.polyline(line, {
        color: '#06182C',
        weight: 10,
        opacity: 0.45,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layer.current);
      L.polyline(line, { color: '#168BFF', weight: 6, lineCap: 'round', lineJoin: 'round' }).addTo(
        layer.current,
      );
    }
    const first = points[0];
    L.circleMarker([first.latitude, first.longitude], {
      radius: 6,
      color: '#fff',
      weight: 2,
      fillColor: '#A9F06A',
      fillOpacity: 1,
    }).addTo(layer.current);
    const last = points[points.length - 1];
    L.circleMarker([last.latitude, last.longitude], {
      radius: 14,
      stroke: false,
      fillColor: '#168BFF',
      fillOpacity: 0.22,
    }).addTo(layer.current);
    L.circleMarker([last.latitude, last.longitude], {
      radius: 7,
      color: '#fff',
      weight: 3,
      fillColor: '#168BFF',
      fillOpacity: 1,
    }).addTo(layer.current);
    map.current.panTo([last.latitude, last.longitude]);
  }, [points]);
  return <div ref={host} style={{ height: '100%', width: '100%' }} />;
}
