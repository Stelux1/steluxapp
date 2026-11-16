import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowUp, Camera, Check, ChevronLeft, ChevronRight, Download, FileText, Filter, FolderOpen, History, Loader2, Lock, MoreHorizontal, Pencil, PenLine, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
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
  EMPTY_PUNCH_FILTERS, PUNCH_DEFAULT_PAGE_SIZE, PUNCH_FILE_LIMIT, PUNCH_FORM_FIELDS, PUNCH_FILE_TYPES, PUNCH_KPI_FILTERS, PUNCH_LETTERS, PUNCH_LIST_PATH, PUNCH_MESSAGES, PUNCH_PAGE_SIZES, PUNCH_PASSED_NEEDS_ISO, PUNCH_PROGRESS_OPTIONS, PUNCH_SIGN_OFF_DOCUMENT, PUNCH_TYPES, PUNCH_TYPE_LABELS, SIGNER_TYPES,
  canTransition, comparePunchRows, finishSummary, isBlockingCategory, matchesPunchFilters, punchApproved, punchCategory, punchCategoryLabel, punchCounts, punchDialogWarnings, punchFiltersFromParams, punchFiltersToParams, punchFinishErrors, punchFormDefaults, punchInputErrors, punchFileProblem,
  isOverdue, punchKind, punchKpiActive, punchKpis, punchListLink, punchPhaseWarning, punchProgressLabel, punchProjectLabel, punchReportPassedRefusal, punchResizeTarget, punchRowClass, punchStatus, punchToday, withPunchPhases,
  type PunchCounts, type PunchFilters, type PunchKpiKey, type PunchTransition, type PunchType,
} from '../shared/punch.ts';
import type { Field, Row } from '../shared/types.ts';

