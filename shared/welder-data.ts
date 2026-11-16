/**
 * Welders, qualifications, material data and material certificates (Weld Pilot / MTO Pilot, hosted profile).
 * Pure logic and tables only: no imports from the resource registry, so `resources.ts`, `release.ts`,
 * `permissions.ts` and `welding.ts` can all read from it.
 */
import type { Field, Row } from './types.ts';
import type { Relation } from './welding.ts';

type SiteLike = Record<string, unknown> | undefined | null;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();

// ---------------------------------------------------------------------------------------------------------
// Standard designations used by the option lists.
// ---------------------------------------------------------------------------------------------------------
/** ISO/TR 15608 material groups (1.1 … 11.3). */
export const ISO_15608_GROUPS = ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '3.1', '3.2', '3.3', '4.1', '4.2', '5.1', '5.2', '5.3', '5.4', '6.1', '6.2', '6.3', '6.4', '7.1', '7.2', '7.3', '8.1', '8.2', '8.3', '9.1', '9.2', '9.3', '10.1', '10.2', '11.1', '11.2', '11.3'];
/** ASME BPVC section IX base-metal P-Numbers. */
export const ASME_P_NUMBERS = ['P-1', 'P-3', 'P-4', 'P-5A', 'P-5B', 'P-5C', 'P-6', 'P-7', 'P-8', 'P-9A', 'P-9B', 'P-10H', 'P-11A', 'P-15E', 'P-21', 'P-41'];
export const ASME_GROUP_NUMBERS = ['1', '2', '3', '4', '5'];
/** EN 10204 inspection document types. */
export const CERT_TYPES = ['2.1', '2.2', '3.1', '3.2'];
/** Welding positions: EN ISO 6947 (groove and fillet) and ASME IX. */
export const WELD_POSITIONS = ['PA', 'PB', 'PC', 'PD', 'PE', 'PF', 'PG', 'H-L045', 'J-L045', '1G', '2G', '3G', '4G', '5G', '6G', '1F', '2F', '3F', '4F'];
export const WELD_KINDS = ['BW', 'FW'];
export const STANDARD_SYSTEMS = ['ASME', 'EN'];
/** Notify days of a qualification or document that has none of its own. */
export const DEFAULT_NOTIFY_DAYS = 30;

// ---------------------------------------------------------------------------------------------------------
// Registry data read by resources.ts / release.ts / permissions.ts / welding.ts.
// ---------------------------------------------------------------------------------------------------------
/** Project links of material certificates and welding wires (multi-select, like WPS projects). */
export const WELDER_DATA_RELATIONS: Record<string, Relation[]> = {
  certifications: [{ field: 'projectIds', label: 'Linked projects', resource: 'certificate_projects', ownerKey: 'certificateId', target: 'projects', targetKey: 'projectId', showIf: ['allProjects', false] }],
  welding_wires: [{ field: 'projectIds', label: 'Linked projects', resource: 'wire_projects', ownerKey: 'wireId', target: 'projects', targetKey: 'projectId', showIf: ['allProjects', false] }],
};
export const WELDER_DATA_SCOPES: Record<string, string[]> = { certificate_projects: ['18'], wire_projects: ['99'] };

const names = (value: string) => value.split(' ');
/** Menu pages delivered to the hosted profile: resource -> delivered fields. */
export const WELDER_DATA_PAGES: Record<string, string[]> = {
  welders: names('number name welderCode companyId roleId status currentlyOn globallyDeployable combination welder1Id welder2Id address zip residence phone email dob description siteIds customIds'),
  roles: names('name abbreviation maxTasks leadRole'),
  certificate_types: names('name abbreviation'),
  welder_customs_catalog: names('name abbreviation diameterFrom diameterTo wtFrom wtTo'),
  diameters: names('diameter size sizeinch outline sorting'),
  material_parts: names('name custom'),
  material_types: names('name typeOfSteel materialDescription basicMaterial materialGroup lucefinGroup iso15608 asmePNumber asmeGroup isoAsme'),
  welding_wires: names('name classification diameter chargeNo description materialTypeId norm certType attestNo supplierId allProjects controlled accepted projectIds'),
  certifications: names('name indexNo chargeNo certType materialId materialTypeId materialPartId basicMaterial diameter schedule wallThickness hotYield impactStrength supplierId allProjects controlled accepted description projectIds'),
};
/** Resources delivered without a menu page of their own. */
export const WELDER_DATA_RECORDS: Record<string, string[]> = {
  welder_certificates: names('name welderId certificateTypeId processId standard issuedAt expiresAt description customId wireId position weldKind system diameterFrom diameterTo thicknessFrom thicknessTo notifyDays notify isDocument'),
  welder_sites: names('welderId siteId ownerArchived'),
  welder_customs: names('welderId customId ownerArchived'),
  certificate_projects: names('certificateId projectId ownerArchived'),
  wire_projects: names('wireId projectId ownerArchived'),
};

