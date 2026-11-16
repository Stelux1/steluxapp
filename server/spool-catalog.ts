import { CATALOG_SITES, enabledOnSite } from '../shared/weld-catalogs.ts';
import { SPOOL_NAMES, firstUseSpool, missingSpoolNames, spoolChoiceError } from '../shared/spool-catalog.ts';
import { AppError, SYSTEM, type Actor, type Store } from './store.ts';

/**
 * Server side of the spool name catalog (shared/spool-catalog.ts): the weld form's Spool choice and the upgrade step that
 * fills the catalog from the spools a workspace already holds. Both only add records; no spool or weld is changed.
 */

/** What a weld save does with a chosen name: keep / point at an existing spool, or create the isometric's spool first. */
export type WeldSpoolChoice = { spoolId: string } | { create: { name: string; isoId: string } };

/**
 * Check the name the weld form sends (`spoolName`) for a weld of `isoId` and say which spool it stands for. '' clears the
 * spool. A name must be offered on the isometric (enabled on its main project and not used on another isometric of the
 * same project, or one of this isometric's own spools); anything else is refused on the Spool field. Writes nothing.
 */
export function weldSpoolChoice(store: Store, isoId: string, name: unknown): WeldSpoolChoice {
  if (name === '') return { spoolId: '' };
  const iso = store.get('isometrics', isoId, true);
  let siteId = '';
  try { siteId = String(store.get('projects', iso.projectId, true).siteId ?? ''); } catch { /* an isometric without a project: no site enablement applies */ }
  const isoIds = new Set(store.list('isometrics').filter(row => row.projectId === iso.projectId).map(row => row.id)); isoIds.add(iso.id);
  const spools = store.list('spools').filter(row => isoIds.has(String(row.isoId)));
  const rows = { [CATALOG_SITES]: store.list(CATALOG_SITES) };
  const error = spoolChoiceError(name, store.list(SPOOL_NAMES), row => enabledOnSite(SPOOL_NAMES, row, siteId, rows), spools, iso.id);
  if (error) throw new AppError(422, error, { spoolId: error });
  const found = firstUseSpool(iso.id, String(name), spools);
  return 'spool' in found ? { spoolId: found.spool.id } : found;
}

/** The weld's spoolId for a checked choice: the isometric's spool record is created on first use, inside the save's transaction. */
export function applyWeldSpool(store: Store, choice: WeldSpoolChoice, actor: Actor): string {
  if ('spoolId' in choice) return choice.spoolId;
  return store.create('spools', choice.create, actor).id;
}

/**
 * Upgrade step (server/hosted-data-steps.ts): one catalog name per distinct name of the existing spools, abbreviation = name.
 * A name the catalog already holds (archived entries included) is skipped, so a second run adds nothing; the dry run only
 * counts. The new names carry no site links, so they count as enabled on every main project ("no link = enabled").
 */
export interface SpoolNamesUpgrade { spoolNamesAdded: number }
export function seedSpoolNames(store: Store, options: { dryRun?: boolean; actor?: Actor } = {}): SpoolNamesUpgrade {
  const actor = options.actor ?? SYSTEM;
  const plan = () => missingSpoolNames(store.list('spools'), store.list(SPOOL_NAMES, true));
  if (options.dryRun) return { spoolNamesAdded: plan().length };
  return store.transaction(() => { const added = plan(); for (const entry of added) store.create(SPOOL_NAMES, entry, actor); return { spoolNamesAdded: added.length }; });
}
