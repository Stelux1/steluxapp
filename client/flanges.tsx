import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpDown, Check, ChevronDown, Download, Eye, FileText, Loader2, Pencil, Plus, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react';
import {
  ALIGNMENT_MAX_MM, ALIGNMENT_POINTS, FLANGE_ASSEMBLY_CHECKLIST, FLANGE_COMPLETION_CHECKS, FLANGE_DEFAULT_PAGE_SIZE, FLANGE_DEFAULT_SORT, FLANGE_DETAIL_CARDS, FLANGE_GENERAL_DOCUMENT,
  FLANGE_HARDCOPY_DOCUMENT, FLANGE_LIST_COLUMNS, FLANGE_PAGE_SIZES, FLANGE_PREPARATION_CONTROLS, FLANGE_PROTOCOL_DOCUMENT, FLANGE_STATUSES, METHOD_FIELDS, NO_FLANGE_FILTERS, PASS_NUMBERS, RECORD_INPUT_FIELDS,
  RECORD_PASS_ROWS, SIGNATURE_ROLES, TIGHTENING_METHODS, alignmentDifference, filterFlanges, finalPass, flangeDetailPath, flangeDocumentDeleteRefusal, flangeDocuments, flangeItems, flangeMissingMasterData,
  flangeValidationProposals, gateOpen, flangeMoment, isoFlangeCount, latestRecord, leakTestsNewestFirst, openDeviations, passStressRequired, recordSignatures, registeredPdf, releaseGate, selectedFlanges, sortFlanges, workflowOptions,
  type FlangeFilters, type FlangeItem, type SignatureRole,
} from '../shared/flanges.ts';
import type { Row } from '../shared/types.ts';
import { ApiError, api, apiBlob, apiUrl, formatDate, post } from './api.ts';
import { ArchiveRecordDialog } from './archive-record.tsx';
import { Badge, Dropdown, EmptyState, Modal, SearchInput, TableScroll } from './components.tsx';
import { activeRows, useWorkspace } from './context.tsx';
import { RecordEditor } from './dialogs.tsx';
import { FlangeLabelsPdfButton, FlangeReportPdfButton, PdfDocumentButton } from './pdf-documents.tsx';
import { usePilot } from './pilot.tsx';
import { TablePage } from './records.tsx';
import { SignaturePad } from './signatures.tsx';

/** Flange Management: the generic table where the profile has no pilots, the dedicated page where it does. */
export function FlangesPage() {
  const { hasFeature } = useWorkspace();
  return hasFeature('pilots') ? <FlangeManagement/> : <TablePage resourceKey="flanges"/>;
}

