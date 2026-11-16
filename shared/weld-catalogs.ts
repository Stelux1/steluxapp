import { DEFECT_NORMS, defectNorm } from './site-settings.ts';
import type { Field, Resource, Row } from './types.ts';

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
export const SITE_ENABLED_RESOURCES = ['weld_types', 'coatings', 'ndt_processes', 'ndt_defect_codes', 'ndt_locations', 'pwht_processes', 'pwht_locations', 'qa_engineers', 'suppliers', 'service_companies', 'laydowns', 'material_laydowns'];
/** Tables the hosted database needs for this flow (created by the preparation step, see shared/planning.ts). */
export const CATALOG_TABLES = ['ndt_defect_codes', 'catalog_sites'];
/** The link records: one per catalog record and site that was switched explicitly. Written only by the server. */
export const CATALOG_SITES = 'catalog_sites';
/** Request names that carry the form checkbox and the Options menu (not stored fields of the catalog record). */
export const ENABLEMENT_INPUT = ['enabledOnSite', 'enabledSiteId'];
export const enablementKey = (key: string) => SITE_ENABLED_RESOURCES.includes(key);
export const ENABLED_COLUMN = 'Enabled on this site';
export const enableLabel = (siteName: string) => `Enable on this site (${siteName})`;
/**
 * The Add / Edit forms that carry the checkbox "Enable on this site (<site>)", with the box's starting value. The
 * reference ticks nothing. On every other catalog (service companies, laydown areas and materials included) the
 * availability is changed only through Options.
 */
export const FORM_ENABLEMENT: Record<string, boolean> = { ndt_processes: false, qa_engineers: false, coatings: false };
export const formEnablement = (key: string) => Object.hasOwn(FORM_ENABLEMENT, key);
/**
 * Catalogs whose new records a user adds switched off on every main project until the Add form's box is ticked or
 * Options -> Activate selected is used (hosted profile; the sample data and the demo copy keep "no link = enabled").
 * Weld types are not in the list: their form has no box and their lists show every type as enabled.
 */
export const NEW_RECORDS_OFF = ['ndt_processes', 'qa_engineers', 'coatings', 'ndt_defect_codes', 'ndt_locations', 'pwht_processes', 'pwht_locations', 'suppliers'];
/** The selects of these catalogs offer every record, whatever "Enabled on this site" says (the list column and Options stay). */
export const UNFILTERED_OPTIONS = ['pwht_processes', 'pwht_locations'];

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
  qa_engineers: ['name', 'company', 'phone', 'email', 'stamp'],
  companies: ['name', 'address', 'phone', 'email'],
  attachment_names: ['name', 'isoBook', 'hydrotest'],
};
/**
 * Fields the reference marks as required that the hosted profile enforces (client and server). The shared
 * resource keeps them optional so the other release profiles and the CSV / prototype imports behave as before.
 */
