import { useCallback, useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, Check, Download, FileText, Loader2, LogOut, MapPin, PackageCheck, PencilLine, Play, PenLine, Printer, RefreshCw, Send, SlidersHorizontal, Undo2, Upload, X } from 'lucide-react';
import { materialRecord } from '../shared/materials.ts';
import { DEFAULT_PERCENT_RANGE, EXECUTION_EXPORT_COLUMNS, EXECUTION_TYPES, PERCENT_CHIPS, PICKLIST_ARCHIVE_COLUMNS, PICKLIST_NOTE_MAX, START_CONFIRM, UNDO_EXECUTION_CONFIRM, archiveDefaultRange, canStartAt, defaultMaterialGroup, executionBoard, executionTypePhaseId, laydownContent, laydownHistory, materialCurrentLabel, materialGroups, materialHistory, materialServiceRows, pickListReports, requestArchive, spoolHistory, spoolNames, spoolRequestNumbers, spoolRows, undoRefusal, type ArchiveRequest, type BoardRow, type IsoStatus, type MaterialServiceFilters, type MaterialServiceRow, type PickListReport, type SpoolFilters, type SpoolRow } from '../shared/mto-logistics.ts';
import type { Row } from '../shared/types.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { api, apiBlob, apiUrl, formatDate, formatNumber, post, type ApiError } from './api.ts';
import { Badge, EmptyState, FieldInput, Modal, Progress, SearchInput, TableScroll } from './components.tsx';
import { PdfDocumentButton, PickListPdfButton } from './pdf-documents.tsx';
import { SignaturePad } from './signatures.tsx';
import { exportTable, saveBlob, useTableRights } from './table-export.ts';

const today = () => new Date().toISOString().slice(0, 10);
const includes = (values: unknown[], query: string) => !query || values.some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase()));
function Restricted({ what }: { what: string }) { return <EmptyState title="This area is restricted" description={`Your profile does not include ${what}.`}/>; }
function Heading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>{children && <div className="heading-actions">{children}</div>}</div>;
}
function Failure({ message, onClose }: { message: string; onClose: () => void }) {
  return message ? <div className="alert error mto-alert" role="alert"><AlertCircle size={18}/><span>{message}</span><button className="icon-btn" aria-label="Dismiss message" onClick={onClose}><X size={14}/></button></div> : null;
}
const failure = (error: unknown) => (error as ApiError).message || 'The action could not be completed.';

// ---- Isometric execution ---------------------------------------------------------------------------------------------

/** CSV, Excel and Print of a table (the reference's table buttons). The server writes the files and checks the Export right of the table's area; Print follows the area's Print box. */
function TableButtons({ table, name, header, lines, onError }: { table: string; name: string; header: readonly string[]; lines: unknown[][]; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(''); const { canExport, canPrint } = useTableRights();
  async function save(format: 'csv' | 'xlsx') { setBusy(format); try { await exportTable(table, format, header, lines, name); } catch (problem) { onError(failure(problem)); } finally { setBusy(''); } }
  return <div className="table-utilities">{canExport(table) && <><button type="button" className="btn subtle small" onClick={() => void save('csv')} disabled={!lines.length || Boolean(busy)}>{busy === 'csv' ? <Loader2 size={14} className="spin"/> : <Download size={14}/>}CSV</button>
    <button type="button" className="btn subtle small" onClick={() => void save('xlsx')} disabled={!lines.length || Boolean(busy)}>{busy === 'xlsx' ? <Loader2 size={14} className="spin"/> : <Download size={14}/>}Excel</button></>}
    {canPrint(table) && <button type="button" className="btn subtle small" onClick={() => window.print()} aria-label="Print"><Printer size={14}/>Print</button>}</div>;
}
const AUTO_REFRESH = [{ value: 0, label: 'Auto-refresh: Off' }, { value: 60, label: '1 min' }, { value: 300, label: '5 min' }, { value: 600, label: '10 min' }];
const PAGING_KEY = 'isoExecutionPagingMode';
const readPaging = () => { try { return window.localStorage.getItem(PAGING_KEY) === 'paged'; } catch { return false; } };
const clock = (date: Date) => [date.getHours(), date.getMinutes(), date.getSeconds()].map(part => String(part).padStart(2, '0')).join(':');

export function IsometricExecution() {
  const { rows, label, canRecord, canRun, refresh, notify, openRecord } = useWorkspace();
  const [type, setType] = useState<string>(EXECUTION_TYPES[0]);
  // The board opens on 70 - 100 % with the "All" chip shown active, as the reference does.
  const [range, setRange] = useState<{ from: number; to: number }>({ ...DEFAULT_PERCENT_RANGE }); const [chip, setChip] = useState('All');
  const [prio, setPrio] = useState(''); const [query, setQuery] = useState('');
  const [paged, setPaged] = useState(readPaging); const [page, setPage] = useState(0);
  const [interval, setIntervalSeconds] = useState(300); const [updated, setUpdated] = useState(() => new Date());
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState<BoardRow | null>(null);
  const phaseId = executionTypePhaseId(rows, type);
  const board = useMemo(() => executionBoard(rows, { phaseId, from: range.from, to: range.to, prio }), [rows, phaseId, range, prio]);
  const reload = useCallback(async () => { setRefreshing(true); try { await refresh(); setUpdated(new Date()); } finally { setRefreshing(false); } }, [refresh]);
  // Auto-refresh (reference: Off / 1 / 5 / 10 min, 5 min by default) re-reads the live figures.
  useEffect(() => { if (!interval) return; const timer = window.setInterval(() => void reload(), interval * 1000); return () => window.clearInterval(timer); }, [interval, reload]);
  if (!canRecord('iso_materials') || !canRecord('stock') || !canRecord('reservations')) return <Restricted what="isometric execution"/>;
  const list = board.filter(entry => includes([label('projects', entry.iso.projectId), entry.iso.isoNo, entry.iso.pipingClass, entry.priority, entry.iso.drawingNo, entry.iso.chemicalClean, `${entry.percent}%`], query));
  const size = paged ? 50 : list.length || 1; const pages = Math.max(1, Math.ceil(list.length / size)); const current = Math.min(page, pages - 1);
  const shown = paged ? list.slice(current * size, current * size + size) : list;
  const reservedOf = (isoId: string) => activeRows(rows, 'reservations').filter(row => row.status === 'Reserved' && row.isoId === isoId);
  async function act(key: 'reserve-iso' | 'release-reservation', iso: Row) {
    setBusy(iso.id + key); setError('');
    try {
      if (key === 'reserve-iso') { await post('/actions/reserve-iso', { isoId: iso.id, date: today() }); notify(`Materials reserved for ${iso.isoNo}.`); }
      else { await post('/actions/release-reservation', { reservationIds: reservedOf(iso.id).map(row => row.id), date: today() }); notify(`Reservations of ${iso.isoNo} released.`); }
      await refresh();
    } catch (problem) { setError(failure(problem)); } finally { setBusy(''); }
  }
  const lines = list.map(entry => [label('projects', entry.iso.projectId), entry.iso.isoNo, entry.iso.pipingClass || '-', entry.priority, entry.iso.drawingNo || '-', entry.iso.chemicalClean || '-', `${entry.percent}%`]);
  const togglePaging = () => { const next = !paged; setPaged(next); setPage(0); try { window.localStorage.setItem(PAGING_KEY, next ? 'paged' : 'all'); } catch { /* the choice is only kept for this visit */ } };
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · PROJECTS DATA" title="Isometric execution">
      <PdfDocumentButton document="reserved-materials" report="pdf-reserved-materials" params={{}} label="Reserved materials" title="Print" submit="Go" fileName="Reserved-materials" options={[{ name: 'grouped', label: 'Group by materials', kind: 'checkbox' }]}/>
      <button className="btn" onClick={() => void reload()} disabled={refreshing}>{refreshing ? <Loader2 size={15} className="spin"/> : <RefreshCw size={15}/>}Refresh all</button>
    </Heading>
    <section className="panel execution-panel">
      <div className="table-card-top execution-head"><div><strong role="status">{list.length} isometric(s) found</strong> <span className="muted">{clock(updated)}</span></div>
        <div className="execution-meta"><span>Type: <strong>{type}</strong></span><span>Percent range: <strong>{range.from} - {range.to}%</strong></span>
          <div className="select-wrap"><select aria-label="Auto-refresh interval" value={interval} onChange={event => setIntervalSeconds(Number(event.target.value))}>{AUTO_REFRESH.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <button type="button" className="btn small" aria-pressed={paged} onClick={togglePaging} title="Switch between all rows and 50 per page">{paged ? '50/page' : 'All'}</button></div></div>
      <div className="execution-chips">
        <div role="group" aria-label="Type"><span className="field-label">Type</span>{EXECUTION_TYPES.map(value => <button type="button" key={value} className={`btn small${type === value ? ' active-filter' : ''}`} aria-pressed={type === value} onClick={() => { setType(value); setPage(0); }}>{value}</button>)}</div>
        <div role="group" aria-label="Material status"><span className="field-label">%</span>{PERCENT_CHIPS.map(option => <button type="button" key={option.label} className={`btn small${chip === option.label ? ' active-filter' : ''}`} aria-pressed={chip === option.label} onClick={() => { setChip(option.label); setRange({ from: option.from, to: option.to }); setPage(0); }}>{option.label}</button>)}</div>
        <div role="group" aria-label="Priority"><span className="field-label">Priority</span>{['Prio-1', 'Prio-2', 'Prio-3'].map(value => <button type="button" key={value} className={`btn small${prio === value ? ' active-filter' : ''}`} aria-pressed={prio === value} onClick={() => { setPrio(old => old === value ? '' : value); setPage(0); }}>{value}</button>)}</div>
        <TableButtons table="iso-execution" name="isometric-execution" header={EXECUTION_EXPORT_COLUMNS} lines={lines} onError={setError}/>
        <SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder="Search"/></div>
      <Failure message={error} onClose={() => setError('')}/>
      {!phaseId && <div className="table-footer"><span>No operation phase is named {type}. Add it under Operation phases to use this type.</span></div>}
      <TableScroll><table className="data-table execution-table"><thead><tr><th>Project</th><th>ISO</th><th>Piping class</th><th>Priority</th><th>Drawing no. 1</th><th>Chemical clean</th><th>Mat.status</th><th className="actions-cell">Options</th></tr></thead>
        <tbody>{shown.map(entry => { const iso = entry.iso; const reserved = reservedOf(iso.id);
          return <tr key={iso.id}><td>{label('projects', iso.projectId)}</td>
            <td><button className="record-link" onClick={() => openRecord('isometrics', iso.id)}>{String(iso.isoNo)}</button></td>
            <td>{String(iso.pipingClass || '-')}</td><td>{entry.priority}</td><td>{String(iso.drawingNo || '-')}</td><td>{String(iso.chemicalClean || '-')}</td>
            <td><div className="execution-status"><StatusBar status={entry.status}/><button type="button" className="icon-btn" aria-label={`Recalculate material status of ${iso.isoNo}`} title="Recalculate material status" disabled={refreshing} onClick={() => void reload()}><RefreshCw size={14}/></button></div></td>
            <td className="actions-cell"><div className="mto-options execution-options">
              {canRun('start-iso') && canStartAt(entry.percent) && <button className="btn primary small" disabled={Boolean(busy)} onClick={() => { setError(''); setStarting(entry); }}><Play size={14}/>Start</button>}
              {canRun('reserve-iso') && <button className="btn small" disabled={Boolean(busy)} onClick={() => void act('reserve-iso', iso)} title="Reserve materials for this isometric.">{busy === iso.id + 'reserve-iso' ? <Loader2 size={14} className="spin"/> : <PackageCheck size={14}/>}Reserve</button>}
              {canRun('release-reservation') && reserved.length > 0 && <button className="btn subtle small" disabled={Boolean(busy)} onClick={() => void act('release-reservation', iso)} title="Give the reserved quantities of this isometric back to the free stock">{busy === iso.id + 'release-reservation' && <Loader2 size={14} className="spin"/>}Release</button>}</div></td></tr>; })}</tbody></table></TableScroll>
      {!list.length && <EmptyState title="There are no isometrics ready for execution" description="Choose another type, percentage or priority. An isometric started from this type returns here when its execution is undone in the Pick List archive."/>}
      <div className="table-footer"><span>Showing {list.length ? current * size + 1 : 0} to {current * size + shown.length} of {list.length} entries</span>
        {paged && pages > 1 && <span className="row-buttons"><button type="button" className="btn small" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><button type="button" className="btn small" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button></span>}</div>
    </section>
    {starting && <StartDialog entry={starting} phaseId={phaseId} onClose={() => setStarting(null)}/>}</div>;
}
/** Start (vendor manual 3-23): "You are about to start isometric. Are you sure?", a Note stored on the pick list, Start / Cancel. */
function StartDialog({ entry, phaseId, onClose }: { entry: BoardRow; phaseId: string; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const noteId = useId();
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await post<{ records?: Row[] }>('/actions/start-iso', { isoId: entry.iso.id, phaseId, date: today(), note }); await refresh(); notify(`${entry.iso.isoNo} started. Pick List ${String(result.records?.[0]?.reportNo ?? '')} is in the Pick List archive.`); onClose(); }
    catch (problem) { setError(failure(problem)); } finally { setBusy(false); }
  }
  return <Modal title="Isometric execution" subtitle={`${String(entry.iso.isoNo)} · ${entry.percent}%`} onClose={onClose}><form onSubmit={event => void submit(event)}><div className="modal-body">
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    <div className="alert info" role="note"><span>{START_CONFIRM}</span></div>
    <div className="form-grid"><div className="field full-width"><label htmlFor={noteId}>Note</label><textarea id={noteId} value={note} maxLength={PICKLIST_NOTE_MAX} onChange={event => setNote(event.target.value)}/></div></div></div>
    <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <Play size={15}/>}Start</button></div></form></Modal>;
}
function StatusBar({ status }: { status?: IsoStatus }) {
  if (!status || status.percent === null) return <span className="muted">No materials</span>;
  const color = status.percent >= 100 ? 'green' : status.percent >= 70 ? 'amber' : 'red';
  return <div className="mto-status" title={status.lines.filter(line => line.shortage > 0).map(line => `${line.material.materialNo}: short ${formatNumber(line.shortage, 3)}`).join('\n') || 'All materials covered'}><Progress value={status.percent} color={color}/><strong>{status.percent}%</strong></div>;
}

