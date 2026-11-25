import { projectRow, resourceAvailable, rowAvailable } from '../shared/release.ts';
import { isoSummaries, projectStatuses, type IsoSummary } from '../shared/iso-summary.ts';
import type { Availability, Row } from '../shared/types.ts';
import type { Store } from './store.ts';
import { withLegacyStock } from './mto-stock.ts';

/**
 * DELIBERATE PILOT-BOUNDARY CROSSING (1 of 2; the other is `copyParts` in `server/release-access.ts`).
 *
 * Inside a pilot the other pilot's records are refused. The isometric header and the isometrics list must
 * nevertheless show the same numbers in Weld Pilot and MTO Pilot, so the summaries are computed here from every
 * record the release profile delivers (welds, inspection results, releases, punch items, flanges, test systems, spools, hydrotest releases and results, material requirements with
 * the orders, stock and pick lists that cover them),
 * whatever the caller's pilot or profile may read. Only aggregates leave this function (see `IsoSummary`):
 * percentages, counts per blocker group, punch counts, budget totals and yes / no flags, never a weld, result, welder or material line,
 * plus one label: the name of the isometric's own test system (`testSystemName`), for the isometrics passed in only
 * and only when that test system belongs to the isometric's project or to none (see `isoSummaries`).
 *
 * `isometrics` must already be the caller's visible isometrics (release projection, isometric permission and
 * per-pilot project enablement); a summary is produced for exactly those. Cost: one read of each collection
 * and one grouping pass per request, then per-isometric work over that isometric's own rows.
 */
export function isoSummariesFor(store: Store, availability: Availability | undefined, isometrics: Row[]): Record<string, IsoSummary> {
  if (!isometrics.length) return {};
  // Test systems are read whole (their project is no longer delivered in the hosted profile): only their names leave,
  // and only under the project rule of `testSystemName` in shared/iso-summary.ts.
  // Stock rows of the old model carry their derived main project before the projection drops the storehouse's (server/mto-stock.ts withLegacyStock).
  const load = (key: string) => resourceAvailable(availability, key) ? (key === 'stock' ? withLegacyStock(store, store.list(key, true)) : store.list(key, true)).filter(row => rowAvailable(availability, key, row)).map(row => projectRow(availability, key, row)) : null;
  return isoSummaries({
    isometrics, projects: load('projects') || [], sites: load('sites') || [],
    welds: load('welds'), weldTypes: load('weld_types'), diameters: load('diameters'), results: load('inspection_results'),
    releases: load('releases'), punch: load('punchlists'), flanges: load('flanges'), testSystems: resourceAvailable(availability, 'test_systems') ? store.list('test_systems', true).filter(row => rowAvailable(availability, 'test_systems', row)) : null, hydrotestRequests: load('hydrotest_requests'), spools: load('spools'), hydrotestResults: load('hydrotest_results'), requirements: load('iso_materials'),
    materials: load('materials'), customMaterials: load('custom_materials'), operationPhases: load('operation_phases'),
    orders: load('orders'), orderLines: load('order_lines'), stock: load('stock'), warehouses: load('warehouses'), picklists: load('picklists'), reservations: load('reservations'), allIsometrics: load('isometrics'),
    calculations: load('calculation_lines'), attachments: load('attachments'), revisions: load('revisions'),
    planning: Boolean(availability?.features.includes('project-planning')),
  });
}

/**
 * The same crossing for the Projects list: Status (%) of each of the caller's visible `projects`, from every weld of
 * their isometrics (shared/iso-summary.ts `projectStatuses`), so MTO Pilot shows the figure Weld Pilot shows. Only one
 * number per project leaves.
 */
export function projectStatusesFor(store: Store, availability: Availability | undefined, projects: Row[]): Record<string, number> {
  if (!projects.length || !resourceAvailable(availability, 'welds')) return {};
  const load = (key: string) => resourceAvailable(availability, key) ? store.list(key, true).filter(row => rowAvailable(availability, key, row)).map(row => projectRow(availability, key, row)) : null;
  return projectStatuses({ projects, isometrics: load('isometrics') || [], welds: (load('welds') || []).filter(row => !row._archived), diameters: load('diameters') });
}
