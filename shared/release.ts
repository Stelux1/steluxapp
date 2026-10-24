import type { ActionDefinition, Availability, Field, Resource, Row } from './types.ts';
import type { Report } from './reports.ts';

export type ReleaseProfile = 'full' | 'welding-demo';
export function releaseProfile(value?: string): ReleaseProfile {
  if (!value || value === 'full') return 'full';
  if (value === 'welding-demo') return value;
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

export const availabilityFor = (profile: ReleaseProfile): Availability | undefined => profile === 'welding-demo' ? structuredClone(weldingAvailability) : undefined;
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
  return {
    ...resource, description: descriptions[resource.key] || resource.description,
    fields: resource.fields.filter(f => fieldAvailable(availability, resource.key, f.name)).map(f => projectField(availability, f)),
    columns: resource.columns.filter(key => fieldAvailable(availability, resource.key, key)),
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
  if (['/', '/dashboard', '/welding', '/welding/reports'].includes(pathname.replace(/\/$/, '') || '/')) return true;
  return definitions.some(r => availability.navigation.includes(r.key) && pathname === `/${r.module === 'general' ? 'workspace' : r.module}/${r.key}`);
}
