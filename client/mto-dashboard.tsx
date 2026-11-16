import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useWorkspace, activeRows } from './context.tsx';
import { formatDate, formatNumber } from './api.ts';
import { Badge, EmptyState, Modal, SearchInput, TableScroll } from './components.tsx';
import {
  AGING_BUCKETS, BOARD_PAGE_SIZE, BOARD_TABS, MTO_DASHBOARD_REQUIRED, SIGNALS, boardCounts, boardPage, boardSearchText, boardTabMatches, materialRevisionRows, mtoDashboard,
  type BoardRow, type BoardTab, type MtoDashboard, type Readiness,
} from '../shared/mto-dashboard.ts';

const READINESS_COLOR: Record<Readiness, string> = { STARTED: 'neutral', STARTABLE: 'green', PARTIAL: 'amber', BLOCKED: 'red' };
const SIGNAL_FILL: Record<string, string> = { 'Not-sent': '#8a9bb5', 'At service': '#e8ad41', 'At laydown': '#0064e8', Started: '#1a9a5c' };
const today = () => new Date().toISOString().slice(0, 10);
const qty = (value: number) => formatNumber(value, 3);

/** MTO Pilot Start page: material readiness of the isometrics of the selected main project (shared/mto-dashboard.ts). */
export function MtoDashboard() {
  const { rows, siteId, canRecord, label } = useWorkspace();
  const phaseSelect = useId(), tabsLabel = useId();
  const [phaseId, setPhaseId] = useState(''), [tab, setTab] = useState<BoardTab>('ALL'), [query, setQuery] = useState(''), [page, setPage] = useState(0), [report, setReport] = useState(false);
  const readable = MTO_DASHBOARD_REQUIRED.every(key => canRecord(key));
  const day = today();
  const computed = useMemo<{ model?: MtoDashboard; error?: string }>(() => {
    if (!readable) return {};
    try { return { model: mtoDashboard(rows, { phaseId, today: day }) }; } catch (failure) { return { error: (failure as Error).message || 'The figures could not be calculated.' }; }
  }, [rows, phaseId, day, readable]);
  const phases = useMemo(() => activeRows(rows, 'operation_phases').sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0) || String(a.name).localeCompare(String(b.name), 'en', { numeric: true })), [rows]);
  const site = rows.sites?.find(row => row.id === siteId);

  if (!readable) return <section className="panel md-state" role="alert"><EmptyState title="No access to the MTO dashboard" description="Your profile does not include the isometrics, requirements, stock, orders and pick lists this dashboard reads. Ask an administrator to open them for you."/></section>;
  if (computed.error || !computed.model) return <section className="panel md-state" role="alert"><EmptyState title="The dashboard could not be calculated" description={computed.error || 'Reload the workspace and try again.'}/></section>;
  const model = computed.model, { kpis, chips } = model;
  const phaseName = phases.find(row => row.id === phaseId)?.name;
  const counts = boardCounts(model.board);
  const needle = query.trim().toLowerCase();
  const listed = model.board.filter(row => boardTabMatches(row, tab) && (!needle || `${boardSearchText(row)} ${label('projects', row.projectId)}`.toLowerCase().includes(needle)));
  const current = boardPage(listed, page);
  const clear = () => { setTab('ALL'); setQuery(''); setPage(0); };
  const signalData = SIGNALS.map(signal => ({ signal, isometrics: model.signals[signal] }));
  const backlogData = model.backlog.map(item => ({ project: label('projects', item.projectId), 'Open ordered': item.openOrdered, 'Blocking backorder': item.blockingBackorder, 'Not ordered': item.notOrdered }));

  return <div className="md-dashboard">
    <section className="panel md-header" aria-label="Dashboard scope">
      <div><span className="eyebrow">MTO PILOT · START</span><h2>{String(site?.name || 'All main projects')}</h2>
        <p className="md-meta"><span>Date {formatDate(day)}</span>{siteId && <span>Site ID {siteId}</span>}<span>{kpis.inScope} isometric{kpis.inScope === 1 ? '' : 's'} in scope</span></p></div>
      <div className="md-controls">
        {phases.length > 0 && <div className="field md-field"><label htmlFor={phaseSelect}>Operation phase</label><select id={phaseSelect} value={phaseId} onChange={event => { setPhaseId(event.target.value); setPage(0); }}><option value="">All operation phases</option>{phases.map(row => <option key={row.id} value={row.id}>{String(row.name)}</option>)}</select></div>}
        <Badge color="neutral">Current {phaseName ? String(phaseName) : 'All operation phases'}</Badge>
        <button type="button" className="btn" onClick={() => setReport(true)} disabled={!canRecord('material_quantity_changes')} title={canRecord('material_quantity_changes') ? undefined : 'Your profile does not include the quantity log.'}><FileText size={16}/>Material revisions report</button>
      </div>
    </section>

    <section className="md-kpis" aria-label="MTO key figures">
      <div className="panel md-kpi"><small>Theoretical startable</small><strong>{kpis.startable}</strong><span>{kpis.inScope} in scope · {kpis.started} started</span></div>
      <div className="panel md-kpi"><small>Partially covered</small><strong>{kpis.partial}</strong><span>Some stock, not enough to start fully</span></div>
      <div className="panel md-kpi"><small>Blocked isometrics</small><strong>{kpis.blocked}</strong><span>Nothing covered from the free pool or reservations</span></div>
      <div className="panel md-kpi"><small>Blocking backorder qty</small><strong>{qty(kpis.blockingQuantity)}</strong><span>{kpis.blockingIsometrics} isometric{kpis.blockingIsometrics === 1 ? '' : 's'} waiting on ordered material · {qty(chips.openOrdered)} open ordered</span></div>
      <div className="panel md-kpi"><small>Not ordered materials</small><strong>{kpis.notOrderedMaterials}</strong><span>{kpis.notOrderedIsometrics} isometric{kpis.notOrderedIsometrics === 1 ? '' : 's'} still missing an order</span></div>
      <div className="panel md-kpi"><small>Free pool materials</small><strong>{kpis.freePoolMaterials}</strong><span>Materials with stock left after reservations</span></div>
    </section>

    <section className="panel md-visual" aria-labelledby="md-visual-title">
      <div className="panel-heading"><div><span className="eyebrow">OVERVIEW</span><h2 id="md-visual-title">Visual management</h2></div></div>
      <ul className="md-chips" aria-label="Figures in scope">
        {([['Max startable', chips.maxStartable], ['Free pool materials', chips.freePoolMaterials], ['Ordered', qty(chips.ordered)], ['Received', qty(chips.received)], ['Open ordered', qty(chips.openOrdered)], ['Blocking backorder', qty(chips.blockingBackorder)], ['Not ordered', qty(chips.notOrdered)],
          ...AGING_BUCKETS.map(bucket => [bucket, chips.aging[bucket]]), ['No logistics update', chips.noLogisticsUpdate]] as [string, string | number][]).map(([name, value]) => <li key={name}><span>{name}</span><strong>{value}</strong></li>)}
      </ul>
      {!model.board.length ? <EmptyState title="No material requirements in scope" description={phaseId ? 'No isometric of this project has requirements in the chosen operation phase.' : 'Add materials to the isometrics of this project to see their readiness.'}/> :
        <div className="md-charts">
          <figure className="md-chart"><figcaption>Isometrics by logistics signal</figcaption>
            <div role="img" aria-label={`Isometrics by logistics signal: ${signalData.map(item => `${item.signal} ${item.isometrics}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height={220}><BarChart data={signalData} margin={{ left: -20, right: 12, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e2eaf5" strokeDasharray="3 4"/><XAxis dataKey="signal" axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><Tooltip cursor={{ fill: '#edf4ff' }}/>
                <Bar dataKey="isometrics" name="Isometrics" radius={[5, 5, 0, 0]} maxBarSize={56} fill="#0064e8" shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: { signal: string } }) => <rect x={props.x} y={props.y} width={props.width} height={props.height} rx={5} fill={SIGNAL_FILL[props.payload?.signal || ''] || '#0064e8'}/>}/></BarChart></ResponsiveContainer></div></figure>
          <figure className="md-chart"><figcaption>Backlog by project</figcaption>
            <div role="img" aria-label={`Backlog by project: ${backlogData.map(item => `${item.project} open ordered ${item['Open ordered']}, blocking backorder ${item['Blocking backorder']}, not ordered ${item['Not ordered']}`).join('; ')}`}>
              <ResponsiveContainer width="100%" height={220}><BarChart data={backlogData} margin={{ left: -10, right: 12, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e2eaf5" strokeDasharray="3 4"/><XAxis dataKey="project" axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><Tooltip cursor={{ fill: '#edf4ff' }}/><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }}/>
                <Bar dataKey="Open ordered" stackId="backlog" fill="#0064e8" maxBarSize={56}/><Bar dataKey="Blocking backorder" stackId="backlog" fill="#c0392b" maxBarSize={56}/><Bar dataKey="Not ordered" stackId="backlog" fill="#e8ad41" radius={[5, 5, 0, 0]} maxBarSize={56}/></BarChart></ResponsiveContainer></div>
            <TableScroll><table className="data-table md-mini"><caption className="sr-only">Backlog by project</caption><thead><tr><th>Project</th><th>Open ordered</th><th>Blocking backorder</th><th>Not ordered</th></tr></thead>
              <tbody>{model.backlog.map(item => <tr key={item.projectId}><td>{label('projects', item.projectId)}</td><td>{qty(item.openOrdered)}</td><td>{qty(item.blockingBackorder)}</td><td>{qty(item.notOrdered)}</td></tr>)}</tbody></table></TableScroll></figure>
        </div>}
    </section>

    <section className="panel md-focus" aria-labelledby="md-focus-title">
      <div className="panel-heading"><div><span className="eyebrow">READINESS</span><h2 id="md-focus-title">Readiness focus</h2></div></div>
      <div className="md-focus-grid">
        <div><h3>Top startable isometrics</h3>{model.focus.startable.length ? <ol className="md-list">{model.focus.startable.map(row => <li key={row.isoId}><Link to={`/workspace/isometrics/${row.isoId}`}>{row.isoNo}</Link><span>{label('projects', row.projectId)} · {row.priority}</span></li>)}</ol> : <p className="md-none">No isometric can be started in full right now.</p>}</div>
        <div><h3>Top blocked isometrics</h3>{model.focus.blocked.length ? <ol className="md-list">{model.focus.blocked.map(row => <li key={row.isoId}><Link to={`/workspace/isometrics/${row.isoId}`}>{row.isoNo}</Link><span>Short {qty(row.shortage)} · {row.shortageMaterials.slice(0, 2).map(item => item.materialNo).join(', ')}</span></li>)}</ol> : <p className="md-none">No isometric is blocked.</p>}</div>
        <div><h3>Hottest blocker materials</h3>{model.focus.materials.length ? <ol className="md-list">{model.focus.materials.map(item => <li key={item.identity}><strong>{item.materialNo}</strong><span>{item.isometrics} isometric{item.isometrics === 1 ? '' : 's'} · short {qty(item.shortage)}{item.description ? ` · ${item.description}` : ''}</span></li>)}</ol> : <p className="md-none">No material is short.</p>}</div>
      </div>
    </section>

    <section className="panel md-board" aria-labelledby="md-board-title">
      <div className="panel-heading"><div><span className="eyebrow">EXECUTION</span><h2 id="md-board-title">Operations board</h2></div></div>
      <div className="md-tabs" role="group" aria-labelledby={tabsLabel}><span id={tabsLabel} className="sr-only">Board view</span>
        {BOARD_TABS.map(item => <button key={item} type="button" className={tab === item ? 'selected' : ''} aria-pressed={tab === item} onClick={() => { setTab(item); setPage(0); }}>{item}<span>{counts[item]}</span></button>)}</div>
      <div className="md-toolbar"><SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder="Search isometric, project or material…"/>
        <button type="button" className="text-link" onClick={clear} disabled={tab === 'ALL' && !query}>Clear filters</button></div>
      {!model.board.length ? <EmptyState title="No isometrics to show" description="Isometrics appear here once they have material requirements."/>
        : !listed.length ? <EmptyState title="No matching isometrics" description={query ? 'Try another search or clear the filters.' : `No isometric is on the ${tab} view right now.`}/>
        : <><TableScroll><table className="data-table md-table"><thead><tr><th>Project / ISO</th><th>Readiness</th><th>Shortage</th><th>Blocking backorder</th><th>Not ordered</th><th>Logistics / Aging</th><th>Action</th></tr></thead>
          <tbody>{current.items.map(row => <BoardLine key={row.isoId} row={row} project={String(label('projects', row.projectId))}/>)}</tbody></table></TableScroll>
          <div className="wd-pager"><span role="status" aria-live="polite">{current.page * BOARD_PAGE_SIZE + 1}–{current.page * BOARD_PAGE_SIZE + current.items.length} of {listed.length} isometrics</span>
            <button type="button" className="btn small" onClick={() => setPage(current.page - 1)} disabled={current.page === 0}><ChevronLeft size={15}/>Previous</button><span>Page {current.page + 1} of {current.pages}</span>
            <button type="button" className="btn small" onClick={() => setPage(current.page + 1)} disabled={current.page >= current.pages - 1}>Next<ChevronRight size={15}/></button></div></>}
    </section>
    {report && <RevisionsReport phaseId={phaseId} phaseName={phaseName ? String(phaseName) : ''} onClose={() => setReport(false)}/>}
  </div>;
}

function BoardLine({ row, project }: { row: BoardRow; project: string }) {
  return <tr>
    <td><strong>{row.isoNo}</strong><small className="wd-sub">{project} · {row.priority}</small></td>
    <td><Badge color={READINESS_COLOR[row.readiness]}>{row.readiness}</Badge><small className="wd-sub">Covered {row.coveredLines} / {row.totalLines}</small></td>
    <td>{row.shortage > 0 ? <><strong>{qty(row.shortage)}</strong><small className="wd-sub">{row.shortageMaterials.slice(0, 3).map(item => item.materialNo).join(', ')}{row.shortageMaterials.length > 3 ? ` +${row.shortageMaterials.length - 3}` : ''}</small></> : '—'}</td>
    <td>{row.blockingBackorder > 0 ? qty(row.blockingBackorder) : '—'}</td>
    <td>{row.notOrdered > 0 ? qty(row.notOrdered) : '—'}</td>
    <td><Badge color={row.signal === 'Not-sent' ? 'neutral' : row.signal === 'Started' ? 'green' : 'amber'}>{row.signal}</Badge>
      <small className="wd-sub">{row.ageDays === null ? 'No logistics update' : `${row.lastEvent ? `Last event ${formatDate(row.lastEvent)} · ` : 'Open order · '}${row.ageDays} day${row.ageDays === 1 ? '' : 's'}`}</small></td>
    <td><Link className="text-link" to={`/workspace/isometrics/${row.isoId}`} aria-label={`Open isometric ${row.isoNo}`}>Open<ArrowRight size={14}/></Link></td>
  </tr>;
}

/** The quantity-by-revision log of every requirement in view, as one report. */
function RevisionsReport({ phaseId, phaseName, onClose }: { phaseId: string; phaseName: string; onClose: () => void }) {
  const { rows, label } = useWorkspace();
  const lines = useMemo(() => materialRevisionRows(rows, phaseId), [rows, phaseId]);
  return <Modal title="Material revisions report" subtitle={phaseName ? `Operation phase ${phaseName}` : 'All operation phases'} onClose={onClose} wide>
    <div className="modal-body">
      {!lines.length ? <EmptyState title="No quantity changes recorded" description="Quantity edits and removals by drawing revision appear here."/>
        : <TableScroll><table className="data-table md-report"><thead><tr><th>Project</th><th>ISO</th><th>Mat.no.</th><th>Description</th><th>Change</th><th>Revision</th><th>Date</th><th>Previous</th><th>Change qty.</th><th>Now</th><th>Notes</th></tr></thead>
          <tbody>{lines.map(line => <tr key={line.id}><td>{label('projects', line.projectId)}</td><td>{line.isoNo}</td><td>{line.materialNo}</td><td>{line.description || '—'}</td><td>{line.type || '—'}</td><td>{line.revision || '—'}</td><td>{formatDate(line.date)}</td><td>{qty(line.previous)}</td><td>{qty(line.change)}</td><td>{qty(line.quantity)}</td><td>{line.note || '—'}</td></tr>)}</tbody></table></TableScroll>}
      <p className="md-none" role="status"><AlertTriangle size={13} aria-hidden="true"/> {lines.length} change{lines.length === 1 ? '' : 's'}.</p>
    </div>
    <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button></div>
  </Modal>;
}
