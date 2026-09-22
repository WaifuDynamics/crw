import { tint } from '../theme';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { API } from '../api';
import { C, T } from '../ui';
import { t } from '../translations';

// Google Identity Services renders its own button and hands back an ID token,
// which the API verifies. This is the web flow; native apps need a development
// build with a platform client ID and are not wired yet, so nothing renders there.
const GIS_SRC = 'https://accounts.google.com/gsi/client';
// Google renders the button at most this wide.
const GIS_MAX_WIDTH = 400;

let loading: Promise<void> | null = null;
function loadGis() {
  if ((globalThis as any).google?.accounts?.id) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    // hl=en keeps Google's own strings (popup, button) in English like the app.
    script.src = `${GIS_SRC}?hl=en`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load Google sign-in'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

async function clientId(): Promise<string | null> {
  // A build-time value wins; otherwise ask the API, so one setting is enough.
  const fromEnv = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  if (fromEnv) return fromEnv;
  try {
    const r = await fetch(`${API}/auth/google/config`, { credentials: 'include' });
    return r.ok ? (await r.json()).clientId : null;
  } catch {
    return null;
  }
}

function Divider() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 22 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
      <T style={{ fontFamily: 'InterBold', fontSize: 10, letterSpacing: 1.4, color: C.gray }}>
        OR USE EMAIL
      </T>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
    </View>
  );
}

export default function GoogleSignIn({
  onCredential,
  onError,
}: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const host = useRef<any>(null);
  const [id, setId] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);
  const latest = useRef({ onCredential, onError });
  latest.current = { onCredential, onError };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    (async () => {
      const value = await clientId();
      if (!value || cancelled) return;
      try {
        await loadGis();
        if (!cancelled) setId(value);
      } catch (e: any) {
        latest.current.onError(t('errors.googleSignIn'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Render (and re-render on resize) once both the script and our width are known,
  // so the button spans the form like the fields below it.
  useEffect(() => {
    if (!id || !width || !host.current) return;
    const gis = (globalThis as any).google.accounts.id;
    gis.initialize({
      client_id: id,
      callback: (response: { credential?: string }) => {
        if (response.credential) latest.current.onCredential(response.credential);
        else latest.current.onError('Google sign-in was cancelled');
      },
      ux_mode: 'popup',
    });
    host.current.innerHTML = '';
    gis.renderButton(host.current, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      locale: 'en',
      // a small inset keeps Google's edges off the frame border
      width: String(Math.min(GIS_MAX_WIDTH, Math.floor(width) - 12)),
    });
    setReady(true);
  }, [id, width]);

  if (Platform.OS !== 'web') return null;
  return (
    <View
      testID="google-sign-in"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%', display: id ? 'flex' : 'none' }}
    >
      {/* Frame matching the app's inputs; Google's button sits centred inside it. */}
      <View
        style={{
          minHeight: 52,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: C.line,
          backgroundColor: tint('#202124'),
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: ready ? 1 : 0,
        }}
      >
        <View ref={host} />
      </View>
      {ready && <Divider />}
    </View>
  );
}
