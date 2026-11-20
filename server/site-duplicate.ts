import { CATALOG_SITES } from '../shared/weld-catalogs.ts';
import { copyName, duplicateFields, duplicateParts } from '../shared/site-duplicate.ts';
import type { Row } from '../shared/types.ts';
import { AppError, type Actor, type Store } from './store.ts';
import { copyMemoTemplates } from './memo-templates.ts';
import { applyDefaultSpoolNames } from './spool-catalog.ts';
import { applyDefaultDiameters } from './diameter-standard.ts';

/**
 * Duplicate Project site: a new main project named "<name> (Copy)" with the ticked settings and the ticked lists'
 * availability. Runs inside the action's transaction. Nothing that lives inside a main project is copied.
 */
export function duplicateSite(store: Store, data: Record<string, unknown>, actor: Actor): { resource: string; record?: Row; records?: Row[] } {
  const source = store.get('sites', data.siteId);
  const parts = duplicateParts(data.parts ?? []);
  if (!parts) throw new AppError(422, 'Choose from the listed options.', { parts: 'Choose from the listed options.' });
  const copied: Record<string, unknown> = {};
  for (const part of parts) for (const name of duplicateFields(part)) if (source[name] !== undefined && source[name] !== null && source[name] !== '') copied[name] = source[name];
  const site = store.create('sites', { name: copyName(String(source.name), store.list('sites').map(row => String(row.name))), ...copied }, actor);
  for (const part of parts) {
    if (part.catalog) for (const link of store.list(CATALOG_SITES).filter(row => row.resourceKey === part.catalog && row.siteId === source.id)) store.create(CATALOG_SITES, { resourceKey: part.catalog, recordId: link.recordId, siteId: site.id, enabled: link.enabled !== false }, actor);
    if (part.records === 'memo-templates') copyMemoTemplates(store, source.id, site.id, actor);
    // A WPS saved in a main project belongs to it (shared/welder-data.ts → SITE_OWNED, client 20.11.2026): it is not switched on
    // in the copy, which fills in its own; an older WPS shared by the main projects is, as before.
    const owned = part.links?.resource === 'wps_sites' ? new Set(store.list('wps', true).filter(row => String(row.siteId ?? '')).map(row => row.id)) : new Set<string>();
    if (part.links) for (const link of store.list(part.links.resource).filter(row => row.siteId === source.id && !owned.has(String(row[part.links!.ownerKey])))) store.create(part.links.resource, { [part.links.ownerKey]: link[part.links.ownerKey], siteId: site.id, ownerArchived: link.ownerArchived === true }, actor);
  }
  // The Spools list ticked: the copy has the source's spool names (above). Not ticked: the copy starts as any new main project, with the names A to Z.
  if (!parts.some(part => part.key === 'spools')) applyDefaultSpoolNames(store, site.id, actor);
  // The diameter list is never copied: the copy starts with the 36 sizes of its Diameter standard (copied with Project settings, else ASME (inch)) and every other diameter off.
  applyDefaultDiameters(store, site.id, actor);
  return { resource: 'sites', record: site };
}
