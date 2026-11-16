import { CATALOG_SITES } from '../shared/weld-catalogs.ts';
import { copyName, duplicateFields, duplicateParts } from '../shared/site-duplicate.ts';
import type { Row } from '../shared/types.ts';
import { AppError, type Actor, type Store } from './store.ts';

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
    if (part.links) for (const link of store.list(part.links.resource).filter(row => row.siteId === source.id)) store.create(part.links.resource, { [part.links.ownerKey]: link[part.links.ownerKey], siteId: site.id, ownerArchived: link.ownerArchived === true }, actor);
  }
  return { resource: 'sites', record: site };
}
