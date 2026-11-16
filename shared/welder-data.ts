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
/** ISO/TR 15608 material groups offered by the type of material form (1.1 … 11.1, as the reference lists them). */
export const ISO_15608_GROUPS = ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '3.1', '3.2', '3.3', '4.1', '4.2', '5.1', '5.2', '5.3', '5.4', '6.1', '6.2', '6.3', '6.4', '7.1', '7.2', '7.3', '8.1', '8.2', '8.3', '9.1', '9.2', '9.3', '10.1', '10.2', '10.3', '11.1'];
/** ASME BPVC section IX base-metal P-Numbers offered by the type of material form (and by the WPS form). */
export const ASME_P_NUMBERS = ['P-1', 'P-3', 'P-4', 'P-5A', 'P-5B', 'P-5C', 'P-6', 'P-7', 'P-8', 'P-9A', 'P-9B', 'P-10A', 'P-10H', 'P-10I', 'P-15E', 'P-34'];
export const ASME_GROUP_NUMBERS = ['1', '2', '3', '4', '5'];
/** EN 10204 inspection document types. */
export const CERT_TYPES = ['2.1', '2.2', '3.1', '3.2'];
/** Welding positions: EN ISO 6947 (groove and fillet) and ASME IX. */
export const WELD_POSITIONS = ['PA', 'PB', 'PC', 'PD', 'PE', 'PF', 'PG', 'H-L045', 'J-L045', '1G', '2G', '3G', '4G', '5G', '6G', '1F', '2F', '3F', '4F'];
export const WELD_KINDS = ['BW', 'FW'];
export const STANDARD_SYSTEMS = ['ASME', 'EN'];
/** Days ahead in which a qualification counts as "expires soon"; the top bar lets the user pick another window. */
export const DEFAULT_EXPIRE_WINDOW_DAYS = 30;
export const EXPIRE_WINDOWS = [30, 60, 90];

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
  suppliers: names('name address zip residence mailbox mnzip mnresidence phone fax email'),
  material_types: names('name typeOfSteel materialDescription basicMaterial materialGroup lucefinGroup iso15608 asmePNumber asmeGroup isoAsme'),
  welding_wires: names('name classification diameter chargeNo description materialTypeId typeMaterial norm certType attestNo supplierId allProjects controlled accepted projectIds'),
  certifications: names('name indexNo chargeNo certType materialId materialTypeId materialPartId basicMaterial diameter diameterId schedule wallThickness hotYield impactStrength supplierId allProjects controlled accepted description projectIds siteId'),
};
/** Resources delivered without a menu page of their own. */
export const WELDER_DATA_RECORDS: Record<string, string[]> = {
  welder_certificates: names('name welderId certificateTypeId processId standard issuedAt expiresAt description customId wireId position weldKind system diameterFrom diameterTo thicknessFrom thicknessTo'),
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
  certifications: { name: 'Attest number', chargeNo: 'Charge number', certType: 'Certificate-type', materialId: 'Material', diameter: 'Diameter', diameterId: 'Diameter', description: 'Note' },
  welder_certificates: { certificateTypeId: 'Certificate', processId: 'Weld process' },
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
  welding_wires: ['name', 'chargeNo', 'classification', 'typeMaterial', 'diameter', 'certType', 'attestNo', 'supplierId', 'controlled', 'accepted'],
  certifications: ['indexNo', 'chargeNo', 'certType', 'name', 'materialId', 'materialTypeId', 'materialPartId', 'basicMaterial', 'diameter', 'schedule', 'wallThickness', 'supplierId', 'controlled', 'accepted'],
  suppliers: ['name', 'address', 'email', 'phone'],
};
/** List headers of the reference where they differ from the form label (the list only; the forms keep the full word). */
export const HOSTED_COLUMN_LABELS: Record<string, Record<string, string>> = {
  welding_wires: { controlled: 'Ctrl.', accepted: 'Accp.' },
  certifications: { materialId: 'Material No', diameter: 'Dia.', controlled: 'Ctrl.', accepted: 'Accp.' },
};
/** Default order of a list in the hosted profile (a field name; ascending, numbers by value). The others sort by their display field. */
export const HOSTED_DEFAULT_SORT: Record<string, string> = { diameters: 'sorting' };
/** The field a list sorts by first (ascending): the reference's default order in the hosted profile, else the resource's display field. */
export const listDefaultSort = (resource: string, hosted: boolean, display: string) => (hosted && HOSTED_DEFAULT_SORT[resource]) || display;
/** Fields of the shared definitions the hosted profile does not offer (stored values stay; the server no longer delivers them). */
export const HOSTED_DROPPED_FIELDS: Record<string, string[]> = {
  material_parts: ['description'], material_types: ['description'], suppliers: ['description'], ndt_locations: ['description'], pwht_locations: ['description'],
  welding_wires: ['manufacturer', 'materialTypeId'],
};
/** Form order of the reference where it differs from the shared definitions (fields not named follow, in their own order). */
export const HOSTED_FIELD_ORDER: Record<string, string[]> = {
  suppliers: ['name', 'address', 'zip', 'residence', 'mailbox', 'mnzip', 'mnresidence', 'phone', 'fax', 'email'],
  welding_wires: ['name', 'chargeNo', 'attestNo', 'diameter', 'classification', 'typeMaterial', 'norm', 'projectIds', 'supplierId', 'certType', 'controlled', 'accepted', 'description'],
};
export function hostedFieldOrder<T extends { name: string }>(resource: string, fields: T[]): T[] {
  const order = HOSTED_FIELD_ORDER[resource];
  if (!order) return fields;
  const rank = (name: string) => { const index = order.indexOf(name); return index < 0 ? order.length : index; };
  return [...fields].sort((a, b) => rank(a.name) - rank(b.name));
}
/** Selects of the hosted profile that also take a value typed by the user (no fixed list on the server). */
export const HOSTED_FREE_VALUES: Record<string, string[]> = { material_types: ['iso15608', 'asmePNumber', 'asmeGroup'], welding_wires: ['certType'], certifications: ['certType'] };
export const hostedFreeValue = (resource: string, name: string) => Boolean(HOSTED_FREE_VALUES[resource]?.includes(name));
/** Longest value of a free select (a group or P-Number is a short designation). */
export const FREE_VALUE_MAX = 50;
/** The main-project select of a welding wire: "ALL" and the projects in one control that replaces the All projects checkbox. */
export const hostedRelation = (owner: string, relation: Relation): Relation => owner === 'welding_wires' && relation.field === 'projectIds' ? { ...relation, label: 'Project', showIf: undefined, allField: 'allProjects', section: 'Details' } : relation;
/** Lists with the "Controlled / Accepted" bulk bar (tick rows, choose Yes or No, Apply) and the fields that bar may change. */
export const FLAG_BULK_RESOURCES = ['certifications', 'welding_wires'];
export const FLAG_BULK_FIELDS = ['controlled', 'accepted'];
export const FLAG_BULK_NOUN: Record<string, string> = { certifications: 'certificates', welding_wires: 'welding wires' };
export const FLAG_BULK_MESSAGES = { pick: 'Choose Yes or No for Controlled, Accepted, or both.', tooMany: (noun: string) => `Too many ${noun}. Narrow the search or project filter first.`, failed: (noun: string) => `The ${noun} could not be updated.` };
export const FLAG_BULK_LIMIT = 500;
/** Choices of each flag in the bar (capture weld__start__dashboard.txt:8858). */
export const FLAG_CHOICES = [['', "Don't change"], ['1', 'Yes'], ['0', 'No']] as const;
/** The changes of the bar: only Controlled / Accepted set to Yes or No; null when neither is chosen. */
export function flagBulkChanges(controlled: string, accepted: string): Record<string, boolean> | null {
  const changes: Record<string, boolean> = {};
  if (controlled === '1' || controlled === '0') changes.controlled = controlled === '1';
  if (accepted === '1' || accepted === '0') changes.accepted = accepted === '1';
  return Object.keys(changes).length ? changes : null;
}
/** What a bulk change may hold: only the bar's fields, each Yes or No (true / false). */
export const flagBulkAllowed = (changes: Record<string, unknown>) => Object.keys(changes).length > 0 && Object.entries(changes).every(([name, value]) => FLAG_BULK_FIELDS.includes(name) && typeof value === 'boolean');
/** Lists with a project select in the toolbar ("All projects" and the projects of the open main project) instead of a filter in the panel. */
export const PROJECT_TOOLBAR_RESOURCES = ['certifications', 'welding_wires'];
/**
 * Fields the hosted profile keeps on the record but does not offer as inputs: the certificate's diameter text follows the
 * chosen Weld diameter, its basic material comes from the Type of material, and date / standard / material code /
 * description of material are not in the reference form. `siteId` is the main project the certificate belongs to.
 */
