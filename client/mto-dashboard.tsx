import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { phasesByName } from '../shared/material-db.ts';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useWorkspace } from './context.tsx';
import { formatDate, formatNumber } from './api.ts';
import { Badge, EmptyState, Modal, SearchInput, TableScroll } from './components.tsx';
import {
  AGING_BUCKETS, ALL_PHASES, BOARD_COLUMNS, BOARD_PAGE_SIZES, BOARD_RELOAD_MS, BOARD_TABS, DASHBOARD_FILTER_PARAMS, KPI_FILTERS, MATERIAL_VIEW_COLUMNS, MATERIAL_VIEW_TAB, MTO_DASHBOARD_REQUIRED, READINESS_LABEL, SIGNAL_LABEL,
  boardPage, boardSearchText, boardTabMatches, dashboardFilters, dashboardPanels, defaultDashboardPhase, materialList, materialRevisionRows, materialSearchText, mtoDashboard,
  type BoardRow, type BoardTab, type MaterialRow, type MtoDashboard, type Readiness,
} from '../shared/mto-dashboard.ts';

const READINESS_COLOR: Record<Readiness, string> = { STARTED: 'neutral', STARTABLE: 'green', PARTIAL: 'amber', BLOCKED: 'red' };
const LOCATION_FILL = (location: string) => location === 'Not sent' ? '#8a9bb5' : location === 'Materials issued' ? '#1a9a5c' : '#0064e8';
/** Quick filters that need the logistics area (1) or the orders area (3). */
const LOGISTICS_TABS: BoardTab[] = ['At service', 'At laydown', 'Aging'];
const today = () => new Date().toISOString().slice(0, 10);
const qty = (value: number) => formatNumber(value, 3);

