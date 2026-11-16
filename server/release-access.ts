import { RESOURCES } from '../shared/resources.ts';
import { actionScope, areaPilots, canResource, canScope, COPY_SCOPES, PAGE_SCOPES, pilotBoundary, RESOURCE_SCOPES, type CopyPart, type CopyParts } from '../shared/permissions.ts';
import { actionAvailable, fieldAvailable, PILOT_KEYS, projectRow, resourceAvailable, rowAvailable, type PilotKey } from '../shared/release.ts';
import { PILOT_MAP } from '../shared/pilots.ts';
import { SIGNATURE_KINDS } from '../shared/signatures.ts';
import { punchWriteError } from '../shared/punch.ts';
import type { Availability, AuditEvent, Module, Row, User } from '../shared/types.ts';
import { Store, AppError } from './store.ts';
import { effectiveProfileId, pilotHides, publicUser } from './auth.ts';
import { availableWps, RELATIONS, relationMatches } from '../shared/welding.ts';
import { WPS_COPY_FIELDS } from '../shared/wps.ts';
import { ENABLEMENT_INPUT, enablementKey, missingRequired } from '../shared/weld-catalogs.ts';
import { assertWeldEntry, assertWeldUnlocked } from './weld-entry.ts';
import { deleteRefusal, guardIrn, guardSiteIrn } from './iso-pages.ts';
import { allowedSites, inSiteScope, isSiteRefusal, singleSiteScope, siteScopeFor, withSiteScope } from './site-scope.ts';
import { STANDARD_DOCUMENT_MESSAGE, isStandardAttachmentName } from '../shared/weld-catalogs.ts';

export const SITE_DELETE_REFUSED = 'This project site still has projects and cannot be deleted. Delete its projects first.';
const notFound = () => new AppError(404, 'This resource could not be found.');
/** Refusal of a pilot the account may not enter (or of a workspace request without a pilot). The client returns to the selector. */
export const pilotRefused = (message = 'Your account does not have access to this application workspace.') => new AppError(403, message, undefined, 'pilot');
const COPY_PART_NAMES: Record<CopyPart, string> = { copyWelds: 'welds', copyMaterials: 'material requirements', copyCalculations: 'calculation lines' };
const NO_PERMISSIONS: User['permissions'] = { general: 0, materials: 0, welding: 0, tools: 0, settings: 0 };

