import { themed, tint } from '../theme';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, T, Tap } from '../ui';
import { CLAY, clay } from './clay';
import { MapHandle, MapWebView } from './MapWebView';
import { nativeLocationMessage, useNativeLocation } from './useNativeLocation';

// Native live location map: the website's Mapbox map in a WebView, fed by the phone's GPS.
// Nothing sits over the map while the fix is good - the marker says everything. A clay
// status pill only appears when location is actually broken, next to a small clay
// recenter bubble.
export default function LiveMap({ height = 220 }: { height?: number }) {
  const map = useRef<MapHandle>(null);
  const here = useNativeLocation();
  const found = here.status === 'found';
  // Only speak up when something is wrong; a good fix needs no caption.
  const problem = here.status === 'denied' || here.status === 'unavailable';

  useEffect(() => {
    if (here.status === 'found')
      map.current?.run({
        type: 'user',
        lat: here.latitude,
        lng: here.longitude,
        accuracy: here.accuracy,
        follow: true,
      });
  }, [here]);

  return (
    <View style={{ height, width: '100%' }}>
      <MapWebView
        ref={map}
        label="Map of your current location"
        center={{ latitude: 52.2297, longitude: 21.0122 }}
        zoom={12}
        zoomControl={false}
      />
      {problem && (
        <View pointerEvents="none" style={[clay('navy', 0.6), st.status]}>
          <View style={[st.dot, { backgroundColor: tint('#FFD18B') }]} />
          <T accessibilityLiveRegion="polite" style={st.statusText}>
            {nativeLocationMessage(here)}
          </T>
        </View>
      )}
      {found && (
        <Tap
          label="Center the map on me"
          onPress={() => map.current?.run({ type: 'recenter' })}
          style={[clay('blue', 0.8), st.locate]}
        >
          <Icon name="navigate" size={16} color={CLAY.blue.ink} />
        </Tap>
      )}
    </View>
  );
}

const st = themed(() =>
  StyleSheet.create({
    status: {
      position: 'absolute',
      left: 12,
      bottom: 12,
      right: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 11,
      paddingVertical: 9,
      borderRadius: 15,
    },
    dot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
    statusText: {
      flexShrink: 1,
      fontSize: 11,
      lineHeight: 15,
      fontFamily: 'InterSemi',
      color: CLAY.navy.ink,
    },
    locate: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);
