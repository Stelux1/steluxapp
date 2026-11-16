import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Download, Loader2, Upload } from 'lucide-react';
import { api, apiUrl } from './api.ts';
import { activeRows, useWorkspace } from './context.tsx';
import { Dropdown, Modal, TableScroll } from './components.tsx';
import { usePilot } from './pilot.tsx';
import {
  CLEAN_PROJECTS_HINT, CLEAN_PROJECTS_LABEL, IMPORT_DURATION_NOTE, IMPORT_STEPS, IMPORT_TITLES, PREVIEW_COLUMNS, SHOW_ALL_ROWS, WITH_WELDS_LABEL,
  importMenuLabel, previewRows, summaryText, type ImportMode, type ImportSummary, type PreviewRow,
} from '../shared/project-import.ts';

interface Preview { rows: PreviewRow[]; summary: ImportSummary }
interface Result { projects: { created: number; updated: number; deleted?: number; kept?: string[] }; isometrics: { created: number; updated: number }; welds: number; materials: number; skipped: number }
type Status = { type: 'error' | 'success' | 'info'; text: string } | null;

/**
 * Import ▾ on the Projects page (reference weld__welding__projects.txt:404-416): Import projects, and Import all project
 * data (Weld Pilot: "Import all WP data"). Shown to accounts with the import right on projects or isometrics; the server
 * checks every part again.
 */
export function ProjectImportMenu() {
  const { canRecord, siteId } = useWorkspace(); const pilot = usePilot()?.pilot.key;
  const [open, setOpen] = useState<ImportMode | null>(null);
  const may: Record<ImportMode, boolean> = { projects: canRecord('projects', 'import'), full: canRecord('isometrics', 'import') };
  if (!may.projects && !may.full) return null;
  const why = (mode: ImportMode) => !siteId ? 'Choose a main project first.' : !may[mode] ? 'Your profile cannot import this.' : undefined;
  return <>
    <Dropdown label="Import" trigger={<span className="btn"><Upload size={15}/>Import<ChevronDown size={15}/></span>}>
      {(['projects', 'full'] as ImportMode[]).map(mode => <button key={mode} disabled={Boolean(why(mode))} title={why(mode)} onClick={() => setOpen(mode)}>{importMenuLabel(pilot, mode)}</button>)}
    </Dropdown>
    {open && <ProjectImportDialog mode={open} onClose={() => setOpen(null)}/>}
  </>;
}

