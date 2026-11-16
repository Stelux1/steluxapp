import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { PdfDialog, pdfEntries } from './pdf-reports.tsx';

/**
 * "Certification index" button of the Certifications page (Material data): opens the options dialog (project) and
 * downloads the index. `projectId` is the project the page is currently filtered by. Shown in both pilots to
 * accounts that may read certifications.
 */
export function CertificationIndexButton({ projectId = '' }: { projectId?: string }) {
  const { canRecord } = useWorkspace(); const pilot = usePilot();
  const [open, setOpen] = useState(false);
  const item = pdfEntries(pilot?.pilot.key, 'certifications').find(entry => entry.key === 'certification-index');
  if (!item || !canRecord('certifications')) return null;
  return <>
    <button type="button" className="btn" onClick={() => setOpen(true)}><FileText size={15}/>Certification index</button>
    {open && <PdfDialog item={item} projectId={projectId} onClose={() => setOpen(false)}/>}
  </>;
}
