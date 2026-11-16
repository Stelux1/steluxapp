import { useState } from 'react';
import { Check, FileText, MoreHorizontal, Printer, X } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { KIND_LABELS, inspectionCellState, workspaceCellRows, type InspectionKind } from '../shared/inspections.ts';
import { apiUrl } from './api.ts';
import { useWorkspace } from './context.tsx';
import { InspectionDialog } from './inspections.tsx';

/**
 * One inspection cell of the isometric's weld table (VI, NDT (Pre), NDT, Pre-HT/PWHT): "No" when not required,
 * "Yes" while open, then ✔ accepted, ✖ not accepted, ••• request made / result pending, a T button for the
 * tracer details, the report file and the request document. Clicking the cell opens the matching dialog.
 */
export function InspectionCell({ weld, kind }: { weld: Row; kind: InspectionKind }) {
  const { rows, canRecord } = useWorkspace();
  const [open, setOpen] = useState<'cell' | 'tracer' | null>(null);
  const state = inspectionCellState(weld, kind, workspaceCellRows(rows));
  const readable = canRecord('inspection_results') || canRecord('inspection_requests');
  const name = `${KIND_LABELS[kind]} of weld ${weld.weldNo}`;
  const status = !state.required ? 'not required' : state.status === 'accepted' ? 'accepted' : state.status === 'rejected' ? 'not accepted' : state.status === 'requested' ? 'requested, result pending' : state.status === 'not-applicable' ? 'not applicable' : 'open';
  return <span className={`inspection-cell ${state.required ? state.status === 'accepted' || state.status === 'not-applicable' ? 'done' : 'due' : 'none'}`}>
    <button type="button" className="inspection-cell-main" disabled={!readable} onClick={() => setOpen('cell')} aria-label={`${name}: ${status}`} title={status}>
      {state.required ? 'Yes' : 'No'}
      {state.status === 'accepted' && <Check size={13} aria-hidden="true"/>}
      {state.status === 'rejected' && <X size={13} aria-hidden="true"/>}
      {state.status === 'requested' && <MoreHorizontal size={13} aria-hidden="true"/>}
    </button>
    {state.tracer && <button type="button" className="inspection-cell-tracer" onClick={() => setOpen('tracer')} aria-label={`Tracer details of weld ${weld.weldNo}`} title="Tracer details">T</button>}
    {state.reportFiles[0] && <a className="inspection-cell-file" href={apiUrl(`/files/${state.reportFiles[0].id}`)} aria-label={`Report file of ${name}`} title="Report file"><FileText size={13}/></a>}
    {state.requestFiles[0] && <a className="inspection-cell-file" href={apiUrl(`/files/${state.requestFiles[0].id}`)} aria-label={`Request document of ${name}`} title="Request document"><Printer size={13}/></a>}
    {open && <InspectionDialog weld={weld} kind={kind} tracer={open === 'tracer'} onClose={() => setOpen(null)}/>}
  </span>;
}