export const HOSTED_HIDDEN: Record<string, string[]> = {
  certifications: names('diameter basicMaterial date standard materialCode materialDescription'),
};
/** Optional in the hosted profile although the shared definition requires them (the reference form has no required mark). */
export const HOSTED_OPTIONAL: Record<string, string[]> = { certifications: ['name'] };
/** The Add certification form of the reference, in its order (capture weld__material__certifications.txt:69-118). */
export const CERTIFICATE_FORM_FIELDS = names('chargeNo name materialId diameterId materialPartId materialTypeId schedule wallThickness hotYield impactStrength certType supplierId allProjects projectIds controlled accepted description');
/** Required in the hosted profile (the shared definitions stay as they were for the other profiles). */
export const HOSTED_REQUIRED: Record<string, [string, string][]> = {
  roles: [['abbreviation', 'Abbreviation']],
  certificate_types: [['abbreviation', 'Abbreviation']],
  welder_customs_catalog: [['abbreviation', 'Abbreviation']],
  diameters: [['size', 'Size in mm']],
  material_types: [['typeOfSteel', 'Type of steel']],
};
/** The reference label, required flag and group of a field of the shared definitions as the hosted profile shows them. */
export function hostedField(resource: string, field: Field): Field {
  const label = HOSTED_LABELS[resource]?.[field.name];
  const required = HOSTED_REQUIRED[resource]?.some(([name]) => name === field.name);
  const grouped = field.name === 'allProjects' ? { section: 'Links & availability' } : {};
  const hidden = HOSTED_HIDDEN[resource]?.includes(field.name) ? { hidden: true } : {};
  const optional = HOSTED_OPTIONAL[resource]?.includes(field.name) ? { required: false } : {};
  const base: Field = label || required || Object.keys(grouped).length || Object.keys(hidden).length || Object.keys(optional).length ? { ...field, ...(label ? { label } : {}), ...(required ? { required: true } : {}), ...grouped, ...hidden, ...optional } : field;
  // The diameter catalog: Size in mm, inches and outline take a decimal comma or point (numbers on the server).
  if (resource === 'diameters' && (DIAMETER_DECIMALS as readonly string[]).includes(field.name)) return { ...base, decimal: true };
  // Type of material: group, P-Number and group number are choose-or-type; the help line sits above the three.
  if (resource === 'material_types' && hostedFreeValue(resource, field.name)) return { ...base, free: true, blank: 'Choose or type', ...(field.name === 'iso15608' ? { intro: FREE_VALUE_INTRO } : {}) };
  // Certificate-type is free text on the welding wire and the certificate (the full profile keeps its EN 10204 list).
  if (hostedFreeValue(resource, field.name) && field.name === 'certType') return { ...base, type: 'text', options: undefined };
  if (resource === 'welding_wires') {
    // The index number is generated; the project select (with ALL) replaces the checkbox; the note sits among the other fields.
    if (field.name === 'name') return { ...base, generated: true, required: false };
    if (field.name === 'allProjects') return { ...base, hidden: true };
    if (field.name === 'description') return { ...base, section: undefined };
  }
  return base;
}
export const FREE_VALUE_INTRO = 'Optional. You can leave this empty. Choose a value or type one that is not in the list.';