// ---- Pick List archive -----------------------------------------------------------------------------------------------

export function PickListArchive() {
  const { rows, label, canRecord, openRecord } = useWorkspace(); const { canExport } = useTableRights();
  const range = useMemo(() => archiveDefaultRange(today()), []);
  // From Date / To Date open on the last 30 days up to the end of the month; Filter applies them (reference GET form).
  const first = { projectId: '', from: range.from, to: range.to };
  const [draft, setDraft] = useState(first); const [applied, setApplied] = useState(first); const [query, setQuery] = useState('');
  const [open, setOpen] = useState(''); const [error, setError] = useState('');
  if (!canRecord('picklists')) return <Restricted what="the pick list archive"/>;
  const isoNo = (id: string) => String(rows.isometrics?.find(iso => iso.id === id)?.isoNo || 'Unavailable isometric');
  const all = pickListReports(rows, applied);
  const reports = all.filter(report => includes([formatStamp(report.stamp), report.reportNo, label('projects', report.projectId), isoNo(report.isoId), report.taken ? 'Yes' : 'No'], query));
  const lines = reports.map(report => [formatStamp(report.stamp), report.reportNo, label('projects', report.projectId), isoNo(report.isoId), report.taken ? 'Yes' : 'No']);
  const current = open ? pickListReports(rows).find(report => report.reportNo === open) : undefined;
  // The Pick list archive export (reference topbar link): an Excel file the server writes after the Export right of area 21; it follows the filter that was applied.
  const exportList = async () => { try { saveBlob('pick-list-archive.xlsx', await apiBlob(`/mto/picklist-archive-export?${new URLSearchParams(Object.entries(applied).filter(([, value]) => value) as [string, string][])}`)); } catch (problem) { setError(failure(problem)); } };
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · PROJECTS DATA" title="Pick List archive">{canExport('picklist-archive') && <button className="btn" onClick={() => void exportList()} disabled={!reports.length}><Download size={15}/>Pick list archive export</button>}</Heading>
    <section className="panel execution-panel">
      <form className="execution-scope" onSubmit={event => { event.preventDefault(); setApplied(draft); }}>
        <div className="field"><label htmlFor="picklist-project">Project</label><div className="select-wrap"><select id="picklist-project" value={draft.projectId} onChange={event => setDraft(old => ({ ...old, projectId: event.target.value }))}><option value="">All projects</option>{activeRows(rows, 'projects').map(row => <option key={row.id} value={row.id}>{label('projects', row.id)}</option>)}</select></div></div>
        <div className="field"><label htmlFor="picklist-from">From Date</label><input id="picklist-from" type="date" value={draft.from} max={draft.to || undefined} onChange={event => setDraft(old => ({ ...old, from: event.target.value }))}/></div>
        <div className="field"><label htmlFor="picklist-to">To Date</label><input id="picklist-to" type="date" value={draft.to} min={draft.from || undefined} onChange={event => setDraft(old => ({ ...old, to: event.target.value }))}/></div>
        <button className="btn primary small" type="submit"><SlidersHorizontal size={15}/>Filter</button></form>
      <div className="table-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search"/><TableButtons table="picklist-archive" name="pick-list-archive" header={PICKLIST_ARCHIVE_COLUMNS} lines={lines} onError={setError}/></div>
      <Failure message={error} onClose={() => setError('')}/>
      <TableScroll><table className="data-table execution-table"><thead><tr><th>Date</th><th>Report No.</th><th>Project</th><th>ISO No</th><th>Taken?</th><th className="actions-cell">Options</th></tr></thead>
        <tbody>{reports.map(report => <tr key={report.reportNo}><td>{formatStamp(report.stamp)}</td><td>{report.reportNo}</td><td>{label('projects', report.projectId)}</td>
          <td><button className="record-link" onClick={() => openRecord('isometrics', report.isoId)}>{isoNo(report.isoId)}</button></td><td><Badge color={report.taken ? 'green' : 'amber'}>{report.taken ? 'Yes' : 'No'}</Badge></td>
          <td className="actions-cell"><span className="row-buttons"><PickListPdfButton reportNo={report.reportNo}/><button className="btn small" onClick={() => { setError(''); setOpen(report.reportNo); }} title={`Open Pick List ${report.reportNo}`}><LogOut size={14}/>Issue</button></span></td></tr>)}</tbody></table></TableScroll>
      {!reports.length && <EmptyState title="No data available in table" description="Pick lists appear here when an isometric is started in Isometric execution. Change the dates or the project and press Filter to see more."/>}
      <div className="table-footer"><span>Showing {reports.length ? 1 : 0} to {reports.length} of {reports.length} entries</span><span>Start books the materials out of the inventory; Confirm material take records who took them.</span></div>
    </section>
    {current && <PickListDetail report={current} onClose={() => setOpen('')}/>}
  </div>;
}

