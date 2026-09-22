import { tint } from '../theme';
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationState, locationMessage, tileLayer, watchUserLocation } from '../mapbox';
import { CLAY, clay } from './clay';

// A live map of where the person is right now, following them as they move.
// Nothing sits over the map while the fix is good - the marker says everything. A clay
// status pill only appears when location is actually broken, next to a small clay
// recenter bubble. `clay()` hands back real CSS, so the same recipe that shades the
// native slabs shades these too.
export default function LiveMap({ height = 220 }: { height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const [state, setState] = useState<LocationState>({ status: 'locating' });

  useEffect(() => {
    if (!host.current) return;
    // Warsaw until the first fix arrives.
    const m = L.map(host.current, { zoomControl: false, attributionControl: false }).setView(
      [52.2297, 21.0122],
      12,
    );
    map.current = m;
    tileLayer(L).addTo(m);
    // Inside a rounded card: credit bottom-left, clear of the corners and the buttons.
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(m);
    const stop = watchUserLocation(L, m, setState, { follow: true });
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      stop();
      // Stop any pan/zoom animation first; removing mid-animation throws in Leaflet.
      m.stop();
      m.off();
      m.remove();
    };
  }, []);

  const recenter = () => {
    if (state.status === 'found' && map.current)
      map.current.setView([state.latitude, state.longitude], Math.max(map.current.getZoom(), 16));
  };

  const found = state.status === 'found';
  // Only speak up when something is wrong; a good fix needs no caption.
  const problem = state.status !== 'found' && state.status !== 'locating';
  const pill = clay('navy', 0.6) as any;
  const bubble = clay('blue', 0.8) as any;

  return (
    <div style={{ position: 'relative', height, width: '100%', background: tint('#10151c') }}>
      <div
        ref={host}
        aria-label="Map of your current location"
        style={{ height: '100%', width: '100%' }}
      />
      {problem && (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            right: 56,
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: pill.backgroundColor,
            boxShadow: pill.boxShadow,
            color: CLAY.navy.ink,
            font: '600 11px/1.4 Inter, system-ui, sans-serif',
            padding: '9px 11px',
            borderRadius: 15,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              flexShrink: 0,
              borderRadius: 4,
              background: tint('#FFD18B'),
            }}
          />
          {locationMessage(state)}
        </div>
      )}
      {found && (
        <button
          type="button"
          onClick={recenter}
          aria-label="Center the map on me"
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: 17,
            border: 'none',
            padding: 0,
            background: bubble.backgroundColor,
            boxShadow: bubble.boxShadow,
            color: CLAY.blue.ink,
            cursor: 'pointer',
          }}
        >
          {/* A navigation arrow, the way a running app points you back to yourself. */}
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20.6 3.4 4.2 10.1c-1 .4-.9 1.9.2 2.1l6 1.4 1.4 6c.2 1.1 1.7 1.2 2.1.2l6.7-16.4z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
