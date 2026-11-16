import { projectRow, resourceAvailable, rowAvailable } from '../shared/release.ts';
import { isoSummaries, type IsoSummary } from '../shared/iso-summary.ts';
import type { Availability, Row } from '../shared/types.ts';
import type { Store } from './store.ts';

/**
 * DELIBERATE PILOT-BOUNDARY CROSSING (1 of 2; the other is `copyParts` in `server/release-access.ts`).
 *
 * Inside a pilot the other pilot's records are refused. The isometric header and the isometrics list must
 * nevertheless show the same numbers in Weld Pilot and MTO Pilot, so the summaries are computed here from every
 * record the release profile delivers (welds, inspection results, releases, punch items, material requirements),
 * whatever the caller's pilot or profile may read. Only aggregates leave this function (see `IsoSummary`):
 * percentages, counts per blocker group and yes / no flags, never a weld, result, welder or material line.
 *
 * `isometrics` must already be the caller's visible isometrics (release projection, isometric permission and
 * per-pilot project enablement); a summary is produced for exactly those. Cost: one read of each collection
 * and one grouping pass per request, then per-isometric work over that isometric's own rows.
 */
export function isoSummariesFor(store: Store, availability: Availability | undefined, isometrics: Row[]): Record<string, IsoSummary> {
  if (!isometrics.length) return {};
  const load = (key: string) => resourceAvailable(availability, key) ? store.list(key, true).filter(row => rowAvailable(availability, key, row)).map(row => projectRow(availability, key, row)) : null;
  return isoSummaries({
    isometrics, projects: load('projects') || [], sites: load('sites') || [],
    welds: load('welds'), weldTypes: load('weld_types'), diameters: load('diameters'), results: load('inspection_results'),
    releases: load('releases'), punch: load('punchlists'), testSystems: load('test_systems'), hydrotestRequests: load('hydrotest_requests'), requirements: load('iso_materials'),
    materials: load('materials'), customMaterials: load('custom_materials'), operationPhases: load('operation_phases'),
    planning: Boolean(availability?.features.includes('project-planning')),
  });
}
