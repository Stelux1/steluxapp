import { useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2, MapPin, PackageCheck, Printer, RefreshCw, Send, X } from 'lucide-react';
import { materialRecord } from '../shared/materials.ts';
import { materialLocations } from '../shared/material-logistics.ts';
import { PRIORITY_OPTIONS, priorityLabel } from '../shared/priority.ts';
import { PERCENT_BANDS, isTaken, isoStatuses, percentBand, pickListReports, requestArchive, spoolRows, startedReports, type IsoStatus, type PickListReport } from '../shared/mto-logistics.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { formatDate, formatNumber, post, type ApiError } from './api.ts';
import { Badge, EmptyState, FieldInput, Modal, Progress, SearchInput, TableScroll } from './components.tsx';
import { WorkflowDialog } from './dialogs.tsx';

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
          <td className="actions-cell"><button className="btn small" onClick={() => { setError(''); setOpen(report); }}>View</button></td></tr>)}</tbody></table></TableScroll>
      {!reports.length && <EmptyState title="No pick lists found" description="Pick lists appear here when an isometric is started in Isometric execution. Change the dates or project to see more."/>}
      <div className="table-footer"><span>{reports.length} pick list{reports.length === 1 ? '' : 's'}</span><span>A pick list issues its materials from stock when it is marked as taken.</span></div>
    </section>
    {current && <Modal title={`Pick list ${current.reportNo}`} subtitle={`${isoNo(current.isoId)} · ${label('projects', current.projectId)} · ${formatDate(current.date)}`} onClose={() => setOpen(null)} wide>
      <div className="modal-body"><Failure message={error} onClose={() => setError('')}/>
        <TableScroll><table className="data-table"><thead><tr><th>Material</th><th>Description</th><th>Quantity</th><th>Charge / heat no.</th><th>Taken?</th></tr></thead><tbody>{current.lines.map(line => { const material = materialRecord(rows, line);
          return <tr key={line.id}><td>{String(material?.materialNo || 'Unavailable material')}</td><td className="description-cell">{String(material?.description || '')}</td><td>{formatNumber(line.quantity, 3)} {String(material?.uom || '')}</td><td>{String(line.chargeNo || '—')}</td><td><Badge color={isTaken(line) ? 'green' : 'amber'}>{isTaken(line) ? 'Yes' : 'No'}</Badge></td></tr>; })}</tbody></table></TableScroll></div>
      <div className="modal-footer"><button className="btn" onClick={() => setOpen(null)}>Close</button>
        {!current.taken && canRun('take-picklist') && <button className="btn primary" disabled={busy} onClick={() => void take(current)}>{busy && <Loader2 size={15} className="spin"/>}Mark as taken</button>}</div></Modal>}
  </div>;
}

// ---- Service request (spools) ----------------------------------------------------------------------------------------

