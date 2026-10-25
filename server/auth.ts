import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppError, Store } from './store.ts';
import { permissionValue } from '../shared/resources.ts';
import type { Module, User } from '../shared/types.ts';
import { canResource,canAction,parsePermissionRules,moduleSummary } from '../shared/permissions.ts';
import type {PermissionVerb,Row} from '../shared/types.ts';
export interface AuthRequest extends Request { user: User }
export const hashToken = (v: string) => createHash('sha256').update(v).digest('hex');
export function passwordHash(password: unknown) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) throw new AppError(422, 'Use a password between 10 and 256 characters.', { password: 'At least 10 characters are required.' });
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password: unknown, stored: string) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64); const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function publicUser(store: Store, id: string): User {
  const row = store.get('users', id);
  if (!row.active) throw new AppError(401, 'This account is inactive.');
  const profile = store.get('profiles', row.profileId);
  const capabilities=profile.permissionMode==='Detailed permissions'?parsePermissionRules(profile.permissionRules):undefined;
  const permissions = capabilities?moduleSummary(capabilities):Object.fromEntries((['general', 'materials', 'welding', 'tools', 'settings'] as Module[]).map(m => [m, Math.max(0, permissionValue(profile[`${m}Permission`]))])) as User['permissions'];
  return { id: row.id, name: String(row.name), email: String(row.email), profileId: String(row.profileId), permissions,...(capabilities?{capabilities}:{}) };
}
export const actorOf = (req: Request) => ({ id: (req as AuthRequest).user.id, name: (req as AuthRequest).user.name });
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
export function ensureAdministrator(store: Store) {
  const exists = store.list('users').some(u => {if(!u.active)return false;const user=publicUser(store,u.id);return ['users','profiles'].every(key=>canResource(user,key,'show')&&canResource(user,key,'insert')&&canResource(user,key,'edit'));});
  if (!exists) throw new AppError(409, 'Keep at least one active administrator in this workspace.');
}
