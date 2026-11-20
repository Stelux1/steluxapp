import type { Field, Row } from './types.ts';
import { PQR_ATTRIBUTES, RELATIONS, relationIds } from './welding.ts';
import { inOwnerSite, ownerRows, siteUniqueClash } from './welder-data.ts';

/**
 * WPS methods and PQR as the reference's Weld data pages show them (hosted profile).
 *
 * WPS: the list is per main project (site). A WPS is "Active" on a site when it is enabled there (a `wps_sites` link) and
 * not switched off by the older global "Active" flag; "Inactive" otherwise; "Deleted" when archived. A copy is a WPS
 * record of its own that names its original (`sourceId`) and the main project it was copied to (`copySiteId`); it is
 * enabled on that main project only, shown under "Copies" and cannot be copied again.
 *
 * PQR: one list of the 26 source attributes and "Valid until"; the PQR attribute (attribute 2) is the PQR number that
 * identifies a PQR (display, WPS link, Excel import matching).
 *
 * Pure rules only (no dependency on the resource registry, so the registry can import this module).
 */

type Rows = Record<string, Row[] | undefined>;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
const live = (rows: Row[] | undefined) => (rows || []).filter(row => !row._archived);

// ---------------------------------------------------------------------------------------------------------------
// WPS form

/** Option lists of the four material group fields (reference #addWps; own lists, the material types keep theirs). */
export const WPS_ISO_GROUPS = ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '3.1', '3.2', '3.3', '4.1', '4.2', '5.1', '5.2', '5.3', '5.4', '6.1', '6.2', '6.3', '6.4', '7.1', '7.2', '7.3', '8.1', '8.2', '8.3', '9.1', '9.2', '9.3', '10.1', '10.2', '10.3', '11.1'];
export const WPS_ISO_PAIRS = ['1.1+5.1', '1.1+8.1', '1.2+8.1', '5.1+8.1', '8.1+10.1'];
export const WPS_ASME_P_NUMBERS = ['P-1', 'P-3', 'P-4', 'P-5A', 'P-5B', 'P-5C', 'P-6', 'P-7', 'P-8', 'P-9A', 'P-9B', 'P-10A', 'P-10H', 'P-10I', 'P-15E', 'P-34'];
export const WPS_ASME_PAIRS = ['P-1+P-4', 'P-1+P-8', 'P-4+P-8', 'P-8+P-10H'];
/** The material group fields: optional, several values, choose from the list or type one that is not in it. */
export const WPS_GROUP_FIELDS: { name: string; label: string; options: string[] }[] = [
  { name: 'isoGroups', label: 'ISO groups on this WPS', options: WPS_ISO_GROUPS },
  { name: 'isoPairs', label: 'Allowed dissimilar pairs (ISO)', options: WPS_ISO_PAIRS },
  { name: 'asmePNumbers', label: 'ASME P-Numbers on this WPS', options: WPS_ASME_P_NUMBERS },
  { name: 'asmePairs', label: 'Allowed dissimilar pairs (ASME)', options: WPS_ASME_PAIRS },
];
export const WPS_GROUP_HINT = 'Optional. You can leave this empty. Choose a value or type one that is not in the list.';
/**
 * The diameter range the WPS covers, entered by hand (client answer 17.11.2026): outside diameter in inches, both optional.
 * With "Validation on WPS" on, a weld takes only a WPS whose range holds its diameter (`sizeinch`); no range = not limited.
 */
export const WPS_RANGE_FIELDS: Field[] = [
  { name: 'diameterFrom', label: 'Diameter from (inch)', type: 'number', min: 0, step: 0.001, hint: 'Optional. Smallest diameter this WPS covers. Empty: no lower limit.' },
  { name: 'diameterTo', label: 'Diameter to (inch)', type: 'number', min: 0, step: 0.001, hint: 'Optional. Largest diameter this WPS covers. Empty: no upper limit.' },
];
export const WPS_RANGE_NAMES = WPS_RANGE_FIELDS.map(field => field.name);
/** The pair `rangeErrors` (shared/welder-data.ts) checks on a WPS save: numbers, and "to" not below "from". */
export const WPS_RANGES: [string, string, string][] = [['diameterFrom', 'diameterTo', 'Diameter']];
/**
 * Fields the WPS record gains (hidden in the shared definition; the hosted profile shows the group fields). The values of
 * a group field are stored as one text, separated by ", ". The copy fields are written by the copy action only.
 */
