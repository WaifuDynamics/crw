import { tint } from '../theme';
import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleProp, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { C } from '../ui';
import { commandScript, MAP_BASE_URL, mapPageHtml, MapCommand, MapMessage } from './mapPage';

// A Leaflet + Mapbox map in a WebView (the same map as the website). Commands sent
// before the page is ready are queued, so callers never need to wait.

export type MapHandle = { run: (command: MapCommand) => void };

type Props = {
  center: { latitude: number; longitude: number };
  zoom?: number;
  zoomControl?: boolean;
  /** false: a still preview that leaves gestures to the screen around it. */
  interactive?: boolean;
  label: string;
  style?: StyleProp<ViewStyle>;
  onSelect?: (id: string) => void;
};

export const MapWebView = forwardRef<MapHandle, Props>(function MapWebView(
  { center, zoom = 13, zoomControl = true, interactive = true, label, style, onSelect },
  ref,
) {
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const queue = useRef<MapCommand[]>([]);
  const [loading, setLoading] = useState(true);
  // The page is built once; later centre changes are sent as commands.
  const html = useMemo(
    () =>
      mapPageHtml({ lat: center.latitude, lng: center.longitude, zoom, zoomControl, interactive }),
    [],
  );

  useImperativeHandle(ref, () => ({
    run(command) {
      if (!ready.current) {
        // Only the latest route / user / events matter; drop older ones of the same kind.
        queue.current = [...queue.current.filter((c) => c.type !== command.type), command];
        return;
      }
      web.current?.injectJavaScript(commandScript(command));
    },
  }));

  return (
    <View
      accessible
      accessibilityLabel={label}
      // A still preview lets touches through to the screen (scrolling, tapping to expand).
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[{ flex: 1, backgroundColor: tint('#10151c') }, style]}
    >
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html, baseUrl: MAP_BASE_URL }}
        // opacity < 1 makes Android clip the WebView to the card's rounded corners.
        style={{ flex: 1, backgroundColor: tint('#10151c'), opacity: 0.99 }}
        containerStyle={{ overflow: 'hidden' }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        // Links in the attribution open in the browser, not inside the map.
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(r) =>
          r.url === 'about:blank' || r.url.startsWith(MAP_BASE_URL)
        }
        onMessage={(event) => {
          let msg: MapMessage;
          try {
            msg = JSON.parse(event.nativeEvent.data);
          } catch {
            return;
          }
          if (msg.type === 'ready') {
            ready.current = true;
            setLoading(false);
            for (const c of queue.current) web.current?.injectJavaScript(commandScript(c));
            queue.current = [];
          } else if (msg.type === 'select') onSelect?.(msg.id);
          else if (msg.type === 'error') console.warn('[map]', msg.message);
        }}
      />
      {loading && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator color={C.blue} />
        </View>
      )}
    </View>
  );
});
