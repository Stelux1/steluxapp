import { STANDARD_DEFECT_CODES, standardDefectCodeData, standardDefectCodeId } from '../shared/defect-codes.ts';
import { SYSTEM, type Actor, type Store } from './store.ts';

/**
 * Data the hosted upgrade step ships to an existing workspace, after the schema preparation (server/prepare-welding.ts).
 * Idempotent: a second run changes and adds nothing. Nothing is renamed, dropped or archived.
 * - Standard defect codes (shared/defect-codes.ts): each one is matched on (code, norm) among the active codes. A match
 *   is marked as a standard (locked) code and takes the standard texts; a missing one is added. Codes a client added
 *   itself (other code or norm) and the old sample codes stay exactly as they are.
 * - QA/QC engineers: the Company is free text now; an engineer saved with a company record gets that company's name.
 */
export interface CatalogUpgrade { defectCodesAdded: number; defectCodesMarked: number; engineersFilled: number }
export function upgradeWeldCatalogs(store: Store, options: { dryRun?: boolean; actor?: Actor } = {}): CatalogUpgrade {
  const actor = options.actor ?? SYSTEM, result: CatalogUpgrade = { defectCodesAdded: 0, defectCodesMarked: 0, engineersFilled: 0 };
  const apply = () => {
    const stored = store.list('ndt_defect_codes'), taken = new Set(store.list('ndt_defect_codes', true).map(row => row.id));
    for (const standard of STANDARD_DEFECT_CODES) {
      const data = standardDefectCodeData(standard), match = stored.find(row => row.code === standard[0] && row.norm === standard[4]);
      if (!match && taken.has(standardDefectCodeId(standard[0], standard[4]))) continue; // switched off by hand (archived): never brought back
      if (!match) { result.defectCodesAdded++; if (!options.dryRun) store.create('ndt_defect_codes', data, actor, standardDefectCodeId(standard[0], standard[4])); continue; }
      if (Object.entries(data).every(([name, value]) => match[name] === value)) continue;
      result.defectCodesMarked++; if (!options.dryRun) store.update('ndt_defect_codes', match.id, data, match._version, actor);
    }
    const companies = new Map(store.list('companies', true).map(company => [company.id, String(company.name)]));
    for (const engineer of store.list('qa_engineers')) {
      const company = engineer.companyId ? companies.get(String(engineer.companyId)) : undefined;
      if (String(engineer.company ?? '').trim() || !company) continue;
      result.engineersFilled++; if (!options.dryRun) store.update('qa_engineers', engineer.id, { company }, engineer._version, actor);
    }
  };
  if (options.dryRun) apply(); else store.transaction(apply);
  return result;
}