const RESOURCE = 'punchlists';
const text = (value: unknown) => String(value ?? '').trim();
const STATUS_COLOR: Record<string, string> = { Open: 'amber', Finished: 'neutral', Passed: 'green', Removed: 'neutral' };

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
  // The view, project, isometric, punch type, type and due filter live in the address (iso_id, project_id, punch_type, item_type, viewT, due_filter),
  // so the links of the isometric card and the blocker line open this page already filtered. The list opens on the Open view.
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => punchFiltersFromParams(params), [params]);
  const [q, setQ] = useState(''), [letterDraft, setLetterDraft] = useState<string>(filters.letter);
  const [page, setPage] = useState(0), [size, setSize] = useState(PUNCH_DEFAULT_PAGE_SIZE);
  const [editor, setEditor] = useState<Row | 'new' | null>(null), [dialog, setDialog] = useState<Dialog | null>(null);
  const [checked, setChecked] = useState<string[]>([]), [promoting, setPromoting] = useState(''), [actionError, setActionError] = useState('');
  const today = punchToday();
  useEffect(() => { setLetterDraft(filters.letter); }, [filters.letter]);
  // Passed is derived per isometric and phase over every item (shared/punch.ts), before any filter.
  const items = useMemo(() => withPunchPhases(activeRows(rows, RESOURCE)), [rows]);
  const iso = (row: Row) => rows.isometrics?.find(item => item.id === row.isoId);
  const contractorName = (row: Row) => row.contractorId ? label('companies', row.contractorId) : text(row.assignedTo);
  const apply = (next: Partial<PunchFilters>) => { setParams(punchFiltersToParams({ ...filters, ...next }), { replace: true }); setPage(0); };
  // The key figures follow project, isometric, type and search; choosing a card sets the view, punch type and due filter.
  const base = useMemo(() => {
    const query = q.toLowerCase().trim();
    return items.filter(row => (!filters.projectId || projectOf(row, rows) === filters.projectId) && (!filters.isoId || row.isoId === filters.isoId) && (!filters.letter || punchCategory(row.category) === filters.letter)
      && (!query || [row.description, row.name, row.reportedBy, row.number, iso(row)?.isoNo, contractorName(row)].some(value => text(value).toLowerCase().includes(query))));
  }, [items, rows, filters.projectId, filters.isoId, filters.letter, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const cards = useMemo(() => punchKpis(base, today), [base, today]);
  const filtered = useMemo(() => base.filter(row => matchesPunchFilters(row, filters, today)).sort(comparePunchRows), [base, filters, today]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)), current = Math.min(page, pages - 1), shown = filtered.slice(current * size, (current + 1) * size);
  const filterCount = [filters.view !== 'open', filters.projectId, filters.isoId, filters.punchType, filters.letter, filters.due, q.trim()].filter(Boolean).length;
  const reset = () => { setParams(new URLSearchParams(), { replace: true }); setQ(''); setLetterDraft(''); setPage(0); };
  const may = (row: Row, transition: PunchTransition) => canTransition(row, transition) && canRun(`punch-${transition}`, { punchId: row.id });
  // Checked rows that can still be finished (a refresh may have finished or removed some).
  const selection = checked.map(id => items.find(row => row.id === id)).filter((row): row is Row => Boolean(row) && may(row!, 'finish'));
  const printIds = checked.filter(id => items.some(row => row.id === id));
  const toggle = (id: string, on: boolean) => setChecked(old => on ? [...new Set([...old, id])] : old.filter(item => item !== id));
  async function promote(row: Row) {
    setPromoting(row.id); setActionError('');
    try { await post('/actions/punch-promote', { punchId: row.id }); await refresh(); notify('Promoted to Punch.'); }
    catch (failure) { setActionError((failure as Error).message); } finally { setPromoting(''); }
  }

  if (!canRecord(RESOURCE)) return <div className="page"><EmptyState title="You do not have rights to open this page" description="Your permission profile does not include punch lists."/></div>;
  const creatable = canRecord(RESOURCE, 'insert'), exportable = canRecord(RESOURCE, 'export');
  const exportUrl = (format: string) => apiUrl(`/export/${RESOURCE}?format=${format}&ids=${filtered.map(row => row.id).join(',') || '__none__'}`);
  const projects = activeRows(rows, 'projects');
  const isoFilter = filters.isoId ? label('isometrics', filters.isoId) : '';

  return <div className="page records-page punch-page" style={{ '--pilot-color': pilot?.pilot.color } as React.CSSProperties}>
    <div className="page-heading"><div><div className="eyebrow">WELDING · RELEASES</div><h1>{def.title}<span className="heading-count">{items.length}</span></h1><p>Pre-punch and punch items of the isometrics and projects, from the report to the sign-off and the client approval.</p></div>
      <div className="heading-actions">
        <PunchListPdfButton filters={{ projectId: filters.projectId, isoId: filters.isoId, punchType: filters.punchType, category: filters.letter, view: filters.view, due: filters.due, q }} selected={printIds}/>
        {selection.length > 0 && <button className="btn" onClick={() => setDialog({ kind: 'finish', rows: selection, single: false })}><Check size={16}/>Mark as finished (Sign-off)</button>}
        {exportable && <Dropdown label="Export punch items" trigger={<span className="btn"><Download size={16}/>Export</span>}><a href={exportUrl('csv')}>CSV file</a><a href={exportUrl('xlsx')}>Excel file</a></Dropdown>}
        {creatable && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add item</button>}
      </div></div>
    <section className="punch-kpis" aria-label="Punch key figures. Choose a card to show that view.">
      {cards.map(card => <button key={card.key} type="button" className={`panel punch-kpi ${punchKpiActive(card.key, filters) ? 'on' : ''} ${card.key === 'overdue' && card.count ? 'alert' : ''}`} aria-pressed={punchKpiActive(card.key, filters)} onClick={() => apply(PUNCH_KPI_FILTERS[card.key])}>
        <small>{card.label}</small><strong>{card.count}</strong></button>)}
    </section>
    {actionError && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{actionError}</span></div>}
    <div className="table-card">
      <div className="table-toolbar punch-toolbar"><SearchInput value={q} onChange={value => { setQ(value); setPage(0); }} placeholder="Search punch items…"/>
        <div className="punch-filters">
          <div className="field"><label htmlFor="punch-project">Project</label><select id="punch-project" value={filters.projectId} onChange={event => apply({ projectId: event.target.value, due: '' })}><option value="">All</option>{projects.map(item => <option key={item.id} value={item.id}>{punchProjectLabel(item)}</option>)}</select></div>
          <div className="field"><label htmlFor="punch-kind">Punch type</label><select id="punch-kind" value={filters.punchType} onChange={event => apply({ punchType: event.target.value as PunchType | '', due: '' })}><option value="">All</option>{PUNCH_TYPES.map(value => <option key={value}>{value}</option>)}</select></div>
          <div className="field"><label htmlFor="punch-letter">Type</label><select id="punch-letter" value={letterDraft} onChange={event => setLetterDraft(event.target.value)}><option value="">All</option>{PUNCH_LETTERS.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
          <button type="button" className="btn small primary" onClick={() => apply({ letter: letterDraft as PunchFilters['letter'] })}><Filter size={14} aria-hidden="true"/>Apply</button>
          <button type="button" className="btn small" onClick={reset}>Reset</button>
          {isoFilter && <span className="punch-iso-filter">Isometric {isoFilter}<button type="button" className="icon-btn" aria-label="Remove the isometric filter" onClick={() => apply({ isoId: '' })}><X size={13}/></button></span>}
        </div></div>
      <TableScroll><table className="data-table punch-table"><caption className="sr-only">Punch items</caption>
        <thead><tr>{['#', 'Project', 'Isometric', 'Type', 'Description', 'Due date', 'Contractor', 'Punch', 'Document', 'Status'].map(heading => <th key={heading} scope="col">{heading}</th>)}<th scope="col" className="actions-cell"><span className="sr-only">Options</span></th></tr></thead>
        <tbody>{shown.map(row => {
          const status = punchStatus(row), files = filesOf(rows, row), signOff = files.find(file => file.documentType === PUNCH_SIGN_OFF_DOCUMENT), photos = files.filter(file => file.documentType !== PUNCH_SIGN_OFF_DOCUMENT);
          const open = status === 'Open', editable = open && canRecord(RESOURCE, 'edit', row);
          const name = text(row.name) || text(row.description).slice(0, 40) || 'punch item';
          return <tr key={row.id} className={punchRowClass(row, today) ? `punch-row-${punchRowClass(row, today)}` : undefined}>
            <td className="tabular">{text(row.number) || '—'}</td><td>{projectOf(row, rows) ? label('projects', projectOf(row, rows)) : '—'}</td>
            <td>{row.isoId ? <Link className="text-link" to={`/workspace/isometrics/${row.isoId}`} target="_blank" rel="noreferrer">{label('isometrics', row.isoId)}</Link> : <span className="muted">Project related</span>}</td>
            <td><span className="punch-letter" title={punchCategoryLabel(punchCategory(row.category))}>{punchCategory(row.category)}</span></td>
            <td className="description-cell" title={text(row.description)}>{text(row.description) || '—'}</td>
            <td className="tabular punch-due">{formatDate(row.dueDate)}</td><td>{contractorName(row) || '—'}</td><td>{punchKind(row)}</td>
            <td className="punch-documents">{photos.length || signOff ? <>{photos.map(file => <a key={file.id} className="text-link" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer" title={text(file.name)}><FileText size={13} aria-hidden="true"/>{text(file.documentType) === 'Punch photo' ? 'Photo' : 'Document'}<span className="sr-only">: {text(file.name)}</span></a>)}{signOff && <a className="text-link" href={apiUrl(`/files/${signOff.id}`)} target="_blank" rel="noreferrer" title={text(signOff.name)}><ShieldCheck size={13} aria-hidden="true"/>Sign-off</a>}</> : <span className="muted">—</span>}</td>
            <td><Badge color={STATUS_COLOR[status]}>{status}</Badge>{status !== 'Passed' && punchApproved(row) && <> <Badge color="green">Client approved</Badge></>}</td>
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
              {may(row, 'finish') && <input type="checkbox" className="punch-check" aria-label={`Select ${name} for the sign-off and the print`} checked={checked.includes(row.id)} onChange={event => toggle(row.id, event.target.checked)}/>}
            </div></td></tr>;
        })}</tbody></table></TableScroll>
      {!filtered.length && <EmptyState title={filterCount ? 'No punch items match your filters' : 'No punch items yet'} description={filterCount ? 'Try another view or search, or reset the filters.' : creatable ? 'Add the first pre-punch or punch item to start the list.' : 'Punch items added by your team will appear here.'} action={filterCount ? <button className="btn" onClick={reset}>Reset</button> : creatable ? <button className="btn primary" onClick={() => setEditor('new')}><Plus size={16}/>Add item</button> : undefined}/>}
      <div className="table-footer"><span role="status" aria-live="polite">{filtered.length ? `${current * size + 1}–${Math.min((current + 1) * size, filtered.length)}` : '0'} of {filtered.length} items{selection.length ? ` · ${selection.length} selected` : ''}</span><div><span>Rows per page</span><select aria-label="Rows per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{PUNCH_PAGE_SIZES.map(n => <option key={n}>{n}</option>)}</select>
        <button className="icon-btn" disabled={current === 0} aria-label="Previous page" onClick={() => setPage(current - 1)}><ChevronLeft size={16}/></button><button className="icon-btn" disabled={current >= pages - 1} aria-label="Next page" onClick={() => setPage(current + 1)}><ChevronRight size={16}/></button></div></div>
    </div>
    {editor === 'new' && <PunchDialog onClose={() => setEditor(null)}/>}
    {editor && editor !== 'new' && <PunchEditDialog record={editor} onClose={() => setEditor(null)} onApprove={row => { setEditor(null); setDialog({ kind: 'approve', row }); }}/>}
    {dialog?.kind === 'finish' && <FinishDialog items={dialog.rows} single={dialog.single} onClose={() => setDialog(null)} onDone={count => { setChecked([]); notify(count === 1 ? 'Punch item marked as finished.' : `${count} punch items marked as finished.`); }}/>}
    {dialog?.kind === 'remove' && <ConfirmDialog item={dialog.row} transition="remove" onClose={() => setDialog(null)} onDone={() => notify('Punch item removed.')}/>}
    {dialog?.kind === 'approve' && <ConfirmDialog item={dialog.row} transition="approve" onClose={() => setDialog(null)} onDone={() => notify('Punch item marked as client approved.')}/>}
    {dialog?.kind === 'history' && <Modal title="Activity log" subtitle={text(dialog.row.name) || text(dialog.row.description).slice(0, 80)} onClose={() => setDialog(null)}><div className="modal-body"><RecordHistory resource={RESOURCE} id={dialog.row.id}/></div><div className="modal-footer"><button className="btn" onClick={() => setDialog(null)}>Cancel</button></div></Modal>}
  </div>;
}

// ----- photos and documents ----------------------------------------------------------------------------------

const MAX_FILE = 20 * 1024 * 1024;
const fileKind = (file: File) => file.type.startsWith('image/') ? PUNCH_FILE_TYPES[0] : PUNCH_FILE_TYPES[1];
/** A photo larger than about 1280 px on its long side is scaled down before it is sent; other files stay as they are. */
async function scalePhoto(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const target = punchResizeTarget(bitmap.width, bitmap.height);
    if (target.width === bitmap.width && target.height === bitmap.height) return file;
    const canvas = document.createElement('canvas'); canvas.width = target.width; canvas.height = target.height;
    const context = canvas.getContext('2d'); if (!context) return file;
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.85));
    return blob ? new File([blob], file.name, { type, lastModified: file.lastModified }) : file;
  } finally { bitmap.close(); }
}

/** The File part of Add item and Report passed: Take photo / Choose file (images and PDF only), the chosen name, photos scaled in the browser. */
function PunchFileField({ id, file, error, onPick }: { id: string; file: File | null; error?: string; onPick: (file: File | null, problem: string) => void }) {
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null);
  async function chosen(input: HTMLInputElement) {
    const picked = input.files?.[0] || null; input.value = '';
    if (!picked) return;
    const problem = punchFileProblem(picked.name, picked.type);
    if (problem) { onPick(null, problem); return; }
    if (picked.size > MAX_FILE) { onPick(null, 'A file can be at most 20 MB.'); return; }
    try { onPick(await scalePhoto(picked), ''); } catch { onPick(null, 'The photo could not be read. Use a JPEG or PNG.'); }
  }
  return <div className="field punch-file-field"><label htmlFor={`${id}-choose`}>File</label>
    <p className="field-hint" id={`${id}-hint`}>Take a photo or choose a PDF or image. Photos are auto-resized (max. about 1280 px).</p>
    <input ref={camera} type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" hidden onChange={event => void chosen(event.target)}/>
    <input ref={gallery} type="file" accept="image/*,application/pdf,.pdf" tabIndex={-1} aria-hidden="true" hidden onChange={event => void chosen(event.target)}/>
    <div className="punch-file-actions"><button type="button" className="btn" onClick={() => camera.current?.click()}><Camera size={15} aria-hidden="true"/>Take photo</button><button type="button" id={`${id}-choose`} className="btn" aria-describedby={`${id}-hint`} onClick={() => gallery.current?.click()}><FolderOpen size={15} aria-hidden="true"/>Choose file</button></div>
    <small className="field-hint punch-file-name" role="status">{file ? file.name : 'Nothing selected'}</small>
    {error && <small className="field-error" role="alert">{error}</small>}</div>;
}

