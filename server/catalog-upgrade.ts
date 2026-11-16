import { STANDARD_DEFECT_CODES, standardDefectCodeData, standardDefectCodeId } from '../shared/defect-codes.ts';
import { SYSTEM, type Actor, type Store } from './store.ts';

/**
 * Data the hosted upgrade step ships to an existing workspace, after the schema preparation (server/prepare-welding.ts).
 * The owner's rule: an upgrade of the live database only ADDS. It never changes, renames, archives or removes a stored
 * record, and a second run adds nothing.
 * - Standard defect codes (shared/defect-codes.ts): each one is matched on (code, norm) among the active codes. A missing
 *   one is added; a match stays exactly as stored (its texts are the client's own) and counts as the standard code when
 *   read (isStandardDefectCode: locked, edit and delete refused, switchable per main project). Codes a client added with
 *   another code or norm stay as they are; a standard code switched off by hand (archived) is never brought back.
 * - QA/QC engineers: nothing is written. An engineer saved with a company record and no Company text shows that
 *   company's name when read (qaEngineerCompany in shared/weld-catalogs.ts).
 */
export interface CatalogUpgrade { defectCodesAdded: number }
export function upgradeWeldCatalogs(store: Store, options: { dryRun?: boolean; actor?: Actor } = {}): CatalogUpgrade {
  const actor = options.actor ?? SYSTEM, result: CatalogUpgrade = { defectCodesAdded: 0 };
  const apply = () => {
    const stored = store.list('ndt_defect_codes'), taken = new Set(store.list('ndt_defect_codes', true).map(row => row.id));
    for (const standard of STANDARD_DEFECT_CODES) {
      const id = standardDefectCodeId(standard[0], standard[4]);
      if (taken.has(id) || stored.some(row => row.code === standard[0] && row.norm === standard[4])) continue;
      result.defectCodesAdded++; if (!options.dryRun) store.create('ndt_defect_codes', standardDefectCodeData(standard), actor, id);
    }
  };
  if (options.dryRun) apply(); else store.transaction(apply);
  return result;
}
