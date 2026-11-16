import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';
import type { RequestHandler } from 'express';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { SCOPE_PILOTS, SITE_REFUSED, SITE_RULES, SITE_SCOPE_ALL, USER_SITES, scopeLimited, siteIdsField, siteScopeField, type ScopePilot } from '../shared/site-scope.ts';
import type { Row } from '../shared/types.ts';
import { AppError, type Store } from './store.ts';

/**
 * Server side of access per project site (shared/site-scope.ts), hosted profile with pilots only.
 *
 * Default-deny for a limited account: once per request the middleware derives `allowedSites(account, pilot)`. When
 * it is not "all", the request runs inside a `SiteScope` (AsyncLocalStorage), and
 * - every list the server returns is filtered with `allows()` (through `access.visible`), and
 * - every record read through `store.get` is checked (`store.recordGuard`). Every write reads its record before and
 *   after writing (create / update / archive in server/store.ts), so a write that would touch, create or move a
 *   record of a main project outside the scope is refused with 403 and its transaction is rolled back. This covers
 *   the record routes, bulk edit, uploads and every workflow action without a check per action.
 * Records of no main project (`global` rules) stay readable and writable as the profile allows.
 */

/** Marks "belongs to no main project" and "cannot be told" in the resolver. */
const GLOBAL = '', UNRESOLVED = '\u0000unresolved';
export type AllowedSites = 'all' | Set<string>;

/** The main projects an account may reach in a pilot: "all" unless its scope there is "Specific project site(s)". */
export function allowedSites(store: Store, account: Row, pilot: ScopePilot): AllowedSites {
  if (!scopeLimited(account[siteScopeField(pilot)])) return 'all';
  return new Set(store.list(USER_SITES).filter(link => link.userId === account.id && link.pilot === pilot).map(link => String(link.siteId)));
}

export class SiteScope {
  private rows = new Map<string, Map<string, Row>>();
  private sites = new Map<string, string>();
  /** While the scope resolves a parent itself, its own `store.get` calls are not checked. */
  private resolving = 0;
  constructor(private store: Store, readonly pilot: ScopePilot, readonly allowed: Set<string>) {}
  /** A record by id from one read of its collection per request; records written during the request are read directly. */
  private lookup(key: string, id: string): Row | undefined {
    if (!RESOURCE_MAP[key]) return undefined;
    let map = this.rows.get(key);
    if (!map) { map = new Map(this.store.list(key, true).map(row => [row.id, row])); this.rows.set(key, map); }
    const found = map.get(id);
    if (found) return found;
    this.resolving++;
    try { const row = this.store.get(key, id, true); map.set(id, row); return row; } catch { return undefined; } finally { this.resolving--; }
  }
  private parentSite(key: string, id: string, depth: number): string {
    const memo = `${key}\u0000${id}`;
    const known = this.sites.get(memo);
    if (known !== undefined) return known;
    const row = this.lookup(key, id);
    const site = row ? this.siteOf(key, row, depth + 1) : UNRESOLVED;
    this.sites.set(memo, site);
    return site;
  }
  /** The main project of a record: its id, GLOBAL, or UNRESOLVED. The record's own fields are always read from `row`. */
  siteOf(key: string, row: Row | Record<string, unknown>, depth = 0): string {
    const rule = SITE_RULES[key];
    if (!rule || depth > 8) return UNRESOLVED;
    if (rule === 'global') return GLOBAL;
    if (rule === 'site') return String(row.id || '') || UNRESOLVED;
    if (rule === 'entity') {
      const target = String(row.entityType || ''), id = row.entityId;
      return target !== 'attachments' && RESOURCE_MAP[target] && typeof id === 'string' && id ? this.parentSite(target, id, depth) : UNRESOLVED;
    }
    for (const [field, target] of rule.via) {
      const value = row[field];
      if (typeof value === 'string' && value) return target === 'sites' ? value : this.parentSite(target, value, depth);
    }
    return rule.orphan === 'global' ? GLOBAL : UNRESOLVED;
  }
  /** Whether the account may see or change this record. */
  allows(key: string, row: Row | Record<string, unknown>): boolean {
    const site = this.siteOf(key, row);
    return site === GLOBAL || site !== UNRESOLVED && this.allowed.has(site);
  }
  allowsSite(siteId: string) { return this.allowed.has(siteId); }
  /** `store.recordGuard` of a limited request. */
  check(key: string, row: Row) {
    if (this.resolving || this.allows(key, row)) return;
    throw siteRefused();
  }
}
export const siteRefused = (message = 'This record belongs to a main project your account cannot access.') => new AppError(403, message, undefined, SITE_REFUSED);
export const isSiteRefusal = (error: unknown) => error instanceof AppError && error.code === SITE_REFUSED;

