import type { ActionDefinition, Availability, Field, Resource, Row } from './types.ts';
import type { Report } from './reports.ts';
import { LISL_COLUMNS } from './lisl.ts';
import { PILOT_ONLY_FIELDS, RESOURCE_MAP } from './resources.ts';
import { HOSTED_COLUMNS, WELDER_DATA_PAGES, WELDER_DATA_RECORDS, hostedField } from './welder-data.ts';

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
  diameters: fields('diameter size sizeinch outline sorting'),
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
export function deliverResource(availability: Availability, key: string, names?: string[]) {
  if (!RESOURCE_MAP[key]) throw new Error(`Unknown resource ${key}.`);
  availability.resources[key] = [...new Set([...(availability.resources[key] || []), ...(names ?? RESOURCE_MAP[key].fields.map(field => field.name))])];
  if (!availability.navigation.includes(key)) availability.navigation.push(key);
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
      cut_list: fields('name isoId requirementId spoolId quantity lengthMm description'),
    });
    availability.actions['add-iso-material'] = fields('isoId source materialId phaseId quantity materialNo description materialGroup articleNo legacyNo dia lbs uom price chargeNo addToDB');
    Object.assign(availability.reports, {
      mto: fields('project iso revision group article material dia lbs description quantity uom phase charge'),
      calculation: fields('project iso name material quantity uom norm hoursPerUnit hours status'),
      'cut-list': fields('project iso name material spool quantity lengthMm totalMm'),
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
    // Set phase (bulk and single) and Copy isometrics: only the flags the user changes are sent.
    availability.actions.phases = fields('isoIds prefab_materials prefab_est prefab_welds prefab_doc field_doc field_test field_release prep_finished');
    availability.actions['copy-isometrics'] = fields('isoIds projectId copyWelds copyMaterials copyCalculations');
    deliverResource(availability, 'projects', ['weldPilot', 'mtoPilot']);
    // System menu: accounts with access per pilot, permission profiles (both for administrators only, see
    // canResource) and each user's own signatures.
    for (const key of ['users', 'profiles', 'signatures']) deliverResource(availability, key);
    // Welders, qualifications, material data and certificates (shared/welder-data.ts): menu pages, then records without a page.
    for (const [key, names] of Object.entries(WELDER_DATA_PAGES)) deliverResource(availability, key, names);
    for (const [key, names] of Object.entries(WELDER_DATA_RECORDS)) availability.resources[key] = [...new Set([...(availability.resources[key] || []), ...names])];
    availability.features.push('project-planning', 'pilots');
  }
  if (profile === 'access-prototype') availability.features.push('local-access');
  return availability;
};
export const hasFeature = (availability: Availability | undefined, key: string) => !availability || availability.features.includes(key);
export const resourceAvailable = (availability: Availability | undefined, key: string) => !availability || Object.hasOwn(availability.resources, key);
export const rowAvailable = (availability: Availability | undefined, key: string, row: Row) => resourceAvailable(availability, key) && (!availability || !['inspection_requests', 'inspection_results'].includes(key) || availability.inspectionTypes.includes(String(row.type)));
export const fieldAvailable = (availability: Availability | undefined, key: string, field: string) => !availability || Boolean(availability.resources[key]?.includes(field));
export const actionAvailable = (availability: Availability | undefined, key: string, type?: unknown) => !availability || Object.hasOwn(availability.actions, key) && (type === undefined || !key.startsWith('inspection-') || availability.inspectionTypes.includes(String(type)));
export function projectRow(availability: Availability | undefined, key: string, row: Row): Row {
  if (!availability) return row;
  const output = Object.fromEntries(Object.entries(row).filter(([name]) => name === 'id' || ['_version', '_archived', '_createdAt', '_updatedAt'].includes(name) || fieldAvailable(availability, key, name))) as Row;
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
export function projectResource(availability: Availability | undefined, resource: Resource): Resource {
  if (!availability) return resource;
  const prototype = availability.features.includes('lisl');
  const pilots = availability.features.includes('pilots');
  const columns = pilots && resource.key === 'sites' ? ['name', 'address', 'phone', 'email', 'irnCode'] : pilots && resource.key === 'users' ? ['email', 'name', 'title', 'companyId', 'phone', 'weldEnabled', 'mtoEnabled', 'active'] : prototype && resource.key === 'certifications' ? ['name', 'indexNo', 'chargeNo', 'materialId', 'date'] : prototype && resource.key === 'wps' ? [...resource.columns, 'active'] : prototype && resource.key === 'weld_types' ? ['abbreviation', ...resource.columns] : resource.columns;
  const listed = pilots ? HOSTED_COLUMNS[resource.key] : undefined;
  return {
    ...resource, description: descriptions[resource.key] || resource.description,
    fields: resource.fields.filter(f => fieldAvailable(availability, resource.key, f.name)).map(f => pilots && PILOT_ONLY_FIELDS[resource.key]?.includes(f.name) ? { ...f, hidden: false } : pilots && resource.key === 'users' && f.name === 'email' ? { ...f, label: 'Username / email' } : f).map(f => pilots ? hostedField(resource.key, f) : f).map(f => {
      const side = /^(?:pos|chargeNo)([12])$/.exec(f.name)?.[1];
      return projectField(availability, prototype && resource.key === 'welds' && side ? { ...f, section: `Material side ${side}` } : f);
    }),
    columns: (listed ?? columns).filter(key => fieldAvailable(availability, resource.key, key)),
    actions: resource.actions?.filter(key => actionAvailable(availability, key)),
    createAction: resource.createAction && actionAvailable(availability, resource.createAction) ? resource.createAction : undefined,
  };
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
  if (availability.features.includes('lisl') && (pathname === '/workspace/main-projects' || /^\/workspace\/projects\/[^/]+\/isometrics$/.test(pathname) || /^\/workspace\/isometrics\/[^/]+$/.test(pathname))) return true;
  if (pathname === '/welding/lisl' && availability.features.includes('lisl')) return true;
  if (availability.features.includes('project-planning') && ['/materials/reports', '/materials/planning'].includes(pathname)) return true;
  if (['/', '/dashboard', '/welding', '/welding/reports'].includes(pathname.replace(/\/$/, '') || '/')) return true;
  return definitions.some(r => availability.navigation.includes(r.key) && pathname === `/${r.module === 'general' ? 'workspace' : r.module}/${r.key}`);
}
