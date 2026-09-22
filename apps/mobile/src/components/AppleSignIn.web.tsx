import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { API } from '../api';
import { C, Icon, T, Tap } from '../ui';
import { tint } from '../theme';
import { t } from '../translations';

// Sign in with Apple (web and PWA). Apple's own script opens a popup and returns an
// identity token for the Services ID, which the API verifies exactly like the native
// one. No client secret is needed for this flow: the token is signed by Apple and
// checked against Apple's public keys on the server.
//
// It needs a Services ID and a return URL registered with Apple, both of which the API
// hands out at /auth/apple/config.

const APPLE_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

export type AppleCredential =
  { credential: string; firstName?: string; lastName?: string } | { sessionToken: string };

let loading: Promise<void> | null = null;
function loadApple() {
  if ((globalThis as any).AppleID?.auth) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = APPLE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load Apple sign-in'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

type Config = { enabled: boolean; clientId: string | null; redirectUri: string | null };

async function config(): Promise<Config | null> {
  try {
    const r = await fetch(`${API}/auth/apple/config`, { credentials: 'include' });
    if (!r.ok) return null;
    const c = (await r.json()) as Config;
    return c.enabled && c.clientId ? c : null;
  } catch {
    return null;
  }
}

export default function AppleSignIn({
  onCredential,
  onError,
}: {
  onCredential: (result: AppleCredential) => void;
  onError: (message: string) => void;
}) {
  const [ready, setReady] = useState<Config | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    config().then((c) => {
      if (!c || cancelled) return;
      loadApple()
        .then(() => {
          if (cancelled) return;
          (globalThis as any).AppleID.auth.init({
            clientId: c.clientId,
            scope: 'name email',
            redirectURI: c.redirectUri || window.location.origin,
            usePopup: true,
          });
          setReady(c);
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  const signIn = async () => {
    setBusy(true);
    try {
      const response = await (globalThis as any).AppleID.auth.signIn();
      const token = response?.authorization?.id_token;
      if (!token) throw new Error('Apple did not return an identity token.');
      onCredential({
        credential: token,
        // Apple sends the name only on the first sign-in, and only here.
        firstName: response?.user?.name?.firstName,
        lastName: response?.user?.name?.lastName,
      });
    } catch (e: any) {
      // Closing the popup is not an error worth showing.
      if (e?.error === 'popup_closed_by_user' || e?.error === 'user_cancelled_authorize') return;
      onError(t('errors.appleSignIn'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tap
      label="Continue with Apple"
      onPress={signIn}
      disabled={busy}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        minHeight: 52,
        borderRadius: 14,
        marginBottom: 12,
        backgroundColor: tint('#101216'),
        borderWidth: 1,
        borderColor: C.line,
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Icon name="logo-apple" size={20} color="#FFFFFF" />
      )}
      <T style={{ color: '#FFFFFF', fontFamily: 'InterBold', fontSize: 15 }}>Continue with Apple</T>
    </Tap>
  );
}