/** MTO Pilot Start page: material readiness of the isometrics of the selected main project (shared/mto-dashboard.ts). */
export function MtoDashboard() {
  const { rows, siteId, canRecord, canArea, label, refresh } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const phaseSelect = useId(), tabsLabel = useId(), lengthSelect = useId();
  const boardRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<BoardTab>('All'), [query, setQuery] = useState(''), [page, setPage] = useState(0), [pageSize, setPageSize] = useState<number>(BOARD_PAGE_SIZES[0]), [report, setReport] = useState(false);
  const panels = dashboardPanels(key => canArea(key));
  const readable = MTO_DASHBOARD_REQUIRED.every(key => canRecord(key)) && (panels.materials || panels.orders || panels.logistics);
  // The reference lists the phases A-Z after "All operation phases" (capture mto__start__dashboard.txt:126) and opens on Shop every time.
  const phases = useMemo(() => phasesByName(rows.operation_phases), [rows]);
  const filters = dashboardFilters(params, defaultDashboardPhase(phases));
  const day = today(), filterKey = JSON.stringify(filters);
  const computed = useMemo<{ model?: MtoDashboard; error?: string }>(() => {
    if (!readable) return {};
    try { return { model: mtoDashboard(rows, { ...JSON.parse(filterKey), today: day }) }; } catch (failure) { return { error: (failure as Error).message || 'The figures could not be calculated.' }; }
  }, [rows, filterKey, day, readable]);
  // The board reloads every 45 seconds while the page is open and visible.
  useEffect(() => { if (!readable) return; const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, BOARD_RELOAD_MS); return () => window.clearInterval(timer); }, [readable, refresh]);
  const site = rows.sites?.find(row => row.id === siteId);

  if (!readable) return <section className="panel md-state" role="alert"><EmptyState title="No access to the MTO dashboard" description="Your profile does not include the dashboard areas or the isometrics, requirements, stock, orders and pick lists this dashboard reads. Ask an administrator to open them for you."/></section>;
  if (computed.error || !computed.model) return <section className="panel md-state" role="alert"><EmptyState title="The dashboard could not be calculated" description={computed.error || 'Reload the workspace and try again.'}/></section>;
  const model = computed.model, { kpis, chips, progress } = model;
  const phaseName = phases.find(row => row.id === filters.phaseId)?.name;
  const tabs = BOARD_TABS.filter(item => (panels.logistics || !LOGISTICS_TABS.includes(item)) && (panels.orders || item !== MATERIAL_VIEW_TAB));
  const current = tabs.includes(tab) ? tab : 'All';
  const materialView = current === MATERIAL_VIEW_TAB;
  const needle = query.trim().toLowerCase();
  const isoRows = model.board.filter(row => boardTabMatches(row, current) && (!needle || `${boardSearchText(row)} ${label('projects', row.projectId)}`.toLowerCase().includes(needle)));
  const materialRows = model.materials.filter(row => !needle || materialSearchText(row).includes(needle));
  const listed: (BoardRow | MaterialRow)[] = materialView ? materialRows : isoRows;
  const shown = boardPage(listed, page, pageSize);
  const choose = (next: BoardTab) => { setTab(next); setPage(0); };
  const open = (next: BoardTab) => { choose(next); boardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); };
  const setPhase = (value: string) => { const next = new URLSearchParams(params); next.set(DASHBOARD_FILTER_PARAMS.phaseId, value || ALL_PHASES); setParams(next); setPage(0); };
  const clearServerFilters = () => { setParams(new URLSearchParams()); setTab('All'); setQuery(''); setPage(0); };
  const serverChips: [string, string][] = [['Operation phase', phaseName ? String(phaseName) : 'All operation phases'],
    ...(filters.projectId ? [['Project', label('projects', filters.projectId)] as [string, string]] : []),
    ...(filters.spoolId ? [['Spool', label('spools', filters.spoolId)] as [string, string]] : []),
    ...(filters.supplierId ? [['Supplier', label('suppliers', filters.supplierId)] as [string, string]] : [])];
  const locationData = model.locations.map(bar => ({ label: bar.label, location: bar.location, isometrics: bar.isometrics }));
  const backlogData = model.backlog.map(item => ({ scope: item.scope, 'Open ordered': item.openOrdered, 'Blocking backorder': item.blockingBackorder, 'Not ordered': item.notOrdered }));
  const visualChips: [string, string | number][] = [
    ...(panels.materials ? [['Max startable', chips.maxStartable], ['Free pool materials', chips.freePoolMaterials]] as [string, number][] : []),
    ...(panels.orders ? [['Ordered', qty(chips.ordered)], ['Received', qty(chips.received)], ['Open ordered', qty(chips.openOrdered)], ['Blocking backorder', qty(chips.blockingBackorder)], ['Not ordered', qty(chips.notOrdered)]] as [string, string][] : []),
    ...(panels.logistics ? [...AGING_BUCKETS.map(bucket => [bucket, chips.aging[bucket]] as [string, number]), ['No logistics update', chips.noLogisticsUpdate] as [string, number]] : []),
  ];
  const kpi = (title: string, value: string | number, caption: string, filter: BoardTab) =>
    <button type="button" className="panel md-kpi" onClick={() => open(filter)} aria-label={`${title} ${value}. ${caption} Show on the operations board.`}><small>{title}</small><strong>{value}</strong><span>{caption}</span></button>;
  const shownPercent = (value: number | null) => value === null ? '—' : `${formatNumber(value, 1)} %`;
  const figure = (title: string, value: string, caption: string) => <div className="panel md-kpi" role="group" aria-label={`${title} ${value}. ${caption}`}><small>{title}</small><strong>{value}</strong><span>{caption}</span></div>;
  const columns = materialView ? MATERIAL_VIEW_COLUMNS : BOARD_COLUMNS.filter(column => panels.logistics || column !== 'Logistics / aging');

  return <div className="md-dashboard">
    <section className="panel md-header" aria-label="Dashboard scope">
      <div><span className="eyebrow">MTO PILOT · START</span><h2>{String(site?.name || 'All main projects')}</h2>
        <p className="md-meta"><span>Date {formatDate(day)}</span>{siteId && <span>Site ID {siteId}</span>}<span>{kpis.inScope} isometric{kpis.inScope === 1 ? '' : 's'} in scope</span></p></div>
      <div className="md-controls">
        {phases.length > 0 && <div className="field md-field"><label htmlFor={phaseSelect}>Operation phase</label><select id={phaseSelect} value={filters.phaseId} onChange={event => setPhase(event.target.value)}><option value="">All operation phases</option>{phases.map(row => <option key={row.id} value={row.id}>{String(row.name)}</option>)}</select></div>}
        <Badge color="neutral">Current {phaseName ? String(phaseName) : 'All operation phases'}</Badge>
        <button type="button" className="btn" onClick={() => setReport(true)} disabled={!canRecord('material_quantity_changes')} title={canRecord('material_quantity_changes') ? undefined : 'Your profile does not include the quantity log.'}><FileText size={16}/>Material revisions report</button>
      </div>
    </section>

    {panels.materials && <section className="md-kpis" aria-label="MTO progress">
      {figure('Ordered', shownPercent(progress.orderedPercent), `${qty(progress.ordered)} of ${qty(progress.required)} required quantity ordered.`)}
      {figure('Received', shownPercent(progress.receivedPercent), `${qty(progress.received)} of ${qty(progress.required)} required quantity received.`)}
      {figure('Isometrics started', shownPercent(progress.startedPercent), `${progress.started} of ${progress.isometrics} isometrics have an Execution Start.`)}
    </section>}

    {panels.materials && <section className="md-kpis" aria-label="MTO key figures">
      {kpi('Theoretical startable', kpis.startable, `${kpis.inScope} isometrics in scope. Started ${kpis.started}.`, KPI_FILTERS.startable)}
      {kpi('Partially covered', kpis.partial, 'Some stock available, but not enough to start fully.', KPI_FILTERS.partial)}
      {kpi('Blocked isometrics', kpis.blocked, `Shortage in free pool. Reserved: ${qty(kpis.reserved)}.`, KPI_FILTERS.blocked)}
      {kpi('Blocking backorder qty', qty(kpis.blockingQuantity), `${kpis.blockingIsometrics} isometrics wait on ordered material. Open ordered total ${qty(kpis.openOrdered)}.`, panels.orders ? KPI_FILTERS.backorder : 'All')}
      {kpi('Not ordered materials', kpis.notOrderedMaterials, `${kpis.notOrderedIsometrics} isometrics still miss an order. Unique materials in current scope.`, KPI_FILTERS.notOrdered)}
      {kpi('Free pool materials', kpis.freePoolMaterials, 'Unique materials in scope with positive free pool after take-ins, issues and reservations.', KPI_FILTERS.freePool)}
    </section>}

    <section className="panel md-visual" aria-labelledby="md-visual-title">
      <div className="panel-heading"><div><span className="eyebrow">OVERVIEW</span><h2 id="md-visual-title">Visual management</h2></div></div>
      {visualChips.length > 0 && <ul className="md-chips" aria-label="Figures in scope">{visualChips.map(([name, value]) => <li key={name}><span>{name}</span><strong>{value}</strong></li>)}</ul>}
      {!model.board.length ? <EmptyState title="No material requirements in scope" description={filters.phaseId ? 'No isometric of this project has requirements in the chosen operation phase.' : 'Add materials to the isometrics of this project to see their readiness.'}/> :
        (panels.logistics || panels.orders) && <div className="md-charts">
          {panels.logistics && <figure className="md-chart"><figcaption>Isometrics by logistics signal</figcaption>
            <div role="img" aria-label={`Isometrics by logistics signal: ${locationData.map(item => `${item.location} ${item.isometrics}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height={220}><BarChart data={locationData} margin={{ left: -20, right: 12, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e2eaf5" strokeDasharray="3 4"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><Tooltip cursor={{ fill: '#edf4ff' }} labelFormatter={(_, payload) => String(payload?.[0]?.payload?.location ?? '')}/>
                <Bar dataKey="isometrics" name="ISOs" radius={[5, 5, 0, 0]} maxBarSize={56} fill="#0064e8" shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: { location: string } }) => <rect x={props.x} y={props.y} width={props.width} height={props.height} rx={5} fill={LOCATION_FILL(props.payload?.location || '')}/>}/></BarChart></ResponsiveContainer></div></figure>}
          {panels.orders && <figure className="md-chart"><figcaption>Backlog by site</figcaption>
            <div role="img" aria-label={`Backlog by site: ${backlogData.map(item => `${item.scope} open ordered ${item['Open ordered']}, blocking backorder ${item['Blocking backorder']}, not ordered ${item['Not ordered']}`).join('; ')}`}>
              <ResponsiveContainer width="100%" height={220}><BarChart data={backlogData} margin={{ left: -10, right: 12, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e2eaf5" strokeDasharray="3 4"/><XAxis dataKey="scope" axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: '#586b88', fontSize: 12 }}/><Tooltip cursor={{ fill: '#edf4ff' }}/><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }}/>
                <Bar dataKey="Open ordered" fill="#0064e8" maxBarSize={56}/><Bar dataKey="Blocking backorder" fill="#c0392b" maxBarSize={56}/><Bar dataKey="Not ordered" fill="#e8ad41" radius={[5, 5, 0, 0]} maxBarSize={56}/></BarChart></ResponsiveContainer></div>
            <TableScroll><table className="data-table md-mini"><caption className="sr-only">Backlog by site</caption><thead><tr><th>Scope</th><th>Open ordered</th><th>Blocking backorder</th><th>Not ordered</th></tr></thead>
              <tbody>{model.backlog.map(item => <tr key={item.scope}><td>{item.scope}</td><td>{qty(item.openOrdered)}</td><td>{qty(item.blockingBackorder)}</td><td>{qty(item.notOrdered)}</td></tr>)}</tbody></table></TableScroll></figure>}
        </div>}
    </section>

    {panels.materials && <section className="panel md-focus" aria-labelledby="md-focus-title">
      <div className="panel-heading"><div><span className="eyebrow">READINESS</span><h2 id="md-focus-title">Readiness focus</h2></div></div>
      <div className="md-focus-grid">
        <div><h3>Top startable isometrics</h3>{model.focus.startable.length ? <ol className="md-list">{model.focus.startable.map(row => <li key={row.isoId}><Link to={`/workspace/isometrics/${row.isoId}`}>{row.isoNo}</Link><span>{label('projects', row.projectId)} · {row.priority}</span></li>)}</ol> : <p className="md-none">No items in this category.</p>}</div>
        <div><h3>Top blocked isometrics</h3>{model.focus.blocked.length ? <ol className="md-list">{model.focus.blocked.map(row => <li key={row.isoId}><Link to={`/workspace/isometrics/${row.isoId}`}>{row.isoNo}</Link><span>Short {qty(row.shortage)} · {row.shortageMaterials.slice(0, 2).map(item => item.materialNo).join(', ')}</span></li>)}</ol> : <p className="md-none">No items in this category.</p>}</div>
        <div><h3>Hottest blocker materials</h3>{model.focus.materials.length ? <ol className="md-list">{model.focus.materials.map(item => <li key={item.identity}><strong>{item.materialNo}</strong><span>{item.isometrics} isometric{item.isometrics === 1 ? '' : 's'} · short {qty(item.shortage)}{item.description ? ` · ${item.description}` : ''}</span></li>)}</ol> : <p className="md-none">No items in this category.</p>}</div>
      </div>
    </section>}

    {panels.materials && <section ref={boardRef} className="panel md-board" aria-labelledby="md-board-title">
      <div className="panel-heading"><div><span className="eyebrow">EXECUTION</span><h2 id="md-board-title">Operations board</h2></div></div>
      <div className="md-tabs" role="group" aria-labelledby={tabsLabel}><span id={tabsLabel} className="sr-only">Board view</span>
        {tabs.map(item => <button key={item} type="button" className={current === item ? 'selected' : ''} aria-pressed={current === item} onClick={() => choose(item)}>{item}</button>)}</div>
      <div className="md-toolbar">
        <ul className="md-filter-chips" aria-label="Server-side filters">{serverChips.map(([name, value]) => <li key={name}><Badge color="neutral">{name} {value}</Badge></li>)}</ul>
        <button type="button" className="text-link" onClick={clearServerFilters}>Clear server-side filters</button>
      </div>
      <div className="md-toolbar">
        <div className="field md-length"><label htmlFor={lengthSelect}>Show</label><select id={lengthSelect} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}>{BOARD_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select><span>entries</span></div>
        <SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder="Search"/>
      </div>
      {!listed.length ? <EmptyState title={materialView ? 'No open ordered materials' : !model.board.length ? 'No isometrics to show' : 'No matching records found'} description={query ? 'Try another search or choose All.' : materialView ? 'No material in scope is ordered and still open.' : !model.board.length ? 'Isometrics appear here once they have material requirements.' : `No isometric is on the ${current} view right now.`}/>
        : <><TableScroll><table className="data-table md-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{materialView ? (shown.items as MaterialRow[]).map(row => <MaterialLine key={row.identity} row={row}/>)
            : (shown.items as BoardRow[]).map(row => <BoardLine key={row.isoId} row={row} project={String(label('projects', row.projectId))} logistics={panels.logistics}/>)}</tbody></table></TableScroll>
          <div className="wd-pager"><span role="status" aria-live="polite">Showing {shown.page * pageSize + 1} to {shown.page * pageSize + shown.items.length} of {listed.length} entries</span>
            <button type="button" className="btn small" onClick={() => setPage(shown.page - 1)} disabled={shown.page === 0}><ChevronLeft size={15}/>Previous</button><span>Page {shown.page + 1} of {shown.pages}</span>
            <button type="button" className="btn small" onClick={() => setPage(shown.page + 1)} disabled={shown.page >= shown.pages - 1}>Next<ChevronRight size={15}/></button></div></>}
      <p className="md-note">{materialView ? 'Open ordered view shows material items instead of isometrics for the current server-side scope.' : 'The board keeps isometric readiness separate from logistics signals.'}</p>
    </section>}
    {report && <RevisionsReport phaseId={filters.phaseId} phaseName={phaseName ? String(phaseName) : ''} onClose={() => setReport(false)}/>}
  </div>;
}

