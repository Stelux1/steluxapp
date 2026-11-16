import { useState } from 'react';
import { Printer } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { PdfDialog, pdfEntries } from './pdf-reports.tsx';

/**
 * "Print" of the materials of an isometric in MTO Pilot (the button of the Materials toolbar): opens the options dialog
 * of the MTO report (all operation phases or one) and downloads the PDF. Shown only to accounts with the MTO report.
 */
export function MtoPrintButton({ iso }: { iso: Row }) {
  const { canReadReport } = useWorkspace(); const pilot = usePilot();
  const [open, setOpen] = useState(false);
  const item = pdfEntries(pilot?.pilot.key, 'materials').find(entry => entry.key === 'mto-report');
  if (!item || !canReadReport(item.report)) return null;
  return <>
    <button type="button" className="btn" onClick={() => setOpen(true)}><Printer size={15}/>Print</button>
    {open && <PdfDialog item={item} iso={iso} onClose={() => setOpen(false)}/>}
  </>;
}
