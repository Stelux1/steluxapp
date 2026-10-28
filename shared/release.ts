import type { ActionDefinition, Availability, Field, Resource, Row } from './types.ts';
import type { Report } from './reports.ts';
import { LISL_COLUMNS } from './lisl.ts';

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
export const availabilityFor = (profile: ReleaseProfile): Availability | undefined => {
  if (profile === 'full') return undefined;
  const availability = structuredClone(profile === 'welding-demo' ? weldingAvailability : prototypeAvailability);
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
  return Object.fromEntries(Object.entries(row).filter(([name]) => name === 'id' || ['_version', '_archived', '_createdAt', '_updatedAt'].includes(name) || fieldAvailable(availability, key, name))) as Row;
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
  const columns = prototype && resource.key === 'certifications' ? ['name', 'indexNo', 'chargeNo', 'materialId', 'date'] : prototype && resource.key === 'wps' ? [...resource.columns, 'active'] : prototype && resource.key === 'weld_types' ? ['abbreviation', ...resource.columns] : resource.columns;
  return {
    ...resource, description: descriptions[resource.key] || resource.description,
    fields: resource.fields.filter(f => fieldAvailable(availability, resource.key, f.name)).map(f => {
      const side = /^(?:pos|chargeNo)([12])$/.exec(f.name)?.[1];
      return projectField(availability, prototype && resource.key === 'welds' && side ? { ...f, section: `Material side ${side}` } : f);
    }),
    columns: columns.filter(key => fieldAvailable(availability, resource.key, key)),
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
export function pageAvailable(availability: Availability | undefined, pathname: string, definitions: Resource[]): boolean {
  if (!availability) return true;
  if (availability.features.includes('lisl') && (pathname === '/workspace/main-projects' || /^\/workspace\/projects\/[^/]+\/isometrics$/.test(pathname) || /^\/workspace\/isometrics\/[^/]+$/.test(pathname))) return true;
  if (pathname === '/welding/lisl' && availability.features.includes('lisl')) return true;
  if (['/', '/dashboard', '/welding', '/welding/reports'].includes(pathname.replace(/\/$/, '') || '/')) return true;
  return definitions.some(r => availability.navigation.includes(r.key) && pathname === `/${r.module === 'general' ? 'workspace' : r.module}/${r.key}`);
}
