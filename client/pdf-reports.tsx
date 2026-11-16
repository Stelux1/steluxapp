import { useId, useState, type FormEvent } from 'react';
import { ChevronDown, ExternalLink, FileText, Loader2 } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { LISL_TYPES } from '../shared/pdf-lisl.ts';
import { ApiError, apiBlob, apiUrl } from './api.ts';
import { Dropdown, Modal } from './components.tsx';
import { useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { IsoBookDialog } from './iso-book.tsx';

type Option = 'type' | 'weldRecord' | 'signature' | 'welds' | 'perPage' | 'labelGrid' | 'phase' | 'project';
export type PdfPilot = 'weld' | 'mto';
/** Where an entry is offered: the Reports menu of the isometric page, the Certifications page or the materials of an isometric (MTO Pilot). */
export type PdfPage = 'isometric' | 'certifications' | 'materials' | 'projects';
/**
 * One entry of the Reports menu (the order of the reference: LISL Report, A3, [GU], [MV], [ISS], [WQ], [WQ ver 2], [GU Rev 2], [GU Rev 3], Blank LISL template, Weld card, Weld labels, Punch list - blank, then ISO Book; `extra` entries such as Welder's summary follow it). Another document is one more entry: its server key (`/api/pdf/<key>`), label and dialog options.
 * `pilots` and `page` say where it belongs (default: the isometric page of Weld Pilot); `scope: 'project'` entries are about a
 * project instead of one isometric; `resource` is the resource whose read permission shows the entry instead of a report.
 */
export interface PdfMenuItem { key: string; label: string; options: Option[]; /** Report whose access rule shows the entry. */ report: string; pilots?: PdfPilot[]; page?: PdfPage; scope?: 'isometric' | 'project'; resource?: string; /** Not in the captured menu: listed after ISO Book. */ extra?: boolean }
export const PDF_MENU: PdfMenuItem[] = [
  { key: 'lisl', label: 'LISL Report', options: ['type', 'weldRecord', 'signature'], report: 'lisl' },
  { key: 'lisl-a3', label: 'LISL Report (A3)', options: ['type', 'weldRecord', 'signature'], report: 'lisl' },
  { key: 'lisl-gu', label: 'LISL Report [GU]', options: ['type', 'weldRecord', 'signature'], report: 'lisl' },
  { key: 'lisl-mv', label: 'LISL Report [MV]', options: ['type', 'weldRecord', 'signature'], report: 'lisl' },
  { key: 'lisl-iss', label: 'LISL Report [ISS]', options: [], report: 'lisl' },
  { key: 'lisl-wq', label: 'LISL Report [WQ]', options: [], report: 'lisl' },
  { key: 'lisl-wq2', label: 'LISL Report [WQ ver 2]', options: [], report: 'lisl' },
  { key: 'lisl-gu-rev2', label: 'LISL Report [GU Rev 2]', options: ['type', 'weldRecord', 'signature'], report: 'lisl' },
  { key: 'lisl-gu-rev3', label: 'LISL Report [GU Rev 3]', options: ['type', 'weldRecord', 'signature'], report: 'lisl' },
  { key: 'lisl-blank', label: 'Blank LISL template', options: ['signature'], report: 'lisl' },
  { key: 'weld-cards', label: 'Weld card', options: ['welds', 'perPage'], report: 'weld-cards', pilots: ['weld'], page: 'isometric' },
  { key: 'weld-labels', label: 'Weld labels', options: ['welds', 'labelGrid'], report: 'weld-cards', pilots: ['weld'], page: 'isometric' },
  { key: 'punch-list-blank', label: 'Punch list - blank', options: [], report: 'pdf-punch', pilots: ['weld'], page: 'isometric' },
  { key: 'mto-report', label: 'MTO report', options: ['phase'], report: 'mto', pilots: ['mto'], page: 'materials' },
  { key: 'certification-index', label: 'Certification index', options: ['project'], report: '', resource: 'certifications', pilots: ['weld', 'mto'], page: 'certifications', scope: 'project' },
  // The punch-list button of a project row (Projects page): the punch items of that project.
  { key: 'punch-list', label: 'Punch list', options: ['project'], report: 'pdf-punch', pilots: ['weld'], page: 'projects', scope: 'project' },
  { key: 'welders-summary', label: "Welder's summary", options: [], report: 'wdi', pilots: ['weld'], page: 'isometric', extra: true },
];
/** The entries that belong to a pilot and a page. */
export const pdfEntries = (pilot: string | undefined, page: PdfPage) => PDF_MENU.filter(entry => (entry.pilots ?? ['weld']).includes(pilot as PdfPilot) && (entry.page ?? 'isometric') === page);

/** The dialog values of every option; each document reads only the ones it offers. */
export interface PdfValues { type: string; weldRecord: boolean; signature: boolean; /** Ids of the chosen welds; empty / missing = all. */ welds?: string[]; perPage?: string; columns?: string; rows?: string; /** Operation phase id, empty = all phases. */ phase?: string; /** Project id, empty = all projects. */ projectId?: string; siteId?: string }

/** Query string of the chosen options (isometric, then the options the document offers). */
export function pdfQuery(item: PdfMenuItem, isoId: string, values: PdfValues) {
  const query = new URLSearchParams(isoId ? { isoId } : {});
  if (item.options.includes('type')) query.set('type', values.type);
  if (item.options.includes('weldRecord')) query.set('weldRecord', values.weldRecord ? '1' : '0');
  if (item.options.includes('signature')) query.set('signature', values.signature ? '1' : '0');
  if (item.options.includes('welds') && values.welds?.length) query.set('welds', values.welds.join(','));
  if (item.options.includes('perPage')) query.set('perPage', values.perPage || '4');
  if (item.options.includes('labelGrid')) { query.set('columns', values.columns || '3'); query.set('rows', values.rows || '8'); }
  if (item.options.includes('phase') && values.phase) query.set('phase', values.phase);
  if (item.options.includes('project')) { if (values.projectId) query.set('projectId', values.projectId); else if (values.siteId) query.set('siteId', values.siteId); }
  return query;
}

/** "Reports" menu of the isometric page (Weld Pilot): opens a small options dialog, then generates the PDF. */
export function PdfReportsMenu({ iso }: { iso: Row }) {
  const { canReadReport } = useWorkspace(); const pilot = usePilot();
  const [item, setItem] = useState<PdfMenuItem | null>(null), [book, setBook] = useState(false);
  const items = pdfEntries(pilot?.pilot.key, 'isometric').filter(entry => canReadReport(entry.report));
  if (pilot?.pilot.key !== 'weld') return null;
  return <>
    <Dropdown label="Reports" trigger={<span className="btn"><FileText size={15}/>Reports<ChevronDown size={15}/></span>}>{items.filter(entry => !entry.extra).map(entry => <button key={entry.key} onClick={() => setItem(entry)}>{entry.label}</button>)}<button onClick={() => setBook(true)}>ISO Book</button>{items.filter(entry => entry.extra).map(entry => <button key={entry.key} onClick={() => setItem(entry)}>{entry.label}</button>)}</Dropdown>
    {item && <PdfDialog item={item} iso={iso} onClose={() => setItem(null)}/>}
    {book && <IsoBookDialog isos={[iso]} onClose={() => setBook(false)}/>}
  </>;
}

/** The options dialog of a document: for an isometric, or (`scope: 'project'` entries) for a project. */
export function PdfDialog({ item, iso, projectId = '', phaseId = '', onClose }: { item: PdfMenuItem; iso?: Row; projectId?: string; /** The operation phase the dialog opens on (the MTO report: the Type chosen on the Materials panel). */ phaseId?: string; onClose: () => void }) {
  const { rows, user, siteId } = useWorkspace(); const id = useId();
  const [type, setType] = useState('All'), [weldRecord, setWeldRecord] = useState(true), [signature, setSignature] = useState(false);
  const [welds, setWelds] = useState<string[] | null>(null), [perPage, setPerPage] = useState('4'), [columns, setColumns] = useState('3'), [labelRows, setLabelRows] = useState('8'), [phase, setPhase] = useState(phaseId), [project, setProject] = useState(projectId);
  const isoWelds = iso ? (rows.welds || []).filter(weld => !weld._archived && weld.isoId === iso.id).sort((a, b) => String(a.weldNo).localeCompare(String(b.weldNo), 'en', { numeric: true })) : [];
  const projects = (rows.projects || []).filter(row => !row._archived && (!siteId || row.siteId === siteId));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const hasSignature = (rows.signatures || []).some(row => !row._archived && row.userId === user.id && row.kind === 'Short signature');
  const path = `/pdf/${item.key}?${pdfQuery(item, iso?.id ?? '', { type, weldRecord, signature, welds: welds ?? [], perPage, columns, rows: labelRows, phase, projectId: project, siteId })}`;
  async function generate(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setDone('');
    try {
      const blob = await apiBlob(path);
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${item.label.replace(/[^A-Za-z0-9]+/g, '-')}${iso ? `-${String(iso.isoNo).replace(/[^A-Za-z0-9._-]+/g, '-')}` : ''}.pdf`; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDone('The PDF was downloaded.');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'The PDF could not be created. Try again.'); } finally { setBusy(false); }
  }
  return <Modal title={item.label} subtitle={iso ? String(iso.isoNo) : undefined} onClose={onClose}>
    <form onSubmit={event => void generate(event)} aria-busy={busy}>
      <div className="modal-body">
        {error && <div className="alert error" role="alert">{error}</div>}
        {done && <div className="alert success" role="status">{done} <a className="text-link" href={apiUrl(path)} target="_blank" rel="noreferrer">Open in a new tab<ExternalLink size={13} aria-hidden="true"/></a></div>}
        {item.options.includes('type') && <div className="field"><label htmlFor={`${id}-type`}>Type</label><select id={`${id}-type`} value={type} disabled={busy} onChange={event => setType(event.target.value)}>{LISL_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select><small>Shop or Field follows the location of each weld type.</small></div>}
        {item.options.includes('weldRecord') && <div className="field checkbox-field"><label htmlFor={`${id}-record`}><input id={`${id}-record`} type="checkbox" checked={weldRecord} disabled={busy} onChange={event => setWeldRecord(event.target.checked)}/><span>Weld record</span></label><small>Prints the recorded charge numbers, WPS, welder, date, NDT and PWHT. Untick to leave them empty.</small></div>}
        {item.options.includes('welds') && <fieldset className="field" disabled={busy}><legend>Welds</legend>
          <label><input type="radio" name={`${id}-welds`} checked={welds === null} onChange={() => setWelds(null)}/> <span>All welds ({isoWelds.length})</span></label>
          <label><input type="radio" name={`${id}-welds`} checked={welds !== null} onChange={() => setWelds([])}/> <span>Checked welds</span></label>
          {welds !== null && <div className="pdf-weld-list" role="group" aria-label="Choose welds" style={{ maxHeight: 180, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 4, marginTop: 6 }}>{isoWelds.map(weld => <label key={weld.id}><input type="checkbox" checked={welds.includes(weld.id)} onChange={event => setWelds(current => event.target.checked ? [...(current || []), weld.id] : (current || []).filter(value => value !== weld.id))}/> <span>{String(weld.weldNo)}</span></label>)}</div>}
          {welds !== null && !welds.length && <small>Check at least one weld, or print all welds.</small>}
        </fieldset>}
        {item.options.includes('perPage') && <div className="field"><label htmlFor={`${id}-per-page`}>Cards per page</label><select id={`${id}-per-page`} value={perPage} disabled={busy} onChange={event => setPerPage(event.target.value)}><option value="4">4 (2 x 2)</option><option value="8">8 (2 x 4)</option></select><small>Cut along the dashed lines.</small></div>}
        {item.options.includes('labelGrid') && <div className="field"><label htmlFor={`${id}-columns`}>Labels per sheet</label><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input id={`${id}-columns`} aria-label="Columns" type="number" min={1} max={6} value={columns} disabled={busy} onChange={event => setColumns(event.target.value)} style={{ width: 70 }}/><span aria-hidden="true">x</span><input aria-label="Rows" type="number" min={1} max={20} value={labelRows} disabled={busy} onChange={event => setLabelRows(event.target.value)} style={{ width: 70 }}/></div><small>Columns (1 to 6) times rows (1 to 20) on an A4 sheet; 3 x 8 by default.</small></div>}
        {item.options.includes('phase') && <div className="field"><label htmlFor={`${id}-phase`}>Operation phase</label><select id={`${id}-phase`} value={phase} disabled={busy} onChange={event => setPhase(event.target.value)}><option value="">All phases</option>{(rows.operation_phases || []).filter(row => !row._archived).map(row => <option key={row.id} value={row.id}>{String(row.name)}</option>)}</select><small>All phases are grouped by phase; the totals per UOM follow the choice.</small></div>}
        {item.options.includes('project') && <div className="field"><label htmlFor={`${id}-project`}>Project</label><select id={`${id}-project`} value={project} disabled={busy} onChange={event => setProject(event.target.value)}><option value="">All projects</option>{projects.map(row => <option key={row.id} value={row.id}>{String(row.internnumber)}{row.description ? ` - ${String(row.description)}` : ''}</option>)}</select><small>With project-specific material certificates on, only the certificates linked to the project are listed.</small></div>}
        {item.options.includes('signature') && <div className="field checkbox-field"><label htmlFor={`${id}-signature`}><input id={`${id}-signature`} type="checkbox" checked={signature} disabled={busy} onChange={event => setSignature(event.target.checked)}/><span>Signature on each page</span></label><small>{hasSignature ? 'Uses your short signature.' : 'You have not saved a short signature yet (System · Signatures); the lines stay empty.'}</small></div>}
      </div>
      <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button><button type="submit" className="btn primary" disabled={busy || (welds !== null && !welds.length)}>{busy ? <><Loader2 size={15} className="spin"/>Creating PDF…</> : 'Create PDF'}</button></div>
    </form>
  </Modal>;
}
