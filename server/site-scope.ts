import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';
import type { Request, RequestHandler } from 'express';
import { RESOURCE_MAP } from '../shared/resources.ts';
import { SCOPE_PILOTS, SITE_LINKED, SITE_REFUSED, SITE_RULES, SITE_SCOPE_ALL, USER_SITES, linkedSites, readSiteProfiles, scopeLimited, siteIdsField, siteProfilesField, siteProfilesOf, siteScopeField, type ScopePilot } from '../shared/site-scope.ts';
import { projectInPilot } from '../shared/project-scope.ts';
import type { Row } from '../shared/types.ts';
import { SITE_OWNED, ownerSites } from '../shared/welder-data.ts';
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
/** Marks a record of a project that is switched off for the request's pilot (it is not delivered to that pilot). */
const OFF = '\u0000off';
/** Prefix of a record that belongs to several main projects (an older certificate or wire linked to projects of more than one). */
const SEVERAL = '\u0000several\u0000';
export type AllowedSites = 'all' | Set<string>;

/** The main projects an account may reach in a pilot: "all" unless its scope there is "Specific project site(s)". */
export function allowedSites(store: Store, account: Row, pilot: ScopePilot): AllowedSites {
  if (!scopeLimited(account[siteScopeField(pilot)])) return 'all';
  return new Set(store.list(USER_SITES).filter(link => link.userId === account.id && link.pilot === pilot).map(link => String(link.siteId)));
}

/**
 * The scope of one request. `allowed`: the main projects it reaches ('all' for an account that reaches every one);
 * `off`: projects switched off for the pilot, whose records the pilot never delivers or changes (scn-SC-N9).
 */
export class SiteScope {
  private rows = new Map<string, Map<string, Row>>();
  private sites = new Map<string, string>();
  private ownerLists = new Map<string, { links: Row[]; projects: Row[] }>();
  private linkLists = new Map<string, Row[]>();
  /** While the scope resolves a parent itself, its own `store.get` calls are not checked. */
  private resolving = 0;
  /**
   * `focus`: the main project an account that reaches every main project works in (its session's main project). Records
   * in FOCUSED_RESOURCES then follow it as well, as they do for a limited account.
   */
  constructor(private store: Store, readonly pilot: ScopePilot, readonly allowed: Set<string> | 'all', readonly off: ReadonlySet<string> = new Set(), readonly focus = '') {}
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
    if (key === 'projects' && this.off.has(id)) return OFF;
    const memo = `${key}\u0000${id}`;
    const known = this.sites.get(memo);
    if (known !== undefined) return known;
    const row = this.lookup(key, id);
    const site = row ? this.siteOf(key, row, depth + 1) : UNRESOLVED;
    this.sites.set(memo, site);
    return site;
  }
  /**
   * A certificate or welding wire saved before it carried its main project: the main projects of its linked projects
   * (shared/welder-data.ts `ownerSites`); one for all projects stays shared (GLOBAL), one linked to several main
   * projects is reachable from any of them (SEVERAL).
   */
  private ownerSite(key: string, row: Row | Record<string, unknown>): string {
    const owned = SITE_OWNED[key];
    // One read of the links and projects per request.
    let lists = this.ownerLists.get(key);
    if (!lists) { lists = { links: this.store.list(owned.links, true), projects: this.store.list('projects', true) }; this.ownerLists.set(key, lists); }
    const sites = ownerSites(key, row, lists);
    return sites === 'all' ? GLOBAL : sites.length === 1 ? sites[0] : SEVERAL + sites.join('\u0000');
  }
  /** A welder: shared when globally deployable or linked to no main project, otherwise its linked main projects (SITE_LINKED). */
  private linkedSite(key: string, row: Row | Record<string, unknown>): string {
    const rule = SITE_LINKED[key];
    let links = this.linkLists.get(key);
    if (!links) { links = this.store.list(rule.links, true); this.linkLists.set(key, links); }
    const sites = linkedSites(key, row, links);
    return sites === 'all' ? GLOBAL : sites.length === 1 ? sites[0] : SEVERAL + sites.join('\u0000');
  }
  /** The main project of a record: its id, GLOBAL, UNRESOLVED, or OFF. The record's own fields are always read from `row`. */
  siteOf(key: string, row: Row | Record<string, unknown>, depth = 0): string {
    const rule = SITE_RULES[key];
    if (!rule || depth > 8) return UNRESOLVED;
    if (key === 'projects' && typeof row.id === 'string' && this.off.has(row.id)) return OFF;
    if (SITE_LINKED[key]) return this.linkedSite(key, row);
    if (SITE_OWNED[key] && !(typeof row.siteId === 'string' && row.siteId)) return this.ownerSite(key, row);
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
    if (site === OFF) return false;
    const allowed = this.allowed;
    if (allowed === 'all') return !this.focus || !FOCUSED_RESOURCES.includes(key) || site === this.focus || site.startsWith(SEVERAL) && site.slice(SEVERAL.length).split('\u0000').includes(this.focus);
    if (site.startsWith(SEVERAL)) return site.slice(SEVERAL.length).split('\u0000').some(id => allowed.has(id));
    return site === GLOBAL || site !== UNRESOLVED && allowed.has(site);
  }
  allowsSite(siteId: string) { return this.allowed === 'all' || this.allowed.has(siteId); }
  /**
   * `store.recordGuard` of the request. A record of another main project is refused with 403 (`site`); one of a project
   * switched off for the pilot with 404, as if it did not exist there. The switched-off project itself stays readable to
   * the write that switches it off (lists leave it out through `allows`).
   */
  check(key: string, row: Row) {
    if (this.resolving) return;
    const site = this.siteOf(key, row);
    if (site === OFF) { if (key === 'projects') return; throw new AppError(404, 'This record could not be found.'); }
    if (this.allows(key, row)) return;
    throw siteRefused();
  }
}
/**
 * Records that follow the open main project for every account, also one that reaches every main project: the Request
 * archive (MTO Pilot service requests, scn-SC-D6) lists, opens and completes the requests of the open main project only.
 */
