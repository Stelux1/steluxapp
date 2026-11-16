import { useId, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Download, FileText, History, Loader2, Lock, MoreHorizontal, Pencil, PenLine, Plus, Printer, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { RESOURCE_MAP } from './catalog.ts';
import { api, apiUrl, post, ApiError, formatDate } from './api.ts';
import { Badge, Dropdown, EmptyState, FieldInput, Modal, SearchInput, TableScroll } from './components.tsx';
import { activeRows, useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { RecordHistory, TablePage } from './records.tsx';
import { SignaturePad } from './signatures.tsx';
import {
  PUNCH_FILE_LIMIT, PUNCH_FILE_TYPES, PUNCH_LETTERS, PUNCH_PROGRESS_OPTIONS, PUNCH_SIGN_OFF_DOCUMENT, PUNCH_TYPES, SIGNER_TYPES, canTransition, isOverdue, matchesPunchKpi, punchCategory,
  punchCategoryLabel, punchCounts, punchFinishErrors, punchInputErrors, punchKind, punchKpis, punchStatus, punchToday, type PunchKpiKey, type PunchTransition,
} from '../shared/punch.ts';
import type { Row } from '../shared/types.ts';

const RESOURCE = 'punchlists';
const text = (value: unknown) => String(value ?? '').trim();
const STATUS_COLOR: Record<string, string> = { Open: 'amber', Finished: 'neutral', Passed: 'green', Removed: 'neutral' };
const numberOf = (row: Row) => Number(row.number) || 0;

/** The project of an item: its own (project-related items) or its isometric's. */
function projectOf(row: Row, rows: Record<string, Row[]>): string {
  return text(row.projectId) || text(rows.isometrics?.find(iso => iso.id === row.isoId)?.projectId);
}
/** Photos and documents of an item (the sign-off file is listed apart), oldest first. */
const filesOf = (rows: Record<string, Row[]>, item: Row) => activeRows(rows, 'attachments').filter(file => file.entityType === RESOURCE && file.entityId === item.id).sort((a, b) => a._createdAt.localeCompare(b._createdAt));

/** Punch lists page (Weld Pilot → Releases). Outside the hosted workspace the ordinary table page is used. */
export function PunchPage() {
  const { user } = useWorkspace();
  return user.availability?.features.includes('pilots') ? <PunchList/> : <TablePage resourceKey={RESOURCE}/>;
}

type Dialog = { kind: PunchTransition | 'history'; row: Row };

function PunchList() {
  const { rows, canRecord, canRun, label, notify } = useWorkspace(); const pilot = usePilot();
  const def = RESOURCE_MAP[RESOURCE];
  const [kpi, setKpi] = useState<PunchKpiKey | ''>(''), [project, setProject] = useState(''), [kind, setKind] = useState(''), [letter, setLetter] = useState(''), [q, setQ] = useState('');
  const [page, setPage] = useState(0), [size, setSize] = useState(20);
  const [editor, setEditor] = useState<Row | 'new' | null>(null), [dialog, setDialog] = useState<Dialog | null>(null);
  const today = punchToday();
  const items = useMemo(() => activeRows(rows, RESOURCE), [rows]);
  const iso = (row: Row) => rows.isometrics?.find(item => item.id === row.isoId);
  const contractorName = (row: Row) => row.contractorId ? label('companies', row.contractorId) : text(row.assignedTo);
  // The key figures follow project, punch type, type and search; choosing a card narrows the table further.
  const scoped = useMemo(() => {
    const query = q.toLowerCase().trim();
    return items.filter(row => (!project || projectOf(row, rows) === project) && (!kind || punchKind(row) === kind) && (!letter || punchCategory(row.category) === letter)
      && (!query || [row.description, row.name, row.reportedBy, row.number, iso(row)?.isoNo, contractorName(row)].some(value => text(value).toLowerCase().includes(query))));
  }, [items, rows, project, kind, letter, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const cards = useMemo(() => punchKpis(scoped, today), [scoped, today]);
  const filtered = useMemo(() => scoped.filter(row => !kpi || matchesPunchKpi(row, kpi, today)).sort((a, b) => numberOf(b) - numberOf(a) || b._createdAt.localeCompare(a._createdAt)), [scoped, kpi, today]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)), current = Math.min(page, pages - 1), shown = filtered.slice(current * size, (current + 1) * size);
  const filterCount = [kpi, project, kind, letter, q.trim()].filter(Boolean).length;
  const reset = () => { setKpi(''); setProject(''); setKind(''); setLetter(''); setQ(''); setPage(0); };
  const choose = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(0); };

  if (!canRecord(RESOURCE)) return <div className="page"><EmptyState title="You do not have rights to open this page" description="Your permission profile does not include punch lists."/></div>;
  const creatable = canRecord(RESOURCE, 'insert'), exportable = canRecord(RESOURCE, 'export'), printable = canRecord(RESOURCE, 'print');
  const exportUrl = (format: string) => apiUrl(`/export/${RESOURCE}?format=${format}&ids=${filtered.map(row => row.id).join(',') || '__none__'}`);
  const projects = activeRows(rows, 'projects');

  return <div className="page records-page punch-page" style={{ '--pilot-color': pilot?.pilot.color } as React.CSSProperties}>
    <div className="page-heading"><div><div className="eyebrow">WELDING · RELEASES</div><h1>{def.title}<span className="heading-count">{items.length}</span></h1><p>Pre-punch and punch items of the isometrics and projects, from the report to the sign-off and the approval.</p></div>
      <div className="heading-actions">
        {printable && <button className="btn" onClick={() => window.print()}><Printer size={16}/>Print</button>}
        {exportable && <Dropdown label="Export punch items" trigger={<span className="btn"><Download size={16}/>Export</span>}><a href={exportUrl('csv')}>CSV file</a><a href={exportUrl('xlsx')}>Excel file</a></Dropdown>}
        {creatable && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add item</button>}
      </div></div>
    <section className="punch-kpis" aria-label="Punch key figures. Choose a card to filter the table.">
      {cards.map(card => <button key={card.key} type="button" className={`panel punch-kpi ${kpi === card.key ? 'on' : ''} ${card.key === 'overdue' && card.count ? 'alert' : ''}`} aria-pressed={kpi === card.key} onClick={() => { setKpi(kpi === card.key ? '' : card.key); setPage(0); }}>
        <small>{card.label}</small><strong>{card.count}</strong></button>)}
    </section>
    <div className="table-card">
      <div className="table-toolbar punch-toolbar"><SearchInput value={q} onChange={choose(setQ)} placeholder="Search punch items…"/>
        <div className="punch-filters">
          <div className="field"><label htmlFor="punch-project">Project</label><select id="punch-project" value={project} onChange={event => choose(setProject)(event.target.value)}><option value="">All projects</option>{projects.map(item => <option key={item.id} value={item.id}>{label('projects', item.id)}</option>)}</select></div>
          <div className="field"><label htmlFor="punch-kind">Punch type</label><select id="punch-kind" value={kind} onChange={event => choose(setKind)(event.target.value)}><option value="">All</option>{PUNCH_TYPES.map(value => <option key={value}>{value}</option>)}</select></div>
          <div className="field"><label htmlFor="punch-letter">Type</label><select id="punch-letter" value={letter} onChange={event => choose(setLetter)(event.target.value)}><option value="">All</option>{PUNCH_LETTERS.map(value => <option key={value} value={value}>{punchCategoryLabel(value)}</option>)}</select></div>
          {filterCount > 0 && <button type="button" className="text-link" onClick={reset}>Clear filters ({filterCount})</button>}
        </div></div>
      <TableScroll><table className="data-table punch-table"><caption className="sr-only">Punch items</caption>
        <thead><tr>{['#', 'Project', 'Isometric', 'Type', 'Description', 'Due date', 'Contractor', 'Punch', 'Document', 'Status'].map(heading => <th key={heading} scope="col">{heading}</th>)}<th scope="col" className="actions-cell"><span className="sr-only">Options</span></th></tr></thead>
        <tbody>{shown.map(row => {
          const status = punchStatus(row), files = filesOf(rows, row), signOff = files.find(file => file.documentType === PUNCH_SIGN_OFF_DOCUMENT), photos = files.filter(file => file.documentType !== PUNCH_SIGN_OFF_DOCUMENT);
          const editable = canRecord(RESOURCE, 'edit', row) && status !== 'Passed';
          const may = (transition: PunchTransition) => canTransition(row, transition) && canRun(`punch-${transition}`, { punchId: row.id });
          const name = text(row.name) || text(row.description).slice(0, 40) || 'punch item';
          return <tr key={row.id}>
            <td className="tabular">{text(row.number) || '—'}</td><td>{projectOf(row, rows) ? label('projects', projectOf(row, rows)) : '—'}</td>
            <td>{row.isoId ? label('isometrics', row.isoId) : <span className="muted">Project related</span>}</td>
            <td><span className="punch-letter" title={punchCategoryLabel(punchCategory(row.category))}>{punchCategory(row.category)}</span></td>
            <td className="description-cell" title={text(row.description)}>{text(row.description) || '—'}</td>
            <td className="tabular">{formatDate(row.dueDate)}</td><td>{contractorName(row) || '—'}</td><td>{punchKind(row)}</td>
            <td className="punch-documents">{photos.length || signOff ? <>{photos.map(file => <a key={file.id} className="text-link" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer" title={text(file.name)}><FileText size={13} aria-hidden="true"/>{text(file.documentType) === 'Punch photo' ? 'Photo' : 'Document'}<span className="sr-only">: {text(file.name)}</span></a>)}{signOff && <a className="text-link" href={apiUrl(`/files/${signOff.id}`)} target="_blank" rel="noreferrer" title={text(signOff.name)}><ShieldCheck size={13} aria-hidden="true"/>Sign-off</a>}</> : <span className="muted">—</span>}</td>
            <td><Badge color={STATUS_COLOR[status]}>{status}</Badge>{isOverdue(row, today) && <> <Badge color="red">Overdue</Badge></>}</td>
            <td className="actions-cell">{status === 'Passed' && <Lock size={14} className="punch-lock" aria-label="Passed, locked"/>}
              <Dropdown className="row-menu" label={`Options for ${name}`} trigger={<span className="icon-btn"><MoreHorizontal size={18}/></span>}>
                {editable && <button onClick={() => setEditor(row)}><Pencil size={14}/>Edit</button>}
                <button onClick={() => setDialog({ kind: 'history', row })}><History size={14}/>History</button>
                {may('finish') && <button onClick={() => setDialog({ kind: 'finish', row })}><PenLine size={14}/>Mark as finished</button>}
                {may('pass') && <button onClick={() => setDialog({ kind: 'pass', row })}><ShieldCheck size={14}/>Report passed</button>}
                {may('remove') && <button onClick={() => setDialog({ kind: 'remove', row })}><Trash2 size={14}/>Mark as removed</button>}
              </Dropdown></td></tr>;
        })}</tbody></table></TableScroll>
      {!filtered.length && <EmptyState title={filterCount ? 'No punch items match your filters' : 'No punch items yet'} description={filterCount ? 'Try another search or clear your filters.' : creatable ? 'Add the first pre-punch or punch item to start the list.' : 'Punch items added by your team will appear here.'} action={filterCount ? <button className="btn" onClick={reset}>Clear filters</button> : creatable ? <button className="btn primary" onClick={() => setEditor('new')}><Plus size={16}/>Add item</button> : undefined}/>}
      <div className="table-footer"><span role="status" aria-live="polite">{filtered.length ? `${current * size + 1}–${Math.min((current + 1) * size, filtered.length)}` : '0'} of {filtered.length} items</span><div><span>Rows per page</span><select aria-label="Rows per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{[20, 50, 100].map(n => <option key={n}>{n}</option>)}</select>
        <button className="icon-btn" disabled={current === 0} aria-label="Previous page" onClick={() => setPage(current - 1)}><ChevronLeft size={16}/></button><button className="icon-btn" disabled={current >= pages - 1} aria-label="Next page" onClick={() => setPage(current + 1)}><ChevronRight size={16}/></button></div></div>
    </div>
    {editor && <PunchEditor record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
    {dialog?.kind === 'finish' && <FinishDialog item={dialog.row} onClose={() => setDialog(null)} onDone={() => notify('Punch item marked as finished.')}/>}
    {dialog?.kind === 'pass' && <ConfirmDialog item={dialog.row} transition="pass" onClose={() => setDialog(null)} onDone={() => notify('Punch item reported as passed.')}/>}
    {dialog?.kind === 'remove' && <ConfirmDialog item={dialog.row} transition="remove" onClose={() => setDialog(null)} onDone={() => notify('Punch item marked as removed.')}/>}
    {dialog?.kind === 'history' && <Modal title="History" subtitle={text(dialog.row.name) || text(dialog.row.description).slice(0, 80)} onClose={() => setDialog(null)}><div className="modal-body"><RecordHistory resource={RESOURCE} id={dialog.row.id}/></div><div className="modal-footer"><button className="btn" onClick={() => setDialog(null)}>Close</button></div></Modal>}
  </div>;
}

// ----- add / edit ------------------------------------------------------------------------------------------

const FORM_FIELDS = ['punchType', 'category', 'projectId', 'isoId', 'name', 'description', 'dueDate', 'contractorId', 'reportedDate', 'reportedBy'];
const fileKind = (file: File) => file.type.startsWith('image/') ? PUNCH_FILE_TYPES[0] : PUNCH_FILE_TYPES[1];

function PunchEditor({ record, onClose }: { record?: Row; onClose: () => void }) {
  const { rows, user, refresh, notify } = useWorkspace(); const id = useId();
  const def = RESOURCE_MAP[RESOURCE];
  const fields = FORM_FIELDS.map(name => def.fields.find(field => field.name === name)).filter((field): field is NonNullable<typeof field> => Boolean(field));
  const existing = record ? filesOf(rows, record).filter(file => file.documentType !== PUNCH_SIGN_OFF_DOCUMENT) : [];
  const room = Math.max(0, PUNCH_FILE_LIMIT - existing.length);
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(fields.map(field => [field.name, record?.[field.name] ?? (field.name === 'reportedDate' ? punchToday() : field.name === 'reportedBy' ? user.name : field.default ?? '')])));
  const [files, setFiles] = useState<(File | null)[]>(() => Array(room).fill(null));
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [savedId, setSavedId] = useState('');
  const change = (name: string, value: unknown) => setValues(old => {
    const next = { ...old, [name]: value };
    const projectIso = (isoId: unknown) => text(rows.isometrics?.find(iso => iso.id === isoId)?.projectId);
    if (name === 'isoId' && value) next.projectId = projectIso(value);
    if (name === 'projectId' && next.isoId && projectIso(next.isoId) !== value) next.isoId = '';
    return next;
  });
  const chooseFile = (index: number, file: File | null) => {
    if (file && file.size > 20 * 1024 * 1024) { setProblems(old => ({ ...old, [`file${index}`]: 'A file can be at most 20 MB.' })); return; }
    if (file && !/\.(pdf|png|jpe?g|webp|csv|xlsx|docx|txt)$/i.test(file.name)) { setProblems(old => ({ ...old, [`file${index}`]: 'Choose a PDF, image, CSV, Excel, Word, or text file.' })); return; }
    setProblems(old => ({ ...old, [`file${index}`]: '' })); setFiles(old => old.map((item, i) => i === index ? file : item));
  };

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const iso = rows.isometrics?.find(item => item.id === values.isoId);
    const found: Record<string, string> = punchInputErrors(values, undefined, iso);
    if (!text(values.description)) found.description = 'Description is required.';
    delete found.status;
    if (Object.keys(found).length) { setProblems(found); setError('Please check the highlighted fields.'); return; }
    setBusy(true); setProblems({});
    let target = savedId || record?.id || '';
    try {
      if (!savedId) {
        const payload = record ? Object.fromEntries(Object.entries(values).filter(([name, value]) => text(value) !== text(record[name]))) : values;
        if (record && !Object.keys(payload).length && !files.some(Boolean)) { onClose(); return; }
        if (!record || Object.keys(payload).length) {
          const saved = await api<{ record: Row }>(`/records/${RESOURCE}${record ? `/${record.id}` : ''}`, { method: record ? 'PUT' : 'POST', body: JSON.stringify({ ...payload, ...(record ? { _version: record._version } : {}) }) });
          target = saved.record.id; setSavedId(target);
        }
      }
      for (const [index, file] of files.entries()) {
        if (!file) continue;
        const body = new FormData(); body.set('entityType', RESOURCE); body.set('entityId', target); body.set('documentType', fileKind(file)); body.set('file', file);
        try { await api('/files', { method: 'POST', body }); setFiles(old => old.map((item, i) => i === index ? null : item)); }
        catch (failure) { await refresh(); setProblems({ [`file${index}`]: (failure as Error).message }); setError('The punch item was saved, but a file could not be attached. Choose the file again or close this window.'); return; }
      }
      await refresh(); notify(`Punch item ${record ? 'updated' : 'added'}.`); onClose();
    } catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const isoField = fields.find(field => field.name === 'isoId');
  return <Modal title={`${record ? 'Edit' : 'Add'} punch item`} subtitle="Pre-punch and punch items belong to an isometric, or to the whole project." onClose={onClose} wide>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="form-grid">{fields.map(field => <FieldInput key={field.name} field={field.name === 'isoId' && isoField ? { ...isoField, legacy: { '': 'Project related' } } : field} value={values[field.name]} values={values} error={problems[field.name]} onChange={value => change(field.name, value)}/>)}</div>
      <fieldset className="punch-files"><legend>Photos and documents <small>up to {PUNCH_FILE_LIMIT}</small></legend>
        {existing.length > 0 && <ul>{existing.map(file => <li key={file.id}><FileText size={14} aria-hidden="true"/><a className="text-link" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer">{text(file.name)}</a></li>)}</ul>}
        {room === 0 ? <p className="muted">This item already holds {PUNCH_FILE_LIMIT} files.</p> : files.map((file, index) => <div className="field" key={index}><label htmlFor={`${id}-file-${index}`}>Photo or document {existing.length + index + 1}</label>
          <input id={`${id}-file-${index}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.docx,.txt,image/*" aria-invalid={Boolean(problems[`file${index}`])} onChange={event => chooseFile(index, event.target.files?.[0] || null)}/>
          {file && <small className="field-hint">{file.name}</small>}{problems[`file${index}`] && <small className="field-error">{problems[`file${index}`]}</small>}</div>)}
      </fieldset>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{record ? 'Save changes' : 'Add item'}</button></div></form>
  </Modal>;
}

// ----- transitions -----------------------------------------------------------------------------------------

function ItemSummary({ item }: { item: Row }) {
  const { rows, label } = useWorkspace();
  return <p className="punch-summary"><strong>{text(item.number) ? `#${text(item.number)} · ` : ''}{item.isoId ? label('isometrics', item.isoId) : projectOf(item, rows) ? `${label('projects', projectOf(item, rows))} (project related)` : 'Project related'}</strong><br/>{text(item.description)}</p>;
}

/** Report passed and Mark as removed: a confirmation with a date and remarks or reason. */
function ConfirmDialog({ item, transition, onClose, onDone }: { item: Row; transition: 'pass' | 'remove'; onClose: () => void; onDone: () => void }) {
  const { refresh } = useWorkspace(); const pass = transition === 'pass';
  const [date, setDate] = useState(punchToday()), [note, setNote] = useState(''), [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setProblems({});
    try { await post(`/actions/punch-${transition}`, { punchId: item.id, date, note }); await refresh(); onDone(); onClose(); }
    catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return <Modal title={pass ? 'Report passed' : 'Mark as removed'} subtitle={pass ? 'The finished item was inspected and approved. A passed item cannot be changed any more.' : 'The item leaves the open list and stays in the records as removed. This cannot be undone.'} onClose={onClose}>
    <form onSubmit={event => void submit(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <ItemSummary item={item}/>
      <div className="field"><label htmlFor="punch-confirm-date">{pass ? 'Passed on' : 'Removed on'}<span className="required"> *</span></label><input id="punch-confirm-date" type="date" required value={date} onChange={event => setDate(event.target.value)} aria-invalid={Boolean(problems.date)}/>{problems.date && <small className="field-error">{problems.date}</small>}</div>
      <div className="field"><label htmlFor="punch-confirm-note">{pass ? 'Remarks' : 'Reason'}</label><textarea id="punch-confirm-note" rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)}/></div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className={`btn ${pass ? 'primary' : 'danger'}`} disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{pass ? 'Report passed' : 'Mark as removed'}</button></div></form>
  </Modal>;
}

/** Mark as finished: who signs, and the sign-off drawn on screen or as a signed PDF, sent together in one request. */
function FinishDialog({ item, onClose, onDone }: { item: Row; onClose: () => void; onDone: () => void }) {
  const { refresh, user } = useWorkspace(); const id = useId();
  const [values, setValues] = useState<Record<string, string>>({ signerType: SIGNER_TYPES[0], clientName: '', company: '', function: '', inspector: '', date: punchToday(), note: '' });
  const [method, setMethod] = useState<'Drawn' | 'Uploaded PDF'>('Drawn'), [read, setRead] = useState<(() => Promise<Blob>) | null>(null), [pdf, setPdf] = useState<File | null>(null);
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const set = (name: string, value: string) => { setValues(old => ({ ...old, [name]: value })); setProblems(old => ({ ...old, [name]: '' })); };
  const client = values.signerType === 'Client';
  const text_ = (name: string, label: string, extra: { required?: boolean; max?: number } = {}) => <div className="field"><label htmlFor={`${id}-${name}`}>{label}{extra.required && <span className="required"> *</span>}</label><input id={`${id}-${name}`} value={values[name]} maxLength={extra.max ?? 200} aria-invalid={Boolean(problems[name])} aria-describedby={problems[name] ? `${id}-${name}-error` : undefined} onChange={event => set(name, event.target.value)}/>{problems[name] && <small id={`${id}-${name}-error`} className="field-error">{problems[name]}</small>}</div>;
  function choosePdf(file: File | null) {
    setProblems(old => ({ ...old, signMethod: '' }));
    if (file && (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf'))) { setPdf(null); setProblems(old => ({ ...old, signMethod: 'Choose a PDF file.' })); return; }
    if (file && file.size > 10 * 1024 * 1024) { setPdf(null); setProblems(old => ({ ...old, signMethod: 'The signed PDF can be at most 10 MB.' })); return; }
    setPdf(file);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const signed = method === 'Drawn' ? Boolean(read) : Boolean(pdf);
    const found = punchFinishErrors({ ...values, signMethod: method }, signed);
    if (Object.keys(found).length) { setProblems(found); setError('Please check the sign-off.'); return; }
    setBusy(true); setProblems({});
    try {
      const body = new FormData();
      for (const name of ['signerType', 'date', 'function', 'note']) body.set(name, values[name]);
      if (client) { body.set('clientName', values.clientName); body.set('company', values.company); } else body.set('inspector', values.inspector);
      body.set('signMethod', method);
      if (method === 'Drawn') body.set('file', await read!(), 'punch-signature.png'); else body.set('file', pdf!, pdf!.name);
      await api(`/punch/${item.id}/finish`, { method: 'POST', body }); await refresh(); onDone(); onClose();
    } catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return <Modal title="Mark as finished" subtitle="Sign off the finished work: the client or your own inspector signs on screen, or you attach the signed PDF." onClose={onClose} wide>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <ItemSummary item={item}/>
      <div className="form-grid">
        <div className="field"><label htmlFor={`${id}-signerType`}>Signed by<span className="required"> *</span></label><div className="select-wrap"><select id={`${id}-signerType`} value={values.signerType} onChange={event => set('signerType', event.target.value)}>{SIGNER_TYPES.map(type => <option key={type}>{type}</option>)}</select></div></div>
        <div className="field"><label htmlFor={`${id}-date`}>Date<span className="required"> *</span></label><input id={`${id}-date`} type="date" value={values.date} aria-invalid={Boolean(problems.date)} onChange={event => set('date', event.target.value)}/>{problems.date && <small className="field-error">{problems.date}</small>}</div>
        {client ? <>{text_('clientName', 'Client name', { required: true })}{text_('company', 'Company', { required: true })}</> : text_('inspector', 'Inspector', { required: true })}
        {text_('function', 'Function')}
        <div className="field full-width"><label htmlFor={`${id}-note`}>Remarks</label><textarea id={`${id}-note`} rows={3} maxLength={2000} value={values.note} onChange={event => set('note', event.target.value)}/></div>
      </div>
      <div className="punch-sign"><div className="table-tabs" role="group" aria-label="How the sign-off is given">
        <button type="button" className={method === 'Drawn' ? 'selected' : ''} aria-pressed={method === 'Drawn'} onClick={() => { setMethod('Drawn'); setProblems(old => ({ ...old, signMethod: '' })); }}><PenLine size={14}/>Sign on screen</button>
        <button type="button" className={method === 'Uploaded PDF' ? 'selected' : ''} aria-pressed={method === 'Uploaded PDF'} onClick={() => { setMethod('Uploaded PDF'); setProblems(old => ({ ...old, signMethod: '' })); }}><Upload size={14}/>Upload signed PDF</button></div>
        {method === 'Drawn' ? <SignaturePad label={`Signature of ${client ? values.clientName || 'the client' : values.inspector || user.name}`} disabled={busy} onChange={next => setRead(() => next)}/>
          : <div className="field"><label htmlFor={`${id}-pdf`}>Signed PDF (up to 10 MB)</label><input id={`${id}-pdf`} type="file" accept="application/pdf,.pdf" aria-invalid={Boolean(problems.signMethod)} onChange={event => choosePdf(event.target.files?.[0] || null)}/>{pdf && <small className="field-hint">{pdf.name}</small>}</div>}
        {problems.signMethod && <small className="field-error" role="alert">{problems.signMethod}</small>}
      </div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Mark as finished</button></div></form>
  </Modal>;
}

// ----- isometric header ------------------------------------------------------------------------------------

/**
 * Punch part of an isometric's status card: open and finished pre-punch and punch counts, the overdue count, a note
 * while blocking items remain and the punch progress (0 / 25 / 50 / 75 / 100 %) stored on the isometric.
 */
export function PunchStatus({ iso, items }: { iso: Row; items: Row[] | null }) {
  const { canRecord, refresh, notify } = useWorkspace(); const id = useId();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!items) return null;
  const counts = punchCounts(items.filter(row => row.isoId === iso.id && !row._archived));
  const editable = canRecord('isometrics', 'edit', iso);
  async function save(value: string) {
    setBusy(true); setError('');
    try { await api(`/records/isometrics/${iso.id}`, { method: 'PUT', body: JSON.stringify({ punchProgress: value, _version: iso._version }) }); await refresh(); notify('Punch progress saved.'); }
    catch (failure) { setError((failure as Error).message || 'Saving failed.'); } finally { setBusy(false); }
  }
  return <div className="iso-punch" role="group" aria-label="Punch">
    <dl className="iso-facts">
      <div><dt>Pre-punch</dt><dd>{counts.prePunchOpen} open · {counts.prePunchFinished} finished</dd></div>
      <div><dt>Punch</dt><dd>{counts.punchOpen} open · {counts.punchFinished} finished</dd></div>
      <div><dt>Overdue</dt><dd className={counts.overdue ? 'iso-overdue' : ''}>{counts.overdue}</dd></div>
    </dl>
    {counts.blocking > 0 && <p className="iso-hint" role="status"><AlertCircle size={14} aria-hidden="true"/> {counts.blocking} open item{counts.blocking === 1 ? '' : 's'} in category A or B must be finished and approved before release.</p>}
    <div className="field iso-punch-progress"><label htmlFor={`${id}-progress`}>Punch progress</label>
      <select id={`${id}-progress`} value={text(iso.punchProgress)} disabled={!editable || busy} onChange={event => void save(event.target.value)}><option value="">Not entered</option>{PUNCH_PROGRESS_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></div>
    {error && <div className="alert error" role="alert"><AlertCircle size={16}/><span>{error}</span></div>}
  </div>;
}
