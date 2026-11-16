/**
 * Certifications of the hosted profile (Weld Pilot → Material data → Certifications; also read in MTO Pilot):
 * the Add / Edit certification form in the reference order with Duplicate certificate, the Controlled / Accepted bar,
 * Import certifications, Export to ZIP, the file link of the index number and Show certification.
 * The rules are in shared/welder-data.ts and shared/certifications.ts; the server enforces them (server/certifications.ts).
 */
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, Copy, Download, FileText, Loader2, Upload } from 'lucide-react';
import type { Field, Row } from '../shared/types.ts';
import { CERTIFICATE_FLAG_MESSAGES, CERTIFICATE_FORM_FIELDS, FLAG_CHOICES, certificateFlagChanges, certificateUses, diameterIdFor } from '../shared/welder-data.ts';
import { CERTIFICATE_PREVIEW_COLUMNS, importSummary, materialTypeOption } from '../shared/certifications.ts';
import { RESOURCE_MAP, RELATIONS, relationFields, relationIds } from './catalog.ts';
import { activeRows, useWorkspace } from './context.tsx';
import { api, apiBlob, apiUrl, post, type ApiError } from './api.ts';
import { EmptyState, FieldInput, Modal, TableScroll, revealInvalidField } from './components.tsx';

/** Whether the page is the hosted Certifications page (the other profiles keep the generic page). */
export function useCertificationPage(resourceKey: string) {
  const { user } = useWorkspace();
  const active = resourceKey === 'certifications' && Boolean(user.availability?.features.includes('pilots'));
  const [showing, setShowing] = useState<Row | null>(null);
  return { active, show: setShowing, dialog: active && showing ? <ShowCertificationDialog record={showing} onClose={() => setShowing(null)}/> : null };
}

const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim();
const materialOption = (row: Row) => [text(row.materialNo), text(row.description)].filter(Boolean).join(' — ');
/** The newest file of a certificate (the reference shows one file per certificate). */
export const certificateFile = (rows: Record<string, Row[]>, id: string) => activeRows(rows, 'attachments').filter(file => file.entityType === 'certifications' && file.entityId === id).sort((a, b) => String(b._createdAt).localeCompare(String(a._createdAt)))[0];

/** File icon next to the index number when the certificate has a file. */
export function CertificateFileLink({ row }: { row: Row }) {
  const { rows } = useWorkspace(); const file = certificateFile(rows, row.id);
  if (!file) return null;
  return <a className="cert-file-link" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer" title="Certificate file" aria-label={`Certificate file of ${text(row.indexNo) || 'this certificate'}: ${text(file.name)}`}><FileText size={14}/></a>;
}

/** The record editor of certifications: the hosted form, the generic editor elsewhere. */
export function CertificationRecordEditor({ record, onClose, fallback }: { record?: Row; onClose: () => void; fallback: ReactNode }) {
  const { user } = useWorkspace();
  return user.availability?.features.includes('pilots') ? <CertificationEditor record={record} onClose={onClose}/> : <>{fallback}</>;
}