export function ServiceRequestSpools() {
  const { rows, label, canRecord, canRun, openRecord } = useWorkspace();
  const [projectId, setProject] = useState(''); const [isoId, setIso] = useState(''); const [location, setLocation] = useState(''); const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [action, setAction] = useState<{ key: string; defaults: Record<string, unknown> } | null>(null);
  if (!canRecord('spools') || !canRecord('service_requests')) return <Restricted what="spool service requests"/>;
  const all = spoolRows(rows, { projectId, isoId });
  const list = all.filter(entry => (!location || `${entry.location.type}:${entry.location.id}` === location) && includes([entry.spool.name, entry.iso.isoNo, entry.spool.paintSpec, entry.spool.chemicalClean, label('projects', entry.projectId), entry.location.id ? label(entry.location.type === 'Service' ? 'service_companies' : 'laydowns', entry.location.id) : 'Transport'], query));
  const checked = list.filter(entry => selected.includes(entry.spool.id));
  const canRequest = checked.length > 0 && checked.every(entry => !entry.openRequest && entry.location.type !== 'Service');
  const canMove = checked.length > 0 && checked.every(entry => !entry.openRequest && entry.location.type !== 'Service');
  const where = (entry: (typeof list)[number]) => entry.location.type === 'Transport' ? <Badge color="amber">Transport</Badge> : <span className={`location-label ${entry.location.type === 'Service' ? 'service' : ''}`}><MapPin size={13}/>{label(entry.location.type === 'Service' ? 'service_companies' : 'laydowns', entry.location.id)}</span>;
  const exportCsv = () => downloadCsv('service-request-spools.csv', ['Project', 'ISO', 'Spool', 'Diameter', 'Paint spec.', 'PWHT', 'Chemical clean', 'Currently on', 'Last request'], list.map(entry => [label('projects', entry.projectId), entry.iso.isoNo, entry.spool.name, entry.spool.diameter, entry.spool.paintSpec, entry.spool.pwht ? 'Yes' : 'No', entry.spool.chemicalClean, entry.location.type === 'Transport' ? 'Transport' : label(entry.location.type === 'Service' ? 'service_companies' : 'laydowns', entry.location.id), entry.lastRequest ? `${entry.lastRequest.number} ${entry.lastRequest.date}` : '']));
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · LOGISTIC" title="Service request"><button className="btn" onClick={exportCsv} disabled={!list.length}><Download size={15}/>Export</button><button className="btn subtle" onClick={() => window.print()}><Printer size={15}/>Print</button></Heading>
    <section className="panel execution-panel">
      <div className="execution-scope"><FieldInput field={{ name: 'projectId', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={value => { setProject(String(value)); setIso(''); setSelected([]); }}/>
        <FieldInput field={{ name: 'isoId', label: 'Isometric', type: 'ref', ref: 'isometrics' }} values={{ projectId }} value={isoId} onChange={value => { setIso(String(value)); setSelected([]); }}/>
        <div className="field"><label htmlFor="spool-location">Currently on</label><div className="select-wrap"><select id="spool-location" value={location} onChange={event => { setLocation(event.target.value); setSelected([]); }}><option value="">All locations</option><option value="Transport:">Transport</option>
          <optgroup label="Laydown areas">{activeRows(rows, 'laydowns').map(row => <option key={row.id} value={`Laydown:${row.id}`}>{String(row.name)}</option>)}</optgroup><optgroup label="Service companies">{activeRows(rows, 'service_companies').map(row => <option key={row.id} value={`Service:${row.id}`}>{String(row.name)}</option>)}</optgroup></select></div></div>
        <button className="text-link" onClick={() => { setProject(''); setIso(''); setLocation(''); setQuery(''); setSelected([]); }}>Clear filters</button></div>
      <div className="table-toolbar"><SearchInput value={query} onChange={value => { setQuery(value); setSelected([]); }} placeholder="Search spool, isometric, treatment, or location…"/></div>
      {(canRun('service') || canRun('move-spools')) && <div className="logistics-actions">
        {canRun('service') && <button className="btn primary small" disabled={!canRequest} onClick={() => setAction({ key: 'service', defaults: { spoolIds: checked.map(entry => entry.spool.id) } })}><Send size={15}/>Service request</button>}
        {canRun('move-spools') && <button className="btn small" disabled={!canMove} onClick={() => setAction({ key: 'move-spools', defaults: { spoolIds: checked.map(entry => entry.spool.id) } })}><MapPin size={15}/>Move to laydown</button>}
        <span>{checked.length ? `${checked.length} checked` : 'Check spools to choose their next step.'}</span></div>}
      <TableScroll><table className="data-table execution-table"><thead><tr><th className="select-cell"><input type="checkbox" aria-label="Check all spools in this view" checked={list.length > 0 && list.every(entry => selected.includes(entry.spool.id))} disabled={!list.length} onChange={event => setSelected(event.target.checked ? list.map(entry => entry.spool.id) : [])}/></th>
        <th>Project</th><th>ISO</th><th>Spool</th><th>Diameter</th><th>Paint spec.</th><th>PWHT</th><th>Chemical clean</th><th>Currently on</th><th>Last request</th></tr></thead>
        <tbody>{list.map(entry => <tr key={entry.spool.id}><td className="select-cell"><input type="checkbox" aria-label={`Check spool ${entry.spool.name} of ${entry.iso.isoNo}`} checked={selected.includes(entry.spool.id)} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, entry.spool.id])] : old.filter(id => id !== entry.spool.id))}/></td>
          <td>{label('projects', entry.projectId)}</td><td><button className="record-link" onClick={() => openRecord('isometrics', entry.iso.id)}>{String(entry.iso.isoNo)}</button></td><td>{String(entry.spool.name)}</td><td>{String(entry.spool.diameter || '—')}</td><td>{String(entry.spool.paintSpec || '—')}</td>
          <td><span aria-label={entry.spool.pwht ? 'PWHT required' : 'No PWHT'}>{entry.spool.pwht ? '✓' : '✗'}</span></td><td>{String(entry.spool.chemicalClean || '—')}</td><td>{where(entry)}</td>
          <td>{entry.lastRequest ? <button className="record-link" onClick={() => openRecord('service_requests', entry.lastRequest!.id)}>{String(entry.lastRequest.number)}<small className="execution-subvalue">{formatDate(entry.lastRequest.date)} · {String(entry.lastRequest.status)}</small></button> : '—'}</td></tr>)}</tbody></table></TableScroll>
      {!list.length && <EmptyState title="No spools found" description="Choose another project or location, or add spools to an isometric."/>}
      <div className="table-footer"><span>{list.length} spools</span><span>A spool with an open request must be completed in the Request archive before it moves.</span></div>
    </section>
    {action && <WorkflowDialog actionKey={action.key} defaults={action.defaults} onClose={() => { setAction(null); setSelected([]); }}/>}</div>;
}

