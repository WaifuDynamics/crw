import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Point } from '../tracking/model';
import { routeDrawing } from '../tracking/routeStats';
import { tileLayer } from '../mapbox';
import { drawRoute } from './routeLayer';

// Where a finished workout went (web): the route coloured by speed, with km markers,
// start and finish, fitted to the view. `interactive` turns on pan and zoom (the
// full-screen map); otherwise it is a still preview inside the scrolling summary.
export default function RouteMap({
  points,
  interactive = false,
  padding = [24, 24, 24, 24],
}: {
  points: Point[];
  interactive?: boolean;
  padding?: [number, number, number, number];
}) {
  const host = useRef<HTMLDivElement>(null);
  const drawing = useMemo(() => routeDrawing(points), [points]);
  const pad = padding.join(',');

  useEffect(() => {
    const el = host.current;
    if (!el || !drawing.bounds) return;
    const m = L.map(el, {
      zoomControl: interactive,
      attributionControl: false,
      dragging: interactive,
      scrollWheelZoom: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
    });
    if (interactive) m.zoomControl?.setPosition('bottomright');
    tileLayer(L).addTo(m);
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(m);
    const layer = L.layerGroup().addTo(m);
    m.setView(drawing.bounds[0], 14, { animate: false });
    const fit = () => {
      const box = el.getBoundingClientRect();
      if (box.width < 10 || box.height < 10) return;
      m.invalidateSize({ animate: false });
      drawRoute(L, m, layer, drawing, true, padding);
    };
    fit();
    // Sheets slide in with a transform, which a ResizeObserver does not see: fit again
    // once the layout has settled.
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    const timers = [150, 450, 900, 1600].map((ms) => setTimeout(fit, ms));
    return () => {
      timers.forEach(clearTimeout);
      observer.disconnect();
      m.stop();
      m.off();
      m.remove();
    };
  }, [drawing, interactive, pad]);

  return (
    <div
      ref={host}
      style={{
        height: '100%',
        width: '100%',
        // A still preview lets clicks through to the card around it.
        pointerEvents: interactive ? 'auto' : 'none',
      }}
    />
  );
}