/** Uploads the item's file after the record exists; returns the problem text when it fails. */
async function attachPunchFile(target: string, file: File): Promise<void> {
  const body = new FormData(); body.set('entityType', RESOURCE); body.set('entityId', target); body.set('documentType', fileKind(file)); body.set('file', file);
  await api('/files', { method: 'POST', body });
}

// ----- the punch dialog: Add item, Report passed, Complete punch & Sign-off ------------------------------------

type Tab = 'add' | 'passed' | 'signoff';
/**
 * The dialog "Punch lists". Opened from the Punch lists page it has the tabs Add item and Report passed; opened for one
 * isometric (the Item button of its status card) the tabs are Add item and Complete punch & Sign-off, with the isometric's warnings above.
 */
export function PunchDialog({ isoId, onClose }: { isoId?: string; onClose: () => void }) {
  const { rows } = useWorkspace();
  const iso = isoId ? rows.isometrics?.find(item => item.id === isoId) : undefined;
  const [tab, setTab] = useState<Tab>('add');
  const second: Tab = isoId ? 'signoff' : 'passed';
  const items = useMemo(() => activeRows(rows, RESOURCE).filter(row => row.isoId === isoId), [rows, isoId]);
  const warnings = iso ? punchDialogWarnings(iso, items) : [];
  return <Modal title="Punch lists" onClose={onClose} wide>
    <div className="modal-body punch-dialog">
      {warnings.map(warning => <div key={warning.type} className={`alert punch-alert ${warning.severity}`} role="status"><AlertCircle size={16} aria-hidden="true"/><span>{warning.message}</span></div>)}
      <p className="alert punch-alert info punch-modal-hint">Manage items and view lists on the punch list page. This modal is for quick add and passed reporting only.{' '}
        <Link className="text-link" to={PUNCH_LIST_PATH} target="_blank" rel="noreferrer">Open punch list</Link> · <Link className="text-link" to={punchListLink({ view: 'passed' })} target="_blank" rel="noreferrer">Passed overview</Link></p>
      <div className="table-tabs punch-tabs" role="tablist" aria-label="Punch lists">
        <button type="button" role="tab" id="punch-tab-add" aria-selected={tab === 'add'} aria-controls="punch-panel" className={tab === 'add' ? 'selected' : ''} onClick={() => setTab('add')}>Add item</button>
        <button type="button" role="tab" id={`punch-tab-${second}`} aria-selected={tab === second} aria-controls="punch-panel" className={tab === second ? 'selected' : ''} onClick={() => setTab(second)}>{isoId ? 'Complete punch & Sign-off' : 'Report passed'}</button>
      </div>
      <div id="punch-panel" role="tabpanel" aria-labelledby={`punch-tab-${tab}`}>
        {tab === 'add' && <AddItemForm iso={iso} onClose={onClose}/>}
        {tab === 'passed' && <ReportPassedForm onClose={onClose}/>}
        {tab === 'signoff' && iso && <SignOffTab iso={iso} onClose={onClose}/>}
      </div>
    </div>
    <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button></div>
  </Modal>;
}

