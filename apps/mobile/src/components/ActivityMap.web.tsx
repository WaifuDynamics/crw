import { tint } from '../theme';
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { C } from '../ui';
import { tileLayer, watchUserLocation } from '../mapbox';
export default function ActivityMap({ events, center, onSelect }: any) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, { zoomControl: false, attributionControl: true }).setView(
      [center.latitude, center.longitude],
      13,
    );
    map.current = m;
    tileLayer(L).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    // Shows where the person is among the activities; centres on them on the first fix.
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
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !layer.current) return;
    const render = () => {
      layer.current!.clearLayers();
      const groups = new Map<string, any[]>();
      for (const event of events) {
        const pixel = m.project([event.latitude, event.longitude], m.getZoom());
        const key = `${Math.floor(pixel.x / 44)}:${Math.floor(pixel.y / 44)}`;
        groups.set(key, [...(groups.get(key) || []), event]);
      }
      for (const group of groups.values()) {
        const e = group[0];
        const icon = L.divIcon({
          className: 'crw-pin',
          html: `<div style="background:${C.blue};border:3px solid #7DBDFF;color:white;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 16px system-ui;box-shadow:0 0 0 7px #168bff1a">${group.length > 1 ? group.length : '↗'}</div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });
        const marker = L.marker([e.latitude, e.longitude], {
          icon,
          keyboard: true,
          title: group.length > 1 ? `${group.length} activities` : e.title,
        }).addTo(layer.current!);
        marker.on('click', () => {
          if (group.length > 1 && m.getZoom() < 17) {
            m.setView([e.latitude, e.longitude], m.getZoom() + 2);
          }
          callback.current(e);
        });
      }
    };
    render();
    m.on('zoomend', render);
    return () => {
      m.off('zoomend', render);
    };
  }, [events]);
  return (
    <div
      ref={host}
      aria-label="Map of upcoming fitness activities"
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        minHeight: 400,
        background: tint('#10151c'),
        zIndex: 0,
      }}
    />
  );
}
