import type { Row } from './types.ts';
import { chartPosition } from './diameter-standard.ts';
import { mandatoryFields, projectCertificates, wpsValidation } from './site-settings.ts';
import { certificatesForProject as projectCertificatesOf, splitIds } from './welder-data.ts';
import { weldLocked, weldLockReason, weldPhase } from './releases.ts';
import { INSPECTION_MASS_EDIT_FIELDS, locationField, ndtRequested, processField } from './inspections.ts';
import { nonWeldCode, type NonWeldCode } from './weld-codes.ts';
import { ISO_PAGE_MENU, type IsoMenuEntry } from './iso-pages.ts';

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

/** The 13 fixed part placeholders of the charge number lists (reference __wsappsFixedCharges, after CONN ISO and EXISTING). */
export const CHARGE_PLACEHOLDERS = ['1 / Pipe', '2 / Elbow 45', '3 / Elbow 90', '4 / Flange', '5 / Tee', '6 / Reducer', '7 / Nipple', '8 / Valve', '9 / Cap', '10 / Swivel Flange', '11 / Swivel Male', '12 / Ball race', '13 / Female Flange'] as const;
/**
 * The fixed values of a charge number that mean "this side is not certified new material", in the reference order:
 * CONN ISO, EXISTING, then the 13 part placeholders. Stored in the charge number like EXISTING, without a certificate.
 */
export const SIDE_VALUES = ['CONN ISO', 'EXISTING', ...CHARGE_PLACEHOLDERS] as const;
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
export interface SideSummary { kind: 'none' | 'certificate' | 'existing' | 'connected' | 'placeholder' | 'charge'; index: string; charge: string; material: string; }
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
  // The 13 fixed part placeholders ("4 / Flange" …) are stored like EXISTING: the table prints their text as the Material, "-" in Idx and Chg.No.
  if ((CHARGE_PLACEHOLDERS as readonly string[]).includes(charge)) return { kind: 'placeholder', index: '', charge: '', material: charge };
  if (context.certificate) return { kind: 'certificate', index: text(context.certificate.indexNo), charge: charge || text(context.certificate.chargeNo), material: certificateMaterialText(context) };
  return charge ? { kind: 'charge', index: '', charge, material: '' } : { kind: 'none', index: '', charge: '', material: '' };
}
/** The one placeholder of an empty cell in the isometric page's LISL table (D10): Type, WD, Index, Charge, Material, WPS, Dia., Spool. */
export const LISL_EMPTY = '—';
/** The three cells of a side as the table prints them: an empty cell reads the table's placeholder "—". */
export const sideCellTexts = (summary: SideSummary) => ({ index: summary.index || LISL_EMPTY, charge: summary.charge || LISL_EMPTY, material: summary.material || LISL_EMPTY });
/** "------" for a weld without welder, as the reference's exports write it. The LISL table shows its own placeholder (LISL_EMPTY) instead. */
export const NO_WELDER_TEXT = '------';
export const welderStamps = (welders: Values[]) => welders.map(welder => ({ code: text(welder.welderCode || welder.number), name: text(welder.name || welder.number) }));
/** The few welder fields a weld's stamps show (code and name), without the rest of the welder record. */
export interface WelderStamp { id: string; number: string; welderCode: string; name: string }
/**
 * Stamps of the welders the given welds name that are not among the welder records the account reads (SC2 N-H): an account
 * that may read a weld sees who welded it, without the welder record itself. `lookup` reads a welder outside the account's reach.
 */
export function missingWelderStamps(welds: Values[], welders: Values[], lookup: (id: string) => Values | undefined): WelderStamp[] {
  const known = new Set(welders.map(row => text(row.id))), stamps = new Map<string, WelderStamp>();
  for (const weld of welds) for (const field of WELDERS) {
    const id = text(weld[field]);
    if (!id || known.has(id) || stamps.has(id)) continue;
    const welder = lookup(id);
    if (welder) stamps.set(id, { id, number: text(welder.number), welderCode: text(welder.welderCode), name: text(welder.name) });
  }
  return [...stamps.values()];
}
/** Search over the weld table: every word must occur somewhere in the row's text (case does not matter). */
export const weldMatchesSearch = (rowText: string, query: string) => text(query).toLowerCase().split(/\s+/).filter(Boolean).every(word => rowText.toLowerCase().includes(word));
/** One entry of the Dia. select: its value is the id of the first diameter row that has this size. */
export interface DiameterOption { value: string; label: string; ids: string[] }
/**
 * Dia. options of the weld form. Hosted: one entry per distinct "Size in inches" of the catalog (labelled with that value), so the
 * reducer pairs and mm sizes of a large catalog do not multiply the list; a row without an inch size keeps its own entry, labelled
 * with its diameter. Otherwise one entry per row. Rows are taken in Sorting order.
 */
export function diameterOptions(rows: Values[], grouped = true, chartOrder = false): DiameterOption[] {
  // chartOrder (a main project's own diameter list): the client's chart sizes first in chart order (either standard), then the others by Sorting.
  const sorting = (row: Values) => text(row.sorting) !== '' && Number.isFinite(Number(row.sorting)) ? Number(row.sorting) : Number.MAX_SAFE_INTEGER;
  const rank = (row: Values) => chartOrder ? (chartPosition(row.diameter) >= 0 ? chartPosition(row.diameter) - 1e9 : sorting(row)) : sorting(row);
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
  // A GAP / SP / E / B number is no weld: it has no welder data to complete (reference: special numbers skip the check).
  if (!mandatoryFields(site) || !hasWelder(weld) || nonWeldCode(weld.weldNo)) return {};
  const missing: Record<string, string> = {};
  const need = (name: string, label: string, filled: boolean) => { if (!filled) missing[name] = `${label} is required once a welder is assigned.`; };
  need('typeId', 'Weld type', present(weld.typeId)); need('wpsId', 'WPS number', present(weld.wpsId)); need('date', 'Weld date', present(weld.date));
  if (weld.lengthMode === 'Length in mm') need('dialen', 'Length in mm', present(weld.dialen) && Number(weld.dialen) > 0); else need('diameterId', 'Diameter', present(weld.diameterId));
  for (const side of [1, 2]) need(`chargeNo${side}`, `Charge number ${side}`, present(weld[`chargeNo${side}`]) || present(weld[`certificate${side}Id`]));
  return missing;
}

