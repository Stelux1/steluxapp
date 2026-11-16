import type { Row } from './types.ts';
import { mandatoryFields, projectCertificates, wpsValidation } from './site-settings.ts';

/**
 * Weld table and weld entry on the isometric (Weld Pilot). Pure functions over plain rows: the server uses them
 * to enforce the rules and the client to show the same answers. Every inferred rule is one named function so it
 * can be corrected in one place (see "unverified" in PARITY.md).
 */
type SiteLike = Record<string, unknown> | undefined | null;
type Values = Record<string, unknown>;

const live = (rows?: Row[] | null) => (rows || []).filter(row => !row._archived);
const text = (value: unknown) => String(value ?? '').trim();
const present = (value: unknown) => value !== undefined && value !== null && text(value) !== '';
const naturalCompare = (a: unknown, b: unknown) => text(a).localeCompare(text(b), 'en', { numeric: true, sensitivity: 'base' });

/** The two values of a charge number that mean "this side is not new material". */
export const SIDE_VALUES = ['EXISTING', 'CONN ISO'] as const;
export const isSideValue = (value: unknown) => SIDE_VALUES.includes(text(value) as typeof SIDE_VALUES[number]);
export const WELDERS = ['welder1Id', 'welder2Id', 'welder3Id', 'welder4Id'] as const;
export const hasWelder = (weld: Values) => WELDERS.some(name => present(weld[name]));

/** Weld fields the entry form writes, in form order. Used for the action input list and the mass edit. */
export const WELD_ENTRY_FIELDS = ['weldNo', 'typeId', 'wpsId', 'datefit', 'date', ...WELDERS, 'lengthMode', 'diameterId', 'dialen', 'ndtpercent', 'coating1Id', 'coatingWeldId', 'coating2Id', 'sleeve', 'spoolId', 'kr', 'fp', 'insLength', 'insLength2', 'processId', 'wire1Id', 'pos1', 'wire2Id', 'pos2', 'chargeNo1', 'certificate1Id', 'material1Id', 'chargeNo2', 'certificate2Id', 'material2Id', 'ndoReqPre', 'ndoReq', 'pwhtReqPre', 'pwhtReq', 'repair', 'description', 'jointType'] as const;

/** Fields of the capture's Mass edit welds that live on the weld itself, with how each one is written. */
export const MASS_EDIT_FIELDS = ['typeId', ...WELDERS, 'coating1Id', 'coating2Id', 'wire1Id', 'wire2Id', 'pos1', 'pos2', 'certificate1Id', 'chargeNo1', 'material1Id', 'certificate2Id', 'chargeNo2', 'material2Id', 'wpsId', 'processId', 'datefit', 'date', 'diameterId', 'dialen', 'ndoReqPre', 'ndoReq', 'pwhtReqPre', 'pwhtReq', 'repair', 'tracer'] as const;
export const MASS_EDIT_FLAGS = ['ndoReqPre', 'ndoReq', 'pwhtReqPre', 'pwhtReq', 'repair', 'tracer'] as const;

// ---------------------------------------------------------------------------------------------------------------
// Table order

