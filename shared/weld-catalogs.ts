import { DEFECT_NORMS, defectNorm } from './site-settings.ts';
import type { Field, Row } from './types.ts';

/**
 * Weld catalogs and "Enabled on this site".
 *
 * Catalog records are global; every main project (site) switches them on or off. One generic mechanism serves
 * all catalogs: a record of `catalog_sites` says whether one catalog record is enabled on one site. A catalog
 * record without such a row (older data, or never switched) counts as enabled everywhere, so existing data
 * keeps working. This module has no dependency on the resource registry so the registry can import it.
 */

/** Resources of this flow (the reference's Weld data, NDT data, Welding data and General data catalogs). */
export const WELD_CATALOG_RESOURCES = ['weld_processes', 'weld_types', 'coatings', 'ndt_groups', 'ndt_processes', 'ndt_defect_codes', 'ndt_locations', 'pwht_processes', 'pwht_locations', 'qa_engineers', 'companies', 'attachment_names'];
/** Catalogs that carry "Enabled on this site". Suppliers, service companies and laydowns only gain the enablement. */
export const SITE_ENABLED_RESOURCES = ['weld_types', 'coatings', 'ndt_processes', 'ndt_defect_codes', 'ndt_locations', 'pwht_processes', 'pwht_locations', 'qa_engineers', 'suppliers', 'service_companies', 'laydowns'];
/** Tables the hosted database needs for this flow (created by the preparation step, see shared/planning.ts). */
export const CATALOG_TABLES = ['ndt_defect_codes', 'catalog_sites'];
/** The link records: one per catalog record and site that was switched explicitly. Written only by the server. */
export const CATALOG_SITES = 'catalog_sites';
/** Request names that carry the form checkbox and the Options menu (not stored fields of the catalog record). */
export const ENABLEMENT_INPUT = ['enabledOnSite', 'enabledSiteId'];
export const enablementKey = (key: string) => SITE_ENABLED_RESOURCES.includes(key);
export const ENABLED_COLUMN = 'Enabled on this site';
export const enableLabel = (siteName: string) => `Enable on this site (${siteName})`;

/** The reference's list columns, in order (the hosted profile; "Enabled on this site" is appended by the list). */
export const WELD_CATALOG_COLUMNS: Record<string, string[]> = {
  weld_processes: ['name'],
  weld_types: ['name', 'location', 'abbreviation', 'jointType', 'grooveType'],
  coatings: ['name', 'abbreviation'],
  ndt_groups: ['name', 'description'],
  ndt_processes: ['name', 'description', 'groupId', 'wpr'],
  ndt_defect_codes: ['code', 'english', 'dutch', 'group', 'norm', 'isoRef'],
  ndt_locations: ['name'],
  pwht_processes: ['name', 'description'],
  pwht_locations: ['name'],
  qa_engineers: ['name', 'companyId', 'phone', 'email', 'stamp'],
  companies: ['name', 'address', 'phone', 'email'],
  attachment_names: ['name', 'isoBook', 'hydrotest'],
};
/** Sort of a list before the user chooses one (the reference's DataTable order): companies by e-mail address, project sites by IRN Code. */
export const HOSTED_DEFAULT_SORT: Record<string, string> = { companies: 'email', sites: 'irnCode' };
/**
 * Fields the reference marks as required that the hosted profile enforces (client and server). The shared
 * resource keeps them optional so the other release profiles and the CSV / prototype imports behave as before.
 */
export const HOSTED_REQUIRED: Record<string, string[]> = {
  weld_types: ['location', 'abbreviation'],
  coatings: ['abbreviation'],
  ndt_processes: ['description'],
  pwht_processes: ['description'],
  qa_engineers: ['companyId'],
  companies: ['address'],
  sites: ['address'],
};
const FIELD_LABELS: Record<string, Record<string, string>> = {
  weld_types: { location: 'Shop/Field', abbreviation: 'Abbreviation' }, coatings: { abbreviation: 'Abbreviation' }, ndt_processes: { description: 'Description' },
  pwht_processes: { description: 'Description' }, qa_engineers: { companyId: 'Company' }, companies: { address: 'Address' }, sites: { address: 'Address' },
};
/** Messages of the required fields a hosted write leaves empty, by field name. Empty when nothing is missing. */
export function missingRequired(key: string, input: Record<string, unknown>, existing?: Row): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const name of HOSTED_REQUIRED[key] || []) {
    const value = Object.hasOwn(input, name) ? input[name] : existing?.[name];
    if (value === undefined || value === null || String(value).trim() === '') errors[name] = `${FIELD_LABELS[key]?.[name] || name} is required.`;
  }
  return errors;
}