export const FOCUSED_RESOURCES = ['service_requests'];
export const siteRefused = (message = 'This record belongs to a main project your account cannot access.') => new AppError(403, message, undefined, SITE_REFUSED);
export const isSiteRefusal = (error: unknown) => error instanceof AppError && error.code === SITE_REFUSED;

const context = new AsyncLocalStorage<SiteScope>();
/** The scope of the current request, or undefined when the account reaches every main project. */
export const currentSiteScope = () => context.getStore();
/** Whether the current request may see a record (true outside a limited request). */
export const inSiteScope = (key: string, row: Row) => context.getStore()?.allows(key, row) ?? true;
/** The records of a list the current request may see. */
export const scopeRows = (key: string, rows: Row[]) => { const scope = context.getStore(); return scope ? rows.filter(row => scope.allows(key, row)) : rows; };

/** Projects switched off for a pilot (shared/project-scope.ts `projectInPilot`). */
export const offProjects = (store: Store, pilot: ScopePilot) => new Set(store.list('projects', true).filter(project => !projectInPilot(project, pilot)).map(project => project.id));
/** The scope of an account in a pilot (all of its main projects), or undefined when it reaches every main project. */
export function siteScopeFor(store: Store, account: Row, pilot: ScopePilot): SiteScope | undefined {
  const allowed = allowedSites(store, account, pilot);
  return allowed === 'all' ? undefined : new SiteScope(store, pilot, allowed);
}

/** Request header naming a main project (API clients; the application relies on the session's main project instead). Plain links may carry `?site=`. */
export const SITE_HEADER = 'x-stelux-site';
export interface ActiveSite {
  /** The account is limited to specific project sites in this pilot. */
  limited: boolean;
  /** The main project the request works in; a limited account's profile and scope are those of this main project. */
  siteId?: string;
  /** A limited account with several main projects and none chosen: it may only load the main-project choice. */
  choose: boolean;
  /** The scope the request runs in, or undefined when nothing is out of reach. */
  scope?: SiteScope;
}
/**
 * THE resolution of the active main project of a request. The main project is the one chosen for the sign-in session
 * (`sessionSite`, server/auth.ts), so it is the same for every pilot and every tab of that session; an explicit header or
 * `?site=` names one instead. For an account limited to specific project sites in the pilot:
 * - a named main project must be one of its own (403 `site` otherwise, also for a forged header); the session's main
 *   project counts only where it is one of its own in this pilot (otherwise none is chosen here);
 * - without one, its only main project applies; with several, none is active and only the choice may be loaded;
 * - the request then reaches that one main project only, so rights of one main project never act on another.
 * An account that reaches every main project is not narrowed, except that FOCUSED_RESOURCES follow its main project.
 * Either way, records of projects switched off for the pilot are out of reach.
 */
export function activeSite(store: Store, req: Request, account: Row, pilot: ScopePilot, sessionSiteId = ''): ActiveSite {
  const header = req.headers[SITE_HEADER], query = ['GET', 'HEAD'].includes(req.method) ? req.query.site : undefined;
  if (header !== undefined && query !== undefined && header !== query) throw siteRefused();
  const named = header ?? query;
  if (named !== undefined && typeof named !== 'string') throw siteRefused();
  const off = offProjects(store, pilot);
  const allowed = allowedSites(store, account, pilot);
  if (allowed === 'all') {
    const chosen = named || sessionSiteId;
    const focus = chosen && store.list('sites').some(site => site.id === chosen) ? chosen : '';
    return { limited: false, ...(focus ? { siteId: focus } : {}), choose: false, scope: off.size || focus ? new SiteScope(store, pilot, 'all', off, focus) : undefined };
  }
  if (named && !allowed.has(named)) throw siteRefused();
  const requested = named || (sessionSiteId && allowed.has(sessionSiteId) ? sessionSiteId : '');
  const siteId = requested || (allowed.size === 1 ? [...allowed][0] : undefined);
  if (siteId) return { limited: true, siteId, choose: false, scope: new SiteScope(store, pilot, new Set([siteId]), off) };
  return { limited: true, choose: allowed.size > 1, scope: new SiteScope(store, pilot, new Set(), off) };
}
/** The scope of one of an account's main projects (the main-project choice, notifications of another account). */
export const singleSiteScope = (store: Store, pilot: ScopePilot, siteId: string) => new SiteScope(store, pilot, new Set([siteId]), offProjects(store, pilot));
/** Continue the request inside its scope (a plain call without one). */
export const runInSiteScope = (scope: SiteScope | undefined, next: () => void) => scope ? context.run(scope, next) : next();
/** Run `fn` inside a scope of its own and return its result. */
export const withSiteScope = <T>(scope: SiteScope, fn: () => T): T => context.run(scope, fn);
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