/** Add item: Project, ISO (fixed when the dialog is opened for an isometric), Type, File, Description, Due date, Contractor, Reported date, Reported by, Pre-Punch / Punch. */
function AddItemForm({ iso, onClose }: { iso?: Row; onClose: () => void }) {
  const { rows, refresh, notify, label } = useWorkspace(); const id = useId();
  const def = RESOURCE_MAP[RESOURCE];
  const field = (name: string) => def.fields.find(item => item.name === name);
  const names = PUNCH_FORM_FIELDS.filter(name => name !== 'files');
  const companies = activeRows(rows, 'companies'), projects = activeRows(rows, 'projects');
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...punchFormDefaults(companies), projectId: iso ? iso.projectId : projects.length === 1 ? projects[0].id : '', isoId: iso?.id ?? '' }));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [savedId, setSavedId] = useState('');
  const change = (name: string, value: unknown) => { setProblems(old => ({ ...old, [name]: '' })); setValues(old => {
    const next = { ...old, [name]: value };
    const projectIso = (isoId: unknown) => text(rows.isometrics?.find(item => item.id === isoId)?.projectId);
    if (name === 'isoId' && value) next.projectId = projectIso(value);
    if (name === 'projectId' && next.isoId && projectIso(next.isoId) !== value) next.isoId = '';
    return next;
  }); };
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const chosen = rows.isometrics?.find(item => item.id === values.isoId);
    const found: Record<string, string> = punchInputErrors(values, undefined, chosen);
    if (!text(values.description)) found.description = PUNCH_MESSAGES.description;
    if (!(PUNCH_TYPES as readonly string[]).includes(text(values.punchType))) found.punchType = PUNCH_MESSAGES.kind;
    delete found.status;
    if (Object.keys(found).length) { setProblems(found); setError(Object.values(found)[0]); return; }
    setBusy(true); setProblems({});
    let target = savedId;
    try {
      if (!target) { const saved = await api<{ record: Row }>(`/records/${RESOURCE}`, { method: 'POST', body: JSON.stringify(Object.fromEntries(names.map(name => [name, values[name]]))) }); target = saved.record.id; setSavedId(target); }
      if (file) {
        try { await attachPunchFile(target, file); setFile(null); }
        catch (failure) { await refresh(); setProblems({ file: (failure as Error).message }); setError('The punch item was saved, but the file could not be attached. Choose the file again or close this window.'); return; }
      }
      await refresh(); notify('Saved.'); onClose();
    } catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const input = (name: string, patch: Partial<Field> = {}) => { const base = field(name); return base ? <FieldInput key={name} field={{ ...base, hidden: false, ...patch }} value={values[name]} values={values} error={problems[name]} onChange={value => change(name, value)}/> : null; };
  return <form onSubmit={event => void submit(event)} noValidate className="punch-form">
    <p className="panel-section-title">New item</p>
    {iso && <p className="punch-iso-badge"><strong>ISO:</strong> {text(iso.isoNo)}</p>}
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    <div className="form-grid">
      {!iso && <>
        {/* A plain select: the shared field renames "Project" to "Subproject" in the project-scoped workspace; the reference says Project. */}
        <div className="field"><label htmlFor={`${id}-project`}>Project<span className="required"> *</span></label><div className="select-wrap"><select id={`${id}-project`} value={text(values.projectId)} aria-invalid={Boolean(problems.projectId)} aria-describedby={problems.projectId ? `${id}-project-error` : undefined} onChange={event => change('projectId', event.target.value)}><option value="">Select project</option>{projects.map(item => <option key={item.id} value={item.id}>{label('projects', item.id)}</option>)}</select></div>{problems.projectId && <small id={`${id}-project-error`} className="field-error">{problems.projectId}</small>}</div>
        {input('isoId', { legacy: { '': '- Project related, not iso' }, hint: undefined })}
      </>}
      {input('category', { label: 'Type', blank: undefined })}
    </div>
    <PunchFileField id={`${id}-file`} file={file} error={problems.file} onPick={(picked, problem) => { setFile(picked); setProblems(old => ({ ...old, file: problem })); }}/>
    <div className="form-grid">
      {input('description', { label: 'Description', required: false })}
      {input('dueDate')}{input('contractorId', { blank: undefined })}{input('reportedDate')}
      {input('reportedById', { blank: '—' })}
      <fieldset className="field radio-field" aria-describedby={problems.punchType ? `${id}-kind-error` : undefined}><legend>Pre-Punch / Punch</legend><div className="punch-radios">
        {PUNCH_TYPES.map(type => <label key={type} className="radio-option"><input type="radio" name={`${id}-kind`} value={type} checked={values.punchType === type} onChange={() => change('punchType', type)}/><span>{PUNCH_TYPE_LABELS[type]}</span></label>)}</div>
        {problems.punchType && <small id={`${id}-kind-error`} className="field-error">{problems.punchType}</small>}</fieldset>
    </div>
    <button className="btn primary punch-block" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <Plus size={15}/>}Add</button>
  </form>;
}

