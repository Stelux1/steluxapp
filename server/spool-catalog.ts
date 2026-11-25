import { CATALOG_SITES, enabledOnSite } from '../shared/weld-catalogs.ts';
import { SPOOL_LETTERS, SPOOL_NAMES, firstUseSpool, missingSpoolNames, spoolChoiceError, type SpoolImportEntry } from '../shared/spool-catalog.ts';
import { AppError, SYSTEM, type Actor, type Store } from './store.ts';
import { availabilityLinks, reloadAvailabilityLinks, setAvailability, type AvailabilityLinks } from './weld-catalogs.ts';
import { withEveryMainProject } from './site-scope.ts';

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

/** The catalog record a name stands for: the first live one of that exact name, else a new one that is off on every other main project (it is not enabled here yet). */
function catalogRecordOf(store: Store, name: string, abbreviation: string, siteId: string, actor: Actor, links?: AvailabilityLinks): string {
  const found = store.list(SPOOL_NAMES).find(row => String(row.name ?? '').trim() === name);
  if (found) return found.id;
  const created = store.create(SPOOL_NAMES, { name, abbreviation }, actor);
  if (links) reloadAvailabilityLinks(store, SPOOL_NAMES, links);
  for (const site of store.list('sites', true)) if (site.id !== siteId) setAvailability(store, SPOOL_NAMES, created.id, site.id, false, SYSTEM, links);
  return created.id;
}

/**
 * A new main project (Add project site; Duplicate project site without its Spools list ticked): the spool names A to Z are
 * enabled for it (a catalog record of that exact name is reused, else it is created and kept off on every other main project)
 * and every other spool name gets an explicit "off" link for it. Other main projects and the spools used on welds are untouched.
 */
export function applyDefaultSpoolNames(store: Store, siteId: string, actor: Actor): void {
  withEveryMainProject(store, () => {
    const keep = new Set<string>(), links = availabilityLinks(store, SPOOL_NAMES);
    for (const letter of SPOOL_LETTERS) { const id = catalogRecordOf(store, letter, letter, siteId, actor, links); keep.add(id); setAvailability(store, SPOOL_NAMES, id, siteId, true, SYSTEM, links); }
    for (const row of store.list(SPOOL_NAMES, true)) if (!keep.has(row.id)) setAvailability(store, SPOOL_NAMES, row.id, siteId, false, SYSTEM, links);
  });
}

/** What an import of spool names does (or would do) on one main project. */
export interface SpoolImportResult { total: number; created: number; enabled: number; alreadyEnabled: number; switchedOff: number }

/**
 * Spools page → Import CSV: each name is added to the catalog when it is missing (Abbreviation as given, default the name) and
 * enabled on this main project; a name that exists keeps its record and is only switched on here. With `replace`, every other
 * spool name is switched off for this main project. Nothing is deleted, no other main project changes (a new record is off
 * there), and the spools used on welds stay. `dryRun` writes nothing and returns the same counts.
 */
export function importSpoolNames(store: Store, siteId: string, entries: readonly SpoolImportEntry[], replace: boolean, actor: Actor, dryRun = false): SpoolImportResult {
  const result: SpoolImportResult = { total: entries.length, created: 0, enabled: 0, alreadyEnabled: 0, switchedOff: 0 };
  const run = () => withEveryMainProject(store, () => {
    const enabledHere = (id: string) => enabledOnSite(SPOOL_NAMES, { id }, siteId, { [CATALOG_SITES]: store.list(CATALOG_SITES) });
    const kept = new Set<string>();
    for (const entry of entries) {
      const matches = store.list(SPOOL_NAMES).filter(row => String(row.name ?? '').trim() === entry.name);
      if (!matches.length) { result.created++; if (!dryRun) { const id = catalogRecordOf(store, entry.name, entry.abbreviation, siteId, actor); kept.add(id); setAvailability(store, SPOOL_NAMES, id, siteId, true, SYSTEM); } continue; }
      let changed = false;
      for (const row of matches) { kept.add(row.id); if (!enabledHere(row.id)) { changed = true; if (!dryRun) setAvailability(store, SPOOL_NAMES, row.id, siteId, true, SYSTEM); } }
      if (changed) result.enabled++; else result.alreadyEnabled++;
    }
    if (replace) for (const row of store.list(SPOOL_NAMES)) if (!kept.has(row.id) && enabledHere(row.id)) { result.switchedOff++; if (!dryRun) setAvailability(store, SPOOL_NAMES, row.id, siteId, false, SYSTEM); }
  });
  if (dryRun) { run(); return result; }
  return store.transaction(() => { run(); return result; });
}
