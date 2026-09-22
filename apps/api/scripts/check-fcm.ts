// Checks the FCM setup without delivering anything: signs in with FCM_SERVICE_ACCOUNT and
// sends a validate-only message. A fake token must be rejected as a bad token, which
// proves the credentials and project are right.
//   npx tsx --env-file=.env.production scripts/check-fcm.ts [device-token]
import { createSign } from 'node:crypto';
import { fcmMessage, serviceAccount } from '../src/push.js';

const sa = serviceAccount();
if (!sa) throw new Error('FCM_SERVICE_ACCOUNT is not set');
const now = Math.floor(Date.now() / 1000);
const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');
const unsigned = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(
  JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 600,
  }),
)}`;
const assertion = `${unsigned}.${b64(createSign('RSA-SHA256').update(unsigned).sign(sa.private_key))}`;
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
});
const { access_token, error } = (await tokenResponse.json()) as any;
if (!access_token) throw new Error(`Sign-in failed: ${error}`);
console.log('signed in as', sa.client_email, 'project', sa.project_id);

const device = process.argv[2] || 'not-a-real-device-token';
const response = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    validate_only: !process.argv[2],
    message: fcmMessage(device, {
      title: 'CRW+ test',
      body: 'Push notifications are working.',
      category: 'general',
    }),
  }),
});
const body: any = await response.json();
console.log('FCM answered', response.status, body.error?.status || body.name || '', body.error?.message || '');