export function releaseAccess(store: Store, availability?: Availability) {
  function user(original: User): User {
    if (!availability) return original;
    const modules = new Set(RESOURCES.filter(r => resourceAvailable(availability, r.key)).map(r => r.module));
    // Areas of delivered actions count too: "Assign ISO to FWP" (91) is an action of its own, without a resource; so do
    // the page areas (Weld dashboard 35, Material list 78, …), which gate a page rather than a record type.
    const scopes = new Set([...Object.entries(RESOURCE_SCOPES).filter(([key]) => resourceAvailable(availability, key)).flatMap(([, keys]) => keys), ...Object.keys(availability.actions).map(key => actionScope(key)[0]).filter(Boolean), ...(availability.features.includes('pilots') ? PAGE_SCOPES : [])]);
    return { ...original, availability,
      permissions: Object.fromEntries(Object.entries(original.permissions).map(([module, level]) => [module, modules.has(module as Module) ? level : 0])) as User['permissions'],
      ...(original.capabilities ? { capabilities: Object.fromEntries(Object.entries(original.capabilities).filter(([key]) => scopes.has(key))) } : {}),
    };
  }
  function resource(key: string) {
    if (!resourceAvailable(availability, key)) throw notFound();
    return store.resource(key);
  }
  function visible(account: User, key: string, row: Row): boolean {
    if (!rowAvailable(availability, key, row)) return false;
    // Storehouses are MTO Pilot records: a Weld Pilot request never receives them (w1-left-6).
    if (pilotHides(account, key)) return false;
    // Access per project site: a limited request sees only records of its main projects and records of none.
    if (!inSiteScope(key, row)) return false;
    if (key !== 'attachments') return canResource(account, key, 'show', row);
    try {
      const target = String(row.entityType);
      return target !== 'attachments' && resourceAvailable(availability, target) && visible(account, target, store.get(target, row.entityId, true));
    } catch { return false; }
  }
  function record(key: string, id: unknown, archived = false): Row {
    resource(key);
    const row = store.get(key, id, archived);
    if (!rowAvailable(availability, key, row)) throw notFound();
    if (availability && key === 'attachments') {
      const target = String(row.entityType);
      if (target === 'attachments') throw notFound();
      record(target, row.entityId, true);
    }
    return row;
  }
  function input(key: string, value: Record<string, unknown>, action = false, existing?: Row) {
    if (!availability) return;
    const names = action ? availability.actions[key] : availability.resources[key];
    if (!names || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(name => !names.includes(name) && !(name === '_version' && !action) && !(!action && enablementKey(key) && ENABLEMENT_INPUT.includes(name)))) throw notFound();
    if (action && !actionAvailable(availability, key, value.type)) throw notFound();
    if (!action && ['inspection_requests', 'inspection_results'].includes(key) && value.type !== undefined && !availability.inspectionTypes.includes(String(value.type))) throw notFound();
    // A WPS copy is made by the copy action (server/wps.ts); a plain write cannot make or change one.
    if (!action && key === 'wps' && WPS_COPY_FIELDS.some(name => value[name] !== undefined)) throw new AppError(422, 'Use Copy to copy a WPS to another project site.');
    if (!action && key === 'punchlists') { const refusal = punchWriteError(value, existing); if (refusal) throw new AppError(422, refusal); }
    // Automatic IRN numbers: a typed IRN is refused while the main project numbers its isometrics itself; only the fill-irn action switches that on.
    if (!action && pilots && key === 'isometrics') guardIrn(store, value, existing);
    if (!action && pilots && key === 'sites' && (value.irnAuto === true || (value.irnCounter !== undefined && value.irnCounter !== '' && value.irnCounter !== null))) guardSiteIrn(value);
    if (!action && key === 'welds' && (!existing || value.isoId !== undefined || value.wpsId !== undefined)) {
      const wpsId = value.wpsId ?? existing?.wpsId;
      if (wpsId) {
        const iso = record('isometrics', value.isoId ?? existing?.isoId);
        const wps = record('wps', wpsId);
        if (wps.active === false && existing?.wpsId !== wpsId) throw new AppError(422, 'Choose an active WPS.', { wpsId: 'This procedure is inactive.' });
        const rows = Object.fromEntries(['projects', 'wps_projects', 'wps_sites'].map(resource => [resource, store.list(resource)]));
        if (!availableWps(rows, wps, String(iso.projectId))) throw new AppError(422, 'Choose a WPS available for this project and site.', { wpsId: 'Select a procedure available for this project and site.' });
      }
    }
  }
  /**
   * Hosted rule of the weld catalogs: the fields the reference marks as required must be filled (the shared resource keeps
   * them optional for the other profiles). A request that only switches availability does not touch them.
   */
  function complete(key: string, value: Record<string, unknown>, existing?: Row) {
    if (!pilots || !value || typeof value !== 'object') return;
    if (!Object.keys(value).some(name => name !== '_version' && !ENABLEMENT_INPUT.includes(name))) return;
    const errors = missingRequired(key, value, existing);
    if (Object.keys(errors).length) throw new AppError(422, 'Please check the highlighted fields.', errors);
  }
  /**
   * A link can only be added to a record the account may read. A relation field (the PQRs of a WPS, the projects of
   * an ITP, the main projects of a welder) that names a record not linked yet needs view access to that record; links
   * already there may stay or be removed. Without this, the right to edit the owner would be enough to link any id.
   */
  function links(account: User, key: string, value: Record<string, unknown>, existing?: Row) {
    if (!value || typeof value !== 'object') return;
    for (const relation of RELATIONS[key] || []) {
      if (relation.pilotsOnly && !pilots) continue;
      let requested = value[relation.field];
      // A WPS written with its primary PQR alone links that PQR (see `syncRelations` in server/store.ts).
      if (key === 'wps' && relation.field === 'pqrIds' && requested === undefined && value.pqrId) requested = [value.pqrId];
      if (!Array.isArray(requested)) continue;
      const linked = new Set(existing ? store.list(relation.resource).filter(link => link[relation.ownerKey] === existing.id && relationMatches(relation, link)).map(link => String(link[relation.targetKey])) : []);
      for (const id of new Set(requested)) {
        if (typeof id !== 'string' || !id || linked.has(id)) continue;
        let target: Row;
        try { target = store.get(relation.target, id); } catch (error) { if (isSiteRefusal(error)) throw error; continue; /* missing or archived: the write reports it with the field */ }
        if (!visible(account, relation.target, target)) throw new AppError(403, `Your permission profile does not allow linking ${store.resource(relation.target).title.toLowerCase()}.`, { [relation.field]: 'Select records you can open.' });
      }
    }
  }
  /** Weld entry rules and the lock of completed phases for the plain record routes of the hosted profile. */
  function weldRecord(key: string, value: Record<string, unknown>, existing?: Row) { if (pilots && key === 'welds') assertWeldEntry(store, value, existing); }
  /** Deleting or bringing back a weld of a completed phase is refused too. */
  function archive(key: string, row: Row) {
    if (pilots && key === 'welds') assertWeldUnlocked(store, row);
    // Delete in the reference: an isometric with welds, materials, reservations, calculations or started work, and a project that is not blank, stay (422: its sentence reaches the user).
    if (pilots && !row._archived) { const refusal = deleteRefusal(store, key, row); if (refusal) throw new AppError(422, refusal); }
    // Delete project site (reference "Delete project site" / "Are you sure?"): refused while the site still has projects.
    if (pilots && key === 'sites' && !row._archived && store.list('projects').some(project => project.siteId === row.id)) throw new AppError(409, SITE_DELETE_REFUSED);
    // The documents the reference ships cannot be deleted.
    if (pilots && key === 'attachment_names' && !row._archived && isStandardAttachmentName(row)) throw new AppError(422, STANDARD_DOCUMENT_MESSAGE);
  }
  function audit(account: User, event: AuditEvent): AuditEvent | null {
    try {
      if (!visible(account, event.entityType, record(event.entityType, event.entityId, true))) return null;
    } catch { return null; }
    if (availability) {
      if (!['created', 'updated', 'archived', 'restored', 'inspected', 'repair', 'copied', 'released', 'reopened', 'finished', 'passed', 'removed', 'transferred', 'returned', 'corrected', 'adjusted', 'completed', 'cancelled', 'approved', 'promoted'].includes(event.action)) return null;
      if (event.action === 'inspected' && !availability.inspectionTypes.some(type => ['accepted', 'rejected'].some(result => event.summary.startsWith(`${type} ${result} · `)))) return null;
    }
    // Release and Reopen keep their sentences: they carry the report number and the reason the user typed.
    if (event.action === 'released' || event.action === 'reopened') return event;
    return availability || account.capabilities ? { ...event, summary: `${event.action[0].toUpperCase() + event.action.slice(1)} ${resource(event.entityType).singular}` } : event;
  }
  const project = (key: string, row: Row) => projectRow(availability, key, row);
  const pilots = Boolean(availability?.features.includes('pilots'));
  /**
   * The account inside a pilot: that pilot's profile (the profile of main project `siteId` for an account limited to
   * specific project sites), projected to the delivered scope and bounded to the pilot. Null when the account is not
   * enabled there or the profile is unavailable. Entering a pilot depends on the application being enabled only
   * (reference: 'No permission' = the application right); what the account then sees and does is decided per area by
   * every route, so a profile without rights in the pilot sees no-rights pages. An inactive account still fails with 401.
   */
  function inPilot(id: string, pilot: PilotKey, siteId?: string): User | null {
    const row = store.get('users', id);
    if (!row.active) throw new AppError(401, 'This account is inactive.');
    const profileId = effectiveProfileId(row, pilot, siteId);
    if (!profileId) return null;
    let base: User;
    try { base = publicUser(store, id, profileId); } catch { return null; }
    return pilotBoundary(user(base), pilot);
  }
  /** The accounts of a limited account in a pilot, one per main project (its pilot profile alone when it reaches every one). */
  function siteAccounts(id: string, pilot: PilotKey): { siteId?: string; account: User }[] {
    const allowed = allowedSites(store, store.get('users', id), pilot);
    const sites = allowed === 'all' || !allowed.size ? [undefined] : [...allowed];
    return sites.map(siteId => ({ siteId, account: inPilot(id, pilot, siteId) })).filter((entry): entry is { siteId: string | undefined; account: User } => Boolean(entry.account));
  }
  const enterable = (id: string) => PILOT_KEYS.filter(pilot => inPilot(id, pilot) || siteAccounts(id, pilot).length);
  /** The pilot a request names, when the account may enter it; refused otherwise. */
  function pilotOf(id: string, value: unknown): PilotKey {
    if (typeof value !== 'string' || !(PILOT_KEYS as readonly string[]).includes(value) || !enterable(id).includes(value as PilotKey)) throw pilotRefused();
    return value as PilotKey;
  }
  /**
   * The account for a request in pilot `value` working in main project `siteId` (server/site-scope.ts `activeSite`
   * resolves and checks it); refused unless the account may enter the pilot.
   */
  function pilotAccount(id: string, value: unknown, siteId?: string): User {
    const pilot = pilotOf(id, value);
    const account = inPilot(id, pilot, siteId);
    if (!account) throw pilotRefused();
    const limited = allowedSites(store, store.get('users', id), pilot) !== 'all';
    // The main project of the request: a limited account's is the one its profile was evaluated for; an account that reaches
    // every main project works in its session's main project (it changes nothing of its rights).
    return { ...account, pilots: enterable(id), ...(limited ? { siteLimited: true } : {}), ...(siteId ? { siteId } : {}) };
  }
  /**
   * A limited account with several main projects before it chose one: no rights at all (every route refuses it), only
   * the main-project choice (`choiceRows`).
   */
  function chooser(id: string, value: unknown): User {
    const pilot = pilotOf(id, value), base = publicUser(store, id);
    return { id: base.id, name: base.name, email: base.email, profileId: base.profileId, availability, permissions: { ...NO_PERMISSIONS }, capabilities: {}, pilot, pilots: enterable(id), siteLimited: true, siteRequired: true };
  }
  /** What the main-project choice of a limited account shows: per main project, the records its own profile reads there. */
  const CHOICE_RESOURCES = ['sites', 'projects', 'isometrics', 'welds', 'diameters'];
  function choiceRows(id: string, pilot: PilotKey): Record<string, Row[]> {
    const output: Record<string, Map<string, Row>> = {};
    for (const { siteId, account } of siteAccounts(id, pilot)) {
      if (!siteId) continue;
      withSiteScope(singleSiteScope(store, pilot, siteId), () => {
        for (const key of CHOICE_RESOURCES) {
          if (!resourceAvailable(availability, key) || !canResource(account, key)) continue;
          const map = output[key] ??= new Map();
          for (const row of store.list(key, true)) if (!map.has(row.id) && visible(account, key, row)) map.set(row.id, project(key, row));
        }
      });
    }
    return Object.fromEntries(Object.entries(output).map(([key, map]) => [key, [...map.values()]]));
  }
  /** The account as sign-in, status, the selector, password and sign-out see it. With pilots: identity and the pilots it may enter, no permissions. */
  function present(id: string): User {
    const base = publicUser(store, id);
    if (!pilots) return user(base);
    return { id: base.id, name: base.name, email: base.email, profileId: base.profileId, availability, permissions: { ...NO_PERMISSIONS }, pilots: enterable(id) };
  }
  /** Main projects the account may choose, and in which pilots (selector requests; no other records). */
  function mainProjects(id: string) {
    const output = new Map<string, { id: string; name: string; pilots: PilotKey[] }>();
    for (const pilot of PILOT_KEYS) {
      if (!enterable(id).includes(pilot)) continue;
      const allowed = allowedSites(store, store.get('users', id), pilot);
      for (const site of store.list('sites')) {
        if (allowed !== 'all' && !allowed.has(site.id)) continue;
        // A limited account reads each of its main projects with that main project's own profile.
        const account = inPilot(id, pilot, allowed === 'all' ? undefined : site.id);
        if (!account || !canResource(account, 'sites', 'show', site)) continue;
        const entry = output.get(site.id) || { id: site.id, name: String(site.name), pilots: [] };
        entry.pilots.push(pilot); output.set(site.id, entry);
      }
    }
    return [...output.values()];
  }
  /**
   * Accounts (other than `except`) that may see a record in a pilot: enabled there, allowed to read that kind of record, and
   * with the record's main project in reach. Evaluated per account, so a notification is only ever written for an account
   * that could open the record itself.
   */
  function recipients(key: string, row: Row, pilot: PilotKey, except?: string): string[] {
    return store.list('users').filter(account => account.id !== except && account.active !== false).filter(account => {
      try {
        const scope = siteScopeFor(store, account, pilot);
        if (scope && !scope.allows(key, row)) return false;
        // A limited account reads the record with the profile of the record's main project.
        const site = scope?.siteOf(key, row);
        const member = inPilot(account.id, pilot, site && scope!.allowsSite(site) ? site : undefined);
        return Boolean(member && canResource(member, key, 'show', row));
      } catch { return false; }
    }).map(account => account.id);
  }
  /** Accounts the last-administrator check evaluates: with pilots, the account in every pilot it may enter (per main project where limited); otherwise its profile as before. */
  const administrators = (id: string): User[] => pilots ? PILOT_KEYS.flatMap(pilot => siteAccounts(id, pilot).map(entry => entry.account)) : [publicUser(store, id)];
  /** Pilots profile: a signature record always belongs to the account writing it; one record per signature type. */
  function owner(account: User, key: string, value: Record<string, unknown>, existing?: Row) {
    if (pilots && key === 'company_data' && !existing && store.list('company_data').length) throw new AppError(409, 'Company data already exists. Edit it instead.');
    if (!pilots || key !== 'signatures') return;
    if (existing ? existing.userId !== account.id : value.userId !== account.id) throw new AppError(403, 'You can only change your own signatures.');
    if (value.userId !== undefined && value.userId !== account.id) throw new AppError(403, 'You can only change your own signatures.');
    if (existing && value.kind !== undefined && value.kind !== existing.kind) throw new AppError(422, 'The signature type cannot be changed.', { kind: 'Keep the signature type.' });
    if (!existing && !SIGNATURE_KINDS.some(item => item.kind === value.kind)) throw new AppError(422, 'Choose a full or short signature.', { kind: 'Choose a signature type.' });
    if (!existing && store.list('signatures').some(row => row.userId === account.id && row.kind === value.kind)) throw new AppError(409, 'This signature already exists. Save a new image to replace it.');
  }
  /**
   * DELIBERATE PILOT-BOUNDARY CROSSING (2 of 2; the other is `isoSummariesFor` in `server/iso-summary.ts`).
   *
   * Copy isometrics may carry welds (Weld Pilot), material requirements and calculation lines (MTO Pilot) from
   * either pilot. Each part is permitted when the account is enabled in the pilot that owns the part and that
   * pilot's profile has the add right on it; the isometric itself is decided by the current pilot's profile
   * (`canAction` with no parts ticked). Default-deny: a part whose owning pilot cannot be told is refused.
   * The dialog shows this result and the server enforces it, so a forged request is refused.
   */
  function copyParts(id: string, siteId?: string): CopyParts {
    const output = {} as CopyParts;
    for (const [part, area] of COPY_SCOPES) {
      const owners = areaPilots(area), owner = owners.length === 1 ? owners[0] : undefined;
      // The owning pilot's profile for the request's main project (where that pilot limits the account to it).
      const reach = owner ? allowedSites(store, store.get('users', id), owner) : 'all';
      const account = !owner || !enterable(id).includes(owner) ? null : inPilot(id, owner, reach !== 'all' && siteId && reach.has(siteId) ? siteId : undefined);
      const title = owner ? PILOT_MAP[owner].title : 'its pilot';
      output[part] = !account ? { allowed: false, pilot: owner, reason: `You are not enabled in ${title}.` }
        : canScope(account, area, 'insert') ? { allowed: true, pilot: owner }
        : { allowed: false, pilot: owner, reason: `Your ${title} profile cannot add ${COPY_PART_NAMES[part]}.` };
    }
    return output;
  }
  return { user, resource, visible, record, input, complete, links, weldRecord, archive, audit, project, present, pilotOf, pilotAccount, chooser, choiceRows, mainProjects, administrators, owner, copyParts, recipients,
    field: (key: string, name: string) => fieldAvailable(availability, key, name),
    result: (result: ReturnType<typeof import('./workflows.ts').runAction>) => ({ ...result, ...(result.record ? { record: project(result.resource!, result.record) } : {}), ...(result.records ? { records: result.records.map(row => project(result.resource!, row)) } : {}) }),
  };
}
