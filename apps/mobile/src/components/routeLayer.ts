import type { RouteDrawing } from '../tracking/routeStats';

// Draws a RouteDrawing (tracking/routeStats) with Leaflet. The same source runs inside the
// phone's map WebView (injected into the page) and on the website (compiled once with
// new Function), so both look the same. Plain ES5: old Android WebViews run it too.

export const DRAW_ROUTE_SOURCE = String.raw`
  layer.clearLayers();
  var i, j;
  for (i = 0; i < d.casings.length; i++)
    L.polyline(d.casings[i], { color: '#06182C', weight: 11, opacity: 0.5, lineJoin: 'round', lineCap: 'round', interactive: false }).addTo(layer);
  for (i = 0; i < d.lines.length; i++)
    L.polyline(d.lines[i].points, { color: d.lines[i].color, weight: 6, opacity: 1, lineJoin: 'round', lineCap: 'round', interactive: false }).addTo(layer);
  function icon(html, size) {
    return L.divIcon({ className: 'crw-route-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: html });
  }
  for (j = 0; j < d.markers.length; j++) {
    var m = d.markers[j], html, size, z = 0;
    if (m.kind === 'km') {
      size = 22;
      html = '<div style="width:22px;height:22px;border-radius:50%;background:#FFFFFF;color:#101216;border:2px solid #101216;' +
        'display:flex;align-items:center;justify-content:center;font:800 10px/1 system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.35)">' + m.label + '</div>';
    } else if (m.kind === 'start') {
      size = 26; z = 500;
      html = '<div style="width:26px;height:26px;border-radius:50%;background:#A9F06A;border:3px solid #FFFFFF;' +
        'display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.45)">' +
        '<div style="width:0;height:0;border-left:8px solid #0F1A08;border-top:5px solid transparent;border-bottom:5px solid transparent;margin-left:2px"></div></div>';
    } else {
      size = 28; z = 600;
      html = '<div style="width:28px;height:28px;border-radius:50%;border:3px solid #FFFFFF;box-shadow:0 2px 8px rgba(0,0,0,.45);' +
        'background:repeating-conic-gradient(#101216 0 25%, #FFFFFF 0 50%) 50% / 10px 10px"></div>';
    }
    L.marker([m.lat, m.lng], { icon: icon(html, size), interactive: false, keyboard: false, zIndexOffset: z }).addTo(layer);
  }
  if (fit && d.bounds) {
    var b = L.latLngBounds(d.bounds[0], d.bounds[1]);
    if (b.getNorth() === b.getSouth() && b.getEast() === b.getWest()) map.setView(b.getCenter(), 16, { animate: false });
    else map.fitBounds(b, { paddingTopLeft: [pad[3], pad[0]], paddingBottomRight: [pad[1], pad[2]], maxZoom: 17, animate: false });
  }
`;

type Draw = (
  L: any,
  map: any,
  layer: any,
  d: RouteDrawing,
  fit: boolean,
  pad: [number, number, number, number],
) => void;

let compiled: Draw | null = null;
/** The drawing function for the website's Leaflet. */
export function drawRoute(...args: Parameters<Draw>) {
  compiled ??= new Function('L', 'map', 'layer', 'd', 'fit', 'pad', DRAW_ROUTE_SOURCE) as Draw;
  compiled(...args);
}
