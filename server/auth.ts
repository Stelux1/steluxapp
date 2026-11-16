import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppError, Store, type Actor } from './store.ts';
import { permissionValue } from '../shared/resources.ts';
import type { Module, User } from '../shared/types.ts';
import { canResource,canAction,parsePermissionRules,moduleSummary } from '../shared/permissions.ts';
import { scopeLimited, siteProfilesField, siteProfilesOf, siteScopeField } from '../shared/site-scope.ts';
import type {PermissionVerb,Row} from '../shared/types.ts';
import { referencePasswordAccepted } from '../shared/password-strength.ts';
export interface AuthRequest extends Request { user: User }
export const hashToken = (v: string) => createHash('sha256').update(v).digest('hex');
export function passwordHash(password: unknown) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) throw new AppError(422, 'Use a password between 10 and 256 characters.', { password: 'At least 10 characters are required.' });
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
/** Change password of the hosted pilots: the new password must reach the score "OK" of the dialog's strength meter (shared/password-strength.ts). */
export function assertPasswordStrength(password: unknown) {
  if (!referencePasswordAccepted(password)) throw new AppError(400, 'Password too weak. Use at least 8 characters with uppercase, lowercase, numbers and special characters.', { password: 'The password is too weak.' });
}
export function passwordMatches(password: unknown, stored: string) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
/**
 * The profile that applies to an account in a pilot, or null when the account is not enabled there. Without a
 * pilot (or for accounts saved before access per pilot) it is the account's permission profile.
 * With 'Specific project site(s)' in the pilot, the main project `siteId` brings its own profile (shared/site-scope.ts
 * `siteProfilesField`); a ticked site without one, and every request without a main project, uses the pilot's profile.
 * Whether `siteId` is one of the account's main projects is decided by the caller (server/site-scope.ts `activeSite`).
 */
export function effectiveProfileId(row: Row, pilot?: 'weld' | 'mto', siteId?: string): string | null {
  if (!pilot) return String(row.profileId);
  if (row[`${pilot}Enabled`] === false) return null;
  const own = siteId && scopeLimited(row[siteScopeField(pilot)]) ? siteProfilesOf(row[siteProfilesField(pilot)])[siteId] : undefined;
  return String(own || row[`${pilot}ProfileId`] || row.profileId);
}
/**
 * The sign-in attempt limit (sec1-010): failed attempts are counted per account (normalised email, from any address) and
 * per address. Eight failures for one account hold that account for five minutes; an address is held after
 * `ADDRESS_LIMIT` failures across accounts (spraying), which leaves room for everyone else behind a shared proxy. A
 * successful sign-in clears only the count of its own account, never another's or the address's.
 */
export const SIGN_IN_LIMIT = 8, SIGN_IN_ADDRESS_LIMIT = 40, SIGN_IN_WINDOW_MS = 5 * 60_000;
export function signInLimiter(now: () => number = Date.now) {
  const counts = new Map<string, { count: number; until: number }>();
  const live = (key: string) => { const state = counts.get(key); if (state && state.until < now()) { counts.delete(key); return undefined; } return state; };
  const keys = (address: string, email: string) => [[`account:${email}`, SIGN_IN_LIMIT], [`address:${address}`, SIGN_IN_ADDRESS_LIMIT]] as const;
  return {
    /** Refused with 429 while the account or the address is held. */
    check(address: string, email: string) {
      if (keys(address, email).some(([key, limit]) => (live(key)?.count ?? 0) >= limit)) throw new AppError(429, 'Too many sign-in attempts. Try again in a few minutes.');
    },
    failed(address: string, email: string) {
      if (counts.size > 10_000) for (const key of [...counts.keys()]) live(key);
      for (const [key] of keys(address, email)) { const state = live(key); counts.set(key, { count: (state?.count ?? 0) + 1, until: state?.until ?? now() + SIGN_IN_WINDOW_MS }); }
    },
    succeeded(email: string) { counts.delete(`account:${email}`); },
  };
}
/** The account's identity and permissions from its permission profile, or from `profileId` where given. */
export function publicUser(store: Store, id: string, profileId?: string): User {
  const row = store.get('users', id);
  if (!row.active) throw new AppError(401, 'This account is inactive.');
  const profile = store.get('profiles', profileId ?? row.profileId);
  const capabilities=profile.permissionMode==='Detailed permissions'?parsePermissionRules(profile.permissionRules):undefined;
  const permissions = capabilities?moduleSummary(capabilities):Object.fromEntries((['general', 'materials', 'welding', 'tools', 'settings'] as Module[]).map(m => [m, Math.max(0, permissionValue(profile[`${m}Permission`]))])) as User['permissions'];
  return { id: row.id, name: String(row.name), email: String(row.email), profileId: String(row.profileId), permissions,...(capabilities?{capabilities}:{}) };
}
/** The account behind a request as the store records it, with its add rights (see `Actor.canAdd`). */
export const actorOf = (req: Request): Actor => { const user = (req as AuthRequest).user; return { id: user.id, name: user.name, canAdd: resource => canResource(user, resource, 'insert') }; };
export function checkPermission(req: Request, module: Module, level = 1) {
  if ((req as AuthRequest).user.permissions[module] < level) throw new AppError(403, 'Your permission profile does not allow this action.');
}
export function checkResourcePermission(req:Request,key:string,verb:PermissionVerb='show',row?:Row){if(!canResource((req as AuthRequest).user,key,verb,row))throw new AppError(403,'Your permission profile does not allow this action.');}
export function checkActionPermission(req:Request,key:string,data:Record<string,unknown>={}){if(!canAction((req as AuthRequest).user,key,data))throw new AppError(403,'Your permission profile does not allow this action.');}
export function sessionCookie(req: Request, name = 'stelux_session') {
  return req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='))?.slice(name.length + 1) || '';
}
export function newSession(store: Store, userId: string, res: Response, cookieName = 'stelux_session') {
  const token = randomBytes(32).toString('hex');
  store.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  store.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hashToken(token), userId, new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString());
  res.cookie(cookieName, token, { httpOnly: true, sameSite: 'strict', secure: Boolean(res.app.get('secure cookies')), maxAge: 12 * 60 * 60 * 1000, path: '/' });
}
export function authMiddleware(store: Store, cookieName = 'stelux_session') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = sessionCookie(req, cookieName);
      const session = store.db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(hashToken(token), new Date().toISOString()) as { user_id: string } | undefined;
      if (!session) throw new AppError(401, 'Sign in to your workspace.');
      (req as AuthRequest).user = publicUser(store, session.user_id); next();
    } catch (error) { next(error instanceof AppError ? error : new AppError(401, 'Sign in to your workspace.')); }
  };
}
export function ensureAdministrator(store: Store, accounts: (id: string) => User[] = id => [publicUser(store, id)]) {
  const exists = store.list('users').some(u => {if(!u.active)return false;return accounts(u.id).some(user=> ['users','profiles'].every(key=>canResource(user,key,'show')&&canResource(user,key,'insert')&&canResource(user,key,'edit')));});
  if (!exists) throw new AppError(409, 'Keep at least one active administrator in this workspace.');
}