/** The pilots whose project site access a user write changes (scope value, chosen sites or their profiles). */
export function siteAccessChanges(store: Store, input: Record<string, unknown>, existing?: Row): ScopePilot[] {
  return SCOPE_PILOTS.filter(pilot => {
    const profiles = input[siteProfilesField(pilot)];
    if (profiles !== undefined && JSON.stringify(siteProfilesOf(profiles)) !== JSON.stringify(siteProfilesOf(existing?.[siteProfilesField(pilot)]))) return true;
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
 * The profiles per project site of a user write: a valid {siteId: profileId} map of existing main projects and
 * profiles, stored in its normalised text. Checked before the write (422 with the field otherwise).
 */
export function assertSiteProfiles(store: Store, input: Record<string, unknown>) {
  for (const pilot of SCOPE_PILOTS) {
    const name = siteProfilesField(pilot);
    if (input[name] === undefined) continue;
    const read = readSiteProfiles(input[name]);
    if ('error' in read) throw new AppError(422, read.error, { [name]: read.error });
    const map = siteProfilesOf(read.text);
    const sites = new Set(store.list('sites', true).map(row => row.id)), profiles = new Set(store.list('profiles').map(row => row.id));
    if (Object.entries(map).some(([site, profile]) => !sites.has(site) || !profiles.has(profile))) throw new AppError(422, 'Choose an active profile for every ticked project site.', { [name]: 'Choose an active profile for every ticked project site.' });
    input[name] = read.text;
  }
}
/**
 * The main projects an administrator reaches in a pilot when judging access it gives to accounts: none in a pilot it
 * is not enabled in (sec1-001), otherwise `allowedSites`.
 */
export function actorReach(store: Store, actor: Row, pilot: ScopePilot): AllowedSites {
  return actor[`${pilot}Enabled`] === false ? new Set() : allowedSites(store, actor, pilot);
}
const enabledIn = (value: unknown) => value !== false;
const text = (value: unknown) => value === undefined || value === null ? '' : String(value);
/**
 * The pilots in which a change of an existing account switches the pilot on or off or changes the profile it works
 * under there (`weldEnabled` / `mtoEnabled`, `weldProfileId` / `mtoProfileId`, and `profileId`, which applies in every
 * pilot the account is enabled in where no pilot profile is chosen). These widen or narrow access like the project site
 * access does (sec1-001, sec1-002). A new account's reach is judged as saved (`assertAccountReach`).
 */
export function pilotAccessChanges(input: Record<string, unknown>, existing?: Row): ScopePilot[] {
  if (!existing) return [];
  const profileChanged = input.profileId !== undefined && text(input.profileId) !== text(existing.profileId);
  return SCOPE_PILOTS.filter(pilot => {
    const enabled = input[`${pilot}Enabled`], profile = input[`${pilot}ProfileId`];
    const wasEnabled = enabledIn(existing[`${pilot}Enabled`]), isEnabled = enabled === undefined ? wasEnabled : enabledIn(enabled);
    if (isEnabled !== wasEnabled) return true;
    if (profile !== undefined && text(profile) !== text(existing[`${pilot}ProfileId`])) return true;
    return profileChanged && (wasEnabled || isEnabled);
  });
}
/**
 * Only an administrator who reaches every main project in a pilot may change another account's project site
 * access there, switch the pilot on or off for it or change its profile there, so access cannot be widened by an
 * account that does not have it itself. Nobody changes these for its own account.
 */
export function assertSiteAccessEdit(store: Store, actorId: string, input: Record<string, unknown>, existing?: Row) {
  const sites = siteAccessChanges(store, input, existing), grants = pilotAccessChanges(input, existing);
  if (!sites.length && !grants.length) return;
  if (existing && existing.id === actorId) throw new AppError(403, sites.length ? 'You cannot change your own project site access. Ask another administrator.' : 'You cannot change your own applications or permission profiles. Ask another administrator.');
  const actor = store.get('users', actorId);
  if (sites.some(pilot => actorReach(store, actor, pilot) !== 'all')) throw new AppError(403, 'Only an administrator with access to all project sites can change project site access.');
  if (grants.some(pilot => actorReach(store, actor, pilot) !== 'all')) throw new AppError(403, 'Only an administrator with access to all project sites of an application can change its access or permission profile.');
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
    const mine = actorReach(store, actor, pilot);
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