export const HOSTED_REQUIRED: Record<string, string[]> = {
  weld_types: ['location', 'abbreviation'],
  coatings: ['abbreviation'],
  ndt_processes: ['description'],
  pwht_processes: ['description'],
  qa_engineers: ['company'],
  companies: ['address'],
  sites: ['address'],
};
const FIELD_LABELS: Record<string, Record<string, string>> = {
  weld_types: { location: 'Shop/Field', abbreviation: 'Abbreviation' }, coatings: { abbreviation: 'Abbreviation' }, ndt_processes: { description: 'Description' },
  pwht_processes: { description: 'Description' }, qa_engineers: { company: 'Company' }, companies: { address: 'Address' }, sites: { address: 'Address' },
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
export const CATALOG_FIELD_OVERRIDES: Record<string, Record<string, Partial<Field>>> = {
  attachment_names: { isoBook: { default: true }, position: { default: ATTACHMENT_POSITIONS[0] }, sort: { hidden: true } },
};
/** The company data of the hosted profile: only what the reference form holds. */
export const HOSTED_COMPANY_FIELDS = ['name', 'address', 'phone', 'email'];
/** Groups of the defect codes (the reference offers six, "Crack" first). */
export const DEFECT_GROUPS = ['Crack', 'Cavity', 'Inclusion', 'Fusion', 'Shape', 'Miscellaneous'];
/** Stored group names of earlier releases and the group each one stands for now. */
export const LEGACY_DEFECT_GROUPS: Record<string, string> = { 'Lack of fusion': 'Fusion', 'Imperfect shape': 'Shape' };
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
  if (!siteId || !enablementKey(resourceKey) || UNFILTERED_OPTIONS.includes(resourceKey) || !rows[CATALOG_SITES]) return options;
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

// ---------------------------------------------------------------------------------------------------------
// Wording and behaviour of the catalog pages in the hosted profile (the reference's page titles, buttons and dialogs)
// ---------------------------------------------------------------------------------------------------------
/** Titles and dialog headings of a catalog page, character for character as the reference words them. */
export interface CatalogWording { title: string; add: string; edit: string; remove: string }
export const CATALOG_WORDING: Record<string, CatalogWording> = {
  weld_processes: { title: 'Weld process', add: 'Add welding process', edit: 'Edit welding process', remove: 'Delete welding process' },
  weld_types: { title: 'Weld type', add: 'Add weld type', edit: 'Edit weld type', remove: 'Delete weld type' },
  coatings: { title: 'Coating', add: 'Add coating', edit: 'Edit coating', remove: 'Delete coating' },
  ndt_processes: { title: 'NDT process', add: 'Add NDT process', edit: 'Edit NDT process', remove: 'Delete NDT process' },
  ndt_defect_codes: { title: 'Defect codes', add: 'Add', edit: 'Edit', remove: 'Delete' },
  ndt_locations: { title: 'NDT locations', add: 'Add NDT location', edit: 'Edit NDT location', remove: 'Delete NDT location' },
  pwht_processes: { title: 'PWHT process', add: 'Add PWHT process', edit: 'Edit PWHT process', remove: 'Delete PWHT process' },
  pwht_locations: { title: 'PWHT locations', add: 'Add PWHT location', edit: 'Edit PWHT location', remove: 'Delete PWHT location' },
  qa_engineers: { title: 'QA/QC engineers', add: 'Add QA/QC engineer', edit: 'Edit QA/QC engineer', remove: 'Delete QA/QC engineer' },
  // Weld Pilot → Welder → Roles (capture weld__welder__roles.txt: title, #addRole, Edit role, #deleteRole, 5/20/50/100/500 rows).
  roles: { title: 'Roles', add: 'Add Role', edit: 'Edit role', remove: 'Delete role' },
  // Weld Pilot / MTO Pilot -> Logistic (captures mto__logistic__service-companies, laydown-areas, laydown-materials): page titles, Add / Edit / Delete dialogs.
  service_companies: { title: 'Service companies', add: 'Add company', edit: 'Edit company', remove: 'Delete company' },
  laydowns: { title: 'Laydown areas', add: 'Add laydown', edit: 'Edit laydown', remove: 'Delete laydown' },
  material_laydowns: { title: 'Laydown areas - Materials', add: 'Add laydown', edit: 'Edit laydown material', remove: 'Delete laydown' },
};
/**
 * Catalog pages whose row action reads "Delete" and asks "Are you sure?" in the hosted profile, as the reference does.
 * Underneath the record is archived (it can be restored from the Archived tab), exactly as welds are.
 */
export const DELETE_WORDING_RESOURCES = [...Object.keys(CATALOG_WORDING), 'ndt_groups', 'diameters', 'material_parts', 'material_types', 'suppliers', 'welding_wires', 'certifications'];
export const DELETE_CONFIRMATION = 'Are you sure?';
export const deleteWording = (key: string, singular: string) => ({ title: CATALOG_WORDING[key]?.remove ?? `Delete ${singular}`, text: DELETE_CONFIRMATION, button: 'Delete', cancel: 'Cancel' });
/** The label of the row action: "Delete" for a catalog in DELETE_WORDING_RESOURCES, else "Archive record" / "Restore record". */
export const rowDeleteLabel = (key: string, archived: boolean, hosted: boolean) => archived ? 'Restore record' : hosted && DELETE_WORDING_RESOURCES.includes(key) ? 'Delete' : 'Archive record';

/** The Options menu of a catalog list: both items ask for a Confirm before anything is written. */
export const OPTIONS_WORDING = {
  activate: { item: 'Activate selected', title: 'Activate selected', text: 'By clicking ‘Confirm,’ you will activate the selected options.' },
  deactivate: { item: 'Deactivate selected', title: 'Deactivate selected', text: 'By clicking ‘Confirm,’ you will deactivate the selected options.' },
  confirm: 'Confirm', cancel: 'Cancel', none: 'Check one or more records first.',
};

/** Rows per page offered by a catalog page (the reference's DataTables length menu) and the one it starts on. */
export const CATALOG_PAGE_SIZES = [5, 20, 50, 100, 500];
export const LONG_CATALOG_PAGE_SIZES = [25, 50, 100, 500];
export const DEFAULT_PAGE_SIZES = [20, 50, 100];
const PAGE_SIZE_CATALOGS = [...DELETE_WORDING_RESOURCES, 'weld_processes', 'weld_types', 'coatings'];
export function pageSizes(key: string, hosted: boolean): { sizes: number[]; initial: number } {
  if (!hosted || !PAGE_SIZE_CATALOGS.includes(key)) return { sizes: DEFAULT_PAGE_SIZES, initial: 20 };
  return ['welding_wires', 'certifications'].includes(key) ? { sizes: LONG_CATALOG_PAGE_SIZES, initial: 25 } : { sizes: CATALOG_PAGE_SIZES, initial: 20 };
}

/** A standard defect code is locked: shown with a lock and never edited or deleted (availability per site stays possible). */
export const isLockedRecord = (key: string, row: Pick<Row, 'id'> & { system?: unknown }, hosted: boolean) => hosted && key === 'ndt_defect_codes' && row.system === true;
export const LOCKED_TIP = 'This defect code cannot be changed.';
/** The norm bar of the Defect codes page: its norms and the codes a norm switches on for a site. */
export const NORM_BAR_NORMS = DEFECT_NORMS.slice(1);
export const codesOfNorm = <T extends { norm?: unknown; _archived?: boolean }>(codes: T[], norm: string) => codes.filter(code => !code._archived && code.norm === norm);

/**
 * Labels, hints, defaults and visibility the hosted profile gives a catalog field (the reference's forms). The shared
 * definitions stay as they are for the other release profiles.
 */
export function catalogField(resource: string, field: Field): Field {
  const hide = (names: string[]) => names.includes(field.name) ? { ...field, hidden: true, required: false } : field;
  switch (resource) {
    case 'weld_processes': return hide(['code', 'description']);
    case 'weld_types': return field.name === 'location' ? { ...field, default: WELD_LOCATIONS[0] } : hide(['sort', 'description']);
    case 'coatings': return hide(['description']);
    case 'ndt_processes':
      if (field.name === 'groupId') return { ...field, label: 'Method', columnLabel: 'Group', hint: undefined };
      if (field.name === 'wpr') return { ...field, label: 'Welder Performance Report (WPR)', columnLabel: 'WPR', hint: undefined };
      return field;
    case 'ndt_defect_codes': return field.name === 'group' ? { ...field, default: DEFECT_GROUPS[0], legacy: LEGACY_DEFECT_GROUPS } : field;
    case 'ndt_locations': return field.name === 'name' ? { ...field, label: 'NDT location' } : field;
    case 'pwht_locations': return field.name === 'name' ? { ...field, label: 'PWHT location' } : field;
    case 'qa_engineers': return field.name === 'companyId' ? { ...field, hidden: true, required: false } : field.name === 'company' ? { ...field, hidden: false } : field;
    default: { const override = CATALOG_FIELD_OVERRIDES[resource]?.[field.name]; return override ? { ...field, ...override } : field; }
  }
}
/** The page wording of a catalog in the hosted profile (title, add / edit / delete headings). */
export function catalogResource(resource: Resource): Resource {
  const wording = CATALOG_WORDING[resource.key];
  return wording ? { ...resource, title: wording.title, wording: { add: wording.add, edit: wording.edit, remove: wording.remove } } : resource;
}

/**
 * Fields of a shared resource that one pilot does not show: the logistics fields of a spool belong to MTO Pilot, and the
 * laydown areas and service companies they point at are not delivered to Weld Pilot (the list would read "Unavailable record").
 */
export const PILOT_HIDDEN_FIELDS: Record<string, Record<string, string[]>> = { weld: { spools: ['laydownId', 'serviceCompanyId'] } };
export function pilotResource(resource: Resource, pilot: string | undefined): Resource {
  const hidden = pilot ? PILOT_HIDDEN_FIELDS[pilot]?.[resource.key] : undefined;
  if (!hidden) return resource;
  return { ...resource, fields: resource.fields.map(field => hidden.includes(field.name) ? { ...field, hidden: true, required: false } : field), columns: resource.columns.filter(name => !hidden.includes(name)) };
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
