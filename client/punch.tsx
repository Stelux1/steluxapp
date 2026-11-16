import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowUp, Check, ChevronLeft, ChevronRight, Download, FileText, History, Loader2, Lock, MoreHorizontal, Pencil, PenLine, Plus, Printer, ShieldCheck, Trash2 } from 'lucide-react';
import { RESOURCE_MAP } from './catalog.ts';
import { api, apiUrl, post, ApiError, formatDate } from './api.ts';
import { Badge, Dropdown, EmptyState, FieldInput, Modal, SearchInput, TableScroll } from './components.tsx';
import { activeRows, useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { RecordHistory, TablePage, resourcePath } from './records.tsx';
import { SignaturePad } from './signatures.tsx';
import { PunchListPdfButton } from './pdf-documents.tsx';
import { SIGNATURE_KINDS } from '../shared/signatures.ts';
import {
  PUNCH_FILE_LIMIT, PUNCH_FORM_FIELDS, PUNCH_FILE_TYPES, PUNCH_LETTERS, PUNCH_MESSAGES, PUNCH_PROGRESS_OPTIONS, PUNCH_SIGN_OFF_DOCUMENT, PUNCH_TYPES, PUNCH_TYPE_LABELS, SIGNER_TYPES, canTransition, finishSummary,
  isOverdue, matchesPunchKpi, punchApproved, punchCategory, punchCategoryLabel, punchCounts, punchFinishErrors, punchFormDefaults, punchInputErrors, punchKind, punchKpis, punchStatus, punchToday, withPunchPhases,
  type PunchCounts, type PunchKpiKey, type PunchTransition,
} from '../shared/punch.ts';
import type { Field, Row } from '../shared/types.ts';

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

type Dialog = { kind: 'finish'; rows: Row[]; single: boolean } | { kind: 'remove' | 'approve' | 'history'; row: Row };

function PunchList() {
  const { rows, canRecord, canRun, label, notify, refresh } = useWorkspace(); const pilot = usePilot();
  const def = RESOURCE_MAP[RESOURCE];
  const [kpi, setKpi] = useState<PunchKpiKey | ''>(''), [project, setProject] = useState(''), [kind, setKind] = useState(''), [letter, setLetter] = useState(''), [q, setQ] = useState('');
  const [page, setPage] = useState(0), [size, setSize] = useState(20);
  const [editor, setEditor] = useState<Row | 'new' | null>(null), [dialog, setDialog] = useState<Dialog | null>(null);
  const [checked, setChecked] = useState<string[]>([]), [promoting, setPromoting] = useState(''), [actionError, setActionError] = useState('');
  const today = punchToday();
  // Passed is derived per isometric and phase over every item (shared/punch.ts), before any filter.
  const items = useMemo(() => withPunchPhases(activeRows(rows, RESOURCE)), [rows]);
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
  const may = (row: Row, transition: PunchTransition) => canTransition(row, transition) && canRun(`punch-${transition}`, { punchId: row.id });
  // Checked rows that can still be finished (a refresh may have finished or removed some).
  const selection = checked.map(id => items.find(row => row.id === id)).filter((row): row is Row => Boolean(row) && may(row!, 'finish'));
  const toggle = (id: string, on: boolean) => setChecked(old => on ? [...new Set([...old, id])] : old.filter(item => item !== id));
  async function promote(row: Row) {
    setPromoting(row.id); setActionError('');
    try { await post('/actions/punch-promote', { punchId: row.id }); await refresh(); notify('Promoted to Punch.'); }
    catch (failure) { setActionError((failure as Error).message); } finally { setPromoting(''); }
  }

  if (!canRecord(RESOURCE)) return <div className="page"><EmptyState title="You do not have rights to open this page" description="Your permission profile does not include punch lists."/></div>;
  const creatable = canRecord(RESOURCE, 'insert'), exportable = canRecord(RESOURCE, 'export'), printable = canRecord(RESOURCE, 'print');
  const exportUrl = (format: string) => apiUrl(`/export/${RESOURCE}?format=${format}&ids=${filtered.map(row => row.id).join(',') || '__none__'}`);
  const projects = activeRows(rows, 'projects');

  return <div className="page records-page punch-page" style={{ '--pilot-color': pilot?.pilot.color } as React.CSSProperties}>
    <div className="page-heading"><div><div className="eyebrow">WELDING · RELEASES</div><h1>{def.title}<span className="heading-count">{items.length}</span></h1><p>Pre-punch and punch items of the isometrics and projects, from the report to the sign-off and the client approval.</p></div>
      <div className="heading-actions">
        {printable && <button className="btn" onClick={() => window.print()}><Printer size={16}/>Print</button>}
        <PunchListPdfButton filters={{ projectId: project, punchType: kind, category: letter, kpi, q }}/>
        {selection.length > 0 && <button className="btn" onClick={() => setDialog({ kind: 'finish', rows: selection, single: false })}><Check size={16}/>Mark as finished (Sign-off)</button>}
        {exportable && <Dropdown label="Export punch items" trigger={<span className="btn"><Download size={16}/>Export</span>}><a href={exportUrl('csv')}>CSV file</a><a href={exportUrl('xlsx')}>Excel file</a></Dropdown>}
        {creatable && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add item</button>}
      </div></div>
    <section className="punch-kpis" aria-label="Punch key figures. Choose a card to filter the table.">
      {cards.map(card => <button key={card.key} type="button" className={`panel punch-kpi ${kpi === card.key ? 'on' : ''} ${card.key === 'overdue' && card.count ? 'alert' : ''}`} aria-pressed={kpi === card.key} onClick={() => { setKpi(kpi === card.key ? '' : card.key); setPage(0); }}>
        <small>{card.label}</small><strong>{card.count}</strong></button>)}
    </section>
    {actionError && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{actionError}</span></div>}
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
          const open = status === 'Open', editable = open && canRecord(RESOURCE, 'edit', row);
          const name = text(row.name) || text(row.description).slice(0, 40) || 'punch item';
          return <tr key={row.id}>
            <td className="tabular">{text(row.number) || '—'}</td><td>{projectOf(row, rows) ? label('projects', projectOf(row, rows)) : '—'}</td>
            <td>{row.isoId ? label('isometrics', row.isoId) : <span className="muted">Project related</span>}</td>
            <td><span className="punch-letter" title={punchCategoryLabel(punchCategory(row.category))}>{punchCategory(row.category)}</span></td>
            <td className="description-cell" title={text(row.description)}>{text(row.description) || '—'}</td>
            <td className="tabular">{formatDate(row.dueDate)}</td><td>{contractorName(row) || '—'}</td><td>{punchKind(row)}</td>
            <td className="punch-documents">{photos.length || signOff ? <>{photos.map(file => <a key={file.id} className="text-link" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer" title={text(file.name)}><FileText size={13} aria-hidden="true"/>{text(file.documentType) === 'Punch photo' ? 'Photo' : 'Document'}<span className="sr-only">: {text(file.name)}</span></a>)}{signOff && <a className="text-link" href={apiUrl(`/files/${signOff.id}`)} target="_blank" rel="noreferrer" title={text(signOff.name)}><ShieldCheck size={13} aria-hidden="true"/>Sign-off</a>}</> : <span className="muted">—</span>}</td>
            <td><Badge color={STATUS_COLOR[status]}>{status}</Badge>{isOverdue(row, today) && <> <Badge color="red">Overdue</Badge></>}{status !== 'Passed' && punchApproved(row) && <> <Badge color="green">Client approved</Badge></>}</td>
            <td className="actions-cell"><div className="punch-options">{status === 'Passed' && <Lock size={14} className="punch-lock" aria-label="Passed, locked"/>}
              {/* Open rows: Promote to Punch, Mark as finished, Remove, Edit, Activity log and the checkbox (reference row options). */}
              <Dropdown className="row-menu" label={`Options for ${name}`} trigger={<span className="icon-btn"><MoreHorizontal size={18}/></span>}>
                {may(row, 'promote') && <button disabled={promoting === row.id} onClick={() => void promote(row)}><ArrowUp size={14}/>Promote to Punch</button>}
                {may(row, 'finish') && <button onClick={() => setDialog({ kind: 'finish', rows: [row], single: true })}><PenLine size={14}/>Mark as finished</button>}
                {open && may(row, 'remove') && <button onClick={() => setDialog({ kind: 'remove', row })}><Trash2 size={14}/>Remove</button>}
                {editable && <button onClick={() => setEditor(row)}><Pencil size={14}/>Edit</button>}
                {!open && may(row, 'approve') && <button onClick={() => setDialog({ kind: 'approve', row })}><ShieldCheck size={14}/>Mark as Client approved</button>}
                <button onClick={() => setDialog({ kind: 'history', row })}><History size={14}/>Activity log</button>
              </Dropdown>
              {may(row, 'finish') && <input type="checkbox" className="punch-check" aria-label={`Select ${name} for the sign-off`} checked={checked.includes(row.id)} onChange={event => toggle(row.id, event.target.checked)}/>}
            </div></td></tr>;
        })}</tbody></table></TableScroll>
      {!filtered.length && <EmptyState title={filterCount ? 'No punch items match your filters' : 'No punch items yet'} description={filterCount ? 'Try another search or clear your filters.' : creatable ? 'Add the first pre-punch or punch item to start the list.' : 'Punch items added by your team will appear here.'} action={filterCount ? <button className="btn" onClick={reset}>Clear filters</button> : creatable ? <button className="btn primary" onClick={() => setEditor('new')}><Plus size={16}/>Add item</button> : undefined}/>}
      <div className="table-footer"><span role="status" aria-live="polite">{filtered.length ? `${current * size + 1}–${Math.min((current + 1) * size, filtered.length)}` : '0'} of {filtered.length} items{selection.length ? ` · ${selection.length} selected` : ''}</span><div><span>Rows per page</span><select aria-label="Rows per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{[20, 50, 100].map(n => <option key={n}>{n}</option>)}</select>
        <button className="icon-btn" disabled={current === 0} aria-label="Previous page" onClick={() => setPage(current - 1)}><ChevronLeft size={16}/></button><button className="icon-btn" disabled={current >= pages - 1} aria-label="Next page" onClick={() => setPage(current + 1)}><ChevronRight size={16}/></button></div></div>
    </div>
    {editor && <PunchEditor record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onApprove={row => { setEditor(null); setDialog({ kind: 'approve', row }); }}/>}
    {dialog?.kind === 'finish' && <FinishDialog items={dialog.rows} single={dialog.single} onClose={() => setDialog(null)} onDone={count => { setChecked([]); notify(count === 1 ? 'Punch item marked as finished.' : `${count} punch items marked as finished.`); }}/>}
    {dialog?.kind === 'remove' && <ConfirmDialog item={dialog.row} transition="remove" onClose={() => setDialog(null)} onDone={() => notify('Punch item removed.')}/>}
    {dialog?.kind === 'approve' && <ConfirmDialog item={dialog.row} transition="approve" onClose={() => setDialog(null)} onDone={() => notify('Punch item marked as client approved.')}/>}
    {dialog?.kind === 'history' && <Modal title="Activity log" subtitle={text(dialog.row.name) || text(dialog.row.description).slice(0, 80)} onClose={() => setDialog(null)}><div className="modal-body"><RecordHistory resource={RESOURCE} id={dialog.row.id}/></div><div className="modal-footer"><button className="btn" onClick={() => setDialog(null)}>Cancel</button></div></Modal>}
  </div>;
}

// ----- add / edit ------------------------------------------------------------------------------------------

const fileKind = (file: File) => file.type.startsWith('image/') ? PUNCH_FILE_TYPES[0] : PUNCH_FILE_TYPES[1];

function PunchEditor({ record, initial, onClose, onApprove }: { record?: Row; initial?: Record<string, unknown>; onClose: () => void; onApprove: (row: Row) => void }) {
  const { rows, refresh, notify, label, canRun } = useWorkspace(); const id = useId();
  const def = RESOURCE_MAP[RESOURCE];
  const field = (name: string) => def.fields.find(item => item.name === name);
  const names = PUNCH_FORM_FIELDS.filter(name => name !== 'files');
  const existing = record ? filesOf(rows, record).filter(file => file.documentType !== PUNCH_SIGN_OFF_DOCUMENT) : [];
  const room = Math.max(0, PUNCH_FILE_LIMIT - existing.length);
  const companies = activeRows(rows, 'companies'), projects = activeRows(rows, 'projects');
  const [values, setValues] = useState<Record<string, unknown>>(() => { const defaults = { ...punchFormDefaults(companies), projectId: projects.length === 1 ? projects[0].id : '', ...initial }; return record ? Object.fromEntries(names.map(name => [name, record[name] ?? (name === 'punchType' ? punchKind(record) : '')])) : defaults; });
  const [files, setFiles] = useState<(File | null)[]>(() => Array(room).fill(null));
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [savedId, setSavedId] = useState('');
  const change = (name: string, value: unknown) => { setProblems(old => ({ ...old, [name]: '' })); setValues(old => {
    const next = { ...old, [name]: value };
    const projectIso = (isoId: unknown) => text(rows.isometrics?.find(iso => iso.id === isoId)?.projectId);
    if (name === 'isoId' && value) next.projectId = projectIso(value);
    if (name === 'projectId' && next.isoId && projectIso(next.isoId) !== value) next.isoId = '';
    return next;
  }); };
  const chooseFile = (index: number, file: File | null) => {
    if (file && file.size > 20 * 1024 * 1024) { setProblems(old => ({ ...old, [`file${index}`]: 'A file can be at most 20 MB.' })); return; }
    if (file && !/\.(pdf|png|jpe?g|webp|csv|xlsx|docx|txt)$/i.test(file.name)) { setProblems(old => ({ ...old, [`file${index}`]: 'Choose a PDF, image, CSV, Excel, Word, or text file.' })); return; }
    setProblems(old => ({ ...old, [`file${index}`]: '' })); setFiles(old => old.map((item, i) => i === index ? file : item));
  };

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const iso = rows.isometrics?.find(item => item.id === values.isoId);
    const found: Record<string, string> = punchInputErrors(values, undefined, iso);
    if (!text(values.description)) found.description = PUNCH_MESSAGES.description;
    if (!(PUNCH_TYPES as readonly string[]).includes(text(values.punchType))) found.punchType = PUNCH_MESSAGES.kind;
    delete found.status;
    if (Object.keys(found).length) { setProblems(found); setError(Object.values(found)[0]); return; }
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
      await refresh(); notify(record ? 'Punch item updated.' : 'Saved.'); onClose();
    } catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const input = (name: string, patch: Partial<Field> = {}) => { const base = field(name); return base ? <FieldInput key={name} field={{ ...base, hidden: false, ...patch }} value={values[name]} values={values} error={problems[name]} onChange={value => change(name, value)}/> : null; };
  const approvable = record && canTransition(record, 'approve') && canRun('punch-approve', { punchId: record.id });
  return <Modal title={record ? 'Edit punchlist item' : 'Add item'} subtitle="Pre-punch and punch items belong to an isometric, or to the whole project." onClose={onClose} wide>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="form-grid">
        {/* A plain select: the shared field renames "Project" to "Subproject" in the project-scoped workspace; the reference says Project. */}
        <div className="field"><label htmlFor={`${id}-project`}>Project<span className="required"> *</span></label><div className="select-wrap"><select id={`${id}-project`} value={text(values.projectId)} aria-invalid={Boolean(problems.projectId)} aria-describedby={problems.projectId ? `${id}-project-error` : undefined} onChange={event => change('projectId', event.target.value)}><option value="">Select project</option>{projects.map(item => <option key={item.id} value={item.id}>{label('projects', item.id)}</option>)}</select></div>{problems.projectId && <small id={`${id}-project-error`} className="field-error">{problems.projectId}</small>}</div>
        {input('isoId', { legacy: { '': '- Project related, not iso' }, hint: undefined })}
        {input('category', { label: 'Type', blank: undefined })}
      </div>
      <fieldset className="punch-files"><legend>File <small>up to {PUNCH_FILE_LIMIT}</small></legend>
        {existing.length > 0 && <ul>{existing.map(file => <li key={file.id}><FileText size={14} aria-hidden="true"/><a className="text-link" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer">{text(file.name)}</a></li>)}</ul>}
        {room === 0 ? <p className="muted">This item already holds {PUNCH_FILE_LIMIT} files.</p> : files.map((file, index) => <div className="field" key={index}><label htmlFor={`${id}-file-${index}`}>{index === 0 && !existing.length ? 'Take photo or choose file' : 'Choose file'}</label>
          <input id={`${id}-file-${index}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.docx,.txt,image/*" aria-invalid={Boolean(problems[`file${index}`])} onChange={event => chooseFile(index, event.target.files?.[0] || null)}/>
          {file && <small className="field-hint">{file.name}</small>}{problems[`file${index}`] && <small className="field-error">{problems[`file${index}`]}</small>}</div>)}
      </fieldset>
      <div className="form-grid">
        {input('description', { label: 'Description', required: false })}
        {input('dueDate')}{input('contractorId', { blank: undefined })}{input('reportedDate')}
        {input('reportedById', { blank: '—' })}
        <fieldset className="field radio-field" aria-describedby={problems.punchType ? `${id}-kind-error` : undefined}><legend>Pre-Punch / Punch</legend><div className="punch-radios">
          {PUNCH_TYPES.map(type => <label key={type} className="radio-option"><input type="radio" name={`${id}-kind`} value={type} checked={values.punchType === type} onChange={() => change('punchType', type)}/><span>{PUNCH_TYPE_LABELS[type]}</span></label>)}</div>
          {problems.punchType && <small id={`${id}-kind-error`} className="field-error">{problems.punchType}</small>}</fieldset>
      </div>
      {approvable && <p><button type="button" className="btn" onClick={() => onApprove(record!)} disabled={busy}><ShieldCheck size={15}/>Mark as Client approved</button></p>}
      {record && punchApproved(record) && <p><Badge color="green">Client approved</Badge></p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>{record ? 'Close' : 'Cancel'}</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{record ? 'Save' : 'Add'}</button></div></form>
  </Modal>;
}

// ----- actions ------------------------------------------------------------------------------------------------

function ItemSummary({ item }: { item: Row }) {
  const { rows, label } = useWorkspace();
  return <p className="punch-summary"><strong>{text(item.number) ? `#${text(item.number)} · ` : ''}{item.isoId ? label('isometrics', item.isoId) : projectOf(item, rows) ? `${label('projects', projectOf(item, rows))} (project related)` : 'Project related'}</strong><br/>{text(item.description)}</p>;
}

/** Remove (a plain confirmation, as the reference) and Mark as Client approved. */
function ConfirmDialog({ item, transition, onClose, onDone }: { item: Row; transition: 'remove' | 'approve'; onClose: () => void; onDone: () => void }) {
  const { refresh } = useWorkspace(); const remove = transition === 'remove';
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await post(`/actions/punch-${transition}`, { punchId: item.id }); await refresh(); onDone(); onClose(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={remove ? 'Remove punchlist' : PUNCH_MESSAGES.approveConfirm} onClose={onClose}>
    <form onSubmit={event => void submit(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <ItemSummary item={item}/>
      <p>{remove ? 'Are you sure?' : 'Record that the client approved this item. A finished and approved item reads Passed once every A and B item of its phase is finished and approved.'}</p>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className={`btn ${remove ? 'danger' : 'primary'}`} disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{remove ? 'Delete' : PUNCH_MESSAGES.approveConfirm}</button></div></form>
  </Modal>;
}

/**
 * Mark as finished (Sign-off), for one row or for the checked rows: signed by the client, the signed-in user (with the
 * saved signature from Signatures when there is one) or an inspector, drawn on screen or as a signed PDF, sent in one
 * request. The items become Finished and client approved.
 */
function FinishDialog({ items, single, onClose, onDone }: { items: Row[]; single: boolean; onClose: () => void; onDone: (count: number) => void }) {
  const { refresh, user, rows } = useWorkspace(); const id = useId();
  const [values, setValues] = useState<Record<string, string>>({ signerType: SIGNER_TYPES[0], clientName: '', company: '', function: '', inspectorId: '', date: punchToday(), note: '' });
  const [method, setMethod] = useState<'Drawn' | 'Uploaded PDF'>('Drawn'), [read, setRead] = useState<(() => Promise<Blob>) | null>(null), [pdf, setPdf] = useState<File | null>(null);
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const set = (name: string, value: string) => { setValues(old => ({ ...old, [name]: value })); setProblems(old => ({ ...old, [name]: '' })); };
  const type = values.signerType;
  const signature = activeRows(rows, 'signatures').find(row => row.userId === user.id && row.kind === SIGNATURE_KINDS[0].kind);
  const saved = Boolean(signature && activeRows(rows, 'attachments').some(file => file.entityType === 'signatures' && file.entityId === signature.id));
  const useSaved = type === 'User' && saved;
  const inspectors = activeRows(rows, 'welders').sort((a, b) => text(a.name).localeCompare(text(b.name)));
  const text_ = (name: string, label: string, required = false) => <div className="field"><label htmlFor={`${id}-${name}`}>{label}{required && <span className="required"> *</span>}</label><input id={`${id}-${name}`} value={values[name]} maxLength={200} aria-invalid={Boolean(problems[name])} aria-describedby={problems[name] ? `${id}-${name}-error` : undefined} onChange={event => set(name, event.target.value)}/>{problems[name] && <small id={`${id}-${name}-error`} className="field-error">{problems[name]}</small>}</div>;
  function choosePdf(file: File | null) {
    setProblems(old => ({ ...old, signMethod: '' }));
    if (file && (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf'))) { setPdf(null); setProblems(old => ({ ...old, signMethod: 'Choose a PDF file.' })); return; }
    if (file && file.size > 10 * 1024 * 1024) { setPdf(null); setProblems(old => ({ ...old, signMethod: 'The signed PDF can be at most 10 MB.' })); return; }
    setPdf(file);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const sign = useSaved ? 'Saved signature' : method;
    const found = punchFinishErrors({ ...values, signMethod: sign }, method === 'Drawn' ? Boolean(read) : Boolean(pdf), saved);
    if (Object.keys(found).length) { setProblems(found); setError(Object.values(found)[0]); return; }
    setBusy(true); setProblems({});
    try {
      const body = new FormData();
      for (const name of ['signerType', 'date', 'note']) body.set(name, values[name]);
      if (type === 'Client') for (const name of ['clientName', 'company', 'function']) body.set(name, values[name]);
      if (type === 'Inspection') body.set('inspectorId', values.inspectorId);
      body.set('signMethod', sign);
      if (sign === 'Drawn') body.set('file', await read!(), 'punch-signature.png'); else if (sign === 'Uploaded PDF') body.set('file', pdf!, pdf!.name);
      if (items.length === 1) await api(`/punch/${items[0].id}/finish`, { method: 'POST', body });
      else { body.set('punchIds', items.map(item => item.id).join(',')); await api('/punch/finish', { method: 'POST', body }); }
      await refresh(); onDone(items.length); onClose();
    } catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return <Modal title="Mark as finished (Sign-off)" onClose={onClose} wide>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <p className="punch-summary">{finishSummary(items.length, single)}</p>
      {items.length === 1 && <ItemSummary item={items[0]}/>}
      <fieldset className="field radio-field"><legend>Signed by</legend><div className="punch-radios">
        {SIGNER_TYPES.map(option => <label key={option} className="radio-option"><input type="radio" name={`${id}-signer`} value={option} checked={type === option} onChange={() => set('signerType', option)}/><span>{option}</span></label>)}</div></fieldset>
      <div className="form-grid">
        {type === 'Client' && <>{text_('clientName', 'Client name', true)}{text_('company', 'Company')}{text_('function', 'Function')}</>}
        {type === 'User' && <div className="full-width">
          <p className="punch-summary">Signature by logged-in user: {user.name}</p>
          {saved ? <p className="muted">Saved signature will be used</p> : <p className="punch-summary" role="status"><AlertCircle size={14} aria-hidden="true"/> {PUNCH_MESSAGES.noSavedSignature} <Link className="text-link" to={resourcePath('signatures')} target="_blank" rel="noreferrer">Signatures</Link></p>}
        </div>}
        {type === 'Inspection' && <div className="field"><label htmlFor={`${id}-inspector`}>Inspector<span className="required"> *</span></label><div className="select-wrap"><select id={`${id}-inspector`} value={values.inspectorId} aria-invalid={Boolean(problems.inspectorId)} aria-describedby={problems.inspectorId ? `${id}-inspector-error` : undefined} onChange={event => set('inspectorId', event.target.value)}><option value="">—</option>{inspectors.map(person => <option key={person.id} value={person.id}>{text(person.name) || text(person.number)}</option>)}</select></div>{problems.inspectorId && <small id={`${id}-inspector-error`} className="field-error">{problems.inspectorId}</small>}</div>}
        <div className="field"><label htmlFor={`${id}-date`}>Date<span className="required"> *</span></label><input id={`${id}-date`} type="date" value={values.date} aria-invalid={Boolean(problems.date)} onChange={event => set('date', event.target.value)}/>{problems.date && <small className="field-error">{problems.date}</small>}</div>
        <div className="field full-width"><label htmlFor={`${id}-note`}>Remarks</label><textarea id={`${id}-note`} rows={3} maxLength={2000} value={values.note} onChange={event => set('note', event.target.value)}/></div>
      </div>
      {!useSaved && <div className="punch-sign">
        <fieldset className="field radio-field"><legend>Signature method</legend><div className="punch-radios">
          {([['Drawn', 'Draw digitally'], ['Uploaded PDF', 'Upload PDF']] as const).map(([value, label]) => <label key={value} className="radio-option"><input type="radio" name={`${id}-method`} value={value} checked={method === value} onChange={() => { setMethod(value); setProblems(old => ({ ...old, signMethod: '' })); }}/><span>{label}</span></label>)}</div></fieldset>
        {method === 'Drawn' ? <SignaturePad label={`Signature of ${type === 'Client' ? values.clientName || 'the client' : type === 'User' ? user.name : 'the inspector'}`} disabled={busy} onChange={next => setRead(() => next)}/>
          : <div className="field"><label htmlFor={`${id}-pdf`}>Upload signed PDF</label><input id={`${id}-pdf`} type="file" accept="application/pdf,.pdf" aria-invalid={Boolean(problems.signMethod)} onChange={event => choosePdf(event.target.files?.[0] || null)}/>{pdf && <small className="field-hint">{pdf.name}</small>}</div>}
        {problems.signMethod && <small className="field-error" role="alert">{problems.signMethod}</small>}
      </div>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <Check size={15}/>}Finish + Sign-off</button></div></form>
  </Modal>;
}

// ----- isometric: Options -> Punch list ---------------------------------------------------------------------

/** The weld table's Options -> Punch list: this isometric's punch items with their counts, and Add item (the whole list stays on the Punch lists page). */
export function IsoPunchDialog({ iso, onClose }: { iso: Row; onClose: () => void }) {
  const { rows, canRecord } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const items = useMemo(() => withPunchPhases(activeRows(rows, RESOURCE)).filter(row => row.isoId === iso.id).sort((a, b) => numberOf(b) - numberOf(a) || b._createdAt.localeCompare(a._createdAt)), [rows, iso.id]);
  const counts = punchCounts(items), today = punchToday();
  if (adding) return <PunchEditor initial={{ isoId: iso.id, projectId: iso.projectId }} onClose={() => setAdding(false)} onApprove={() => undefined}/>;
  const readable = canRecord(RESOURCE);
  return <Modal title="Punch lists" subtitle={`ISO: ${text(iso.isoNo)}`} wide onClose={onClose}><div className="modal-body">
    {!readable ? <EmptyState title="You do not have rights to open this page" description="Your permission profile does not include punch lists."/> : <>
      {counts.blocking > 0 && <p className="iso-hint" role="status"><AlertCircle size={14} aria-hidden="true"/> {counts.blocking} open item{counts.blocking === 1 ? '' : 's'} in category A or B must be finished and approved before release.</p>}
      <p className="punch-summary">{counts.prePunchOpen} pre-punch open · {counts.punchOpen} punch open · {counts.overdue} overdue</p>
      {items.length ? <TableScroll><table className="data-table punch-table"><caption className="sr-only">Punch items of {text(iso.isoNo)}</caption>
        <thead><tr>{['#', 'Type', 'Description', 'Due date', 'Punch', 'Status'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
        <tbody>{items.map(row => { const status = punchStatus(row); return <tr key={row.id}>
          <td className="tabular">{text(row.number) || '—'}</td><td><span className="punch-letter" title={punchCategoryLabel(punchCategory(row.category))}>{punchCategory(row.category)}</span></td>
          <td className="description-cell" title={text(row.description)}>{text(row.description) || '—'}</td><td className="tabular">{formatDate(row.dueDate)}</td><td>{punchKind(row)}</td>
          <td><Badge color={STATUS_COLOR[status]}>{status}</Badge>{isOverdue(row, today) && <> <Badge color="red">Overdue</Badge></>}</td></tr>; })}</tbody></table></TableScroll>
        : <EmptyState title="No punch items for this isometric yet" description="Add the first pre-punch or punch item."/>}
      <p className="muted">Sign-off, edit and the activity log are on the <Link className="text-link" to={resourcePath(RESOURCE)} onClick={onClose}>Punch lists</Link> page.</p></>}
  </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button>{readable && canRecord(RESOURCE, 'insert') && <button type="button" className="btn primary" onClick={() => setAdding(true)}><Plus size={16}/>Add item</button>}</div></Modal>;
}

// ----- isometric header ------------------------------------------------------------------------------------

/**
 * Punch part of an isometric's status card: open and finished pre-punch and punch counts, the overdue count, a note
 * while blocking items remain and the punch progress (0 / 25 / 50 / 75 / 100 %) stored on the isometric.
 */
export function PunchStatus({ iso, items, summary }: { iso: Row; items: Row[] | null; summary?: PunchCounts | null }) {
  const { canRecord, refresh, notify } = useWorkspace(); const id = useId();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  // Hosted profile: the server summary counts every punch item, so MTO Pilot (which reads none) shows the same numbers as Weld Pilot.
  const counts = summary ?? (items ? punchCounts(items.filter(row => row.isoId === iso.id && !row._archived)) : null);
  if (!counts) return null;
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
