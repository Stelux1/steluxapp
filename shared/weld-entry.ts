import type { Row } from './types.ts';
import { mandatoryFields, projectCertificates, wpsValidation } from './site-settings.ts';
import { certificatesForProject as projectCertificatesOf } from './welder-data.ts';
import { weldLocked, weldLockReason, weldPhase } from './releases.ts';
import { INSPECTION_MASS_EDIT_FIELDS, locationField, processField } from './inspections.ts';

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
export const MASS_EDIT_FIELDS = ['typeId', ...WELDERS, 'coating1Id', 'coating2Id', 'wire1Id', 'wire2Id', 'pos1', 'pos2', 'certificate1Id', 'chargeNo1', 'material1Id', 'certificate2Id', 'chargeNo2', 'material2Id', 'wpsId', 'processId', 'datefit', 'date', 'diameterId', 'dialen', 'ndoReqPre', 'ndoReq', 'pwhtReqPre', 'pwhtReq', 'repair', 'tracer',
  // NDT location and process per round (Pre and final), PWHT location and process (Pre and final): the inspections flow's weld fields.
  ...INSPECTION_MASS_EDIT_FIELDS] as readonly string[];
export const MASS_EDIT_FLAGS = ['ndoReqPre', 'ndoReq', 'pwhtReqPre', 'pwhtReq', 'repair', 'tracer'] as const;

// ---------------------------------------------------------------------------------------------------------------
// Table order

/** True when "Disable welds sorting" is on for the isometric (stored on it, seen by every user). Isometrics saved before have no flag: sorting stays on. */
export const weldSortingDisabled = (iso?: Values | null) => iso?.weldSortingDisabled === true;
export const WELD_SORTING_MESSAGES = { enabled: 'Welds sorting enabled', disabled: 'Welds sorting disabled', failed: 'Error updating sorting', off: 'Welds sorting is switched off for this isometric.' } as const;
/** Menu entry of the sorting switch: ticked "Disable welds sorting" while sorting is on, unticked "Enable welds sorting" while it is off. */
export const weldSortingMenu = (disabled: boolean) => ({ checked: !disabled, label: disabled ? 'Enable welds sorting' : 'Disable welds sorting' });
/**
 * Table order: stored sort order first (welds without one follow), then weld number as numbers inside text.
 * With sorting switched off the stored order is ignored and the welds follow their weld number (the automatic order).
 */
export function orderedWelds<T extends Values>(welds: T[], sortingDisabled = false): T[] {
  const order = (weld: T) => !sortingDisabled && typeof weld.sortOrder === 'number' && Number.isFinite(weld.sortOrder) ? weld.sortOrder : Number.POSITIVE_INFINITY;
  return [...welds].sort((a, b) => (order(a) === order(b) ? 0 : order(a) < order(b) ? -1 : 1) || naturalCompare(a.weldNo, b.weldNo));
}
/** Toasts of a saved or failed table order: the server's message when it gave one. */
export const WELD_ORDER_MESSAGES = { saved: 'Order saved', failed: 'Something went wrong.' } as const;
export const orderFailureMessage = (error: unknown) => text((error as { message?: unknown } | null)?.message) || WELD_ORDER_MESSAGES.failed;
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
/** The tooltip of the Type cell: the weld type's name (the cell text is its abbreviation); "-" without a type. */
export const locationTooltip = (type?: Values | null) => text(type?.name) || '-';

export interface SideContext {
  certificate?: Values | null;
  material?: Values | null;
  /** Names of the material's type and part where the profile delivers them. */
  materialType?: string;
  materialPart?: string;
}
export interface SideSummary { kind: 'none' | 'certificate' | 'existing' | 'connected' | 'charge'; index: string; charge: string; material: string; }
/**
 * Material ① / ②: `dia/schedule/wall/type of material/part` from the certificate. All five slots are always written;
 * an empty one reads "-". The type of material falls back to the certificate's material code, the part to the material group.
 */
