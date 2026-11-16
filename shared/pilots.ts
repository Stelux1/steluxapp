import { MODULES, RESOURCE_MAP } from './resources.ts';
import { PILOT_KEYS, splitPilotPath, type PilotKey } from './release.ts';
import type { Module, User } from './types.ts';
import { MANAGER_PATH } from './inspections.ts';
import { NDT_BATCH_AREA, NDT_BATCH_PATH, NDT_BATCH_TITLE } from './ndt-batch.ts';

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
  /** A control rather than a page: the change-password dialog, or the "Project search" dialog of Iso overview. */
  action?: 'password' | 'iso-overview';
  /** Page area (shared/permissions.ts PAGE_SCOPES) whose Show the item also needs, e.g. the Weld dashboard 35. */
  area?: string;
}
/** Icon of a menu group, drawn by the client (`client/pilot.tsx`); it stands for the group when the menu is collapsed to icons. */
export type PilotGroupIcon = 'general' | 'start' | 'welders' | 'weld' | 'material' | 'ndt' | 'welding' | 'releases' | 'materials' | 'orders' | 'projects' | 'logistics' | 'calculations' | 'system';
export interface PilotGroup { title: string; icon: PilotGroupIcon; items: PilotItem[]; }
export interface Pilot { key: PilotKey; title: string; module: Module; color: string; description: string; groups: PilotGroup[]; }

const r = (label: string, resource: string): PilotItem => ({ label, resource });
const p = (label: string, path: string, need: Pick<PilotItem, 'resources' | 'reports' | 'area'> = {}): PilotItem => ({ label, path, ...need });
/** General data → Project sites: the table of main projects (the card screen "Select a main project" stays the choice after sign-in). */
const PROJECT_SITES = r('Project sites', 'sites');
const PASSWORD: PilotItem = { label: 'Change password', action: 'password' };
const DASHBOARD = p('Dashboard', '/dashboard');
/** Iso overview: a "Project search" dialog that opens the chosen project's isometrics page (needs projects and isometrics). */
const ISO_OVERVIEW: PilotItem = { label: 'Iso overview', action: 'iso-overview', resources: ['projects', 'isometrics'] };
/** Weld Pilot page areas (weld__system__profiles.txt): Dahsboard - WeldPilot 35, Iso Overview 92. */
const WELD_DASHBOARD: PilotItem = { ...DASHBOARD, area: '35' };
const WELD_ISO_OVERVIEW: PilotItem = { ...ISO_OVERVIEW, area: '92' };