export const WPS_EXTRA_FIELDS: Field[] = [
  ...WPS_GROUP_FIELDS.map(({ name, label }): Field => ({ name, label, type: 'text', hidden: true })),
  ...WPS_RANGE_FIELDS,
  { name: 'sourceId', label: 'Copy of', type: 'ref', ref: 'wps', hidden: true, readonly: true },
  { name: 'copySiteId', label: 'Copied to project site', type: 'ref', ref: 'sites', hidden: true, readonly: true },
];
/** Written only by the copy action: a plain record write may not set or change them. */
export const WPS_COPY_FIELDS = ['sourceId', 'copySiteId'];
/** The fields the hosted profile delivers for a WPS in addition to the earlier ones. */
export const WPS_HOSTED_FIELDS = [...WPS_GROUP_FIELDS.map(field => field.name), ...WPS_RANGE_NAMES, ...WPS_COPY_FIELDS];

/** The values of a group field: split on commas, trimmed, without empty or repeated values. */
export const tagValues = (value: unknown): string[] => [...new Set(text(value).split(',').map(item => item.trim()).filter(Boolean))];
export const tagText = (values: string[]) => [...new Set(values.map(item => item.trim()).filter(Boolean))].join(', ');

/** Reference form order of the hosted WPS form (the project, PQR, document and site controls follow "Joint type"). */
export const WPS_FORM_FIELDS = ['name', 'method', 'definition', ...WPS_GROUP_FIELDS.map(field => field.name), 'jointType', ...WPS_RANGE_NAMES];
/** Shared WPS fields the hosted form does not show (the reference has no such inputs). Stored values stay as they are. */
export const WPS_HOSTED_HIDDEN = ['allProjects', 'active', 'processId', 'standard', 'description'];
export const WPS_HOSTED_COLUMNS = ['name', 'method', 'definition', 'jointType'];
export const WPS_METHOD_PLACEHOLDER = '141-2 GTAW';
export const enableOnSiteLabel = (siteName: string) => `Enable on this site (${siteName})`;
export const WPS_SITE_COLUMN = 'Enabled on this site';

/** "Project" of the reference form: "ALL" stands for every project of the site (`allProjects`). */
export const WPS_ALL_PROJECTS = 'ALL';
/** The Project selection a WPS shows: ALL, or the linked projects. A new WPS starts with nothing chosen. */
export function wpsProjectSelection(wps: Record<string, unknown> | undefined, projectIds: string[]): string[] {
  if (!wps) return [];
  return wps.allProjects !== false ? [WPS_ALL_PROJECTS] : projectIds;
}
/** What a Project selection stores: ALL wins over chosen projects; nothing chosen is no project. */
export function wpsProjectValues(selection: string[]): { allProjects: boolean; projectIds: string[] } {
  return selection.includes(WPS_ALL_PROJECTS) ? { allProjects: true, projectIds: [] } : { allProjects: false, projectIds: [...new Set(selection.filter(Boolean))] };
}

// ---------------------------------------------------------------------------------------------------------------
// WPS per site

const relation = (field: string) => RELATIONS.wps.find(item => item.field === field)!;
const linkRows = (rows: Rows) => rows as Record<string, Row[]>;
export const wpsSiteIds = (rows: Rows, wpsId: string) => relationIds(linkRows(rows), relation('siteIds'), wpsId);
export const isWpsCopy = (wps: Record<string, unknown>) => Boolean(text(wps.sourceId));

/** Is the WPS enabled on the main project? A site link, and not switched off everywhere by the older global flag. */
export function wpsEnabledOnSite(rows: Rows, wps: Row, siteId: string): boolean {
  return !wps._archived && wps.active !== false && Boolean(siteId) && wpsSiteIds(rows, wps.id).includes(siteId);
}
/**
 * "Enabled on this site" column. ASSUMPTION (to confirm): "Global" for a WPS of every project (Project ALL) that is
 * enabled on this site, "Yes" for one of chosen projects that is enabled here, "No" when it is not enabled here.
 */
