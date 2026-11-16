import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, Check, CheckCircle2, Download, FileText, Loader2, MapPin, PackageCheck, PenLine, Printer, RefreshCw, Send, SlidersHorizontal, Upload, X } from 'lucide-react';
import { materialRecord } from '../shared/materials.ts';
import { materialLocations } from '../shared/material-logistics.ts';
import { PRIORITY_OPTIONS, priorityLabel } from '../shared/priority.ts';
import { PERCENT_BANDS, archiveDefaultRange, isTaken, isoStatuses, laydownContent, laydownHistory, percentBand, pickListReports, requestArchive, spoolHistory, spoolNames, spoolRequestNumbers, spoolRows, startedReports, type ArchiveRequest, type IsoStatus, type PickListReport, type SpoolFilters, type SpoolRow } from '../shared/mto-logistics.ts';
import type { Row } from '../shared/types.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { api, apiBlob, apiUrl, formatDate, formatNumber, post, type ApiError } from './api.ts';
import { Badge, EmptyState, FieldInput, Modal, Progress, SearchInput, TableScroll } from './components.tsx';
import { WorkflowDialog } from './dialogs.tsx';
import { PickListPdfButton } from './pdf-documents.tsx';
import { SignaturePad } from './signatures.tsx';

const today = () => new Date().toISOString().slice(0, 10);
const includes = (values: unknown[], query: string) => !query || values.some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase()));
/** A CSV download of what the table shows; cells that would start a formula are quoted as text. */
function downloadCsv(name: string, header: string[], lines: unknown[][]) {
  const cell = (value: unknown) => { let text = String(value ?? ''); if (/^\s*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  const blob = new Blob(['﻿' + [header, ...lines].map(line => line.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function Restricted({ what }: { what: string }) { return <EmptyState title="This area is restricted" description={`Your profile does not include ${what}.`}/>; }
function Heading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>{children && <div className="heading-actions">{children}</div>}</div>;
}
function Failure({ message, onClose }: { message: string; onClose: () => void }) {
  return message ? <div className="alert error mto-alert" role="alert"><AlertCircle size={18}/><span>{message}</span><button className="icon-btn" aria-label="Dismiss message" onClick={onClose}><X size={14}/></button></div> : null;
}
const failure = (error: unknown) => (error as ApiError).message || 'The action could not be completed.';

// ---- Isometric execution ---------------------------------------------------------------------------------------------

export function IsometricExecution() {
  const { rows, label, canRecord, canRun, refresh, notify, openRecord } = useWorkspace();
  const [view, setView] = useState<'execution' | 'reserved'>('execution');
  const [group, setGroup] = useState(''); const [band, setBand] = useState(''); const [priority, setPriority] = useState(''); const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [refreshing, setRefreshing] = useState(false);
  const statuses = useMemo(() => isoStatuses(rows, { group }), [rows, group]);
  if (!canRecord('iso_materials') || !canRecord('stock') || !canRecord('reservations')) return <Restricted what="isometric execution"/>;
  const list = activeRows(rows, 'isometrics').filter(iso => {
    const status = statuses.get(iso.id);
    if (group && !status) return false;
    if (band && percentBand(status?.percent ?? null) !== band) return false;
    if (priority && priorityLabel(iso.priority) !== priority) return false;
    return includes([iso.isoNo, iso.pipingClass, iso.drawingNo, iso.chemicalClean, label('projects', iso.projectId)], query);
  }).sort((a, b) => String(label('projects', a.projectId)).localeCompare(String(label('projects', b.projectId))) || String(a.isoNo).localeCompare(String(b.isoNo)));
  const reservations = activeRows(rows, 'reservations').filter(row => row.status === 'Reserved' && rows.isometrics?.some(iso => iso.id === row.isoId));
  async function run(key: 'reserve-iso' | 'start-iso', iso: { id: string; isoNo?: unknown }) {
    setBusy(iso.id + key); setError('');
    try { await post(`/actions/${key}`, { isoId: iso.id, date: today() }); await refresh(); notify(key === 'reserve-iso' ? `Materials reserved for ${iso.isoNo}.` : `${iso.isoNo} started. The pick list is in the Pick List archive.`); }
    catch (problem) { setError(failure(problem)); } finally { setBusy(''); }
  }
  async function release(id: string) {
    setBusy(id); setError('');
    try { await post('/actions/release-reservation', { reservationIds: [id], date: today() }); await refresh(); notify('Reservation released.'); }
    catch (problem) { setError(failure(problem)); } finally { setBusy(''); }
  }
  async function refreshAll() { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } }
  const exportCsv = () => downloadCsv('isometric-execution.csv', ['Project', 'ISO', 'Piping class', 'Priority', 'Drawing no. 1', 'Chemical clean', 'Mat.status %'], list.map(iso => [label('projects', iso.projectId), iso.isoNo, iso.pipingClass, priorityLabel(iso.priority), iso.drawingNo, iso.chemicalClean, statuses.get(iso.id)?.percent ?? '']));
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · PROJECTS DATA" title="Isometric execution">
      <button className="btn" onClick={() => void refreshAll()} disabled={refreshing}>{refreshing ? <Loader2 size={15} className="spin"/> : <RefreshCw size={15}/>}Refresh all</button>
    </Heading>
    <section className="panel execution-panel">
      <div className="table-card-top"><div className="table-tabs" role="tablist" aria-label="Isometric execution views">
        <button role="tab" aria-selected={view === 'execution'} className={view === 'execution' ? 'selected' : ''} onClick={() => setView('execution')}>Isometrics</button>
        <button role="tab" aria-selected={view === 'reserved'} className={view === 'reserved' ? 'selected' : ''} onClick={() => setView('reserved')}>Reserved materials<span>{reservations.length}</span></button></div>
        <div className="table-utilities"><button className="btn subtle small" onClick={exportCsv} disabled={!list.length}><Download size={14}/>CSV</button><button className="btn subtle small" onClick={() => window.print()}><Printer size={14}/>Print</button></div></div>
      <Failure message={error} onClose={() => setError('')}/>
      {view === 'execution' ? <>
        <div className="execution-scope">
          <div className="field"><label htmlFor="iso-exec-type">Type</label><div className="select-wrap"><select id="iso-exec-type" value={group} onChange={event => setGroup(event.target.value)}><option value="">All types</option>{['Shop', 'Field', 'Valves'].map(value => <option key={value}>{value}</option>)}</select></div></div>
          <div className="field"><label htmlFor="iso-exec-band">Material status</label><div className="select-wrap"><select id="iso-exec-band" value={band} onChange={event => setBand(event.target.value)}><option value="">All</option>{PERCENT_BANDS.map(value => <option key={value}>{value}</option>)}</select></div></div>
          <div className="field"><label htmlFor="iso-exec-priority">Priority</label><div className="select-wrap"><select id="iso-exec-priority" value={priority} onChange={event => setPriority(event.target.value)}><option value="">All priorities</option>{PRIORITY_OPTIONS.map(value => <option key={value}>{value}</option>)}</select></div></div>
          <button className="text-link" onClick={() => { setGroup(''); setBand(''); setPriority(''); setQuery(''); }}>Clear filters</button></div>
        <div className="table-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search isometric, project, or drawing…"/><span className="mto-count" role="status">{list.length} isometric{list.length === 1 ? '' : 's'} found</span></div>
        <TableScroll><table className="data-table execution-table"><thead><tr><th>Project</th><th>ISO</th><th>Piping class</th><th>Priority</th><th>Drawing no. 1</th><th>Chemical clean</th><th>Mat.status</th><th className="actions-cell">Options</th></tr></thead>
          <tbody>{list.map(iso => {
            const status = statuses.get(iso.id); const started = startedReports(rows, iso.id);
            const missing = Boolean(status?.lines.some(line => line.shortage > 0 || line.required - line.picked - line.claimed > 0));
            const canStart = Boolean(status?.lines.some(line => line.available > 0));
            const canReserve = Boolean(status?.lines.some(line => line.available > line.reserved));
            return <tr key={iso.id}><td>{label('projects', iso.projectId)}</td>
              <td><button className="record-link" onClick={() => openRecord('isometrics', iso.id)}>{String(iso.isoNo)}</button>{started.length > 0 && <small className="execution-subvalue"><Badge color="green">Started</Badge> {started.join(', ')}</small>}</td>
              <td>{String(iso.pipingClass || '—')}</td><td>{priorityLabel(iso.priority) || '—'}</td><td>{String(iso.drawingNo || '—')}</td><td>{String(iso.chemicalClean || '—')}</td>
              <td><StatusBar status={status}/></td>
              <td className="actions-cell mto-options">{canRun('reserve-iso') && <button className="btn small" disabled={!missing || !canReserve || Boolean(busy)} onClick={() => void run('reserve-iso', iso)} title={canReserve ? 'Set aside the missing quantities from free stock' : 'Nothing free to reserve'}>{busy === iso.id + 'reserve-iso' ? <Loader2 size={14} className="spin"/> : <PackageCheck size={14}/>}Reserve</button>}
                {canRun('start-iso') && <button className="btn primary small" disabled={!canStart || Boolean(busy)} onClick={() => void run('start-iso', iso)} title={canStart ? 'Create a pick list for the available quantities' : 'No missing material is in stock'}>{busy === iso.id + 'start-iso' ? <Loader2 size={14} className="spin"/> : <CheckCircle2 size={14}/>}Start</button>}</td></tr>;
          })}</tbody></table></TableScroll>
        {!list.length && <EmptyState title="No isometrics found" description="Change the filters, or add materials to an isometric to follow its coverage."/>}
        <div className="table-footer"><span>{list.length} isometrics</span><span>Opening this page recalculates the material status from stock, reservations and pick lists.</span></div>
      </> : <>
        <TableScroll><table className="data-table execution-table"><thead><tr><th>Project</th><th>ISO</th><th>Material</th><th>Description</th><th>Reserved</th><th>Date</th><th className="actions-cell">Options</th></tr></thead>
          <tbody>{reservations.map(row => { const iso = rows.isometrics.find(item => item.id === row.isoId)!; const requirement = rows.iso_materials?.find(item => item.id === row.requirementId); const material = requirement ? materialRecord(rows, requirement) : undefined;
            return <tr key={row.id}><td>{label('projects', iso.projectId)}</td><td>{String(iso.isoNo)}</td><td>{String(material?.materialNo || '—')}</td><td className="description-cell">{String(material?.description || '')}</td><td>{formatNumber(row.quantity, 3)} {String(material?.uom || '')}</td><td>{formatDate(row.date)}</td>
              <td className="actions-cell">{canRun('release-reservation') && <button className="btn small" disabled={Boolean(busy)} onClick={() => void release(row.id)}>{busy === row.id && <Loader2 size={14} className="spin"/>}Release</button>}</td></tr>; })}</tbody></table></TableScroll>
        {!reservations.length && <EmptyState title="Nothing is reserved" description="Reserve sets aside an isometric’s missing quantities from the free stock. Reservations show here until they are used or released."/>}
      </>}
    </section></div>;
}
function StatusBar({ status }: { status?: IsoStatus }) {
  if (!status || status.percent === null) return <span className="muted">No materials</span>;
  const color = status.percent >= 100 ? 'green' : status.percent >= 70 ? 'amber' : 'red';
  return <div className="mto-status" title={status.lines.filter(line => line.shortage > 0).map(line => `${line.material.materialNo}: short ${formatNumber(line.shortage, 3)}`).join('\n') || 'All materials covered'}><Progress value={status.percent} color={color}/><strong>{status.percent}%</strong></div>;
}

// ---- Pick List archive -----------------------------------------------------------------------------------------------

export function PickListArchive() {
  const { rows, label, canRecord, canRun, refresh, notify, openRecord } = useWorkspace();
  const [projectId, setProject] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [open, setOpen] = useState<PickListReport | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (!canRecord('picklists')) return <Restricted what="the pick list archive"/>;
  const reports = pickListReports(rows, { projectId, from, to });
  const current = open ? reports.find(report => report.reportNo === open.reportNo) || open : null;
  const isoNo = (id: string) => String(rows.isometrics?.find(iso => iso.id === id)?.isoNo || 'Unavailable isometric');
  async function take(report: PickListReport) {
    setBusy(true); setError('');
    try { await post('/actions/take-picklist', { reportNo: report.reportNo, date: today() }); await refresh(); notify(`Pick list ${report.reportNo} taken. The materials are issued from stock.`); setOpen(null); }
    catch (problem) { setError(failure(problem)); } finally { setBusy(false); }
  }
  const exportCsv = () => downloadCsv('pick-list-archive.csv', ['Date', 'Report No.', 'Project', 'ISO No', 'Taken?', 'Lines'], reports.map(report => [report.date, report.reportNo, label('projects', report.projectId), isoNo(report.isoId), report.taken ? 'Yes' : 'No', report.lines.length]));
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · PROJECTS DATA" title="Pick List archive"><button className="btn" onClick={exportCsv} disabled={!reports.length}><Download size={15}/>Pick list archive export</button></Heading>
    <section className="panel execution-panel">
      <div className="execution-scope"><FieldInput field={{ name: 'projectId', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={value => setProject(String(value))}/>
        <div className="field"><label htmlFor="picklist-from">From date</label><input id="picklist-from" type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)}/></div>
        <div className="field"><label htmlFor="picklist-to">To date</label><input id="picklist-to" type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)}/></div>
        <button className="text-link" onClick={() => { setProject(''); setFrom(''); setTo(''); }}>Clear filters</button></div>
      <TableScroll><table className="data-table execution-table"><thead><tr><th>Date</th><th>Report No.</th><th>Project</th><th>ISO No</th><th>Taken?</th><th className="actions-cell">Options</th></tr></thead>
        <tbody>{reports.map(report => <tr key={report.reportNo}><td>{formatDate(report.date)}</td><td><button className="record-link" onClick={() => { setError(''); setOpen(report); }}>{report.reportNo}</button></td><td>{label('projects', report.projectId)}</td>
          <td><button className="record-link" onClick={() => openRecord('isometrics', report.isoId)}>{isoNo(report.isoId)}</button></td><td><Badge color={report.taken ? 'green' : 'amber'}>{report.taken ? 'Yes' : 'No'}</Badge></td>
          <td className="actions-cell"><button className="btn small" onClick={() => { setError(''); setOpen(report); }}>View</button> <PickListPdfButton reportNo={report.reportNo}/></td></tr>)}</tbody></table></TableScroll>
      {!reports.length && <EmptyState title="No pick lists found" description="Pick lists appear here when an isometric is started in Isometric execution. Change the dates or project to see more."/>}
      <div className="table-footer"><span>{reports.length} pick list{reports.length === 1 ? '' : 's'}</span><span>A pick list issues its materials from stock when it is marked as taken.</span></div>
    </section>
    {current && <Modal title={`Pick list ${current.reportNo}`} subtitle={`${isoNo(current.isoId)} · ${label('projects', current.projectId)} · ${formatDate(current.date)}`} onClose={() => setOpen(null)} wide>
      <div className="modal-body"><Failure message={error} onClose={() => setError('')}/>
        <TableScroll><table className="data-table"><thead><tr><th>Material</th><th>Description</th><th>Storehouse</th><th>Quantity</th><th>Charge / heat no.</th><th>Taken?</th></tr></thead><tbody>{current.lines.map(line => { const material = materialRecord(rows, line);
          return <tr key={line.id}><td>{String(material?.materialNo || 'Unavailable material')}</td><td className="description-cell">{String(material?.description || '')}</td><td>{line.warehouseId ? label('warehouses', line.warehouseId) : '—'}</td><td>{formatNumber(line.quantity, 3)} {String(material?.uom || '')}</td><td>{String(line.chargeNo || '—')}</td><td><Badge color={isTaken(line) ? 'green' : 'amber'}>{isTaken(line) ? 'Yes' : 'No'}</Badge></td></tr>; })}</tbody></table></TableScroll></div>
      <div className="modal-footer"><button className="btn" onClick={() => setOpen(null)}>Close</button><PickListPdfButton reportNo={current.reportNo}/>
        {!current.taken && canRun('take-picklist') && <button className="btn primary" disabled={busy} onClick={() => void take(current)}>{busy && <Loader2 size={15} className="spin"/>}Mark as taken</button>}</div></Modal>}
  </div>;
}

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
      <a className="btn" href={exportUrl} download><Download size={15}/>Export</a></Heading>
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

export function ServiceMaterials() {
  const { rows, label, canRecord, canRun, openRecord } = useWorkspace();
  const [projectId, setProject] = useState(''); const [isoId, setIso] = useState(''); const [location, setLocation] = useState(''); const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [action, setAction] = useState<{ key: string; defaults: Record<string, unknown> } | null>(null);
  if (!canRecord('iso_materials') || !canRecord('material_locations')) return <Restricted what="material logistics"/>;
  const list = materialLocations(rows, { projectId, isoId, location }).filter(entry => includes([entry.material.materialNo, entry.material.description, entry.material.dia, entry.iso.isoNo, entry.iso.paintSpec, entry.iso.chemicalClean, label('projects', entry.iso.projectId), entry.locationId ? label(entry.locationType === 'Service' ? 'service_companies' : 'material_laydowns', entry.locationId) : ''], query));
  const checked = list.filter(entry => selected.includes(entry.requirement.id));
  const canMove = checked.length > 0;
  const canService = checked.length > 0 && checked.every(entry => !entry.openRequest && entry.locationType === 'Laydown');
  const run = (key: string) => setAction({ key, defaults: { requirementIds: checked.map(entry => entry.requirement.id) } });
  const place = (entry: (typeof list)[number]) => entry.locationId ? <span className={`location-label ${entry.locationType === 'Service' ? 'service' : ''}`}><MapPin size={13}/>{label(entry.locationType === 'Service' ? 'service_companies' : 'material_laydowns', entry.locationId)}</span> : <span className="muted">Unassigned</span>;
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · LOGISTIC" title="Service req. - Materials"><button className="btn subtle" onClick={() => window.print()}><Printer size={15}/>Print</button></Heading>
    <section className="panel execution-panel">
      <div className="execution-scope"><FieldInput field={{ name: 'projectId', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={value => { setProject(String(value)); setIso(''); setSelected([]); }}/>
        <FieldInput field={{ name: 'isoId', label: 'Isometric', type: 'ref', ref: 'isometrics' }} values={{ projectId }} value={isoId} onChange={value => { setIso(String(value)); setSelected([]); }}/>
        <div className="field"><label htmlFor="material-location">Currently on</label><div className="select-wrap"><select id="material-location" value={location} onChange={event => { setLocation(event.target.value); setSelected([]); }}><option value="">All locations</option><option value="Unassigned:">Unassigned</option>
          <optgroup label="Laydown materials">{activeRows(rows, 'material_laydowns').map(row => <option key={row.id} value={`Laydown:${row.id}`}>{String(row.name)}</option>)}</optgroup><optgroup label="Service companies">{activeRows(rows, 'service_companies').map(row => <option key={row.id} value={`Service:${row.id}`}>{String(row.name)}</option>)}</optgroup></select></div></div>
        <button className="text-link" onClick={() => { setProject(''); setIso(''); setLocation(''); setQuery(''); setSelected([]); }}>Clear filters</button></div>
      <div className="table-toolbar"><SearchInput value={query} onChange={value => { setQuery(value); setSelected([]); }} placeholder="Search material, isometric, treatment, or location…"/></div>
      {(canRun('move-materials') || canRun('service-materials')) && <div className="logistics-actions">
        {canRun('move-materials') && <button className="btn small" disabled={!canMove} onClick={() => run('move-materials')}><MapPin size={15}/>Move to laydown</button>}
        {canRun('service-materials') && <button className="btn primary small" disabled={!canService} onClick={() => run('service-materials')}><Send size={15}/>Request service</button>}
        <span>{checked.length ? `${checked.length} checked` : 'Check materials to choose their next step.'}</span></div>}
      <TableScroll><table className="data-table execution-table"><thead><tr><th className="select-cell"><input type="checkbox" aria-label="Check all materials in this view" checked={list.length > 0 && list.every(entry => selected.includes(entry.requirement.id))} disabled={!list.length} onChange={event => setSelected(event.target.checked ? list.map(entry => entry.requirement.id) : [])}/></th>
        <th>Project</th><th>ISO</th><th>Material</th><th>Dia</th><th>P.Spec.</th><th>Ch.clean</th><th>Qty.</th><th>Currently on</th></tr></thead>
        <tbody>{list.map(entry => <tr key={entry.requirement.id}><td className="select-cell"><input type="checkbox" aria-label={`Check ${entry.material.materialNo} of ${entry.iso.isoNo}`} checked={selected.includes(entry.requirement.id)} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, entry.requirement.id])] : old.filter(id => id !== entry.requirement.id))}/></td>
          <td>{label('projects', entry.iso.projectId)}</td><td><button className="record-link" onClick={() => openRecord('isometrics', entry.iso.id)}>{String(entry.iso.isoNo)}</button></td>
          <td><button className="record-link" onClick={() => openRecord('iso_materials', entry.requirement.id)}>{String(entry.material.materialNo)}</button><small className="execution-subvalue">{String(entry.material.description || '')}</small></td>
          <td>{String(entry.material.dia || '—')}</td><td>{String(entry.iso.paintSpec || '—')}</td><td>{String(entry.iso.chemicalClean || '—')}</td><td>{formatNumber(entry.requirement.quantity, 3)} {String(entry.material.uom || '')}</td><td>{place(entry)}</td></tr>)}</tbody></table></TableScroll>
      {!list.length && <EmptyState title="No materials found" description="Choose another project or location, or add materials to an isometric."/>}
      <div className="table-footer"><span>{list.length} requirement lines</span><span>Locations follow whole requirement lines; warehouse stock is not changed.</span></div>
    </section>
    {action && <WorkflowDialog actionKey={action.key} defaults={action.defaults} onClose={() => { setAction(null); setSelected([]); }}/>}</div>;
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
    {request.documents.map(document => <a key={document.id} className="btn small" href={apiUrl(`/files/${document.id}`)} download title={String(document.name)} aria-label={`Download ${document.name}`}><Download size={14}/>Download</a>)}</>;
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
