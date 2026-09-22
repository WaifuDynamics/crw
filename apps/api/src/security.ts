import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  createHmac,
} from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { db, type DB } from './db.js';
import { config } from './config.js';
const scrypt = promisify(scryptCallback);
export const id = () => randomUUID();
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireValue(value: any, status: number, message: string): asserts value {
  if (!value) throw new HttpError(status, message);
}
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}
export async function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(':');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
export const uuid = z.string().uuid();
export const safeURL = z
  .url()
  .refine(
    (s) =>
      s.startsWith('https://') ||
      (!config.production &&
        (s.startsWith(config.apiUrl + '/media/local/') ||
          s.startsWith(config.apiUrl + '/dev-media/'))),
    'HTTPS required',
  );
export const password = z.string().min(12).max(128);
export type Actor = { id: string; email: string; verified: boolean; roles: string[] };
export async function actor(req: FastifyRequest, optional = false): Promise<Actor | null> {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : req.cookies.pace_session;
  if (!token) {
    if (optional) return null;
    throw new HttpError(401, 'Sign in to continue');
  }
  const [u] = await db.query(
    `SELECT u.id,u.email,u.email_verified_at,array_agg(r.role) roles FROM sessions s JOIN users u ON u.id=s.user_id JOIN user_roles r ON r.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND u.status='active' GROUP BY u.id`,
    [hash(token)],
  );
  if (!u) {
    if (optional) return null;
    throw new HttpError(401, 'Your session expired. Please sign in again.');
  }
  return { id: u.id, email: u.email, verified: !!u.email_verified_at, roles: u.roles };
}
export async function authenticated(req: FastifyRequest, verified = false) {
  const u = (await actor(req))!;
  if (verified) requireValue(u.verified, 403, 'Verify your email to continue');
  return u;
}
export async function admin(req: FastifyRequest) {
  const u = await authenticated(req, true);
  requireValue(u.roles.includes('ADMIN'), 403, 'Administrator access required');
  return u;
}
export async function organizer(req: FastifyRequest, communityId?: string) {
  const u = await authenticated(req, true);
  requireValue(
    u.roles.includes('ORGANIZER') || u.roles.includes('ADMIN'),
    403,
    'Approved organizer access required',
  );
  if (communityId && !u.roles.includes('ADMIN')) {
    requireValue(
      (
        await db.query(
          `SELECT 1 FROM organizer_members m JOIN communities c ON c.id=m.community_id WHERE m.user_id=$1 AND m.community_id=$2 AND c.verified AND c.status='active'`,
          [u.id, communityId],
        )
      ).length,
      403,
      'You cannot manage this community',
    );
  }
  return u;
}
export async function newSession(userId: string) {
  const token = randomBytes(48).toString('base64url');
  await db.query(
    `INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 days')`,
    [id(), userId, hash(token)],
  );
  return token;
}
export async function audit(
  c: DB,
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  details: any = {},
) {
  await c.query(
    'INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)',
    [id(), actorId, action, targetType, targetId, JSON.stringify(details)],
  );
}
export function ticketToken(ticketId: string, bookingId: string, userId: string, eventId: string) {
  const data = `${ticketId}.${bookingId}.${userId}.${eventId}`;
  return `${ticketId}.${createHmac('sha256', config.secret).update(data).digest('base64url')}`;
}
export function verifyHmac(raw: string, signature: string, secret: string) {
  const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