// ---------------------------------------------------------------------------------------------------------------
// Rule (b): validation on WPS

/** The mode of "Validation on WPS" of a main project: on = the WPS on the welder's qualification documents; off = no check; the setting never saved (absent) keeps the older check by welding process. */
export const wpsValidationMode = (site: SiteLike): 'documents' | 'off' | 'process' => wpsValidation(site) ? 'documents' : site && (site.wpsValidation === undefined || site.wpsValidation === null) ? 'process' : 'off';
const notExpired = (cert: Row, onDate: string) => !present(cert.expiresAt) || text(cert.expiresAt) >= onDate;
/**
 * "Validation on WPS" on: a welder is qualified for a WPS when a qualification document of the welder lists that WPS and has
 * not expired on the weld date (today while the weld has no date) (reference: Personnel's certificates and files, w3-welder-card).
 * With the weld's diameter (mm) given, a listing qualification whose own Diameter range holds it is needed (a qualification
 * without a range does not qualify): the welder's range is entered by hand per qualification.
 */
export function welderQualifiedForWps(wps: Values | undefined | null, certificates: Row[], onDate: string, sizesMm: (number | null)[] = []): boolean {
  if (!wps) return true;
  const listing = live(certificates).filter(cert => splitIds(cert.wpsIds).includes(text(wps.id)) && notExpired(cert, onDate));
  return listing.length > 0 && sizesMm.every(size => size === null || listing.some(cert => qualificationHoldsMm(cert, size)));
}
/**
 * The Diameter range (mm) a welder qualification was entered with by hand ("Diameter from / to"): an open end (empty or 0 for
 * "to") is no limit. A qualification without any range holds no diameter (client answer 17.11.2026).
 */
export function qualificationHoldsMm(cert: Row, sizeMm: number): boolean {
  if (!present(cert.diameterFrom) && !present(cert.diameterTo)) return false;
  const from = present(cert.diameterFrom) ? Number(cert.diameterFrom) : 0, to = present(cert.diameterTo) && Number(cert.diameterTo) > 0 ? Number(cert.diameterTo) : Number.POSITIVE_INFINITY;
  return sizeMm >= from && sizeMm <= to;
}
/** The older check, kept for a main project whose setting was never saved: a certificate names the welding process of the WPS and has not expired; a WPS without a process reference passes. */
export function welderQualifiedByProcess(wps: Values | undefined | null, certificates: Row[], onDate: string): boolean {
  if (!wps || !present(wps.processId)) return true;
  return live(certificates).some(cert => cert.processId === wps.processId && notExpired(cert, onDate));
}
/** Messages by welder field for every welder of the weld who does not cover the weld's WPS. */
export function welderWpsErrors(site: SiteLike, weld: Values, wps: Values | undefined | null, certificatesOf: (welderId: string) => Row[], welderName: (welderId: string) => string, today: string, diameter?: WeldDiameter | null): Record<string, string> {
  const mode = wpsValidationMode(site);
  if (mode === 'off' || !present(weld.wpsId) || !wps) return {};
  const onDate = present(weld.date) ? text(weld.date) : today, errors: Record<string, string> = {};
  for (const name of WELDERS) {
    const id = text(weld[name]); if (!id) continue;
    if (!(mode === 'documents' ? welderQualifiedForWps : welderQualifiedByProcess)(wps, certificatesOf(id), onDate)) errors[name] = `${welderName(id)} has no valid qualification for WPS ${text(wps.name)} on ${onDate}.`;
    else if (mode === 'documents' && diameter?.mm != null && !welderQualifiedForWps(wps, certificatesOf(id), onDate, [diameter.mm])) errors[name] = `${welderName(id)} has no valid qualification for WPS ${text(wps.name)} whose diameter range holds ${diameter.label} (${diameter.mm} mm) on ${onDate}.`;
  }
  return errors;
}
/** The diameter of a weld as the WPS and welder rules read it: outside diameter in mm (qualifications), in inches (WPS range) and its label. */
export interface WeldDiameter { mm: number | null; inch: number | null; label: string; }
/** The weld's diameter row as a `WeldDiameter`; null for a weld without one (explicit length, none chosen). */
export function weldDiameterOf(weld: Values, diameters: Row[] | Map<string, Row>): WeldDiameter | null {
  if (weld.lengthMode === 'Length in mm' || !present(weld.diameterId)) return null;
  const row = diameters instanceof Map ? diameters.get(text(weld.diameterId)) : diameters.find(item => item.id === weld.diameterId);
  return row ? { mm: diameterSizeMm(row), inch: diameterSizeInch(row), label: text(row.diameter) || text(row.sizeinch) } : null;
}
/** The size in inches of a diameter row (`sizeinch`); null when it has none. */
export const diameterSizeInch = (row?: Values | null): number | null => { const size = Number(row?.sizeinch); return row && present(row.sizeinch) && Number.isFinite(size) && size > 0 ? size : null; };

// ----- the diameter range of a WPS, entered by hand on the WPS ("Diameter from / to (inch)")

