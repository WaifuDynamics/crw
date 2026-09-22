import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { MAPBOX_TOKEN } from './mapbox';
import { countryName, deviceCountry } from './countries';

// Where the person actually is, as "City" for headers. Resolved from the device's
// position (Mapbox reverse geocoding on the web, the platform geocoder in the app) and
// remembered for a while, so screens don't re-ask on every visit.

export type Place = {
  city: string | null;
  country: string | null;
  countryCode: string | null;
  /** Where the name came from. Kept so callers can ask the server what is nearby. */
  lat?: number;
  lng?: number;
  at: number;
};

const KEY = 'crw.place.v2';
const FRESH_MS = 30 * 60 * 1000;
let memory: Place | null = null;
const listeners = new Set<(p: Place) => void>();

function readCache(): Place | null {
  if (memory) return memory;
  if (Platform.OS !== 'web') return null;
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (p && typeof p.at === 'number') memory = p;
  } catch {
    /* storage unavailable */
  }
  return memory;
}

function store(p: Place) {
  memory = p;
  if (Platform.OS === 'web')
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* storage unavailable */
    }
  listeners.forEach((l) => l(p));
}

async function reverseMapbox(lat: number, lng: number): Promise<Place | null> {
  if (!MAPBOX_TOKEN) return null;
  const q = new URLSearchParams({
    longitude: String(lng),
    latitude: String(lat),
    types: 'place,locality,district,region,country',
    language: 'en',
    access_token: MAPBOX_TOKEN,
  });
  const r = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${q}`);
  if (!r.ok) return null;
  const features: any[] = (await r.json()).features || [];
  const props = (type: string) =>
    features.find((f) => f.properties?.feature_type === type)?.properties;
  const ctx = features[0]?.properties?.context || {};
  const city =
    props('place')?.name ||
    ctx.place?.name ||
    props('locality')?.name ||
    ctx.locality?.name ||
    props('district')?.name ||
    ctx.district?.name ||
    props('region')?.name ||
    ctx.region?.name ||
    null;
  const country = props('country') || ctx.country;
  return {
    city,
    country: country?.name || null,
    countryCode: (country?.country_code || '').toUpperCase() || null,
    at: Date.now(),
  };
}

async function reverseNative(lat: number, lng: number): Promise<Place | null> {
  const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
  if (!a) return null;
  return {
    city: a.city || a.subregion || a.region || null,
    country: a.country || null,
    countryCode: a.isoCountryCode || null,
    at: Date.now(),
  };
}

async function webPermission(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' as PermissionName })).state;
  } catch {
    return 'unknown';
  }
}

async function position(): Promise<{ lat: number; lng: number }> {
  if (Platform.OS === 'web')
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        reject,
        { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 15000 },
      ),
    );
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}

async function resolvePlace(): Promise<Place | null> {
  const { lat, lng } = await position();
  const named =
    Platform.OS === 'web' ? await reverseMapbox(lat, lng) : await reverseNative(lat, lng);
  if (!named) return null;
  const place = { ...named, lat, lng };
  store(place);
  return place;
}

export type PlaceStatus = 'idle' | 'locating' | 'located' | 'denied' | 'failed';

/**
 * The person's current city. Only asks for location when `locate()` is called, unless
 * permission was already granted, in which case it refreshes quietly.
 */
export function useCurrentPlace(accountCountry?: string | null) {
  const [place, setPlace] = useState<Place | null>(readCache);
  const [status, setStatus] = useState<PlaceStatus>(readCache() ? 'located' : 'idle');

  useEffect(() => {
    listeners.add(setPlace);
    return () => {
      listeners.delete(setPlace);
    };
  }, []);

  const locate = useCallback(async () => {
    setStatus('locating');
    try {
      if (Platform.OS !== 'web') {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          setStatus('denied');
          return null;
        }
      }
      const p = await resolvePlace();
      setStatus(p ? 'located' : 'failed');
      return p;
    } catch (e: any) {
      setStatus(e?.code === 1 ? 'denied' : 'failed');
      return null;
    }
  }, []);

  // Quiet refresh when the device already allows location.
  useEffect(() => {
    const cached = readCache();
    if (cached && Date.now() - cached.at < FRESH_MS) return;
    let cancelled = false;
    (async () => {
      const granted =
        Platform.OS === 'web'
          ? (await webPermission()) === 'granted'
          : (await Location.getForegroundPermissionsAsync()).granted;
      if (granted && !cancelled) await locate();
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locate]);

  const fallbackCountry = countryName(accountCountry || deviceCountry());
  const label =
    place?.city ||
    place?.country ||
    (status === 'locating' ? 'Locating…' : fallbackCountry || 'Set location');
  return { place, status, locate, label, located: !!(place?.city || place?.country) };
}
