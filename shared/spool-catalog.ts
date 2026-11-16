import type { Row } from './types.ts';

/**
 * Spools as a site-enabled name catalog (reference: Weld data → Spools and MTO Pilot → Materials → Spools).
 *
 * `spool_names` holds the names (Spool name, Abbreviation); each main project switches a name on or off through the
 * generic `catalog_sites` links (shared/weld-catalogs.ts, "no link = enabled"). Duplicates are allowed, as in the reference.
 * The spool of an isometric (`spools`: logistics location, history, test system, service requests) stays its own record:
 * it is created the first time a weld of that isometric picks the name (server/spool-catalog.ts), and an existing one is
 * reused. Existing spools and welds are never changed.
 */
export const SPOOL_NAMES = 'spool_names';
/** Request name of the weld form's Spool select (a catalog name); the server turns it into the weld's spoolId. */
export const SPOOL_NAME_INPUT = 'spoolName';
export const SPOOL_CHOICE_MESSAGES = {
  notEnabled: 'Choose a spool that is enabled on this main project.',
  usedElsewhere: 'This spool is already used on another isometric of this project.',
  text: 'Choose a spool from the list.',
};

const text = (value: unknown) => String(value ?? '').trim();
const live = (rows: readonly Row[]) => rows.filter(row => !row._archived);

/** One entry of the weld form's Spool select: a name, and the isometric's own spool record of that name when it has one. */
export interface SpoolOption { name: string; spoolId?: string }

/**
 * What the weld form's Spool select offers on one isometric: the catalog names enabled on its main project (in catalog
 * order, one entry per name) minus the names already used on another isometric of the same project, followed by the
 * names of this isometric's own spools that are not listed yet (a name used here stays offered, switched off or not).
 * `spoolsOfProject` are the spools of every isometric of the isometric's project.
 */
export function spoolOptionsForIso(catalog: readonly Row[], enabledOnSite: (row: Row) => boolean, spoolsOfProject: readonly Row[], isoId: string): SpoolOption[] {
  const spools = live(spoolsOfProject);
  const own = new Map<string, string>();
  for (const spool of spools.filter(row => row.isoId === isoId)) { const name = text(spool.name); if (name && !own.has(name)) own.set(name, spool.id); }
  const elsewhere = new Set(spools.filter(row => row.isoId !== isoId).map(row => text(row.name)).filter(name => name && !own.has(name)));
  const options: SpoolOption[] = [], listed = new Set<string>();
  const push = (name: string) => { listed.add(name); options.push(own.has(name) ? { name, spoolId: own.get(name) } : { name }); };
  for (const row of live(catalog)) { const name = text(row.name); if (name && !listed.has(name) && !elsewhere.has(name) && enabledOnSite(row)) push(name); }
  for (const name of [...own.keys()].filter(name => !listed.has(name)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) push(name);
  return options;
}

/**
 * Why a name cannot be chosen on the isometric ('' when it can): it is offered (spoolOptionsForIso), or the refusal says
 * whether it is used on another isometric of the project or not enabled on the main project.
 */
export function spoolChoiceError(name: unknown, catalog: readonly Row[], enabledOnSite: (row: Row) => boolean, spoolsOfProject: readonly Row[], isoId: string): string {
  if (typeof name !== 'string') return SPOOL_CHOICE_MESSAGES.text;
  const wanted = text(name);
  if (!wanted || spoolOptionsForIso(catalog, enabledOnSite, spoolsOfProject, isoId).some(option => option.name === wanted)) return '';
  const enabled = live(catalog).some(row => text(row.name) === wanted && enabledOnSite(row));
  return enabled ? SPOOL_CHOICE_MESSAGES.usedElsewhere : SPOOL_CHOICE_MESSAGES.notEnabled;
}

/** The isometric's spool of that name when it exists, else the record to create on first use (name and isometric only). */
export function firstUseSpool(isoId: string, name: string, existing: readonly Row[]): { spool: Row } | { create: { name: string; isoId: string } } {
  const wanted = text(name);
  const spool = live(existing).find(row => row.isoId === isoId && text(row.name) === wanted);
  return spool ? { spool } : { create: { name: wanted, isoId } };
}

/**
 * The catalog entries the upgrade adds for existing spools: one per distinct spool name that no catalog entry carries yet,
 * in the order the names are first met; the abbreviation is the name (spools never had one).
 */
export function missingSpoolNames(spools: readonly Row[], catalog: readonly Row[]): { name: string; abbreviation: string }[] {
  const known = new Set(catalog.map(row => text(row.name)));
  const added: { name: string; abbreviation: string }[] = [];
  for (const spool of spools) { const name = text(spool.name); if (name && !known.has(name)) { known.add(name); added.push({ name, abbreviation: name }); } }
  return added;
}