/** The detail of one pick list (reference page `picklist-archive&fileid=`): banner, lines, Confirm material take, Edit comment, Undo execution, PDF. */
function PickListDetail({ report, onClose }: { report: PickListReport; onClose: () => void }) {
  const { rows, label, canRun } = useWorkspace();
  const [dialog, setDialog] = useState<'take' | 'edit' | 'undo' | null>(null); const [error, setError] = useState(''); const [query, setQuery] = useState('');
  const phases = new Map(activeRows(rows, 'operation_phases').map(row => [row.id, String(row.name)]));
  const requirements = new Map(activeRows(rows, 'iso_materials').map(row => [row.id, row]));
  const iso = rows.isometrics?.find(row => row.id === report.isoId);
  const total = report.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  const all = report.lines.map(line => { const material = materialRecord(rows, line); const phaseId = requirements.get(String(line.requirementId))?.phaseId;
    return [String(material?.materialGroup ?? ''), String(material?.articleNo ?? ''), String(material?.materialNo ?? 'Unavailable material'), String(material?.dia ?? ''), String(material?.lbs ?? ''), String(material?.description ?? ''), formatNumber(line.quantity, 3), String(material?.uom ?? ''), phaseId ? phases.get(String(phaseId)) ?? '' : '']; });
  const shown = all.filter(cells => includes(cells, query));
  const refusal = undoRefusal(report);
  // One dialog at a time: a confirmation replaces the detail and returns to it when cancelled.
  if (dialog === 'take' || dialog === 'edit') return <PickNoteDialog report={report} mode={dialog} total={total} onClose={() => setDialog(null)}/>;
  if (dialog === 'undo') return <UndoExecutionDialog report={report} onClose={() => setDialog(null)} onDone={onClose}/>;
  return <Modal title={`Pick List ${report.reportNo}`} subtitle={`Project: ${label('projects', report.projectId)} · Iso number: ${String(iso?.isoNo ?? '')}`} onClose={onClose} wide>
    <div className="modal-body"><Failure message={error} onClose={() => setError('')}/>
      <div className="picklist-banner" role="note"><span>Project: <strong>{label('projects', report.projectId)}</strong></span><span>Iso number: <strong>{String(iso?.isoNo ?? '')}</strong></span><span>Date: <strong>{formatStamp(report.stamp)}</strong></span>
        <span>Type: <strong>{report.phaseId ? phases.get(report.phaseId) ?? '—' : '—'}</strong></span><span>Status: <strong>{report.taken ? 'Picked' : 'Open'}</strong></span><span>{report.lines.length} materials, {formatNumber(total, 3)} total qty</span>
        {report.note && <span className="picklist-note">Note: {report.note}</span>}</div>
      <div className="table-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search"/><TableButtons table="picklist" name={`pick-list-${report.reportNo}`} header={PICKLIST_DETAIL_COLUMNS} lines={shown} onError={setError}/></div>
      <TableScroll><table className="data-table"><thead><tr>{PICKLIST_DETAIL_COLUMNS.map(column => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{shown.map((cells, index) => <tr key={index}>{cells.map((cell, column) => <td key={column} className={column === 5 ? 'description-cell' : undefined}>{cell || '-'}</td>)}</tr>)}</tbody></table></TableScroll>
      {!shown.length && <EmptyState title="No data available in table" description={all.length ? 'No line matches the search.' : 'This pick list has no material lines.'}/>}</div>
    <div className="modal-footer">
      {!report.taken && canRun('take-picklist') && <button className="btn primary" onClick={() => setDialog('take')}><Check size={15}/>Confirm material take</button>}
      {report.taken && canRun('picklist-note') && <button className="btn" onClick={() => setDialog('edit')}><PencilLine size={15}/>Edit comment</button>}
      {report.execution && canRun('undo-iso-execution') && <button className="btn" disabled={Boolean(refusal)} title={refusal || 'Reverse this execution pick list'} onClick={() => setDialog('undo')}><Undo2 size={15}/>Undo execution</button>}
      <PickListPdfButton reportNo={report.reportNo}/>
      <button className="btn" onClick={onClose}>Pick List archive</button></div>
  </Modal>;
}
/** Confirm material take (#confirmMaterialTake) and its edit (#materialTakeEdit): one Note, Confirm / Cancel. */
function PickNoteDialog({ report, mode, total, onClose }: { report: PickListReport; mode: 'take' | 'edit'; total: number; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const noteId = useId();
  const [note, setNote] = useState(report.note); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (mode === 'take') { await post('/actions/take-picklist', { reportNo: report.reportNo, date: today(), note }); notify(`Pick List ${report.reportNo} confirmed as taken.`); }
      else { await post('/actions/picklist-note', { reportNo: report.reportNo, note }); notify(`The note of Pick List ${report.reportNo} is saved.`); }
      await refresh(); onClose();
    } catch (problem) { setError(failure(problem)); } finally { setBusy(false); }
  }
  return <Modal title="Confirm material take" subtitle={`Pick List ${report.reportNo}`} onClose={onClose}><form onSubmit={event => void submit(event)}><div className="modal-body">
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    {mode === 'take' && <p>{report.lines.length} materials, total {formatNumber(total, 3)} items. Record who took them in the note.</p>}
    <div className="form-grid"><div className="field full-width"><label htmlFor={noteId}>Note</label><textarea id={noteId} value={note} maxLength={PICKLIST_NOTE_MAX} onChange={event => setNote(event.target.value)}/></div></div></div>
    <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <Check size={15}/>}Confirm</button></div></form></Modal>;
}
/** Undo execution (#undoIsoExecutionPickList): the reference's confirmation, Undo execution / Cancel. */
function UndoExecutionDialog({ report, onClose, onDone }: { report: PickListReport; onClose: () => void; onDone: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await post('/actions/undo-iso-execution', { reportNo: report.reportNo }); await refresh(); notify(`The execution of Pick List ${report.reportNo} is undone.`); onClose(); onDone(); }
    catch (problem) { setError(failure(problem)); setBusy(false); }
  }
  return <Modal title="Undo execution" subtitle={`Pick List ${report.reportNo}`} onClose={onClose}><form onSubmit={event => void submit(event)}><div className="modal-body">
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    <p>{UNDO_EXECUTION_CONFIRM}</p></div>
    <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <Undo2 size={15}/>}Undo execution</button></div></form></Modal>;
}
const PICKLIST_DETAIL_COLUMNS = ['Material group', 'Article No', 'Material No', 'DIA', 'LBS/SCH', 'Description', 'Quantity', 'UOM', 'Type'] as const;

