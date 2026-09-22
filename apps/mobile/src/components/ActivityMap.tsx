import React, { useEffect, useRef } from 'react';
import { MapHandle, MapWebView } from './MapWebView';
import { useNativeLocation } from './useNativeLocation';

// Upcoming activities on the Mapbox map (native, WebView), grouped when they overlap.
export default function ActivityMap({ events, center, onSelect }: any) {
  const map = useRef<MapHandle>(null);
  const here = useNativeLocation();
  const byId = useRef(new Map<string, any>());
  byId.current = new Map(events.map((e: any) => [String(e.id), e]));

  useEffect(() => {
    map.current?.run({
      type: 'events',
      events: events.map((e: any) => ({
        id: String(e.id),
        lat: e.latitude,
        lng: e.longitude,
        title: e.title,
      })),
    });
  }, [events]);

  useEffect(() => {
    if (here.status === 'found')
      map.current?.run({
        type: 'user',
        lat: here.latitude,
        lng: here.longitude,
        accuracy: here.accuracy,
      });
  }, [here]);

  return (
    <MapWebView
      ref={map}
      label="Map of upcoming fitness activities"
      center={center}
      zoom={13}
      onSelect={(id) => {
        const event = byId.current.get(id);
        if (event) onSelect(event);
      }}
    />
  );
}