/** Labels of the reference where they differ from the labels of the shared definitions. */
export const HOSTED_LABELS: Record<string, Record<string, string>> = {
  welders: { number: 'ID nr.', name: 'Name', welderCode: 'Welder ID Nr.', zip: 'Zip code', residence: 'Residence', email: 'Email address', status: 'Active', dob: 'Date of birth', description: 'Note' },
  roles: { name: 'Role' },
  diameters: { sorting: 'Sorting' },
  material_parts: { name: 'Part' },
  material_types: { name: 'Type of material' },
  welding_wires: { name: 'Index number', classification: 'Rod type', diameter: 'mm', certType: 'Certificate-type', description: 'Note' },
  certifications: { name: 'Attest number', chargeNo: 'Charge number', certType: 'Certificate-type', materialId: 'Material No', diameter: 'Diameter', description: 'Note' },
  welder_certificates: { name: 'Name', certificateTypeId: 'Certificate', processId: 'Weld process' },
  // Punch lists → Add item (capture of 2026-11-16): the category select is "Type", the isometric select "ISO".
  punchlists: { category: 'Type', isoId: 'ISO' },
  // MTO Pilot catalogs (captures mto.md → Logistic, weld-catalogs.md → Material supplier).
  suppliers: { name: 'Name', zip: 'Zip code', residence: 'Residence', email: 'Email address' },
  service_companies: { name: 'Name', email: 'Email address' },
  laydowns: { name: 'Laydown' },
  warehouses: { name: 'Storehouse name' },
  material_laydowns: { name: 'Laydown' },
  // Hydrotest release (capture weld-catalogs / hydrotest): the test system's name is "Test system"; Defect codes column "ISO 6520-1".
  test_systems: { name: 'Test system' },
  ndt_defect_codes: { isoRef: 'ISO 6520-1' },
};
/** List columns of the reference (labels come from the fields above). */
export const HOSTED_COLUMNS: Record<string, string[]> = {
  roles: ['name', 'abbreviation', 'maxTasks', 'leadRole'],
  certificate_types: ['name', 'abbreviation'],
  welder_customs_catalog: ['name', 'abbreviation'],
  diameters: ['diameter', 'size', 'sizeinch', 'outline', 'sorting'],
  material_parts: ['name', 'custom'],
  material_types: ['name', 'typeOfSteel', 'materialDescription', 'basicMaterial', 'materialGroup', 'isoAsme'],
  welding_wires: ['name', 'chargeNo', 'classification', 'materialTypeId', 'diameter', 'certType', 'attestNo', 'supplierId', 'controlled', 'accepted'],
  certifications: ['indexNo', 'chargeNo', 'certType', 'name', 'materialId', 'materialTypeId', 'materialPartId', 'basicMaterial', 'diameter', 'schedule', 'wallThickness', 'supplierId', 'controlled', 'accepted'],
  suppliers: ['name', 'address', 'email', 'phone'],
};
/** Required in the hosted profile (the shared definitions stay as they were for the other profiles). */
export const HOSTED_REQUIRED: Record<string, [string, string][]> = {
  roles: [['abbreviation', 'Abbreviation']],
  certificate_types: [['abbreviation', 'Abbreviation']],
  welder_customs_catalog: [['abbreviation', 'Abbreviation']],
  diameters: [['size', 'Size in mm']],
  material_types: [['typeOfSteel', 'Type of steel']],
};
/** Qualification-only fields: a welder document ("Summary list") has none of them (see `isDocument`). */
const QUALIFICATION_ONLY = names('certificateTypeId processId standard issuedAt customId wireId position weldKind system diameterFrom diameterTo thicknessFrom thicknessTo');
/** Further changes of the hosted profile to a field of the shared definitions (reference defaults, placeholders, visibility). */
export const HOSTED_FIELD_OVERRIDES: Record<string, Record<string, Partial<Field>>> = {
  // Add welder: no Role (every welder gets the Welder role), Welder 1 / Welder 2 only while Combination is ticked.
  welders: {
    roleId: { hidden: true }, companyId: { blank: '---- Without company ----' },
    welder1Id: { showIf: ['combination', true], blank: '--------', refDisplay: 'numberName' }, welder2Id: { showIf: ['combination', true], blank: '--------', refDisplay: 'numberName' },
  },
  // Add welder custom: the four range inputs open with 0.00 (0.00 to 0.00 means "no range", see `pick` in `effectiveRange`).
  welder_customs_catalog: Object.fromEntries(['diameterFrom', 'diameterTo', 'wtFrom', 'wtTo'].map(name => [name, { default: '0.00' }])),
  welder_certificates: { notifyDays: { label: 'Notify (days)' }, notify: { label: 'Notify before it expires' }, ...Object.fromEntries(QUALIFICATION_ONLY.map(name => [name, { showIf: ['isDocument', false] as [string, boolean] }])) },
};
/** The reference label, required flag and group of a field of the shared definitions as the hosted profile shows them. */
export function hostedField(resource: string, field: Field): Field {
  const label = HOSTED_LABELS[resource]?.[field.name];
  const required = HOSTED_REQUIRED[resource]?.some(([name]) => name === field.name);
  const grouped = field.name === 'allProjects' ? { section: 'Links & availability' } : {};
  const override = HOSTED_FIELD_OVERRIDES[resource]?.[field.name];
  if (!label && !required && !override && !Object.keys(grouped).length) return field;
  const result: Field = { ...field, ...(label ? { label } : {}), ...(required ? { required: true } : {}), ...grouped, ...override };
  return result;
}