// ---- Service request (spools) ----------------------------------------------------------------------------------------

export function ServiceRequestSpools() {
  const { rows, label, canRecord, canRun, openRecord } = useWorkspace();
  const [applied, setApplied] = useState<SpoolFilters>({}); const [draft, setDraft] = useState<SpoolFilters>({}); const [panel, setPanel] = useState(false); const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [dialog, setDialog] = useState<'service' | 'move' | null>(null); const [history, setHistory] = useState<SpoolRow | null>(null);
  if (!canRecord('spools') || !canRecord('service_requests')) return <Restricted what="spool service requests"/>;
  const all = spoolRows(rows, applied);
  const list = all.filter(entry => includes([entry.spool.name, entry.iso.isoNo, entry.paintSpec, entry.chemicalClean, entry.spool.diameter, label('projects', entry.projectId), entry.location.id ? label(entry.location.type === 'Service' ? 'service_companies' : 'laydowns', entry.location.id) : ''], query));
  const checked = list.filter(entry => selected.includes(entry.spool.id));
  const where = (entry: (typeof list)[number]) => entry.location.id ? <span className={`location-label ${entry.location.type === 'Service' ? 'service' : ''}`}><MapPin size={13}/>{label(entry.location.type === 'Service' ? 'service_companies' : 'laydowns', entry.location.id)}</span> : <span className="muted">—</span>;
  const exportUrl = apiUrl(`/export-spools?${new URLSearchParams(Object.entries(applied).filter(([, value]) => value) as [string, string][])}`);
  const choose = (name: keyof SpoolFilters, value: string) => setDraft(old => ({ ...old, [name]: value }));
  const select = (name: keyof SpoolFilters, title: string, options: [string, string][]) => <div className="field"><label htmlFor={`spool-filter-${name}`}>{title}</label><div className="select-wrap"><select id={`spool-filter-${name}`} value={String(draft[name] ?? '')} onChange={event => choose(name, event.target.value)}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div></div>;
  const text = (name: keyof SpoolFilters, title: string) => <div className="field"><label htmlFor={`spool-filter-${name}`}>{title}</label><input id={`spool-filter-${name}`} type="text" placeholder="..." value={String(draft[name] ?? '')} onChange={event => choose(name, event.target.value)}/></div>;
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · LOGISTIC" title="Service request">
      <button className="btn" aria-expanded={panel} aria-controls="spool-filter-panel" onClick={() => setPanel(open => !open)}><SlidersHorizontal size={15}/>Filter</button>
      {canRecord('spools', 'export') && <a className="btn" href={exportUrl} download><Download size={15}/>Export</a>}</Heading>
    <section className="panel execution-panel">
      {panel && <form id="spool-filter-panel" className="execution-scope" onSubmit={event => { event.preventDefault(); setApplied({ ...draft }); setSelected([]); }}>
        {select('projectId', 'Project', [['', 'All'], ...activeRows(rows, 'projects').map(row => [row.id, label('projects', row.id)] as [string, string])])}
        {select('spoolName', 'Spool', [['', 'All'], ...spoolNames(rows).map(name => [name, name] as [string, string])])}
        {select('show', 'Show', [['all', 'All'], ['hideFinished', 'Hide finished']])}
        {text('paintSpec', 'Paint spec.')}{text('diameter', 'Diameter')}{text('chemicalClean', 'Chemical clean')}
        {select('currently', 'Currently on', [['', '------'], ...activeRows(rows, 'laydowns').map(row => [`Laydown:${row.id}`, `Laydown: ${row.name}`] as [string, string]), ...activeRows(rows, 'service_companies').map(row => [`Service:${row.id}`, `Service: ${row.name}`] as [string, string])])}
        {select('lastReport', 'Request', [['', '------'], ...spoolRequestNumbers(rows).map(number => [number, number] as [string, string])])}
        <button className="btn primary small" type="submit"><Check size={15}/>Filter</button>
        <button className="btn small" type="button" onClick={() => { setDraft({}); setApplied({}); setSelected([]); }}><X size={15}/>Reset</button></form>}
      <div className="table-toolbar"><SearchInput value={query} onChange={value => { setQuery(value); setSelected([]); }} placeholder="Search"/></div>
      {(canRun('service') || canRun('move-spools')) && <div className="logistics-actions">
        {canRun('service') && <button className="btn primary small" disabled={!checked.length} onClick={() => setDialog('service')}><Send size={15}/>Service request</button>}
        {canRun('move-spools') && <button className="btn small" disabled={!checked.length} onClick={() => setDialog('move')}><MapPin size={15}/>Move to laydown</button>}
        <span>{checked.length ? `${checked.length} checked` : 'Check spools to choose their next step.'}</span></div>}
      <TableScroll><table className="data-table execution-table"><thead><tr><th className="select-cell"><input type="checkbox" aria-label="Check all spools in this view" checked={list.length > 0 && list.every(entry => selected.includes(entry.spool.id))} disabled={!list.length} onChange={event => setSelected(event.target.checked ? list.map(entry => entry.spool.id) : [])}/></th>
        <th>Project</th><th>ISO</th><th>Spool</th><th>Diameter</th><th>Paint spec.</th><th>PWHT</th><th>Chemical clean</th><th>Currently on</th><th>Last request</th></tr></thead>
        <tbody>{list.map(entry => <tr key={entry.spool.id}><td className="select-cell"><input type="checkbox" aria-label={`Check spool ${entry.spool.name} of ${entry.iso.isoNo}`} checked={selected.includes(entry.spool.id)} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, entry.spool.id])] : old.filter(id => id !== entry.spool.id))}/></td>
          <td>{label('projects', entry.projectId)}</td><td><button className="record-link" onClick={() => openRecord('isometrics', entry.iso.id)}>{String(entry.iso.isoNo)}</button></td><td>{String(entry.spool.name)}</td><td>{String(entry.spool.diameter || '—')}</td><td>{entry.paintSpec || '—'}</td>
          <td><span aria-label={entry.pwht ? 'PWHT required' : 'No PWHT'}>{entry.pwht ? '✓' : '✗'}</span></td><td>{entry.chemicalClean || '—'}</td>
          <td><button className="record-link" aria-label={`Spool history of ${entry.spool.name} of ${entry.iso.isoNo}`} onClick={() => setHistory(entry)}>{where(entry)}</button></td>
          <td>{entry.lastRequest ? <button className="record-link" onClick={() => openRecord('service_requests', entry.lastRequest!.id)}>{String(entry.lastRequest.number)}</button> : '—'}</td></tr>)}</tbody></table></TableScroll>
      {!list.length && <EmptyState title="No spools found" description="Choose another project or location, or add spools to an isometric."/>}
      <div className="table-footer"><span>{list.length} spools</span></div>
    </section>
    {dialog === 'service' && <ServiceRequestDialog entries={checked} onClose={() => { setDialog(null); setSelected([]); }}/>}
    {dialog === 'move' && <MoveToLaydownDialog entries={checked} onClose={() => { setDialog(null); setSelected([]); }}/>}
    {history && <SpoolHistoryDialog spool={history.spool} title={`${label('projects', history.projectId)} | ${history.iso.isoNo} | ${history.spool.name}`} onClose={() => setHistory(null)}/>}</div>;
}

