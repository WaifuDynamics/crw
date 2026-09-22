import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useKeepAwake } from 'expo-keep-awake';
import { Button, C, T } from '../ui';
import { embeddedCounterDir } from '../reps/embedded';

// The rep counter in a WebView. The page, its model and its WebAssembly are all files
// inside the app, so everything here is about letting a local page use the camera and
// talk back to us.
//
// Two screens mount it: the Play counter (Reps.tsx) and the alarm challenge
// (AlarmRing.tsx). They differ only in what they do with the messages.

export type CounterReply = (msg: Record<string, unknown>) => void;

export default function RepCounterView({
  src,
  onMessage,
}: {
  src: string;
  onMessage: (data: any, reply: CounterReply) => void;
}) {
  // The phone must not dim or lock mid-set.
  useKeepAwake();
  const web = useRef<WebView>(null);
  const [failed, setFailed] = useState('');
  const [key, setKey] = useState(0);

  const reply: CounterReply = (msg) =>
    web.current?.injectJavaScript(
      `window.CRWHost && window.CRWHost.records(${JSON.stringify(msg).replace(/</g, '\\u003c')}); true;`,
    );

  if (failed)
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14 }}>
        <T style={{ color: C.white, fontFamily: 'InterBold', fontSize: 16, textAlign: 'center' }}>
          The rep counter did not start
        </T>
        <T style={{ fontSize: 12, textAlign: 'center' }}>{failed}</T>
        <Button
          title="Try again"
          icon="refresh"
          onPress={() => {
            setFailed('');
            setKey((k) => k + 1);
          }}
        />
      </View>
    );

  return (
    <WebView
      key={key}
      ref={web}
      source={{ uri: src }}
      style={{ flex: 1, backgroundColor: C.bg }}
      containerStyle={{ backgroundColor: C.bg }}
      javaScriptEnabled
      domStorageEnabled
      // Camera video inside the page, played inline and without a tap first.
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      // The page, its script modules, the model and the WebAssembly are all local files.
      originWhitelist={['file://*', 'about:*']}
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      allowingReadAccessToURL={embeddedCounterDir()}
      // Only the counter itself loads here; anything else opens outside the app.
      onShouldStartLoadWithRequest={(r) => {
        if (r.url.startsWith('file://') || r.url === 'about:blank') return true;
        void Linking.openURL(r.url);
        return false;
      }}
      setSupportMultipleWindows={false}
      overScrollMode="never"
      bounces={false}
      startInLoadingState
      renderLoading={() => (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: C.bg,
          }}
        >
          <ActivityIndicator color={C.blue} />
        </View>
      )}
      onError={(e) => setFailed(e.nativeEvent.description || 'Try opening it again.')}
      onHttpError={(e) =>
        e.nativeEvent.statusCode >= 500 &&
        setFailed(`The counter server answered ${e.nativeEvent.statusCode}. Try again in a moment.`)
      }
      onMessage={(e) => {
        let data: any;
        try {
          data = JSON.parse(e.nativeEvent.data);
        } catch {
          return;
        }
        onMessage(data, reply);
      }}
    />
  );
}
