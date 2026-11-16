import { DIAMETER_CATALOG } from '../shared/diameter-catalog-data.ts';
import { diameterCatalogId, diameterRecord, missingDiameters, type DiameterCatalogRow } from '../shared/diameter-catalog.ts';
import { SYSTEM, type Store } from './store.ts';

/** Catalog diameters the workspace does not hold yet. Reads only. */
export const missingDiameterCatalog = (store: Store, catalog: DiameterCatalogRow[] = DIAMETER_CATALOG) => missingDiameters(catalog, store.list('diameters', true));

/**
 * Add the diameters of the reference catalog the workspace does not hold. A diameter that exists (active or deleted, same text) is
 * never changed, so what a customer entered stays as it is; running it again adds nothing. Used by the sample workspace and by the
 * hosted preparation step. Returns the number of diameters added.
 */
export function loadDiameterCatalog(store: Store, catalog: DiameterCatalogRow[] = DIAMETER_CATALOG): number {
  const missing = missingDiameterCatalog(store, catalog);
  if (!missing.length) return 0;
  store.transaction(() => { for (const row of missing) store.create('diameters', diameterRecord(row), SYSTEM, diameterCatalogId(row)); });
  return missing.length;
}
