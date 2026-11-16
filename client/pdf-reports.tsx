import { useId, useState, type FormEvent } from 'react';
import { ChevronDown, ExternalLink, FileText, Loader2 } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { LISL_TYPES } from '../shared/pdf-lisl.ts';
import { ApiError, apiBlob, apiUrl } from './api.ts';
import { Dropdown, Modal } from './components.tsx';
import { useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';

type Option = 'type' | 'weldRecord' | 'signature';
/** One entry of the Reports menu. Another document is one more entry: its server key (`/api/pdf/<key>`), label and dialog options. */
export interface PdfMenuItem { key: string; label: string; options: Option[]; /** Report whose access rule shows the entry. */ report: string }
export const PDF_MENU: PdfMenuItem[] = [
  { key: 'lisl', label: 'LISL Report', options: ['type', 'weldRecord', 'signature'], report: 'lisl' },
  { key: 'lisl-a3', label: 'LISL Report (A3)', options: ['type', 'weldRecord', 'signature'], report: 'lisl' },
  { key: 'lisl-blank', label: 'Blank LISL template', options: ['signature'], report: 'lisl' },
  { key: 'punch-list-blank', label: 'Punch list - blank', options: [], report: 'pdf-punch' },
  { key: 'flange-report', label: 'Flange report', options: [], report: 'pdf-flanges' },
];

/** Query string of the chosen options (isometric, then the options the document offers). */
export function pdfQuery(item: PdfMenuItem, isoId: string, values: { type: string; weldRecord: boolean; signature: boolean }) {
  const query = new URLSearchParams({ isoId });
  if (item.options.includes('type')) query.set('type', values.type);
  if (item.options.includes('weldRecord')) query.set('weldRecord', values.weldRecord ? '1' : '0');
  if (item.options.includes('signature')) query.set('signature', values.signature ? '1' : '0');
  return query;
}

/** "Reports" menu of the isometric page (Weld Pilot): opens a small options dialog, then generates the PDF. */
export function PdfReportsMenu({ iso }: { iso: Row }) {
  const { canReadReport } = useWorkspace(); const pilot = usePilot();
  const [item, setItem] = useState<PdfMenuItem | null>(null);
  const items = PDF_MENU.filter(entry => canReadReport(entry.report));
  if (pilot?.pilot.key !== 'weld' || !items.length) return null;
  return <>
    <Dropdown label="Reports" trigger={<span className="btn"><FileText size={15}/>Reports<ChevronDown size={15}/></span>}>{items.map(entry => <button key={entry.key} onClick={() => setItem(entry)}>{entry.label}</button>)}</Dropdown>
    {item && <PdfDialog item={item} iso={iso} onClose={() => setItem(null)}/>}
  </>;
}

function PdfDialog({ item, iso, onClose }: { item: PdfMenuItem; iso: Row; onClose: () => void }) {
  const { rows, user } = useWorkspace(); const id = useId();
  const [type, setType] = useState('All'), [weldRecord, setWeldRecord] = useState(true), [signature, setSignature] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const hasSignature = (rows.signatures || []).some(row => !row._archived && row.userId === user.id && row.kind === 'Short signature');
  const path = `/pdf/${item.key}?${pdfQuery(item, iso.id, { type, weldRecord, signature })}`;
  async function generate(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setDone('');
    try {
      const blob = await apiBlob(path);
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${item.label.replace(/[^A-Za-z0-9]+/g, '-')}-${String(iso.isoNo).replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDone('The PDF was downloaded.');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'The PDF could not be created. Try again.'); } finally { setBusy(false); }
  }
  return <Modal title={item.label} subtitle={String(iso.isoNo)} onClose={onClose}>
    <form onSubmit={event => void generate(event)} aria-busy={busy}>
      <div className="modal-body">
        {error && <div className="alert error" role="alert">{error}</div>}
        {done && <div className="alert success" role="status">{done} <a className="text-link" href={apiUrl(path)} target="_blank" rel="noreferrer">Open in a new tab<ExternalLink size={13} aria-hidden="true"/></a></div>}
        {item.options.includes('type') && <div className="field"><label htmlFor={`${id}-type`}>Type</label><select id={`${id}-type`} value={type} disabled={busy} onChange={event => setType(event.target.value)}>{LISL_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select><small>Shop or Field follows the location of each weld type.</small></div>}
        {item.options.includes('weldRecord') && <div className="field checkbox-field"><label htmlFor={`${id}-record`}><input id={`${id}-record`} type="checkbox" checked={weldRecord} disabled={busy} onChange={event => setWeldRecord(event.target.checked)}/><span>Weld record</span></label><small>Prints the recorded charge numbers, WPS, welder, date, NDT and PWHT. Untick to leave them empty.</small></div>}
        {item.options.includes('signature') && <div className="field checkbox-field"><label htmlFor={`${id}-signature`}><input id={`${id}-signature`} type="checkbox" checked={signature} disabled={busy} onChange={event => setSignature(event.target.checked)}/><span>Signature on each page</span></label><small>{hasSignature ? 'Uses your short signature.' : 'You have not saved a short signature yet (System · Signatures); the lines stay empty.'}</small></div>}
      </div>
      <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button><button type="submit" className="btn primary" disabled={busy}>{busy ? <><Loader2 size={15} className="spin"/>Creating PDF…</> : 'Create PDF'}</button></div>
    </form>
  </Modal>;
}
