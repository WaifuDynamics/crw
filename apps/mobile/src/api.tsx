import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { suspendRecording } from './tracking/recorder';
import {
  isOfflineError,
  markOffline,
  markOnline,
  OfflineError,
  setProbeUrl,
  watchNetwork,
} from './network';
import { t } from './translations';
import { errorKey, type ErrorContext } from './errors';
import type { Notice, NoticeKind } from './components/Toast';
export const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
setProbeUrl(`${API}/health`);
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20000,
      // Kept for a week so screens open with their last data when there is no connection.
      gcTime: 7 * 86400_000,
      retry: (count, error) => !isOfflineError(error) && count < 1,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
/** The query cache on the device, so the app shows the last data when offline. */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'crw.query-cache',
  throttleTime: 2000,
});
let nativeToken: string | null = null;
export async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  watchNetwork();
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        // Only requests with a body declare one: the API rejects an empty JSON body.
        ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
        ...(nativeToken ? { Authorization: `Bearer ${nativeToken}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    // No connection (or the server is unreachable): the app switches to offline mode.
    markOffline();
    throw new OfflineError();
  }
  markOnline();
  const data = await response
    .json()
    .catch(() => ({ error: 'The server returned an unexpected response' }));
  if (!response.ok) {
    const error = new Error(
      data.issues?.length
        ? `${data.error}: ${data.issues.map((i: any) => `${i.field} ${i.message}`).join(', ')}`
        : data.error || 'Something went wrong',
    ) as any;
    error.status = response.status;
    throw error;
  }
  return data;
}
export const post = (path: string, body: any = {}, key?: string) =>
  request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: key ? { 'Idempotency-Key': key } : undefined,
  });
export const patch = (path: string, body: any) =>
  request(path, { method: 'PATCH', body: JSON.stringify(body) });
export const remove = (path: string) => request(path, { method: 'DELETE' });
export const uid = () => Crypto.randomUUID();
export function useData<T = any>(path: string, enabled = true) {
  return useQuery<T>({ queryKey: [path], queryFn: () => request<T>(path), enabled });
}
export function invalidate() {
  return queryClient.invalidateQueries();
}
const ME_KEY = 'crw.session.me';
type Session = {
  user: any;
  loading: boolean;
  /** The account comes from this device because the server could not be reached. */
  cached: boolean;
  notice: Notice | null;
  say: (text: string, kind?: NoticeKind) => void;
  dismissNotice: () => void;
  // Each resolves to the signed-in user (or null), so callers can route on it.
  refresh: () => Promise<any>;
  devLogin: () => Promise<any>;
  login: (email: string, password: string) => Promise<any>;
  loginWithGoogle: (credential: string) => Promise<any>;
  loginWithApple: (credential: string, firstName?: string, lastName?: string) => Promise<any>;
  /** A session the API already created, handed back by a browser sign-in. */
  useSessionToken: (token: string) => Promise<any>;
  register: (name: string, email: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
};
const Context = createContext<Session>(null as any);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null),
    [cached, setCached] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState<Notice | null>(null);
  const say = useCallback(
    (text: string, kind: NoticeKind = 'info') => setNotice(text ? { text, kind } : null),
    [],
  );
  const dismissNotice = useCallback(() => setNotice(null), []);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 6500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const refresh = useCallback(async () => {
    try {
      const me = await request('/auth/me');
      setUser(me);
      setCached(false);
      await AsyncStorage.setItem(ME_KEY, JSON.stringify(me)).catch(() => {});
      return me;
    } catch (e: any) {
      if (e.status === 401) {
        // Signed out on the server (or the session expired): forget the saved account.
        setUser(null);
        setCached(false);
        await AsyncStorage.removeItem(ME_KEY).catch(() => {});
        return null;
      }
      // Offline or the server is down: keep the account saved on this device.
      const saved = await AsyncStorage.getItem(ME_KEY).catch(() => null);
      if (saved) {
        const me = JSON.parse(saved);
        setUser(me);
        setCached(true);
        return me;
      }
      if (!isOfflineError(e)) say(t('errors.reconnect'), 'error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') nativeToken = await SecureStore.getItemAsync('pace_session');
      // Open straight away with the account saved on this device, then check with the server.
      const saved = await AsyncStorage.getItem(ME_KEY).catch(() => null);
      if (saved) {
        setUser(JSON.parse(saved));
        setCached(true);
        setLoading(false);
      }
      await refresh();
    })();
  }, []);
  async function saveSession(result: any) {
    await suspendRecording();
    // Another account's saved screens must not show for this one.
    await Promise.resolve(queryPersister.removeClient()).catch(() => {});
    if (Platform.OS !== 'web') {
      nativeToken = result.token;
      await SecureStore.setItemAsync('pace_session', result.token);
    }
    queryClient.clear();
    return refresh();
  }
  const login = async (email: string, password: string) =>
    saveSession(await post('/auth/login', { email, password }));
  const devLogin = async () => saveSession(await post('/auth/dev-session'));
  const loginWithGoogle = async (credential: string) =>
    saveSession(await post('/auth/google', { credential }));
  const loginWithApple = async (credential: string, firstName?: string, lastName?: string) =>
    saveSession(await post('/auth/apple', { credential, firstName, lastName }));
  const useSessionToken = async (token: string) => saveSession({ token });
  const register = async (displayName: string, email: string, password: string) => {
    const me = await saveSession(await post('/auth/register', { displayName, email, password }));
    say(t('errors.welcome'), 'success');
    return me;
  };
  const logout = async () => {
    await suspendRecording();
    // Loaded lazily: ./push imports this module.
    await (await import('./push')).unregisterPush().catch(() => {});
    // Offline, the server session simply expires later; this device forgets it now.
    await post('/auth/logout').catch(() => {});
    nativeToken = null;
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync('pace_session');
    await AsyncStorage.removeItem(ME_KEY).catch(() => {});
    setUser(null);
    setCached(false);
    queryClient.clear();
    await Promise.resolve(queryPersister.removeClient()).catch(() => {});
  };
  return (
    <Context.Provider
      value={{
        user,
        loading,
        cached,
        notice,
        say,
        dismissNotice,
        refresh,
        devLogin,
        login,
        loginWithGoogle,
        loginWithApple,
        useSessionToken,
        register,
        logout,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
export function useAction() {
  const [busy, setBusy] = useState(false);
  const { say } = useSession();
  // `context` only matters for 401, which means a wrong password on the way in and an
  // expired session everywhere else.
  const run = async (work: () => Promise<any>, context?: ErrorContext) => {
    if (busy) return;
    setBusy(true);
    try {
      return await work();
    } catch (e: any) {
      say(t(errorKey(e, context)), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
export function money(minor: number, currency = 'USD') {
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: minor % 10 ** digits === 0 ? 0 : digits,
  }).format(minor / 10 ** digits);
}
export function dateLabel(date: string, timezone = 'Asia/Beirut') {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(new Date(date));
}
export function timeLabel(date: string, timezone = 'Asia/Beirut') {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(date));
}
export function queryString(values: Record<string, any>) {
  return Object.entries(values)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}