export function certificateMaterialText(context: SideContext): string {
  const { certificate: cert, material } = context;
  const parts = [cert?.diameter ?? material?.dia, cert?.schedule ?? material?.lbs, cert?.wallThickness ?? material?.wallThickness, context.materialType || cert?.materialCode, context.materialPart || material?.materialGroup];
  return parts.map(part => text(part) || '-').join('/');
}
/** What one side of a weld shows in the table (Idx, Chg.No., Material). EXISTING / CONN ISO appear in Material only. */
export function sideSummary(weld: Values, side: 1 | 2, context: SideContext = {}): SideSummary {
  const charge = text(weld[`chargeNo${side}`]);
  if (charge === 'EXISTING') return { kind: 'existing', index: '', charge: '', material: 'EXISTING' };
  if (charge === 'CONN ISO') return { kind: 'connected', index: '', charge: '', material: 'CONN ISO' };
  if (context.certificate) return { kind: 'certificate', index: text(context.certificate.indexNo), charge: charge || text(context.certificate.chargeNo), material: certificateMaterialText(context) };
  return charge ? { kind: 'charge', index: '', charge, material: '' } : { kind: 'none', index: '', charge: '', material: '' };
}
/** The three cells of a side as the table prints them: an empty cell reads "-". */
export const sideCellTexts = (summary: SideSummary) => ({ index: summary.index || '-', charge: summary.charge || '-', material: summary.material || '-' });
/** The Wdr cell: one stamp per welder (text = welder code, tooltip = welder name); "------" when no welder. */
export const NO_WELDER_TEXT = '------';
export const welderStamps = (welders: Values[]) => welders.map(welder => ({ code: text(welder.welderCode || welder.number), name: text(welder.name || welder.number) }));
/** Search over the weld table: every word must occur somewhere in the row's text (case does not matter). */
export const weldMatchesSearch = (rowText: string, query: string) => text(query).toLowerCase().split(/\s+/).filter(Boolean).every(word => rowText.toLowerCase().includes(word));
/** One entry of the Dia. select: its value is the id of the first diameter row that has this size. */
export interface DiameterOption { value: string; label: string; ids: string[] }
/**
 * Dia. options of the weld form. Hosted: one entry per distinct "Size in inches" of the catalog (labelled with that value), so the
 * reducer pairs and mm sizes of a large catalog do not multiply the list; a row without an inch size keeps its own entry, labelled
 * with its diameter. Otherwise one entry per row. Rows are taken in Sorting order.
 */
export function diameterOptions(rows: Values[], grouped = true): DiameterOption[] {
  const rank = (row: Values) => text(row.sorting) !== '' && Number.isFinite(Number(row.sorting)) ? Number(row.sorting) : Number.MAX_SAFE_INTEGER;
  const ordered = [...rows].sort((a, b) => rank(a) - rank(b));
  const options: DiameterOption[] = [], byKey = new Map<string, DiameterOption>();
  for (const row of ordered) {
    const inches = grouped ? text(row.sizeinch) : '';
    const key = inches ? `inch:${inches}` : `row:${row.id}`;
    const found = byKey.get(key);
    if (found) { found.ids.push(String(row.id)); continue; }
    const option = { value: String(row.id), label: inches || text(row.diameter), ids: [String(row.id)] };
    byKey.set(key, option); options.push(option);
  }
  return options;
}
/** The option a stored diameter row stands for (its own id when it is in none). */
export const diameterOptionValue = (options: DiameterOption[], id: unknown) => options.find(option => option.ids.includes(text(id)))?.value ?? text(id);
/** The diameter column: the configured diameter, or the explicit length in mm. */
export function weldDiameterText(weld: Values, diameter?: Values | null): string {
  if (weld.lengthMode === 'Length in mm') return present(weld.dialen) ? `${weld.dialen} mm` : '';
  return text(diameter?.diameter);
}

// ---------------------------------------------------------------------------------------------------------------
// Rule (d): the lock

/**
 * The lock rule is owned by the releases flow (shared/releases.ts `weldLocked` / `weldLockReason`: a phase locks
 * once the isometric is Prefab / Field complete, or holds an active release from before the two steps). The context
 * carries the weld types with their Shop/Field location resolved by `weldLocation` (older types without a location
 * are read from their name), the releases and the isometrics (their completion fields).
 */
export interface LockContext { weldTypes: Row[]; releases: Row[]; isometrics: Map<string, Row>; }
export function lockContext(weldTypes: Row[] | null | undefined, releases: Row[] | null | undefined, isometrics?: Row[] | null): LockContext {
  return { weldTypes: (weldTypes || []).map(type => ({ ...type, location: weldLocation(type) ?? '' })), releases: releases || [], isometrics: new Map((isometrics || []).map(iso => [String(iso.id), iso])) };
}
export interface WeldLock { locked: boolean; /** The completed phase that locks the weld. */ release: 'Prefab' | 'Field' | null; reason: string; }
/**
 * Welds of a completed phase are read-only: shop welds once the isometric is Prefab complete, field welds once it
 * is Field complete. A weld whose type is not set yet has no phase and stays editable.
 */