/** Table order: stored sort order first (welds without one follow), then weld number as numbers inside text. */
export function orderedWelds<T extends Values>(welds: T[]): T[] {
  const order = (weld: T) => typeof weld.sortOrder === 'number' && Number.isFinite(weld.sortOrder) ? weld.sortOrder : Number.POSITIVE_INFINITY;
  return [...welds].sort((a, b) => (order(a) === order(b) ? 0 : order(a) < order(b) ? -1 : 1) || naturalCompare(a.weldNo, b.weldNo));
}
/** The id order after moving `id` one place up or down, or null when it cannot move. */
export function moveWeld(ids: string[], id: string, direction: 'up' | 'down'): string[] | null {
  const index = ids.indexOf(id), target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  const next = [...ids]; [next[index], next[target]] = [next[target], next[index]]; return next;
}
/** The id order after dropping `id` where `before` stands (`null`: at the end). */
export function dropWeld(ids: string[], id: string, before: string | null): string[] | null {
  if (!ids.includes(id) || id === before) return null;
  const rest = ids.filter(item => item !== id), at = before === null ? rest.length : rest.indexOf(before);
  if (at < 0) return null;
  const next = [...rest.slice(0, at), id, ...rest.slice(at)];
  return next.every((item, index) => item === ids[index]) ? null : next;
}
/** The neighbour a charge number is copied to: weld N side 1 meets the previous weld's side 2, side 2 the next weld's side 1. */
export function neighbourOf(orderedIds: string[], id: string, which: 'prev' | 'next'): string | null {
  const index = orderedIds.indexOf(id); if (index < 0) return null;
  return orderedIds[which === 'prev' ? index - 1 : index + 1] ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Weld type, material text

/** Shop or Field, from the weld type's location; older types without one are read from their name. */
export function weldLocation(type?: Values | null): 'Shop' | 'Field' | null {
  if (!type) return null;
  const location = text(type.location);
  if (location === 'Shop' || location === 'Field') return location;
  const name = text(type.name);
  return /\bfield\b/i.test(name) ? 'Field' : /\bshop\b/i.test(name) ? 'Shop' : null;
}
/** The short form shown in the table: the abbreviation, else the initials of the type's name. */
export function typeAbbreviation(type?: Values | null): string {
  if (!type) return '';
  if (present(type.abbreviation)) return text(type.abbreviation);
  return text(type.name).split(/[\s\-–—]+/).filter(Boolean).map(word => /^[A-Za-z]/.test(word) ? word[0].toUpperCase() : word).join('');
}
export const locationTooltip = (location: 'Shop' | 'Field' | null) => location === 'Field' ? 'Field weld' : location === 'Shop' ? 'Shop weld' : 'Weld type';

export interface SideContext {
  certificate?: Values | null;
  material?: Values | null;
  /** Names of the material's type and part where the profile delivers them. */
  materialType?: string;
  materialPart?: string;
}
export interface SideSummary { kind: 'none' | 'certificate' | 'existing' | 'connected' | 'charge'; index: string; charge: string; material: string; }
/**
 * Material ① / ②: `dia/schedule/wall/type of material/part` from the certificate. Empty parts are left out.
 * The type of material falls back to the certificate's material code, the part to the material group.
 */
export function certificateMaterialText(context: SideContext): string {
  const { certificate: cert, material } = context;
  const parts = [cert?.diameter ?? material?.dia, cert?.schedule ?? material?.lbs, cert?.wallThickness ?? material?.wallThickness, context.materialType || cert?.materialCode, context.materialPart || material?.materialGroup];
  return parts.map(text).filter(Boolean).join('/');
}
/** What one side of a weld shows in the table (Idx, Chg.No., Material). */
export function sideSummary(weld: Values, side: 1 | 2, context: SideContext = {}): SideSummary {
  const charge = text(weld[`chargeNo${side}`]);
  if (charge === 'EXISTING') return { kind: 'existing', index: '', charge, material: 'EXISTING' };
  if (charge === 'CONN ISO') return { kind: 'connected', index: '', charge, material: 'CONN ISO' };
  if (context.certificate) return { kind: 'certificate', index: text(context.certificate.indexNo), charge: charge || text(context.certificate.chargeNo), material: certificateMaterialText(context) };
  return charge ? { kind: 'charge', index: '', charge, material: '' } : { kind: 'none', index: '', charge: '', material: '' };
}
/** The diameter column: the configured diameter, or the explicit length in mm. */
export function weldDiameterText(weld: Values, diameter?: Values | null): string {
  if (weld.lengthMode === 'Length in mm') return present(weld.dialen) ? `${weld.dialen} mm` : '';
  return text(diameter?.diameter);
}

// ---------------------------------------------------------------------------------------------------------------
// Rule (d): the lock

/** Releases of the isometrics and the weld types, grouped once for a whole table. */
export interface LockContext { locations: Map<string, 'Shop' | 'Field' | null>; prefab: Set<string>; field: Set<string>; }
/** A release counts while it is on file; reopening or removing it archives the record and unlocks the welds. */
export const isActiveRelease = (release: Row) => !release._archived;
export function lockContext(weldTypes: Row[] | null | undefined, releases: Row[] | null | undefined): LockContext {
  const active = (releases || []).filter(isActiveRelease);
  return {
    locations: new Map((weldTypes || []).map(type => [type.id, weldLocation(type)])),
    prefab: new Set(active.filter(row => row.type === 'Prefab').map(row => String(row.isoId))),
    field: new Set(active.filter(row => row.type === 'Field').map(row => String(row.isoId))),
  };
}
export interface WeldLock { locked: boolean; /** The release that locks the weld. */ release: 'Prefab' | 'Field' | null; reason: string; }
/**
 * Welds of a completed phase are read-only: field welds while the isometric has a Field release, shop welds
 * while it has a Prefab release. A weld whose type is not set yet has no phase and stays editable.
 */
export function weldLock(weld: Values, context: LockContext): WeldLock {
  const location = weld.typeId ? context.locations.get(String(weld.typeId)) ?? null : null, iso = String(weld.isoId ?? '');
  if (location === 'Field' && context.field.has(iso)) return { locked: true, release: 'Field', reason: 'The Field release of this isometric makes its field welds read-only. Reopen the release to change them.' };
  if (location === 'Shop' && context.prefab.has(iso)) return { locked: true, release: 'Prefab', reason: 'The Prefab release of this isometric makes its shop welds read-only. Reopen the release to change them.' };
  return { locked: false, release: null, reason: '' };
}

// ---------------------------------------------------------------------------------------------------------------
// Rule (a): mandatory fields

/**
 * "Mandatory fields" on the main project: once the weld has a welder, Weld type, WPS, Weld date, Diameter (or the
 * explicit length) and Charge number 1 and 2 are required. Returns a message per missing field.
 */
export function missingMandatoryFields(site: SiteLike, weld: Values): Record<string, string> {
  if (!mandatoryFields(site) || !hasWelder(weld)) return {};
  const missing: Record<string, string> = {};
  const need = (name: string, label: string, filled: boolean) => { if (!filled) missing[name] = `${label} is required once a welder is assigned.`; };
  need('typeId', 'Weld type', present(weld.typeId)); need('wpsId', 'WPS number', present(weld.wpsId)); need('date', 'Weld date', present(weld.date));
  if (weld.lengthMode === 'Length in mm') need('dialen', 'Length in mm', present(weld.dialen) && Number(weld.dialen) > 0); else need('diameterId', 'Diameter', present(weld.diameterId));
  for (const side of [1, 2]) need(`chargeNo${side}`, `Charge number ${side}`, present(weld[`chargeNo${side}`]) || present(weld[`certificate${side}Id`]));
  return missing;
}

// ---------------------------------------------------------------------------------------------------------------
// Rule (b): validation on WPS

/**
 * "Validation on WPS": a welder is accepted when one of the welder's certificates names the welding process of
 * the WPS and has not expired on the weld date (today while the weld has no date). INFERRED: the data holds no
 * finer qualification range (diameter, thickness, material group), so only the process can be compared; a WPS
 * without a process reference cannot express a match and passes.
 */
export function welderQualifiedForWps(wps: Values | undefined | null, certificates: Row[], onDate: string): boolean {
  if (!wps || !present(wps.processId)) return true;
  return live(certificates).some(cert => cert.processId === wps.processId && (!present(cert.expiresAt) || text(cert.expiresAt) >= onDate));
}
/** Messages by welder field for every welder of the weld who does not cover the weld's WPS. */
export function welderWpsErrors(site: SiteLike, weld: Values, wps: Values | undefined | null, certificatesOf: (welderId: string) => Row[], welderName: (welderId: string) => string, today: string): Record<string, string> {
  if (!wpsValidation(site) || !present(weld.wpsId) || !wps || !present(wps.processId)) return {};
  const onDate = present(weld.date) ? text(weld.date) : today, errors: Record<string, string> = {};
  for (const name of WELDERS) {
    const id = text(weld[name]); if (!id) continue;
    if (!welderQualifiedForWps(wps, certificatesOf(id), onDate)) errors[name] = `${welderName(id)} has no valid qualification for WPS ${text(wps.name)} on ${onDate}.`;
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------------------------
// Rule (c): project certificates

export interface CertificateContext { isometrics: Row[]; welds: Row[]; }
/**
 * A certificate belongs to a project when it names the project itself (`projectId`, or `projectIds` where a later
 * task adds it), or when a weld of one of the project's isometrics already uses it. INFERRED: no other link
 * between certificates and projects exists in the data yet.
 */
export function certificateLinkedToProject(certificate: Values, projectId: string, context: CertificateContext): boolean {
  if (certificate.projectId === projectId) return true;
  const ids = certificate.projectIds;
  if (Array.isArray(ids) ? ids.includes(projectId) : typeof ids === 'string' && ids.split(',').map(text).includes(projectId)) return true;
  const isos = new Set(live(context.isometrics).filter(iso => iso.projectId === projectId).map(iso => iso.id));
  return live(context.welds).some(weld => isos.has(String(weld.isoId)) && (weld.certificate1Id === certificate.id || weld.certificate2Id === certificate.id));
}
/** The certificates offered for a project, in the given order. */
export function certificatesForProject(certificates: Row[], projectId: string, context: CertificateContext): Row[] {
  return live(certificates).filter(certificate => certificateLinkedToProject(certificate, projectId, context));
}
/** With "Project-specific Material Certificates" on, a chosen certificate must be one of the project's. */
export function certificateErrors(site: SiteLike, weld: Values, sides: number[], certificates: Row[], projectId: string, context: CertificateContext): Record<string, string> {
  if (!projectCertificates(site)) return {};
  const errors: Record<string, string> = {}, offered = new Set(certificatesForProject(certificates, projectId, context).map(row => row.id));
  for (const side of sides) { const id = text(weld[`certificate${side}Id`]); if (id && !offered.has(id)) errors[`certificate${side}Id`] = 'This certificate is not linked to the project.'; }
  return errors;
}

// ---------------------------------------------------------------------------------------------------------------
// Other entry rules

/** NDT percent only means something for an explicit length with NDT required; otherwise it is cleared. */
export function normalizedNdtPercent(weld: Values): number | null {
  if (weld.lengthMode !== 'Length in mm' || !weld.ndoReq) return null;
  const value = weld.ndtpercent;
  return value === '' || value === null || value === undefined ? null : Number(value);
}

// ---------------------------------------------------------------------------------------------------------------
// Add welds (range)

export const MAX_RANGE = 500;
/** How the isometric's weld numbers look: the common text before the digits and whether the digits are zero-padded. */
export function weldNumberStyle(existing: string[]): { prefix: string; width: number } {
  const counts = new Map<string, { count: number; width: number; padded: boolean }>();
  for (const number of existing) {
    const match = /^(\D*?)(\d+)$/.exec(text(number)); if (!match) continue;
    const entry = counts.get(match[1]) || { count: 0, width: 0, padded: false };
    entry.count++; entry.width = Math.max(entry.width, match[2].length); entry.padded ||= match[2].length > 1 && match[2].startsWith('0'); counts.set(match[1], entry);
  }
  const best = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  return best ? { prefix: best[0], width: best[1].padded ? best[1].width : 0 } : { prefix: '', width: 3 };
}
export interface RangePlan { numbers: string[]; skipped: string[]; }
/** The missing numbers between start and end (inclusive), written like the existing ones; present numbers are skipped. */
export function planWeldRange(start: unknown, end: unknown, existing: string[]): RangePlan {
  const from = Number(start), to = Number(end);
  if (!present(start) || !present(end) || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < 0) throw new Error('Weld no. Start and End must be whole numbers.');
  if (to < from) throw new Error('Weld no. End must not be lower than Start.');
  if (to - from + 1 > MAX_RANGE) throw new Error(`A range holds at most ${MAX_RANGE} welds.`);
  const style = weldNumberStyle(existing), taken = new Set<number>();
  for (const number of existing) { const match = /^(\D*?)(\d+)$/.exec(text(number)); if (match && match[1] === style.prefix) taken.add(Number(match[2])); }
  const width = style.width || (to > 999 ? String(to).length : 0), numbers: string[] = [], skipped: string[] = [];
  for (let value = from; value <= to; value++) { const name = `${style.prefix}${String(value).padStart(width, '0')}`; (taken.has(value) ? skipped : numbers).push(name); }
  return { numbers, skipped };
}

// ---------------------------------------------------------------------------------------------------------------
// Mass edit

export interface MassEdit { changes: Values; errors: Record<string, string>; }
/**
 * Reads the Mass edit input: only fields the user changed are present. "Clear date" is written as `clearDatefit` /
 * `clearDate` and wins over a date value being set. Returns the weld changes, with the explicit length mode set
 * when the diameter or the length is changed.
 */
export function readMassEdit(input: Values): MassEdit {
  const changes: Values = {}, errors: Record<string, string> = {};
  for (const name of MASS_EDIT_FIELDS) {
    if (!Object.hasOwn(input, name) || input[name] === undefined) continue;
    const value = input[name];
    if ((MASS_EDIT_FLAGS as readonly string[]).includes(name)) { if (typeof value !== 'boolean') errors[name] = 'Choose Yes or No.'; else changes[name] = value; continue; }
    if (name === 'dialen') { if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) errors[name] = 'Length in mm must be a number above zero.'; else changes[name] = value; continue; }
    if (typeof value !== 'string') { errors[name] = 'Choose a valid value.'; continue; }
    if (value.trim() !== '') changes[name] = value.trim();
  }
  for (const [flag, field] of [['clearDatefit', 'datefit'], ['clearDate', 'date']] as const) {
    if (input[flag] === true) { if (present(changes[field])) errors[field] = 'Choose a date or Clear date, not both.'; else changes[field] = ''; }
  }
  if (present(changes.diameterId) && changes.dialen !== undefined) errors.dialen = 'Choose a diameter or enter a length, not both.';
  if (present(changes.diameterId)) changes.lengthMode = 'Diameter'; else if (changes.dialen !== undefined) changes.lengthMode = 'Length in mm';
  if (!Object.keys(changes).length && !Object.keys(errors).length) errors._ = 'Change at least one field.';
  return { changes, errors };
}

/** The charge of a side from a selection: a certificate, EXISTING or CONN ISO. Written back by the form and mass edit. */
export function chargeSelection(value: string, side: 1 | 2, certificates: Row[]): Values {
  if (isSideValue(value)) return { [`chargeNo${side}`]: value, [`certificate${side}Id`]: '', [`material${side}Id`]: '' };
  const certificate = certificates.find(row => row.id === value);
  if (!certificate) return { [`chargeNo${side}`]: '', [`certificate${side}Id`]: '', [`material${side}Id`]: '' };
  return { [`chargeNo${side}`]: text(certificate.chargeNo), [`certificate${side}Id`]: certificate.id, [`material${side}Id`]: text(certificate.materialId) };
}
/** The select value of a side: certificate id, EXISTING / CONN ISO, or empty. */
export const chargeValue = (weld: Values, side: 1 | 2) => isSideValue(weld[`chargeNo${side}`]) ? text(weld[`chargeNo${side}`]) : text(weld[`certificate${side}Id`]);
