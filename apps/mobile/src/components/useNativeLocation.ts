import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type NativeLocation =
  | { status: 'locating' }
  | { status: 'found'; latitude: number; longitude: number; accuracy: number }
  | { status: 'denied' | 'unavailable' };

/** The phone's live position for maps (foreground only). */
export function useNativeLocation(enabled = true) {
  const [state, setState] = useState<NativeLocation>({ status: 'locating' });
  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        if (!cancelled) setState({ status: 'denied' });
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        if (!cancelled) setState({ status: 'unavailable' });
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 3, timeInterval: 2000 },
        (loc) =>
          setState({
            status: 'found',
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy ?? 30,
          }),
        () => setState({ status: 'unavailable' }),
      );
      if (cancelled) sub.remove();
    })().catch(() => !cancelled && setState({ status: 'unavailable' }));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);
  return state;
}

export function nativeLocationMessage(state: NativeLocation) {
  switch (state.status) {
    case 'locating':
      return 'Finding your location…';
    case 'found':
      return `You are here · accurate to ${Math.round(state.accuracy)} m`;
    case 'denied':
      return 'Location is off for CRW+. Allow it in the phone settings to see yourself on the map.';
    default:
      return 'No GPS signal right now. Turn on location or move to an open area.';
  }
}