/** Add certification / Edit certification of the reference: its fields in its order, the file, and in Edit Duplicate certificate with Copy file. */
export function CertificationEditor({ record, onClose }: { record?: Row; onClose: () => void }) {
  const def = RESOURCE_MAP.certifications; const { rows, siteId, refresh, notify, canRecord } = useWorkspace();
  const relation = (RELATIONS.certifications || []).find(item => item.field === 'projectIds');
  const fields = CERTIFICATE_FORM_FIELDS.map(name => name === 'projectIds' ? relationFields('certifications').find(field => field.name === name) as Field | undefined : def.fields.find(field => field.name === name)).filter((field): field is Field => Boolean(field));
  const materials = activeRows(rows, 'materials');
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = Object.fromEntries(def.fields.filter(field => CERTIFICATE_FORM_FIELDS.includes(field.name)).map(field => [field.name, record?.[field.name] ?? field.default ?? (field.type === 'checkbox' ? false : '')]));
    // An older certificate keeps its diameter as text: it opens on the Weld diameter of that name.
    if (!text(initial.diameterId) && record?.diameter) initial.diameterId = diameterIdFor(record.diameter, rows.diameters || []);
    if (relation) initial.projectIds = record ? relationIds(rows, relation, record.id) : [];
    return initial;
  });
  const chosenMaterial = materials.find(row => row.id === values.materialId) || (rows.materials || []).find(row => row.id === values.materialId);
  const [materialText, setMaterialText] = useState(() => chosenMaterial ? materialOption(chosenMaterial) : '');
  const [file, setFile] = useState<File | null>(null); const [copyFile, setCopyFile] = useState(false);
  const [error, setError] = useState(''); const [problems, setProblems] = useState<Record<string, string>>({}); const [busy, setBusy] = useState('');
  const id = useId().replaceAll(':', ''); const listId = `cert-materials-${id}`;
  const change = (name: string, value: unknown) => setValues(current => ({ ...current, [name]: value }));
  function chooseMaterial(value: string) {
    setMaterialText(value);
    const wanted = value.trim().toLowerCase();
    const found = wanted ? materials.filter(row => materialOption(row).toLowerCase() === wanted || text(row.materialNo).toLowerCase() === wanted) : [];
    if (!wanted) { change('materialId', ''); return; }
    if (found.length !== 1) return;
    // The reference fills Material part and Type of material from the chosen material.
    const material = found[0];
    setValues(current => ({ ...current, materialId: material.id, ...(material.partId ? { materialPartId: material.partId } : {}), ...(material.typeId ? { materialTypeId: material.typeId } : {}) }));
  }
  const payload = () => {
    const all = { ...values };
    if (!record) return all;
    // Edit sends what changed, as the record editor does.
    return Object.fromEntries(Object.entries(all).filter(([name, value]) => {
      const previous = name === 'projectIds' && relation ? relationIds(rows, relation, record.id) : record[name] ?? def.fields.find(field => field.name === name)?.default ?? '';
      return JSON.stringify(value) !== JSON.stringify(previous);
    }));
  };
  async function attach(targetId: string) {
    if (!file) return;
    const body = new FormData(); body.set('file', file); body.set('entityType', 'certifications'); body.set('entityId', targetId); body.set('documentType', 'Certificate');
    await api('/files', { method: 'POST', body });
  }
  const fail = (failure: unknown) => { const problem = failure as ApiError; const fields = { ...(problem.fields || {}) }; if (fields.diameter) { fields.diameterId ??= fields.diameter; delete fields.diameter; } setError(problem.message); setProblems(fields); };
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setProblems({});
    if (text(materialText) && !values.materialId) { setError('Please check the highlighted fields.'); setProblems({ materialId: 'Choose a material from the list.' }); return; }
    setBusy('save');
    try {
      const saved = record
        ? await api<{ record: Row }>(`/records/certifications/${record.id}`, { method: 'PUT', body: JSON.stringify({ ...payload(), _version: record._version }) })
        : await post<{ record: Row }>('/records/certifications', { ...values, siteId });
      try { await attach(saved.record.id); } catch (failure) { await refresh(); setError(`The certificate was saved, but the file was not attached: ${(failure as Error).message}`); setBusy(''); return; }
      await refresh(); notify(`Certification ${record ? 'updated' : 'added'}.`); onClose();
    } catch (failure) { fail(failure); } finally { setBusy(''); }
  }
  async function duplicate() {
    if (!record) return;
    setError(''); setProblems({}); setBusy('duplicate');
    try {
      const copy = await post<{ record: Row }>(`/certifications/${record.id}/duplicate`, { values, copyFile, siteId });
      try { await attach(copy.record.id); } catch (failure) { await refresh(); setError(`The copy was saved, but the file was not attached: ${(failure as Error).message}`); setBusy(''); return; }
      await refresh(); notify(`Certificate duplicated as ${text(copy.record.indexNo)}.`); onClose();
    } catch (failure) { fail(failure); } finally { setBusy(''); }
  }
  const canDuplicate = Boolean(record) && canRecord('certifications', 'insert');
  const canAttach = canRecord('certifications', 'import');
  const materialField = fields.find(field => field.name === 'materialId');
  return <Modal title={record ? 'Edit certification' : 'Add certification'} subtitle={record ? `Index number ${text(record.indexNo) || '—'}` : 'The index number is given when the certificate is added.'} onClose={onClose} wide>
    <form onInvalidCapture={revealInvalidField} onSubmit={event => void submit(event)}>
      <div className="modal-body">
        {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
        <div className="form-grid">
          {fields.map(field => field.name === 'materialId' ? <div key={field.name} className="field">
            <label htmlFor={`cert-material-${id}`}>{materialField?.label || 'Material'}</label>
            <input id={`cert-material-${id}`} type="text" list={listId} placeholder="Choose Material from DB" autoComplete="off" value={materialText} aria-invalid={Boolean(problems.materialId)} aria-describedby={problems.materialId ? `cert-material-${id}-error` : `cert-material-${id}-hint`} onChange={event => chooseMaterial(event.target.value)}/>
            <datalist id={listId}>{materials.map(row => <option key={row.id} value={materialOption(row)}/>)}</datalist>
            {problems.materialId ? <small id={`cert-material-${id}-error`} className="field-error">{problems.materialId}</small> : <small id={`cert-material-${id}-hint`} className="cert-material-hint">Type a material number; Material part and Type of material are filled from it.</small>}
          </div> : <FieldInput key={field.name} field={field} value={values[field.name]} values={values} error={problems[field.name]} onChange={value => change(field.name, value)}/>)}
          {canAttach && <div className="field full-width">
            <label htmlFor={`cert-file-${id}`}>File</label>
            <input id={`cert-file-${id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={event => setFile(event.target.files?.[0] || null)}/>
            <small className="field-hint">{record && rows.attachments?.some(row => row.entityType === 'certifications' && row.entityId === record.id && !row._archived) ? 'A new file is added next to the files already attached.' : 'PDF or image, up to 20 MB.'}</small>
          </div>}
        </div>
      </div>
      <div className="modal-footer">
        {canDuplicate && <label className="cert-footer-copy"><input type="checkbox" checked={copyFile} disabled={!canAttach} onChange={event => setCopyFile(event.target.checked)}/>Copy file</label>}
        {canDuplicate && <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void duplicate()}>{busy === 'duplicate' ? <Loader2 size={15} className="spin"/> : <Copy size={15}/>}Duplicate certificate</button>}
        <button type="button" className="btn" disabled={Boolean(busy)} onClick={onClose}>Cancel</button>
        {(!record || canRecord('certifications', 'edit', record)) && <button className="btn primary" disabled={Boolean(busy)}>{busy === 'save' && <Loader2 size={15} className="spin"/>}{record ? 'Update' : 'Add'}</button>}
      </div>
    </form>
  </Modal>;
}

/** The Controlled / Accepted bar of the checked certificates (reference #certBulkBar). */
export function CertificateFlagsBar({ records, onDone }: { records: Row[]; onDone: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [controlled, setControlled] = useState(''); const [accepted, setAccepted] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const id = useId().replaceAll(':', '');
  async function apply() {
    setMessage('');
    if (records.length > 500) { setMessage(CERTIFICATE_FLAG_MESSAGES.tooMany); return; }
    const changes = certificateFlagChanges(controlled, accepted);
    if (!changes) { setMessage(CERTIFICATE_FLAG_MESSAGES.pick); return; }
    setBusy(true);
    try {
      await post('/bulk/certifications', { ids: records.map(row => row.id), changes, versions: Object.fromEntries(records.map(row => [row.id, row._version])) });
      await refresh(); notify(`${records.length} ${records.length === 1 ? 'certificate' : 'certificates'} updated.`); setControlled(''); setAccepted(''); onDone();
    } catch { setMessage(CERTIFICATE_FLAG_MESSAGES.failed); } finally { setBusy(false); }
  }
  const select = (label: string, value: string, set: (value: string) => void) => <label htmlFor={`${id}-${label}`}>{label}<select id={`${id}-${label}`} value={value} onChange={event => set(event.target.value)}>{FLAG_CHOICES.map(([option, title]) => <option key={option} value={option}>{title}</option>)}</select></label>;
  return <div className="cert-flags" role="group" aria-label="Controlled and Accepted of the checked certificates">
    {select('Controlled', controlled, setControlled)}{select('Accepted', accepted, setAccepted)}
    <button type="button" className="btn primary small" disabled={busy || !records.length} onClick={() => void apply()}>{busy && <Loader2 size={13} className="spin"/>}Apply</button>
    {message && <span className="cert-flags-message" role="alert">{message}</span>}
  </div>;
}

/** "Import certifications" and "Export to ZIP" of the page heading. `projectId` is the project the list is filtered by. */
export function CertificationActions({ projectId }: { projectId: string }) {
  const { canRecord, siteId, notify } = useWorkspace();
  const [importing, setImporting] = useState(false); const [zipping, setZipping] = useState(false); const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const canImport = canRecord('certifications', 'insert') && canRecord('certifications', 'import'), canZip = canRecord('certifications', 'export');
  if (!siteId || !canImport && !canZip) return null;
  async function zip() {
    setZipping(true); setStatus({ text: 'The certificate ZIP is being prepared. The download starts when it is ready.' });
    try {
      const blob = await apiBlob(`/certifications/zip?siteId=${encodeURIComponent(siteId)}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`);
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'certifications.zip'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(null); notify('ZIP is ready — the download has started.');
    } catch { setStatus({ text: 'The ZIP could not be created.', error: true }); } finally { setZipping(false); }
  }
  return <span className="cert-actions">
    {canImport && <button type="button" className="btn" onClick={() => setImporting(true)}><Upload size={15}/>Import certifications</button>}
    {canZip && <button type="button" className="btn" disabled={zipping} onClick={() => void zip()}>{zipping ? <Loader2 size={15} className="spin"/> : <Download size={15}/>}{zipping ? 'Generating ZIP…' : 'Export to ZIP'}</button>}
    {status && <span className={`cert-status ${status.error ? 'error' : ''}`} role={status.error ? 'alert' : 'status'}>{status.text}</span>}
    {importing && <CertificationImportDialog onClose={() => setImporting(false)}/>}
  </span>;
}

interface PreviewRow { row: number; cells: Record<string, string>; values: Record<string, unknown>; errors: Record<string, string>; action: 'import' | 'skip' }
const PREVIEW_HEADERS: Record<string, string> = { indexNo: 'Index', chargeNo: 'Charge', certType: 'CertType', name: 'Attest', wallThickness: 'Wall', schedule: 'Schedule', materialTypeId: 'TypeMaterial', materialPartId: 'MaterialPart', diameterId: 'Diameter', supplierId: 'Supplier', controlled: 'Ctr', accepted: 'Acc' };
const MAPPED: Record<string, string> = { materialTypeId: 'material_types', materialPartId: 'material_parts', diameterId: 'diameters', supplierId: 'suppliers' };

/** Import certifications: upload an Excel sheet, correct the preview per cell, then commit the rows without errors. */
export function CertificationImportDialog({ onClose }: { onClose: () => void }) {
  const { rows, siteId, refresh, notify, label } = useWorkspace();
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(''); const [result, setResult] = useState('');
  const id = useId().replaceAll(':', '');
  const summary = useMemo(() => preview ? importSummary(preview) : null, [preview]);
  async function upload(event: FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy('upload'); setError(''); setResult(''); setPreview(null);
    const body = new FormData(); body.set('siteId', siteId); body.set('file', file);
    try { const answer = await api<{ rows: PreviewRow[] }>('/certifications/import/preview', { method: 'POST', body }); setPreview(answer.rows); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(''); }
  }
  const update = (index: number, patch: (row: PreviewRow) => PreviewRow) => setPreview(current => current && current.map((row, i) => i === index ? patch(row) : row));
  function map(index: number, field: string, value: unknown) {
    update(index, row => { const errors = { ...row.errors }; delete errors[field]; delete errors[field === 'diameterId' ? 'diameter' : field]; return { ...row, values: { ...row.values, [field]: value }, errors }; });
  }
  async function commit() {
    if (!preview) return;
    setBusy('commit'); setError('');
    try {
      const answer = await post<{ inserted: number; skipped: number; problems: { row: number; message: string }[] }>('/certifications/import', { siteId, rows: preview.map(row => ({ row: row.row, values: row.values, action: row.action === 'import' && !Object.keys(row.errors).length ? 'import' : 'skip' })) });
      await refresh(); setPreview(null); setFile(null);
      setResult(`Inserted: ${answer.inserted} | Skipped: ${answer.skipped}${answer.problems.length ? ` · ${answer.problems.slice(0, 5).map(item => `Row ${item.row}: ${item.message}`).join(' · ')}` : ''}`);
      if (answer.inserted) notify(`${answer.inserted} ${answer.inserted === 1 ? 'certificate' : 'certificates'} imported.`);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(''); }
  }
  const options = (key: string) => activeRows(rows, key).map(row => ({ id: row.id, title: key === 'material_types' ? materialTypeOption(row) : label(key, row.id) }));
  const cellClass = (row: PreviewRow, field: string) => row.errors[field] || field === 'diameterId' && row.errors.diameter ? 'cert-cell-error' : 'cert-cell-ok';
  const otherErrors = (row: PreviewRow) => Object.entries(row.errors).filter(([field]) => !CERTIFICATE_PREVIEW_COLUMNS.includes(field) && !(field === 'diameter' && 'diameterId' in row.values)).map(([, message]) => message);
  return <Modal title="Import certifications" subtitle="Upload an Excel (XLSX) file. You will get a preview with error highlighting per cell." onClose={onClose} wide>
    <div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      {result && <div className="alert success" role="status"><span>{result}</span></div>}
      <p><strong>Templates</strong>: <a className="text-link" href={apiUrl('/certifications/import/template')}><Download size={13}/>Download Excel template</a></p>
      <form className="cert-import-form" onSubmit={event => void upload(event)}>
        <div className="field"><label htmlFor={`cert-import-${id}`}>Excel file (.xlsx)</label><input id={`cert-import-${id}`} type="file" accept=".xlsx,.csv" required onChange={event => setFile(event.target.files?.[0] || null)}/></div>
        <button className="btn primary" disabled={!file || Boolean(busy)}>{busy === 'upload' && <Loader2 size={15} className="spin"/>}Upload</button>
      </form>
      {busy === 'upload' && <p role="status">Uploading and checking the file…</p>}
      {preview && summary && <>
        <p className="cert-import-summary" role="status">Rows: {summary.rows} | Errors: {summary.errors} | Importable now: {summary.importable}</p>
        <TableScroll><table className="data-table cert-import-table">
          <thead><tr><th>#</th><th>Action</th>{CERTIFICATE_PREVIEW_COLUMNS.map(field => <th key={field}>{PREVIEW_HEADERS[field]}</th>)}</tr></thead>
          <tbody>{preview.map((row, index) => <tr key={row.row} className={row.action === 'skip' ? 'cert-row-skip' : ''}>
            <td>{row.row}{otherErrors(row).length > 0 && <small className="field-error">{otherErrors(row).join(' ')}</small>}</td>
            <td><select aria-label={`Action for row ${row.row}`} value={row.action} onChange={event => update(index, current => ({ ...current, action: event.target.value === 'skip' ? 'skip' : 'import' }))}><option value="import">import</option><option value="skip">skip</option></select></td>
            {CERTIFICATE_PREVIEW_COLUMNS.map(field => {
              const message = row.errors[field] || (field === 'diameterId' ? row.errors.diameter : '');
              const title = message ? `${PREVIEW_HEADERS[field]}: ${message}` : undefined;
              if (MAPPED[field]) return <td key={field} className={cellClass(row, field)} title={title}><select aria-label={`${PREVIEW_HEADERS[field]} for row ${row.row}`} aria-invalid={Boolean(message)} value={String(row.values[field] ?? '')} onChange={event => map(index, field, event.target.value)}><option value="">{row.cells[Object.keys(row.cells).find(header => header.toLowerCase() === ({ materialTypeId: 'type of material', materialPartId: 'material part', diameterId: 'diameter', supplierId: 'supplier' } as Record<string, string>)[field]) || ''] || '—'}</option>{options(MAPPED[field]).map(option => <option key={option.id} value={option.id}>{option.title}</option>)}</select></td>;
              if (field === 'controlled' || field === 'accepted') return <td key={field} className={cellClass(row, field)} title={title}><select aria-label={`${PREVIEW_HEADERS[field]} for row ${row.row}`} value={row.values[field] ? '1' : '0'} onChange={event => map(index, field, event.target.value === '1')}><option value="0">No</option><option value="1">Yes</option></select></td>;
              return <td key={field} className={cellClass(row, field)} title={title}>{text(row.values[field]) || <span className="muted">—</span>}{message && <small className="field-error">{message}</small>}</td>;
            })}
          </tr>)}</tbody>
        </table></TableScroll>
      </>}
    </div>
    <div className="modal-footer">
      <button type="button" className="btn" onClick={onClose} disabled={busy === 'commit'}>{result ? 'Close' : 'Cancel'}</button>
      {preview && summary && summary.importable > 0 && <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={() => void commit()}>{busy === 'commit' && <Loader2 size={15} className="spin"/>}Commit import</button>}
    </div>
  </Modal>;
}

/** Show certification: where the certificate is used (project, isometric and weld number). */
export function ShowCertificationDialog({ record, onClose }: { record: Row; onClose: () => void }) {
  const { rows, label } = useWorkspace();
  const uses = certificateUses(record.id, rows);
  return <Modal title="Show certification" subtitle={label('certifications', record.id)} onClose={onClose}>
    <div className="modal-body">
      {uses.length ? <TableScroll><table className="data-table"><thead><tr><th>Project</th><th>Isometric</th><th>Weld</th></tr></thead><tbody>{uses.map(use => <tr key={use.weldId}><td>{use.project || '—'}</td><td>{use.isometric || '—'}</td><td>{use.weld || '—'}</td></tr>)}</tbody></table></TableScroll>
        : <EmptyState title="Not used yet" description="No weld uses this certificate."/>}
    </div>
    <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
  </Modal>;
}