/** Menus in the reference order and wording. Reference items without a page here are left out until they exist. */
export const PILOTS: Pilot[] = [
  { key: 'weld', title: 'Weld Pilot', module: 'welding', color: MODULES.welding.color, description: 'Welds, inspections and releases for every isometric.', groups: [
    { title: 'General data', icon: 'general', items: [PROJECT_SITES, r('Companies', 'companies'), r('Attachment names', 'attachment_names'), r('Documents', 'attachments')] },
    { title: 'Start', icon: 'start', items: [WELD_DASHBOARD] },
    { title: 'Welder data', icon: 'welders', items: [r('Welders', 'welders'), r('Roles', 'roles'), r('Certificates', 'certificate_types'), r('Customs', 'welder_customs_catalog')] },
    { title: 'Weld data', icon: 'weld', items: [r('PQR', 'pqr'), r('WPS methods', 'wps'), r('Weld type', 'weld_types'), r('Coating', 'coatings'), r('Spools', 'spools')] },
    { title: 'Material data', icon: 'material', items: [r('Weld diameters', 'diameters'), r('Material part', 'material_parts'), r('Type of material', 'material_types'), r('Material supplier', 'suppliers'), r('Welding wire', 'welding_wires'), r('Certifications', 'certifications')] },
    { title: 'NDT data', icon: 'ndt', items: [r('NDT process groups', 'ndt_groups'), r('NDT process', 'ndt_processes'), r('Defect codes', 'ndt_defect_codes'), r('NDT locations', 'ndt_locations'), r('PWHT process', 'pwht_processes'), r('PWHT locations', 'pwht_locations')] },
    { title: 'Welding data', icon: 'welding', items: [r('Projects', 'projects'), r('Isometrics list', 'isometrics'), r('ITPs', 'itps'), WELD_ISO_OVERVIEW, r('Weld register', 'welds'), p('Data LISL', '/welding/lisl', { reports: ['lisl'] }), p('NDT/PWHT Manager', MANAGER_PATH, { resources: ['welds', 'inspection_requests'] }), p(NDT_BATCH_TITLE, NDT_BATCH_PATH, { resources: ['welds', 'inspection_results', 'inspection_requests'], area: NDT_BATCH_AREA }), r('Inspection results', 'inspection_results'), r('QA/QC engineers', 'qa_engineers'), p('Export weld data', '/welding/reports', { reports: ['lisl', 'wdi', 'inspection-results', 'weld-cards', 'tracer', 'welder', 'open-welds'], area: '81' })] },
    { title: 'Releases', icon: 'releases', items: [p('Prefab release', '/welding/releases?view=prefab', { resources: ['releases'] }), p('Field release', '/welding/releases?view=field', { resources: ['releases'] }), p('Assign Iso to FWP', '/welding/field_packages?tab=assign', { resources: ['field_packages'] }), r('Hydrotest release', 'test_systems'), r('Punch lists', 'punchlists'), r('Flange Management', 'flanges')] },
    { title: 'System', icon: 'system', items: [PASSWORD, r('User accounts', 'users'), r('Profiles', 'profiles'), r('Signatures', 'signatures'), r('Company data', 'company_data')] },
  ] },
  { key: 'mto', title: 'MTO Pilot', module: 'materials', color: MODULES.materials.color, description: 'Material take-off, ordering, stock and logistics.', groups: [
    { title: 'General data', icon: 'general', items: [PROJECT_SITES, r('Storehouses', 'warehouses'), r('Documents', 'attachments')] },
    { title: 'Start', icon: 'start', items: [DASHBOARD] },
    { title: 'Materials', icon: 'materials', items: [r('Material database', 'materials'), r('Material part', 'material_parts'), r('Type of material', 'material_types'), r('UOMs', 'uoms'), r('Spools', 'spools'), r('Operation Phases', 'operation_phases'), r('Material supplier', 'suppliers')] },
    { title: 'Order / Take in', icon: 'orders', items: [p('Order materials', '/materials/order-materials', { resources: ['iso_materials', 'orders', 'order_lines'] }), p('Pending order', '/materials/pending-orders', { resources: ['orders', 'order_lines'] }), p('Material take in', '/materials/take-in', { resources: ['receipts', 'orders', 'order_lines'] }), r('Material inventory', 'stock'), r('Transfer orders', 'transfer_orders'), p('Materials list', '/materials/materials-list', { resources: ['iso_materials', 'stock'], area: '78' }), p('Order archive', '/materials/order-archive', { resources: ['orders', 'order_lines'] }), r('Certifications', 'certifications')] },
    { title: 'Projects data', icon: 'projects', items: [r('Projects', 'projects'), r('Isometrics list', 'isometrics'), p('Isometric execution', '/materials/iso-execution', { resources: ['iso_materials', 'stock', 'reservations'] }), r('Pick List archive', 'picklists'), ISO_OVERVIEW] },
    { title: 'Logistic', icon: 'logistics', items: [r('Service companies', 'service_companies'), p('Service request', '/materials/service-spools', { resources: ['spools', 'service_requests'] }), p('Service req. - Materials', '/materials/service-materials', { resources: ['iso_materials', 'material_locations'] }), r('Request archive', 'service_requests'), r('Laydown areas', 'laydowns'), r('Laydown materials', 'material_laydowns')] },
    { title: 'Calculations', icon: 'calculations', items: [p('MTO & calculations', '/materials/planning', { reports: ['mto', 'calculation', 'cut-list'] }), r('Calculation norms', 'calculation_norms')] },
    { title: 'System', icon: 'system', items: [PASSWORD, r('User accounts', 'users'), r('Profiles', 'profiles'), r('Company data', 'company_data')] },
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
/** Shared-looking pages of one pilot only: Signatures is a Weld Pilot page (area 96 belongs to Weld Pilot). */
const ONE_PILOT_PAGES: Record<string, PilotKey[]> = { '/settings/signatures': ['weld'] };

/**
 * Which pilots a page belongs to. Shared workspace pages belong to both; otherwise a page belongs to every
 * pilot whose menu lists it; pages in neither menu follow their module (materials → MTO, welding → Weld).
 */
export function pagePilots(pathname: string): PilotKey[] {
  const path = pathOnly(pathname);
  if (ONE_PILOT_PAGES[path]) return [...ONE_PILOT_PAGES[path]];
  if (SHARED_PAGE.test(path)) return [...PILOT_KEYS];
  const listed = PILOTS.filter(pilot => pilot.groups.some(group => group.items.some(item => { const target = pilotItemPath(item); return target !== undefined && pathOnly(target) === path; }))).map(pilot => pilot.key);
  if (listed.length) return listed;
  if (/^\/materials(?:\/|$)/.test(path)) return ['mto'];
  if (/^\/welding(?:\/|$)/.test(path)) return ['weld'];
  return [...PILOT_KEYS];
}

/**
 * Pilots the account may enter. The server lists them (`user.pilots`: the applications enabled on the account; what it
 * may open inside is decided per area); otherwise they follow the projected module levels of the single profile.
 */
export const allowedPilots = (user: Pick<User, 'permissions' | 'pilots'>): Pilot[] => user.pilots ? PILOTS.filter(pilot => user.pilots!.includes(pilot.key)) : PILOTS.filter(pilot => (user.permissions[pilot.module] || 0) > 0);

/** Where an old, un-prefixed URL now lives. Materials pages go to MTO, everything else to Weld, unless only the other pilot is open to the account and also has the page. */
export function legacyPilotPath(pathname: string, allowed: PilotKey[] = [...PILOT_KEYS]): string {
  const preferred: PilotKey = /^\/materials(?:\/|$)/.test(pathname) ? 'mto' : 'weld';
  const other: PilotKey = preferred === 'weld' ? 'mto' : 'weld';
  const pilot = !allowed.includes(preferred) && allowed.includes(other) && pagePilots(pathname).includes(other) ? other : preferred;
  return `/${pilot}${pathname === '/' ? '' : pathname}`;
}

// ----- menu items the account may not open ------------------------------------------------------------------------------
/** What the account's profile allows, as the menu asks for it. */
export interface MenuRights { delivered: (path: string) => boolean; canRecord: (resource: string) => boolean; canReadReport: (report: string) => boolean; /** Show on a page area; absent: page areas are not checked. */ canArea?: (area: string) => boolean }
const areaOpen = (item: PilotItem, rights: MenuRights) => !item.area || !rights.canArea || rights.canArea(item.area);
/**
 * `open`: the page opens. `no-rights`: the page is delivered but the profile may not open it; the menu shows the item greyed
 * and the page says "You do not have rights to open this page." `hidden`: the page does not exist in this workspace.
 */
export type MenuItemState = 'open' | 'no-rights' | 'hidden';
export function pilotItemState(item: PilotItem, rights: MenuRights): MenuItemState {
  const needed = pilotItemResources(item);
  if (item.action) {
    if (needed.some(key => !RESOURCE_MAP[key] || !rights.delivered(resourcePagePath(key)))) return 'hidden';
    return needed.every(key => rights.canRecord(key)) && areaOpen(item, rights) ? 'open' : 'no-rights';
  }
  const to = pilotItemPath(item);
  if (!to || (item.resource && !RESOURCE_MAP[item.resource]) || !rights.delivered(pathOnly(to))) return 'hidden';
  return needed.every(key => rights.canRecord(key)) && (!item.reports || item.reports.some(key => rights.canReadReport(key))) && areaOpen(item, rights) ? 'open' : 'no-rights';
}
/** The state of the page at `pathname` in a pilot: that of its menu items (open when any item opens it), or `unlisted` for a page without a menu item. */
export function pilotPageState(pilot: Pilot, pathname: string, rights: MenuRights): MenuItemState | 'unlisted' {
  const states = pilot.groups.flatMap(group => group.items).filter(item => { const to = pilotItemPath(item); return !item.action && to !== undefined && pathOnly(to) === pathOnly(pathname); }).map(item => pilotItemState(item, rights));
  return states.includes('open') ? 'open' : states.includes('no-rights') ? 'no-rights' : 'unlisted';
}
export const NO_RIGHTS_TEXT = 'You do not have rights to open this page.';
