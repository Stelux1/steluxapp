import type { DataStep } from './hosted-preparation.ts';
import type { Store } from './store.ts';
import { upgradeWeldCatalogs } from './catalog-upgrade.ts';
import { loadDiameterCatalog, missingDiameterCatalog } from './diameter-catalog.ts';
import { migrateProjectHoldings } from './mto-stock.ts';
import { seedSpoolNames } from './spool-catalog.ts';

/**
 * The data steps of the hosted preparation (server/prepare-welding.ts), in order. Every step only inserts: no step
 * updates or deletes a stored row (tests/hosted-preparation.test.ts proves it on a live-like workspace). A value an
 * older record lacks is worked out when it is read (for example a spool without a test system of its own follows its
 * isometric, shared/hydrotest.ts `spoolTestSystemId`), never written onto it here.
 */
export const hostedDataSteps = (store: () => Store): DataStep[] => [
  // The data this release ships: the missing standard defect codes, added only (server/catalog-upgrade.ts).
  { name: 'catalogData', run: options => upgradeWeldCatalogs(store(), options) },
  // The reference diameter catalog: adds the diameters the workspace does not hold and never changes one that exists.
  { name: 'diameterCatalog', run: ({ dryRun: counting }) => ({ added: counting ? missingDiameterCatalog(store()).length : loadDiameterCatalog(store()) }) },
  // MTO stock: what the first version kept as an invisible project holding is added to that project site's Material
  // inventory as a new row with one new movement; the old rows stay as stored (server/mto-stock.ts).
  { name: 'projectHoldings', run: options => migrateProjectHoldings(store(), options) },
  // The spool name catalog (Weld data → Spools): one name per distinct name of the existing spools, added only; spools and welds stay as stored.
  { name: 'spoolNames', run: options => seedSpoolNames(store(), options) },
];