/** The range of a WPS in inches: an empty "from" is 0, an empty or 0 "to" is open; null when the WPS has no range (it is not limited). */
export function wpsDiameterRange(wps: Values | undefined | null): [number, number] | null {
  if (!wps || (!present(wps.diameterFrom) && !present(wps.diameterTo))) return null;
  const from = present(wps.diameterFrom) ? Number(wps.diameterFrom) : 0, to = present(wps.diameterTo) && Number(wps.diameterTo) > 0 ? Number(wps.diameterTo) : Number.POSITIVE_INFINITY;
  return [from, to];
}
/** Whether a WPS may be used for a weld of this diameter (inches): a WPS without a range, or a weld without a known diameter, is not limited. */
export function wpsHoldsDiameter(wps: Values | undefined | null, sizeInch: number | null): boolean {
  const range = wpsDiameterRange(wps);
  return !range || sizeInch === null || (sizeInch >= range[0] && sizeInch <= range[1]);
}
/** A WPS matches a diameter when it has a range of its own and the range holds the diameter (what the Dia. choice may select by itself). */
export const wpsMatchesDiameter = (wps: Values | undefined | null, sizeInch: number | null) => sizeInch !== null && wpsDiameterRange(wps) !== null && wpsHoldsDiameter(wps, sizeInch);
/** "Validation on WPS" on: the WPS has to hold the diameter of every weld it is chosen for; off: nothing is limited. */
export const wpsOfferedForDiameters = (site: SiteLike, wps: Values, sizesInch: (number | null)[]) => !wpsValidation(site) || sizesInch.every(size => wpsHoldsDiameter(wps, size));
/** The text of a WPS range as the forms show it: "1 - 2 inch", "from 1 inch", "up to 2 inch"; '' without one. */
export function wpsRangeText(wps: Values | undefined | null): string {
  const range = wpsDiameterRange(wps); if (!range) return '';
  const [from, to] = range;
  return to === Number.POSITIVE_INFINITY ? `from ${from} inch` : from > 0 ? `${from} - ${to} inch` : `up to ${to} inch`;
}
/** The server's check of the chosen WPS against the weld's diameter ("Validation on WPS" on); the message names the range. */
export function wpsDiameterErrors(site: SiteLike, weld: Values, wps: Values | undefined | null, diameter: WeldDiameter | null): Record<string, string> {
  if (!wpsValidation(site) || !present(weld.wpsId) || !wps || !diameter || wpsHoldsDiameter(wps, diameter.inch)) return {};
  return { wpsId: `WPS ${text(wps.name)} covers ${wpsRangeText(wps)}, not the diameter ${diameter.label} (${diameter.inch} inch).` };
}
/** An active welder, or one the form already holds (kept so an edit still shows who welded). */
const activeWelder = (welder: Row, keep: unknown[]) => !welder._archived && (welder.status !== 'Inactive' || keep.includes(welder.id));
/**
 * The welders Welder 1-4 offer once a WPS is chosen, in the catalog's own order (creation order; the rows arrive in it).
 * Nothing is offered before a WPS is chosen. With "Validation on WPS" off every active welder is offered; with it on only
 * those qualified for the WPS (`certificates` undefined: the qualifications are not known here, the server decides); `sizesMm`
 * (the diameters of the weld, or of every checked weld) also asks for a qualification whose range holds each.
 */
export function weldersForWps(site: SiteLike, welders: Row[], certificates: Row[] | undefined, wps: Values | undefined | null, onDate: string, keep: unknown[] = [], sizesMm: (number | null)[] = []): Row[] {
  if (!wps) return [];
  const active = welders.filter(welder => activeWelder(welder, keep));
  if (!wpsValidation(site) || !certificates) return active;
  return active.filter(welder => keep.includes(welder.id) || welderQualifiedForWps(wps, certificates.filter(cert => cert.welderId === welder.id), onDate, sizesMm));
}
/** Welder 1-4 stay disabled until a WPS is chosen when "Validation on WPS" is on (Add weld, Mass edit after a WPS change). */
export const welderFieldsDisabled = (site: SiteLike, wpsId: unknown) => wpsValidation(site) && !present(wpsId);
/**
 * Charge number 1/2 under "Validation on WPS" are limited to certificates the chosen welders may weld: INFERRED from the
 * qualification ranges (the reference's getAllCerts answer is not captured). When a chosen welder is not qualified for the WPS
 * nothing is offered; otherwise a certificate whose size (mm) lies outside every Diameter range of the welder's valid
 * qualifications is left out. A welder without any range, and a certificate without a size, do not limit the list.
 */