export const WELD_LOCATIONS = ['Shop', 'Field'];
export const ATTACHMENT_POSITIONS = ['Before Isometric', 'After Isometric'];
/** The hosted form of an attachment name (reference "Add Attachment name"): ISO Book ticked and "Before Isometric" to start with; the order is set by sorting, not typed. */
export const HOSTED_FIELD_OVERRIDES: Record<string, Record<string, Partial<Field>>> = {
  attachment_names: { isoBook: { default: true }, position: { default: ATTACHMENT_POSITIONS[0] }, sort: { hidden: true } },
};
/** The company data of the hosted profile: only what the reference form holds. */
export const HOSTED_COMPANY_FIELDS = ['name', 'address', 'phone', 'email'];
/** Groups of ISO 6520-1 (the reference offers six). */
export const DEFECT_GROUPS = ['Crack', 'Cavity', 'Inclusion', 'Lack of fusion', 'Imperfect shape', 'Miscellaneous'];
/** "Current list" is the list in use under any norm; the others tie a code to one norm of the site setting. */
export const CURRENT_LIST = 'Current list';
export const DEFECT_CODE_NORMS = [CURRENT_LIST, ...DEFECT_NORMS.slice(1)];

type Rows = Record<string, Row[] | undefined>;
const indexes = new WeakMap<Row[], Map<string, boolean>>();
function index(links: Row[]) {
  let map = indexes.get(links);
  if (!map) { map = new Map(links.filter(link => !link._archived).map(link => [`${link.resourceKey}\u0000${link.recordId}\u0000${link.siteId}`, link.enabled !== false])); indexes.set(links, map); }
  return map;
}
/**
 * Is the catalog record enabled on the site? True when there is no site, the resource has no enablement, or no
 * link says otherwise. `rows` is the record map of the workspace (it needs `catalog_sites` only when present).
 */
export function enabledOnSite(resourceKey: string, row: Pick<Row, 'id'>, siteId: string | undefined | null, rows: Rows): boolean {
  if (!siteId || !enablementKey(resourceKey) || !rows[CATALOG_SITES]) return true;
  return index(rows[CATALOG_SITES]!).get(`${resourceKey}\u0000${row.id}\u0000${siteId}`) ?? true;
}
/**
 * What a ref select offers: the records enabled on the site, plus the value(s) already stored. Resources without
 * enablement, and an unknown site, leave the options unchanged.
 */
export function enabledOptions<T extends Pick<Row, 'id'>>(resourceKey: string, options: T[], siteId: string | undefined | null, rows: Rows, keep?: unknown): T[] {
  if (!siteId || !enablementKey(resourceKey) || !rows[CATALOG_SITES]) return options;
  const kept = new Set((Array.isArray(keep) ? keep : [keep]).filter(value => typeof value === 'string' && value) as string[]);
  return options.filter(option => kept.has(option.id) || enabledOnSite(resourceKey, option, siteId, rows));
}

/**
 * Defect code rule of the "Defect norm" site setting (simplest explicit reading of the reference): with no norm
 * selected every code is offered; with a norm only the codes written for that norm and the shared "Current list"
 * codes are. A code saved without a norm counts as "Current list".
 */
export const defectCodeMatchesNorm = (code: Record<string, unknown>, norm: string | null) => !norm || !code.norm || code.norm === CURRENT_LIST || code.norm === norm;
/** The defect codes a site may select for a rejected result: enabled on the site and matching its defect norm. */
export function selectableDefectCodes(rows: Rows, site: Record<string, unknown> | null | undefined, siteId: string | undefined | null = (site as Row | undefined)?.id): Row[] {
  const norm = defectNorm(site);
  return (rows.ndt_defect_codes || []).filter(code => !code._archived && enabledOnSite('ndt_defect_codes', code, siteId, rows) && defectCodeMatchesNorm(code, norm))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'en', { numeric: true }));
}

