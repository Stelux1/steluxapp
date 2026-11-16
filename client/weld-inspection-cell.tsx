import type { Row } from '../shared/types.ts';

/** The four inspection cells of the weld table: visual inspection, NDT Pre, NDT and Pre-HT / PWHT. */
export type InspectionKind = 'VI' | 'NDT PRE' | 'NDT' | 'PWHT';

/**
 * Minimal cell of the weld table: Yes / No from the weld's requirement flags only. The inspection flow replaces
 * this file with the cell that opens the per-weld dialogs and shows results; the props stay the same.
 */
const FLAGS: Record<InspectionKind, string[]> = { VI: ['viReq'], 'NDT PRE': ['ndoReqPre'], NDT: ['ndoReq'], PWHT: ['pwhtReqPre', 'pwhtReq'] };
const NAMES: Record<InspectionKind, string> = { VI: 'Visual inspection', 'NDT PRE': 'NDT (Pre)', NDT: 'NDT', PWHT: 'Pre-HT / PWHT' };
export function InspectionCell({ weld, kind }: { weld: Row; kind: InspectionKind }) {
  const required = FLAGS[kind].some(name => weld[name] === true);
  return <span className={`weld-flag ${required ? 'yes' : 'no'}`}><span className="sr-only">{NAMES[kind]}: </span>{required ? 'Yes' : 'No'}</span>;
}
