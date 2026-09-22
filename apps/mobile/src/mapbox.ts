// Map tiles for every Leaflet map in the web app. Mapbox when a public token is set,
// otherwise plain OpenStreetMap tiles, so a missing token never breaks a screen.
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
import { isLight } from './theme';
import { ME_ICON_HTML, ME_ICON_SIZE, ME_MARKER_CSS } from './components/mapMarker';

/** Mapbox style for the current theme; EXPO_PUBLIC_MAPBOX_STYLE overrides both. */
export const mapStyle = () =>
  process.env.EXPO_PUBLIC_MAPBOX_STYLE || (isLight() ? 'mapbox/light-v11' : 'mapbox/dark-v11');

// Compact map credit that fits inside the rounded map cards (web only).
function injectMapStyles() {
  if (typeof document === 'undefined') return;
  let style = document.getElementById('crw-map-styles');
  if (!style) {
    style = document.createElement('style');
    style.id = 'crw-map-styles';
    document.head.appendChild(style);
  }
  const [bg, ink] = isLight()
    ? ['rgba(255,255,255,.75)', '#5E6571']
    : ['rgba(8,9,11,.6)', '#969AA3'];
  style.textContent =
    `.leaflet-container{background:${isLight() ? '#E3E9F0' : '#10151c'}!important}` +
    (!isLight() && !MAPBOX_TOKEN && !process.env.EXPO_PUBLIC_MAP_TILE_URL
      ? '.leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) saturate(.55) brightness(.65)}'
      : '') +
    `.leaflet-control-attribution{font-size:8px!important;line-height:14px;background:${bg}!important;` +
    `color:${ink}!important;border-radius:6px;margin:0 0 8px 14px!important;padding:0 5px!important}` +
    `.leaflet-control-attribution a{color:${ink}!important}` +
    ME_MARKER_CSS;
}

export function tileLayer(L: any) {
  injectMapStyles();
  if (MAPBOX_TOKEN)
    return L.tileLayer(
      `https://api.mapbox.com/styles/v1/${mapStyle()}/tiles/512/{z}/{x}/{y}{r}?access_token=${MAPBOX_TOKEN}`,
      {
        tileSize: 512,
        zoomOffset: -1,
        maxZoom: 20,
        attribution:
          '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> ' +
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> ' +
          '<a href="https://www.mapbox.com/map-feedback/" target="_blank" rel="noopener"><strong>Improve this map</strong></a>',
      },
    );
  return L.tileLayer(
    process.env.EXPO_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  );
}

export type LocationState =
  | { status: 'locating' }
  | { status: 'found'; latitude: number; longitude: number; accuracy: number }
  | { status: 'denied' | 'unavailable' | 'unsupported' };

// Draws the person's live position (dot + accuracy ring) on a Leaflet map and keeps it
// updated. Returns a function that stops watching and removes the layers.
export function watchUserLocation(
  L: any,
  map: any,
  onChange: (state: LocationState) => void,
  { follow = false }: { follow?: boolean } = {},
) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onChange({ status: 'unsupported' });
    return () => {};
  }
  let ring: any = null;
  let dot: any = null;
  let first = true;
  onChange({ status: 'locating' });
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const at = [latitude, longitude];
      if (!ring) {
        ring = L.circle(at, {
          radius: accuracy,
          color: '#168BFF',
          weight: 1,
          fillColor: '#168BFF',
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(map);
        dot = L.marker(at, {
          interactive: false,
          keyboard: false,
          zIndexOffset: 1000,
          icon: L.divIcon({
            className: 'crw-me',
            html: ME_ICON_HTML,
            iconSize: [ME_ICON_SIZE, ME_ICON_SIZE],
            iconAnchor: [ME_ICON_SIZE / 2, ME_ICON_SIZE / 2],
          }),
        }).addTo(map);
      } else {
        ring.setLatLng(at).setRadius(accuracy);
        dot.setLatLng(at);
      }
      // No animation: a map can be removed (e.g. swapped for the route map) mid-animation,
      // and Leaflet then fails on its detached panes.
      if (first || follow)
        map.setView(at, first ? Math.max(map.getZoom(), 16) : map.getZoom(), { animate: false });
      first = false;
      onChange({ status: 'found', latitude, longitude, accuracy });
    },
    (err) => onChange({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
  return () => {
    navigator.geolocation.clearWatch(id);
    ring?.remove();
    dot?.remove();
  };
}

export function locationMessage(state: LocationState) {
  switch (state.status) {
    case 'locating':
      return 'Finding your location…';
    case 'found':
      return `You are here · accurate to ${Math.round(state.accuracy)} m`;
    case 'denied':
      return 'Location is blocked. Allow it in the address bar to see yourself on the map.';
    case 'unavailable':
      return 'No GPS signal right now. Move to an open area and try again.';
    default:
      return 'This browser cannot share its location.';
  }
}