/** The two sorting modes of the Attachment names page (reference "Sorting: ISO book / Hydrotest"). */
export const ATTACHMENT_SORT_MODES = ['iso-book', 'hydrotest'] as const;
export type AttachmentSortMode = typeof ATTACHMENT_SORT_MODES[number];
export const ATTACHMENT_SORT_LABELS: Record<AttachmentSortMode, string> = { 'iso-book': 'ISO book', hydrotest: 'Hydrotest' };
const ORDER_FIELD: Record<AttachmentSortMode, string> = { 'iso-book': 'isoBookOrder', hydrotest: 'hydrotestOrder' };
const FLAG_FIELD: Record<AttachmentSortMode, string> = { 'iso-book': 'isoBook', hydrotest: 'hydrotest' };
export const attachmentOrderField = (mode: AttachmentSortMode) => ORDER_FIELD[mode];
export const attachmentFlagField = (mode: AttachmentSortMode) => FLAG_FIELD[mode];
/** Documents the reference ships and locks ("Standard documents cannot be deleted."). A row can also be flagged `standard`. */
export const STANDARD_ATTACHMENT_NAMES = ['task sheet', 'itp documents'];
export const STANDARD_DOCUMENT_MESSAGE = 'Standard documents cannot be deleted.';
export const isStandardAttachmentName = (row: Partial<Row>) => row.standard === true || STANDARD_ATTACHMENT_NAMES.includes(String(row.name ?? '').trim().toLowerCase());
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
/**
 * The order of the rows flagged for one mode: the saved order of that mode first (rows never sorted keep the older
 * single "Sort order" until a new order is saved), then newest last, then by name. The two modes order independently.
 */
export function attachmentNamesInOrder(rows: Row[], mode: AttachmentSortMode): Row[] {
  const live = rows.filter(row => !row._archived && row[FLAG_FIELD[mode]] === true);
  const rank = (row: Row) => finite(row[ORDER_FIELD[mode]]) ?? finite(row.sort) ?? Number.MAX_SAFE_INTEGER;
  return live.sort((a, b) => rank(a) - rank(b) || String(a._createdAt).localeCompare(String(b._createdAt)) || String(a.name).localeCompare(String(b.name), 'en', { numeric: true }));
}
/** Attachment names in the order the ISO book and attachment lists use: before / after the isometric, then the ISO book order, then name. */
export function orderedAttachmentNames(rows: Row[]): Row[] {
  const place = (row: Row) => row.position === ATTACHMENT_POSITIONS[1] ? 1 : 0;
  const rank = (row: Row) => finite(row.isoBookOrder) ?? finite(row.sort) ?? Number.MAX_SAFE_INTEGER;
  return rows.filter(row => !row._archived).sort((a, b) => place(a) - place(b) || rank(a) - rank(b) || String(a.name).localeCompare(String(b.name), 'en', { numeric: true }));
}
/**
 * The order a saved sort produces: the ids sent come first, in that order, then the other rows of the mode keep their
 * current order. Returns null when an id is not a row of that mode (unknown, archived, or not flagged) or repeats.
 */
export function reorderedAttachmentIds(rows: Row[], mode: AttachmentSortMode, ids: unknown): string[] | null {
  const current = attachmentNamesInOrder(rows, mode).map(row => row.id);
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !current.includes(id))) return null;
  return [...(ids as string[]), ...current.filter(id => !(ids as string[]).includes(id))];
}
/** `order` with the entry at `from` moved to position `to` (both clamped); the same array when nothing moves. */
export function moveEntry<T>(order: T[], from: number, to: number): T[] {
  const target = Math.max(0, Math.min(order.length - 1, to));
  if (from < 0 || from >= order.length || from === target) return order;
  const next = [...order]; const [entry] = next.splice(from, 1); next.splice(target, 0, entry);
  return next;
}
