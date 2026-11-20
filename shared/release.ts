import type { ActionDefinition, Availability, Field, Resource, Row } from './types.ts';
import type { Report } from './reports.ts';
import { LISL_COLUMNS } from './lisl.ts';
import { PILOT_ONLY_FIELDS, RESOURCE_MAP, RESOURCES } from './resources.ts';
import { HYDROTEST_ACTIONS, HYDROTEST_RESOURCES } from './hydrotest.ts';
import { FLANGE_ATTACHMENT_FIELDS, FLANGE_RECORD_RESOURCES } from './flanges.ts';
import { CATALOG_SITES, HOSTED_COMPANY_FIELDS, HOSTED_REQUIRED, WELD_CATALOG_COLUMNS, WELD_CATALOG_RESOURCES, catalogField, catalogResource } from './weld-catalogs.ts';
import { hostedSiteFields } from './site-settings.ts';
import { itpHostedField } from './itps.ts';
import { hostedIsometricResource, hostedProjectResource } from './project-iso-forms.ts';
import { WELDERCARD_PATH, HOSTED_COLUMNS, HOSTED_DROPPED_FIELDS, HOSTED_COLUMN_LABELS, SITE_OWNED, WELDER_DATA_PAGES, WELDER_DATA_RECORDS, hostedField, hostedFieldOrder } from './welder-data.ts';
import { WELD_ENTRY_FIELDS } from './weld-entry.ts';
import { deliverInspections, MANAGER_PATH } from './inspections.ts';
import { NDT_BATCH_PATH } from './ndt-batch.ts';
import { RELEASE_ACTIONS } from './releases.ts';
import { deliverMtoMaterials } from './mto-materials.ts';
import { MATERIAL_IMPORT_PATH } from './material-db.ts';
import { PROCUREMENT_ACTION_FIELDS, PROCUREMENT_PATHS, PROCUREMENT_RESOURCE_FIELDS } from './mto-procurement.ts';
import { LEGACY_STOCK_FIELDS, deliverMtoStock } from './mto-stock.ts';
import { deliverMtoLogistics, MTO_LOGISTICS_PAGES } from './mto-logistics.ts';
import { PDF_REPORT_RESOURCES } from './pdf-report-keys.ts';
import { PQR_IMPORT_PATH, WELD_DATA_COLUMNS, WPS_HOSTED_FIELDS, hostedWeldDataField, orderWpsFields } from './wps.ts';

export const HOSTED_RELEASE_PROFILE = 'welding-workspace' as const;
export type ReleaseProfile = 'full' | 'welding-demo' | 'access-prototype' | typeof HOSTED_RELEASE_PROFILE;
export function releaseProfile(value?: string): ReleaseProfile {
  if (!value || value === 'full') return 'full';
  if (value === 'welding-demo' || value === 'access-prototype' || value === HOSTED_RELEASE_PROFILE) return value;
  throw new Error('Unknown workspace release profile.');
}