export function wpsSiteStatus(rows: Rows, wps: Row, siteId: string): 'Global' | 'Yes' | 'No' {
  if (!wpsEnabledOnSite(rows, wps, siteId)) return 'No';
  return wps.allProjects !== false ? 'Global' : 'Yes';
}
export type WpsTab = 'active' | 'inactive' | 'deleted';
export type WpsVariant = 'originals' | 'copies';
export const WPS_TABS: { key: WpsTab; label: string }[] = [{ key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' }, { key: 'deleted', label: 'Deleted' }];
export const WPS_VARIANTS: { key: WpsVariant; label: string }[] = [{ key: 'originals', label: 'Originals' }, { key: 'copies', label: 'Copies' }];
export const wpsTab = (rows: Rows, wps: Row, siteId: string): WpsTab => wps._archived ? 'deleted' : wpsEnabledOnSite(rows, wps, siteId) ? 'active' : 'inactive';
export const wpsVariant = (wps: Row): WpsVariant => isWpsCopy(wps) ? 'copies' : 'originals';
/** Counters of the tabs: per view (originals / copies) and per main project. */
export function wpsTabCounts(rows: Rows, siteId: string, variant: WpsVariant): Record<WpsTab, number> {
  const counts: Record<WpsTab, number> = { active: 0, inactive: 0, deleted: 0 };
  for (const wps of rows.wps || []) if (wpsVariant(wps) === variant) counts[wpsTab(rows, wps, siteId)]++;
  return counts;
}

/**
 * Switching a WPS on or off for one main project: the site links it keeps. A WPS switched off by the older global flag
 * comes back on this main project only (its other links are dropped and the flag is cleared).
 */
export function wpsSiteChange(rows: Rows, wps: Row, siteId: string, enabled: boolean): { siteIds: string[]; active?: true } {
  const current = wpsSiteIds(rows, wps.id);
  if (!enabled) return { siteIds: current.filter(id => id !== siteId) };
  if (wps.active === false) return { siteIds: [siteId], active: true };
  return { siteIds: [...new Set([...current, siteId])] };
}
/** "Global deactivate": the WPS is switched off on every main project. */
export const wpsGlobalDeactivation = (): { siteIds: string[] } => ({ siteIds: [] });

/** Why a WPS cannot be copied to the main project ('' when it can). */
export function wpsCopyRefusal(rows: Rows, wps: Row, siteId: string): string {
  if (wps._archived) return `WPS ${text(wps.name)} is deleted. Restore it before copying.`;
  if (isWpsCopy(wps)) return `WPS ${text(wps.name)} is a copy. A copy cannot be copied again.`;
  const site = live(rows.sites).find(row => row.id === siteId);
  if (!site) return 'Choose an active project site.';
  if (live(rows.wps).some(row => row.sourceId === wps.id && row.copySiteId === siteId)) return `WPS ${text(wps.name)} is already copied to ${text(site.name)}.`;
  return '';
}
/**
 * The new record of a copy. ASSUMPTION (to confirm): the copy keeps every value of its original and belongs to the main
 * project it is copied to (client 20.11.2026: WPS numbers are unique per main project, so the number stays as it is; copies
 * made before keep " (<site>)" in theirs). Only when that main project already holds a WPS with the number (an older WPS
 * shared with it) does the copy get the main project's name added, as before. It is enabled on that main project only;
 * projects chosen on the original stay chosen when they belong to that main project, and so do its PQRs (a PQR of another
 * main project is left out).
 */
export function wpsCopyValues(rows: Rows, wps: Row, siteId: string): Record<string, unknown> {
  const pqrs = new Map(live(rows.pqr).map(row => [row.id, row])), owners = ownerRows('pqr', name => rows[name]);
  const site = live(rows.sites).find(row => row.id === siteId), taken = siteUniqueClash('wps', { name: text(wps.name), siteId }, live(rows.wps), ownerRows('wps', name => rows[name]));
  const projects = new Set(live(rows.projects).filter(project => project.siteId === siteId).map(project => project.id));
  const copied = ['method', 'definition', 'jointType', ...WPS_GROUP_FIELDS.map(field => field.name), ...WPS_RANGE_NAMES, 'processId', 'standard', 'description'];
  return {
    ...Object.fromEntries(copied.filter(name => wps[name] !== undefined && wps[name] !== null && wps[name] !== '').map(name => [name, wps[name]])),
    name: taken ? `${text(wps.name)} (${text(site?.name) || siteId})` : text(wps.name), siteId,
    allProjects: wps.allProjects !== false,
    projectIds: wps.allProjects !== false ? [] : relationIds(linkRows(rows), relation('projectIds'), wps.id).filter(id => projects.has(id)),
    pqrIds: relationIds(linkRows(rows), relation('pqrIds'), wps.id).filter(id => !rows.pqr || pqrs.has(id) && inOwnerSite('pqr', pqrs.get(id)!, siteId, owners)),
    siteIds: [siteId], active: true, sourceId: wps.id, copySiteId: siteId,
  };
}

/** The newest PDF attached to a WPS: the WPS number links to it. */
export function wpsDocument(attachments: Row[] | undefined, wpsId: string): Row | undefined {
  return live(attachments).filter(file => file.entityType === 'wps' && file.entityId === wpsId && (/\.pdf$/i.test(text(file.name)) || text(file.mime) === 'application/pdf'))
    .sort((a, b) => String(b._createdAt).localeCompare(String(a._createdAt)))[0];
}
export const WPS_DOCUMENT_TYPE = 'WPS document';
export const PQR_DOCUMENT_TYPE = 'PQR file';

// ---------------------------------------------------------------------------------------------------------------
// PQR

/** The PQR attribute: its value is the PQR number. */
export const PQR_NUMBER = PQR_ATTRIBUTES[1];
/** Column titles of the list (the form keeps the full labels): the two scope triples are headed "Scope EN" / "Scope ASME". */
const SHORT_TITLES: Record<string, string> = { attribute15Id: 'Ø', attribute16Id: 'T', attribute17Id: 'Mat. gr.', attribute18Id: 'Ø', attribute19Id: 'T' };
export const pqrColumnTitle = (name: string, label: string) => SHORT_TITLES[name] ?? label;
/** Header groups over the list columns (checkbox and options first), as in the reference: [title, span]. */
export const PQR_HEADER_GROUPS: [string, number][] = [['Certificate No.', 2], ['', 13], ['Scope EN', 3], ['Scope ASME', 3], ['', 8]];
export const PQR_HOSTED_COLUMNS = [...PQR_ATTRIBUTES.map(attribute => attribute.name), 'validUntil'];
/** Shared PQR fields the hosted form, list and export leave out: the number is the PQR attribute. */
export const PQR_HOSTED_HIDDEN = ['name'];
export const PQR_PAGE_SIZES = [10, 20, 50, 100, 500];
export const WPS_PAGE_SIZES = [10, 25, 50, 100];

/** The PQR number of a PQR: the value of its PQR attribute, else its stored reference. */
export function pqrNumber(pqr: Row | undefined, options: Row[] | undefined): string {
  if (!pqr) return '';
  const id = pqr[PQR_NUMBER.name];
  const value = id ? (options || []).find(option => option.id === id)?.name : undefined;
  return text(value) || text(pqr.name) || pqr.id;
}

/** Fields of the shared definitions as the hosted profile shows them (labels stay; sections and visibility follow the reference). */
export function hostedWeldDataField(resource: string, field: Field): Field {
  if (resource === 'wps') {
    if (WPS_GROUP_FIELDS.some(group => group.name === field.name)) return { ...field, hidden: false, section: undefined, hint: WPS_GROUP_HINT };
    if (WPS_HOSTED_HIDDEN.includes(field.name)) return { ...field, hidden: true };
    return field;
  }
  if (resource === 'pqr') {
    if (PQR_HOSTED_HIDDEN.includes(field.name)) return { ...field, hidden: true };
    if (PQR_ATTRIBUTES.some(attribute => attribute.name === field.name)) return { ...field, section: undefined };
  }
  return field;
}
/** The hosted WPS form order: the reference fields first, then the rest as they were. */
export function orderWpsFields<T extends { name: string }>(fields: T[]): T[] {
  const rank = (name: string) => { const index = WPS_FORM_FIELDS.indexOf(name); return index < 0 ? WPS_FORM_FIELDS.length : index; };
  return fields.map((field, index) => ({ field, index })).sort((a, b) => rank(a.field.name) - rank(b.field.name) || a.index - b.index).map(item => item.field);
}
/** List columns of the hosted profile. */
export const WELD_DATA_COLUMNS: Record<string, string[]> = { wps: WPS_HOSTED_COLUMNS, pqr: PQR_HOSTED_COLUMNS };
/** Fields the hosted export leaves out. */
export const WELD_DATA_EXPORT_HIDDEN: Record<string, string[]> = { pqr: PQR_HOSTED_HIDDEN };

// ---------------------------------------------------------------------------------------------------------------
// PQR import (Excel)

/** Columns of the Excel sheet: the PQR form's attributes in the reference's order, then Valid until (row 1 is the header). */
export const PQR_IMPORT_COLUMNS: { name: string; label: string }[] = [...PQR_ATTRIBUTES.map(({ name, label }) => ({ name, label })), { name: 'validUntil', label: 'Valid until' }];
export type PqrImportAction = 'import' | 'update' | 'skip';
export const PQR_IMPORT_ACTIONS: PqrImportAction[] = ['import', 'update', 'skip'];
/** "Valid until" accepts 31-12-2026 or 2026-12-31 (and a date cell). Returns the ISO date, '' for empty, null when invalid. */
export function pqrImportDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const raw = text(value);
  if (!raw) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) || /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  if (!match) return null;
  const [year, month, day] = raw.indexOf('-') === 4 ? [match[1], match[2], match[3]] : [match[3], match[2], match[1]];
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === `${year}-${month}-${day}` ? `${year}-${month}-${day}` : null;
}
/** A heading of the sheet names a column by its label (case and spacing do not matter; the earlier labels are accepted too). */
const heading = (value: string) => value.toLowerCase().replace(/\s+/g, '');
export function pqrImportColumn(header: string): string | undefined {
  const wanted = heading(header);
  if (!wanted) return undefined;
  return PQR_IMPORT_COLUMNS.find(column => heading(column.label) === wanted)?.name ?? PQR_ATTRIBUTES.find(attribute => heading(attribute.category) === wanted && attribute.category !== 'WPS')?.name;
}
export interface PqrImportRow { rowNo: number; values: Record<string, string>; action: PqrImportAction; errors: string[]; targetId?: string; }
/**
 * Preview of the sheet's rows: one PQR per row, matched on the PQR number. A number that exists is an update, a new one
 * an import; an empty number, an invalid date, a number used twice in the sheet or by two PQRs is an error.
 * `existing` maps a PQR number to the ids of the active PQRs that carry it.
 */