function BoardLine({ row, project, logistics }: { row: BoardRow; project: string; logistics: boolean }) {
  return <tr>
    <td><strong>{row.isoNo}</strong><small className="wd-sub">{project} · {row.priority}</small></td>
    <td><Badge color={READINESS_COLOR[row.readiness]}>{READINESS_LABEL[row.readiness]}</Badge><small className="wd-sub">Covered {qty(row.covered)} / {qty(row.required)}</small></td>
    <td><strong>{qty(row.shortage)}</strong><small className="wd-sub">{row.shortage > 0 ? materialList(row.shortageMaterials, 2) : 'No blockers'}</small></td>
    <td><strong>{qty(row.blockingBackorder)}</strong><small className="wd-sub">{row.blockingBackorder > 0 ? materialList(row.backorderMaterials) : 'No ordered blockers'}</small></td>
    <td><strong>{qty(row.notOrdered)}</strong><small className="wd-sub">Still not ordered</small></td>
    {logistics && <td><Badge color={row.signal === 'Not-sent' ? 'neutral' : row.signal === 'Started' ? 'green' : 'amber'}>{SIGNAL_LABEL[row.signal]}</Badge><small className="wd-sub">{row.logistics}</small></td>}
    <td><Link className="text-link" to={`/workspace/isometrics/${row.isoId}`} aria-label={`Open isometric ${row.isoNo}`}>ISO<ArrowRight size={14}/></Link></td>
  </tr>;
}

function MaterialLine({ row }: { row: MaterialRow }) {
  return <tr><td><strong>{row.materialNo}</strong></td><td>{row.description || '—'}</td><td>{qty(row.shortage)}</td><td>{qty(row.openOrdered)}</td><td>{qty(row.notOrdered)}</td></tr>;
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