/** Report passed: records that the Pre-Punch or Punch phase of an isometric is complete (an isometric is required). */
function ReportPassedForm({ onClose }: { onClose: () => void }) {
  const { rows, refresh, notify, label } = useWorkspace(); const id = useId();
  const def = RESOURCE_MAP[RESOURCE];
  const field = (name: string) => def.fields.find(item => item.name === name);
  const companies = activeRows(rows, 'companies'), projects = activeRows(rows, 'projects');
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ projectId: projects.length === 1 ? projects[0].id : '', isoId: '', contractorId: companies[0]?.id ?? '', reportedDate: punchToday(), reportedById: '', punchType: 'Pre-punch' }));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const change = (name: string, value: unknown) => { setProblems(old => ({ ...old, [name]: '' })); setValues(old => {
    const next = { ...old, [name]: value };
    const projectIso = (isoId: unknown) => text(rows.isometrics?.find(item => item.id === isoId)?.projectId);
    if (name === 'isoId' && value) next.projectId = projectIso(value);
    if (name === 'projectId' && next.isoId && projectIso(next.isoId) !== value) next.isoId = '';
    return next;
  }); };
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const refusal = punchReportPassedRefusal(values.isoId, values.punchType, activeRows(rows, RESOURCE));
    if (refusal) { setProblems({ isoId: refusal }); setError(refusal); return; }
    setBusy(true); setProblems({});
    try {
      const done = await post<{ record: Row }>('/actions/punch-report-passed', { isoId: values.isoId, punchType: values.punchType, contractorId: values.contractorId, reportedById: values.reportedById, reportedDate: values.reportedDate });
      if (file) {
        try { await attachPunchFile(done.record.id, file); }
        catch (failure) { await refresh(); notify('Passed registered.'); setProblems({ file: (failure as Error).message }); setError('Passed was registered, but the file could not be attached. Choose Edit on the item to add it later.'); setFile(null); return; }
      }
      await refresh(); notify('Passed registered.'); onClose();
    } catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const input = (name: string, patch: Partial<Field> = {}) => { const base = field(name); return base ? <FieldInput key={name} field={{ ...base, hidden: false, ...patch }} value={values[name]} values={values} error={problems[name]} onChange={value => change(name, value)}/> : null; };
  return <form onSubmit={event => void submit(event)} noValidate className="punch-form">
    <p className="panel-section-title">Report passed</p>
    <p className="muted">Register that pre-punch or punch is complete for an isometric. View the list on the punch list page (Passed filter).</p>
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    <div className="form-grid">
      <div className="field"><label htmlFor={`${id}-project`}>Project<span className="required"> *</span></label><div className="select-wrap"><select id={`${id}-project`} value={text(values.projectId)} onChange={event => change('projectId', event.target.value)}><option value="">Select project</option>{projects.map(item => <option key={item.id} value={item.id}>{label('projects', item.id)}</option>)}</select></div></div>
      {input('isoId', { legacy: { '': '- Project related, not iso' }, hint: undefined, required: true })}
    </div>
    <PunchFileField id={`${id}-file`} file={file} error={problems.file} onPick={(picked, problem) => { setFile(picked); setProblems(old => ({ ...old, file: problem })); }}/>
    <div className="form-grid">
      {input('contractorId', { blank: undefined })}{input('reportedDate')}{input('reportedById', { blank: '—' })}
      <fieldset className="field radio-field"><legend>Pre-Punch / Punch</legend><div className="punch-radios">
        {PUNCH_TYPES.map(type => <label key={type} className="radio-option"><input type="radio" name={`${id}-kind`} value={type} checked={values.punchType === type} onChange={() => change('punchType', type)}/><span>{PUNCH_TYPE_LABELS[type]}</span></label>)}</div></fieldset>
    </div>
    <button className="btn primary punch-block" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <Check size={15}/>}Register passed</button>
  </form>;
}