// ---- Service req. - Materials ----------------------------------------------------------------------------------------

export function ServiceMaterials() {
  const { rows, label, canRecord, canRun, openRecord } = useWorkspace();
  const [projectId, setProject] = useState(''); const [isoId, setIso] = useState(''); const [location, setLocation] = useState(''); const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [action, setAction] = useState<{ key: string; defaults: Record<string, unknown> } | null>(null);
  if (!canRecord('iso_materials') || !canRecord('material_locations')) return <Restricted what="material logistics"/>;
  const list = materialLocations(rows, { projectId, isoId, location }).filter(entry => includes([entry.material.materialNo, entry.material.description, entry.material.dia, entry.iso.isoNo, entry.iso.paintSpec, entry.iso.chemicalClean, label('projects', entry.iso.projectId), entry.locationId ? label(entry.locationType === 'Service' ? 'service_companies' : 'material_laydowns', entry.locationId) : ''], query));
  const checked = list.filter(entry => selected.includes(entry.requirement.id));
  const canMove = checked.length > 0 && checked.every(entry => !entry.openRequest && entry.locationType !== 'Service');
  const canService = checked.length > 0 && checked.every(entry => !entry.openRequest && entry.locationType === 'Laydown');
  const canComplete = checked.length > 0 && checked.every(entry => entry.openRequest);
  const run = (key: string) => setAction({ key, defaults: key === 'complete-material-service' ? { requestIds: checked.map(entry => entry.openRequest!.id) } : { requirementIds: checked.map(entry => entry.requirement.id) } });
  const place = (entry: (typeof list)[number]) => entry.locationId ? <span className={`location-label ${entry.locationType === 'Service' ? 'service' : ''}`}><MapPin size={13}/>{label(entry.locationType === 'Service' ? 'service_companies' : 'material_laydowns', entry.locationId)}</span> : <span className="muted">Unassigned</span>;
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · LOGISTIC" title="Service req. - Materials"><button className="btn subtle" onClick={() => window.print()}><Printer size={15}/>Print</button></Heading>
    <section className="panel execution-panel">
      <div className="execution-scope"><FieldInput field={{ name: 'projectId', label: 'Project', type: 'ref', ref: 'projects' }} value={projectId} onChange={value => { setProject(String(value)); setIso(''); setSelected([]); }}/>
        <FieldInput field={{ name: 'isoId', label: 'Isometric', type: 'ref', ref: 'isometrics' }} values={{ projectId }} value={isoId} onChange={value => { setIso(String(value)); setSelected([]); }}/>
        <div className="field"><label htmlFor="material-location">Currently on</label><div className="select-wrap"><select id="material-location" value={location} onChange={event => { setLocation(event.target.value); setSelected([]); }}><option value="">All locations</option><option value="Unassigned:">Unassigned</option>
          <optgroup label="Laydown materials">{activeRows(rows, 'material_laydowns').map(row => <option key={row.id} value={`Laydown:${row.id}`}>{String(row.name)}</option>)}</optgroup><optgroup label="Service companies">{activeRows(rows, 'service_companies').map(row => <option key={row.id} value={`Service:${row.id}`}>{String(row.name)}</option>)}</optgroup></select></div></div>
        <button className="text-link" onClick={() => { setProject(''); setIso(''); setLocation(''); setQuery(''); setSelected([]); }}>Clear filters</button></div>
      <div className="table-toolbar"><SearchInput value={query} onChange={value => { setQuery(value); setSelected([]); }} placeholder="Search material, isometric, treatment, or location…"/></div>
      {(canRun('move-materials') || canRun('service-materials') || canRun('complete-material-service')) && <div className="logistics-actions">
        {canRun('move-materials') && <button className="btn small" disabled={!canMove} onClick={() => run('move-materials')}><MapPin size={15}/>Move to laydown</button>}
        {canRun('service-materials') && <button className="btn primary small" disabled={!canService} onClick={() => run('service-materials')}><Send size={15}/>Request service</button>}
        {canRun('complete-material-service') && <button className="btn small" disabled={!canComplete} onClick={() => run('complete-material-service')}><CheckCircle2 size={15}/>Complete service</button>}
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

export function RequestArchive() {
  const { rows, label, canRecord, canRun } = useWorkspace();
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [query, setQuery] = useState('');
  const [action, setAction] = useState<{ key: string; defaults: Record<string, unknown> } | null>(null);
  if (!canRecord('service_requests')) return <Restricted what="the request archive"/>;
  const list = requestArchive(rows, { from, to }).filter(request => includes([request.number, request.name, request.items.join(' '), label('service_companies', request.companyId)], query));
  const exportCsv = () => downloadCsv('request-archive.csv', ['Date', 'Request', 'Name', 'Company', 'Type', 'Items', 'Status', 'Completed'], list.map(request => [request.date, request.number, request.name, label('service_companies', request.companyId), request.kind, request.items.join('; '), request.status, request.completedAt]));
  return <div className="page mto-page"><Heading eyebrow="MTO PILOT · LOGISTIC" title="Request archive"><button className="btn" onClick={exportCsv} disabled={!list.length}><Download size={15}/>Export</button><button className="btn subtle" onClick={() => window.print()}><Printer size={15}/>Print</button></Heading>
    <section className="panel execution-panel">
      <div className="execution-scope"><div className="field"><label htmlFor="archive-from">From date</label><input id="archive-from" type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)}/></div>
        <div className="field"><label htmlFor="archive-to">To date</label><input id="archive-to" type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)}/></div>
        <button className="text-link" onClick={() => { setFrom(''); setTo(''); setQuery(''); }}>Clear filters</button></div>
      <div className="table-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Search request, company, or item…"/></div>
      <TableScroll><table className="data-table execution-table"><thead><tr><th>Date</th><th>Request</th><th>Name</th><th>Company</th><th>Type</th><th>Items</th><th>Status</th><th>Completed</th><th className="actions-cell">Options</th></tr></thead>
        <tbody>{list.map(request => <tr key={request.number}><td>{formatDate(request.date)}</td><td>{request.number}{request.includeDrawings && <small className="execution-subvalue">With drawings</small>}</td><td>{request.name || '—'}</td><td>{label('service_companies', request.companyId)}</td><td>{request.kind}</td>
          <td className="description-cell">{request.items.slice(0, 4).join(', ')}{request.items.length > 4 ? ` +${request.items.length - 4}` : ''}</td><td><Badge>{request.status}</Badge></td><td>{formatDate(request.completedAt)}</td>
          <td className="actions-cell">{request.openIds.length > 0 && canRun(request.kind === 'Spool' ? 'complete-service' : 'complete-material-service') && <button className="btn small" onClick={() => setAction({ key: request.kind === 'Spool' ? 'complete-service' : 'complete-material-service', defaults: { requestIds: request.openIds } })}><CheckCircle2 size={14}/>Complete</button>}</td></tr>)}</tbody></table></TableScroll>
      {!list.length && <EmptyState title="No requests found" description="Service requests appear here once spools or materials are sent to a service company."/>}
      <div className="table-footer"><span>{list.length} request{list.length === 1 ? '' : 's'}</span><span>Newest first.</span></div>
    </section>
    {action && <WorkflowDialog actionKey={action.key} defaults={action.defaults} onClose={() => setAction(null)}/>}</div>;
}