export function chargesForWelders(certificates: Row[], welderIds: string[], wps: Values | undefined | null, welderCertificates: Row[] | undefined, onDate: string, sizeOf: (certificate: Row) => number | null): Row[] {
  const ids = welderIds.filter(Boolean);
  if (!wps || !welderCertificates || !ids.length) return certificates;
  let list = certificates;
  for (const id of ids) {
    const own = live(welderCertificates).filter(cert => cert.welderId === id);
    if (!welderQualifiedForWps(wps, own, onDate)) return [];
    const ranges = own.filter(cert => (!present(cert.expiresAt) || text(cert.expiresAt) >= onDate) && (present(cert.diameterFrom) || present(cert.diameterTo)))
      .map(cert => [present(cert.diameterFrom) ? Number(cert.diameterFrom) : 0, present(cert.diameterTo) && Number(cert.diameterTo) > 0 ? Number(cert.diameterTo) : Number.POSITIVE_INFINITY]);
    if (!ranges.length) continue;
    list = list.filter(certificate => { const size = sizeOf(certificate); return size === null || ranges.some(([from, to]) => size >= from && size <= to); });
  }
  return list;
}
/** Welder option texts: "<code> <name>" in Add weld and Mass edit, "<code>, <name>" in Edit weld; a welder without a name shows the code only. */
export function welderOptionLabel(welder: Values, mode: 'add' | 'edit' | 'mass'): string {
  const code = text(welder.welderCode || welder.number), name = text(welder.name);
  return !name ? code : mode === 'edit' ? `${code}, ${name}` : `${code} ${name}`;
}
export interface SelectOption { value: string; label: string; disabled?: boolean; }
/** Welder options of a dialog in the catalog's order (the rows arrive in creation order). */
export const welderOptionList = (welders: Row[], mode: 'add' | 'edit' | 'mass'): SelectOption[] => welders.map(welder => ({ value: String(welder.id), label: welderOptionLabel(welder, mode) }));
/** The empty option of the welder selects: Add weld after a WPS change 'Choose Welder' (disabled), Edit weld and Mass edit '-----------------'. */
export const WELDER_PLACEHOLDER = { add: 'Choose Welder', edit: '-----------------', mass: '-----------------' } as const;
/** Add weld and Mass edit empty the four welder fields on every WPS change (the reference's change handlers); Edit weld keeps them. */
export const wpsChangeClearsWelders = (mode: 'add' | 'edit' | 'mass') => mode !== 'edit';
/** Welder lists after Dia.: two groups with the reference's labels. */
export const WELDER_GROUP_LABELS = { qualified: 'Qualified for this diameter', other: 'Other welders' } as const;
export function groupWeldersForDia(options: SelectOption[], qualifiedIds: Set<string>): { label: string; options: SelectOption[] }[] {
  return [{ label: WELDER_GROUP_LABELS.qualified, options: options.filter(option => qualifiedIds.has(option.value)) }, { label: WELDER_GROUP_LABELS.other, options: options.filter(option => !qualifiedIds.has(option.value)) }].filter(group => group.options.length);
}
/** The outside diameter (mm) of a diameter row; null when it has none. */
export const diameterSizeMm = (row?: Values | null): number | null => { const size = Number(row?.size); return row && present(row.size) && Number.isFinite(size) && size > 0 ? size : null; };
/** Welders with a valid (not expired) qualification whose Diameter range (mm) holds the size. An open end (empty or 0) is no limit; a row without any range says nothing. */
export function weldersQualifiedForDiameter(welderCertificates: Row[] | undefined, sizeMm: number | null, onDate: string): Set<string> {
  const ids = new Set<string>();
  if (sizeMm === null) return ids;
  for (const cert of live(welderCertificates)) {
    if (present(cert.expiresAt) && text(cert.expiresAt) < onDate) continue;
    if (!present(cert.diameterFrom) && !present(cert.diameterTo)) continue;
    const from = present(cert.diameterFrom) ? Number(cert.diameterFrom) : 0, to = present(cert.diameterTo) && Number(cert.diameterTo) > 0 ? Number(cert.diameterTo) : Number.POSITIVE_INFINITY;
    if (sizeMm >= from && sizeMm <= to) ids.add(text(cert.welderId));
  }
  return ids;
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

/** Reference getAllCerts `selectable`: a certificate can be chosen only when it is both Controlled and Accepted. */
export const CERTIFICATE_NOT_SELECTABLE = 'This certificate cannot be selected: both Controlled and Accepted must be enabled.';
export const certificateSelectable = (certificate?: Values | null) => Boolean(certificate) && certificate!.controlled === true && certificate!.accepted === true;
/** A chosen certificate that is not both Controlled and Accepted is refused (the form offers it disabled). */
export function certificateSelectionErrors(weld: Values, sides: number[], certificates: Row[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const side of sides) {
    const id = text(weld[`certificate${side}Id`]); if (!id) continue;
    const certificate = certificates.find(row => row.id === id);
    if (certificate && !certificateSelectable(certificate)) errors[`certificate${side}Id`] = CERTIFICATE_NOT_SELECTABLE;
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------------------------
// The Add weld / Edit weld form (reference #addWeld and #editWeld)

/** The one sentence of the reference when mandatory fields are missing (the fields themselves are marked red). */
export const WELD_MANDATORY_MESSAGE = 'Fill Weld type, WPS, Weld Date, Dia., Charge number 1 and Charge number 2 before saving.';
export const DUPLICATE_WELDER = 'This welder is already selected in another field.';
/** The welder fields holding a welder that an earlier welder field already holds (reference change.dupwelder). */
export function duplicateWelderErrors(weld: Values): Record<string, string> {
  const errors: Record<string, string> = {}, seen = new Set<string>();
  for (const name of WELDERS) { const id = text(weld[name]); if (!id) continue; if (seen.has(id)) errors[name] = DUPLICATE_WELDER; seen.add(id); }
  return errors;
}

/** Weld Date of a new weld: today (reference __wsappsWeldSuggestFillEmptyDate on opening Add weld). */
export const newWeldDefaults = (today: string): Values => ({ date: today });
/** Edit weld "Add new" is enabled only once Weld no. was changed to a number the isometric does not have yet. */
export function addNewEnabled(weldNo: unknown, original: unknown, existing: unknown[]): boolean {
  const current = text(weldNo);
  return current !== '' && current !== text(original) && !existing.map(text).includes(current);
}

/** The reference's Add weld calls the Pre-HT required box 'Pre-WHT' (Edit weld and Mass edit say 'Pre-HT'); it is bound to Pre-HT required (pwhtReqPre). */
export const ADD_PRE_HT_LABEL = 'Pre-WHT';
export interface WeldFormField { name: string; label: string; }
const field = (name: string, label: string): WeldFormField => ({ name, label });
/**
 * The fields of Add weld and Edit weld in their three columns, in the reference order (captures add-weld-open and
 * edit-weld-001). Length in mm follows Dia. only when Dia. is "-- Length in mm --"; NDT percent (Edit only) only then
 * with NDT Req. ticked. Weld process is never shown (the stored field stays).
 */
export function weldFormLayout(mode: 'add' | 'edit'): WeldFormField[][] {
  const flags = [field('ndoReqPre', 'NDT Req. Pre'), field('ndoReq', 'NDT Req.'), ...(mode === 'edit' ? [field('ndtpercent', 'NDT percent')] : []), field('pwhtReqPre', mode === 'add' ? ADD_PRE_HT_LABEL : 'Pre-HT'), field('pwhtReq', 'PWHT Req.'), field('repair', 'Repair'), field('tracer', 'Tracer')];
  if (mode === 'add') return [
    [field('weldNo', 'Weld no.'), field('typeId', 'Weld type'), field('welder1Id', 'Welder'), field('welder3Id', 'Welder 3'), field('coating1Id', 'Coating 1'), field('wire1Id', 'Welding wire 1'), field('pos1', 'Pos 1'), field('chargeNo1', 'Charge number 1')],
    [field('wpsId', 'WPS number'), field('welder2Id', 'Welder 2'), field('welder4Id', 'Welder 4'), field('coating2Id', 'Coating 2'), field('wire2Id', 'Welding wire 2'), field('pos2', 'Pos 2'), field('chargeNo2', 'Charge number 2')],
    [field('datefit', 'Fitup date'), field('date', 'Weld Date'), field('diameterId', 'Dia.'), field('dialen', 'Length in mm'), field('spoolId', 'Spool'), ...flags],
  ];
  return [
    [field('weldNo', 'Weld no.'), field('typeId', 'Weld type'), field('welder1Id', 'Welder'), field('welder3Id', 'Welder 3'), field('coating1Id', 'Coating 1'), field('coatingWeldId', 'Coating weld'), field('kr', 'KR'), field('fp', 'FP'), field('wire1Id', 'Welding wire 1'), field('pos1', 'Pos 1'), field('chargeNo1', 'Charge number 1'), field('updatePrev', 'Upd. prev. weld')],
    [field('wpsId', 'WPS number'), field('welder2Id', 'Welder 2'), field('welder4Id', 'Welder 4'), field('coating2Id', 'Coating 2'), field('sleeve', 'Sleeve'), field('insLength', 'Ins. length 1'), field('insLength2', 'Ins. length 2'), field('wire2Id', 'Welding wire 2'), field('pos2', 'Pos 2'), field('chargeNo2', 'Charge number 2'), field('updateNext', 'Upd. next weld')],
    [field('datefit', 'Fitup Date'), field('date', 'Weld Date'), field('diameterId', 'Dia.'), field('dialen', 'Length in mm'), field('spoolId', 'Spool'), ...flags],
  ];
}
/** Edit weld: the tracer is linked through NDT and the dashboard, so its checkbox is disabled with this tooltip. */
export const EDIT_TRACER_HINT = 'Tracer is assigned via NDT / dashboard, not here.';

/** The weld fields a GAP / SP / E / B number clears (reference #weldNo input handler); the server ignores them too. */
export function specialWeldCleared(code: NonWeldCode | null): string[] {
  if (!code) return [];
  const cleared = ['processId', 'typeId', 'wpsId', 'coating1Id', 'coating2Id', ...WELDERS, 'wire1Id', 'wire2Id', 'chargeNo2', 'certificate2Id', 'material2Id'];
  if (code !== 'B' && code !== 'SP') cleared.push('spoolId');
  if (code === 'GAP' || code === 'SP') cleared.push('chargeNo1', 'certificate1Id', 'material1Id');
  return cleared;
}
/**
 * The form fields a GAP / SP / E / B number hides. Add weld: what it clears; Weld no., the dates, Dia., Pos 1/2 and the
 * checkboxes stay. Edit weld hides every weld block, leaving Weld no., Pos 1 and Charge number 1 (B adds Spool; SP shows
 * Weld no. and Spool only).
 */
export function specialWeldHidden(code: NonWeldCode | null, mode: 'add' | 'edit'): Set<string> {
  if (!code) return new Set();
  if (mode === 'add') return new Set(specialWeldCleared(code).filter(name => !/^(certificate|material)\d/.test(name)));
  const keep = code === 'SP' ? ['weldNo', 'spoolId'] : ['weldNo', 'pos1', 'chargeNo1', ...(code === 'B' ? ['spoolId'] : [])];
  return new Set(weldFormLayout('edit').flat().map(item => item.name).filter(name => !keep.includes(name)));
}

// ----- option texts

/** WPS option: "<WPS number> | <process> (<designation>)" in Add / Edit weld, "<process> | <WPS number> (<designation>)" in Mass edit. */
export function wpsLabel(wps: Values, mode: 'form' | 'mass' = 'form'): string {
  const [number, process, designation] = [text(wps.name), text(wps.method), text(wps.definition)];
  const head = mode === 'mass' ? [process, number] : [number, process];
  return `${head.filter(Boolean).join(' | ')}${designation ? ` (${designation})` : ''}`;
}
/** Welding wire option: "<charge number> / <rod type> / <type of material> / <diameter> mm" (reference "110 / ad / sddfs / 225.0 mm"). */
export function wireLabel(wire: Values, materialType = ''): string {
  const diameter = present(wire.diameter) && Number.isFinite(Number(wire.diameter)) ? `${Number(wire.diameter).toFixed(1)} mm` : '';
  return [text(wire.chargeNo || wire.name), text(wire.classification), text(materialType || wire.typeMaterial), diameter].join(' / ');
}
/** What a certificate's option and detail table read: its diameter row, type of material, material part and material. */
export interface CertificateLookups { diameters?: Map<string, Values>; materialTypes?: Map<string, Values>; materialParts?: Map<string, Values>; materials?: Map<string, Values>; }
const lookup = (map: Map<string, Values> | undefined, id: unknown, key: string) => text(map?.get(text(id))?.[key]);
const certificateDiameter = (certificate: Values, lookups: CertificateLookups) => lookup(lookups.diameters, certificate.diameterId, 'diameter') || text(certificate.diameter);
/** Certificate option: "Charge number / Dia. / Schedule / Material part / Type of material / Material No" (empty parts keep their place). */
export function certificateLabel(certificate: Values, lookups: CertificateLookups = {}): string {
  return [text(certificate.chargeNo || certificate.name), certificateDiameter(certificate, lookups), text(certificate.schedule), lookup(lookups.materialParts, certificate.materialPartId, 'name') || text(certificate.materialDescription), lookup(lookups.materialTypes, certificate.materialTypeId, 'name') || text(certificate.materialCode), lookup(lookups.materials, certificate.materialId, 'materialNo')].join(' / ');
}
/** The read-only table under a chosen certificate: Index number, Material (type of material), Description (material part), Diameter. */
export function chargeDetails(certificate: Values | null | undefined, lookups: CertificateLookups = {}): [string, string][] {
  if (!certificate) return [];
  return [['Index number', text(certificate.indexNo)], ['Material', lookup(lookups.materialTypes, certificate.materialTypeId, 'name') || text(certificate.materialCode)], ['Description', lookup(lookups.materialParts, certificate.materialPartId, 'name') || text(certificate.materialDescription)], ['Diameter', certificateDiameter(certificate, lookups)]];
}
export interface ChargeOption { value: string; label: string; disabled?: boolean; }
/**
 * A charge number list. Add weld and Mass edit: the certificates, then CONN ISO, EXISTING and the 13 placeholders;
 * Edit weld: the fixed values first. Certificates that are not Controlled + Accepted are offered disabled.
 */
export function chargeOptionList(certificates: Values[], mode: 'add' | 'edit', lookups: CertificateLookups = {}, diameterSize = ''): ChargeOption[] {
  const fixed = SIDE_VALUES.map(value => ({ value: value as string, label: value as string }));
  const certs = sortChargesForDia(certificates, diameterSize, lookups).map(row => ({ value: text(row.id), label: certificateLabel(row, lookups), ...(certificateSelectable(row) ? {} : { disabled: true }) }));
  return mode === 'edit' ? [...fixed, ...certs] : [...certs, ...fixed];
}
// ----- after Dia. is chosen (reference ajax-weld-form-suggest; manual, Add weld)

/** The size a Dia. row stands for, as the Dia. check compares it. */
export const diameterRowSize = (row?: Values | null) => row ? normalizeSizeInch(row.sizeinch) || normalizeSizeInch(row.diameter) : '';
const certificateHasSize = (certificate: Values, size: string, lookups: CertificateLookups) => Boolean(size) && certificateSizes(certificate, lookups.diameters?.get(text(certificate.diameterId))).includes(size);
/** Certificates of the chosen diameter first, the others after them, each group in its own order. Without a diameter the order stays. */
export function sortChargesForDia<T extends Values>(certificates: T[], diameterSize: string, lookups: CertificateLookups = {}): T[] {
  if (!diameterSize) return certificates;
  return [...certificates.filter(row => certificateHasSize(row, diameterSize, lookups)), ...certificates.filter(row => !certificateHasSize(row, diameterSize, lookups))];
}
export interface DiaSuggestion { patch: Values; wpsId: string; }
export interface DiaSuggestInput {
  /** The form's values now: nothing already chosen is changed. */
  values: Values;
  diameterSize: string;
  /** The weld before / after this one in table order (none: null). */
  previous: Values | null; next: Values | null;
  certificates: Map<string, Values>;
  lookups?: CertificateLookups;
  /** Ids of the WPS that match the diameter. */
  matchingWps: string[];
}
/**
 * What choosing Dia. proposes. Charge number 1 = the previous weld's Charge number 2, and Charge number 2 = the next weld's
 * Charge number 1, but only when that certificate is Controlled and Accepted and has this diameter, and the field is still empty.
 * A single matching WPS is selected when none is chosen. Welders and the Weld type are never proposed.
 */
export function suggestOnDia(input: DiaSuggestInput): DiaSuggestion {
  const patch: Values = {}, lookups = input.lookups || {};
  const propose = (side: 1 | 2, from: Values | null, fromSide: 1 | 2) => {
    if (!from || present(input.values[`chargeNo${side}`]) || present(input.values[`certificate${side}Id`])) return;
    const certificate = input.certificates.get(text(from[`certificate${fromSide}Id`]));
    if (!certificate || isSideValue(from[`chargeNo${fromSide}`]) || !certificateSelectable(certificate) || !certificateHasSize(certificate, input.diameterSize, lookups)) return;
    Object.assign(patch, { [`chargeNo${side}`]: text(certificate.chargeNo), [`certificate${side}Id`]: certificate.id, [`material${side}Id`]: text(certificate.materialId) });
  };
  if (!input.diameterSize) return { patch, wpsId: '' };
  propose(1, input.previous, 2); propose(2, input.next, 1);
  const wpsId = !present(input.values.wpsId) && input.matchingWps.length === 1 ? input.matchingWps[0] : '';
  return { patch, wpsId };
}
// ----- material groups against the WPS (reference weld-material-group-check.php)

export interface MaterialGroup { iso?: string; asme?: string; }
/** The group of a charge: ISO 15608 group and ASME P-Number of the certificate's type of material. */
export function chargeMaterialGroup(certificate: Values | null | undefined, materialTypes?: Map<string, Values>): MaterialGroup {
  const type = certificate ? materialTypes?.get(text(certificate.materialTypeId)) : undefined;
  return { iso: text(type?.iso15608), asme: text(type?.asmePNumber) };
}
const tags = (value: unknown) => text(value).split(',').map(item => item.trim()).filter(Boolean);
const pairKey = (a: string, b: string) => [a, b].sort().join('+');
/**
 * Non-blocking warnings when both charges have a group and the WPS does not cover them: the WPS has no groups at all, or the pair is
 * neither inside the WPS's groups nor one of its allowed dissimilar pairs (ISO, ASME). Saving is never blocked.
 */
export function materialGroupWarnings(charge1: MaterialGroup, charge2: MaterialGroup, wps: Values | null | undefined, wpsName = ''): string[] {
  if (!wps) return [];
  const name = text(wpsName || wps.name), warnings: string[] = [];
  const systems = [
    { one: text(charge1.iso), two: text(charge2.iso), groups: tags(wps.isoGroups), pairs: tags(wps.isoPairs) },
    { one: text(charge1.asme), two: text(charge2.asme), groups: tags(wps.asmePNumbers), pairs: tags(wps.asmePairs) },
  ];
  const wpsHasGroups = systems.some(system => system.groups.length || system.pairs.length);
  for (const system of systems) {
    if (!system.one || !system.two) continue;
    const covered = system.groups.length || system.pairs.length ? (system.groups.includes(system.one) && system.groups.includes(system.two)) || system.pairs.some(pair => pair.split('+').length === 2 && pairKey(pair.split('+')[0].trim(), pair.split('+')[1].trim()) === pairKey(system.one, system.two)) : wpsHasGroups;
    if (!covered) warnings.push(`Material groups ${system.one} / ${system.two} are not covered by WPS ${name}.`);
  }
  return warnings;
}

/** Dia. options in the reference order: plain text order of their labels (code points, so "1,5" < "1.5" < "10"). */
export const diameterTextOrder = <T extends { label: string }>(options: T[]) => [...options].sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);

// ----- Dia. against the charges (reference __wsappsValidateWeldDiameterConsistency)

export const DIAMETER_MESSAGES = {
  mismatch: (sizes: string) => `Dia. must equal the diameter of charge 1/2 (${sizes}).`,
  required: (sizes: string) => `Dia. must be chosen and match the diameter of charge 1/2 (${sizes}).`,
  pick: 'Choose a default diameter when charge 1 and charge 2 differ.',
};
/** An inch size as one comparable text: quotes and spaces dropped, decimal comma read as a point, numbers rounded to 4 decimals. */
export function normalizeSizeInch(value: unknown): string {
  let size = text(value).replace(/[″”"]/g, '').replace(/\s+/g, '').replace(',', '.');
  if (size !== '' && /^-?\d+(\.\d+)?$/.test(size)) size = String(Math.round(parseFloat(size) * 10000) / 10000);
  return size;
}
/** One end of a size label: 1.1/2 (one and a half), 3/4, 2 or 2,5. */
export function parseInchSize(token: string): string {
  const value = token.trim(), mixed = /^(\d+)\.(\d+)\/(\d+)$/.exec(value), fraction = /^(\d+)\/(\d+)$/.exec(value);
  if (mixed && Number(mixed[3]) !== 0) return normalizeSizeInch(String(Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])));
  if (fraction && Number(fraction[2]) !== 0) return normalizeSizeInch(String(Number(fraction[1]) / Number(fraction[2])));
  return /^\d+([.,]\d+)?$/.test(value) ? normalizeSizeInch(value) : '';
}
/** The ends of a composite size such as 4"x2" (a reducer); none for a single size. */
export function compositeEnds(label: unknown): string[] {
  const value = text(label).replace(/[″”"]/g, '').replace(/\s+/g, '').replace(/×/g, 'x');
  if (!value.toLowerCase().includes('x')) return [];
  const sizes: string[] = [];
  for (const part of value.split(/x/i)) { if (!part) continue; const size = parseInchSize(part); if (!size) return []; sizes.push(size); }
  return sizes.length >= 2 ? sizes : [];
}
/** The sizes a certificate allows: its diameter's Size in inches, else its diameter label read as a size, and composite ends. */
export function certificateSizes(certificate: Values, diameter?: Values | null): string[] {
  const label = text(diameter?.diameter) || text(certificate.diameter);
  const primary = normalizeSizeInch(diameter?.sizeinch) || (compositeEnds(label).length ? '' : parseInchSize(label.replace(/[″”"]/g, '')));
  return [...new Set([primary, ...compositeEnds(label)].filter(Boolean))];
}
export interface DiameterAllowance { ok: boolean; reason: '' | 'pick' | 'required' | 'mismatch'; needsRadio: boolean; choices: string[]; label: string; }
/** The reference allowance: shared sizes of both charges, else either with a Default diameter choice. */
export function diameterAllowance(set1: string[], set2: string[], diaSize: string, radioSize: string): DiameterAllowance {
  const one = [...new Set(set1.map(normalizeSizeInch).filter(Boolean))], two = [...new Set(set2.map(normalizeSizeInch).filter(Boolean))];
  const dia = normalizeSizeInch(diaSize), radio = normalizeSizeInch(radioSize);
  let allowed: string[] = [], needsRadio = false;
  if (one.length && two.length) { const shared = one.filter(size => two.includes(size)); if (shared.length) allowed = shared; else { allowed = [...new Set([...one, ...two])]; needsRadio = true; } }
  else allowed = one.length ? one : two;
  const choices = [...allowed];
  let label = allowed.join(' / ');
  if (needsRadio) {
    if (!radio || !allowed.includes(radio)) return { ok: false, reason: 'pick', needsRadio, choices, label };
    allowed = [radio]; label = radio;
  }
  if (!allowed.length) return { ok: true, reason: '', needsRadio: false, choices: [], label: '' };
  if (!dia) return { ok: false, reason: 'required', needsRadio, choices, label };
  if (!allowed.includes(dia)) return { ok: false, reason: 'mismatch', needsRadio, choices, label };
  return { ok: true, reason: '', needsRadio, choices, label };
}
export interface DiameterContext { certificates: Map<string, Values>; diameters: Map<string, Values>; }
/**
 * Dia. must be a size of the chosen certificate(s). Skipped for a GAP / SP / E / B number, for an explicit length, and
 * when no side holds a certificate (CONN ISO, EXISTING and the placeholders are not checked). `defaultDiameter` is
 * the Default diameter choice when the two certificates have no size in common.
 */
export function weldDiameterCheck(weld: Values, context: DiameterContext): DiameterAllowance {
  const pass: DiameterAllowance = { ok: true, reason: '', needsRadio: false, choices: [], label: '' };
  if (nonWeldCode(weld.weldNo) || weld.lengthMode === 'Length in mm') return pass;
  const sizes = (side: 1 | 2) => { const certificate = context.certificates.get(text(weld[`certificate${side}Id`])); return certificate && !isSideValue(weld[`chargeNo${side}`]) ? certificateSizes(certificate, context.diameters.get(text(certificate.diameterId))) : []; };
  const set1 = sizes(1), set2 = sizes(2);
  if (!set1.length && !set2.length) return pass;
  const row = context.diameters.get(text(weld.diameterId));
  const dia = row ? normalizeSizeInch(row.sizeinch) || normalizeSizeInch(row.diameter) : '';
  return diameterAllowance(set1, set2, dia, text(weld.defaultDiameter));
}
/** The field messages of a failed Dia. check. */
export function diameterErrors(weld: Values, context: DiameterContext): Record<string, string> {
  const check = weldDiameterCheck(weld, context);
  if (check.ok) return {};
  // Reported on Dia. (a weld field): the Default diameter choice is no stored field.
  return { diameterId: check.reason === 'pick' ? DIAMETER_MESSAGES.pick : check.reason === 'required' ? DIAMETER_MESSAGES.required(check.label) : DIAMETER_MESSAGES.mismatch(check.label) };
}

// ----- the reason for editing (reference #editWeldNoteRequired) and Previous edits

export const EDIT_REASON_WARNING = 'Weld has NDT or PWHT in progress';
export const EDIT_REASON_LABEL = 'You MUST enter reason for editing weld';
export const EDIT_REASON_MAX = 2000;
/** The reason of an edit, as stored: plain text, trimmed. Empty when only markup or spaces were entered. */
export const editReason = (value: unknown) => text(value).replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
/** A Previous edits row: "dd.mm.yyyy hh:mm:ss" in the viewer's time. */
export function editHistoryDate(iso: string): string {
  const date = new Date(iso); if (Number.isNaN(date.getTime())) return '';
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

// ----- the NDT lock (chat 17.11.2026): a weld with an NDT request stays as it is

/** Tooltip and banner of a weld locked by its NDT request. */
export const NDT_LOCK_REASON = 'Locked: an NDT request exists. Only an administrator can change it, with a comment.';
export const NDT_LOCK_COMMENT_LABEL = 'Change comment (required, shown only here in Edit weld)';
export const NDT_LOCK_COMMENT_REQUIRED = 'Enter a change comment: this weld has an NDT request.';
/** Refusal to an account that is no administrator; `weldNo` names the weld. */
export const ndtLockRefusal = (weldNo: unknown) => `Weld ${text(weldNo)} is locked: an NDT request exists. Only an administrator can change it, with a comment.`;
/** The plain record routes carry no comment: an administrator changes a locked weld in Edit weld (or Mass edit, which asks for one). */
export const ndtLockUseEditWeld = (weldNo: unknown) => `Weld ${text(weldNo)} has an NDT request: change it in Edit weld with a change comment.`;
export interface NdtLock { locked: boolean; /** The account may still change the weld (an administrator, with a comment). */ editable: boolean; reason: string; }
/**
 * Whether a weld is locked by an NDT request (shared/inspections.ts `ndtRequested`) and whether this account may still
 * change it. Recording NDT results is not an edit of the weld and stays open on a locked weld.
 */
export function ndtLock(requests: Row[] | null | undefined, weldId: string, administrator: boolean): NdtLock {
  if (!weldId || !ndtRequested(requests, weldId)) return { locked: false, editable: true, reason: '' };
  return { locked: true, editable: administrator, reason: NDT_LOCK_REASON };
}
/** Approved / Rejected of "Attach NDT result" in Edit weld; stored as the existing results Accepted / Rejected. */
export const NDT_ATTACH_RESULTS = [{ value: 'Accepted', label: 'Approved' }, { value: 'Rejected', label: 'Rejected' }] as const;
export const ndtAttachLabel = (stored: unknown) => stored === 'Accepted' ? 'Approved' : stored === 'Rejected' ? 'Rejected' : text(stored) || '—';

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
/** The reference's range dialog (#addWelds): its title and defaults; the toolbar button that opens it reads 'Add welds'. */
export const RANGE_DIALOG = { title: 'Add weld', start: '001', end: '015', button: 'Add', toolbar: 'Add welds' } as const;
export const rangeSkippedMessage = (skipped: string[]) => skipped.length ? `Skipped, already on the isometric: ${skipped.join(', ')}.` : '';
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
/** The missing numbers between start and end (inclusive), written with the zero padding of Start (else like the existing ones); present numbers are skipped and reported. */
export function planWeldRange(start: unknown, end: unknown, existing: string[]): RangePlan {
  const from = Number(start), to = Number(end);
  if (!present(start) || !present(end) || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < 0) throw new Error('Weld no. Start and End must be whole numbers.');
  if (to < from) throw new Error('Weld no. End must not be lower than Start.');
  if (to - from + 1 > MAX_RANGE) throw new Error(`A range holds at most ${MAX_RANGE} welds.`);
  const style = weldNumberStyle(existing), taken = new Set<number>();
  for (const number of existing) { const match = /^(\D*?)(\d+)$/.exec(text(number)); if (match && match[1] === style.prefix) taken.add(Number(match[2])); }
  // The zero padding of Start ("001" gives 001, 002 ...) wins; otherwise the width of the existing numbers.
  const startText = text(start), startWidth = typeof start === 'string' && startText.length > 1 && startText.startsWith('0') ? startText.length : 0;
  const width = startWidth || style.width || (to > 999 ? String(to).length : 0), numbers: string[] = [], skipped: string[] = [];
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

/**
 * The one Options menu of the isometric page in Weld Core (client change list 22.11.2026, image 20): first the weld entries
 * (Add welds and Mass edit welds moved here from the toolbar), then the isometric's own entries (ISO_PAGE_MENU, with Punch
 * list after Attachments), destructive entries last. "Upload NDT on multiple welds" is not in it; the welds sorting switch is
 * gone with the sort column (D3).
 */
export const WELD_OPTIONS_MENU: IsoMenuEntry[] = [
  ...([['add-welds', 'Add welds'], ['mass-edit', 'Mass edit welds'], ['visual-inspection', 'Visual inspection'], ['mass-ndt-pre', 'Generate Mass NDT-Pre request'], ['mass-ndt', 'Generate Mass NDT request'],
    ['mass-pwht', 'Generate Mass Pre-HT/PWHT request'], ['upload-pwht', 'Upload Pre-HT/PWHT on multiple welds'], ['show-deleted', 'Show deleted welds']] as const).map(([key, label]) => ({ key, label, group: 'welds' as const })),
  ...ISO_PAGE_MENU.filter(entry => entry.group === 'isometric').flatMap(entry => entry.key === 'attachments' ? [entry, { key: 'punch-list', label: 'Punch list', group: 'isometric' as const }] : [entry]),
  { key: 'delete-selected', label: 'Delete selected', group: 'danger' },
  ...ISO_PAGE_MENU.filter(entry => entry.group === 'danger'),
];
export const WELD_DELETE_WORDING = { one: 'Delete weld', many: 'Delete selected', text: 'Are you sure?', button: 'Delete', cancel: 'Cancel' } as const;
/** The question of Delete weld / Delete selected: the weld number for one weld, the count (and numbers, up to five) for several (D9). */
export function weldDeleteQuestion(weldNos: string[]): string {
  if (weldNos.length === 1) return `Are you sure you want to delete weld ${weldNos[0]}?`;
  const shown = weldNos.slice(0, 5).join(', ') + (weldNos.length > 5 ? ', …' : '');
  return `Are you sure you want to delete these ${weldNos.length} welds (${shown})?`;
}
/** The question of Bring weld back, with the weld number. */
export const weldBringBackQuestion = (weldNo: string) => `Are you sure you want to bring weld ${weldNo} back?`;
export const WELD_BRING_BACK_WORDING = { title: 'Bring weld back', text: 'Are you sure?', button: 'Bring back', cancel: 'Cancel', icon: 'Bring weld back', showActive: 'Show active welds', emptyTitle: 'No welds added yet for this isometric.', emptyText: 'Use Add weld or Add welds to create the first weld.' } as const;
/**
 * The deleted-welds view after "Bring back": it stays open while deleted welds are left, otherwise the active welds are shown again (SA2 N-D2).
 * Its empty text: the reference's "No welds added yet …" only when the isometric has no weld at all, never while active welds exist.
 */
export const stayInDeletedView = (deletedLeft: number) => deletedLeft > 0;
export const deletedViewEmpty = (activeWelds: number) => activeWelds > 0
  ? { title: 'No deleted welds on this isometric.', description: `Choose ${WELD_BRING_BACK_WORDING.showActive} in Options to return to the weld list.` }
  : { title: WELD_BRING_BACK_WORDING.emptyTitle, description: WELD_BRING_BACK_WORDING.emptyText };
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