/** Order of the Add / Edit welder form in the reference (names of fields and of the relation fields). The rest follows. */
export const HOSTED_FORM_ORDER: Record<string, string[]> = {
  welders: names('number name welderCode address zip residence phone email status companyId welder1Id welder2Id dob currentlyOn siteIds globallyDeployable combination'),
};
/**
 * Put form fields (or relation fields) of the hosted profile in the reference order of a resource; fields it does not
 * name keep their order after those it does. The reference form is one flat list, so the fields lose their sections.
 */
export function orderFormFields<T extends { name: string; section?: string }>(resource: string, fields: T[]): T[] {
  const order = HOSTED_FORM_ORDER[resource];
  if (!order) return fields;
  const rank = (name: string) => { const index = order.indexOf(name); return index < 0 ? order.length : index; };
  return fields.map((field, position) => ({ field, position })).sort((a, b) => rank(a.field.name) - rank(b.field.name) || a.position - b.position).map(({ field }) => { const { section: _section, ...flat } = field; return flat as T; });
}

// ---------------------------------------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------------------------------------
/** "ISO / ASME" column of a type of material, e.g. `1.1 / P-1`. */
export const isoAsmeLabel = (row: Record<string, unknown>) => [text(row.iso15608), text(row.asmePNumber) && `${text(row.asmePNumber)}${text(row.asmeGroup) ? ` Gr ${text(row.asmeGroup)}` : ''}`].filter(Boolean).join(' / ');

/** Next four-digit index number after the numeric ones already in use (`0001`, `0002`, …); other formats are ignored. */
export function nextIndexNumber(used: unknown[]): string {
  const highest = used.map(value => /^\d{1,9}$/.test(text(value)) ? Number(text(value)) : 0).reduce((max, value) => Math.max(max, value), 0);
  return String(highest + 1).padStart(4, '0');
}

const number = (value: unknown): number | null => { const raw = text(value).replace(',', '.'); if (!raw) return null; const parsed = Number(raw); return Number.isFinite(parsed) ? parsed : null; };