/** Complete punch & Sign-off: the open items of one phase of the isometric are ticked and signed off together. */
function SignOffTab({ iso, onClose }: { iso: Row; onClose: () => void }) {
  const { rows, canRun, notify } = useWorkspace(); const id = useId();
  const items = useMemo(() => withPunchPhases(activeRows(rows, RESOURCE)).filter(row => row.isoId === iso.id && punchStatus(row) === 'Open' && canRun('punch-finish', { punchId: row.id })), [rows, iso.id, canRun]);
  const count = (kind: PunchType) => items.filter(row => punchKind(row) === kind).length;
  const [kind, setKind] = useState<PunchType>(() => count('Punch') > 0 || count('Pre-punch') === 0 ? 'Punch' : 'Pre-punch');
  const [chosen, setChosen] = useState<string[]>([]);
  const phase = items.filter(row => punchKind(row) === kind);
  const picked = phase.filter(row => chosen.includes(row.id));
  return <div className="punch-form">
    <p className="panel-section-title">Complete punch & Sign-off</p>
    <p className="muted">Select open punch items from this isometric and mark them complete with sign-off.</p>
    <p className="punch-iso-badge"><strong>ISO:</strong> {text(iso.isoNo)}</p>
    <p className="punch-summary" role="status">{count('Pre-punch')} Pre-Punch open · {count('Punch')} Punch open</p>
    <fieldset className="field radio-field"><legend className="sr-only">Phase</legend><div className="punch-radios">
      {PUNCH_TYPES.map(type => <label key={type} className="radio-option"><input type="radio" name={`${id}-phase`} value={type} checked={kind === type} onChange={() => { setKind(type); setChosen([]); }}/><span>{PUNCH_TYPE_LABELS[type]}</span></label>)}</div></fieldset>
    <fieldset className="field punch-select"><legend>Select punch items</legend>
      <p className="field-hint">Select one or more open items from this isometric to mark complete with sign-off.</p>
      {phase.length === 0 ? <p className="muted">No open {PUNCH_TYPE_LABELS[kind]} items.</p> : <>
        <label className="radio-option"><input type="checkbox" checked={picked.length === phase.length} onChange={event => setChosen(event.target.checked ? phase.map(row => row.id) : [])}/><span>Select all</span></label>
        {phase.map(row => <label key={row.id} className="radio-option punch-signoff-row"><input type="checkbox" name="punch_ids" checked={chosen.includes(row.id)} onChange={event => setChosen(old => event.target.checked ? [...old, row.id] : old.filter(item => item !== row.id))}/>
          <span><strong>{punchCategory(row.category)}</strong> ({PUNCH_TYPE_LABELS[punchKind(row)]}) {text(row.description)} {formatDate(row.dueDate)}</span></label>)}</>}
    </fieldset>
    <FinishForm items={picked} single={false} inline onClose={onClose} onDone={done => { notify(done === 1 ? 'Punch item marked as finished.' : `${done} punch items marked as finished.`); onClose(); }}/>
  </div>;
}

// ----- edit ---------------------------------------------------------------------------------------------------

