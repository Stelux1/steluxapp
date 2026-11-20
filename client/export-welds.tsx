import { useId, useState, type FormEvent } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useWorkspace } from './context.tsx';
import { apiBlob } from './api.ts';
import { EmptyState } from './components.tsx';
import { saveBlob } from './table-export.ts';
import { EXPORT_WELDS_AREA, areaVerb } from '../shared/export-tables.ts';
import { NON_WELD_CODES, type NonWeldCode } from '../shared/weld-codes.ts';

/** The "Also export these records" table: each left-out code with an example weld number and what it stands for. */
export const WELD_CODE_ROWS: { code: NonWeldCode; example: string; meaning: string }[] = [
  { code: 'GAP', example: '12GAP', meaning: 'Gap: an opening in the line, no welded joint.' },
  { code: 'SP', example: '1SP2', meaning: 'Spool: a pipe spool kept on the weld list.' },
  { code: 'E', example: 'E12, 09E', meaning: 'End or appendage, kept as a weld number (E1, E2, …).' },
  { code: 'B', example: 'B12, 07B', meaning: 'Blind plate or blind flange (B1, B01).' },
];
export const EXPORT_WELDS_TEXTS = {
  title: 'Export welds',
  intro: 'Choose which projects you want to export. Leave "All projects" if you want full Project Site export.',
  from: 'Export welds from:', allProjects: 'All projects', download: 'Download XLS', full: 'Export all data',
  include: 'Also export these records', includeHelp: 'These codes are left out of the Excel file. Tick a code to include every record with that code.',
  patience: 'Please be patient Creating the weld export can take a while.',
  started: 'The export is running. You can keep working; the file will download when it is ready.',
} as const;

/** The query of one export request: one project, or every project of the site, or (full) every project site the account may see. */
export function exportWeldsQuery(options: { siteId: string; projectId: string; full: boolean; includeCodes: readonly string[] }) {
  const query = new URLSearchParams();
  if (options.full) query.set('full', 'ok');
  else { if (options.siteId) query.set('siteId', options.siteId); query.set('projectId', options.projectId || 'all'); }
  if (options.includeCodes.length) query.set('includeCodes', NON_WELD_CODES.filter(code => options.includeCodes.includes(code)).join(','));
  return query;
}

/** Welding data → Export weld data: an Excel file of one project's welds, or of the whole project site, written by the server. */
export function ExportWelds() {
  const { rows, siteId, label, canArea, notify } = useWorkspace(); const id = useId();
  const [projectId, setProjectId] = useState(''), [codes, setCodes] = useState<NonWeldCode[]>([]), [busy, setBusy] = useState<'one' | 'full' | ''>('');
  if (!canArea(EXPORT_WELDS_AREA)) return <EmptyState title="This area is restricted" description="Your permission profile does not include Export welds."/>;
  const exportable = canArea(EXPORT_WELDS_AREA, areaVerb(EXPORT_WELDS_AREA));
  const projects = (rows.projects || []).filter(row => !row._archived && (!siteId || row.siteId === siteId));
  const toggle = (code: NonWeldCode, on: boolean) => setCodes(old => on ? [...new Set([...old, code])] : old.filter(item => item !== code));
  async function download(full: boolean) {
    setBusy(full ? 'full' : 'one'); notify(EXPORT_WELDS_TEXTS.started);
    try { saveBlob('blitzkrieg-export-welds.xlsx', await apiBlob(`/export-welds?${exportWeldsQuery({ siteId, projectId, full, includeCodes: codes })}`)); }
    catch (problem) { notify((problem as Error).message || 'The export could not be created.'); } finally { setBusy(''); }
  }
  const submit = (full: boolean) => (event: FormEvent) => { event.preventDefault(); void download(full); };
  return <div className="page export-welds-page" aria-busy={Boolean(busy)}>
    <div className="page-heading"><div><div className="eyebrow">WELD CORE · WELDING DATA</div><h1>{EXPORT_WELDS_TEXTS.title}</h1><p>{EXPORT_WELDS_TEXTS.intro}</p></div></div>
    {!exportable && <div className="alert info" role="note"><span>Your permission profile opens this page but does not include Export on Export welds.</span></div>}
    <section className="panel">
      <form onSubmit={submit(false)} className="form-grid">
        <div className="field"><label htmlFor={`${id}-project`}>{EXPORT_WELDS_TEXTS.from}</label>
          <select id={`${id}-project`} value={projectId} disabled={Boolean(busy)} onChange={event => setProjectId(event.target.value)}><option value="">{EXPORT_WELDS_TEXTS.allProjects}</option>{projects.map(row => <option key={row.id} value={row.id}>{label('projects', row.id)}</option>)}</select></div>
        {exportable && <div className="field"><span className="field-title">&nbsp;</span><span className="row-buttons">
          <button className="btn primary" type="submit" disabled={Boolean(busy)}>{busy === 'one' ? <Loader2 size={16} className="spin"/> : <Download size={16}/>}{EXPORT_WELDS_TEXTS.download}</button>
          <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => void download(true)}>{busy === 'full' ? <Loader2 size={16} className="spin"/> : <Download size={16}/>}{EXPORT_WELDS_TEXTS.full}</button></span></div>}
      </form>
      <fieldset className="field export-codes"><legend>{EXPORT_WELDS_TEXTS.include}</legend>
        <p className="muted">{EXPORT_WELDS_TEXTS.includeHelp}</p>
        <table className="data-table"><thead><tr>
          <th scope="col"><label><input type="checkbox" checked={codes.length === WELD_CODE_ROWS.length} disabled={Boolean(busy)} onChange={event => setCodes(event.target.checked ? WELD_CODE_ROWS.map(row => row.code) : [])}/> All</label></th>
          <th scope="col">Code</th><th scope="col">Example</th><th scope="col">Meaning</th></tr></thead>
          <tbody>{WELD_CODE_ROWS.map(row => <tr key={row.code}>
            <td><label><input type="checkbox" name="includeCodes" value={row.code} checked={codes.includes(row.code)} disabled={Boolean(busy)} onChange={event => toggle(row.code, event.target.checked)}/> Include</label></td>
            <td>{row.code}</td><td>{row.example}</td><td>{row.meaning}</td></tr>)}</tbody></table>
      </fieldset>
      <div className="alert info" role="note"><span>{EXPORT_WELDS_TEXTS.patience}</span></div>
    </section>
  </div>;
}
