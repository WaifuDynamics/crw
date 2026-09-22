import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API } from '../api';
import { C, Icon, T, Tap } from '../ui';
import { tint } from '../theme';
import { t } from '../translations';

// Sign in with Apple (native).
//
// On iPhone, Apple's own sheet through expo-apple-authentication hands back an identity
// token, which the API verifies exactly like a Google one. Android has no such sheet, so
// the button opens Apple in a browser tab instead: the API sends the person to Apple,
// Apple posts the answer back to the API, and the API returns to the app through its URL
// scheme with a session already made. Either way the button sits next to Google's and
// looks the part.
//
// Apple gives the person's name only on the very first sign-in, so it travels with the
// token and is used only when the account is created.

export type AppleCredential =
  { credential: string; firstName?: string; lastName?: string } | { sessionToken: string };

type Config = { enabled: boolean; clientId: string | null; redirectUri: string | null };

async function config(): Promise<Config | null> {
  try {
    const r = await fetch(`${API}/auth/apple/config`);
    if (!r.ok) return null;
    const c = (await r.json()) as Config;
    return c.enabled ? c : null;
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
  // 'native' is Apple's own sheet, 'browser' is the tab, null means no button at all.
  const [how, setHow] = useState<'native' | 'browser' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      Platform.OS === 'ios' ? AppleAuthentication.isAvailableAsync() : Promise.resolve(false),
      config(),
    ]).then(([sheet, server]) => {
      if (cancelled || !server) return;
      // The browser flow needs a Services ID and a return URL registered with Apple.
      setHow(sheet ? 'native' : server.clientId && server.redirectUri ? 'browser' : null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!how) return null;

  const nativeSignIn = async () => {
    const result = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!result.identityToken) throw new Error('Apple did not return an identity token.');
    onCredential({
      credential: result.identityToken,
      firstName: result.fullName?.givenName || undefined,
      lastName: result.fullName?.familyName || undefined,
    });
  };

  const browserSignIn = async () => {
    const back = Linking.createURL('sign-in');
    const result = await WebBrowser.openAuthSessionAsync(
      `${API}/auth/apple/start?target=app`,
      back,
    );
    if (result.type !== 'success') return; // dismissed or cancelled
    const { queryParams } = Linking.parse(result.url);
    if (queryParams?.error) throw new Error(String(queryParams.error));
    const token = queryParams?.token;
    if (typeof token !== 'string' || !token)
      throw new Error('Apple sign-in came back without a session.');
    onCredential({ sessionToken: token });
  };

  const signIn = async () => {
    setBusy(true);
    try {
      await (how === 'native' ? nativeSignIn() : browserSignIn());
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
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