// ---------------------------------------------------------------------------------------------------------
// Diameter catalog (Weld Pilot → Material data → Weld diameters)
// ---------------------------------------------------------------------------------------------------------
export const DIAMETER_DECIMALS = ['size', 'sizeinch', 'outline'] as const;
export const DIAMETER_NUMBER_MESSAGE = 'Size in inch and outline in mm must be numbers.';
/**
 * A decimal typed like the reference accepts it: digits with one comma or point, a trailing one allowed (`88,9`, `0.75`, `5.`).
 * Returns the number, null for an empty value and undefined for anything else.
 */
export function parseDiameterDecimal(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const raw = String(value).trim().replace(',', '.').replace(/\.$/, '');
  if (raw === '') return null;
  return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : undefined;
}
/** The text a decimal field lets the user keep typing: digits with at most one comma or point (the reference's keep-last-valid rule). */
export const diameterDecimalTyping = (value: string) => value === '' || /^\d+([.,]\d*)?$/.test(value) || /^\d*[.,]\d+$/.test(value);
/**
 * Decimal fields of a diameter as numbers (comma → point) and the messages of those that are not numbers.
 * Only the names present in `input` are looked at; an invalid value is left out of `values`.
 */
export function diameterNumbers(input: Record<string, unknown>): { values: Record<string, number | ''>; errors: Record<string, string> } {
  const values: Record<string, number | ''> = {}, errors: Record<string, string> = {};
  for (const name of DIAMETER_DECIMALS) {
    if (!(name in input) || input[name] === undefined) continue;
    const parsed = parseDiameterDecimal(input[name]);
    if (parsed === undefined) errors[name] = name === 'size' ? 'Size in mm must be a number.' : DIAMETER_NUMBER_MESSAGE;
    else values[name] = parsed === null ? '' : parsed;
  }
  return { values, errors };
}

