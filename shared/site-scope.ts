import type { Relation } from './welding.ts';

/**
 * Access per main project (project site), per pilot — hosted profile with pilots only.
 *
 * Reference (`reference/montavar/shared-core.md` → "User accounts"): for each pilot a user has a scope select
 * [All project sites / Specific project site(s)] and, for the specific case, a checkbox per site. A user without
 * these settings keeps access to every site. The server enforces the scope (`server/site-scope.ts`); this module
 * holds the account fields, the link resource and the one table that says how a record's main project is found.
 */
export const SITE_SCOPE_ALL = 'All project sites';
export const SITE_SCOPE_SPECIFIC = 'Specific project site(s)';
export const SITE_SCOPE_OPTIONS = [SITE_SCOPE_ALL, SITE_SCOPE_SPECIFIC];
/** Error code of a refusal by access per project site (server/site-scope.ts). */
export const SITE_REFUSED = 'site';
/** Links (user, pilot, site) of the accounts limited to specific project sites. */
export const USER_SITES = 'user_sites';
export type ScopePilot = 'weld' | 'mto';
export const SCOPE_PILOTS: readonly ScopePilot[] = ['weld', 'mto'];
const TITLES: Record<ScopePilot, string> = { weld: 'Weld Pilot', mto: 'MTO Pilot' };
export const siteScopeField = (pilot: ScopePilot) => `${pilot}SiteScope`;
export const siteIdsField = (pilot: ScopePilot) => `${pilot}SiteIds`;
export const siteScopeLabel = (pilot: ScopePilot) => `${TITLES[pilot]} project site access`;
/** Whether a stored scope value limits the account (anything but "Specific project site(s)" means all sites, legacy accounts included). */
export const scopeLimited = (value: unknown) => value === SITE_SCOPE_SPECIFIC;

/** The checkbox list per pilot, stored as `user_sites` links that carry the pilot. Pilots profile only. */
export const USER_SITE_RELATIONS: Relation[] = SCOPE_PILOTS.map(pilot => ({
  field: siteIdsField(pilot), label: `${TITLES[pilot]} project sites`, resource: USER_SITES, ownerKey: 'userId', target: 'sites', targetKey: 'siteId',
  showIf: [siteScopeField(pilot), SITE_SCOPE_SPECIFIC], match: { pilot }, section: 'Applications', pilotsOnly: true,
}));

/**
 * How the main project of a record is found:
 * - `global`: the record belongs to no main project (catalogs, accounts, company data); every account keeps it;
 * - `site`: the record is a main project itself;
 * - `entity`: an attachment, found through the record it is attached to;
 * - `via`: the first of these fields that holds a value leads to the record whose main project applies.
 *   A record where none of them holds a value is refused to a limited account, unless `orphan: 'global'`
 *   (for example a storehouse that belongs to no main project).
 *
 * Every resource must appear here (tests/site-scope.test.ts fails otherwise), so a new resource cannot escape
 * the scope silently.
 */
export type SiteRule = 'global' | 'site' | 'entity' | { via: readonly (readonly [field: string, resource: string])[]; orphan?: 'global' };
const via = (...steps: [string, string][]): SiteRule => ({ via: steps });
const shared = (...steps: [string, string][]): SiteRule => ({ via: steps, orphan: 'global' });
const ISO: [string, string] = ['isoId', 'isometrics'], PROJECT: [string, string] = ['projectId', 'projects'], SITE: [string, string] = ['siteId', 'sites'];
const REQUIREMENT: [string, string] = ['requirementId', 'iso_materials'], WAREHOUSE: [string, string] = ['warehouseId', 'warehouses'];

export const SITE_RULES: Record<string, SiteRule> = {
  // Workspace
  sites: 'site',
  companies: 'global',
  warehouses: shared(SITE),
  projects: via(SITE),
  isometrics: via(PROJECT),
  spools: via(ISO),
  revisions: via(ISO),
  attachments: 'entity',
  catalog_sites: via(SITE),
  [USER_SITES]: via(SITE),
  // Materials catalogs (global)
  suppliers: 'global', material_parts: 'global', material_types: 'global', uoms: 'global', operation_phases: 'global',
  calculation_norms: 'global', materials: 'global', custom_materials: 'global', material_laydowns: 'global', service_companies: 'global',
  // A certificate belongs to one main project (its siteId); one saved before that follows its linked projects (server/site-scope.ts).
  certifications: shared(SITE),
  laydowns: shared(SITE),
  // Material records of an isometric
  calculation_lines: via(ISO), cut_list: via(ISO), iso_materials: via(ISO),
  material_quantity_changes: via(REQUIREMENT),
  material_locations: via(REQUIREMENT), material_location_events: via(REQUIREMENT),
  reservations: via(ISO, REQUIREMENT),
  service_requests: via(['spoolId', 'spools'], REQUIREMENT),
  spool_moves: via(['spoolId', 'spools']),
  // Procurement and inventory: an order without a project and a storehouse without a main project are shared.
  orders: shared(PROJECT),
  order_lines: shared(ISO, ['orderId', 'orders']),
  receipts: shared(['lineId', 'order_lines'], ['orderId', 'orders'], WAREHOUSE),
  stock: shared(WAREHOUSE),
  movements: shared(ISO, SITE, WAREHOUSE),
  picklists: shared(ISO, WAREHOUSE),
  transfer_orders: shared(SITE, ['fromWarehouseId', 'warehouses'], ['toWarehouseId', 'warehouses']),
  transfer_order_items: via(['orderId', 'transfer_orders']),
  // Welding catalogs and welder data (global); their links to projects and sites follow the linked record.
  roles: 'global', welder_customs_catalog: 'global', certificate_types: 'global', welders: 'global', welder_certificates: 'global',
  weld_processes: 'global', weld_types: 'global', coatings: 'global', diameters: 'global', qualification_options: 'global',
  pqr: 'global', wps: 'global', ndt_groups: 'global', ndt_processes: 'global', ndt_defect_codes: 'global',
  ndt_locations: 'global', pwht_processes: 'global', pwht_locations: 'global', qa_engineers: 'global', attachment_names: 'global', itps: 'global',
  wps_pqr: 'global', welder_customs: 'global',
  wps_projects: via(PROJECT), wps_sites: via(SITE), itp_projects: via(PROJECT), welder_sites: via(SITE),
  certificate_projects: via(PROJECT), wire_projects: via(PROJECT),
  // A welding wire belongs to one main project like a certificate.
  welding_wires: shared(SITE),
  // Welding records
  welds: via(ISO),
  inspection_requests: via(['weldId', 'welds']),
  inspection_results: via(['weldId', 'welds'], ['requestId', 'inspection_requests']),
  field_packages: via(PROJECT),
  test_systems: shared(PROJECT),
  hydrotest_requests: via(['testSystemId', 'test_systems']),
  hydrotest_results: via(['testSystemId', 'test_systems']),
  releases: via(ISO),
  visual_reports: via(ISO),
  punchlists: via(ISO, PROJECT),
  flanges: via(ISO),
  daily_reports: via(PROJECT),
  // Tools (not delivered with pilots): follow the warehouse.
  articles: 'global', clients: shared(WAREHOUSE), tool_stock: shared(WAREHOUSE), rentals: shared(WAREHOUSE), tool_movements: shared(WAREHOUSE),
  // System
  signatures: 'global', company_data: 'global', profiles: 'global', users: 'global',
  // A notification of a main project follows that main project; one without a main project belongs to its account alone.
  notifications: shared(SITE),
};