export function weldLock(weld: Values, context: LockContext): WeldLock {
  const row = weld as Row, iso = context.isometrics.get(text(row.isoId));
  if (!weldLocked(row, iso, context.releases, context.weldTypes)) return { locked: false, release: null, reason: '' };
  return { locked: true, release: weldPhase(row, context.weldTypes) === 'shop' ? 'Prefab' : 'Field', reason: weldLockReason(row, iso, context.releases, context.weldTypes) };
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

/** `links` are the rows of `certificate_projects` (the welder-data flow owns the certificate-to-project link). */
export interface CertificateContext { links: Row[]; }
/**
 * The certificates offered for a project with "Project-specific Material Certificates" on: the welder-data rule
 * (shared/welder-data.ts), so certificates linked to the project or to all projects.
 */
export function certificatesForProject(certificates: Row[], projectId: string, context: CertificateContext): Row[] {
  return projectCertificatesOf({ certificates, links: context.links, projectId, site: { projectCertificates: true } });
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

// ---------------------------------------------------------------------------------------------------------------
// Mass edit: what the reference checks and how its dialog is laid out

export const MASS_EDIT_MANDATORY_MESSAGE = 'Cannot save: after this change one or more selected welds would still miss required fields (Weld type, WPS, Weld Date, Dia.).';
/**
 * The reference checks Weld type, WPS, Weld Date and Dia. only (no charge numbers), and only when the mass edit sets the Welder
 * (not Welder 2 to 4) on a main project with "Mandatory fields". Returns the names of what the weld would still miss after the change
 * (the posted value, else the stored one; Clear date counts as an empty date; an explicit length stands for the diameter).
 */
export function massEditMissingFields(site: SiteLike, weld: Values, changes: Values): string[] {
  if (!mandatoryFields(site) || !present(changes.welder1Id)) return [];
  const after: Values = { ...weld, ...changes }, missing: string[] = [];
  if (!present(after.typeId)) missing.push('typeId');
  if (!present(after.wpsId)) missing.push('wpsId');
  if (!present(after.date)) missing.push('date');
  if (after.lengthMode === 'Length in mm' ? !(present(after.dialen) && Number(after.dialen) > 0) : !present(after.diameterId)) missing.push('diameterId');
  return missing;
}

/** One input of the Mass edit welds dialog; `control` says where its options come from. */
export interface MassEditItem { name: string; label: string; control: 'catalog' | 'welder' | 'wps' | 'charge' | 'text'; catalog?: string; side?: 1 | 2; }
const item = (name: string, label: string, control: MassEditItem['control'], extra: Partial<MassEditItem> = {}): MassEditItem => ({ name, label, control, ...extra });
/** The two columns of the dialog, each read top to bottom (the reference's order). Weld process is not part of it (hidden in the reference). */
export const MASS_EDIT_COLUMNS: MassEditItem[][] = [
  [item('typeId', 'Weld type', 'catalog', { catalog: 'weld_types' }), item('welder1Id', 'Welder', 'welder'), item('welder3Id', 'Welder 3', 'welder'), item('coating1Id', 'Coating 1', 'catalog', { catalog: 'coatings' }), item('wire1Id', 'Welding wire 1', 'catalog', { catalog: 'welding_wires' }), item('pos1', 'Pos 1', 'text'), item('chargeNo1', 'Charge number 1', 'charge', { side: 1 })],
  [item('wpsId', 'WPS number', 'wps'), item('welder2Id', 'Welder 2', 'welder'), item('welder4Id', 'Welder 4', 'welder'), item('coating2Id', 'Coating 2', 'catalog', { catalog: 'coatings' }), item('wire2Id', 'Welding wire 2', 'catalog', { catalog: 'welding_wires' }), item('pos2', 'Pos 2', 'text'), item('chargeNo2', 'Charge number 2', 'charge', { side: 2 })],
];
export const MASS_EDIT_DATES = [{ name: 'datefit', clear: 'clearDatefit', label: 'Fit-up Date' }, { name: 'date', clear: 'clearDate', label: 'Weld Date' }] as const;
export const MASS_EDIT_CLEAR_LABEL = 'Clear date', MASS_EDIT_DATE_HINT = 'Leave the date empty to keep existing values. Tick Clear date only if you want to remove the date.';
/** Dia. offers one extra option that switches to a length; Length in mm is shown for that option only. */
export const MASS_EDIT_DIAMETER = { label: 'Dia.', lengthOption: '-- Length in mm --', lengthLabel: 'Length in mm' } as const;
export const MASS_EDIT_FLAGS_LABELS: [string, string][] = [['ndoReqPre', 'NDT Req. Pre'], ['ndoReq', 'NDT Req.'], ['pwhtReqPre', 'Pre-HT'], ['pwhtReq', 'PWHT Req.'], ['repair', 'Repair'], ['tracer', 'Tracer']];
const rounds = (pre: boolean) => [1, 2, 3, 4, 5].map(index => item(processField(pre, index), 'NDT process', 'catalog', { catalog: 'ndt_processes' }));
/** The inspection sections, each with its own heading (the reference's NDT Pre, NDT and Pre-HT / PWHT). */
export const MASS_EDIT_SECTIONS: { title: string; items: MassEditItem[] }[] = [
  { title: 'NDT Pre', items: [item(locationField(true), 'NDT location Pre', 'catalog', { catalog: 'ndt_locations' }), ...rounds(true)] },
  { title: 'NDT', items: [item(locationField(false), 'NDT location', 'catalog', { catalog: 'ndt_locations' }), ...rounds(false)] },
  { title: 'Pre-HT / PWHT', items: [item('pwhtPreLocationId', 'PWHT location Pre', 'catalog', { catalog: 'pwht_locations' }), item('pwhtPreProcessId', 'PWHT process Pre', 'catalog', { catalog: 'pwht_processes' }), item('pwhtLocationId', 'PWHT location', 'catalog', { catalog: 'pwht_locations' }), item('pwhtProcessId', 'PWHT process', 'catalog', { catalog: 'pwht_processes' })] },
];
/** The labels of the dialog in the order they appear (Length in mm only after the length option was chosen). */
export const massEditLabels = (lengthShown = false) => [
  ...MASS_EDIT_COLUMNS.flat().map(entry => entry.label), ...MASS_EDIT_DATES.flatMap(date => [date.label, MASS_EDIT_CLEAR_LABEL]),
  MASS_EDIT_DIAMETER.label, ...(lengthShown ? [MASS_EDIT_DIAMETER.lengthLabel] : []), ...MASS_EDIT_FLAGS_LABELS.map(([, label]) => label),
  ...MASS_EDIT_SECTIONS.flatMap(section => [section.title, ...section.items.map(entry => entry.label)]),
];
export const MASS_EDIT_SELECT_NOTHING = 'Select one or more welds first.';

// ---------------------------------------------------------------------------------------------------------------
// Options menu, delete, bring back, stamp

/** Entries of the weld table's Options menu in the reference order. "Upload NDT on multiple welds" is not in it. */
export const WELD_OPTIONS_MENU: { key: string; label: string; dividerBefore?: boolean }[] = [
  { key: 'attachments', label: 'Attachments' }, { key: 'visual-inspection', label: 'Visual inspection' }, { key: 'mass-ndt-pre', label: 'Generate Mass NDT-Pre request' },
  { key: 'mass-ndt', label: 'Generate Mass NDT request' }, { key: 'mass-pwht', label: 'Generate Mass Pre-HT/PWHT request' }, { key: 'upload-pwht', label: 'Upload Pre-HT/PWHT on multiple welds' },
  { key: 'punch-list', label: 'Punch list' }, { key: 'audit-trail', label: 'Audit trail' }, { key: 'set-phase', label: 'Set phase' }, { key: 'show-deleted', label: 'Show deleted welds' },
  { key: 'delete-selected', label: 'Delete selected', dividerBefore: true }, { key: 'sorting', label: 'Disable welds sorting', dividerBefore: true },
];
export const WELD_DELETE_WORDING = { one: 'Delete weld', many: 'Delete selected', text: 'Are you sure?', button: 'Delete', cancel: 'Cancel' } as const;
export const WELD_BRING_BACK_WORDING = { title: 'Bring weld back', text: 'Are you sure?', button: 'Bring back', cancel: 'Cancel', icon: 'Bring weld back', showActive: 'Show active welds', emptyTitle: 'No welds added yet for this isometric.', emptyText: 'Use Add weld or Add welds to create the first weld.' } as const;
/** The Stamp dialog's select: "<name> / <stamp>", as the reference prints it (also for a person without a stamp number). */
export const stampOptionLabel = (engineer: Values) => `${text(engineer.name)} / ${text(engineer.stamp)}`;
export const STAMP_NONE = '-----------';

/** The charge of a side from a selection: a certificate, EXISTING or CONN ISO. Written back by the form and mass edit. */
export function chargeSelection(value: string, side: 1 | 2, certificates: Row[]): Values {
  if (isSideValue(value)) return { [`chargeNo${side}`]: value, [`certificate${side}Id`]: '', [`material${side}Id`]: '' };
  const certificate = certificates.find(row => row.id === value);
  if (!certificate) return { [`chargeNo${side}`]: '', [`certificate${side}Id`]: '', [`material${side}Id`]: '' };
  return { [`chargeNo${side}`]: text(certificate.chargeNo), [`certificate${side}Id`]: certificate.id, [`material${side}Id`]: text(certificate.materialId) };
}
/** The select value of a side: certificate id, EXISTING / CONN ISO, or empty. */
export const chargeValue = (weld: Values, side: 1 | 2) => isSideValue(weld[`chargeNo${side}`]) ? text(weld[`chargeNo${side}`]) : text(weld[`certificate${side}Id`]);