/** Range of a qualification custom: from / to must be numbers and from may not exceed to. Returns field errors. */
export function rangeErrors(row: Record<string, unknown>, pairs: [string, string, string][]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [fromName, toName, label] of pairs) {
    const from = number(row[fromName]), to = number(row[toName]);
    if (text(row[fromName]) && from === null) errors[fromName] = `${label} from must be a number.`;
    if (text(row[toName]) && to === null) errors[toName] = `${label} to must be a number.`;
    if (from !== null && to !== null && from > to) errors[toName] = `${label} to must not be smaller than ${label.toLowerCase()} from.`;
  }
  return errors;
}
export const CUSTOM_RANGES: [string, string, string][] = [['diameterFrom', 'diameterTo', 'Diameter'], ['wtFrom', 'wtTo', 'Wall thickness']];
export const QUALIFICATION_RANGES: [string, string, string][] = [['diameterFrom', 'diameterTo', 'Diameter'], ['thicknessFrom', 'thicknessTo', 'Thickness']];

/** Missing required values of the hosted profile for a resource (merged record). */
export function hostedRequiredErrors(resource: string, merged: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [name, label] of HOSTED_REQUIRED[resource] || []) if (!text(merged[name])) errors[name] = `${label} is required.`;
  return errors;
}

// ---------------------------------------------------------------------------------------------------------
// Expire warnings
// ---------------------------------------------------------------------------------------------------------
export interface ExpireWarning {
  id: string; welderId: string; welder: string; qualification: string; expiresAt: string;
  /** Negative when expired. */
  days: number; status: 'expired' | 'expiring'; message: string;
  /** The line of the top bar list: `W01 Custom - 141|FM1-FM2|ISO9606-1 · 04.04.2024 Expired`. */
  text: string;
}
const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
export const todayIso = () => new Date().toISOString().slice(0, 10);
/** dd.mm.yyyy, the date format of the warnings. */
export const warningDate = (iso: string) => /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso;