const fields = (value: string) => value.split(' ');
const resources: Availability['resources'] = {
  sites: fields('name address zip residence phone email'),
  companies: fields('name address zip residence phone email description'),
  projects: fields('internnumber externnumber siteId companyId description contact phone authority status startdate enddate'),
  isometrics: fields('isoNo projectId irn assetTag drawingNo date pipingClass xRay ndtnorm nomDiameter material priority description'),
  spools: fields('name isoId diameter description'),
  welders: fields('number name welderCode companyId status description'),
  wps: fields('name method definition jointType allProjects processId standard description projectIds siteIds'),
  wps_projects: fields('wpsId projectId ownerArchived'),
  wps_sites: fields('wpsId siteId ownerArchived'),
  weld_processes: fields('name code description'),
  weld_types: fields('name location sort description'),
  diameters: fields('unit unitValue diameter size sizeinch outline sorting'),
  welding_wires: fields('name classification manufacturer diameter chargeNo description'),
  ndt_groups: fields('name description'),
  ndt_processes: fields('name groupId description'),
  ndt_locations: fields('name description'),
  welds: fields('weldNo isoId typeId spoolId wpsId welder1Id welder2Id welder3Id welder4Id wire1Id pos1 chargeNo1 wire2Id pos2 chargeNo2 datefit date lengthMode diameterId dialen ndoReq ndtpercent repair description'),
  inspection_requests: fields('number weldId type processId locationId date status note'),
  inspection_results: fields('requestId weldId reportNo type result round examinedLength date note'),
  attachments: fields('name entityType entityId documentType mime size note'),
};
const weldingAvailability: Availability = {
  resources,
  actions: {
    'inspection-request': fields('type weldIds processId locationId date note'),
    'inspection-result': fields('requestId reportNo result round examinedLength date note'),
    repair: fields('weldId date note'),
  },
  reports: {
    wdi: fields('project iso weld type spool wps welder1 welder2 welder3 welder4 diameter length date fitDate wire1 wire2 charge1 charge2 ndt repair'),
    'inspection-results': fields('project iso weld type number report round result examined date note'),
  },
  inspectionTypes: ['NDT', 'VI'],
  navigation: fields('projects isometrics spools attachments welds welders wps inspection_requests inspection_results sites companies weld_processes weld_types diameters welding_wires ndt_groups ndt_processes ndt_locations'),
  features: ['documents', 'history', 'table-export', 'table-print'],
};

const prototypeAvailability: Availability = {
  ...weldingAvailability,
  resources: {
    ...resources,
    isometrics: fields('isoNo projectId revNo itpNo irn assetTag drawingNo date pipingClass xRay ndtnorm nomDiameter material priority description testSystemId testPressure testMedium ped paintSpec ral insulation elevation xaxis yaxis zone chemicalClean tracing area ndtPercentage pressureTestPlan'),
    weld_types: [...resources.weld_types, 'abbreviation'],
    wps: [...resources.wps, 'active'],
    welds: [...resources.welds, ...fields('jointType material1Id material2Id certificate1Id certificate2Id coating1Id tracer ndoReqPre pwhtReqPre pwhtReq')],
    materials: fields('materialNo materialGroup articleNo legacyNo description dia lbs uom wallThickness'),
    certifications: fields('name chargeNo materialId date standard description indexNo materialCode diameter materialDescription wallThickness schedule'),
    coatings: fields('name description'),
    test_systems: fields('name projectId medium pressure description'),
    pwht_processes: fields('name description'),
    pwht_locations: fields('name description'),
    inspection_requests: [...resources.inspection_requests, 'pwhtProcessId', 'pwhtLocationId'],
    inspection_results: [...resources.inspection_results, 'naLength', 'defectType'],
  },
  actions: {
    ...weldingAvailability.actions,
    'inspection-request': [...weldingAvailability.actions['inspection-request'], 'pwhtProcessId', 'pwhtLocationId'],
    'inspection-result': [...weldingAvailability.actions['inspection-result'], 'naLength', 'defectType'],
  },
  reports: { ...weldingAvailability.reports, lisl: LISL_COLUMNS.map(column => column.key) },
  inspectionTypes: ['NDT', 'NDT PRE', 'VI', 'PWHT', 'PRE-HT'],
  navigation: [...weldingAvailability.navigation, 'materials', 'certifications', 'coatings', 'test_systems', 'pwht_processes', 'pwht_locations'],
  features: [...weldingAvailability.features, 'lisl', 'project-bulk-edit'],
};
/**
 * Deliver a resource to a profile with all of its fields (or only `names`) and its menu entry. Fields the
 * profile already delivers are kept, so it can extend an existing entry as well as add a new resource.
 */
