import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronDown, Database, Download, Loader2, ShoppingCart, Upload } from 'lucide-react';
import { api, apiUrl, post } from './api.ts';
import { useWorkspace } from './context.tsx';
import { EmptyState, TableScroll } from './components.tsx';
import {
  IMPORT_ACTIONS, MATERIAL_IMPORT_COLUMNS, MATERIAL_IMPORT_INFO, TAKE_OVER_HELP, summaryText, takeOverText,
  type ImportAction, type ImportRow, type materialImportSummary,
} from '../shared/material-db.ts';

import { CLEAN_IMPORT_HINT, CLEAN_IMPORT_LABEL } from '../shared/material-sites.ts';

const DATABASE_PATH = '/materials/materials';
/** A preview row; `note`: its Material No exists for another project site and commit links it here. */
interface Preview { rows: (ImportRow & { note?: string })[]; summary: ReturnType<typeof materialImportSummary>; empty?: boolean }
interface Kept { id: string; materialNo: string; description: string }
type Status = { type: 'error' | 'success' | 'info'; text: string } | null;

/**
 * Import material (MTO Pilot → Material database): Excel template, upload with a preview of every row (Action import /
 * skip, cells in error marked, Material No editable where it is missing or already in the database), and Commit import.
 * "Take over missing materials from this site" fills the same preview from the isometrics of the main project.
 */
