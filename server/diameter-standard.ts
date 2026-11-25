import { CATALOG_SITES, enabledOnSite } from '../shared/weld-catalogs.ts';
import { DIAMETER_CHART, DIAMETER_STANDARDS, chartRecord, diameterStandard, type DiameterStandard } from '../shared/diameter-standard.ts';
import type { Row } from '../shared/types.ts';
import { SYSTEM, type Actor, type Store } from './store.ts';
import { availabilityLinks, reloadAvailabilityLinks, setAvailability, type AvailabilityLinks } from './weld-catalogs.ts';
import { withEveryMainProject } from './site-scope.ts';

/**
 * Server side of the main project's "Diameter standard" (shared/diameter-standard.ts). Weld diameters are one workspace-wide
 * catalog; a main project switches a diameter on or off through catalog_sites. Nothing here rewrites a stored diameter: a record of
 * the chart's exact name is reused, a missing one is created (and kept off on every other main project).
 */

/** The live record the chart size stands for (first of that exact name; `DN50` written without the space counts as `DN 50`), else a new one that is off on every other main project. */
function chartRecordOf(store: Store, index: number, standard: DiameterStandard, siteId: string, actor: Actor, links: AvailabilityLinks): string {
  const size = DIAMETER_CHART[index], record = chartRecord(size, standard, index), name = String(record.diameter);
  const found = store.list('diameters').find(row => String(row.diameter ?? '').trim() === name);
  if (found) return found.id;
  const created = store.create('diameters', record, actor);
  reloadAvailabilityLinks(store, 'diameters', links);
  for (const site of store.list('sites', true)) if (site.id !== siteId) setAvailability(store, 'diameters', created.id, site.id, false, SYSTEM, links);
  return created.id;
}

/** Switch the 36 sizes of a standard on for a main project (creating the missing records); returns their ids. */
function enableChart(store: Store, siteId: string, standard: DiameterStandard, actor: Actor, links: AvailabilityLinks = availabilityLinks(store, 'diameters')): Set<string> {
  const ids = new Set<string>();
  for (let index = 0; index < DIAMETER_CHART.length; index++) { const id = chartRecordOf(store, index, standard, siteId, actor, links); ids.add(id); setAvailability(store, 'diameters', id, siteId, true, SYSTEM, links); }
  return ids;
}

/**
 * A new main project (Add project site; Duplicate project site, whose copy never takes over the diameter list): the 36 sizes of its
 * Diameter standard are enabled for it and every other diameter gets an explicit "off" link for it. Other main projects are untouched.
 */
export function applyDefaultDiameters(store: Store, siteId: string, actor: Actor): void {
  withEveryMainProject(store, () => {
    const links = availabilityLinks(store, 'diameters');
    const keep = enableChart(store, siteId, diameterStandard(store.get('sites', siteId, true)), actor, links);
    for (const row of store.list('diameters', true)) if (!keep.has(row.id)) setAvailability(store, 'diameters', row.id, siteId, false, SYSTEM, links);
  });
}

/**
 * After a main project is saved with another Diameter standard: that standard's 36 sizes are switched on as well. Nothing is
 * switched off, so a diameter a weld of the main project uses stays available. An older main project (no diameter links) already
 * sees every diameter; its missing DN / chart records are created and stay off on the other main projects.
 */
export function diameterStandardSaved(store: Store, existing: Row, saved: Row, actor: Actor): void {
  if (!store.hostedRules || diameterStandard(existing) === diameterStandard(saved)) return;
  withEveryMainProject(store, () => { enableChart(store, saved.id, diameterStandard(saved), actor); });
}

/** The diameters a main project offers (enabled on it), as the Weld diameters list and the weld form show them. */
export const diametersOnSite = (store: Store, siteId: string): Row[] => {
  const rows = { [CATALOG_SITES]: store.list(CATALOG_SITES) };
  return store.list('diameters').filter(row => enabledOnSite('diameters', row, siteId, rows));
};