export function deliverResource(availability: Availability, key: string, names?: string[], options: { page?: boolean } = {}) {
  if (!RESOURCE_MAP[key]) throw new Error(`Unknown resource ${key}.`);
  availability.resources[key] = [...new Set([...(availability.resources[key] || []), ...(names ?? RESOURCE_MAP[key].fields.map(field => field.name))])];
  // `page: false` delivers the records only: the resource gets no table page (other pages read it).
  if (options.page !== false && !availability.navigation.includes(key)) availability.navigation.push(key);
}
export const availabilityFor = (profile: ReleaseProfile): Availability | undefined => {
  if (profile === 'full') return undefined;
  const availability = structuredClone(profile === 'welding-demo' ? weldingAvailability : prototypeAvailability);
  if (profile === HOSTED_RELEASE_PROFILE) {
    availability.resources.materials.push('price');
    Object.assign(availability.resources, {
      iso_materials: fields('isoId materialId customMaterialId phaseId quantity chargeNo customMaterial materialNo description materialGroup articleNo legacyNo dia lbs uom price'),
      custom_materials: fields('materialNo description materialGroup articleNo legacyNo dia lbs uom price'),
      operation_phases: fields('name sort description'),
      calculation_norms: fields('name uom hoursPerUnit description'),
      calculation_lines: fields('name isoId requirementId normId quantity description'),
      cut_list: fields('name isoId requirementId spoolId quantity lengthMm description sheet dia material schedule totalLength bevel extraLength fit1Id fit2Id fit3Id fit4Id takeoff1 takeoff2 takeoff3 takeoff4 revisionId takeoffsFixed'),
    });
    // The fitting catalog of the cut list: MTO Pilot → Cut List → Cut list standards (shared/pilots.ts).
    deliverResource(availability, 'cut_fittings');
    // Revisions of the cut list (shared/cut-list-revisions.ts), shown on the Cut list tab; the stored norms and snapshot stay on the server.
    deliverResource(availability, 'cut_list_revisions', fields('name isoId revNo status source sourceRevisionId standardsMode createdByName completedAt completedByName attachmentId amendments'), { page: false });
    availability.actions['add-iso-material'] = fields('isoId source materialId phaseId quantity materialNo description materialGroup articleNo legacyNo dia lbs uom price chargeNo addToDB');
    Object.assign(availability.reports, {
      mto: fields('project iso revision group article material dia lbs description quantity uom phase charge'),
      'weld-cards': fields('project iso revision weld type spool wps diameter'),
      calculation: fields('project iso name material quantity uom norm hoursPerUnit hours status'),
      'cut-list': fields('project iso name sheet spool dia material schedule totalLength bevel extraLength fit1 fit2 fit3 fit4 lengthMm quantity totalMm'),
    });
    availability.navigation.push('iso_materials', 'operation_phases', 'calculation_norms', 'calculation_lines', 'cut_list');
    deliverResource(availability, 'sites');
    // Every isometric field, including the progress inputs and the ITP 2 / revision fields.
    deliverResource(availability, 'isometrics');
    // Records the isometric header reads (blockers, revision history) without a menu page of their own:
    // releases and punch items are delivered here so the blockers are complete; their pages come with later tasks.
    Object.assign(availability.resources, {
      releases: fields('number isoId type reportNo date engineerId signatureId note'),
      punchlists: fields('name isoId category status assignedTo dueDate completedAt description'),
      revisions: fields('isoId type revNo previousRev date comment'),
    });
    availability.actions.revision = fields('isoId type revNo date comment');
    // Punch lists page (Weld Pilot → Releases) and its status changes.
    deliverResource(availability, 'punchlists');
    Object.assign(availability.actions, { 'punch-finish': fields('punchId punchIds signerType clientName company function inspectorId date note signMethod attachmentId'), 'punch-approve': fields('punchId'), 'punch-promote': fields('punchId'), 'punch-remove': fields('punchId date note'), 'punch-report-passed': fields('isoId punchType contractorId reportedById reportedDate') });
    // Set phase (bulk and single) and Copy isometrics: only the flags the user changes are sent.
    availability.actions.phases = fields('isoIds prefab_materials prefab_est prefab_welds prefab_doc field_doc field_test field_release prep_finished');
    availability.actions['copy-isometrics'] = fields('isoIds projectId copyWelds copyMaterials copyCalculations');
    // Add new (Edit isometric) and Automatically add IRN numbers (the project's isometric overview).
    availability.actions['add-new-isometric'] = fields('isoId projectId values copyWelds copyMaterials copyCalculations');
    availability.actions['fill-irn'] = fields('siteId');
    // Prefab / Field release pages, Reopen, request archive and field work packages (see shared/releases.ts).
    for (const key of ['releases', 'field_packages']) deliverResource(availability, key);
    Object.assign(availability.actions, structuredClone(RELEASE_ACTIONS));
    availability.features.push('releases');
    deliverResource(availability, 'projects', ['weldPilot', 'mtoPilot']);
    // ITP / KNR register (Weld Pilot → Welding data → ITPs) and its project links; the links have no menu page.
    deliverResource(availability, 'itps', [...RESOURCE_MAP.itps.fields.map(field => field.name), 'projectIds']);
    availability.resources.itp_projects = fields('itpId projectId ownerArchived');
    // ITP revisions are PDF attachments of the ITP with their revision number (shared/itps.ts).
    availability.resources.attachments.push('revNo');
    // System menu: accounts with access per pilot, permission profiles (both for administrators only, see
    // canResource) and each user's own signatures.
    for (const key of ['users', 'profiles', 'signatures', 'company_data']) deliverResource(availability, key);
    // Access per project site (shared/site-scope.ts): the scope per pilot is a user field, the chosen sites are user_sites links.
    availability.resources.users.push('weldSiteIds', 'mtoSiteIds');
    availability.resources.user_sites = fields('userId pilot siteId ownerArchived');
    // Hydrotest release (shared/hydrotest.ts): test systems carry the client's acceptance; hydrotest releases and results have
    // no page of their own (they open from the Spools tab), so they are delivered without a menu entry.
    deliverResource(availability, 'test_systems', ['accepted']);
    // Reference form of a test system: Test system, Description, accepted by client. Project, medium and pressure are no
    // longer offered (stored values stay on the records); spools carry their test system (shared/hydrotest.ts).
    availability.resources.test_systems = fields('name description accepted');
    // Paint spec. of a spool is its isometric's (mto-catalogs-022), so only the test system is added.
    availability.resources.spools = [...new Set([...availability.resources.spools, 'testSystemId'])];
    for (const resource of HYDROTEST_RESOURCES) availability.resources[resource.key] = resource.fields.map(field => field.name);
    for (const action of HYDROTEST_ACTIONS) availability.actions[action.key] = action.fields.map(field => field.name);
    // Flange Management (Weld Pilot → Releases): the flange record and its page.
    deliverResource(availability, 'flanges');
    // The flange detail page: the assembly record types (no menu page of their own) and the protocol PDF's hash on its attachment.
    for (const resource of FLANGE_RECORD_RESOURCES) availability.resources[resource.key] = resource.fields.map(field => field.name);
    availability.resources.attachments.push(...FLANGE_ATTACHMENT_FIELDS.map(field => field.name));
    // Weld catalogs and "Enabled on this site" (shared/weld-catalogs.ts). Suppliers, service companies and laydowns gain the
    // enablement wherever they are delivered (the server accepts its request names for every enablement catalog).
    for (const key of WELD_CATALOG_RESOURCES) deliverResource(availability, key);
    availability.resources[CATALOG_SITES] = fields('resourceKey recordId siteId enabled');
    // Companies (reference form): name, address, phone and e-mail address only.
    availability.resources.companies = [...HOSTED_COMPANY_FIELDS];
    // Duplicate Project site (Edit project site) and the two sortings of Attachment names.
    availability.actions['duplicate-site'] = fields('siteId parts');
    availability.actions['reorder-attachment-names'] = fields('mode order');
    // PQR (Weld Pilot → Weld data, first item as in the reference): the page, its reusable attribute values (records only,
    // offered and created from the PQR form) and the WPS–PQR links (Procedure qualifications on the WPS form).
    deliverResource(availability, 'pqr');
    deliverResource(availability, 'qualification_options', undefined, { page: false });
    availability.resources.wps_pqr = fields('wpsId pqrId ownerArchived');
    availability.resources.wps.push('pqrIds', 'pqrId');
    // WPS material groups and copies (shared/wps.ts); the copy fields are written by the copy action only.
    availability.resources.wps.push(...WPS_HOSTED_FIELDS);
    // Welders, qualifications, material data and certificates (shared/welder-data.ts): menu pages, then records without a page.
    for (const [key, names] of Object.entries(WELDER_DATA_PAGES)) deliverResource(availability, key, names);
    for (const [key, names] of Object.entries(WELDER_DATA_RECORDS)) availability.resources[key] = [...new Set([...(availability.resources[key] || []), ...names])];
    // Certificates, welding wires, ITPs, WPS methods and PQRs carry the main project they belong to (shared/welder-data.ts → SITE_OWNED).
    for (const key of Object.keys(SITE_OWNED)) availability.resources[key] = [...new Set([...(availability.resources[key] || []), 'siteId'])];
    // Weld table and weld entry on the isometric: the entry fields of a weld and the actions behind the form.
    deliverResource(availability, 'welds', fields('typeId spoolId coating1Id coating2Id coatingWeldId sleeve kr fp insLength insLength2 processId sortOrder tracer stampedBy stampedAt'));
    availability.actions['save-weld'] = ['weldId', 'isoId', 'expectedVersion', 'updatePrev', 'updateNext', ...WELD_ENTRY_FIELDS, 'tracer', 'note', 'defaultDiameter', 'spoolName'];
    availability.actions['add-welds'] = fields('isoId start end diameterId');
    availability.actions['mass-edit-welds'] = fields('weldIds changes versions note');
    availability.actions['reorder-welds'] = fields('isoId weldIds');
    availability.actions['toggle-weld-sorting'] = fields('isoId enabled');
    availability.actions['stamp-weld'] = fields('weldId stampedBy expectedVersion');
    // MTO records that several flows read and write, delivered once with every field: stock is the Material
    // inventory page, picklists the Pick List archive page; orders, order lines (the procurement pages are reached by
    // path) and movements (the inventory log) have no table page. Ord.? / Inv. / Picked read all five.
    deliverResource(availability, 'stock');
    deliverResource(availability, 'picklists');
    for (const key of ['orders', 'order_lines', 'movements']) deliverResource(availability, key, undefined, { page: false });
    // MTO catalogs and the Materials tab of the isometric.
    deliverMtoMaterials(availability, deliverResource, key => RESOURCE_MAP[key].fields.map(field => field.name));
    // Operation phases (reference form): the ID is the record's own number; the typed ID (sort) and the description are not offered.
    availability.resources.operation_phases = availability.resources.operation_phases.filter(name => !['sort', 'description'].includes(name));
    // MTO procurement pages (Order materials, Pending order, Material take in, Order archive): their records and
    // actions are delivered without menu pages of their own; the pages are reached by path.
    for (const [key, names] of Object.entries(PROCUREMENT_RESOURCE_FIELDS)) availability.resources[key] = [...new Set([...(availability.resources[key] || []), ...names])];
    for (const [key, names] of Object.entries(PROCUREMENT_ACTION_FIELDS)) availability.actions[key] = [...new Set([...(availability.actions[key] || []), ...names])];
    // Storehouses, material inventory with its operations, transfer orders and the Materials list (MTO Pilot).
    deliverMtoStock(availability, RESOURCES, deliverResource);
    // Isometric execution, pick lists and logistics (shared/mto-logistics.ts).
    deliverMtoLogistics(availability, deliverResource);
    availability.features.push('project-planning', 'pilots');
    // NDT per weld, tracers, repairs, visual inspection, Pre-HT / PWHT and the NDT/PWHT Manager (shared/inspections.ts).
    deliverInspections(availability, deliverResource);
    // Operational PDF documents (server/pdf/operational-documents.ts): access keys only, no report columns.
    for (const key of Object.keys(PDF_REPORT_RESOURCES)) availability.reports[key] = [];
    // Fields of the shared catalog definitions the reference forms do not have (shared/welder-data.ts); last, so no later delivery brings them back.
    for (const [key, names] of Object.entries(HOSTED_DROPPED_FIELDS)) if (availability.resources[key]) availability.resources[key] = availability.resources[key].filter(name => !names.includes(name));
  }
  if (profile === 'access-prototype') availability.features.push('local-access');
  return availability;
};
export const hasFeature = (availability: Availability | undefined, key: string) => !availability || availability.features.includes(key);
export const resourceAvailable = (availability: Availability | undefined, key: string) => !availability || Object.hasOwn(availability.resources, key);
export const rowAvailable = (availability: Availability | undefined, key: string, row: Row) => resourceAvailable(availability, key) && (!availability || !['inspection_requests', 'inspection_results'].includes(key) || availability.inspectionTypes.includes(String(row.type)));
export const fieldAvailable = (availability: Availability | undefined, key: string, field: string) => !availability || Boolean(availability.resources[key]?.includes(field));
export const actionAvailable = (availability: Availability | undefined, key: string, type?: unknown) => !availability || Object.hasOwn(availability.actions, key) && (type === undefined || !key.startsWith('inspection-') || availability.inspectionTypes.includes(String(type)));
/**
 * Read-only values the server derives and attaches to the rows it delivers; they are no delivered field, so no request can
 * write them (stock: the old-model values of shared/mto-stock.ts `LEGACY_STOCK_FIELDS`).
 */
