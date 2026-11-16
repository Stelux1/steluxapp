import { useState } from 'react';
import { Check, FileText, MoreHorizontal, Printer, X } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { KIND_LABELS, cellStatusTitle, inspectionCellState, viCellText, workspaceCellRows, type InspectionKind } from '../shared/inspections.ts';
import { apiUrl } from './api.ts';
import { useWorkspace } from './context.tsx';
import { InspectionDialog, MassRequestDialog, WeldArchiveDialog } from './inspections.tsx';

/** Tooltip of the "Generate & Print … Request" icon, per column. */
const PRINT_TITLES: Record<InspectionKind, string> = { VI: '', 'NDT PRE': 'Generate & Print NDT Pre Request', NDT: 'Generate & Print NDT Request', PWHT: 'Generate & Print PWHT Request' };
const ARCHIVE_ICON_TITLES: Record<InspectionKind, string> = { VI: '', 'NDT PRE': 'Show NDT PRE archive', NDT: 'Show NDT archive', PWHT: 'Show PWHT archive' };

/**
 * One inspection cell of the isometric's weld table.
 * - VI follows the VT reports: "-" while the weld is on none, "---" once it is on one, then "A" (accepted) or "NA"; only the file
 *   icon is a link (the stored VI document, else the generated report PDF). The text is not a button.
 * - NDT (Pre), NDT and Pre-HT/PWHT: "No" when not required, "Yes" (opens the weld's dialog) and the status icon: ✔ Accepted,
 *   ✖ NA or ReWeld, ••• In progress; the T button on tracer welds only; the archive icon once the weld is on a request; the
 *   "Generate & Print … Request" icon while the weld still needs one.
 */
export function InspectionCell({ weld, kind }: { weld: Row; kind: InspectionKind }) {
  const { rows, canRecord, canRun, canReadReport } = useWorkspace();
  const [open, setOpen] = useState<'cell' | 'tracer' | 'archive' | 'print' | null>(null);
  const state = inspectionCellState(weld, kind, workspaceCellRows(rows));
  const readable = canRecord('inspection_results') || canRecord('inspection_requests');
  const name = `${KIND_LABELS[kind]} of weld ${weld.weldNo}`;
  if (kind === 'VI') {
    const visual = state.visual;
    const href = visual?.file ? apiUrl(`/files/${visual.file.id}`) : visual?.reportNo && canReadReport('pdf-visual-report', 'export') ? apiUrl(`/pdf/visual-report?reportNo=${encodeURIComponent(visual.reportNo)}`) : '';
    const title = !state.required ? 'not on a visual report' : state.status === 'accepted' ? 'accepted' : state.status === 'rejected' ? 'not accepted' : state.status === 'not-applicable' ? 'not applicable' : 'on a visual report, not marked yet';
    return <span className={`inspection-cell ${state.status === 'accepted' ? 'done' : state.status === 'rejected' ? 'due' : 'none'}`}>
      <span className="inspection-cell-text" aria-label={`${name}: ${title}`}>{viCellText(state)}</span>
      {href && <a className="inspection-cell-file" href={href} target="_blank" rel="noreferrer" aria-label={`Visual inspection document of ${name}`} title="Open visual inspection request archived document"><FileText size={13}/></a>}
    </span>;
  }
  const status = !state.required ? 'not required' : state.status === 'accepted' ? 'accepted' : state.status === 'reweld' ? 'not accepted, ReWeld' : state.status === 'rejected' ? 'not accepted' : state.status === 'requested' ? 'requested, result pending' : state.status === 'not-applicable' ? 'not applicable' : 'open';
  const type = kind === 'PWHT' ? 'PWHT' : kind;
  const printable = state.printable && canRun('mass-inspection-request', { type });
  const icon = state.status === 'accepted' ? <Check size={13} aria-hidden="true"/> : state.status === 'rejected' || state.status === 'reweld' ? <X size={13} aria-hidden="true"/> : state.status === 'requested' ? <MoreHorizontal size={13} aria-hidden="true"/> : null;
  return <span className={`inspection-cell ${state.required ? state.status === 'accepted' || state.status === 'not-applicable' ? 'done' : 'due' : 'none'}`}>
    <button type="button" className="inspection-cell-main" disabled={!readable} onClick={() => setOpen('cell')} aria-label={`${name}: ${status}`} title={status}>{state.required ? 'Yes' : 'No'}</button>
    {icon && <span className="inspection-cell-status" title={cellStatusTitle(state.status)} role="img" aria-label={cellStatusTitle(state.status)}>{icon}</span>}
    {state.tracer && <button type="button" className="inspection-cell-tracer" onClick={() => setOpen('tracer')} aria-label={`Tracer details of weld ${weld.weldNo}`} title="Tracer details">T</button>}
    {state.archive.length > 0 && readable && <button type="button" className="inspection-cell-file" onClick={() => setOpen('archive')} aria-label={`${ARCHIVE_ICON_TITLES[kind]} of weld ${weld.weldNo}`} title={ARCHIVE_ICON_TITLES[kind]}><FileText size={13} aria-hidden="true"/></button>}
    {printable && <button type="button" className="inspection-cell-file" onClick={() => setOpen('print')} aria-label={`${PRINT_TITLES[kind]} for weld ${weld.weldNo}`} title={PRINT_TITLES[kind]}><Printer size={13} aria-hidden="true"/></button>}
    {(open === 'cell' || open === 'tracer') && <InspectionDialog weld={weld} kind={kind} tracer={open === 'tracer'} onClose={() => setOpen(null)}/>}
    {open === 'archive' && <WeldArchiveDialog weld={weld} kind={kind} onClose={() => setOpen(null)}/>}
    {open === 'print' && <MassRequestDialog kind={kind} weldIds={[weld.id]} onClose={() => setOpen(null)}/>}
  </span>;
}
