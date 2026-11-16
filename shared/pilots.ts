import { MODULES, RESOURCE_MAP } from './resources.ts';
import { PILOT_KEYS, splitPilotPath, type PilotKey } from './release.ts';
import type { Module, User } from './types.ts';

export { PILOT_KEYS, splitPilotPath, type PilotKey };

/**
 * One menu entry. `resource` points at an existing resource page (its path comes from `resourcePath()`);
 * `path` points at an existing page directly. An entry is shown only when its page is delivered and the
 * account may read every listed resource and at least one listed report.
 */
export interface PilotItem {
  label: string;
  resource?: string;
  path?: string;
  resources?: string[];
  reports?: string[];
  /** A control rather than a page, such as the change-password dialog. */
  action?: 'password';
}
export interface PilotGroup { title: string; items: PilotItem[]; }
export interface Pilot { key: PilotKey; title: string; module: Module; color: string; description: string; groups: PilotGroup[]; }

const r = (label: string, resource: string): PilotItem => ({ label, resource });
const p = (label: string, path: string, need: Pick<PilotItem, 'resources' | 'reports'> = {}): PilotItem => ({ label, path, ...need });
const PROJECT_SITES = p('Project sites', '/workspace/main-projects', { resources: ['sites'] });
const PASSWORD: PilotItem = { label: 'Change password', action: 'password' };
const DASHBOARD = p('Dashboard', '/dashboard');

/** Menus in the reference order and wording. Reference items without a page here are left out until they exist. */
export const PILOTS: Pilot[] = [
  { key: 'weld', title: 'Weld Pilot', module: 'welding', color: MODULES.welding.color, description: 'Welds, inspections and releases for every isometric.', groups: [
    { title: 'General data', items: [PROJECT_SITES, r('Companies', 'companies'), r('Attachment names', 'attachment_names'), r('Documents', 'attachments')] },
    { title: 'Start', items: [DASHBOARD] },
    { title: 'Welder data', items: [r('Welders', 'welders'), r('Roles', 'roles'), r('Certificates', 'certificate_types'), r('Customs', 'welder_customs_catalog')] },
    { title: 'Weld data', items: [r('PQR', 'pqr'), r('WPS methods', 'wps'), r('Weld process', 'weld_processes'), r('Weld type', 'weld_types'), r('Coating', 'coatings'), r('Spools', 'spools')] },
    { title: 'Material data', items: [r('Weld diameters', 'diameters'), r('Material part', 'material_parts'), r('Type of material', 'material_types'), r('Material supplier', 'suppliers'), r('Welding wire', 'welding_wires'), r('Certifications', 'certifications')] },
    { title: 'NDT data', items: [r('NDT process groups', 'ndt_groups'), r('NDT process', 'ndt_processes'), r('NDT locations', 'ndt_locations'), r('PWHT process', 'pwht_processes'), r('PWHT locations', 'pwht_locations')] },
    { title: 'Welding data', items: [r('Projects', 'projects'), r('Isometrics list', 'isometrics'), r('Weld register', 'welds'), p('Data LISL', '/welding/lisl', { reports: ['lisl'] }), r('NDT/PWHT Manager', 'inspection_requests'), r('Inspection results', 'inspection_results'), r('QA/QC engineers', 'qa_engineers'), p('Export weld data', '/welding/reports', { reports: ['lisl', 'wdi', 'inspection-results', 'weld-cards', 'tracer', 'welder', 'open-welds'] })] },
    { title: 'Releases', items: [r('Prefab release', 'releases'), r('Assign Iso to FWP', 'field_packages'), r('Hydrotest release', 'test_systems'), r('Punch lists', 'punchlists'), r('Flange Management', 'flanges')] },
    { title: 'System', items: [PASSWORD, r('User accounts', 'users'), r('Profiles', 'profiles'), r('Signatures', 'signatures')] },
  ] },
  { key: 'mto', title: 'MTO Pilot', module: 'materials', color: MODULES.materials.color, description: 'Material take-off, ordering, stock and logistics.', groups: [
    { title: 'General data', items: [PROJECT_SITES, r('Storehouses', 'warehouses'), r('Documents', 'attachments')] },
    { title: 'Start', items: [DASHBOARD] },
    { title: 'Materials', items: [r('Material database', 'materials'), r('Material part', 'material_parts'), r('Type of material', 'material_types'), r('UOMs', 'uoms'), r('Spools', 'spools'), r('Operation Phases', 'operation_phases'), r('Material supplier', 'suppliers')] },
    { title: 'Order / Take in', items: [p('Order materials', '/materials/order-materials', { resources: ['iso_materials', 'orders', 'order_lines'] }), p('Pending order', '/materials/pending-orders', { resources: ['orders', 'order_lines'] }), p('Material take in', '/materials/take-in', { resources: ['receipts', 'orders', 'order_lines'] }), r('Material inventory', 'stock'), r('Transfer orders', 'transfer_orders'), p('Materials list', '/materials/materials-list', { resources: ['iso_materials', 'stock'] }), r('Isometric materials', 'iso_materials'), p('Order archive', '/materials/order-archive', { resources: ['orders', 'order_lines'] }), r('Certifications', 'certifications')] },
    { title: 'Projects data', items: [r('Projects', 'projects'), r('Isometrics list', 'isometrics'), p('Isometric execution', '/materials/execution', { resources: ['iso_materials'] }), r('Pick List archive', 'picklists')] },
    { title: 'Logistic', items: [r('Service companies', 'service_companies'), p('Service request', '/materials', { resources: ['spools'] }), p('Service req. - Materials', '/materials/logistics', { resources: ['iso_materials'] }), r('Request archive', 'service_requests'), r('Laydown areas', 'laydowns'), r('Laydown materials', 'material_laydowns')] },
    { title: 'Calculations', items: [p('MTO & calculations', '/materials/planning', { reports: ['mto', 'calculation', 'cut-list'] }), r('Calculation norms', 'calculation_norms')] },
    { title: 'System', items: [PASSWORD, r('User accounts', 'users'), r('Profiles', 'profiles')] },
  ] },
];
export const PILOT_MAP = Object.fromEntries(PILOTS.map(pilot => [pilot.key, pilot])) as Record<PilotKey, Pilot>;

