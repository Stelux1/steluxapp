import { RESOURCES } from '../shared/resources.ts';
import { actionScope, areaPilots, canResource, canScope, COPY_SCOPES, pilotBoundary, RESOURCE_SCOPES, type CopyPart, type CopyParts } from '../shared/permissions.ts';
import { actionAvailable, fieldAvailable, PILOT_KEYS, projectRow, resourceAvailable, rowAvailable, type PilotKey } from '../shared/release.ts';
import { PILOT_MAP } from '../shared/pilots.ts';
import { SIGNATURE_KINDS } from '../shared/signatures.ts';
import { punchWriteError } from '../shared/punch.ts';
import type { Availability, AuditEvent, Module, Row, User } from '../shared/types.ts';
import { Store, AppError } from './store.ts';
import { effectiveProfileId, publicUser } from './auth.ts';
import { availableWps } from '../shared/welding.ts';
import { ENABLEMENT_INPUT, enablementKey, missingRequired } from '../shared/weld-catalogs.ts';
import { assertWeldEntry, assertWeldUnlocked } from './weld-entry.ts';

const notFound = () => new AppError(404, 'This resource could not be found.');
/** Refusal of a pilot the account may not enter (or of a workspace request without a pilot). The client returns to the selector. */
export const pilotRefused = (message = 'Your account does not have access to this application workspace.') => new AppError(403, message, undefined, 'pilot');
const COPY_PART_NAMES: Record<CopyPart, string> = { copyWelds: 'welds', copyMaterials: 'material requirements', copyCalculations: 'calculation lines' };
const NO_PERMISSIONS: User['permissions'] = { general: 0, materials: 0, welding: 0, tools: 0, settings: 0 };

export function releaseAccess(store: Store, availability?: Availability) {
  function user(original: User): User {
    if (!availability) return original;
    const modules = new Set(RESOURCES.filter(r => resourceAvailable(availability, r.key)).map(r => r.module));
    // Areas of delivered actions count too: "Assign ISO to FWP" (91) is an action of its own, without a resource.
    const scopes = new Set([...Object.entries(RESOURCE_SCOPES).filter(([key]) => resourceAvailable(availability, key)).flatMap(([, keys]) => keys), ...Object.keys(availability.actions).map(key => actionScope(key)[0]).filter(Boolean)]);
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
    if (!action && key === 'punchlists') { const refusal = punchWriteError(value, existing); if (refusal) throw new AppError(422, refusal); }
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
  /** Weld entry rules and the lock of completed phases for the plain record routes of the hosted profile. */
  function weldRecord(key: string, value: Record<string, unknown>, existing?: Row) { if (pilots && key === 'welds') assertWeldEntry(store, value, existing); }
  /** Deleting or bringing back a weld of a completed phase is refused too. */
  function archive(key: string, row: Row) { if (pilots && key === 'welds') assertWeldUnlocked(store, row); }
  function audit(account: User, event: AuditEvent): AuditEvent | null {
    try {
      if (!visible(account, event.entityType, record(event.entityType, event.entityId, true))) return null;
    } catch { return null; }
    if (availability) {
      if (!['created', 'updated', 'archived', 'restored', 'inspected', 'repair', 'copied', 'released', 'reopened', 'finished', 'passed', 'removed', 'transferred', 'returned', 'corrected', 'adjusted', 'completed', 'cancelled'].includes(event.action)) return null;
      if (event.action === 'inspected' && !availability.inspectionTypes.some(type => ['accepted', 'rejected'].some(result => event.summary.startsWith(`${type} ${result} · `)))) return null;
    }
    // Release and Reopen keep their sentences: they carry the report number and the reason the user typed.
    if (event.action === 'released' || event.action === 'reopened') return event;
    return availability || account.capabilities ? { ...event, summary: `${event.action[0].toUpperCase() + event.action.slice(1)} ${resource(event.entityType).singular}` } : event;
  }
  const project = (key: string, row: Row) => projectRow(availability, key, row);
  const pilots = Boolean(availability?.features.includes('pilots'));
  /**
   * The account inside a pilot: that pilot's profile, projected to the delivered scope and bounded to the pilot.
   * Null when the account is not enabled there, its profile is unavailable, or the profile does not open the
   * pilot's module. An inactive account still fails with 401.
   */
  function inPilot(id: string, pilot: PilotKey): User | null {
    const row = store.get('users', id);
    if (!row.active) throw new AppError(401, 'This account is inactive.');
    const profileId = effectiveProfileId(row, pilot);
    if (!profileId) return null;
    let base: User;
    try { base = publicUser(store, id, profileId); } catch { return null; }
    const account = pilotBoundary(user(base), pilot);
    return account.permissions[PILOT_MAP[pilot].module] > 0 ? account : null;
  }
  const enterable = (id: string) => PILOT_KEYS.filter(pilot => inPilot(id, pilot));
  /** The account for a request naming `value` as its pilot; refused unless the account may enter it. */
  function pilotAccount(id: string, value: unknown): User {
    if (typeof value !== 'string' || !(PILOT_KEYS as readonly string[]).includes(value)) throw pilotRefused();
    const account = inPilot(id, value as PilotKey);
    if (!account) throw pilotRefused();
    return { ...account, pilots: enterable(id) };
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
      const account = inPilot(id, pilot);
      if (!account || !canResource(account, 'sites')) continue;
      for (const site of store.list('sites')) if (canResource(account, 'sites', 'show', site)) {
        const entry = output.get(site.id) || { id: site.id, name: String(site.name), pilots: [] };
        entry.pilots.push(pilot); output.set(site.id, entry);
      }
    }
    return [...output.values()];
  }
  /** Accounts the last-administrator check evaluates: with pilots, the account in every pilot it may enter; otherwise its profile as before. */
  const administrators = (id: string): User[] => pilots ? PILOT_KEYS.map(pilot => inPilot(id, pilot)).filter((account): account is User => Boolean(account)) : [publicUser(store, id)];
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
  function copyParts(id: string): CopyParts {
    const output = {} as CopyParts;
    for (const [part, area] of COPY_SCOPES) {
      const owners = areaPilots(area), owner = owners.length === 1 ? owners[0] : undefined;
      const account = owner ? inPilot(id, owner) : null;
      const title = owner ? PILOT_MAP[owner].title : 'its pilot';
      output[part] = !account ? { allowed: false, pilot: owner, reason: `You are not enabled in ${title}.` }
        : canScope(account, area, 'insert') ? { allowed: true, pilot: owner }
        : { allowed: false, pilot: owner, reason: `Your ${title} profile cannot add ${COPY_PART_NAMES[part]}.` };
    }
    return output;
  }
  return { user, resource, visible, record, input, complete, weldRecord, archive, audit, project, present, pilotAccount, mainProjects, administrators, owner, copyParts,
    field: (key: string, name: string) => fieldAvailable(availability, key, name),
    result: (result: ReturnType<typeof import('./workflows.ts').runAction>) => ({ ...result, ...(result.record ? { record: project(result.resource!, result.record) } : {}), ...(result.records ? { records: result.records.map(row => project(result.resource!, row)) } : {}) }),
  };
}