/** "28.06.2024. 09:16" as the reference writes it; an entry that carries only a day shows the day. */
export function formatStamp(value: unknown) {
  const raw = String(value ?? ''); if (!raw) return '—';
  if (!raw.includes('T') || /T00:00:00(\.000)?Z$/.test(raw)) return formatDate(raw);
  const date = new Date(raw); if (Number.isNaN(date.getTime())) return raw;
  const two = (number: number) => String(number).padStart(2, '0');
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}. ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** Service request: Company, Name (the signed-in user, set by the server), Note, Include isometric drawings in PDF and the selected spools. Confirm / Cancel. */
function ServiceRequestDialog({ entries, onClose }: { entries: SpoolRow[]; onClose: () => void }) {
  const { user, label, refresh, notify } = useWorkspace();
  const [companyId, setCompany] = useState(''); const [note, setNote] = useState(''); const [drawings, setDrawings] = useState(false);
  const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const noteId = useId(); const drawingsId = useId(); const nameId = useId();
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setFields({});
    try { await post('/actions/service', { spoolIds: entries.map(entry => entry.spool.id), companyId, note, includeDrawings: drawings }); await refresh(); notify('Service request saved.'); onClose(); }
    catch (cause) { setError(failure(cause)); setFields((cause as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return <Modal title="Service request" onClose={onClose}><form onSubmit={event => void submit(event)}><div className="modal-body">
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    <div className="form-grid">
      <FieldInput field={{ name: 'companyId', label: 'Company', type: 'ref', ref: 'service_companies', required: true }} value={companyId} error={fields.companyId} onChange={value => setCompany(String(value))}/>
      <div className="field"><label htmlFor={nameId}>Name</label><input id={nameId} type="text" readOnly value={user.name}/></div>
      <div className="field full-width"><label htmlFor={noteId}>Note</label><textarea id={noteId} value={note} onChange={event => setNote(event.target.value)}/></div>
      <div className="field full-width"><label className="check-label" htmlFor={drawingsId}><input id={drawingsId} type="checkbox" checked={drawings} onChange={event => setDrawings(event.target.checked)}/> Include isometric drawings in PDF</label></div>
      <div className="field full-width"><span className="field-label" id={`${nameId}-spools`}>Selected spools:</span>
        <div role="list" aria-labelledby={`${nameId}-spools`}>{entries.map((entry, index) => <div role="listitem" key={entry.spool.id}>{index + 1}. {label('projects', entry.projectId)} | {String(entry.iso.isoNo)} | {String(entry.spool.name)}</div>)}</div></div>
    </div></div>
    <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !entries.length}>{busy && <Loader2 size={15} className="spin"/>}Confirm</button></div></form></Modal>;
}

/** Move to laydown: one field, Laydown. A spool that was at a service company comes back this way. */
function MoveToLaydownDialog({ entries, onClose }: { entries: SpoolRow[]; onClose: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [laydownId, setLaydown] = useState(''); const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setFields({});
    try { await post('/actions/move-spools', { spoolIds: entries.map(entry => entry.spool.id), laydownId }); await refresh(); notify('Spools moved to the laydown.'); onClose(); }
    catch (cause) { setError(failure(cause)); setFields((cause as ApiError).fields || {}); } finally { setBusy(false); }
  }
  return <Modal title="Move to laydown" onClose={onClose}><form onSubmit={event => void submit(event)}><div className="modal-body">
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    <div className="form-grid"><FieldInput field={{ name: 'laydownId', label: 'Laydown', type: 'ref', ref: 'laydowns', required: true }} value={laydownId} error={fields.laydownId} onChange={value => setLaydown(String(value))}/></div></div>
    <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !entries.length}>{busy && <Loader2 size={15} className="spin"/>}Confirm</button></div></form></Modal>;
}

/** Spool history: Date / Type / Location of every laydown move and service request of one spool, newest first. */
function SpoolHistoryDialog({ spool, title, onClose }: { spool: Row; title: string; onClose: () => void }) {
  const { rows } = useWorkspace(); const entries = spoolHistory(rows, spool.id);
  return <Modal title="Spool history" subtitle={title} onClose={onClose}><div className="modal-body">
    <TableScroll><table className="data-table"><thead><tr><th>Date</th><th>Type</th><th>Location</th></tr></thead>
      <tbody>{entries.map(entry => <tr key={entry.id}><td>{formatStamp(entry.date)}</td><td>{entry.type}</td><td>{entry.location || '—'}</td></tr>)}</tbody></table></TableScroll>
    {!entries.length && <EmptyState title="No history yet" description="Moves to a laydown and service requests of this spool are listed here."/>}</div>
    <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button></div></Modal>;
}

/** The page of one laydown: the spools on it now (Project, ISO, Spool, PWHT, Chemical clean, No of services) and its History (every spool that was moved onto it). */
export function LaydownContent() {
  const { id = '' } = useParams(); const [params, setParams] = useSearchParams();
  const { rows, label, canRecord, openRecord } = useWorkspace(); const [history, setHistory] = useState<Row | null>(null); const [query, setQuery] = useState('');
  if (!canRecord('laydowns') || !canRecord('spools')) return <Restricted what="laydown areas"/>;
  const laydown = rows.laydowns?.find(row => row.id === id);
  if (!laydown) return <div className="page mto-page"><EmptyState title="Laydown not found" description="Choose a laydown area from the list." action={<Link className="btn" to="/materials/laydowns">Laydown areas</Link>}/></div>;
  const past = params.get('type') === 'history';
  const lines = (past ? laydownHistory(rows, id) : laydownContent(rows, id)).filter(line => includes([label('projects', line.projectId), line.iso.isoNo, line.spool.name, line.treatments.chemicalClean], query));
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · LOGISTIC" title={String(laydown.name)}>
      <Link className="btn subtle" to="/materials/laydowns">Laydown areas</Link>
      <button className="btn" aria-pressed={past} onClick={() => setParams(past ? {} : { type: 'history' })}>{past ? 'Content' : 'History'}</button></Heading>
    <section className="panel execution-panel">
      <div className="table-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search"/></div>
      <TableScroll><table className="data-table execution-table"><thead><tr>{past && <th>Date</th>}<th>Project</th><th>ISO</th><th>Spool</th><th>PWHT</th><th>Chemical clean</th><th>No of services</th></tr></thead>
        <tbody>{lines.map(line => <tr key={line.key}>{past && <td>{formatStamp(line.date)}</td>}<td>{label('projects', line.projectId)}</td><td><button className="record-link" onClick={() => openRecord('isometrics', line.iso.id)}>{String(line.iso.isoNo)}</button></td><td>{String(line.spool.name)}</td>
          <td>{line.treatments.pwht ? 'Yes' : 'No'}</td><td>{line.treatments.chemicalClean || '-'}</td>
          <td>{line.services > 0 ? <button className="record-link" onClick={() => setHistory(line.spool)}>{line.services}</button> : 0}</td></tr>)}</tbody></table></TableScroll>
      {!lines.length && <EmptyState title="No data available in table" description={past ? 'No spool has been moved to this laydown yet.' : 'No spool is on this laydown now.'}/>}
      <div className="table-footer"><span>{lines.length} {lines.length === 1 ? 'entry' : 'entries'}</span></div></section>
    {history && <SpoolHistoryDialog spool={history} title={`${String(history.name)}`} onClose={() => setHistory(null)}/>}</div>;
}

// ---- Service req. - Materials ----------------------------------------------------------------------------------------

const PAGE_SIZES = [10, 25, 50, 100];
export function ServiceMaterials() {
  const { rows, label, canRecord, canRun, openRecord } = useWorkspace();
  // The page opens on Material group SUPPORT (else the first group A-Z) and Project All; the filter is not remembered.
  const first: MaterialServiceFilters = { group: defaultMaterialGroup(rows) };
  const [draft, setDraft] = useState<MaterialServiceFilters>(first); const [applied, setApplied] = useState<MaterialServiceFilters>(first); const [panel, setPanel] = useState(false);
  const [query, setQuery] = useState(''); const [size, setSize] = useState(100); const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]); const [dialog, setDialog] = useState<'laydown' | 'service' | null>(null);
  const [history, setHistory] = useState<MaterialServiceRow | null>(null); const [back, setBack] = useState<MaterialServiceRow | null>(null);
  if (!canRecord('iso_materials') || !canRecord('material_locations')) return <Restricted what="material logistics"/>;
  const names = (resource: string, id: string) => label(resource, id);
  const all = materialServiceRows(rows, applied, names);
  const list = all.filter(entry => includes([label('projects', entry.projectId), entry.iso.isoNo, entry.material.materialNo, entry.material.description, entry.material.dia, entry.iso.paintSpec, entry.iso.chemicalClean, entry.requirement.quantity, materialCurrentLabel(entry, names)], query));
  const pages = Math.max(1, Math.ceil(list.length / size)); const current = Math.min(page, pages - 1); const shown = list.slice(current * size, current * size + size);
  const checked = list.filter(entry => selected.includes(entry.requirement.id));
  const groups = materialGroups(rows);
  const choose = (name: keyof MaterialServiceFilters, value: string) => setDraft(old => ({ ...old, [name]: value }));
  const reset = () => { setDraft(first); setApplied(first); setSelected([]); setPage(0); };
  const close = () => { setDialog(null); setSelected([]); };
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · LOGISTIC" title="Service req. - Materials">
      {canRun('move-materials') && <button className="btn" disabled={!checked.length} onClick={() => setDialog('laydown')}><ArrowRight size={15}/>Move to laydown</button>}
      {canRun('service-materials') && <button className="btn" disabled={!checked.length} onClick={() => setDialog('service')}><Play size={15}/>Service request</button>}
      <button className="btn" aria-expanded={panel} aria-controls="materials-filter-panel" onClick={() => setPanel(open => !open)}><SlidersHorizontal size={15}/>Filter</button></Heading>
    <section className="panel execution-panel">
      <div className="table-card-top"><strong>{applied.group || 'No material group'}</strong></div>
      {panel && <form id="materials-filter-panel" className="execution-scope" onSubmit={event => { event.preventDefault(); setApplied({ ...draft }); setSelected([]); setPage(0); }}>
        <div className="field"><label htmlFor="materials-project">Project</label><div className="select-wrap"><select id="materials-project" value={draft.projectId ?? ''} onChange={event => choose('projectId', event.target.value)}><option value="">All</option>{activeRows(rows, 'projects').map(row => <option key={row.id} value={row.id}>{label('projects', row.id)}</option>)}</select></div></div>
        <div className="field"><label htmlFor="materials-group">Material group</label><div className="select-wrap"><select id="materials-group" value={draft.group ?? ''} onChange={event => choose('group', event.target.value)}>{!groups.length && <option value="">No material group</option>}{groups.map(group => <option key={group} value={group}>{group}</option>)}</select></div></div>
        <div className="field"><label htmlFor="materials-cc">Chemical clean</label><input id="materials-cc" type="text" placeholder="..." value={draft.chemicalClean ?? ''} onChange={event => choose('chemicalClean', event.target.value)}/></div>
        <div className="field"><label htmlFor="materials-keyword">Material No / Descr.</label><input id="materials-keyword" type="text" placeholder="..." value={draft.keyword ?? ''} onChange={event => choose('keyword', event.target.value)}/></div>
        <div className="field"><label htmlFor="materials-currently">Currently on</label><div className="select-wrap"><select id="materials-currently" value={draft.currently ?? ''} onChange={event => choose('currently', event.target.value)}><option value="">------</option>
          {activeRows(rows, 'material_laydowns').map(row => <option key={row.id} value={`Laydown:${row.id}`}>Laydown: {String(row.name)}</option>)}{activeRows(rows, 'service_companies').map(row => <option key={row.id} value={`Service:${row.id}`}>Service: {String(row.name)}</option>)}</select></div></div>
        <button className="btn primary small" type="submit"><Check size={15}/>Filter</button>
        <button className="btn small" type="button" onClick={reset}><X size={15}/>Reset</button></form>}
      <div className="table-toolbar"><SearchInput value={query} onChange={value => { setQuery(value); setSelected([]); setPage(0); }} placeholder="Search"/>
        <div className="field inline-field"><label htmlFor="materials-size">Show</label><div className="select-wrap"><select id="materials-size" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{PAGE_SIZES.map(value => <option key={value} value={value}>{value}</option>)}</select></div></div>
        <span className="mto-count">{checked.length ? `${checked.length} checked` : 'Check materials to choose their next step.'}</span></div>
      <TableScroll><table className="data-table execution-table"><thead><tr><th>Project</th><th>ISO</th><th>Material</th><th>Dia</th><th>P.Spec.</th><th>Ch.clean</th><th>Qty.</th><th>Currently on</th>
        <th className="select-cell"><input type="checkbox" aria-label="Check all" title="Check all" checked={shown.length > 0 && shown.every(entry => selected.includes(entry.requirement.id))} disabled={!shown.length} onChange={event => setSelected(event.target.checked ? [...new Set([...selected, ...shown.map(entry => entry.requirement.id)])] : selected.filter(id => !shown.some(entry => entry.requirement.id === id)))}/></th>{canRun('move-materials-inventory') && <th className="actions-cell">Options</th>}</tr></thead>
        <tbody>{shown.map(entry => <tr key={entry.requirement.id}>
          <td>{label('projects', entry.projectId)}</td><td><button className="record-link" onClick={() => openRecord('isometrics', entry.iso.id)}>{String(entry.iso.isoNo)}</button></td>
          <td>{String(entry.material.materialNo || '')} | <span className="description-cell">{String(entry.material.description || '')}</span></td>
          <td>{String(entry.material.dia || '-')}</td><td>{String(entry.iso.paintSpec || '-')}</td><td>{String(entry.iso.chemicalClean || '-')}</td><td>{formatNumber(entry.requirement.quantity, 3)}</td>
          <td><button className="record-link" aria-label={`Material history of ${entry.material.materialNo} on ${entry.iso.isoNo}`} onClick={() => setHistory(entry)}>{materialCurrentLabel(entry, names)}</button></td>
          <td className="select-cell"><input type="checkbox" aria-label={`Check ${entry.material.materialNo} of ${entry.iso.isoNo}`} checked={selected.includes(entry.requirement.id)} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, entry.requirement.id])] : old.filter(id => id !== entry.requirement.id))}/></td>
          {canRun('move-materials-inventory') && <td className="actions-cell"><button className="btn small" onClick={() => setBack(entry)} title="Move material back to inventory"><Undo2 size={14}/>Move to inventory</button></td>}</tr>)}</tbody></table></TableScroll>
      {!list.length && <EmptyState title="No data available in table" description="Choose another material group, project or location with Filter, or add materials of this group to an isometric."/>}
      <div className="table-footer"><span>Showing {list.length ? current * size + 1 : 0} to {current * size + shown.length} of {list.length} entries</span>
        {pages > 1 && <span className="row-buttons"><button type="button" className="btn small" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><button type="button" className="btn small" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button></span>}</div>
    </section>
    {dialog === 'laydown' && <MaterialLaydownDialog entries={checked} onClose={close}/>}
    {dialog === 'service' && <MaterialServiceDialog entries={checked} onClose={close}/>}
    {back && <MoveToInventoryDialog entry={back} onClose={() => setBack(null)}/>}
    {history && <MaterialHistoryDialog entry={history} onClose={() => setHistory(null)}/>}</div>;
}
const materialLine = (label: (resource: string, id: unknown) => string, entry: MaterialServiceRow) => `${label('projects', entry.projectId)} | ${String(entry.iso.isoNo)} | ${String(entry.material.materialNo)}`;
/** One server action behind a Confirm / Cancel dialog of this page. */
function MaterialAction({ title, subtitle, submit, onSubmit, onClose, children }: { title: string; subtitle?: string; submit: string; onSubmit: () => Promise<string>; onClose: () => void; children: (fields: Record<string, string>) => ReactNode }) {
  const { refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({});
  async function run(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setFields({});
    try { const message = await onSubmit(); await refresh(); notify(message); onClose(); }
    catch (cause) { setError(failure(cause)); setFields((cause as ApiError).fields || {}); setBusy(false); }
  }
  return <Modal title={title} subtitle={subtitle} onClose={onClose}><form onSubmit={event => void run(event)}><div className="modal-body">
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}{children(fields)}</div>
    <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{submit}</button></div></form></Modal>;
}
/** Move to laydown (#laydownTransportMaterial): Laydown (a laydown material), Confirm / Cancel. */
function MaterialLaydownDialog({ entries, onClose }: { entries: MaterialServiceRow[]; onClose: () => void }) {
  const [laydownId, setLaydown] = useState('');
  return <MaterialAction title="Move to laydown" subtitle={`${entries.length} material${entries.length === 1 ? '' : 's'} checked`} submit="Confirm" onClose={onClose}
    onSubmit={async () => { await post('/actions/move-materials', { requirementIds: entries.map(entry => entry.requirement.id), laydownId }); return 'Materials moved to the laydown.'; }}>
    {fields => <div className="form-grid"><FieldInput field={{ name: 'laydownId', label: 'Laydown', type: 'ref', ref: 'material_laydowns', required: true }} value={laydownId} error={fields.laydownId} onChange={value => setLaydown(String(value))}/></div>}</MaterialAction>;
}
/** Service request of materials: Company, Name (the signed-in user), Note and the selected materials; Confirm / Cancel. */
function MaterialServiceDialog({ entries, onClose }: { entries: MaterialServiceRow[]; onClose: () => void }) {
  const { user, label } = useWorkspace(); const nameId = useId(); const noteId = useId();
  const [companyId, setCompany] = useState(''); const [note, setNote] = useState('');
  return <MaterialAction title="Service request" submit="Confirm" onClose={onClose}
    onSubmit={async () => { await post('/actions/service-materials', { requirementIds: entries.map(entry => entry.requirement.id), companyId, note }); return 'Service request saved.'; }}>
    {fields => <div className="form-grid">
      <FieldInput field={{ name: 'companyId', label: 'Company', type: 'ref', ref: 'service_companies', required: true }} value={companyId} error={fields.companyId} onChange={value => setCompany(String(value))}/>
      <div className="field"><label htmlFor={nameId}>Name</label><input id={nameId} type="text" readOnly value={user.name}/></div>
      <div className="field full-width"><label htmlFor={noteId}>Note</label><textarea id={noteId} value={note} onChange={event => setNote(event.target.value)}/></div>
      <div className="field full-width"><span className="field-label" id={`${nameId}-list`}>Selected materials:</span>
        <div role="list" aria-labelledby={`${nameId}-list`}>{entries.map((entry, index) => <div role="listitem" key={entry.requirement.id}>{index + 1}. {materialLine(label, entry)}</div>)}</div></div></div>}</MaterialAction>;
}
/** Move to inventory (#inventoryTransport): "Move material back to inventory?", Confirm / Cancel. */
function MoveToInventoryDialog({ entry, onClose }: { entry: MaterialServiceRow; onClose: () => void }) {
  const { label } = useWorkspace();
  return <MaterialAction title="Move to inventory" subtitle={materialLine(label, entry)} submit="Confirm" onClose={onClose}
    onSubmit={async () => { await post('/actions/move-materials-inventory', { requirementIds: [entry.requirement.id] }); return `${String(entry.material.materialNo)} moved back to the inventory.`; }}>
    {() => <p>Move material back to inventory?</p>}</MaterialAction>;
}
/** Material history (showServiceHistoryMaterials): Date | Location | Ord. No. of one material line, newest first; Close. */
function MaterialHistoryDialog({ entry, onClose }: { entry: MaterialServiceRow; onClose: () => void }) {
  const { rows, label } = useWorkspace(); const entries = materialHistory(rows, entry.requirement.id, (resource, id) => label(resource, id));
  return <Modal title="Material history" subtitle={materialLine(label, entry)} onClose={onClose}><div className="modal-body">
    <TableScroll><table className="data-table"><thead><tr><th>Date</th><th>Location</th><th>Ord. No.</th></tr></thead>
      <tbody>{entries.map(item => <tr key={item.id}><td>{formatStamp(item.date)}</td><td>{item.location || '-'}</td><td>{item.orderNo || '-'}</td></tr>)}</tbody></table></TableScroll>
    {!entries.length && <EmptyState title="No data available in table" description="Moves to a laydown, service requests and moves back to the inventory of this material are listed here."/>}</div>
    <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button></div></Modal>;
}