/** The list, also shown under the detail page (`embedded`: no page heading of its own). */
function FlangeManagement({ embedded = false }: { embedded?: boolean }) {
  const { rows, canRecord, notify } = useWorkspace(); const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isoId = embedded ? '' : params.get('isoId') || '';
  const [filters, setFilters] = useState<FlangeFilters>({ ...NO_FLANGE_FILTERS });
  const [open, setOpen] = useState(false), [page, setPage] = useState(0), [size, setSize] = useState(FLANGE_DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState(FLANGE_DEFAULT_SORT);
  const [editor, setEditor] = useState<Row | 'new' | null>(null), [deleting, setDeleting] = useState<Row | null>(null), [documents, setDocuments] = useState<Row | null>(null);
  const [ticked, setTicked] = useState<string[]>([]), [hiddenColumns, setHiddenColumns] = useState<string[]>(() => FLANGE_LIST_COLUMNS.filter(column => column.hidden).map(column => column.key));
  const items = useMemo(() => flangeItems(activeRows(rows, 'flanges'), activeRows(rows, 'isometrics'), activeRows(rows, 'projects')), [rows]);
  const shown = useMemo(() => sortFlanges(filterFlanges(items, { ...filters, isoId }), sort.key, sort.dir), [items, filters, isoId, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / size)), current = Math.min(page, pages - 1);
  const visible = shown.slice(current * size, (current + 1) * size);
  const projects = activeRows(rows, 'projects');
  const columns = FLANGE_LIST_COLUMNS.filter(column => !hiddenColumns.includes(column.key));
  // What Export, Report and Print labels act on: the ticked flanges that are still in the list.
  const chosen = useMemo(() => selectedFlanges(shown, ticked), [shown, ticked]), chosenIds = chosen.map(item => item.row.id);
  const pageIds = visible.map(item => item.row.id), allTicked = pageIds.length > 0 && pageIds.every(id => chosenIds.includes(id));
  const checkAll = useRef<HTMLInputElement>(null);
  useEffect(() => { if (checkAll.current) checkAll.current.indeterminate = !allTicked && pageIds.some(id => chosenIds.includes(id)); });
  const tick = (ids: string[], on: boolean) => setTicked(old => on ? [...new Set([...old, ...ids])] : old.filter(id => !ids.includes(id)));
  const isoRow = rows.isometrics?.find(row => row.id === isoId);
  const filterCount = [filters.projectId, filters.finished, isoId].filter(Boolean).length;
  const change = (patch: Partial<FlangeFilters>) => { setFilters(old => ({ ...old, ...patch })); setPage(0); };
  const clearIso = () => { const next = new URLSearchParams(params); next.delete('isoId'); setParams(next, { replace: true }); setPage(0); };
  const sortBy = (key: string) => { setSort(old => ({ key, dir: old.key === key && old.dir === 'asc' ? 'desc' : 'asc' })); setPage(0); };

  if (!canRecord('flanges')) return <EmptyState title="This area is restricted" description="Your permission profile does not include flange records."/>;
  const creatable = canRecord('flanges', 'insert');
  /** Export: the ticked flanges as an Excel workbook from the server (which checks the export right per flange). */
  async function exportXlsx() {
    try {
      const blob = await apiBlob(`/flanges-export?ids=${encodeURIComponent(chosenIds.join(','))}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `flanges-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click(); URL.revokeObjectURL(url);
      notify(`${chosen.length} flange${chosen.length === 1 ? '' : 's'} exported.`);
    } catch (failure) { notify((failure as Error).message); }
  }
  const clear = () => { setFilters({ ...NO_FLANGE_FILTERS }); clearIso(); };
  const actions = <div className="heading-actions">
    {canRecord('flanges', 'export') && <button className="btn" onClick={() => void exportXlsx()} disabled={!chosen.length} title={chosen.length ? undefined : 'Tick at least one flange first.'}><Download size={16}/>Export</button>}
    <FlangeReportPdfButton ids={chosenIds}/>
    <FlangeLabelsPdfButton ids={chosenIds}/>
    <button className={`btn ${open || filterCount ? 'active-filter' : ''}`} aria-expanded={open} aria-controls="flange-filters" onClick={() => setOpen(v => !v)}><SlidersHorizontal size={16}/>Filter{filterCount > 0 && <span className="count-pill">{filterCount}</span>}</button>
    {creatable && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add flange</button>}
  </div>;

  return <div className={embedded ? 'flanges-page flanges-embedded' : 'page records-page flanges-page'}>
    {embedded ? <div className="flange-section-heading"><h2>Flanges<span className="heading-count">{items.length}</span></h2>{actions}</div>
      : <div className="page-heading"><div><div className="eyebrow">WELD CORE · RELEASES</div><h1>Flange Management<span className="heading-count">{items.length}</span></h1><p>Bolted connections per isometric: bolting, tightening, inspection and commissioning.</p></div>{actions}</div>}
    <div className="table-card">
      {open && <div id="flange-filters" className="filters-panel" role="group" aria-label="Flange filters">
        <div className="field"><label htmlFor="flange-project">Project</label><select id="flange-project" value={filters.projectId} onChange={e => change({ projectId: e.target.value })}><option value="">All</option>{projects.map(row => <option key={row.id} value={row.id}>{String(row.internnumber || row.description)}</option>)}</select></div>
        <div className="field"><label htmlFor="flange-finished">Finished?</label><select id="flange-finished" value={filters.finished} onChange={e => change({ finished: e.target.value as FlangeFilters['finished'] })}><option value="">--------</option><option>No</option><option>Yes</option></select></div>
      </div>}
      <div className="table-toolbar"><SearchInput value={filters.query} onChange={value => change({ query: value })} placeholder="Search flanges…"/><div className="toolbar-right"><Dropdown trigger={<span className="btn small">Columns<ChevronDown size={12}/></span>} menuClassName="column-picker"><button onClick={() => setHiddenColumns(FLANGE_LIST_COLUMNS.filter(column => column.hidden).map(column => column.key))}>Reset to default columns</button>{FLANGE_LIST_COLUMNS.map(column => <label key={column.key}><input type="checkbox" checked={!hiddenColumns.includes(column.key)} disabled={columns.length === 1 && columns[0].key === column.key} onChange={event => setHiddenColumns(old => event.target.checked ? old.filter(key => key !== column.key) : [...old, column.key])}/>{column.label}</label>)}</Dropdown></div></div>
      {isoId && <div className="applied-filters" aria-label="Applied filters"><span>Filtered by</span><button onClick={clearIso} aria-label="Remove the isometric filter">Isometric {String(isoRow?.isoNo || '')}<X size={12}/></button></div>}
      {shown.length > 0 && <TableScroll><table className="data-table"><thead><tr>{columns.map(column => <th key={column.key} aria-sort={sort.key === column.key ? sort.dir === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" className="flange-sort" onClick={() => sortBy(column.key)}>{column.label}<ArrowUpDown size={12} className={sort.key === column.key ? 'sort-active' : ''} aria-hidden="true"/></button></th>)}<th className="actions-cell">Options</th><th className="select-cell"><input ref={checkAll} type="checkbox" title="Select all" aria-label="Select all flanges on this page" checked={allTicked} onChange={event => tick(pageIds, event.target.checked)}/></th></tr></thead>
        <tbody>{visible.map(item => <FlangeRow key={item.row.id} item={item} columns={columns} ticked={chosenIds.includes(item.row.id)} onTick={on => tick([item.row.id], on)} onView={() => navigate(flangeDetailPath(item.row.id))} onEdit={() => setEditor(item.row)} onDocuments={() => setDocuments(item.row)} onDelete={() => setDeleting(item.row)}/>)}</tbody></table></TableScroll>}
      {!shown.length && (items.length
        ? <EmptyState title="No flanges match your search or filters" description="Try another search or clear your filters." action={<button className="btn" onClick={clear}>Clear search & filters</button>}/>
        : <EmptyState title="No flanges yet" description="Add the first flange of an isometric to start tracking its tightening and inspection." action={creatable ? <button className="btn primary" onClick={() => setEditor('new')}><Plus size={16}/>Add flange</button> : undefined}/>)}
      <div className="table-footer"><span role="status" aria-live="polite">{shown.length ? `${current * size + 1}–${Math.min((current + 1) * size, shown.length)}` : '0'} of {shown.length} flanges</span><div><span>Rows per page</span><select aria-label="Rows per page" value={size} onChange={e => { setSize(Number(e.target.value)); setPage(0); }}>{FLANGE_PAGE_SIZES.map(n => <option key={n}>{n}</option>)}</select>
        <button className="btn small" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><span>{current + 1} / {pages}</span><button className="btn small" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button></div></div>
    </div>
    {editor && <RecordEditor resourceKey="flanges" record={editor === 'new' ? undefined : editor} defaults={isoId ? { isoId } : {}} onClose={() => setEditor(null)}/>}
    {deleting && <ArchiveRecordDialog resourceKey="flanges" record={deleting} onClose={() => setDeleting(null)}/>}
    {documents && <FlangeDocuments flange={documents} onClose={() => setDocuments(null)}/>}
  </div>;
}

function FlangeRow({ item, columns, ticked, onTick, onView, onEdit, onDocuments, onDelete }: { item: FlangeItem; columns: typeof FLANGE_LIST_COLUMNS; ticked: boolean; onTick: (on: boolean) => void; onView: () => void; onEdit: () => void; onDocuments: () => void; onDelete: () => void }) {
  const { canRecord } = useWorkspace(); const name = String(item.row.flange_id || 'flange');
  return <tr className={ticked ? 'row-selected' : undefined}>{columns.map(column => <td key={column.key}>{column.key === 'status' ? <Badge>{item.status}</Badge> : column.key === 'flange_id' ? <button className="record-link" onClick={onView}>{String(column.value(item)) || '—'}</button> : column.value(item) === '' ? '—' : column.value(item)}</td>)}
    <td className="actions-cell"><div className="flange-options">
      <button className="icon-btn" aria-label={`View flange ${name}`} title="View" onClick={onView}><Eye size={16}/></button>
      {canRecord('flanges', 'edit', item.row) && <button className="icon-btn" aria-label={`Edit flange ${name}`} title="Edit" onClick={onEdit}><Pencil size={16}/></button>}
      <button className="icon-btn" aria-label={`Documents of flange ${name}`} title="Documents" onClick={onDocuments}><FileText size={16}/></button>
      {canRecord('flanges', 'delete', item.row) && <button className="icon-btn" aria-label={`Delete flange ${name}`} title="Delete" onClick={onDelete}><Trash2 size={16}/></button>}
    </div></td>
    <td className="select-cell"><input type="checkbox" aria-label={`Select flange ${name}`} checked={ticked} onChange={event => onTick(event.target.checked)}/></td></tr>;
}

/* ------------------------------------------------------------------------------------------------ shared helpers */
const text = (value: unknown) => String(value ?? '').trim();
const dateTime = (value: unknown) => { const raw = flangeMoment(value); return raw ? `${formatDate(raw.slice(0, 10))} ${raw.slice(11, 16)}`.trim() : '—'; };
/** Opens a PDF of an API route in a new tab (errors are shown where the button is). */
async function openPdf(path: string) {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
/** A small form that posts to a record action and refreshes the workspace; shows the refusal at the form. */
function useAction() {
  const { refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({});
  async function run(call: () => Promise<unknown>, done: string, after?: () => void) {
    setBusy(true); setError(''); setFields({});
    try { await call(); await refresh(); notify(done); after?.(); return true; }
    catch (failure) { setError((failure as Error).message); setFields((failure as ApiError).fields || {}); return false; }
    finally { setBusy(false); }
  }
  return { busy, error, fields, run, setError };
}
function FormProblem({ error }: { error: string }) { return error ? <div className="alert error" role="alert">{error}</div> : null; }
function Field({ id, label, error, required, children, wide }: { id: string; label: string; error?: string; required?: boolean; children: ReactNode; wide?: boolean }) {
  return <div className={`field${wide ? ' full-width' : ''}`}><label htmlFor={id}>{label}{required && <span className="required"> *</span>}</label>{children}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}

/* ------------------------------------------------------------------------------------------------ detail page */
/** The flange detail page (row View): master data, validation, workflow and release gate, the assembly record and its registrations. */
export function FlangeDetailPage() {
  const { flangeId = '' } = useParams(); const { rows, canRecord, hasFeature } = useWorkspace();
  if (!hasFeature('pilots')) return <EmptyState title="Page not found" description="Choose a page from the navigation to continue."/>;
  if (!canRecord('flanges')) return <EmptyState title="This area is restricted" description="Your permission profile does not include flange records."/>;
  const flange = rows.flanges?.find(row => row.id === flangeId && !row._archived);
  if (!flange) return <div className="page"><EmptyState title="This flange could not be found" description="It may have been deleted, or it belongs to a main project you cannot open." action={<Link className="btn" to="/welding/flanges"><ArrowLeft size={15}/>Back</Link>}/></div>;
  return <FlangeDetail key={flange.id} flange={flange}/>;
}

function FlangeDetail({ flange }: { flange: Row }) {
  const { rows, canRecord } = useWorkspace();
  const item = flangeItems([flange], activeRows(rows, 'isometrics'), activeRows(rows, 'projects'), rows.sites || [])[0];
  const editable = canRecord('flanges', 'edit', flange);
  const gate = releaseGate(rows, flange.id);
  // After the QA/QC sign-off the server refuses new passes, bolts, leak tests, labels and deviations (sec2-005): their forms are hidden.
  const latest = latestRecord(rows.flange_records, flange.id), evidenceOpen = !(latest && recordSignatures(rows.flange_signatures, latest.id)['QA/QC']);
  const [editing, setEditing] = useState(false);
  return <div className="page flange-detail">
    <div className="page-heading"><div><div className="eyebrow">WELD CORE · RELEASES · FLANGE MANAGEMENT</div><h1>Flange ID: {text(flange.flange_id) || '—'}</h1><p>{[item.projectName, item.isoNo].filter(Boolean).join(' · ')}</p></div>
      <div className="heading-actions">
        <PdfDocumentButton document="flange-labels" report="pdf-flanges" params={{ ids: flange.id }} label="Print QR label" title="Print QR label" subtitle={`Flange ${text(flange.flange_id) || item.isoNo}`} submit="Go" fileName={`Flange-label-${text(flange.flange_id) || flange.id}`}/>
        {editable && <button className="btn" onClick={() => setEditing(true)}><Pencil size={15}/>Edit</button>}
        <Link className="btn" to="/welding/flanges"><ArrowLeft size={15}/>Back</Link>
      </div></div>
    <section className="panel flange-panel" aria-labelledby="flange-master"><h2 id="flange-master" className="sr-only">Master data</h2>
      <div className="flange-cards">{FLANGE_DETAIL_CARDS.map(card => <div key={card.title} className="flange-card"><h3>{card.title}</h3><dl>{card.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{label === 'Status' ? <Badge>{value(item)}</Badge> : value(item) || '-'}</dd></div>)}</dl></div>)}</div>
      {flangeMissingMasterData(item) && <p className="flange-info" role="note">This flange contains missing master data. Use Edit to complete it or create a reviewed suggestion from an isometric/BOM source.</p>}
    </section>
    <ValidationPreview flange={flange}/>
    <Workflow flange={flange} gate={gate} editable={editable}/>
    <AssemblyRecord flange={flange} item={item} editable={editable}/>
    <PassRegistration flange={flange} editable={editable && evidenceOpen}/>
    <BoltRegistration flange={flange} editable={editable && evidenceOpen}/>
    <Signatures flange={flange} editable={editable}/>
    <ProtocolPdf flange={flange} editable={editable}/>
    <Registrations flange={flange} editable={editable && evidenceOpen}/>
    <FlangeManagement embedded/>
    {editing && <RecordEditor resourceKey="flanges" record={flange} onClose={() => setEditing(false)}/>}
  </div>;
}

function Section({ title, help, children, id }: { title: string; help?: string; children: ReactNode; id: string }) {
  return <section className="panel flange-panel" aria-labelledby={id}><h2 id={id}>{title}</h2>{help && <p className="field-hint flange-help">{help}</p>}{children}</section>;
}

function ValidationPreview({ flange }: { flange: Row }) {
  const { rows } = useWorkspace(); const [shown, setShown] = useState(false);
  const proposals = flangeValidationProposals(flange, rows.isometrics?.find(row => row.id === flange.isoId));
  return <Section id="flange-validation" title="BOM/isometric validation" help="Compare the flange data with the linked isometric and BOM. Preview the proposals first; flange master data changes only when you edit the flange.">
    <button type="button" className="btn" onClick={() => setShown(true)}>Preview proposals</button>
    {shown && <div className="flange-preview" role="status"><p className="flange-info">Preview only: no master data was changed.</p>
      <TableScroll><table className="data-table"><thead><tr><th>Field</th><th>Proposal</th><th>Source</th></tr></thead><tbody>{proposals.length ? proposals.map(proposal => <tr key={proposal.field}><td>{proposal.label}</td><td>{proposal.proposal}</td><td>{proposal.source}</td></tr>) : <tr><td colSpan={3}>No eligible proposals found.</td></tr>}</tbody></table></TableScroll></div>}
  </Section>;
}

function GateList({ gate }: { gate: ReturnType<typeof releaseGate> }) {
  return <div className={`flange-gate ${gateOpen(gate) ? 'open' : ''}`} role="status" aria-label="Release gate"><strong>Release gate:</strong><ul>{gate.map(check => <li key={check.label} className={check.ok ? 'ok' : 'missing'}>{check.ok ? <Check size={14} aria-label="Done"/> : <X size={14} aria-label="Not done"/>}<span>{check.label}</span>{!check.ok && check.reason && <small>{check.reason}</small>}</li>)}</ul></div>;
}

function Workflow({ flange, gate, editable }: { flange: Row; gate: ReturnType<typeof releaseGate>; editable: boolean }) {
  const { rows } = useWorkspace(); const id = useId(); const action = useAction();
  const options = workflowOptions(gate);
  const [status, setStatus] = useState(options[0]), [reason, setReason] = useState('');
  const events = activeRows(rows, 'flange_events').filter(row => row.flangeId === flange.id).sort((a, b) => b._createdAt.localeCompare(a._createdAt));
  const submit = (event: FormEvent) => { event.preventDefault(); void action.run(() => post(`/flanges/${flange.id}/workflow`, { to_status: status, reason }), 'Workflow action saved.', () => setReason('')); };
  return <Section id="flange-workflow" title="Workflow">
    <GateList gate={gate}/>
    {editable && <form className="flange-inline-form" onSubmit={submit}><FormProblem error={action.error}/>
      <Field id={`${id}-status`} label="Action" error={action.fields.to_status}><select id={`${id}-status`} value={status} onChange={e => setStatus(e.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></Field>
      <Field id={`${id}-reason`} label="Reason" error={action.fields.reason}><input id={`${id}-reason`} value={reason} maxLength={5000} onChange={e => setReason(e.target.value)} placeholder="Reason"/></Field>
      <button className="btn primary" disabled={action.busy}>{action.busy && <Loader2 size={15} className="spin"/>}Save workflow action</button></form>}
    <p className="field-hint">QC release requires the Flanges commit right.</p>
    {events.length ? <ul className="flange-events">{events.map(event => <li key={event.id}><Badge>{text(event.to_status)}</Badge><span>{dateTime(event._createdAt)}</span>{text(event.reason) && <span>{text(event.reason)}</span>}</li>)}</ul> : <p className="flange-muted">No workflow events have been registered yet.</p>}
  </Section>;
}

/** Form values of the record: the latest saved record, or the master targets for a first record. */
function recordStart(flange: Row, record: Row | undefined): Record<string, unknown> {
  const start: Record<string, unknown> = Object.fromEntries(RECORD_INPUT_FIELDS.map(name => [name, record?.[name] ?? '']));
  if (!record) { for (const n of RECORD_PASS_ROWS) start[`pass${n}_target`] = text(flange.target_moment_nm); start.torque_wrench_model = text(flange.torque_wrench_type); }
  for (const name of RECORD_INPUT_FIELDS) if (/^check_|^checklist_|^lmra_/.test(name)) start[name] = record?.[name] === true;
  return start;
}

function AssemblyRecord({ flange, item, editable }: { flange: Row; item: FlangeItem; editable: boolean }) {
  const { rows } = useWorkspace(); const id = useId(); const action = useAction();
  const record = latestRecord(rows.flange_records, flange.id);
  const locked = Boolean(record && recordSignatures(rows.flange_signatures, record.id)['QA/QC']);
  const [values, setValues] = useState(() => recordStart(flange, record));
  const set = (name: string, value: unknown) => setValues(old => ({ ...old, [name]: value }));
  const project = activeRows(rows, 'projects').find(row => row.id === item.projectId), site = rows.sites?.find(row => row.id === project?.siteId);
  const method = text(values.tightening_method);
  const disabled = !editable || locked || action.busy;
  const input = (name: string, label: string, extra: { type?: string; max?: number; wide?: boolean } = {}) => <Field id={`${id}-${name}`} label={label} error={action.fields[name]} wide={extra.wide}><input id={`${id}-${name}`} type={extra.type || 'text'} value={String(values[name] ?? '')} maxLength={extra.max} disabled={disabled} onChange={e => set(name, e.target.value)}/></Field>;
  const box = (name: string, label: string) => <label key={name} className="flange-check"><input type="checkbox" checked={values[name] === true} disabled={disabled} onChange={e => set(name, e.target.checked)}/>{label}</label>;
  const select = (name: string, label: string, options: readonly string[]) => <Field id={`${id}-${name}`} label={label} error={action.fields[name]}><select id={`${id}-${name}`} value={String(values[name] ?? '')} disabled={disabled} onChange={e => set(name, e.target.value)}><option value="">-</option>{options.map(option => <option key={option}>{option}</option>)}</select></Field>;
  const submit = (event: FormEvent) => { event.preventDefault(); void action.run(() => post(`/flanges/${flange.id}/record`, values), 'Record saved.'); };
  const preview = async () => { action.setError(''); try { await openPdf(`/flanges/${flange.id}/protocol-preview`); } catch (failure) { action.setError((failure as Error).message); } };
  return <Section id="flange-record" title="Flange joint assembly record" help="Master data is supplied from the flange register and is not changed by this record.">
    <div className="flange-cards compact">
      <div className="flange-card"><h3>Project / Iso</h3><dl>{[['Project', item.projectName], ['Iso number', item.isoNo], ['Flange ID', text(flange.flange_id)], ['Procedure No.', text(site?.flangeProcedureNo)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '-'}</dd></div>)}</dl></div>
      <div className="flange-card"><h3>Bolting</h3><dl>{[['Target Moment (Nm)', text(flange.target_moment_nm)], ['Torque Wrench ID', text(flange.torque_wrench_id)], ['Gasket Type', text(flange.gasket_type)], ['No of Studbolts', text(flange.aantal_studbolts)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '-'}</dd></div>)}</dl></div>
    </div>
    {locked && <p className="flange-info" role="note">QA/QC has signed this record. It can no longer be changed.</p>}
    {record && !locked && recordSignatures(rows.flange_signatures, record.id).Technician && <p className="flange-info" role="note">Saving the record again needs a new technician signature.</p>}
    <form onSubmit={submit} className="flange-record-form"><FormProblem error={action.error}/>
      <fieldset><legend>Preparation and inspection controls</legend><p className="field-hint">Complete these checks before tightening or tensioning starts.</p>
        <div className="flange-checks">{FLANGE_PREPARATION_CONTROLS.map(([key, label]) => box(`check_${key}`, label))}</div></fieldset>
      <div className="form-grid flange-grid">
        {input('assembly_date', 'Assembly date', { type: 'date' })}
        {select('tightening_method', 'Tightening method', TIGHTENING_METHODS)}
        {input('tool_id', 'Tool ID', { max: 100 })}{input('operator_name', 'Operator', { max: 150 })}
        {(METHOD_FIELDS[method] || []).map(name => <div key={name} className="flange-method">{input(name, { method_equipment_id: 'Machine / tool ID', method_pressure_a: 'Hydraulic pressure A (bar)', method_pressure_b: 'Hydraulic pressure B (bar)', method_tension_kn: 'Bolt tension (kN)' }[name]!, { max: name === 'method_equipment_id' ? 100 : 30 })}</div>)}
        {input('torque_wrench_manufacturer', 'Torque wrench manufacturer', { max: 100 })}{input('torque_wrench_model', 'Torque wrench model', { max: 100 })}{input('calibration_certificate', 'Calibration certificate no.', { max: 100 })}
        {select('new_bolts_used', 'New bolts used', ['Yes', 'No'])}{select('washers_used', 'Washers used', ['Yes', 'No'])}
      </div>
      {box('lmra_confirmed', 'LMRA completed before assembly.')}
      <h3>Tightening passes</h3>
      <TableScroll><table className="data-table flange-form-table"><thead><tr><th>#</th><th>Target (Nm)</th><th>Actual (Nm)</th><th>Result</th></tr></thead><tbody>{RECORD_PASS_ROWS.map(n => <tr key={n}><td>{n}</td>
        {['target', 'actual'].map(part => <td key={part}><input aria-label={`Pass ${n} ${part} (Nm)`} value={String(values[`pass${n}_${part}`] ?? '')} maxLength={30} disabled={disabled} onChange={e => set(`pass${n}_${part}`, e.target.value)} aria-invalid={Boolean(action.fields[`pass${n}_${part}`])}/></td>)}
        <td><select aria-label={`Pass ${n} result`} value={String(values[`pass${n}_result`] ?? '')} disabled={disabled} onChange={e => set(`pass${n}_result`, e.target.value)}><option value="">-</option><option>OK</option><option value="NOK">NOK</option></select></td></tr>)}</tbody></table></TableScroll>
      <h3>Completion checks</h3>
      <TableScroll><table className="data-table flange-form-table"><thead><tr><th>Check</th><th>Date</th><th>Time</th></tr></thead><tbody>{FLANGE_COMPLETION_CHECKS.map(([key, label]) => <tr key={key}><th scope="row">{label}</th>
        <td><input type="date" aria-label={`${label} date`} value={String(values[`${key}_date`] ?? '')} disabled={disabled} onChange={e => set(`${key}_date`, e.target.value)}/></td>
        <td><input type="time" aria-label={`${label} time`} value={String(values[`${key}_time`] ?? '')} disabled={disabled} onChange={e => set(`${key}_time`, e.target.value)} aria-invalid={Boolean(action.fields[`${key}_time`])}/></td></tr>)}</tbody></table></TableScroll>
      <fieldset><legend>Assembly checklist</legend><div className="flange-checks">{FLANGE_ASSEMBLY_CHECKLIST.map(([key, label]) => box(`checklist_${key}`, label))}</div></fieldset>
      <div className="form-grid flange-grid">{input('installer_name', 'Installer name', { max: 150 })}{input('installer_initials', 'Installer initials', { max: 20 })}</div>
      <h3>Alignment and deviation</h3>
      <p className="field-hint">Measured from the bolt-up side: point 1 at the top (12 o’clock), 2 at the right (3 o’clock), 3 at the bottom (6 o’clock), 4 at the left (9 o’clock). Max. deviation: {ALIGNMENT_MAX_MM} mm.</p>
      <TableScroll><table className="data-table flange-form-table"><thead><tr><th>Point</th><th>Before (mm)</th><th>After (mm)</th><th>Difference (mm)</th></tr></thead><tbody>{ALIGNMENT_POINTS.map(n => { const difference = alignmentDifference(values[`alignment_before_${n}`], values[`alignment_after_${n}`]); return <tr key={n}><td>{n}</td>
        {['before', 'after'].map(part => <td key={part}><input inputMode="decimal" aria-label={`Point ${n} ${part} (mm)`} value={String(values[`alignment_${part}_${n}`] ?? '')} maxLength={30} disabled={disabled} onChange={e => set(`alignment_${part}_${n}`, e.target.value)} aria-invalid={Boolean(action.fields[`alignment_${part}_${n}`])}/></td>)}
        <td className={difference !== null && difference > ALIGNMENT_MAX_MM ? 'flange-over' : undefined}>{difference === null ? '-' : difference.toFixed(3)}</td></tr>; })}</tbody></table></TableScroll>
      <div className="form-grid flange-grid">
        {input('deviation_reference', 'Deviation reference', { max: 100 })}
        <Field id={`${id}-nc`} label="Non-conformities / remarks" wide error={action.fields.non_conformity_notes}><textarea id={`${id}-nc`} rows={3} maxLength={5000} value={String(values.non_conformity_notes ?? '')} disabled={disabled} onChange={e => set('non_conformity_notes', e.target.value)}/></Field>
        {input('test_result', 'Test result', { max: 40 })}
        <Field id={`${id}-notes`} label="Note" wide error={action.fields.notes}><textarea id={`${id}-notes`} rows={3} maxLength={5000} value={String(values.notes ?? '')} disabled={disabled} onChange={e => set('notes', e.target.value)}/></Field>
      </div>
      <div className="flange-form-actions">{editable && !locked && <button className="btn primary" disabled={action.busy}>{action.busy && <Loader2 size={15} className="spin"/>}Save record</button>}
        <button type="button" className="btn" onClick={() => void preview()}><FileText size={15}/>Open PDF preview</button>
        {record && <span className="flange-muted">Saved {dateTime(record._createdAt)} by the latest save.</span>}</div>
    </form>
  </Section>;
}

const nowLocal = () => { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); };

function PassRegistration({ flange, editable }: { flange: Row; editable: boolean }) {
  const { rows } = useWorkspace(); const id = useId(); const action = useAction();
  const empty = () => ({ pass_number: '1', torque_nm: '', stress_value: '', tool_id: '', operator_name: '', performed_at: nowLocal() });
  const [values, setValues] = useState<Record<string, string>>(empty);
  const passes = activeRows(rows, 'flange_passes').filter(row => row.flangeId === flange.id).sort((a, b) => Number(a.pass_number) - Number(b.pass_number) || a._createdAt.localeCompare(b._createdAt));
  const final = finalPass(rows.flange_passes, flange.id);
  const set = (name: string, value: string) => setValues(old => ({ ...old, [name]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); void action.run(() => post(`/flanges/${flange.id}/passes`, values), 'Pass recorded.', () => setValues(empty())); };
  const input = (name: string, label: string, type = 'text', extra: Record<string, unknown> = {}, required = true) => <Field id={`${id}-${name}`} label={label} required={required} error={action.fields[name]}><input id={`${id}-${name}`} type={type} required={required} value={values[name]} onChange={e => set(name, e.target.value)} {...extra}/></Field>;
  return <Section id="flange-passes" title="Validated tightening-pass registration" help="Each entry is append-only and checked by the server against the flange master targets (tolerance ±5%). A pass outside the tolerance is kept with its result.">
    {editable && <form className="form-grid flange-grid" onSubmit={submit}><FormProblem error={action.error}/>
      <Field id={`${id}-pass`} label="Pass" required error={action.fields.pass_number}><select id={`${id}-pass`} value={values.pass_number} onChange={e => set('pass_number', e.target.value)}>{PASS_NUMBERS.map(n => <option key={n} value={n}>Pass {n}</option>)}</select></Field>
      {input('torque_nm', 'Measured torque (Nm)', 'number', { min: 0.001, step: 0.001 })}{input('stress_value', 'Measured stress', 'number', { min: 0.001, step: 0.001 }, passStressRequired(flange))}
      {input('tool_id', 'Tool ID', 'text', { maxLength: 100 })}{input('operator_name', 'Operator', 'text', { maxLength: 150 })}{input('performed_at', 'Performed at', 'datetime-local')}
      <div className="flange-form-actions"><button className="btn primary" disabled={action.busy}>{action.busy && <Loader2 size={15} className="spin"/>}Record pass</button></div></form>}
    <TableScroll><table className="data-table"><thead><tr><th>Pass</th><th>Measured torque (Nm)</th><th>Measured stress</th><th>Tool ID</th><th>Operator</th><th>Performed at</th><th>Result</th></tr></thead>
      <tbody>{passes.length ? passes.map(pass => <tr key={pass.id} className={pass.id === final?.id ? 'flange-final' : undefined}><td>Pass {text(pass.pass_number)}</td><td>{text(pass.torque_nm)}</td><td>{text(pass.stress_value)}</td><td>{text(pass.tool_id)}</td><td>{text(pass.operator_name)}</td><td>{dateTime(pass.performed_at)}</td><td><Badge color={pass.result === 'OK' ? 'green' : 'red'}>{text(pass.result)}</Badge></td></tr>) : <tr><td colSpan={7} className="flange-muted">No tightening pass has been recorded yet.</td></tr>}</tbody></table></TableScroll>
  </Section>;
}

function BoltRegistration({ flange, editable }: { flange: Row; editable: boolean }) {
  const { rows } = useWorkspace(); const id = useId(); const action = useAction();
  const passes = activeRows(rows, 'flange_passes').filter(row => row.flangeId === flange.id).sort((a, b) => Number(a.pass_number) - Number(b.pass_number) || a._createdAt.localeCompare(b._createdAt));
  const bolts = activeRows(rows, 'flange_bolts').filter(row => row.flangeId === flange.id).sort((a, b) => a._createdAt.localeCompare(b._createdAt));
  const empty = () => ({ passId: passes.at(-1)?.id ?? '', bolt_no: '', torque_nm: '', stress_value: '', deviation_reference: '', deviation_reason: '' });
  const [values, setValues] = useState<Record<string, string>>(empty);
  const set = (name: string, value: string) => setValues(old => ({ ...old, [name]: value }));
  const passLabel = (pass?: Row) => pass ? `Pass ${text(pass.pass_number)} · ${dateTime(pass.performed_at)}` : '-';
  const submit = (event: FormEvent) => { event.preventDefault(); void action.run(() => post(`/flanges/${flange.id}/bolts`, { ...values, passId: values.passId || passes.at(-1)?.id }), 'Bolt recorded.', () => setValues(empty())); };
  return <Section id="flange-bolts" title="Optional per-bolt registration" help="Link each optional bolt measurement to a recorded tightening pass. A failed measurement needs a deviation reference and reason and opens that deviation.">
    {!passes.length ? <p className="flange-muted">Record a tightening pass before optional bolt measurements.</p> : editable && <form className="form-grid flange-grid" onSubmit={submit}><FormProblem error={action.error}/>
      <Field id={`${id}-pass`} label="Pass" required error={action.fields.passId}><select id={`${id}-pass`} value={values.passId || passes.at(-1)!.id} onChange={e => set('passId', e.target.value)}>{passes.map(pass => <option key={pass.id} value={pass.id}>{passLabel(pass)}</option>)}</select></Field>
      <Field id={`${id}-bolt`} label="Bolt no." required error={action.fields.bolt_no}><input id={`${id}-bolt`} type="number" min={1} max={Number(flange.aantal_studbolts) || undefined} step={1} required value={values.bolt_no} onChange={e => set('bolt_no', e.target.value)}/></Field>
      <Field id={`${id}-torque`} label="Measured torque (Nm)" required error={action.fields.torque_nm}><input id={`${id}-torque`} type="number" min={0.001} step={0.001} required value={values.torque_nm} onChange={e => set('torque_nm', e.target.value)}/></Field>
      <Field id={`${id}-stress`} label="Measured stress" required error={action.fields.stress_value}><input id={`${id}-stress`} type="number" min={0.001} step={0.001} required value={values.stress_value} onChange={e => set('stress_value', e.target.value)}/></Field>
      <Field id={`${id}-ref`} label="Deviation reference" error={action.fields.deviation_reference}><input id={`${id}-ref`} maxLength={100} value={values.deviation_reference} onChange={e => set('deviation_reference', e.target.value)}/></Field>
      <Field id={`${id}-reason`} label="Deviation reason" error={action.fields.deviation_reason}><input id={`${id}-reason`} maxLength={5000} value={values.deviation_reason} onChange={e => set('deviation_reason', e.target.value)}/></Field>
      <div className="flange-form-actions"><button className="btn primary" disabled={action.busy}>{action.busy && <Loader2 size={15} className="spin"/>}Record bolt</button></div></form>}
    {bolts.length > 0 && <TableScroll><table className="data-table"><thead><tr><th>Pass</th><th>Bolt no.</th><th>Measured torque (Nm)</th><th>Measured stress</th><th>Result</th><th>Deviation reference</th></tr></thead>
      <tbody>{bolts.map(bolt => <tr key={bolt.id}><td>{passLabel(passes.find(pass => pass.id === bolt.passId))}</td><td>{text(bolt.bolt_no)}</td><td>{text(bolt.torque_nm)}</td><td>{text(bolt.stress_value)}</td><td><Badge color={bolt.result === 'OK' ? 'green' : 'red'}>{text(bolt.result)}</Badge></td><td>{text(bolt.deviation_reference) || '-'}</td></tr>)}</tbody></table></TableScroll>}
  </Section>;
}

const STATEMENTS: Record<SignatureRole, string> = { Technician: 'I confirm that I performed and verified this assembly record.', 'QA/QC': 'I confirm this protocol as QA/QC or customer QA/QC.' };
function Signatures({ flange, editable }: { flange: Row; editable: boolean }) {
  const { rows } = useWorkspace();
  const record = latestRecord(rows.flange_records, flange.id), signed = recordSignatures(rows.flange_signatures, record?.id);
  return <Section id="flange-signatures" title="Signatures" help="The executing user signs as technician; a user with the Flanges commit right then signs as QA/QC or customer QA/QC. Both signatures belong to the latest saved record.">
    <div className="flange-signatures">{SIGNATURE_ROLES.map(role => <SignatureForm key={role} flange={flange} role={role} record={record} signed={signed[role]} ready={role === 'Technician' || Boolean(signed.Technician)} editable={editable}/>)}</div>
  </Section>;
}
function SignatureForm({ flange, role, record, signed, ready, editable }: { flange: Row; role: SignatureRole; record?: Row; signed?: Row; ready: boolean; editable: boolean }) {
  const id = useId(); const action = useAction();
  const [method, setMethod] = useState<'Saved signature' | 'Drawn signature'>('Saved signature'), [statement, setStatement] = useState(false), [note, setNote] = useState('');
  const [drawing, setDrawing] = useState<(() => Promise<Blob>) | null>(null);
  const title = role === 'QA/QC' ? 'QA/QC signature' : 'Technician signature';
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!statement) { action.setError('Confirmation is required.'); return; }
    const body = new FormData(); body.set('role', role); body.set('method', method); body.set('statement', 'true'); if (role === 'QA/QC') body.set('qc_note', note);
    if (method === 'Drawn signature') { if (!drawing) { action.setError('Draw your signature first.'); return; } body.set('file', await drawing(), 'signature.png'); }
    void action.run(() => api(`/flanges/${flange.id}/signatures`, { method: 'POST', body }), role === 'QA/QC' ? 'QC sign-off saved.' : 'Signed as technician.');
  }
  if (signed) return <div className="flange-signature done"><strong>{title}</strong><p><Check size={14} aria-hidden="true"/>Signed by {text(signed.signer_name)} on {dateTime(signed._createdAt)} ({text(signed.method).toLowerCase()}).</p>{text(signed.qc_note) && <p className="flange-muted">QC note: {text(signed.qc_note)}</p>}</div>;
  if (!editable) return <div className="flange-signature"><strong>{title}</strong><p className="flange-muted">Not signed yet.</p></div>;
  return <form className="flange-signature" onSubmit={e => void submit(e)}><strong>{title}</strong><FormProblem error={action.error}/>
    {!record && <p className="flange-muted">Save the record before signing it.</p>}
    {record && !ready && <p className="flange-muted">The technician signs the record first.</p>}
    <Field id={`${id}-method`} label="Signature"><select id={`${id}-method`} value={method} onChange={e => setMethod(e.target.value as typeof method)}><option value="Saved signature">Use my saved signature</option><option value="Drawn signature">Draw signature now</option></select></Field>
    {method === 'Drawn signature' && <SignaturePad label={`${title} drawing area`} onChange={read => setDrawing(() => read)}/>}
    <label className="flange-check"><input type="checkbox" checked={statement} onChange={e => setStatement(e.target.checked)}/>{STATEMENTS[role]}</label>
    {role === 'QA/QC' && <Field id={`${id}-note`} label="QC note" error={action.fields.qc_note}><input id={`${id}-note`} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="QC note"/></Field>}
    <button className={`btn ${role === 'QA/QC' ? 'success' : 'primary'}`} disabled={action.busy || !record || !ready}>{action.busy && <Loader2 size={15} className="spin"/>}{role === 'QA/QC' ? 'QC sign-off' : 'Sign as technician'}</button>
  </form>;
}

function ProtocolPdf({ flange, editable }: { flange: Row; editable: boolean }) {
  const { rows } = useWorkspace(); const action = useAction();
  const record = latestRecord(rows.flange_records, flange.id), signed = recordSignatures(rows.flange_signatures, record?.id), pdf = registeredPdf(rows.attachments, flange.id, record?.id);
  const open = async () => { action.setError(''); try { await openPdf(`/flanges/${flange.id}/protocol`); } catch (failure) { action.setError((failure as Error).message); } };
  return <Section id="flange-pdf" title="Protocol PDF" help="After the QA/QC sign-off the protocol is stored once as an immutable PDF. Its hash is checked every time it is opened.">
    <FormProblem error={action.error}/>
    {pdf ? <div className="flange-form-actions"><span><Check size={14} aria-hidden="true"/> Registered {dateTime(pdf._createdAt)}</span><button type="button" className="btn" onClick={() => void open()}><FileText size={15}/>Open PDF</button></div>
      : signed.Technician && signed['QA/QC'] ? (editable ? <button type="button" className="btn primary" disabled={action.busy} onClick={() => void action.run(() => post(`/flanges/${flange.id}/protocol-pdf`, {}), 'Protocol PDF generated.')}>{action.busy && <Loader2 size={15} className="spin"/>}Generate immutable PDF</button> : <p className="flange-muted">The protocol PDF has not been generated yet.</p>)
      : <p className="flange-muted">The PDF can be generated after the technician and QA/QC signatures of the latest record.</p>}
  </Section>;
}

function Registrations({ flange, editable }: { flange: Row; editable: boolean }) {
  const { rows } = useWorkspace();
  const tests = leakTestsNewestFirst(rows.flange_leak_tests, flange.id), labels = activeRows(rows, 'flange_labels').filter(row => row.flangeId === flange.id);
  const deviations = activeRows(rows, 'flange_deviations').filter(row => row.flangeId === flange.id).sort((a, b) => b._createdAt.localeCompare(a._createdAt)), open = openDeviations(rows.flange_deviations, flange.id);
  return <Section id="flange-registrations" title="Leak test, label and deviations">
    {editable && <div className="flange-registrations"><LeakTestForm flange={flange}/><LabelForm flange={flange}/><DeviationForm flange={flange}/></div>}
    <h3>Leak tests</h3>
    {tests.length ? <TableScroll><table className="data-table"><thead><tr><th>Type</th><th>Pressure</th><th>Result</th><th>Tested at</th></tr></thead><tbody>{tests.map((test, index) => <tr key={test.id}><td>{text(test.test_type)}{index === 0 && <small className="flange-muted"> (latest)</small>}</td><td>{[test.pressure_value, test.pressure_unit].map(text).filter(Boolean).join(' ') || '-'}</td><td><Badge color={test.result === 'Passed' ? 'green' : 'red'}>{text(test.result)}</Badge></td><td>{dateTime(test.tested_at)}</td></tr>)}</tbody></table></TableScroll> : <p className="flange-muted">No leak test has been recorded yet.</p>}
    <h3>Physical labels and QR</h3>
    {labels.length ? <TableScroll><table className="data-table"><thead><tr><th>Label number</th><th>QR token</th><th>Scan reference</th><th>Registered</th></tr></thead><tbody>{labels.map(label => <tr key={label.id}><td>{text(label.label_number)}</td><td>{text(label.qr_token)}</td><td>{text(label.scan_reference) || '-'}</td><td>{dateTime(label._createdAt)}</td></tr>)}</tbody></table></TableScroll> : <p className="flange-muted">No label has been registered yet.</p>}
    <h3>Deviations{open.length > 0 && <span className="count-pill">{open.length} open</span>}</h3>
    {deviations.length ? <TableScroll><table className="data-table"><thead><tr><th>Reference</th><th>Event</th><th>Reason</th><th>Recorded</th></tr></thead><tbody>{deviations.map(row => <tr key={row.id}><td>{text(row.reference)}</td><td><Badge color={row.event === 'Restored' ? 'green' : 'red'}>{text(row.event)}</Badge></td><td>{text(row.reason)}</td><td>{dateTime(row._createdAt)}</td></tr>)}</tbody></table></TableScroll> : <p className="flange-muted">No deviation has been opened.</p>}
    <p className="field-hint">Operational records are append-only and do not overwrite flange master data.</p>
  </Section>;
}
function LeakTestForm({ flange }: { flange: Row }) {
  const id = useId(); const action = useAction();
  const empty = () => ({ test_type: '', pressure_value: '', pressure_unit: '', result: 'Passed', tested_at: nowLocal() });
  const [values, setValues] = useState<Record<string, string>>(empty); const set = (name: string, value: string) => setValues(old => ({ ...old, [name]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); void action.run(() => post(`/flanges/${flange.id}/leak-tests`, values), 'Leak test saved.', () => setValues(empty())); };
  return <form className="flange-mini-form" onSubmit={submit}><strong>Leak test</strong><FormProblem error={action.error}/>
    <Field id={`${id}-type`} label="Type" required error={action.fields.test_type}><input id={`${id}-type`} required maxLength={50} value={values.test_type} onChange={e => set('test_type', e.target.value)}/></Field>
    <div className="flange-pair"><Field id={`${id}-pressure`} label="Pressure" error={action.fields.pressure_value}><input id={`${id}-pressure`} maxLength={50} value={values.pressure_value} onChange={e => set('pressure_value', e.target.value)}/></Field>
      <Field id={`${id}-unit`} label="Unit" error={action.fields.pressure_unit}><input id={`${id}-unit`} maxLength={20} placeholder="bar" value={values.pressure_unit} onChange={e => set('pressure_unit', e.target.value)}/></Field></div>
    <Field id={`${id}-result`} label="Result" error={action.fields.result}><select id={`${id}-result`} value={values.result} onChange={e => set('result', e.target.value)}><option>Passed</option><option>Failed</option></select></Field>
    <Field id={`${id}-at`} label="Tested at" required error={action.fields.tested_at}><input id={`${id}-at`} type="datetime-local" required value={values.tested_at} onChange={e => set('tested_at', e.target.value)}/></Field>
    <button className="btn primary" disabled={action.busy}>Save</button></form>;
}
function LabelForm({ flange }: { flange: Row }) {
  const id = useId(); const action = useAction();
  const empty = () => ({ label_number: '', qr_token: '', scan_reference: '' });
  const [values, setValues] = useState<Record<string, string>>(empty); const set = (name: string, value: string) => setValues(old => ({ ...old, [name]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); void action.run(() => post(`/flanges/${flange.id}/labels`, values), 'Label registered.', () => setValues(empty())); };
  return <form className="flange-mini-form" onSubmit={submit}><strong>Physical label and QR</strong><FormProblem error={action.error}/>
    <Field id={`${id}-number`} label="Label number" required error={action.fields.label_number}><input id={`${id}-number`} required maxLength={100} value={values.label_number} onChange={e => set('label_number', e.target.value)}/></Field>
    <Field id={`${id}-token`} label="QR token" required error={action.fields.qr_token}><input id={`${id}-token`} required maxLength={128} value={values.qr_token} onChange={e => set('qr_token', e.target.value)}/></Field>
    <Field id={`${id}-scan`} label="Scan reference" error={action.fields.scan_reference}><input id={`${id}-scan`} maxLength={255} value={values.scan_reference} onChange={e => set('scan_reference', e.target.value)}/></Field>
    <button className="btn primary" disabled={action.busy}>Save</button></form>;
}
function DeviationForm({ flange }: { flange: Row }) {
  const id = useId(); const action = useAction();
  const [values, setValues] = useState({ reference: '', reason: '' }); const set = (name: string, value: string) => setValues(old => ({ ...old, [name]: value }));
  const send = (event: 'Opened' | 'Restored') => void action.run(() => post(`/flanges/${flange.id}/deviations`, { ...values, event }), event === 'Opened' ? 'Deviation opened.' : 'Restoration recorded.', () => setValues({ reference: '', reason: '' }));
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; send(submitter?.value === 'Restored' ? 'Restored' : 'Opened'); };
  return <form className="flange-mini-form" onSubmit={submit}><strong>Deviation / restoration</strong><FormProblem error={action.error}/>
    <Field id={`${id}-ref`} label="Reference" required error={action.fields.reference}><input id={`${id}-ref`} required maxLength={100} value={values.reference} onChange={e => set('reference', e.target.value)}/></Field>
    <Field id={`${id}-reason`} label="Reason" required error={action.fields.reason}><input id={`${id}-reason`} required maxLength={5000} value={values.reason} onChange={e => set('reason', e.target.value)}/></Field>
    <div className="flange-pair"><button className="btn danger" value="Opened" disabled={action.busy}>Open deviation</button><button className="btn success" value="Restored" disabled={action.busy}>Record restoration</button></div></form>;
}

/* ------------------------------------------------------------------------------------------------ documents dialog */
/** Documents (row file icon): a general attachment, the signed hard-copy protocol, and the flange's files with delete. */
export function FlangeDocuments({ flange, onClose }: { flange: Row; onClose: () => void }) {
  const { rows, canRecord } = useWorkspace(); const id = useId();
  const files = flangeDocuments(rows.attachments, flange.id);
  const general = useAction(), hardcopy = useAction(), removal = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [copy, setCopy] = useState<{ signer_role: string; signer_name: string; signed_date: string; reference: string; file: File | null }>({ signer_role: 'Technician', signer_name: '', signed_date: '', reference: '', file: null });
  const [confirming, setConfirming] = useState<Row | null>(null);
  const editable = canRecord('flanges', 'edit', flange), attachable = canRecord('flanges', 'import', flange);
  const addGeneral = (event: FormEvent) => {
    event.preventDefault(); if (!file) { general.setError('Choose a file.'); return; }
    const body = new FormData(); body.set('file', file); body.set('entityType', 'flanges'); body.set('entityId', flange.id); body.set('documentType', FLANGE_GENERAL_DOCUMENT);
    void general.run(() => api('/files', { method: 'POST', body }), 'Document added.', () => setFile(null));
  };
  const addHardcopy = (event: FormEvent) => {
    event.preventDefault(); if (!copy.file) { hardcopy.setError('Choose the signed protocol file.'); return; }
    const body = new FormData(); for (const name of ['signer_role', 'signer_name', 'signed_date', 'reference'] as const) body.set(name, copy[name]); body.set('hard_copy_file', copy.file);
    void hardcopy.run(() => api(`/flanges/${flange.id}/hardcopy`, { method: 'POST', body }), 'Signed hard-copy uploaded.', () => setCopy(old => ({ ...old, signer_name: '', signed_date: '', reference: '', file: null })));
  };
  const kind = (row: Row) => row.documentType === FLANGE_PROTOCOL_DOCUMENT ? 'Registered protocol PDF' : row.documentType === FLANGE_HARDCOPY_DOCUMENT ? `Signed hard-copy (${text(row.note)}) · awaiting QA/QC validation` : '';
  return <Modal title="Documents" subtitle={`Flange ${text(flange.flange_id) || ''}`.trim()} onClose={onClose} wide><div className="modal-body flange-documents">
    {attachable && <form className="flange-doc-panel" onSubmit={addGeneral}><strong>General attachment</strong><p className="field-hint">Certificates, datasheets, photos or correspondence.</p><FormProblem error={general.error}/>
      <div className="flange-pair"><label className="btn"><Upload size={15}/>{file ? file.name : 'Choose file'}<input className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.docx,.txt" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label><button className="btn primary" disabled={general.busy}>Add</button></div></form>}
    {editable && <form className="flange-doc-panel success" onSubmit={addHardcopy}><strong>Signed hard-copy protocol</strong><p className="field-hint">Linked to the flange protocol. It needs QA/QC validation before it can support release.</p><FormProblem error={hardcopy.error}/>
      <div className="form-grid flange-grid">
        <Field id={`${id}-role`} label="Signing role" error={hardcopy.fields.signer_role}><select id={`${id}-role`} value={copy.signer_role} onChange={e => setCopy(old => ({ ...old, signer_role: e.target.value }))}>{SIGNATURE_ROLES.map(role => <option key={role}>{role}</option>)}</select></Field>
        <Field id={`${id}-name`} label="Signer name" required error={hardcopy.fields.signer_name}><input id={`${id}-name`} required maxLength={150} value={copy.signer_name} onChange={e => setCopy(old => ({ ...old, signer_name: e.target.value }))}/></Field>
        <Field id={`${id}-date`} label="Signing date" required error={hardcopy.fields.signed_date}><input id={`${id}-date`} type="date" required value={copy.signed_date} onChange={e => setCopy(old => ({ ...old, signed_date: e.target.value }))}/></Field>
        <Field id={`${id}-ref`} label="Document reference" required error={hardcopy.fields.reference}><input id={`${id}-ref`} required maxLength={100} value={copy.reference} onChange={e => setCopy(old => ({ ...old, reference: e.target.value }))}/></Field>
        <Field id={`${id}-file`} label="Signed protocol file" required error={hardcopy.fields.hard_copy_file}><input id={`${id}-file`} type="file" required accept=".pdf,image/jpeg,image/png,image/webp" onChange={e => setCopy(old => ({ ...old, file: e.target.files?.[0] ?? null }))}/></Field>
      </div><button className="btn success" disabled={hardcopy.busy}>Upload signed hard-copy</button></form>}
    <FormProblem error={removal.error}/>
    <TableScroll><table className="data-table"><thead><tr><th>#</th><th>File</th><th><span className="sr-only">Delete</span></th></tr></thead>
      <tbody>{files.length ? files.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td><a className="text-link" href={apiUrl(`/files/${row.id}`)} target="_blank" rel="noreferrer">{text(row.name)}</a>{kind(row) && <small className="flange-muted"> · {kind(row)}</small>}</td>
        <td>{editable && !flangeDocumentDeleteRefusal(row) && <button type="button" className="icon-btn" aria-label={`Delete ${text(row.name)}`} title="Delete" onClick={() => setConfirming(row)}><Trash2 size={15}/></button>}</td></tr>)
        : <tr><td colSpan={3} className="flange-muted">No documents yet.</td></tr>}</tbody></table></TableScroll>
  </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button></div>
    {confirming && <Modal title="Delete" onClose={() => setConfirming(null)}><div className="modal-body"><p>Are you sure?</p><p className="flange-muted">{text(confirming.name)}</p></div>
      <div className="modal-footer"><button type="button" className="btn" onClick={() => setConfirming(null)}>Cancel</button><button type="button" className="btn danger" disabled={removal.busy} onClick={() => void removal.run(() => post(`/flanges/${flange.id}/documents/${confirming.id}/archive`, {}), 'Document deleted.', () => setConfirming(null))}>Delete</button></div></Modal>}
  </Modal>;
}

/** Card on the isometric page: how many flanges the isometric has, by status, and the link to the list. */
export function IsoFlangesCard({ isoId }: { isoId: string }) {
  const { rows, canRecord } = useWorkspace(); const pilot = usePilot();
  if (!rows.flanges || !canRecord('flanges') || (pilot && pilot.pilot.key !== 'weld')) return null;
  const count = isoFlangeCount(rows.flanges, isoId);
  const own = flangeItems(activeRows(rows, 'flanges').filter(row => row.isoId === isoId), [], []);
  const byStatus = FLANGE_STATUSES.map(status => [status, own.filter(item => item.status === status).length] as const).filter(([, n]) => n > 0);
  return <section className="panel iso-flanges" aria-label="Flanges of this isometric"><div><strong>Flanges</strong><span className="count-pill">{count}</span>{byStatus.length > 0 && <small>{byStatus.map(([status, n]) => `${n} ${status.toLowerCase()}`).join(' · ')}</small>}</div>
    <Link className="text-link" to={`/welding/flanges?isoId=${encodeURIComponent(isoId)}`}>{count ? 'Open in Flange Management' : 'Add in Flange Management'}</Link></section>;
}
