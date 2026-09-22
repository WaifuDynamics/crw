import { LEAFLET_CSS, LEAFLET_JS } from './leafletAssets';
import { MAPBOX_TOKEN, mapStyle } from '../mapbox';
import { isLight } from '../theme';
import type { RouteDrawing } from '../tracking/routeStats';
import { DRAW_ROUTE_SOURCE } from './routeLayer';
import { ME_ICON_HTML, ME_ICON_SIZE, ME_MARKER_CSS } from './mapMarker';

// The HTML page behind every native map. It is the same Leaflet + Mapbox map as the
// website, driven from React Native through window.CRW and talking back with
// ReactNativeWebView.postMessage. No Google Maps key is needed.

/** Page origin for the WebView, so a Mapbox token restricted to the site still works. */
export const MAP_BASE_URL = process.env.EXPO_PUBLIC_APP_URL || 'https://sport.konekocode.pl';

export type MapCommand =
  | { type: 'view'; lat: number; lng: number; zoom?: number }
  | { type: 'user'; lat: number; lng: number; accuracy: number; follow?: boolean }
  | { type: 'route'; points: { lat: number; lng: number; segment: number }[]; fit?: boolean }
  | { type: 'events'; events: { id: string; lat: number; lng: number; title: string }[] }
  | { type: 'recenter' }
  | {
      type: 'drawing';
      drawing: RouteDrawing;
      fit?: boolean;
      /** Extra room around the fitted route: top, right, bottom, left (px). */
      padding?: [number, number, number, number];
    };

export type MapMessage =
  { type: 'ready' } | { type: 'select'; id: string } | { type: 'error'; message: string };

const js = String.raw;

// Runs inside the WebView. Kept as plain ES5-ish JS for old Android WebViews.
const PAGE_SCRIPT = js`
(function () {
  var post = function (msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  };
  window.onerror = function (m) { post({ type: 'error', message: String(m) }); };
  var cfg = window.CRW_CONFIG;
  var map = L.map('map', { zoomControl: false, attributionControl: false })
    .setView([cfg.lat, cfg.lng], cfg.zoom);
  // Bottom-left keeps the credit clear of rounded corners and the recenter button.
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
  if (cfg.token) {
    L.tileLayer('https://api.mapbox.com/styles/v1/' + cfg.style + '/tiles/512/{z}/{x}/{y}{r}?access_token=' + cfg.token, {
      tileSize: 512, zoomOffset: -1, maxZoom: 20,
      attribution: '&copy; Mapbox &copy; OpenStreetMap'
    }).addTo(map);
  } else {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(map);
  }
  if (cfg.zoomControl) L.control.zoom({ position: 'topright' }).addTo(map);
  // A still preview (inside a scrolling screen): the map does not take the gestures.
  if (cfg.interactive === false) {
    map.dragging.disable(); map.touchZoom.disable(); map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable(); map.boxZoom.disable(); map.keyboard.disable();
    if (map.tap) map.tap.disable();
  }
  var drawing = L.layerGroup().addTo(map);
  function drawRoute(L, map, layer, d, fit, pad) {${DRAW_ROUTE_SOURCE}}

  var me = null, ring = null, last = null, firstFix = true;
  var route = L.layerGroup().addTo(map);
  var pins = L.layerGroup().addTo(map);
  var events = [];

  function setUser(c) {
    var at = [c.lat, c.lng];
    last = at;
    if (!me) {
      ring = L.circle(at, { radius: c.accuracy, color: '#168BFF', weight: 1, fillColor: '#168BFF', fillOpacity: 0.12, interactive: false }).addTo(map);
      me = L.marker(at, { interactive: false, keyboard: false, zIndexOffset: 1000, icon: L.divIcon({
        className: 'crw-me', iconSize: [${ME_ICON_SIZE}, ${ME_ICON_SIZE}], iconAnchor: [${ME_ICON_SIZE / 2}, ${ME_ICON_SIZE / 2}],
        html: ${JSON.stringify(ME_ICON_HTML)}
      }) }).addTo(map);
    } else {
      ring.setLatLng(at).setRadius(c.accuracy);
      me.setLatLng(at);
    }
    if (firstFix || c.follow) map.setView(at, firstFix ? Math.max(map.getZoom(), 16) : map.getZoom());
    firstFix = false;
  }

  function setRoute(c) {
    route.clearLayers();
    var bySegment = {};
    c.points.forEach(function (p) { (bySegment[p.segment] = bySegment[p.segment] || []).push([p.lat, p.lng]); });
    var all = [];
    Object.keys(bySegment).forEach(function (k) {
      // A dark casing under the line keeps it readable on light and dark tiles.
      L.polyline(bySegment[k], { color: '#06182C', weight: 10, opacity: 0.45, lineJoin: 'round', lineCap: 'round' }).addTo(route);
      L.polyline(bySegment[k], { color: '#168BFF', weight: 6, opacity: 1, lineJoin: 'round', lineCap: 'round' }).addTo(route);
      all = all.concat(bySegment[k]);
    });
    if (!all.length) return;
    var end = all[all.length - 1];
    L.circleMarker(all[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#A9F06A', fillOpacity: 1 }).addTo(route);
    L.circleMarker(end, { radius: 7, color: '#fff', weight: 3, fillColor: '#168BFF', fillOpacity: 1 }).addTo(route);
    if (c.fit && all.length > 1) map.fitBounds(L.latLngBounds(all), { padding: [24, 24], maxZoom: 17 });
    else map.setView(end, Math.max(map.getZoom(), 16));
  }

  function renderPins() {
    pins.clearLayers();
    var groups = {};
    events.forEach(function (e) {
      var px = map.project([e.lat, e.lng], map.getZoom());
      var key = Math.floor(px.x / 44) + ':' + Math.floor(px.y / 44);
      (groups[key] = groups[key] || []).push(e);
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], e = g[0];
      var icon = L.divIcon({ className: 'crw-pin', iconSize: [38, 38], iconAnchor: [19, 19],
        html: '<div style="background:#168BFF;border:3px solid #7DBDFF;color:#fff;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 16px system-ui;box-shadow:0 0 0 7px rgba(22,139,255,.1)">' + (g.length > 1 ? g.length : '&#8599;') + '</div>' });
      L.marker([e.lat, e.lng], { icon: icon }).addTo(pins).on('click', function () {
        if (g.length > 1 && map.getZoom() < 17) map.setView([e.lat, e.lng], map.getZoom() + 2);
        post({ type: 'select', id: e.id });
      });
    });
  }
  map.on('zoomend', renderPins);

  window.CRW = {
    run: function (c) {
      if (c.type === 'view') map.setView([c.lat, c.lng], c.zoom || map.getZoom());
      else if (c.type === 'user') setUser(c);
      else if (c.type === 'route') setRoute(c);
      else if (c.type === 'events') { events = c.events; renderPins(); }
      else if (c.type === 'recenter' && last) map.setView(last, Math.max(map.getZoom(), 16));
      else if (c.type === 'drawing') drawRoute(L, map, drawing, c.drawing, !!c.fit, c.padding || [24, 24, 24, 24]);
    }
  };
  window.addEventListener('resize', function () { map.invalidateSize(); });
  post({ type: 'ready' });
})();
`;

