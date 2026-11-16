import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowUpDown, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, Pencil, Plus, Printer, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { PQR_ATTRIBUTES } from '../shared/welding.ts';
import {
  PQR_DOCUMENT_TYPE, PQR_HEADER_GROUPS, PQR_IMPORT_ACTIONS, PQR_IMPORT_PATH, PQR_NUMBER, PQR_PAGE_SIZES, pqrColumnTitle, pqrImportMessage, type PqrImportAction,
} from '../shared/wps.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { api, post, apiUrl, formatDate, ApiError } from './api.ts';
import { Dropdown, EmptyState, Modal, SearchInput, TableScroll, revealInvalidField } from './components.tsx';
import { ArchiveRecordDialog, BulkArchiveDialog } from './archive-record.tsx';

/**
 * Weld Pilot → Weld data → PQR (hosted profile): every attribute and "Valid until" as list columns with a search box per
 * column, the form as one list with "remove value" per attribute, and the Excel import page.
 */
const COLUMNS = [...PQR_ATTRIBUTES.map(attribute => ({ name: attribute.name, title: pqrColumnTitle(attribute.name, attribute.label) })), { name: 'validUntil', title: 'Valid until' }];
const str = (value: unknown) => value === null || value === undefined ? '' : String(value);

export function PqrPage() {
  const { rows, canRecord, label } = useWorkspace();
  const [tab, setTab] = useState<'active' | 'archived'>('active'); const [q, setQ] = useState(''); const [columnQ, setColumnQ] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0); const [size, setSize] = useState(100); const [sort, setSort] = useState<{ column: string; direction: 1 | -1 }>({ column: 'attribute26Id', direction: 1 });
  const [selected, setSelected] = useState<string[]>([]); const [editor, setEditor] = useState<Row | 'new' | null>(null); const [archiving, setArchiving] = useState<Row | null>(null); const [bulkArchive, setBulkArchive] = useState(false);
  const value = (row: Row, name: string) => name === 'validUntil' ? str(row.validUntil) : row[name] ? label('qualification_options', row[name]) : '';
  const listed = useMemo(() => {
    const query = q.toLowerCase().trim();
    return (rows.pqr || []).filter(row => (tab === 'archived') === row._archived && (!query || COLUMNS.some(column => value(row, column.name).toLowerCase().includes(query)))
      && Object.entries(columnQ).every(([name, text]) => !text.trim() || value(row, name).toLowerCase().includes(text.toLowerCase().trim())))
      .sort((a, b) => value(a, sort.column).localeCompare(value(b, sort.column), 'en', { numeric: true }) * sort.direction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tab, q, columnQ, sort]);
  const pages = Math.max(1, Math.ceil(listed.length / size)), current = Math.min(page, pages - 1), shown = listed.slice(current * size, (current + 1) * size);
  const checked = (rows.pqr || []).filter(row => selected.includes(row.id) && !row._archived);
  if (!canRecord('pqr')) return <EmptyState title="This area is restricted" description="Your profile does not include PQRs."/>;
  const creatable = canRecord('pqr', 'insert'), editable = canRecord('pqr', 'edit'), deletable = canRecord('pqr', 'delete');
  const reset = (next: () => void) => { next(); setPage(0); setSelected([]); };
  const exportUrl = (format: string) => apiUrl(`/export/pqr?format=${format}&archived=true&ids=${(checked.length ? checked : listed).map(row => row.id).join(',') || '__none__'}`);
  const filtering = Boolean(q.trim()) || Object.values(columnQ).some(text => text.trim());
  return <div className="page records-page pqr-page">
    <div className="page-heading"><div><div className="eyebrow">WELD DATA</div><h1>PQR<span className="heading-count">{activeRows(rows, 'pqr').length}</span></h1><p>Procedure qualification records with their EN / ASME scope, treatment and tests.</p></div>
      <div className="heading-actions">
        {checked.length > 0 && deletable && <button className="btn" onClick={() => setBulkArchive(true)}><Trash2 size={15}/>Delete selected</button>}
        {canRecord('pqr', 'import') && <Link className="btn" to={PQR_IMPORT_PATH}><Upload size={15}/>Import PQR</Link>}
        {creatable && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add</button>}
      </div></div>
    <div className="table-card">
      <div className="table-card-top"><div className="table-tabs" role="tablist" aria-label="PQR visibility">{(['active', 'archived'] as const).map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'selected' : ''} onClick={() => reset(() => setTab(item))}>{item === 'active' ? 'Active records' : 'Archived'}{tab === item && <span>{listed.length}</span>}</button>)}</div>
        <div className="table-utilities">{(canRecord('pqr', 'export') || canRecord('pqr', 'print')) && <Dropdown trigger={<span className="btn subtle small"><Download size={15}/>Export<ChevronDown size={12}/></span>}>{canRecord('pqr', 'export') && <><a href={exportUrl('csv')}>Download CSV</a><a href={exportUrl('xlsx')}>Download Excel</a></>}{canRecord('pqr', 'print') && <button onClick={() => window.print()}><Printer size={14}/>Print / Save as PDF</button>}</Dropdown>}</div></div>
      <div className="table-toolbar"><SearchInput value={q} onChange={text => reset(() => setQ(text))} placeholder="Search PQR…"/>{filtering && <button className="text-link" onClick={() => reset(() => { setQ(''); setColumnQ({}); })}>Clear search</button>}</div>
      {checked.length > 0 && <div className="selection-bar"><strong>{checked.length} selected</strong><button className="clear-selection" onClick={() => setSelected([])}><X size={14}/>Clear</button></div>}
      <TableScroll><table className="data-table pqr-table"><thead>
        <tr className="pqr-group-row">{PQR_HEADER_GROUPS.map(([title, span], index) => <th key={index} colSpan={span} scope="colgroup">{title}</th>)}</tr>
        <tr><th className="select-cell"><input type="checkbox" aria-label="Select all PQRs on this page" disabled={tab === 'archived'} checked={tab === 'active' && shown.length > 0 && shown.every(row => selected.includes(row.id))} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, ...shown.map(row => row.id)])] : old.filter(id => !shown.some(row => row.id === id)))}/></th><th><span className="sr-only">Options</span></th>
          {COLUMNS.map(column => <th key={column.name} aria-sort={sort.column === column.name ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button onClick={() => setSort(old => ({ column: column.name, direction: old.column === column.name && old.direction === 1 ? -1 : 1 }))}>{column.title}<ArrowUpDown size={12} className={sort.column === column.name ? 'sort-active' : ''}/></button></th>)}</tr>
        <tr className="column-filters"><td className="select-cell"/><td/>{COLUMNS.map((column, index) => <td key={column.name}><input type="text" className="column-filter-input" placeholder="Search..." aria-label={`Search ${PQR_ATTRIBUTES[index]?.label || column.title}`} value={columnQ[column.name] || ''} onChange={event => { const text = event.target.value; reset(() => setColumnQ(old => ({ ...old, [column.name]: text }))); }}/></td>)}</tr>
      </thead><tbody>{shown.map(row => <tr key={row.id} className={selected.includes(row.id) ? 'row-selected' : ''}>
        <td className="select-cell"><input type="checkbox" aria-label={`Select PQR ${label('pqr', row.id)}`} disabled={row._archived} checked={selected.includes(row.id)} onChange={event => setSelected(old => event.target.checked ? [...old, row.id] : old.filter(id => id !== row.id))}/></td>
        <td><div className="wps-row-actions">{row._archived ? deletable && <button className="icon-btn" aria-label={`Restore PQR ${label('pqr', row.id)}`} title="Restore" onClick={() => setArchiving(row)}><RotateCcw size={15}/></button> : <>
          {editable && <button className="icon-btn" aria-label={`Edit PQR ${label('pqr', row.id)}`} title="Edit" onClick={() => setEditor(row)}><Pencil size={15}/></button>}
          {deletable && <button className="icon-btn" aria-label={`Delete PQR ${label('pqr', row.id)}`} title="Delete" onClick={() => setArchiving(row)}><Trash2 size={15}/></button>}</>}</div></td>
        {COLUMNS.map(column => <td key={column.name}>{column.name === 'validUntil' ? (row.validUntil ? <span className="tabular">{formatDate(row.validUntil)}</span> : <span className="muted">—</span>) : value(row, column.name) || <span className="muted">—</span>}</td>)}
      </tr>)}</tbody></table></TableScroll>
      {!listed.length && <EmptyState title={filtering ? 'No matching PQRs' : tab === 'archived' ? 'Nothing archived' : 'No PQRs yet'} description={filtering ? 'Try another search or clear the column searches.' : tab === 'archived' ? 'Deleted PQRs appear here.' : 'Add a PQR or import them from Excel.'} action={filtering ? <button className="btn" onClick={() => reset(() => { setQ(''); setColumnQ({}); })}>Clear search</button> : creatable && tab === 'active' ? <button className="btn primary" onClick={() => setEditor('new')}><Plus size={16}/>Add</button> : undefined}/>}
      <div className="table-footer"><span role="status" aria-live="polite">{listed.length ? `${current * size + 1}–${Math.min((current + 1) * size, listed.length)}` : '0'} of {listed.length} PQRs</span><div><span>Rows per page</span><select aria-label="Rows per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{PQR_PAGE_SIZES.map(item => <option key={item}>{item}</option>)}</select><button className="icon-btn" disabled={current === 0} aria-label="Previous page" onClick={() => setPage(current - 1)}><ChevronLeft size={17}/></button><span>{current + 1} / {pages}</span><button className="icon-btn" disabled={current >= pages - 1} aria-label="Next page" onClick={() => setPage(current + 1)}><ChevronRight size={17}/></button></div></div>
    </div>
    {editor && <PqrEditor record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
    {archiving && <ArchiveRecordDialog resourceKey="pqr" record={archiving} onClose={() => setArchiving(null)}/>}
    {bulkArchive && <BulkArchiveDialog resourceKey="pqr" records={checked} onClose={() => setBulkArchive(false)} onDone={() => setSelected([])}/>}
  </div>;
}

/** The PQR form: the 26 attributes in one list (choose a value or type a new one), Valid until and File. */
export function PqrEditor({ record, onClose }: { record?: Row; onClose: () => void }) {
  const { rows, refresh, notify, canRecord, label } = useWorkspace();
  const options = rows.qualification_options || [];
  const nameOf = (id: unknown) => str(options.find(option => option.id === id)?.name);
  const initial = useMemo(() => Object.fromEntries([...PQR_ATTRIBUTES.map(attribute => [attribute.name, nameOf(record?.[attribute.name])]), ['validUntil', str(record?.validUntil)]]) as Record<string, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [record]);
  const [values, setValues] = useState(initial); const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<{ attribute: typeof PQR_ATTRIBUTES[number]; option: Row } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setFields({}); setBusy(true);
    // The form shows values by name; a value is sent when it changed (the server finds or adds the value of its attribute).
    const payload = Object.fromEntries(Object.entries(values).filter(([name, value]) => !record || value !== initial[name]).map(([name, value]) => [name, value.trim()]));
    try {
      let id = record?.id;
      if (!record || Object.keys(payload).length) { const saved = await api<{ record: Row }>(`/records/pqr${record ? `/${record.id}` : ''}`, { method: record ? 'PUT' : 'POST', body: JSON.stringify({ ...payload, ...(record ? { _version: record._version } : {}) }) }); id = saved.record.id; }
      if (file && id) {
        const body = new FormData(); body.set('file', file); body.set('entityType', 'pqr'); body.set('entityId', id); body.set('documentType', PQR_DOCUMENT_TYPE);
        try { await api('/files', { method: 'POST', body }); }
        catch (failure) { await refresh(); setError(`The PQR was saved, but the file was not uploaded: ${(failure as Error).message}`); setBusy(false); return; }
      }
      await refresh(); notify(`PQR ${record ? 'updated' : 'created'}.`); onClose();
    } catch (failure) { setError((failure as Error).message); setFields((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const files = record ? activeRows(rows, 'attachments').filter(item => item.entityType === 'pqr' && item.entityId === record.id) : [];
  if (removing) return <RemoveValueDialog attribute={removing.attribute.label} option={removing.option} onClose={() => setRemoving(null)} onRemoved={() => { if (values[removing.attribute.name] === str(removing.option.name) && initial[removing.attribute.name] !== values[removing.attribute.name]) setValues(old => ({ ...old, [removing.attribute.name]: '' })); setRemoving(null); }}/>;
  return <Modal title={record ? 'Edit PQR' : 'Add PQR'} subtitle={record ? label('pqr', record.id) : 'Choose an existing value or type a new one for reuse.'} onClose={onClose} wide><form onInvalidCapture={revealInvalidField} onSubmit={event => void submit(event)}><div className="modal-body">
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    <div className="form-grid">{PQR_ATTRIBUTES.map(attribute => {
      const id = `pqr-${attribute.name}`; const choices = options.filter(option => !option._archived && option.category === attribute.category);
      const current = choices.find(option => str(option.name) === values[attribute.name].trim());
      return <div className="field" key={attribute.name}><div className="pqr-field-label"><label htmlFor={id}>{attribute.label}</label>
        {canRecord('qualification_options', 'delete', current) && <button type="button" className="icon-btn" disabled={!current} title={current ? 'Remove this value from the dropdown' : 'Choose a value to remove it from the dropdown'} aria-label={current ? `Remove ${str(current.name)} from the ${attribute.label} dropdown` : `Remove a value from the ${attribute.label} dropdown`} onClick={() => current && setRemoving({ attribute, option: current })}><Trash2 size={13}/></button>}</div>
        <input id={id} type="text" list={`${id}-options`} autoComplete="off" value={values[attribute.name]} aria-invalid={Boolean(fields[attribute.name])} aria-describedby={fields[attribute.name] ? `${id}-error` : undefined} onChange={event => { const text = event.target.value; setValues(old => ({ ...old, [attribute.name]: text })); }}/>
        <datalist id={`${id}-options`}>{choices.map(option => <option key={option.id} value={str(option.name)}/>)}</datalist>
        {attribute.name === PQR_NUMBER.name && <small className="field-hint">The PQR number. The Excel import matches on it.</small>}
        {fields[attribute.name] && <small id={`${id}-error`} className="field-error">{fields[attribute.name]}</small>}</div>;
    })}
      <div className="field"><label htmlFor="pqr-validUntil">Valid until</label><input id="pqr-validUntil" type="date" value={values.validUntil} aria-invalid={Boolean(fields.validUntil)} onChange={event => { const text = event.target.value; setValues(old => ({ ...old, validUntil: text })); }}/>{fields.validUntil && <small className="field-error">{fields.validUntil}</small>}</div>
      {canRecord('pqr', 'import', record) && <div className="field"><label htmlFor="pqr-file">File</label><input id="pqr-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.docx,.txt" onChange={event => setFile(event.target.files?.[0] || null)}/><small className="field-hint">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} attached. A new file is added.` : 'PDF, image or document.'}</small></div>}
    </div>
  </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{record ? 'Save changes' : 'Add'}</button></div></form></Modal>;
}

function RemoveValueDialog({ attribute, option, onClose, onRemoved }: { attribute: string; option: Row; onClose: () => void; onRemoved: () => void }) {
  const { refresh, notify } = useWorkspace(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function remove() {
    setBusy(true); setError('');
    try { await post(`/pqr/options/${option.id}/remove`, {}); await refresh(); notify('Value removed from the dropdown.'); onRemoved(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Remove this value from the dropdown?" subtitle={`${attribute}: ${str(option.name)}`} onClose={onClose}><div className="modal-body">{error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}<p>The value is no longer offered for {attribute}. PQRs that already use it keep it.</p></div>
    <div className="modal-footer"><button className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => void remove()}>{busy && <Loader2 size={15} className="spin"/>}Remove value</button></div></Modal>;
}

interface PreviewRow { rowNo: number; action: PqrImportAction; values: Record<string, string>; errors: string[] }
interface Preview { rows: PreviewRow[]; totalRows: number; totalErrors: number; totalImportable: number; totalUpdates: number }
/** Import PQR: Excel upload, a preview per row (import / update / skip) and the import of the valid rows. */
export function PqrImportPage() {
  const { canRecord, refresh } = useWorkspace();
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<Preview | null>(null); const [chosen, setChosen] = useState<Record<number, PqrImportAction>>({});
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  if (!canRecord('pqr', 'import')) return <EmptyState title="This area is restricted" description="Your profile does not allow importing PQRs."/>;
  async function upload(event: FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setStatus({ type: 'info', text: 'Checking the Excel file…' }); setPreview(null);
    const body = new FormData(); body.set('file', file);
    try { const result = await api<Preview>('/pqr-import/preview', { method: 'POST', body }); setPreview(result); setChosen(Object.fromEntries(result.rows.map(row => [row.rowNo, row.errors.length ? 'skip' : row.action]))); setStatus({ type: 'success', text: `${result.totalRows} rows ready for review.` }); }
    catch (failure) { setStatus({ type: 'error', text: (failure as Error).message }); } finally { setBusy(false); }
  }
  async function commit() {
    if (!preview || !window.confirm('Import the valid rows?')) return;
    setBusy(true);
    try {
      const result = await post<{ imported: number; updated: number; skipped: number; failed: number }>('/pqr-import/commit', { rows: preview.rows.map(row => ({ rowNo: row.rowNo, values: row.values, action: chosen[row.rowNo] })) });
      await refresh(); setPreview(null); setFile(null);
      setStatus({ type: 'success', text: `${pqrImportMessage(result)}${result.failed ? ` ${result.failed} rows were not imported because of errors.` : ''}` });
    } catch (failure) { setStatus({ type: 'error', text: (failure as Error).message }); } finally { setBusy(false); }
  }
  const importable = preview ? preview.rows.some(row => !row.errors.length && chosen[row.rowNo] !== 'skip') : false;
  return <div className="page records-page pqr-import-page">
    <div className="page-heading"><div><div className="eyebrow"><Link to="/welding/pqr">PQR</Link> / IMPORT PQR</div><h1>Import PQR</h1><p>Add or update PQRs from an Excel sheet. Each row is checked and shown before anything is saved.</p></div></div>
    <div className="table-card pqr-import-card">
      <ol className="pqr-import-steps">
        <li><strong>Download the template.</strong> Row 1 holds the headings; the columns follow the PQR form.</li>
        <li><strong>Fill in one PQR per row</strong>, starting on row 2. PQR (the PQR number) is required. Valid until accepts 31-12-2026 or 2026-12-31.</li>
        <li><strong>Upload</strong> the file and review the preview. Rows with errors are marked; an existing PQR number is an update; set a row to skip to leave it out.</li>
        <li><strong>Import</strong> saves the valid rows. Existing PQRs keep their file and the values of empty cells.</li>
      </ol>
      <form className="pqr-import-form" onSubmit={event => void upload(event)}>
        <div className="field"><label htmlFor="pqr-import-file">Excel file<span className="required"> *</span></label><input id="pqr-import-file" type="file" accept=".xlsx" required onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); }}/></div>
        <div className="pqr-import-buttons"><button className="btn primary" disabled={busy || !file}>{busy ? <Loader2 size={15} className="spin"/> : <Upload size={15}/>}Upload</button>
          {preview && importable && <button type="button" className="btn primary" disabled={busy} onClick={() => void commit()}><CheckCircle2 size={15}/>Import</button>}
          <Link className="btn" to="/welding/pqr">Cancel</Link>
          <a className="btn subtle" href={apiUrl('/pqr-import/template')}><Download size={15}/>Download Excel template</a></div>
      </form>
      {status && <div className={`alert ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.type === 'error' ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>}<span>{status.text}</span></div>}
      {preview && <><p className="pqr-import-summary" role="status">Rows: {preview.totalRows} | Errors: {preview.totalErrors} | Import: {preview.totalImportable} | Update: {preview.totalUpdates}</p>
        <TableScroll><table className="data-table"><thead><tr><th>#</th><th>Action</th><th>PQR</th><th>Material</th><th>Welding Process EN</th><th>Position</th><th>Valid until</th><th>Errors</th></tr></thead>
          <tbody>{preview.rows.map(row => <tr key={row.rowNo} className={row.errors.length ? 'pqr-import-error' : chosen[row.rowNo] === 'skip' ? 'pqr-import-skip' : ''}>
            <td className="tabular">{row.rowNo}</td>
            <td><div className="select-wrap pqr-import-action"><select aria-label={`Action for row ${row.rowNo}`} disabled={row.errors.length > 0} value={chosen[row.rowNo]} onChange={event => { const action = event.target.value as PqrImportAction; setChosen(old => ({ ...old, [row.rowNo]: action })); }}>{PQR_IMPORT_ACTIONS.filter(action => action === 'skip' || action === row.action).map(action => <option key={action} value={action}>{action}</option>)}</select><ChevronDown size={14}/></div></td>
            <td>{row.values[PQR_NUMBER.name] || <span className="muted">—</span>}</td><td>{row.values.attribute5Id || ''}</td><td>{row.values.attribute11Id || ''}</td><td>{row.values.attribute9Id || ''}</td><td className="tabular">{row.values.validUntil ? formatDate(row.values.validUntil) : ''}</td>
            <td className="pqr-import-errors">{row.errors.join(' ')}</td></tr>)}</tbody></table></TableScroll></>}
    </div>
  </div>;
}