// ---- Request archive -------------------------------------------------------------------------------------------------

export const ARCHIVE_TYPES: { value: 'Spool' | 'Material'; label: string }[] = [{ value: 'Spool', label: 'Service request' }, { value: 'Material', label: 'Service request - Materials' }];
/**
 * The Options of an archive row. Kept in one place. A spool request (Service request) has Print, Print (Coating release),
 * Sign online, Upload and Download (the signed or uploaded document, once there is one); every request downloads the
 * other files attached to it. The server checks every right again.
 */
function RequestOptions({ request, onSign, onUpload }: { request: ArchiveRequest; onSign: () => void; onUpload: () => void }) {
  const { canRecord } = useWorkspace(); const record = { id: request.headId } as Row;
  const print = canRecord('service_requests', 'print', record), sign = canRecord('service_requests', 'edit', record), upload = canRecord('service_requests', 'import', record);
  return <>{request.kind === 'Spool' && print && <>
      <a className="btn small" href={documentUrl(request, 'service-request')} target="_blank" rel="noopener" title="Print" aria-label={`Print service request ${request.number}`}><Printer size={14}/></a>
      <a className="btn small" href={documentUrl(request, 'coating-release')} target="_blank" rel="noopener" title="Print (Coating release)" aria-label={`Print the coating release of ${request.number}`}><FileText size={14}/></a>
      {(sign || request.signOff) && <button type="button" className="btn small" title="Sign online" aria-label={`Sign service request ${request.number} online`} onClick={onSign}><PenLine size={14}/></button>}
      {upload && !request.signOff && <button type="button" className="btn small" title="Upload" aria-label={`Upload the signed document of ${request.number}`} onClick={onUpload}><Upload size={14}/></button>}
      {request.files.signed && <a className="btn small" href={documentUrl(request, 'signed')} target="_blank" rel="noopener" title="Download" aria-label={`Download the signed document of ${request.number}`}><Download size={14}/></a>}
    </>}
    {request.documents.map(document => <a key={document.id} className="btn small" target="_blank" rel="noopener noreferrer" href={apiUrl(`/files/${document.id}`)} download title={String(document.name)} aria-label={`Download ${document.name}`}><Download size={14}/>Download</a>)}</>;
}
const documentUrl = (request: ArchiveRequest, kind: 'service-request' | 'coating-release' | 'signed') => apiUrl(`/service-requests/${encodeURIComponent(request.headId)}/document/${kind}`);
const blobAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('The drawing could not be read.')); reader.readAsDataURL(blob); });
type Reader = (() => Promise<Blob>) | null;
type Method = 'Signature' | 'Initials' | 'Draw';