export function pqrImportPreview(rows: { rowNo: number; values: Record<string, string> }[], existing: Map<string, string[]>): PqrImportRow[] {
  const seen = new Map<string, number>();
  return rows.map(row => {
    const errors: string[] = []; const values = { ...row.values };
    const number = text(values[PQR_NUMBER.name]);
    if (!number) errors.push('PQR is required.');
    const date = pqrImportDate(values.validUntil);
    if (date === null) errors.push('Valid until must be a date like 31-12-2026 or 2026-12-31.'); else values.validUntil = date;
    const key = number.toLowerCase(); const ids = number ? existing.get(key) || [] : [];
    if (number && seen.has(key)) errors.push(`PQR ${number} is also on row ${seen.get(key)}.`);
    if (number && !seen.has(key)) seen.set(key, row.rowNo);
    if (ids.length > 1) errors.push(`PQR ${number} is used by more than one PQR.`);
    return { rowNo: row.rowNo, values, errors, action: ids.length ? 'update' : 'import', ...(ids.length === 1 ? { targetId: ids[0] } : {}) };
  });
}
/** A row action the user chose must fit the row: skip always; import only for a new number, update only for an existing one. */
export function pqrImportActionError(row: PqrImportRow, chosen: unknown): string {
  if (chosen === 'skip') return '';
  if (chosen !== 'import' && chosen !== 'update') return 'Choose import, update or skip.';
  if (chosen === 'import' && row.action === 'update') return `PQR ${row.values[PQR_NUMBER.name]} already exists. Choose update or skip.`;
  if (chosen === 'update' && row.action === 'import') return `PQR ${row.values[PQR_NUMBER.name]} does not exist yet. Choose import or skip.`;
  return '';
}
export const pqrImportSummary = (rows: PqrImportRow[]) => ({ totalRows: rows.length, totalErrors: rows.filter(row => row.errors.length).length, totalImportable: rows.filter(row => !row.errors.length && row.action === 'import').length, totalUpdates: rows.filter(row => !row.errors.length && row.action === 'update').length });
export const pqrImportMessage = (result: { imported: number; updated: number; skipped: number }) => `${result.imported} PQR imported, ${result.updated} updated.${result.skipped > 0 ? ` ${result.skipped} rows skipped because PQR was empty.` : ''}`;
/** The Import PQR page (Weld Pilot → Weld data → PQR → Import PQR). */
export const PQR_IMPORT_PATH = '/welding/pqr-import';
