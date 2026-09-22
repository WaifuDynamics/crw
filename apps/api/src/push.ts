import { createSign } from 'node:crypto';

// Push delivery.
//
// Android devices register their Firebase token and are reached through the FCM HTTP v1
// API, which lets us style the notification (channel, colour, icon, picture, grouping).
// Expo push tokens (iOS and older app builds) still go through Expo's push service.
//
// FCM needs a Firebase service account: FCM_SERVICE_ACCOUNT holds its JSON key, either
// as JSON or base64. Without it FCM tokens are skipped and the notification stays in
// the in-app list only.

export type PushCategory = 'general' | 'social' | 'friends' | 'events' | 'compete' | 'marketing';

export type PushMessage = {
  title: string;
  body: string;
  link?: string | null;
  category?: PushCategory;
  /** A picture shown in the expanded notification (https only). */
  image?: string | null;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
};

export type Device = { token: string; provider: 'expo' | 'fcm' };

/** Tokens the provider says are gone; the caller removes them. */
export type PushResult = { dead: string[] };

// The Android notification channels, created by the app (src/push.ts) with the same ids.
const CHANNEL: Record<PushCategory, string> = {
  general: 'general',
  social: 'social',
  friends: 'friends',
  events: 'events',
  compete: 'compete',
  marketing: 'marketing',
};
const ACCENT: Record<PushCategory, string> = {
  general: '#168BFF',
  social: '#168BFF',
  friends: '#A9F06A',
  events: '#FF7A3D',
  compete: '#FFD18B',
  marketing: '#F27894',
};

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

export function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const parsed = JSON.parse(json);
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key)
    throw new Error('FCM_SERVICE_ACCOUNT is not a service account key');
  return parsed;
}

let cached: { token: string; expires: number; email: string } | null = null;

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

async function accessToken(sa: ServiceAccount) {
  if (cached && cached.email === sa.client_email && cached.expires > Date.now() + 60_000)
    return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token)
    throw new Error(`FCM auth failed: ${body.error_description || body.error || response.status}`);
  cached = {
    token: body.access_token,
    expires: Date.now() + body.expires_in * 1000,
    email: sa.client_email,
  };
  return cached.token;
}

/** The FCM v1 message for one device: a styled Android notification plus our data. */
export function fcmMessage(token: string, m: PushMessage) {
  const category = m.category || 'general';
  const image = m.image && /^https:\/\//.test(m.image) ? m.image : undefined;
  return {
    token,
    notification: { title: m.title, body: m.body, ...(image ? { image } : {}) },
    data: { link: m.link || '', category },
    android: {
      priority: category === 'marketing' ? 'normal' : 'high',
      ...(m.tag ? { collapse_key: m.tag } : {}),
      notification: {
        channel_id: CHANNEL[category],
        icon: 'notification_icon',
        color: ACCENT[category],
        ...(m.tag ? { tag: m.tag } : {}),
        default_sound: true,
        notification_priority: category === 'marketing' ? 'PRIORITY_LOW' : 'PRIORITY_HIGH',
        visibility: 'PRIVATE',
      },
    },
  };
}

async function sendFcm(sa: ServiceAccount, devices: Device[], m: PushMessage): Promise<PushResult> {
  const token = await accessToken(sa);
  const dead: string[] = [];
  const errors: string[] = [];
  for (const d of devices) {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fcmMessage(d.token, m) }),
      },
    );
    if (response.ok) continue;
    const body: any = await response.json().catch(() => ({}));
    const code = body.error?.details?.find((x: any) => x.errorCode)?.errorCode;
    // The app was uninstalled or the token was replaced.
    if (response.status === 404 || code === 'UNREGISTERED') dead.push(d.token);
    else if (
      response.status === 400 &&
      code === 'INVALID_ARGUMENT' &&
      /token/i.test(body.error?.message || '')
    )
      dead.push(d.token);
    else errors.push(`FCM ${response.status} ${body.error?.message || ''}`.trim());
  }
  // Only retry when nothing got through, so one bad device does not repeat the push to the rest.
  if (errors.length && errors.length === devices.length - dead.length) throw new Error(errors[0]);
  return { dead };
}

async function sendExpo(devices: Device[], m: PushMessage): Promise<PushResult> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.EXPO_ACCESS_TOKEN
        ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(
      devices.map((d) => ({
        to: d.token,
        title: m.title,
        body: m.body,
        data: { link: m.link || '', category: m.category || 'general' },
        sound: 'default',
        channelId: CHANNEL[m.category || 'general'],
        ...(m.image ? { richContent: { image: m.image } } : {}),
      })),
    ),
  });
  if (!response.ok) throw new Error(`Push provider ${response.status}`);
  const result: any = await response.json();
  const dead: string[] = [];
  for (let i = 0; i < (result.data || []).length; i++) {
    if (result.data[i].details?.error === 'DeviceNotRegistered') dead.push(devices[i].token);
    else if (result.data[i].status === 'error') throw new Error(result.data[i].message);
  }
  return { dead };
}

export async function sendPush(devices: Device[], m: PushMessage): Promise<PushResult> {
  const fcm = devices.filter((d) => d.provider === 'fcm');
  const expo = devices.filter((d) => d.provider === 'expo');
  const dead: string[] = [];
  if (fcm.length) {
    const sa = serviceAccount();
    if (sa) dead.push(...(await sendFcm(sa, fcm, m)).dead);
    else if (process.env.NODE_ENV === 'production')
      console.warn('[push] FCM_SERVICE_ACCOUNT is not set; skipped', fcm.length, 'device(s)');
  }
  if (expo.length) dead.push(...(await sendExpo(expo, m)).dead);
  return { dead };
}