/** One line naming a qualification: custom or certificate type, process, standard (like `W01 Custom - 141|FM1-FM2|ISO9606-1/NEN3650`). */
export function qualificationLabel(certificate: Row, lookups: { custom?: Row; type?: Row; process?: Row } = {}): string {
  const first = text(lookups.custom?.abbreviation) || text(lookups.custom?.name) || text(lookups.type?.abbreviation) || text(lookups.type?.name);
  return [text(certificate.name), first, text(lookups.process?.name), text(certificate.standard)].filter(Boolean).join(' | ');
}
export const expireMessage = (days: number) => days < 0 ? 'Expired' : days === 0 ? 'Expires today' : `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
/** Days before the expiry from which a qualification or document is warned about (its own "Notify (days)", else 30). */
export function notifyDays(certificate: Row): number {
  const own = number(certificate.notifyDays);
  return own === null || own < 0 ? DEFAULT_NOTIFY_DAYS : Math.floor(own);
}
/** Notifications are on unless the record says otherwise (records saved before the switch existed are on). */
export const notificationsOn = (certificate: Row) => certificate.notify !== false;
/** What the top bar calls a qualification or document: `Custom - <custom name>` for a qualification of a custom, else its own name. */
export const warningName = (certificate: Row, custom?: Row) => custom ? `Custom - ${text(custom.name)}` : text(certificate.name);

/**
 * Welder qualifications and documents (welder certificates with an expiry date) that are expired, or expire within
 * their own "Notify (days)", while their notifications are on. Archived records and archived or inactive welders
 * are left out. Sorted by expiry date, earliest first; nothing is merged, a duplicate is listed twice.
 */
export function expiringQualifications(rows: { welders?: Row[]; welder_certificates?: Row[]; welder_customs_catalog?: Row[]; certificate_types?: Row[]; weld_processes?: Row[] }, today = todayIso()): ExpireWarning[] {
  const welders = new Map((rows.welders || []).filter(row => !row._archived && row.status !== 'Inactive').map(row => [row.id, row]));
  const find = (list: Row[] | undefined, id: unknown) => (list || []).find(row => row.id === id);
  const now = dayNumber(today);
  const result: ExpireWarning[] = [];
  for (const certificate of rows.welder_certificates || []) {
    const expiresAt = text(certificate.expiresAt), welder = welders.get(String(certificate.welderId));
    if (certificate._archived || !welder || !notificationsOn(certificate) || !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) continue;
    const days = dayNumber(expiresAt) - now;
    if (days > notifyDays(certificate)) continue;
    const message = expireMessage(days);
    result.push({ id: certificate.id, welderId: welder.id, welder: [text(welder.number), text(welder.name)].filter(Boolean).join(' | '), qualification: qualificationLabel(certificate, { custom: find(rows.welder_customs_catalog, certificate.customId), type: find(rows.certificate_types, certificate.certificateTypeId), process: find(rows.weld_processes, certificate.processId) }), expiresAt, days, status: days < 0 ? 'expired' : 'expiring', message,
      text: `${[text(welder.number), warningName(certificate, find(rows.welder_customs_catalog, certificate.customId))].filter(Boolean).join(' ')} · ${warningDate(expiresAt)} ${message}` });
  }
  return result.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.welder.localeCompare(b.welder));
}

// ---------------------------------------------------------------------------------------------------------
// Filter welders by qualification
// ---------------------------------------------------------------------------------------------------------
export interface WelderQualificationFilter { wireId: string; processId: string; diameterId: string; thickness: string; position: string; weldKind: string; system: string; }
export const NO_WELDER_FILTER: WelderQualificationFilter = { wireId: '', processId: '', diameterId: '', thickness: '', position: '', weldKind: '', system: '' };
export const welderFilterCount = (filter: WelderQualificationFilter) => Object.values(filter).filter(value => text(value)).length;

/** Effective range of a qualification: its own bounds, else those of its custom; null when neither states one (0.00 to 0.00, the form's default, states none). */
function effectiveRange(certificate: Row, custom: Row | undefined, own: [string, string], inherited: [string, string]): [number | null, number | null] | null {
  const pick = (row: Row | undefined, [from, to]: [string, string]): [number | null, number | null] | null => { const pair: [number | null, number | null] = [number(row?.[from]), number(row?.[to])]; return pair[0] === null && pair[1] === null || pair[0] === 0 && pair[1] === 0 ? null : pair; };
  return pick(certificate, own) ?? pick(custom, inherited);
}
const inRange = (range: [number | null, number | null] | null, value: number) => range !== null && (range[0] === null || value >= range[0]) && (range[1] === null || value <= range[1]);

/**
 * Welders with at least one valid (not archived, not expired) qualification that satisfies every chosen criterion.
 * Diameter and thickness match the qualification's range (its own, else its custom's); a qualification that
 * states no range does not match a diameter or thickness criterion.
 */
export function filterWelders(welders: Row[], rows: { welder_certificates?: Row[]; welder_customs_catalog?: Row[]; diameters?: Row[] }, filter: WelderQualificationFilter, today = todayIso()): Row[] {
  if (!welderFilterCount(filter)) return welders;
  const diameter = filter.diameterId ? number((rows.diameters || []).find(row => row.id === filter.diameterId)?.size) : null;
  if (filter.diameterId && diameter === null) return [];
  const thickness = number(filter.thickness);
  if (text(filter.thickness) && thickness === null) return [];
  const qualified = new Set<string>();
  for (const certificate of rows.welder_certificates || []) {
    if (certificate._archived) continue;
    const expiresAt = text(certificate.expiresAt); if (expiresAt && expiresAt < today) continue;
    const custom = (rows.welder_customs_catalog || []).find(row => row.id === certificate.customId);
    if (filter.wireId && certificate.wireId !== filter.wireId) continue;
    if (filter.processId && certificate.processId !== filter.processId) continue;
    if (filter.position && certificate.position !== filter.position) continue;
    if (filter.weldKind && certificate.weldKind !== filter.weldKind) continue;
    if (filter.system && certificate.system !== filter.system) continue;
    if (diameter !== null && !inRange(effectiveRange(certificate, custom, ['diameterFrom', 'diameterTo'], ['diameterFrom', 'diameterTo']), diameter)) continue;
    if (thickness !== null && !inRange(effectiveRange(certificate, custom, ['thicknessFrom', 'thicknessTo'], ['wtFrom', 'wtTo']), thickness)) continue;
    qualified.add(String(certificate.welderId));
  }
  return welders.filter(welder => qualified.has(welder.id));
}

/** Welders list tabs: Active, Inactive (status) and Deleted (archived). */
export type WelderTab = 'active' | 'inactive' | 'deleted';
export const welderTab = (welder: Row): WelderTab => welder._archived ? 'deleted' : welder.status === 'Inactive' ? 'inactive' : 'active';
export const welderTabCounts = (welders: Row[]): Record<WelderTab, number> => welders.reduce((counts, welder) => { counts[welderTab(welder)]++; return counts; }, { active: 0, inactive: 0, deleted: 0 });
/** Rows per page of the Welders list (reference: 10, 25, 50, 100; 25 is the default). */
export const WELDER_PAGE_SIZES = [10, 25, 50, 100];
export const DEFAULT_WELDER_PAGE_SIZE = 25;
/** "Active" column: Yes / No. */
export const activeText = (welder: Row) => welder.status === 'Inactive' ? 'No' : 'Yes';
/** "Role" column: the role's abbreviation, else its name. */
export const roleText = (role?: Row) => text(role?.abbreviation) || text(role?.name);
/** Welder 1 / Welder 2 options: `<ID nr.> <Name>`, the ID nr. alone when the welder has no name. */
export const welderOptionLabel = (welder: Row) => [text(welder.number), text(welder.name)].filter(Boolean).join(' ');
/** The welders list opens on the active main project (empty: all). */
export const defaultWelderSite = (siteId: string | undefined) => siteId || '';
/** A welder is on a main project when it is globally deployable or active on it; an empty project shows all welders. */
export const welderOnSite = (welder: Row, linkedSiteIds: string[], siteId: string) => !siteId || welder.globallyDeployable === true || linkedSiteIds.includes(siteId);
/** The Welder role (abbreviation WE) is the one role of WeldPilot; it cannot be deleted. */
export const isWelderRole = (role: Row) => text(role.name).toLowerCase() === 'welder';


// ---------------------------------------------------------------------------------------------------------
// Material certificates
// ---------------------------------------------------------------------------------------------------------
/** What a certificate must have when "Mandatory fields" is on, in the order of the reference. */
export const CERTIFICATE_MANDATORY: [string, string][] = [['chargeNo', 'Charge number'], ['diameter', 'Diameter'], ['materialPartId', 'Material part'], ['materialTypeId', 'Type of material'], ['schedule', 'Schedule'], ['wallThickness', 'Wall thickness'], ['certType', 'Certificate type']];

/**
 * Main projects (sites) a certificate or wire applies to: every site for "all projects", otherwise the sites of
 * its linked projects. `projectIds` are the linked projects.
 */
export function linkedSites(allProjects: unknown, projectIds: string[], projects: Row[], sites: Row[]): Row[] {
  if (allProjects !== false) return sites.filter(site => !site._archived);
  const siteIds = new Set(projects.filter(project => projectIds.includes(project.id)).map(project => String(project.siteId)));
  return sites.filter(site => !site._archived && siteIds.has(site.id));
}
/** Missing fields of a certificate when any main project it applies to has "Mandatory fields" on. Empty when none does. */
export function certificateMandatoryErrors(merged: Record<string, unknown>, projectIds: string[], projects: Row[], sites: Row[]): Record<string, string> {
  if (!linkedSites(merged.allProjects, projectIds, projects, sites).some(site => site.mandatoryFields === true)) return {};
  const errors: Record<string, string> = {};
  for (const [name, label] of CERTIFICATE_MANDATORY) if (!text(merged[name])) errors[name] = `${label} is required for a project with mandatory fields.`;
  return errors;
}
export const certificateLinkedToProject = (certificate: Row, linkedProjectIds: string[], projectId: string) => certificate.allProjects !== false || linkedProjectIds.includes(projectId);

/**
 * Certificates the weld form offers for a project. With "Project-specific Material Certificates" on for the
 * main project, only certificates linked to the project (or to all projects); otherwise every active one.
 * `links` are the rows of `certificate_projects`.
 */
export function certificatesForProject(args: { certificates: Row[]; links: Row[]; projectId: string; site?: SiteLike }): Row[] {
  const active = args.certificates.filter(certificate => !certificate._archived);
  if (args.site?.projectCertificates !== true) return active;
  const linked = new Set(args.links.filter(link => !link._archived && link.projectId === args.projectId).map(link => String(link.certificateId)));
  return active.filter(certificate => certificate.allProjects !== false || linked.has(certificate.id));
}
/** Project filter of the certifications and welding wire lists. `links` are the rows of the matching link resource. */
export function linkedToProject(row: Row, links: Row[], ownerKey: string, projectId: string): boolean {
  return row.allProjects !== false || links.some(link => !link._archived && link[ownerKey] === row.id && link.projectId === projectId);
}