const context = new AsyncLocalStorage<SiteScope>();
/** The scope of the current request, or undefined when the account reaches every main project. */
export const currentSiteScope = () => context.getStore();
/** Whether the current request may see a record (true outside a limited request). */
export const inSiteScope = (key: string, row: Row) => context.getStore()?.allows(key, row) ?? true;
/** The records of a list the current request may see. */
export const scopeRows = (key: string, rows: Row[]) => { const scope = context.getStore(); return scope ? rows.filter(row => scope.allows(key, row)) : rows; };

/** The scope of an account in a pilot, or undefined when it reaches every main project. */
export function siteScopeFor(store: Store, account: Row, pilot: ScopePilot): SiteScope | undefined {
  const allowed = allowedSites(store, account, pilot);
  return allowed === 'all' ? undefined : new SiteScope(store, pilot, allowed);
}
/** Continue the request inside its scope (a plain call without one). */
export const runInSiteScope = (scope: SiteScope | undefined, next: () => void) => scope ? context.run(scope, next) : next();
/** Install the record guard on the store (once per app, pilots profile only). */
export function guardStore(store: Store) { store.recordGuard = (key, row) => context.getStore()?.check(key, row); }

/**
 * File uploads finish on the request stream, outside the request's async context: the route after the upload
 * middleware is bound back to the context the middleware was entered in.
 */
export function keepSiteScope<T extends { single(name: string): RequestHandler }>(upload: T): T {
  return Object.assign(Object.create(upload) as T, {
    single: (name: string): RequestHandler => { const handler = upload.single(name); return (req, res, next) => handler(req, res, AsyncResource.bind(next)); },
  });
}

/** The pilots whose project site access a user write changes (scope value or chosen sites). */
export function siteAccessChanges(store: Store, input: Record<string, unknown>, existing?: Row): ScopePilot[] {
  return SCOPE_PILOTS.filter(pilot => {
    const scope = input[siteScopeField(pilot)], ids = input[siteIdsField(pilot)];
    const before = scopeLimited(existing?.[siteScopeField(pilot)]);
    const scopeChanged = scope !== undefined && (existing ? scopeLimited(scope) !== before : scope !== SITE_SCOPE_ALL && scope !== '');
    if (scopeChanged) return true;
    if (ids === undefined) return false;
    if (!Array.isArray(ids)) return true;
    const current = existing ? store.list(USER_SITES).filter(link => link.userId === existing.id && link.pilot === pilot).map(link => String(link.siteId)) : [];
    return JSON.stringify([...new Set(ids.map(String))].sort()) !== JSON.stringify([...new Set(current)].sort());
  });
}
/**
 * Only an administrator who reaches every main project in a pilot may change another account's project site
 * access there, so access cannot be widened by an account that does not have it itself.
 */
export function assertSiteAccessEdit(store: Store, actorId: string, input: Record<string, unknown>, existing?: Row) {
  const changes = siteAccessChanges(store, input, existing);
  if (!changes.length) return;
  if (existing && existing.id === actorId) throw new AppError(403, 'You cannot change your own project site access. Ask another administrator.');
  const actor = store.get('users', actorId);
  if (changes.some(pilot => allowedSites(store, actor, pilot) !== 'all')) throw new AppError(403, 'Only an administrator with access to all project sites can change project site access.');
}

/**
 * An administrator limited to specific project sites in a pilot may only create, change or archive accounts whose
 * reach in that pilot stays within its own: an account enabled there must be limited to a subset of the
 * administrator's main projects. Otherwise a limited administrator could create an account that reaches every main
 * project, or set the password of one that does, and so widen its own access. Checked on the account as it is before
 * a change and, inside the write's transaction, as it is after it (so every field combination is judged as saved).
 */
export function assertAccountReach(store: Store, actorId: string, account: Row) {
  const actor = store.get('users', actorId);
  for (const pilot of SCOPE_PILOTS) {
    const mine = allowedSites(store, actor, pilot);
    if (mine === 'all' || account[`${pilot}Enabled`] === false) continue;
    const theirs = allowedSites(store, account, pilot);
    if (theirs === 'all' || [...theirs].some(id => !mine.has(id))) throw new AppError(403, 'This account reaches main projects outside your project site access. Ask an administrator with access to all project sites.');
  }
}

/**
 * Copy isometrics carries welds (Weld Pilot) and materials / calculations (MTO Pilot) from either pilot
 * (`copyParts` in server/release-access.ts). Each ticked part must also be within the account's project site
 * access of the pilot that owns it; the current pilot's scope is enforced by the record guard.
 */
export function assertCopyInScope(store: Store, account: Row, input: Record<string, unknown>) {
  const parts: [string, ScopePilot][] = [['copyWelds', 'weld'], ['copyMaterials', 'mto'], ['copyCalculations', 'mto']];
  for (const [part, pilot] of parts) {
    if (input[part] !== true) continue;
    const scope = siteScopeFor(store, account, pilot);
    if (!scope) continue;
    let project: Row; try { project = store.get('projects', input.projectId); } catch { continue; }
    if (!scope.allows('projects', project)) throw siteRefused(`Your ${pilot === 'weld' ? 'Weld Pilot' : 'MTO Pilot'} access does not include this main project.`);
  }
}