const DERIVED_FIELDS: Record<string, readonly string[]> = { stock: LEGACY_STOCK_FIELDS };
export function projectRow(availability: Availability | undefined, key: string, row: Row): Row {
  if (!availability) return row;
  const output = Object.fromEntries(Object.entries(row).filter(([name]) => name === 'id' || ['_version', '_archived', '_createdAt', '_updatedAt'].includes(name) || fieldAvailable(availability, key, name) || Boolean(DERIVED_FIELDS[key]?.includes(name)))) as Row;
  // Accounts saved before access per pilot existed are enabled in both pilots (see shared/resources.ts).
  if (key === 'users' && availability.features.includes('pilots')) for (const name of ['weldEnabled', 'mtoEnabled']) if (typeof output[name] !== 'boolean') output[name] = true;
  return output;
}

const descriptions: Record<string, string> = {
  projects: 'Projects, sites, and welding progress.',
  isometrics: 'Isometric drawings and weld identification.',
  spools: 'Spool identification within each isometric.',
  welders: 'Welder identities, companies, and supporting documents.',
  wps: 'Welding procedure references and project availability.',
  welds: 'Weld execution, procedure references, and inspection traceability.',
  inspection_requests: 'NDT and visual inspection requests and their current status.',
  inspection_results: 'Inspection reports, results, and examination history.',
  attachments: 'Documents linked to your projects and welding records.',
};
export function projectField(availability: Availability | undefined, field: Field): Field {
  return availability && field.name === 'type' && field.options?.includes('PWHT') ? { ...field, options: availability.inspectionTypes } : field;
}
/** New accounts start with no application ticked and each ticked application needs a profile (access-users-profiles-004); legacy rows read as enabled in projectRow. */
function hostedAccessField(key: string, field: Field): Field {
  if (key !== 'users') return field;
  if (field.name === 'weldEnabled' || field.name === 'mtoEnabled') return { ...field, default: false };
  if (field.name === 'weldProfileId' || field.name === 'mtoProfileId') return { ...field, required: true, noBlank: true, hint: undefined };
  return field;
}
const HOSTED_ACCESS_WORDING: Record<string, NonNullable<Resource['wording']>> = {
  sites: { add: 'Add project site', edit: 'Edit project site', remove: 'Delete project site' },
  users: { add: 'Add user', edit: 'Edit user', remove: 'Delete user' },
  profiles: { add: 'Add profile', edit: 'Edit profile', remove: 'Delete profile' },
};
export function projectResource(availability: Availability | undefined, resource: Resource): Resource {
  if (!availability) return resource;
  const prototype = availability.features.includes('lisl');
  const pilots = availability.features.includes('pilots');
  const columns = pilots && WELD_CATALOG_COLUMNS[resource.key] ? WELD_CATALOG_COLUMNS[resource.key] : pilots && resource.key === 'sites' ? ['name', 'address', 'phone', 'email', 'irnCode'] : pilots && resource.key === 'operation_phases' ? ['number', 'name'] : pilots && resource.key === 'users' ? ['email', 'name', 'title', 'companyId', 'phone', 'mtoEnabled', 'weldEnabled'] : pilots && resource.key === 'profiles' ? ['name', 'description'] : prototype && resource.key === 'certifications' ? ['name', 'indexNo', 'chargeNo', 'materialId', 'date'] : prototype && resource.key === 'wps' ? [...resource.columns, 'active'] : prototype && resource.key === 'weld_types' ? ['abbreviation', ...resource.columns] : resource.columns;
  const listed = pilots ? HOSTED_COLUMNS[resource.key] ?? WELD_DATA_COLUMNS[resource.key] : undefined;
  const ordered = (fields: Field[]) => pilots && resource.key === 'wps' ? orderWpsFields(fields) : fields;
  const projected: Resource = {
    ...(pilots ? catalogResource(resource) : resource), description: descriptions[resource.key] || resource.description,
    // The MTO Pilot menu says "Storehouses" (reference wording); the page and its form follow it.
    ...(pilots && resource.key === 'warehouses' ? { title: 'Storehouses', singular: 'storehouse' } : {}),
    // Profiles, user accounts and project sites: the reference's page title and its Add / Update dialogs (access-users-profiles-006, delta-I2b-004).
    ...(pilots && resource.key === 'profiles' ? { title: 'Profiles' } : {}),
    ...(pilots && HOSTED_ACCESS_WORDING[resource.key] ? { wording: HOSTED_ACCESS_WORDING[resource.key] } : {}),
    ...(pilots && resource.key === 'attachment_names' ? { singular: 'Attachment name' } : {}),
    // Welders (capture weld__welder__welders*.txt): Add Welder (Add / Cancel), Edit personnel info (Update / Close).
    ...(pilots && resource.key === 'welders' ? { wording: { add: 'Add Welder', edit: 'Edit personnel info', remove: 'Delete', cancelEdit: 'Close' } } : {}),
    fields: (pilots && resource.key === 'sites' ? hostedSiteFields : (list: Field[]) => list)(ordered(resource.fields).filter(f => fieldAvailable(availability, resource.key, f.name)).map(f => pilots && HOSTED_REQUIRED[resource.key]?.includes(f.name) ? { ...f, required: true } : f).map(f => pilots && PILOT_ONLY_FIELDS[resource.key]?.includes(f.name) ? { ...f, hidden: false } : pilots && resource.key === 'users' && f.name === 'email' ? { ...f, label: 'Username / email' } : pilots && resource.key === 'materials' && f.name === 'materialGroup' ? { ...f, required: true } : f).map(f => pilots ? catalogField(resource.key, hostedWeldDataField(resource.key, hostedField(resource.key, f))) : f).map(f => pilots ? itpHostedField(resource.key, f) : f).map(f => pilots ? hostedAccessField(resource.key, f) : f).map(f => {
      const side = /^(?:pos|chargeNo)([12])$/.exec(f.name)?.[1];
      return projectField(availability, prototype && resource.key === 'welds' && side ? { ...f, section: `Material side ${side}` } : f);
    })),
    columns: (listed ?? columns).filter(key => fieldAvailable(availability, resource.key, key)),
    actions: resource.actions?.filter(key => actionAvailable(availability, key)),
    createAction: resource.createAction && actionAvailable(availability, resource.createAction) ? resource.createAction : undefined,
  };
  if (!pilots) return projected;
  // List headers of the reference: one lookup for the list page (catalog fields name theirs with `columnLabel`, the material data in HOSTED_COLUMN_LABELS).
  const columnLabels = { ...Object.fromEntries(projected.fields.filter(f => f.columnLabel).map(f => [f.name, f.columnLabel!])), ...HOSTED_COLUMN_LABELS[resource.key] };
  // Form order of the reference (shared/welder-data.ts); the other profiles keep the order of the shared definition.
  // Projects and isometrics: the reference columns, labels and fields (shared/project-iso-forms.ts).
  const shaped = resource.key === 'projects' ? hostedProjectResource(projected) : resource.key === 'isometrics' ? hostedIsometricResource(projected) : projected;
  return { ...shaped, ...(Object.keys(columnLabels).length ? { columnLabels } : {}), fields: hostedFieldOrder(resource.key, shaped.fields) };
}
export function projectAction(availability: Availability | undefined, action: ActionDefinition): ActionDefinition {
  if (!availability) return action;
  return { ...action, description: action.key === 'inspection-request' ? 'Create an NDT or visual inspection request for selected welds.' : action.description,
    fields: action.fields.filter(f => availability.actions[action.key]?.includes(f.name)).map(f => projectField(availability, f)) };
}
export function projectReport(availability: Availability | undefined, report: Report): Report {
  if (!availability) return report;
  const allowed = availability.reports[report.definition.key] || [];
  return { ...report, columns: report.columns.filter(c => allowed.includes(c.key)), rows: report.rows.map(row => ({ ...row, values: Object.fromEntries(Object.entries(row.values).filter(([key]) => allowed.includes(key))) })) };
}
export const PILOT_KEYS = ['weld', 'mto'] as const;
export type PilotKey = typeof PILOT_KEYS[number];
/** Split `/weld/...` or `/mto/...` into the pilot and the page path used by the existing route table. */
export function splitPilotPath(pathname: string): { pilot?: PilotKey; path: string } {
  const match = /^\/(weld|mto)(?=\/|$)(.*)$/.exec(pathname);
  return match ? { pilot: match[1] as PilotKey, path: match[2] || '/' } : { path: pathname };
}
/** The route-table path of a browser path; the pilot prefix is only recognised where the profile delivers pilots. */
export const pagePath = (availability: Availability | undefined, pathname: string) => availability?.features.includes('pilots') ? splitPilotPath(pathname).path : pathname;
export function pageAvailable(availability: Availability | undefined, pathname: string, definitions: Resource[]): boolean {
  if (!availability) return true;
  if (availability.features.includes('pilots')) { const { pilot, path } = splitPilotPath(pathname); if (pilot) return deliveredPage(availability, path, definitions); }
  return deliveredPage(availability, pathname, definitions);
}
function deliveredPage(availability: Availability, pathname: string, definitions: Resource[]): boolean {
  if (availability.features.includes('lisl') && (pathname === '/workspace/main-projects' || pathname === '/workspace/iso-overview' || /^\/workspace\/projects\/[^/]+\/isometrics$/.test(pathname) || /^\/workspace\/isometrics\/[^/]+$/.test(pathname))) return true;
  if (pathname === '/welding/lisl' && availability.features.includes('lisl')) return true;
  if (pathname === MANAGER_PATH && availability.features.includes('inspections')) return true;
  // NDT Batch Import (Weld Pilot, server/ndt-batch.ts): with the inspections flow where the profile delivers pilots.
  if (pathname === NDT_BATCH_PATH && availability.features.includes('pilots') && availability.features.includes('inspections')) return true;
  if (Object.hasOwn(availability.resources, 'receipts') && PROCUREMENT_PATHS.includes(pathname)) return true;
  if (pathname === '/materials/materials-list' && availability.features.includes('pilots')) return true;
  if (availability.features.includes('pilots') && availability.navigation.includes('flanges') && /^\/welding\/flanges\/[^/]+$/.test(pathname)) return true;
  if (pathname === MATERIAL_IMPORT_PATH && availability.features.includes('pilots') && availability.navigation.includes('materials')) return true;
  if (pathname === WELDERCARD_PATH && availability.features.includes('pilots') && Object.hasOwn(availability.resources, 'weldercard_options')) return true;
  if (pathname === PQR_IMPORT_PATH && availability.features.includes('pilots') && availability.navigation.includes('pqr')) return true;
  if (availability.features.includes('project-planning') && ['/materials/reports', '/materials/planning'].includes(pathname)) return true;
  if (availability.features.includes('pilots') && (MTO_LOGISTICS_PAGES.includes(pathname) || /^\/materials\/laydowns\/[^/]+$/.test(pathname))) return true;
  if (['/', '/dashboard', '/welding', '/welding/reports'].includes(pathname.replace(/\/$/, '') || '/')) return true;
  return definitions.some(r => availability.navigation.includes(r.key) && pathname === `/${r.module === 'general' ? 'workspace' : r.module}/${r.key}`);
}