/** The same path `resourcePath()` produces for a resource page. */
export const resourcePagePath = (key: string) => `/${RESOURCE_MAP[key].module === 'general' ? 'workspace' : RESOURCE_MAP[key].module}/${key}`;
/** The in-pilot link of an item (may carry a query string), or undefined for a control. */
export const pilotItemPath = (item: PilotItem) => item.path ?? (item.resource ? resourcePagePath(item.resource) : undefined);
/** Resources the account must be able to read for the item to be shown. */
export const pilotItemResources = (item: PilotItem) => item.resources ?? (item.resource ? [item.resource] : []);

const pathOnly = (path: string) => (path.split('?')[0].replace(/\/+$/, '') || '/');
/** Pages every pilot opens: the dashboard, project/isometric workspace, shared records and administration. */
const SHARED_PAGE = /^\/(?:$|dashboard$|workspace(?:\/|$)|settings(?:\/|$))/;

/**
 * Which pilots a page belongs to. Shared workspace pages belong to both; otherwise a page belongs to every
 * pilot whose menu lists it; pages in neither menu follow their module (materials → MTO, welding → Weld).
 */
export function pagePilots(pathname: string): PilotKey[] {
  const path = pathOnly(pathname);
  if (SHARED_PAGE.test(path)) return [...PILOT_KEYS];
  const listed = PILOTS.filter(pilot => pilot.groups.some(group => group.items.some(item => { const target = pilotItemPath(item); return target !== undefined && pathOnly(target) === path; }))).map(pilot => pilot.key);
  if (listed.length) return listed;
  if (/^\/materials(?:\/|$)/.test(path)) return ['mto'];
  if (/^\/welding(?:\/|$)/.test(path)) return ['weld'];
  return [...PILOT_KEYS];
}

/**
 * Pilots the account may enter. The server lists them (`user.pilots`: enabled per pilot, with a profile that opens
 * the pilot's module); otherwise they follow the projected module levels of the single profile.
 */
export const allowedPilots = (user: Pick<User, 'permissions' | 'pilots'>): Pilot[] => user.pilots ? PILOTS.filter(pilot => user.pilots!.includes(pilot.key)) : PILOTS.filter(pilot => (user.permissions[pilot.module] || 0) > 0);

/** Where an old, un-prefixed URL now lives. Materials pages go to MTO, everything else to Weld, unless only the other pilot is open to the account and also has the page. */
export function legacyPilotPath(pathname: string, allowed: PilotKey[] = [...PILOT_KEYS]): string {
  const preferred: PilotKey = /^\/materials(?:\/|$)/.test(pathname) ? 'mto' : 'weld';
  const other: PilotKey = preferred === 'weld' ? 'mto' : 'weld';
  const pilot = !allowed.includes(preferred) && allowed.includes(other) && pagePilots(pathname).includes(other) ? other : preferred;
  return `/${pilot}${pathname === '/' ? '' : pathname}`;
}
