import { DEFECT_NORMS } from './site-settings.ts';
import { isStandardDefectCode } from './defect-codes.ts';
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
export const WELD_CATALOG_RESOURCES = ['weld_processes', 'weld_types', 'coatings', 'ndt_groups', 'ndt_processes', 'ndt_defect_codes', 'ndt_locations', 'pwht_processes', 'pwht_locations', 'qa_engineers', 'companies', 'attachment_names', 'spool_names'];
/** Catalogs that carry "Enabled on this site". Suppliers, service companies and laydowns only gain the enablement. */
export const SITE_ENABLED_RESOURCES = ['weld_types', 'coatings', 'ndt_processes', 'ndt_defect_codes', 'ndt_locations', 'pwht_processes', 'pwht_locations', 'qa_engineers', 'suppliers', 'service_companies', 'laydowns', 'material_laydowns', 'materials', 'spool_names', 'diameters'];
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
 * reference ticks nothing; the client asked for the same box on Material supplier, Service companies, Laydown areas and
 * Laydown materials (a new record starts switched off, ticking the box switches it on at once). On every other catalog the
 * availability is changed only through Options.
 */
export const FORM_ENABLEMENT: Record<string, boolean> = { ndt_processes: false, qa_engineers: false, coatings: false, spool_names: false, suppliers: false, service_companies: false, laydowns: false, material_laydowns: false, diameters: true };
export const formEnablement = (key: string) => Object.hasOwn(FORM_ENABLEMENT, key);
/**
 * Catalogs whose new records a user adds switched off on every main project until the Add form's box is ticked or
 * Options -> Activate selected is used (hosted profile; the sample data and the demo copy keep "no link = enabled").
 * Service companies, laydown areas and laydown materials joined the list on the client's answer of 17.11.2026; records that exist keep their state. Weld types are not in the list: their form has no box and their lists show every type as enabled.
 */
export const NEW_RECORDS_OFF = ['ndt_processes', 'qa_engineers', 'coatings', 'ndt_defect_codes', 'ndt_locations', 'pwht_processes', 'pwht_locations', 'suppliers', 'service_companies', 'laydowns', 'material_laydowns', 'materials', 'spool_names', 'diameters'];
/**
 * Catalog forms with a File input inside the dialog, and the field it follows (the NDT process dialog lists File after Method;
 * the welding wire form keeps its own placement). The chosen file is attached to the record once it is saved.
 */
export const FORM_FILE_AFTER: Record<string, string> = { ndt_processes: 'groupId' };
export const FORM_FILE_LABEL = 'File';
/** The labels of a catalog form in order: its visible fields, the File input where the dialog puts it, the enablement box last. */
export function catalogFormLabels(key: string, fields: Pick<Field, 'name' | 'label' | 'hidden'>[], siteName?: string): string[] {
  const labels: string[] = [];
  for (const field of fields.filter(item => !item.hidden)) { labels.push(field.label); if (FORM_FILE_AFTER[key] === field.name) labels.push(FORM_FILE_LABEL); }
  if (formEnablement(key) && siteName) labels.push(enableLabel(siteName));
  return labels;
}
/**
 * The selects of these catalogs offer every record, whatever "Enabled on this site" says (the list column and Options stay).
 * Materials: the site link narrows only the Material database, its import and the add lists (shared/material-sites.ts); lines,
 * orders, stock and certificates keep pointing at any material, so no reference to one is refused for its site.
 */
export const UNFILTERED_OPTIONS = ['pwht_processes', 'pwht_locations', 'materials'];

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
  spool_names: ['name'],
};
/**
 * Fields the reference marks as required that the hosted profile enforces (client and server). The shared
 * resource keeps them optional so the other release profiles and the CSV / prototype imports behave as before.
 */
/**
 * The Company of a QA/QC engineer as the hosted profile shows it (list, form, exports): the stored Company text, else the
 * name of the company record an older engineer is linked to. Derived when read; nothing is written back.
 */
export const qaEngineerCompany = (engineer: { readonly [name: string]: unknown }, companyName: (id: string) => string | undefined) =>
  String(engineer.company ?? '').trim() || (engineer.companyId ? companyName(String(engineer.companyId)) ?? '' : '');
export const HOSTED_REQUIRED: Record<string, string[]> = {
  weld_types: ['location', 'abbreviation'],
  coatings: ['abbreviation'],
  ndt_processes: ['description'],
  pwht_processes: ['description'],
  qa_engineers: ['company'],
  companies: ['address'],
  sites: ['address'],
  profiles: ['description'],
};
const FIELD_LABELS: Record<string, Record<string, string>> = {
  ndt_groups: { description: 'Description' }, diameters: { sizeinch: 'Size in inches' },
  weld_types: { location: 'Shop/Field', abbreviation: 'Abbreviation', jointType: 'Joint type' }, coatings: { abbreviation: 'Abbreviation' }, ndt_processes: { description: 'Description' },
  pwht_processes: { description: 'Description' }, qa_engineers: { company: 'Company' }, companies: { address: 'Address' }, sites: { address: 'Address' }, profiles: { description: 'Description' },
};
/**
 * The reference's Edit dialogs differ from its Add dialogs (weld__*__edit.txt against the add dialogs): a few fields are required
 * only when a record is edited, one is optional, two carry another label and the wire form lists Accepted before Controlled.
 * Add is not changed. The browser applies the overrides (`editFields`); the server applies the required lists on an update only.
 */
