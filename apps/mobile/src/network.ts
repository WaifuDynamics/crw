import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

// Whether CRW+ can reach the internet right now.
//
// The system's connectivity (NetInfo) is the main signal; a request that fails at the
// network level also marks the app offline until the system reports a connection again.
// React Query follows the same flag, so screens pause their requests and keep showing the
// last data they loaded.

let online = true;
const listeners = new Set<(on: boolean) => void>();

function set(next: boolean) {
  if (next === online) return;
  online = next;
  onlineManager.setOnline(next);
  listeners.forEach((l) => l(next));
}

export const isOnline = () => online;

// While offline, the CRW+ server is pinged every 15 s; the first answer brings the app back.
// (The phone can have internet while our server does not answer: that counts as offline too.)
const PROBE_MS = 15_000;
let probeUrl = '';
let probe: ReturnType<typeof setInterval> | null = null;
export const setProbeUrl = (url: string) => (probeUrl = url);

async function ping() {
  if (!probeUrl) return;
  try {
    const r = await fetch(probeUrl, { cache: 'no-store' });
    if (r.ok) markOnline();
  } catch {
    // still offline
  }
}

/** A request failed before reaching the server. */
export function markOffline() {
  set(false);
  if (!probe) probe = setInterval(() => void ping(), PROBE_MS);
}

/** A request reached the server. */
export function markOnline() {
  if (probe) clearInterval(probe);
  probe = null;
  set(true);
}

let started = false;
export function watchNetwork() {
  if (started) return;
  started = true;
  NetInfo.addEventListener((s) => {
    // No network at all: offline straight away. A network again: check the server first.
    if (s.isConnected === false || s.isInternetReachable === false) markOffline();
    else if (!online) void ping();
  });
}

export function useOnline() {
  const [on, setOn] = useState(online);
  useEffect(() => {
    watchNetwork();
    setOn(online);
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return on;
}

/** The error a request throws when there is no connection. */
export class OfflineError extends Error {
  offline = true;
  constructor() {
    super('You’re offline. This needs an internet connection.');
  }
}

export const isOfflineError = (e: any) => !!e?.offline;