export function MaterialImportPage() {
  const { canRecord, refresh, siteId } = useWorkspace();
  const allowed = canRecord('materials', 'import') && canRecord('materials', 'insert');
  // Clean import removes materials from this project site: offered to accounts that may also delete materials (the server checks it again).
  const canClean = allowed && canRecord('materials', 'delete');
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<Preview | null>(null), [clean, setClean] = useState(false);
  const [kept, setKept] = useState<Kept[]>([]);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<Status>(null);
  const [counts, setCounts] = useState<{ iso: number; order: number } | null>(null), [countError, setCountError] = useState('');
  useEffect(() => {
    if (!allowed || !siteId) return;
    let live = true;
    api<{ iso: number; order: number }>(`/material-import/take-over?${new URLSearchParams({ siteId })}`).then(result => { if (live) setCounts(result); }, failure => { if (live) setCountError((failure as Error).message); });
    return () => { live = false; };
  }, [allowed, siteId, preview === null]);
  if (!allowed) return <EmptyState title="This area is restricted" description="Your profile does not allow importing materials."/>;

  async function run(work: () => Promise<Preview>, loading: string, done: (result: Preview) => Status) {
    setBusy(true); setStatus({ type: 'info', text: loading });
    try { const result = await work(); setPreview(result.empty ? null : result); setStatus(done(result)); }
    catch (failure) { setStatus({ type: 'error', text: (failure as Error).message }); } finally { setBusy(false); }
  }
  function upload(event: FormEvent) {
    event.preventDefault(); if (!file) return;
    const body = new FormData(); body.set('siteId', siteId); body.set('file', file); setKept([]);
    void run(() => api<Preview>('/material-import/preview', { method: 'POST', body }), 'Uploading and checking…', () => ({ type: 'success', text: 'Upload OK. Check the rows and commit.' }));
  }
  const takeOver = (source: 'iso' | 'order') => { setClean(false); setKept([]); void run(() => post<Preview>('/material-import/take-over', { siteId, source }), 'Collecting unique materials…', result => result.empty ? { type: 'info', text: 'No missing materials for this source.' } : { type: 'success', text: 'Preview loaded. Check the rows and commit.' }); };
  /** The preview checked again after an action or a Material No was changed (nothing is saved). */
  function change(rowNo: number, patch: { action?: ImportAction; materialNo?: string }) {
    if (!preview) return;
    const rows = preview.rows.map(row => row.rowNo === rowNo ? { ...row, ...(patch.action ? { action: patch.action } : {}), values: patch.materialNo === undefined ? row.values : { ...row.values, materialNo: patch.materialNo } } : row);
    setPreview({ ...preview, rows });
    void run(() => post<Preview>('/material-import/check', { rows, siteId }), 'Checking…', () => null);
  }
  async function commit() {
    if (!preview) return;
    // Clean import belongs to the uploaded file (the checkbox sits on the upload form).
    const cleaning = clean && preview.rows.every(row => row.source === 'file');
    setBusy(true); setStatus({ type: 'info', text: 'Committing…' });
    try {
      const result = await post<{ committed: number; failed: number; linked: number; attached: number; removed?: number; kept?: Kept[] }>('/material-import/commit', { rows: preview.rows, siteId, options: cleaning ? { clean: true } : {} });
      await refresh(); setPreview(null); setFile(null); setKept(result.kept || []);
      setStatus({ type: 'success', text: `Commit done. Committed: ${result.committed}${result.attached ? ` · ${result.attached} existing material(s) now also on this project site` : ''}${result.linked ? ` · ${result.linked} isometric material line(s) now point at the new catalog rows` : ''}${result.failed ? ` · ${result.failed} row(s) could not be imported` : ''}${result.removed !== undefined ? ` · Removed from this project site: ${result.removed}` : ''}` });
    } catch (failure) { setStatus({ type: 'error', text: (failure as Error).message }); } finally { setBusy(false); }
  }
  const summary = preview?.summary;
  return <div className="page records-page pqr-import-page material-import-page">
    <div className="page-heading"><div><div className="eyebrow"><Link to={DATABASE_PATH}>Material database</Link> / IMPORT MATERIAL</div><h1>Import material</h1></div>
      <div className="heading-actions"><Link className="btn" to={DATABASE_PATH}>Cancel</Link></div></div>
    <div className="table-card pqr-import-card">
      <div className="alert" role="note"><span>{MATERIAL_IMPORT_INFO}</span></div>
      <p className="material-import-templates"><span><strong>Templates</strong>:</span><a className="btn small" href={apiUrl('/material-import/template')}><Download size={14}/>Download Excel template</a></p>
      <section className="material-import-takeover" aria-labelledby="material-takeover-title">
        <h2 id="material-takeover-title">Take over missing materials from this site</h2>
        <p className="field-hint">{TAKE_OVER_HELP}</p>
        {!siteId ? <p>Choose a main project to see its missing materials.</p> : countError ? <p className="field-error" role="alert">{countError}</p> : counts ? <p>{takeOverText(counts)}</p> : <p role="status">Counting…</p>}
        <div className="pqr-import-buttons">
          <button type="button" className="btn" disabled={busy || !counts?.iso} onClick={() => takeOver('iso')}><Database size={15}/>Take over from isometrics{counts ? ` (${counts.iso})` : ''}</button>
          <button type="button" className="btn" disabled={busy || !counts?.order} onClick={() => takeOver('order')}><ShoppingCart size={15}/>Take over from order materials</button>
        </div>
      </section>
      <form className="pqr-import-form" onSubmit={upload}>
        <div className="field"><label htmlFor="material-import-file">Excel file (.xlsx)<span className="required"> *</span></label><input id="material-import-file" type="file" accept=".xlsx" required onChange={event => setFile(event.target.files?.[0] || null)}/></div>
        {canClean && <label className="material-import-clean"><input type="checkbox" checked={clean} disabled={busy} aria-describedby="material-import-clean-hint" onChange={event => setClean(event.target.checked)}/><span>{CLEAN_IMPORT_LABEL}<small id="material-import-clean-hint" className="field-hint">{CLEAN_IMPORT_HINT}</small></span></label>}
        <div className="pqr-import-buttons"><button className="btn primary" disabled={busy || !file}>{busy ? <Loader2 size={15} className="spin"/> : <Upload size={15}/>}Upload</button></div>
      </form>
      {status && <div className={`alert ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>}<span>{status.text}</span></div>}
      {kept.length > 0 && <div className="material-import-kept" role="status"><strong>Kept on this project site because they are used on an isometric, order, inventory line or certificate here ({kept.length}):</strong><ul>{kept.map(item => <li key={item.id}>{item.materialNo}{item.description ? ` · ${item.description}` : ''}</li>)}</ul></div>}
      {preview && summary && <>
        <div className="material-import-commit"><p className="pqr-import-summary" role="status">{summaryText(summary)}</p>{summary.importable > 0 && <button type="button" className="btn primary" disabled={busy} onClick={() => void commit()}><CheckCircle2 size={15}/>Commit import</button>}</div>
        <TableScroll><table className="data-table material-import-table"><thead><tr><th>#</th><th>Action</th>{MATERIAL_IMPORT_COLUMNS.map(column => <th key={column.field}>{column.header}</th>)}<th>Errors</th></tr></thead>
          <tbody>{preview.rows.map(row => {
            const messages = [...Object.values(row.error), ...Object.values(row.warning), ...(row.note ? [row.note] : [])];
            const editable = Boolean(row.error.materialNo || row.warning.materialNoExists);
            return <tr key={row.rowNo} className={Object.keys(row.error).length ? 'pqr-import-error' : row.action === 'skip' ? 'pqr-import-skip' : ''}>
              <td className="tabular">{row.rowNo}</td>
              <td><div className="select-wrap pqr-import-action"><select aria-label={`Action for row ${row.rowNo}`} disabled={busy} value={row.action} onChange={event => change(row.rowNo, { action: event.target.value as ImportAction })}>{IMPORT_ACTIONS.map(action => <option key={action} value={action}>{action}</option>)}</select><ChevronDown size={14}/></div></td>
              {MATERIAL_IMPORT_COLUMNS.map(column => {
                const problem = column.field === 'materialNo' ? row.error.materialNo || row.warning.materialNoExists : row.error[column.field];
                const kind = column.field === 'materialNo' && !row.error.materialNo && row.warning.materialNoExists ? 'mi-warning-cell' : problem ? 'mi-error-cell' : undefined;
                return <td key={column.field} className={kind} title={problem}>{column.field === 'materialNo' && editable
                  ? <input key={`${row.rowNo}-${row.values.materialNo}`} className="mi-edit-input" aria-label={`Material No of row ${row.rowNo}`} defaultValue={row.values.materialNo} disabled={busy} onBlur={event => { if (event.target.value.trim() !== row.values.materialNo) change(row.rowNo, { materialNo: event.target.value.trim() }); }}/>
                  : row.values[column.field] || ''}</td>;
              })}
              <td className="pqr-import-errors">{messages.join(' ')}</td>
            </tr>;
          })}</tbody></table></TableScroll>
      </>}
    </div>
  </div>;
}