export const EDIT_REQUIRED: Record<string, string[]> = { weld_types: ['jointType'], ndt_groups: ['description'], diameters: ['sizeinch'] };
/** Fields the reference's Edit dialog does not require although its Add dialog does (the server relaxes them on an update only). */
export const EDIT_OPTIONAL: Record<string, string[]> = { wps: ['method'] };
export const EDIT_FIELD_OVERRIDES: Record<string, Record<string, Partial<Field>>> = {
  roles: { name: { label: 'Function' } },
  weld_types: { jointType: { required: true }, grooveType: { label: 'Groove shape' } },
  ndt_groups: { description: { required: true } },
  // Size in inches and Outline in mm are number inputs in the Edit dialog (Size in mm stays text with a decimal comma).
  diameters: { sizeinch: { required: true, decimal: false }, outline: { decimal: false } },
  // Edit project site no longer has the ISO Book tab (client change list 22.11.2026, image 8): the ISO Book is standard.
};
/** [field, before]: the Edit dialog lists `field` ahead of `before` (welding wire: Accepted, then Controlled). */
export const EDIT_FIELD_ORDER: Record<string, [string, string]> = { welding_wires: ['accepted', 'controlled'] };
/** The fields of a resource as its Edit dialog shows them (the hosted profile only; Add keeps `fields`). */
export function editFields<T extends Field>(resource: string, fields: T[]): T[] {
  const overrides = EDIT_FIELD_OVERRIDES[resource];
  const changed = overrides ? fields.map(field => overrides[field.name] ? { ...field, ...overrides[field.name] } : field) : fields;
  const order = EDIT_FIELD_ORDER[resource];
  if (!order) return changed;
  const from = changed.findIndex(field => field.name === order[0]), to = changed.findIndex(field => field.name === order[1]);
  if (from < 0 || to < 0 || from < to) return changed;
  const next = [...changed]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
  return next;
}
/** Messages of the required fields a hosted write leaves empty, by field name. Empty when nothing is missing. */
export function missingRequired(key: string, input: Record<string, unknown>, existing?: Row): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const name of [...(HOSTED_REQUIRED[key] || []), ...(existing ? EDIT_REQUIRED[key] || [] : [])]) {
    // An older QA/QC engineer without Company text shows its linked company (qaEngineerCompany): that counts as filled.
    const value = Object.hasOwn(input, name) ? input[name] : key === 'qa_engineers' && name === 'company' && existing && !String(existing.company ?? '').trim() ? existing.companyId : existing?.[name];
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
 * The defect codes a site may select for a rejected NDT result (NA "Defect type"): the codes switched on for the main
 * project under Defect codes, whatever their norm. Saving a Defect norm on the project site switches that norm's codes
 * on (server/weld-catalogs.ts); with no norm the list stays as it is. A code already stored on the weld (`keep`, the
 * code text) is always listed, switched on or not, so an older result keeps showing its code. One entry per code text.
 */
export function selectableDefectCodes(rows: Rows, site: Record<string, unknown> | null | undefined, siteId: string | undefined | null = (site as Row | undefined)?.id, keep?: unknown): Row[] {
  const stored = new Set((Array.isArray(keep) ? keep : [keep]).map(value => String(value ?? '').trim()).filter(Boolean));
  const listed = (rows.ndt_defect_codes || []).filter(code => !code._archived && (stored.has(String(code.code)) || enabledOnSite('ndt_defect_codes', code, siteId, rows)))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'en', { numeric: true }));
  return listed.filter((code, index) => listed.findIndex(other => other.code === code.code) === index);
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
  // The groups page: the reference's add button and dialog reuse the process wording (weld__ndt__process-groups.txt:47,187,193).
  ndt_groups: { title: 'NDT process groups', add: 'Add NDT process', edit: 'Edit NDT process group', remove: 'Delete NDT process group' },
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
  // Weld Pilot → Weld data → Spools and MTO Pilot → Materials → Spools (weld__welddata__spools.txt: Add spool, Edit spool, Delete spool).
  spool_names: { title: 'Spools', add: 'Add spool', edit: 'Edit spool', remove: 'Delete spool' },
};
/**
 * Catalog pages whose row action reads "Delete" and asks "Are you sure?" in the hosted profile, as the reference does.
 * Underneath the record is archived (it can be restored from the Archived tab), exactly as welds are.
 */
export const DELETE_WORDING_RESOURCES = [...Object.keys(CATALOG_WORDING), 'diameters', 'material_parts', 'material_types', 'suppliers', 'welding_wires', 'certifications', 'uoms'];
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

/** A standard defect code (shared/defect-codes.ts) is locked: shown with a lock and never edited or deleted (availability per site stays possible). */
export const isLockedRecord = (key: string, row: Pick<Row, 'id'> & { system?: unknown; code?: unknown; norm?: unknown }, hosted: boolean) => hosted && key === 'ndt_defect_codes' && isStandardDefectCode(row);
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
/** Page titles the hosted profile words differently from the shared definition (breadcrumb, headings): the PQR page is "PQR". */
export const HOSTED_TITLES: Record<string, string> = { pqr: 'PQR' };
/** The page wording of a catalog in the hosted profile (title, add / edit / delete headings). */
export function catalogResource(resource: Resource): Resource {
  const wording = CATALOG_WORDING[resource.key], title = HOSTED_TITLES[resource.key];
  const titled = title ? { ...resource, title } : resource;
  return wording ? { ...titled, title: wording.title, wording: { add: wording.add, edit: wording.edit, remove: wording.remove } } : titled;
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