/** The signed-in account's own saved signature or initials, for the Contractor / Supplier (`missing` when none is saved). */
function useSavedSignature(kind: Method) {
  const [state, setState] = useState<{ url: string; loading: boolean; missing: boolean }>({ url: '', loading: false, missing: false });
  useEffect(() => {
    if (kind === 'Draw') { setState({ url: '', loading: false, missing: false }); return; }
    let url = '', cancelled = false; setState({ url: '', loading: true, missing: false });
    apiBlob(`/service-requests/saved-signature/${kind}`).then(blob => { if (cancelled) return; url = URL.createObjectURL(blob); setState({ url, loading: false, missing: false }); })
      .catch(() => { if (!cancelled) setState({ url: '', loading: false, missing: true }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [kind]);
  return state;
}

/**
 * Sign online ("Sign service request"): Report no. · Company, Note, and the Contractor / Supplier, Client and NoBo blocks
 * (Name*, Date, Signature*). Sign & save PDF writes the three signatures into the Release note and stores it; a signed
 * request opens read-only with "Already signed" and its Signed PDF.
 */
function SignOnlineDialog({ request, onClose }: { request: ArchiveRequest; onClose: () => void }) {
  const { label, refresh, notify, canRecord } = useWorkspace(); const id = useId();
  const signed = Boolean(request.signOff); const editable = !signed && canRecord('service_requests', 'edit', { id: request.headId } as Row);
  const stored = request.signature; const day = signed ? '' : today();
  const [note, setNote] = useState(request.note);
  const [values, setValues] = useState({ contractorName: stored.contractorName, contractorDate: stored.contractorDate || day, clientName: stored.clientName, clientDate: stored.clientDate || day, noboName: stored.noboName, noboDate: stored.noboDate || day });
  const [method, setMethod] = useState<Method>('Draw'); const [cleared, setCleared] = useState(0);
  const [pads, setPads] = useState<{ contractor: Reader; client: Reader; nobo: Reader }>({ contractor: null, client: null, nobo: null });
  const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const saved = useSavedSignature(method);
  const set = (name: keyof typeof values, value: string) => setValues(old => ({ ...old, [name]: value }));
  const pad = (name: keyof typeof pads) => (read: Reader) => setPads(old => old[name] === read ? old : { ...old, [name]: read });
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!editable) return; setBusy(true); setError(''); setFields({});
    try {
      const drawn = async (read: Reader) => read ? blobAsDataUrl(await read()) : '';
      await post(`/service-requests/${encodeURIComponent(request.headId)}/sign`, { note, ...values, contractorMethod: method, contractorSignature: method === 'Draw' ? await drawn(pads.contractor) : '', clientSignature: await drawn(pads.client), noboSignature: await drawn(pads.nobo) });
      await refresh(); notify(`Service request ${request.number} signed. The signed Release note is stored in the archive.`); onClose();
    } catch (cause) { setError(failure(cause)); setFields((cause as ApiError).fields || {}); } finally { setBusy(false); }
  }
  const text = (name: keyof typeof values, title: string, required = false) => <div className="field"><label htmlFor={`${id}-${name}`}>{title}{required && <span className="required"> *</span>}</label>
    <input id={`${id}-${name}`} type={name.endsWith('Date') ? 'date' : 'text'} value={values[name]} readOnly={!editable} maxLength={200} aria-invalid={Boolean(fields[name])} aria-describedby={fields[name] ? `${id}-${name}-error` : undefined} onChange={event => set(name, event.target.value)}/>
    {fields[name] && <small id={`${id}-${name}-error`} className="field-error">{fields[name]}</small>}</div>;
  const problem = (name: string) => fields[name] ? <small className="field-error" role="alert">{fields[name]}</small> : null;
  const required = (title: string) => <span className="field-label">{title}<span className="required"> *</span></span>;
  const what = method === 'Signature' ? 'signature' : 'initials';
  return <Modal title="Sign service request" subtitle={`Report no. ${request.number} · ${label('service_companies', request.companyId)}`} onClose={onClose} wide><form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    {request.signOff && <p role="status"><Badge color="green">Already signed</Badge> <span className="muted">{request.signOff.via === 'Upload' ? 'A signed scan was uploaded' : 'Signed online'}{request.signOff.by ? ` by ${request.signOff.by}` : ''} · {formatStamp(request.signOff.at)}. The form is read-only.</span></p>}
    <div className="form-grid"><div className="field full-width"><label htmlFor={`${id}-note`}>Note</label><textarea id={`${id}-note`} rows={3} maxLength={2000} value={note} readOnly={!editable} onChange={event => setNote(event.target.value)}/></div></div>
    <fieldset className="field full-width"><legend>Contractor / Supplier</legend><div className="form-grid">
      {text('contractorName', 'Name', true)}{text('contractorDate', 'Date')}
      {editable && <div className="field full-width">{required('Signature')}
        <div className="table-tabs" role="group" aria-label="Contractor / Supplier signature">{(['Signature', 'Initials', 'Draw'] as const).map(option => <button key={option} type="button" className={method === option ? 'selected' : ''} aria-pressed={method === option} onClick={() => setMethod(option)}>{option}</button>)}
          <button type="button" onClick={() => { setMethod('Draw'); setCleared(count => count + 1); setPads(old => ({ ...old, contractor: null })); }}>Clear</button></div>
        {method === 'Draw' ? <SignaturePad key={cleared} label="Contractor / Supplier signature" disabled={busy} onChange={pad('contractor')}/>
          : saved.loading ? <p role="status"><Loader2 size={14} className="spin"/>Loading your saved {what}…</p>
          : saved.url ? <figure className="signature-frame"><img src={saved.url} alt={`Your saved ${what}`}/></figure>
          : <p className="muted" role="status">You have no saved {what}. Save one under System → Signatures, or draw.</p>}
        {problem('contractorSignature')}</div>}
    </div></fieldset>
    <fieldset className="field full-width"><legend>Client</legend><div className="form-grid">
      {text('clientName', 'Client name', true)}{text('clientDate', 'Date')}
      {editable && <div className="field full-width">{required('Client signature')}<SignaturePad label="Client signature" disabled={busy} onChange={pad('client')}/>{problem('clientSignature')}</div>}
    </div></fieldset>
    <fieldset className="field full-width"><legend>NoBo</legend><div className="form-grid">
      {text('noboName', 'Name', true)}{text('noboDate', 'Date')}
      {editable && <div className="field full-width">{required('Signature')}<SignaturePad label="NoBo signature" disabled={busy} onChange={pad('nobo')}/>{problem('noboSignature')}</div>}
    </div></fieldset>
    {!signed && !editable && <p className="muted">Your permission profile does not allow signing this request.</p>}
  </div>
  <div className="modal-footer">
    <a className="btn" href={documentUrl(request, 'coating-release')} target="_blank" rel="noopener"><FileText size={15}/>View Release note PDF</a>
    {request.files.signed && <a className="btn" href={documentUrl(request, 'signed')} target="_blank" rel="noopener"><Download size={15}/>Signed PDF</a>}
    {editable && <button className="btn primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <PenLine size={15}/>}Sign &amp; save PDF</button>}
    <button type="button" className="btn" disabled={busy} onClick={onClose}>Close</button></div></form></Modal>;
}

/** Upload signed doc: attach a scanned signed PDF to the request (the request is then signed and read-only). */
function UploadSignedDialog({ request, onClose }: { request: ArchiveRequest; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const id = useId();
  const [file, setFile] = useState<File | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  function choose(next: File | null) { setError(''); if (next && (next.type !== 'application/pdf' || !/\.pdf$/i.test(next.name))) { setFile(null); setError('Choose a PDF file.'); return; } setFile(next); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file) { setError('Choose the signed PDF.'); return; } setBusy(true); setError('');
    try { const body = new FormData(); body.set('file', file, file.name); await api(`/service-requests/${encodeURIComponent(request.headId)}/upload`, { method: 'POST', body }); await refresh(); notify(`Signed document of ${request.number} uploaded.`); onClose(); }
    catch (cause) { setError(failure(cause)); } finally { setBusy(false); }
  }
  return <Modal title="Upload signed doc" subtitle={`Report no. ${request.number}`} onClose={onClose}><form onSubmit={event => void submit(event)} noValidate><div className="modal-body">
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    <div className="field"><label htmlFor={`${id}-file`}>Signed document (PDF)<span className="required"> *</span></label><input id={`${id}-file`} type="file" accept="application/pdf,.pdf" onChange={event => choose(event.target.files?.[0] || null)}/>{file && <small className="field-hint">{file.name}</small>}</div>
  </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !file}>{busy ? <Loader2 size={15} className="spin"/> : <Upload size={15}/>}Upload</button></div></form></Modal>;
}

export function RequestArchive() {
  const { rows, label, canRecord } = useWorkspace();
  const range = useMemo(() => archiveDefaultRange(today()), []);
  const first = { kind: 'Spool' as 'Spool' | 'Material', from: range.from, to: range.to, sort: 'desc' as 'desc' | 'asc' };
  const [draft, setDraft] = useState(first); const [applied, setApplied] = useState(first);
  const [dialog, setDialog] = useState<{ kind: 'sign' | 'upload'; key: string } | null>(null);
  if (!canRecord('service_requests')) return <Restricted what="the request archive"/>;
  const list = requestArchive(rows, applied);
  const open = dialog ? requestArchive(rows).find(request => request.key === dialog.key) : undefined;
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · LOGISTIC" title="Request archive"/>
    <section className="panel execution-panel">
      <form className="execution-scope" onSubmit={event => { event.preventDefault(); setApplied(draft); }}>
        <div className="field"><label htmlFor="archive-order">Order</label><div className="select-wrap"><select id="archive-order" value={draft.sort} onChange={event => { const sort = event.target.value as 'desc' | 'asc'; setDraft(old => ({ ...old, sort })); setApplied(old => ({ ...old, sort })); }}><option value="desc">Order by date desc.</option><option value="asc">Order by date asc.</option></select></div></div>
        <div className="field"><label htmlFor="archive-type">Type</label><div className="select-wrap"><select id="archive-type" value={draft.kind} onChange={event => setDraft(old => ({ ...old, kind: event.target.value as 'Spool' | 'Material' }))}>{ARCHIVE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div></div>
        <div className="field"><label htmlFor="archive-from">From Date</label><input id="archive-from" type="date" value={draft.from} max={draft.to || undefined} onChange={event => setDraft(old => ({ ...old, from: event.target.value }))}/></div>
        <div className="field"><label htmlFor="archive-to">To Date</label><input id="archive-to" type="date" value={draft.to} min={draft.from || undefined} onChange={event => setDraft(old => ({ ...old, to: event.target.value }))}/></div>
        <button className="btn primary small" type="submit"><Check size={15}/>Filter</button></form>
      <TableScroll><table className="data-table execution-table"><thead><tr><th>Date</th><th>Report No.</th><th>Company</th><th>Added by</th><th className="actions-cell">Options</th></tr></thead>
        <tbody>{list.map(request => <tr key={request.key}><td>{formatStamp(request.dateTime || request.date)}</td><td>{request.number}</td><td>{label('service_companies', request.companyId)}</td><td>{request.addedBy || '—'}</td>
          <td className="actions-cell"><div className="mto-options request-options"><RequestOptions request={request} onSign={() => setDialog({ kind: 'sign', key: request.key })} onUpload={() => setDialog({ kind: 'upload', key: request.key })}/></div></td></tr>)}</tbody></table></TableScroll>
      {!list.length && <EmptyState title="No requests found" description="Service requests appear here once spools or materials are sent to a service company."/>}
      <div className="table-footer"><span>{list.length} request{list.length === 1 ? '' : 's'}</span></div>
    </section>
    {open && dialog?.kind === 'sign' && <SignOnlineDialog request={open} onClose={() => setDialog(null)}/>}
    {open && dialog?.kind === 'upload' && <UploadSignedDialog request={open} onClose={() => setDialog(null)}/>}</div>;
}