// ---------------------------------------------------------------------------------------------------------
// Option labels of the reference
// ---------------------------------------------------------------------------------------------------------
/** Supplier in a select (wire, certificate): the name and, when filled, the residence (`PFF BV Klundert`). */
export const supplierOptionLabel = (row: Record<string, unknown>) => [text(row.name), text(row.residence)].filter(Boolean).join(' ');
/** Type of material in a select: type / steel / description / basic material, empty parts left empty (`A234 Gr WPB/CS/Fitting/`). */
export const materialTypeOptionLabel = (row: Record<string, unknown>) => [row.name, row.typeOfSteel, row.materialDescription, row.basicMaterial].map(text).join('/');

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
}
const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** One line naming a qualification: custom or certificate type, process, standard (like `W01 Custom - 141|FM1-FM2|ISO9606-1/NEN3650`). */
export function qualificationLabel(certificate: Row, lookups: { custom?: Row; type?: Row; process?: Row } = {}): string {
  const first = text(lookups.custom?.abbreviation) || text(lookups.custom?.name) || text(lookups.type?.abbreviation) || text(lookups.type?.name);
  return [text(certificate.name), first, text(lookups.process?.name), text(certificate.standard)].filter(Boolean).join(' | ');
}
export const expireMessage = (days: number) => days < 0 ? 'Expired' : days === 0 ? 'Expires today' : `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;

/**
 * Welder qualifications (welder certificates with an expiry date) that are expired or expire within
 * `windowDays` of `today`. Archived qualifications and archived or inactive welders are left out.
 * Sorted by expiry date, earliest first.
 */
export function expiringQualifications(rows: { welders?: Row[]; welder_certificates?: Row[]; welder_customs_catalog?: Row[]; certificate_types?: Row[]; weld_processes?: Row[] }, today = todayIso(), windowDays = DEFAULT_EXPIRE_WINDOW_DAYS): ExpireWarning[] {
  const welders = new Map((rows.welders || []).filter(row => !row._archived && row.status !== 'Inactive').map(row => [row.id, row]));
  const find = (list: Row[] | undefined, id: unknown) => (list || []).find(row => row.id === id);
  const now = dayNumber(today), window = Math.max(0, Math.floor(windowDays));
  const result: ExpireWarning[] = [];
  for (const certificate of rows.welder_certificates || []) {
    const expiresAt = text(certificate.expiresAt), welder = welders.get(String(certificate.welderId));
    if (certificate._archived || !welder || !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) continue;
    const days = dayNumber(expiresAt) - now;
    if (days > window) continue;
    result.push({ id: certificate.id, welderId: welder.id, welder: [text(welder.number), text(welder.name)].filter(Boolean).join(' | '), qualification: qualificationLabel(certificate, { custom: find(rows.welder_customs_catalog, certificate.customId), type: find(rows.certificate_types, certificate.certificateTypeId), process: find(rows.weld_processes, certificate.processId) }), expiresAt, days, status: days < 0 ? 'expired' : 'expiring', message: expireMessage(days) });
  }
  return result.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.welder.localeCompare(b.welder));
}

// ---------------------------------------------------------------------------------------------------------
// Filter welders by qualification
// ---------------------------------------------------------------------------------------------------------
export interface WelderQualificationFilter { wireId: string; processId: string; diameterId: string; thickness: string; position: string; weldKind: string; system: string; }
export const NO_WELDER_FILTER: WelderQualificationFilter = { wireId: '', processId: '', diameterId: '', thickness: '', position: '', weldKind: '', system: '' };
export const welderFilterCount = (filter: WelderQualificationFilter) => Object.values(filter).filter(value => text(value)).length;

/** Effective range of a qualification: its own bounds, else those of its custom; null when neither states one. */
function effectiveRange(certificate: Row, custom: Row | undefined, own: [string, string], inherited: [string, string]): [number | null, number | null] | null {
  const pick = (row: Row | undefined, [from, to]: [string, string]): [number | null, number | null] | null => { const pair: [number | null, number | null] = [number(row?.[from]), number(row?.[to])]; return pair[0] === null && pair[1] === null ? null : pair; };
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
/**
 * Missing fields of a certificate when its main project has "Mandatory fields" on. A certificate saved before
 * certificates belonged to one main project (no `siteId`) is judged by every main project it applies to. Empty when
 * the setting is off.
 */
export function certificateMandatoryErrors(merged: Record<string, unknown>, projectIds: string[], projects: Row[], sites: Row[]): Record<string, string> {
  const owner = text(merged.siteId);
  const judged = owner ? sites.filter(site => site.id === owner) : linkedSites(merged.allProjects, projectIds, projects, sites);
  if (!judged.some(site => site.mandatoryFields === true)) return {};
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

// ---------------------------------------------------------------------------------------------------------
// One main project per certificate and welding wire (reference: the lists are per project site)
// ---------------------------------------------------------------------------------------------------------
/** Records that belong to one main project, with the link resource of their projects. */
export const SITE_OWNED: Record<string, { links: string; ownerKey: string }> = {
  certifications: { links: 'certificate_projects', ownerKey: 'certificateId' },
  welding_wires: { links: 'wire_projects', ownerKey: 'wireId' },
};
/**
 * The main projects a certificate or welding wire belongs to: its own `siteId`. A record saved before records had one
 * (derived when reading, nothing is rewritten) belongs to the main projects of its linked projects; it is `'all'` when it
 * is for all projects or links none, so it stays shared as it was until it is saved with a main project.
 */
export function ownerSites(key: string, row: Record<string, unknown>, rows: { links?: Row[]; projects?: Row[] }): string[] | 'all' {
  const own = text(row.siteId);
  if (own) return [own];
  const owned = SITE_OWNED[key];
  if (!owned || row.allProjects !== false) return 'all';
  // An archived record keeps the links archived together with it.
  const projectIds = new Set((rows.links || []).filter(link => (!link._archived || row._archived && link.ownerArchived) && link[owned.ownerKey] === row.id).map(link => String(link.projectId)));
  const sites = [...new Set((rows.projects || []).filter(project => projectIds.has(project.id)).map(project => text(project.siteId)).filter(Boolean))].sort();
  return sites.length ? sites : 'all';
}
/** Whether a certificate or wire is offered in a main project (an empty `siteId` means every main project). */
export function inOwnerSite(key: string, row: Record<string, unknown>, siteId: string, rows: { links?: Row[]; projects?: Row[] }): boolean {
  if (!siteId) return true;
  const sites = ownerSites(key, row, rows);
  return sites === 'all' || sites.includes(siteId);
}
/**
 * Next index number within one main project: records of other main projects do not count, shared older ones do.
 * `taken` are values that must stay unique across main projects (a welding wire's index number is its unique name):
 * such a number is skipped, the next free one is given.
 */
export function nextSiteIndexNumber(key: string, field: string, siteId: string, records: Row[], rows: { links?: Row[]; projects?: Row[] }, taken: Set<string> = new Set()): string {
  let next = nextIndexNumber(records.filter(record => inOwnerSite(key, record, siteId, rows)).map(record => record[field]));
  while (taken.has(next)) next = String(Number(next) + 1).padStart(4, '0');
  return next;
}
/** The Weld diameter whose Diameter is the given text (an older certificate's free-text diameter), or '' when none or several match. */
export function diameterIdFor(value: unknown, diameters: Row[]): string {
  const wanted = text(value).replace(/\s+/g, '').toLowerCase();
  if (!wanted) return '';
  const matches = diameters.filter(row => !row._archived && text(row.diameter).replace(/\s+/g, '').toLowerCase() === wanted);
  return matches.length === 1 ? matches[0].id : '';
}
/** List value of a certificate column that the reference derives: Basic material comes from the Type of material. */
export function certificateBasicMaterial(certificate: Row, types: Row[] = []): string {
  const type = types.find(row => row.id === certificate.materialTypeId);
  return text(type?.basicMaterial) || text(certificate.basicMaterial);
}
/** Every use of a certificate on a weld: project, isometric and weld number ("Show certification"). */
export function certificateUses(certificateId: string, rows: { welds?: Row[]; isometrics?: Row[]; projects?: Row[] }): { weldId: string; project: string; isometric: string; weld: string }[] {
  const isos = new Map((rows.isometrics || []).map(row => [row.id, row])), projects = new Map((rows.projects || []).map(row => [row.id, row]));
  return (rows.welds || []).filter(weld => !weld._archived && (weld.certificate1Id === certificateId || weld.certificate2Id === certificateId)).map(weld => {
    const iso = isos.get(String(weld.isoId)), project = iso ? projects.get(String(iso.projectId)) : undefined;
    return { weldId: weld.id, project: text(project?.internnumber), isometric: text(iso?.isoNo), weld: text(weld.weldNo) };
  }).sort((a, b) => a.project.localeCompare(b.project, 'en', { numeric: true }) || a.isometric.localeCompare(b.isometric, 'en', { numeric: true }) || a.weld.localeCompare(b.weld, 'en', { numeric: true }));
}