export function mapPageHtml(opts: {
  lat: number;
  lng: number;
  zoom: number;
  zoomControl?: boolean;
  interactive?: boolean;
  token?: string;
}) {
  const config = {
    lat: opts.lat,
    lng: opts.lng,
    zoom: opts.zoom,
    zoomControl: opts.zoomControl ?? true,
    interactive: opts.interactive ?? true,
    token: opts.token ?? MAPBOX_TOKEN,
    style: mapStyle(),
  };
  // "<" is escaped so no data can close the script tag.
  const safe = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
  const light = isLight();
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${LEAFLET_CSS}</style>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: ${light ? '#E3E9F0' : '#10151c'}; }
  .leaflet-control-attribution { font-size: 8px; line-height: 14px; background: ${light ? 'rgba(255,255,255,.75)' : 'rgba(8,9,11,.6)'} !important; color: ${light ? '#5E6571' : '#969AA3'}; border-radius: 6px; margin: 0 0 8px 14px !important; padding: 0 5px !important; }
  .leaflet-control-attribution a { color: ${light ? '#5E6571' : '#969AA3'}; }
  .leaflet-bar a { background: ${light ? '#FFFFFF' : '#17191D'}; color: ${light ? '#101216' : '#F7F8FA'}; border-color: ${light ? '#DCE1E8' : '#2B2E34'}; }
  ${!light && !MAPBOX_TOKEN ? '.leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) saturate(.55) brightness(.65)}' : ''}
  ${ME_MARKER_CSS}
</style>
</head><body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>window.CRW_CONFIG = ${safe(config)};</script>
<script>${PAGE_SCRIPT}</script>
</body></html>`;
}

/** JavaScript that runs one command inside the page. */
export const commandScript = (command: MapCommand) =>
  `window.CRW && window.CRW.run(${JSON.stringify(command).replace(/</g, '\\u003c')}); true;`;
