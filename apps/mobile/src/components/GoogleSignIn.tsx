import { tint } from '../theme';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { API } from '../api';
import { C, Icon, T, Tap } from '../ui';
import { t } from '../translations';

// Native Google sign-in (Android / iOS). The Google account picker returns an ID token
// for the web client ID, which the API already verifies, so both platforms share one
// backend flow. The web version lives in GoogleSignIn.web.tsx.
//
// Android also needs an "Android" OAuth client in Google Cloud with the package name
// app.crwplus.fitness and the SHA-1 of the signing key; Google rejects the sign-in
// (DEVELOPER_ERROR) without it.

async function webClientId(): Promise<string | null> {
  const fromEnv = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  if (fromEnv) return fromEnv;
  try {
    const r = await fetch(`${API}/auth/google/config`);
    return r.ok ? (await r.json()).clientId : null;
  } catch {
    return null;
  }
}

let configured: string | null = null;

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

function explain(e: any) {
  const code = String(e?.code ?? '');
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
    return 'Google Play services are missing or out of date on this phone.';
  if (code === statusCodes.IN_PROGRESS) return 'Google sign-in is already open.';
  // 10 = DEVELOPER_ERROR: the app's package/SHA-1 is not registered for this client.
  if (code === '10' || /DEVELOPER_ERROR/i.test(String(e?.message)))
    return 'Google sign-in is not set up for this app build yet. Use email for now.';
  return t('errors.googleSignIn');
}

export default function GoogleSignIn({
  onCredential,
  onError,
}: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const [clientId, setClientId] = useState<string | null>(configured);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (configured) return;
    let cancelled = false;
    webClientId().then((id) => {
      if (!id || cancelled) return;
      GoogleSignin.configure({ webClientId: id, scopes: ['profile', 'email'] });
      configured = id;
      setClientId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sign-in is off on the server: show nothing rather than a broken button.
  if (!clientId) return null;

  const signIn = async () => {
    setBusy(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // Always show the account picker, so people can switch accounts.
      await GoogleSignin.signOut().catch(() => {});
      const response = await GoogleSignin.signIn();
      if (isCancelledResponse(response)) return;
      if (!isSuccessResponse(response) || !response.data.idToken)
        throw new Error('Google did not return an ID token.');
      onCredential(response.data.idToken);
    } catch (e: any) {
      if (String(e?.code) === statusCodes.SIGN_IN_CANCELLED) return;
      console.warn('[google-signin]', e?.code, e?.message);
      onError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Tap
        label="Continue with Google"
        onPress={signIn}
        disabled={busy}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          minHeight: 52,
          borderRadius: 14,
          backgroundColor: tint('#F7F8FA'),
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator color={C.black} />
        ) : (
          <Icon name="logo-google" size={20} color={C.black} />
        )}
        <T style={{ color: C.black, fontFamily: 'InterBold', fontSize: 15 }}>
          Continue with Google
        </T>
      </Tap>
      <Divider />
    </View>
  );
}
