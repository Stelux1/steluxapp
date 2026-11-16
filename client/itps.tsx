import { useId, useMemo, useState, type FormEvent } from 'react';
import { Download, FileText, History, Import, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { RESOURCE_MAP } from './catalog.ts';
import { ApiError, api, apiUrl, formatDate, formatNumber, post } from './api.ts';
import { Badge, Dropdown, EmptyState, FieldInput, FormError, Modal, SearchInput, TableScroll, revealInvalidField } from './components.tsx';
import { activeRows, useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { TablePage } from './records.tsx';
import { itpNdtPercent } from '../shared/itp-dashboard.ts';
import { ITP_ADD_FIELDS, ITP_COLUMNS, ITP_EDIT_FIELDS, itpActive, itpDeleteRefusal, itpIsometrics, itpLatest, itpOrder, itpRevisions, itpScope, revisionErrors } from '../shared/itps.ts';
import type { Field, Row } from '../shared/types.ts';

const RESOURCE = 'itps';
const text = (value: unknown) => String(value ?? '').trim();
const failureText = (failure: unknown) => (failure as Error).message || 'Saving failed.';

/** ITPs page (Weld Pilot → Welding data → ITPs), built from the vendor manual. Outside the hosted workspace the ordinary table page is used. */
export function ItpsPage() {
  const { user } = useWorkspace();
  return user.availability?.features.includes('pilots') ? <ItpList/> : <TablePage resourceKey={RESOURCE}/>;
}

type Dialog = { kind: 'edit' | 'revisions' | 'delete'; row: Row } | { kind: 'add' | 'import' };

function ItpList() {
  const { rows, canRecord, refresh, notify } = useWorkspace(); const pilot = usePilot();
  const [query, setQuery] = useState(''), [dialog, setDialog] = useState<Dialog | null>(null), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const items = useMemo(() => activeRows(rows, RESOURCE).sort(itpOrder), [rows]);
  const term = query.trim().toLowerCase();
  const shown = items.filter(itp => !term || [itp.number, itp.title, itp.description, itpScope(itp)].some(value => text(value).toLowerCase().includes(term)));
  if (!canRecord(RESOURCE)) return <div className="page"><EmptyState title="You do not have rights to open this page" description="Your permission profile does not include the ITPs."/></div>;
  const creatable = canRecord(RESOURCE, 'insert'), importable = creatable && canRecord('isometrics', 'edit');

  async function toggle(itp: Row) {
    setBusy(itp.id); setError('');
    try { await api(`/records/itps/${itp.id}`, { method: 'PUT', body: JSON.stringify({ active: !itpActive(itp), _version: itp._version }) }); await refresh(); notify(itpActive(itp) ? `ITP ${text(itp.number)} set to inactive.` : `ITP ${text(itp.number)} set to active.`); }
    catch (failure) { setError(failureText(failure)); }
    finally { setBusy(''); }
  }

  return <div className="page records-page itps-page" style={{ '--pilot-color': pilot?.pilot.color } as React.CSSProperties}>
    <div className="page-heading"><div><div className="eyebrow">WELDING DATA</div><h1>ITPs<span className="heading-count">{items.length}</span></h1><p>The ITP catalog of the site. Each ITP keeps its PDF revisions and is linked to isometrics through ITP No and ITP No 2.</p></div>
      <div className="heading-actions">
        {importable && <button className="btn" onClick={() => setDialog({ kind: 'import' })}><Import size={16}/>Import from isometrics</button>}
        {creatable && <button className="btn primary" onClick={() => setDialog({ kind: 'add' })}><Plus size={17}/>Add ITP</button>}
      </div></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    <div className="table-card">
      <div className="table-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search ITP…"/></div>
      <TableScroll><table className="data-table"><caption className="sr-only">ITPs</caption>
        <thead><tr>{ITP_COLUMNS.map(column => column === 'Options' ? <th key={column} scope="col" className="actions-cell"><span className="sr-only">{column}</span></th> : <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{shown.map(itp => {
          const latest = itpLatest(itp, rows.attachments), linked = itpIsometrics(itp.id, rows.isometrics).length, percent = itpNdtPercent(itp);
          const editable = canRecord(RESOURCE, 'edit', itp), name = text(itp.number) || 'ITP';
          return <tr key={itp.id}>
            <td><strong>{name}</strong></td><td>{text(itp.title) || '—'}</td><td>{itpScope(itp)}</td>
            <td className="tabular">{percent === null ? '—' : formatNumber(percent)}</td>
            <td className="tabular">{latest.file ? <a className="text-link" href={apiUrl(`/files/${latest.file.id}`)} target="_blank" rel="noreferrer">{latest.revNo}<FileText size={13} aria-hidden="true"/><span className="sr-only"> (PDF)</span></a> : latest.revNo || '—'}</td>
            <td className="tabular">{linked}</td>
            <td>{editable ? <button type="button" className="text-link" aria-pressed={itpActive(itp)} aria-label={`${name} active`} disabled={busy === itp.id} onClick={() => void toggle(itp)}>
              {busy === itp.id ? <Loader2 size={14} className="spin"/> : <Badge color={itpActive(itp) ? 'green' : 'neutral'}>{itpActive(itp) ? 'Yes' : 'No'}</Badge>}</button>
              : <Badge color={itpActive(itp) ? 'green' : 'neutral'}>{itpActive(itp) ? 'Yes' : 'No'}</Badge>}</td>
            <td className="actions-cell"><Dropdown className="row-menu" label={`Options for ${name}`} trigger={<span className="icon-btn"><MoreHorizontal size={18}/></span>}>
              {editable && <button onClick={() => setDialog({ kind: 'edit', row: itp })}><Pencil size={14}/>Edit</button>}
              <button onClick={() => setDialog({ kind: 'revisions', row: itp })}><History size={14}/>Revisions</button>
              {canRecord(RESOURCE, 'delete', itp) && <button onClick={() => setDialog({ kind: 'delete', row: itp })}><Trash2 size={14}/>Delete</button>}
            </Dropdown></td></tr>;
        })}</tbody></table></TableScroll>
      {!shown.length && <EmptyState title={term ? 'No ITPs match your search' : 'No ITPs yet'} description={term ? 'Try another search.' : creatable ? 'Add the first ITP with its PDF, or import the ITP numbers already on your isometrics.' : 'ITPs added by your team will appear here.'}
        action={!term && creatable ? <button className="btn primary" onClick={() => setDialog({ kind: 'add' })}><Plus size={16}/>Add ITP</button> : undefined}/>}
      <div className="table-footer"><span role="status" aria-live="polite">{shown.length} of {items.length} ITPs</span></div>
    </div>
    {dialog?.kind === 'add' && <ItpEditor onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'edit' && <ItpEditor record={dialog.row} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'revisions' && <RevisionsDialog itp={dialog.row} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'delete' && <DeleteDialog itp={dialog.row} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'import' && <ImportDialog onClose={() => setDialog(null)}/>}
  </div>;
}

const fieldsOf = (names: readonly string[]) => names.map(name => RESOURCE_MAP[RESOURCE]?.fields.find(field => field.name === name)).filter((field): field is Field => Boolean(field));

function RevisionInputs({ revNo, setRevNo, setFile, comment, setComment, problems }: { revNo: string; setRevNo: (value: string) => void; setFile: (file: File | null) => void; comment: string; setComment: (value: string) => void; problems: Record<string, string> }) {
  const id = useId();
  return <>
    <div className="field"><label htmlFor={`${id}-rev`}>Revision number<span className="required"> *</span></label><input id={`${id}-rev`} required maxLength={20} value={revNo} aria-invalid={Boolean(problems.revNo)} onChange={event => setRevNo(event.target.value)} placeholder="e.g. 0 or 1"/>{problems.revNo && <small className="field-error">{problems.revNo}</small>}</div>
    <div className="field"><label htmlFor={`${id}-pdf`}>PDF<span className="required"> *</span></label><input id={`${id}-pdf`} type="file" required accept="application/pdf,.pdf" aria-invalid={Boolean(problems.file)} onChange={event => setFile(event.target.files?.[0] ?? null)}/>{problems.file && <small className="field-error">{problems.file}</small>}</div>
    <div className="field full-width"><label htmlFor={`${id}-comment`}>Comment</label><textarea id={`${id}-comment`} rows={2} value={comment} onChange={event => setComment(event.target.value)}/></div>
  </>;
}

function ItpEditor({ record, onClose }: { record?: Row; onClose: () => void }) {
  const { refresh, notify } = useWorkspace();
  const fields = fieldsOf(record ? ITP_EDIT_FIELDS : ITP_ADD_FIELDS);
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(fields.map(field => [field.name, record ? record[field.name] ?? (field.name === 'active' ? true : field.name === 'scope' ? itpScope(record) : '') : field.default ?? ''])));
  const [revNo, setRevNo] = useState(''), [file, setFile] = useState<File | null>(null), [comment, setComment] = useState('');
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setProblems({});
    const local: Record<string, string> = {};
    if (!text(values.number)) local.number = 'ITP No is required.';
    if (!record) Object.assign(local, revisionErrors(revNo, file ?? undefined));
    if (Object.keys(local).length) { setProblems(local); setError('Check the highlighted fields.'); return; }
    setBusy(true);
    try {
      if (record) await api(`/records/itps/${record.id}`, { method: 'PUT', body: JSON.stringify({ ...values, ndtPercent: values.ndtPercent === '' ? null : values.ndtPercent, sortOrder: values.sortOrder === '' ? null : values.sortOrder, _version: record._version }) });
      else {
        const body = new FormData();
        for (const field of fields) body.set(field.name, String(values[field.name] ?? ''));
        body.set('revNo', revNo); body.set('comment', comment); body.set('file', file!);
        await api('/itps', { method: 'POST', body });
      }
      await refresh(); notify(record ? 'ITP saved.' : 'ITP added with its first revision.'); onClose();
    } catch (failure) { setError(failureText(failure)); setProblems((failure as ApiError).fields || {}); }
    finally { setBusy(false); }
  }
  return <Modal title={record ? 'Edit ITP' : 'Add ITP'} subtitle={record ? text(record.number) : 'The ITP appears in the list with its first revision.'} onClose={onClose}>
    <form onInvalidCapture={revealInvalidField} onSubmit={event => void submit(event)} noValidate={false}>
      <div className="modal-body">
        {error && <FormError message={error} fields={problems}/>}
        <div className="form-grid">
          {fields.map(field => <FieldInput key={field.name} field={field.name === 'number' ? { ...field, required: true } : field} value={values[field.name]} error={problems[field.name]} onChange={value => setValues(current => ({ ...current, [field.name]: value }))}/>)}
          {!record && <RevisionInputs revNo={revNo} setRevNo={setRevNo} setFile={setFile} comment={comment} setComment={setComment} problems={problems}/>}
        </div>
        {record && <p className="field-hint">Existing isometric links stay in place. A changed X-Ray % is copied to the linked isometrics. Upload a new PDF under Revisions.</p>}
      </div>
      <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary" disabled={busy}>{busy && <Loader2 size={14} className="spin"/>}Save</button></div>
    </form>
  </Modal>;
}

function RevisionsDialog({ itp, onClose }: { itp: Row; onClose: () => void }) {
  const { rows, canRecord, refresh, notify } = useWorkspace();
  const revisions = itpRevisions(itp, rows.attachments), current = rows.itps?.find(row => row.id === itp.id) ?? itp;
  const uploadable = canRecord(RESOURCE, 'edit', current) && canRecord(RESOURCE, 'import', current);
  const [revNo, setRevNo] = useState(''), [file, setFile] = useState<File | null>(null), [comment, setComment] = useState('');
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [key, setKey] = useState(0);
  async function upload(event: FormEvent) {
    event.preventDefault(); setError('');
    const local = revisionErrors(revNo, file ?? undefined, revisions);
    if (Object.keys(local).length) { setProblems(local); setError(Object.values(local)[0]); return; }
    setBusy(true); setProblems({});
    try {
      const body = new FormData(); body.set('revNo', revNo); body.set('comment', comment); body.set('file', file!);
      await api(`/itps/${itp.id}/revisions`, { method: 'POST', body });
      await refresh(); notify(`Revision ${revNo.trim()} uploaded. It is now the latest revision.`); setRevNo(''); setFile(null); setComment(''); setKey(value => value + 1);
    } catch (failure) { setError(failureText(failure)); setProblems((failure as ApiError).fields || {}); }
    finally { setBusy(false); }
  }
  return <Modal title="Revisions" subtitle={`ITP ${text(itp.number)}`} onClose={onClose} wide>
    <div className="modal-body">
      {revisions.length ? <TableScroll><table className="data-table"><caption className="sr-only">Revision history</caption>
        <thead><tr><th scope="col">Rev</th><th scope="col">Date</th><th scope="col">PDF</th><th scope="col">Comment</th></tr></thead>
        <tbody>{revisions.map((file, index) => <tr key={file.id}><td className="tabular">{text(file.revNo)}{index === 0 && <> <Badge color="green">Latest</Badge></>}</td><td className="tabular">{formatDate(file._createdAt)}</td>
          <td><a className="text-link" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer"><Download size={13} aria-hidden="true"/>{text(file.name)}</a></td><td>{text(file.note) || '—'}</td></tr>)}</tbody></table></TableScroll>
        : <EmptyState title="No revision uploaded" description={text(itp.revision) ? `Revision ${text(itp.revision)} has no PDF yet. Upload it below.` : 'Upload the first PDF revision below.'}/>}
      {uploadable && <form key={key} className="form-section" onInvalidCapture={revealInvalidField} onSubmit={event => void upload(event)} aria-label="Upload revision PDF">
        <h3>Upload revision PDF</h3>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="form-grid"><RevisionInputs revNo={revNo} setRevNo={setRevNo} setFile={setFile} comment={comment} setComment={setComment} problems={problems}/></div>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? <Loader2 size={14} className="spin"/> : <Upload size={15}/>}Upload revision</button>
      </form>}
    </div>
    <div className="modal-footer"><button className="btn" onClick={onClose}>Close</button></div>
  </Modal>;
}

function DeleteDialog({ itp, onClose }: { itp: Row; onClose: () => void }) {
  const { rows, refresh, notify } = useWorkspace();
  const refusal = itpDeleteRefusal(itp, rows.isometrics || []);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true); setError('');
    try { await post(`/records/itps/${itp.id}/archive`, { _version: itp._version }); await refresh(); notify(`ITP ${text(itp.number)} deleted.`); onClose(); }
    catch (failure) { setError(failureText(failure)); }
    finally { setBusy(false); }
  }
  return <Modal title="Delete ITP" subtitle={text(itp.number)} onClose={onClose}>
    <div className="modal-body">{refusal || error ? <div className="alert error" role="alert">{refusal || error}</div> : <p>Delete ITP {text(itp.number)}? Its revisions stay in the documents history.</p>}</div>
    <div className="modal-footer"><button className="btn" onClick={onClose}>Cancel</button>{!refusal && <button className="btn danger" disabled={busy} onClick={() => void remove()}>{busy && <Loader2 size={14} className="spin"/>}Delete</button>}</div>
  </Modal>;
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setError('');
    try { const result = await post<{ created: number; linked: number }>('/itps/import-from-isometrics', {}); await refresh(); notify(`${result.created} ${result.created === 1 ? 'ITP' : 'ITPs'} created, ${result.linked} isometric ${result.linked === 1 ? 'slot' : 'slots'} linked.`); onClose(); }
    catch (failure) { setError(failureText(failure)); }
    finally { setBusy(false); }
  }
  return <Modal title="Import from isometrics" onClose={onClose}>
    <div className="modal-body">{error && <div className="alert error" role="alert">{error}</div>}
      <p>Every isometric is scanned. Each ITP number that is not in the catalog yet becomes an ITP, and the isometrics carrying it are linked to it.</p>
      <p className="field-hint">Use this once, when you start with the catalog. Afterwards add ITPs by hand and upload a PDF revision where one is missing.</p></div>
    <div className="modal-footer"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => void run()}>{busy && <Loader2 size={14} className="spin"/>}Import</button></div>
  </Modal>;
}