/** Edit punchlist item: Type, Description, Due date, Contractor, Reported date, Reported by, File and Pre-Punch / Punch; the project and the isometric do not change. */
function PunchEditDialog({ record, onClose, onApprove }: { record: Row; onClose: () => void; onApprove: (row: Row) => void }) {
  const { rows, refresh, notify, canRun } = useWorkspace(); const id = useId();
  const def = RESOURCE_MAP[RESOURCE];
  const field = (name: string) => def.fields.find(item => item.name === name);
  const names = ['category', 'description', 'dueDate', 'contractorId', 'reportedDate', 'reportedById', 'punchType'];
  const existing = filesOf(rows, record).filter(file => file.documentType !== PUNCH_SIGN_OFF_DOCUMENT);
  const room = Math.max(0, PUNCH_FILE_LIMIT - existing.length);
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(names.map(name => [name, record[name] ?? (name === 'punchType' ? punchKind(record) : '')])));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  const change = (name: string, value: unknown) => { setProblems(old => ({ ...old, [name]: '' })); setValues(old => ({ ...old, [name]: value })); };
  function choose(picked: File | null) {
    if (picked && picked.size > MAX_FILE) { setProblems(old => ({ ...old, file: 'A file can be at most 20 MB.' })); return; }
    setProblems(old => ({ ...old, file: '' })); setFile(picked);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const found: Record<string, string> = punchInputErrors({ ...values, isoId: record.isoId, projectId: record.projectId }, undefined, rows.isometrics?.find(item => item.id === record.isoId));
    if (!text(values.description)) found.description = PUNCH_MESSAGES.description;
    if (!(PUNCH_TYPES as readonly string[]).includes(text(values.punchType))) found.punchType = PUNCH_MESSAGES.kind;
    delete found.status;
    if (Object.keys(found).length) { setProblems(found); setError(Object.values(found)[0]); return; }
    setBusy(true); setProblems({});
    try {
      const payload = Object.fromEntries(Object.entries(values).filter(([name, value]) => text(value) !== text(record[name])));
      if (!Object.keys(payload).length && !file) { onClose(); return; }
      if (Object.keys(payload).length) await api(`/records/${RESOURCE}/${record.id}`, { method: 'PUT', body: JSON.stringify({ ...payload, _version: record._version }) });
      if (file) {
        try { await attachPunchFile(record.id, file); }
        catch (failure) { await refresh(); setProblems({ file: (failure as Error).message }); setError('The punch item was saved, but the file could not be attached. Choose the file again or close this window.'); return; }
      }
      await refresh(); notify('Punch item updated.'); onClose();
    } catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const input = (name: string, patch: Partial<Field> = {}) => { const base = field(name); return base ? <FieldInput key={name} field={{ ...base, hidden: false, ...patch }} value={values[name]} values={values} error={problems[name]} onChange={value => change(name, value)}/> : null; };
  const approvable = canTransition(record, 'approve') && canRun('punch-approve', { punchId: record.id });
  return <Modal title="Edit punchlist item" onClose={onClose} wide>
    <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="form-grid">
        {input('category', { label: 'Type', blank: undefined })}
        {input('description', { label: 'Description', type: 'text', required: true })}
        {input('dueDate')}{input('contractorId', { blank: undefined })}{input('reportedDate')}
        {input('reportedById', { blank: '-------------------------' })}
      </div>
      <fieldset className="punch-files"><legend>File</legend>
        {existing.length > 0 && <ul>{existing.map(item => <li key={item.id}><FileText size={14} aria-hidden="true"/><a className="text-link" href={apiUrl(`/files/${item.id}`)} target="_blank" rel="noreferrer">{text(item.name)}</a></li>)}</ul>}
        {room === 0 ? <p className="muted">This item already holds {PUNCH_FILE_LIMIT} files.</p> : <div className="field"><label htmlFor={`${id}-file`}>Choose file</label>
          <input id={`${id}-file`} type="file" aria-invalid={Boolean(problems.file)} onChange={event => choose(event.target.files?.[0] || null)}/>
          <small className="field-hint">{file ? file.name : 'Nothing selected'}</small>{problems.file && <small className="field-error">{problems.file}</small>}</div>}
      </fieldset>
      <div className="form-grid">
        <fieldset className="field radio-field" aria-describedby={problems.punchType ? `${id}-kind-error` : undefined}><legend>Pre-Punch / Punch</legend><div className="punch-radios">
          {PUNCH_TYPES.map(type => <label key={type} className="radio-option"><input type="radio" name={`${id}-kind`} value={type} checked={values.punchType === type} onChange={() => change('punchType', type)}/><span>{PUNCH_TYPE_LABELS[type]}</span></label>)}</div>
          {problems.punchType && <small id={`${id}-kind-error`} className="field-error">{problems.punchType}</small>}</fieldset>
      </div>
      {approvable && <p><button type="button" className="btn" onClick={() => onApprove(record)} disabled={busy}><ShieldCheck size={15}/>Mark as Client approved</button></p>}
      {punchApproved(record) && <p><Badge color="green">Client approved</Badge></p>}
      <section className="punch-edit-log" aria-label="Activity log"><h3>Activity log</h3><RecordHistory resource={RESOURCE} id={record.id}/></section>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Close</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Save</button></div></form>
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

/** Mark as finished (Sign-off) for one row or for the checked rows, as a dialog of its own. */
function FinishDialog({ items, single, onClose, onDone }: { items: Row[]; single: boolean; onClose: () => void; onDone: (count: number) => void }) {
  return <Modal title="Mark as finished (Sign-off)" onClose={onClose} wide><FinishForm items={items} single={single} onClose={onClose} onDone={onDone}/></Modal>;
}

/**
 * The sign-off form, for one row or for the checked rows: signed by the client, the signed-in user (with the saved signature
 * from Signatures when there is one) or an inspector, drawn on screen or as a signed PDF, sent in one request. The items
 * become Finished and client approved. `inline` is the form inside the isometric's Complete punch & Sign-off tab.
 */
function FinishForm({ items, single, inline = false, onClose, onDone }: { items: Row[]; single: boolean; inline?: boolean; onClose: () => void; onDone: (count: number) => void }) {
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
    if (!items.length) { setError(PUNCH_MESSAGES.select); return; }
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
      await refresh(); onDone(items.length); if (!inline) onClose();
    } catch (failure) { setError((failure as Error).message); setProblems((failure as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const submitButton = <button className={`btn primary ${inline ? 'punch-block' : ''}`} disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <Check size={15}/>}Finish + Sign-off</button>;
  const body = <>
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      {!inline && <p className="punch-summary">{finishSummary(items.length, single)}</p>}
      {items.length === 1 && !inline && <ItemSummary item={items[0]}/>}
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
  </>;
  if (inline) return <form className="punch-signoff-form" onSubmit={event => void submit(event)} noValidate>{body}{submitButton}</form>;
  return <form onSubmit={event => void submit(event)} noValidate><div className="modal-body">{body}</div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>{submitButton}</div></form>;
}

// ----- isometric: Options -> Punch list ---------------------------------------------------------------------

/** The weld table's Options -> Punch list: this isometric's punch items with their counts, and Add item (the whole list stays on the Punch lists page). */
const numberOf = (row: Row) => Number(row.number) || 0;
export function IsoPunchDialog({ iso, onClose }: { iso: Row; onClose: () => void }) {
  const { rows, canRecord } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const items = useMemo(() => withPunchPhases(activeRows(rows, RESOURCE)).filter(row => row.isoId === iso.id).sort((a, b) => numberOf(b) - numberOf(a) || b._createdAt.localeCompare(a._createdAt)), [rows, iso.id]);
  const counts = punchCounts(items), today = punchToday();
  if (adding) return <AddItemForm iso={iso} onClose={() => setAdding(false)}/>;
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
 * Punch part of an isometric's status card: per phase (Pre-punch, Punch) the head Open or Passed and the open and finished counts
 * as links to the filtered Punch lists page, one overdue link, a warning for each phase with A/B items still to finish and approve,
 * the buttons Punch list and Item (the dialog of this isometric), and the punch progress (0 / 25 / 50 / 75 / 100 %) stored on the isometric.
 * Under MTO Pilot, which has no Punch lists page, the counts are plain text.
 */
export function PunchStatus({ iso, items, summary }: { iso: Row; items: Row[] | null; summary?: PunchCounts | null }) {
  const { canRecord, refresh, notify } = useWorkspace(); const id = useId(); const pilot = usePilot();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dialog, setDialog] = useState(false);
  // Hosted profile: the server summary counts every punch item, so MTO Pilot (which reads none) shows the same numbers as Weld Pilot.
  const counts = summary ?? (items ? punchCounts(items.filter(row => row.isoId === iso.id && !row._archived)) : null);
  if (!counts) return null;
  const editable = canRecord('isometrics', 'edit', iso);
  const linked = pilot?.pilot.key === 'weld' && canRecord(RESOURCE);
  const link = (filters: Partial<PunchFilters>) => punchListLink({ isoId: iso.id, projectId: text(iso.projectId), ...filters });
  const stat = (label: string, filters: Partial<PunchFilters>, warn = false) => linked ? <Link className={`iso-punch-stat ${warn ? 'warn' : ''}`} to={link(filters)} target="_blank" rel="noreferrer">{label}</Link> : <span className={`iso-punch-stat ${warn ? 'warn' : ''}`}>{label}</span>;
  const phases = [
    { kind: 'Pre-punch' as const, open: counts.prePunchOpen, finished: counts.prePunchFinished, passed: Boolean(counts.prePunchPassed), outstanding: counts.prePunchWarn ?? 0 },
    { kind: 'Punch' as const, open: counts.punchOpen, finished: counts.punchFinished, passed: Boolean(counts.punchPassed), outstanding: counts.punchWarn ?? 0 },
  ];
  async function save(value: string) {
    setBusy(true); setError('');
    try { await api(`/records/isometrics/${iso.id}`, { method: 'PUT', body: JSON.stringify({ punchProgress: value, _version: iso._version }) }); await refresh(); notify('Punch progress saved.'); }
    catch (failure) { setError((failure as Error).message || 'Saving failed.'); } finally { setBusy(false); }
  }
  return <div className="iso-punch" role="group" aria-label="Punch">
    <div className="iso-punch-phases">
      {phases.map(phase => <div key={phase.kind} className="iso-punch-phase" role="group" aria-label={phase.kind}>
        <span className="iso-punch-label">{phase.kind}</span>
        <Badge color={phase.passed ? 'green' : 'amber'}>{phase.passed ? 'Passed' : 'Open'}</Badge>
        {stat(`${phase.open} open`, { punchType: phase.kind })}
        {stat(`${phase.finished} finished`, { punchType: phase.kind, view: 'finished' })}
      </div>)}
    </div>
    <p className="iso-punch-overdue">{stat(`${counts.overdue} overdue`, { due: 'overdue' }, counts.overdue > 0)}</p>
    {phases.map(phase => { const warning = punchPhaseWarning(phase.kind, phase.outstanding); return warning ? <p key={phase.kind} className="iso-hint" role="status"><AlertCircle size={14} aria-hidden="true"/> {warning}</p> : null; })}
    {linked && <div className="iso-punch-buttons"><Link className="btn small" to={link({})} target="_blank" rel="noreferrer">Punch list</Link>{canRecord(RESOURCE, 'insert') && <button type="button" className="btn small primary" onClick={() => setDialog(true)}><Plus size={13} aria-hidden="true"/>Item</button>}</div>}
    <div className="field iso-punch-progress"><label htmlFor={`${id}-progress`}>Punch progress</label>
      <select id={`${id}-progress`} value={punchProgressLabel(iso)} disabled={!editable || busy} onChange={event => void save(event.target.value)}><option value="">Not entered</option>{PUNCH_PROGRESS_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></div>
    {error && <div className="alert error" role="alert"><AlertCircle size={16}/><span>{error}</span></div>}
    {dialog && <PunchDialog isoId={iso.id} onClose={() => setDialog(false)}/>}
  </div>;
}