/** The dialog of one import: steps, templates, file (with welds / clean import), Upload → preview → Import. */
export function ProjectImportDialog({ mode, onClose }: { mode: ImportMode; onClose: () => void }) {
  const { rows, canRecord, refresh, notify, siteId } = useWorkspace();
  const [file, setFile] = useState<File | null>(null), [withWelds, setWithWelds] = useState(true), [clean, setClean] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null), [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<Status>(null);
  const [exportProject, setExportProject] = useState(''), [exportMaterials, setExportMaterials] = useState(false);
  const full = mode === 'full', canClean = !full && canRecord('projects', 'delete');
  const projects = activeRows(rows, 'projects').filter(project => project.siteId === siteId);
  const form = () => { const body = new FormData(); body.set('mode', mode); body.set('file', file!); if (full) body.set('withWelds', String(withWelds)); if (!full) body.set('clean', String(clean && canClean)); return body; };
  async function upload(event: FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setPreview(null); setStatus({ type: 'info', text: 'Uploading and checking…' });
    try { const result = await api<Preview>('/project-import/preview', { method: 'POST', body: form() }); setPreview(result); setStatus({ type: 'success', text: 'Upload done. Check the preview, then click Import.' }); }
    catch (failure) { setStatus({ type: 'error', text: (failure as Error).message }); } finally { setBusy(false); }
  }
  async function commit() {
    if (!file) return;
    setBusy(true); setStatus({ type: 'info', text: 'Importing…' });
    try {
      const result = await api<Result>('/project-import/commit', { method: 'POST', body: form() });
      await refresh();
      const kept = result.projects.kept?.length ? ` Kept because they have isometrics: ${result.projects.kept.join(', ')}.` : '';
      notify(`Import done. Projects: ${result.projects.created} new, ${result.projects.updated} updated${result.projects.deleted ? `, ${result.projects.deleted} deleted` : ''}.${full ? ` Isometrics: ${result.isometrics.created} new, ${result.isometrics.updated} updated. Welds: ${result.welds}. Material lines: ${result.materials}.` : ''}${result.skipped ? ` Rows with errors skipped: ${result.skipped}.` : ''}${kept}`);
      onClose();
    } catch (failure) { setStatus({ type: 'error', text: (failure as Error).message }); setBusy(false); }
  }
  const shown = preview ? previewRows(preview.rows, all) : [];
  const columns = PREVIEW_COLUMNS[mode];
  const currentUrl = apiUrl(`/project-import/current?${new URLSearchParams({ ...(exportProject ? { projectId: exportProject } : {}), ...(exportMaterials ? { materials: 'true' } : {}) })}`);
  return <Modal title={IMPORT_TITLES[mode]} wide onClose={onClose}><form onSubmit={event => void upload(event)}>
    <div className="modal-body">
      <details className="form-section"><summary>{full ? 'How to use Project Data Import' : 'How to use Import projects'}</summary><ol className="field-hint" style={{ padding: '12px 15px 12px 32px', margin: 0 }}>{IMPORT_STEPS[mode].map(step => <li key={step}>{step}</li>)}</ol></details>
      {full && <div className="alert" role="note"><span>{IMPORT_DURATION_NOTE}</span></div>}
      <div className="field"><label htmlFor="project-import-file">Excel file<span className="required"> *</span></label><input id="project-import-file" type="file" accept=".xlsx" required disabled={busy} onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); setStatus(null); }}/></div>
      {full && <label className="checkbox-field"><input type="checkbox" checked={withWelds} disabled={busy} onChange={event => { setWithWelds(event.target.checked); setPreview(null); }}/><span>{WITH_WELDS_LABEL}</span></label>}
      {canClean && <label className="checkbox-field"><input type="checkbox" checked={clean} disabled={busy} aria-describedby="project-import-clean-hint" onChange={event => setClean(event.target.checked)}/><span>{CLEAN_PROJECTS_LABEL}<small id="project-import-clean-hint" className="field-hint">{CLEAN_PROJECTS_HINT}</small></span></label>}
      <div className="field"><strong>Templates</strong>
        <p className="material-import-templates"><a className="btn small" href={apiUrl(`/project-import/template?mode=${mode}`)}><Download size={14}/>{full ? 'Excel (full + welds)' : 'Download Excel template'}</a></p>
        {full && <div className="form-grid">
          <div className="field"><label htmlFor="project-import-export-project">Excel (current data)</label><div className="select-wrap"><select id="project-import-export-project" value={exportProject} onChange={event => setExportProject(event.target.value)}><option value="">All projects on this site</option>{projects.map(project => <option key={project.id} value={project.id}>{String(project.internnumber ?? '')}{project.description ? ` ${String(project.description)}` : ''}</option>)}</select><ChevronDown size={14}/></div>
            <label className="checkbox-field"><input type="checkbox" checked={exportMaterials} disabled={!canRecord('iso_materials', 'export')} onChange={event => setExportMaterials(event.target.checked)}/><span>Include existing materials</span></label></div>
          <div className="field"><a className="btn small" href={currentUrl}><Download size={14}/>Excel (current data)</a><small className="field-hint">The projects and isometrics of this main project in the import columns. Weld columns stay empty, so existing welds are not added again.</small></div>
        </div>}
      </div>
      {status && <div className={`alert ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.type === 'error' ? <AlertCircle size={18}/> : busy ? <Loader2 size={18} className="spin"/> : <CheckCircle2 size={18}/>}<span>{status.text}</span></div>}
      {preview && <>
        <p role="status" className="field-hint">{summaryText(preview.summary)}</p>
        <label className="checkbox-field"><input type="checkbox" checked={all} onChange={event => setAll(event.target.checked)}/><span>{SHOW_ALL_ROWS.label} <small className="field-hint">{SHOW_ALL_ROWS.hint}</small></span></label>
        <TableScroll><div className="import-preview"><table>
          <thead><tr><th>#</th><th>Action</th>{columns.map(column => <th key={column.key}>{column.header}</th>)}<th>Errors</th></tr></thead>
          <tbody>{shown.map(row => <tr key={row.rowNo} className={row.action === 'Error' ? 'pqr-import-error' : ''}>
            <td className="tabular">{row.rowNo}</td><td>{row.action}</td>
            {columns.map(column => <td key={column.key}>{column.project ? row.project[column.key] ?? '' : String(row[column.key as keyof PreviewRow] ?? '')}{column.key === 'materialNo' && row.materialExists ? ' (already on the isometric)' : ''}</td>)}
            <td className="pqr-import-errors">{row.errors.join(' ')}</td>
          </tr>)}</tbody>
        </table></div></TableScroll>
      </>}
    </div>
    <div className="modal-footer">
      <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
      <button className="btn" disabled={busy || !file}>{busy && !preview ? <Loader2 size={15} className="spin"/> : <Upload size={15}/>}Upload</button>
      {preview && preview.summary.importable > 0 && <button type="button" className="btn primary" disabled={busy} onClick={() => void commit()}>{busy ? <Loader2 size={15} className="spin"/> : <CheckCircle2 size={15}/>}Import</button>}
    </div>
  </form></Modal>;
}
