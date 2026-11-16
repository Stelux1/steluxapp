import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ClipboardCheck, Link2, Loader2, Pencil, Plus, Unlink } from 'lucide-react';
import { useWorkspace, activeRows } from './context.tsx';
import { ApiError, api, formatDate, formatNumber } from './api.ts';
import { post } from './api.ts';
import { Badge, Dropdown, EmptyState, Modal, SearchInput } from './components.tsx';
import {
  COMPLIANCE_PAGE_SIZE, COMPLIANCE_TEXTS, FILTER_PLACEHOLDERS, GROUP_FILTERS, VIEW_OPTIONS, breakdownText, dashboardFilterCount, defaultDashboardFilters, filterGroups, filterSummary,
  itpOptionLabel, localDay, ndtProcessLabel, pageOf, pageRange, percentLabel, scheduleDashboardRefresh, viewLabel, weldDashboard, welderOptionLabel,
  type ComplianceGroup, type DashboardFilters, type GroupFilter, type GroupTracerProposal, type WeldView,
} from '../shared/weld-dashboard.ts';
import { DEFAULT_NDT_PERCENT, ITP_SLOTS, itpNdtPercent, itpUsage } from '../shared/itp-dashboard.ts';
import { TRACERS_REQUIRED, TRACER_LOCKED_HINT, TRACER_MAX_TEXT, TRACER_REMOVABLE_HINT } from '../shared/inspections.ts';
import { allowedScopes, itpActive, itpLatest, itpPickerOptions, itpScope, type LinkSlot } from '../shared/itps.ts';
import type { Row } from '../shared/types.ts';
import { DashboardReports } from './dashboard-reports.tsx';

const show = (value: unknown) => String(value ?? '').trim();
const distinct = (rows: Row[], key: string) => [...new Set(rows.map(row => show(row[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const failureText = (failure: unknown) => ((failure as ApiError).fields && Object.values((failure as ApiError).fields!)[0]) || (failure as Error).message || 'Saving failed.';
type Option = { value: string; label: string };

// ----- Weld Pilot dashboard (below the project header and the WDI panel) ---------------------------------------------

function Select({ label, value, onChange, options, any = FILTER_PLACEHOLDERS.any }: { label: string; value: string; onChange: (value: string) => void; options: Option[]; any?: string }) {
  const id = useId();
  return <div className="field wd-field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={event => onChange(event.target.value)}><option value="">{any}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}
/** Multi-select of the reference (select2 MULTIPLE): a list of check boxes; empty means all. */
function MultiSelect({ label, value, onChange, options, placeholder }: { label: string; value: string[]; onChange: (value: string[]) => void; options: Option[]; placeholder: string }) {
  const id = useId();
  const chosen = options.filter(option => value.includes(option.value));
  const summary = chosen.length ? chosen.length > 2 ? `${chosen.length} selected` : chosen.map(option => option.label).join(', ') : placeholder;
  return <div className="field wd-field"><span className="wd-label" id={id}>{label}</span>
    <Dropdown className="wd-multi" menuClassName="wd-multi-menu" label={`${label}: ${chosen.length ? chosen.map(option => option.label).join(', ') : placeholder}`} trigger={<span className={`wd-multi-trigger ${chosen.length ? '' : 'placeholder'}`}><span>{summary}</span><ChevronDown size={15} aria-hidden="true"/></span>}>
      <div role="group" aria-labelledby={id}>
        {options.length ? options.map(option => <label key={option.value} className="wd-multi-option"><input type="checkbox" checked={value.includes(option.value)} onChange={event => onChange(event.target.checked ? [...value, option.value] : value.filter(item => item !== option.value))}/><span>{option.label}</span></label>)
          : <p className="wd-multi-empty">Nothing to choose.</p>}
        {value.length > 0 && <button type="button" className="wd-multi-clear" onClick={() => onChange([])}>{placeholder}</button>}
      </div>
    </Dropdown></div>;
}
const named = (rows: Row[], key = 'name') => rows.map(row => ({ value: row.id, label: show(row[key]) || show(row.number) || row.id })).sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
const labelled = (rows: Row[], label: (row: Row) => string, sort = (a: Row, b: Row) => label(a).localeCompare(label(b), 'en', { numeric: true })) => [...rows].sort(sort).map(row => ({ value: row.id, label: label(row) }));

/** One of the three bars of a group: "Tested 2 / 1" filled min(100, value / required) %. */
function Bar({ label, value, required, percent, tone }: { label: string; value: number; required: number; percent: number; tone: 'tested' | 'selected' | 'remaining' }) {
  return <div className="wd-progress"><span>{label}</span><div className="wd-bar" role="img" aria-label={`${label} ${value} of ${required} required`}><span className={tone} style={{ width: `${percent}%` }}/></div><strong>{value} / {required}</strong></div>;
}

const FLAG_COLORS = { ok: 'green', warn: 'amber', bad: 'red' } as const;
function GroupCard({ group, onTracers, tracersOpen }: { group: ComplianceGroup; onTracers: (group: ComplianceGroup) => void; tracersOpen: boolean }) {
  const d = group.defects;
  const metric = (label: string, value: string | number) => <div><dt>{label}</dt><dd>{value}</dd></div>;
  return <article className={`wd-group ${group.compliant ? '' : 'is-bad'} flag-${d.flag}`} aria-label={`${group.welderLabel}, WPS ${group.wpsName}, ITP/KNR ${group.itpNumber}`}>
    <header className="wd-group-head"><h3>{group.welderLabel}</h3><Badge color={group.compliant ? 'green' : 'red'}>{group.compliant ? 'COMPLIANT' : 'NOT COMPLIANT'}</Badge></header>
    <p className="wd-group-context">WPS: <strong>{group.wpsName}</strong> | ITP/KNR: <strong>{group.itpNumber}</strong> | NDT %: <strong>{group.percentLabel}</strong>{group.issue && <span className="wd-issue">{group.issue}</span>}</p>
    <dl className="wd-group-metrics">{metric(COMPLIANCE_TEXTS.totalWelds, group.total)}{metric(COMPLIANCE_TEXTS.requiredExam, group.required)}{metric(COMPLIANCE_TEXTS.examinedWelds, group.examined)}{metric(COMPLIANCE_TEXTS.selectedExam, group.selected)}{metric(COMPLIANCE_TEXTS.remainingRequired, group.remaining)}</dl>
    <div className="wd-progress-stack">
      <Bar label="Tested" value={group.examined} required={group.required} percent={group.testedPercent} tone="tested"/>
      <Bar label="Selected" value={group.selected} required={group.required} percent={group.selectedPercent} tone="selected"/>
      <Bar label="Remaining" value={group.remaining} required={group.required} percent={group.remainingPercent} tone="remaining"/>
    </div>
    <section className="wd-defect" aria-label={COMPLIANCE_TEXTS.defectTitle}>
      <div className="wd-defect-head"><h4>{COMPLIANCE_TEXTS.defectTitle}</h4><span className={`wd-flag ${d.flag}`} title={d.flagReason || undefined}><Badge color={FLAG_COLORS[d.flag]}>{d.flag.toUpperCase()}</Badge>{d.flagReason && <span className="sr-only">{d.flagReason}</span>}</span></div>
      <dl className="wd-defects">
        {metric('Welds', d.welds)}{metric('Examined', d.examined)}{metric('Exam %', percentLabel(d.examinedPercent))}{metric('Rejected', d.rejected)}{metric('Reject %', percentLabel(d.rejectedPercent))}
        {d.tracerAction && tracersOpen
          ? <div><dt>Tracers</dt><dd><button type="button" className="wd-tracer-button" onClick={() => onTracers(group)} aria-label={`Tracers ${d.tracerWelds}, ${d.tracerHint}. Open the tracer proposal.`}><strong>{d.tracerWelds}</strong><small>{d.tracerHint}</small></button></dd></div>
          : metric('Tracers', d.tracerWelds)}
        <div><dt>Tracer status</dt><dd>{d.tracerStatus.value}<small className="wd-sub">{d.tracerStatus.hint}</small></dd></div>
      </dl>
    </section>
  </article>;
}

export function WeldDashboard() {
  const { rows, allRows, canRecord, canRun, siteId, refresh, label } = useWorkspace();
  const today = localDay();
  const [draft, setDraft] = useState<DashboardFilters>(() => defaultDashboardFilters(today)), [filters, setFilters] = useState<DashboardFilters>(() => defaultDashboardFilters(today));
  const [mode, setMode] = useState<GroupFilter>('Not compliant'), [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const [view, setView] = useState<WeldView>('welds'), [manager, setManager] = useState(false), [proposal, setProposal] = useState<ComplianceGroup | null>(null);
  const readable = canRecord('welds') && canRecord('isometrics');
  const itpsReadable = canRecord('itps');
  const isos = activeRows(rows, 'isometrics');
  const site = rows.sites?.find(row => row.id === siteId) ?? rows.sites?.find(row => !row._archived);
  const result = useMemo(() => weldDashboard({
    welds: rows.welds || [], isometrics: rows.isometrics || [], projects: rows.projects || [], weldTypes: rows.weld_types || [], welders: rows.welders || [], wps: rows.wps || [], itps: itpsReadable ? rows.itps || [] : [],
    ndtProcesses: rows.ndt_processes || [], ndtGroups: rows.ndt_groups || [], requests: rows.inspection_requests || [], results: rows.inspection_results || [], diameters: rows.diameters || [], tracerWelds: allRows.welds || rows.welds || [],
  }, filters, site, view), [rows, allRows, filters, site, itpsReadable, view]);
  // The reference reloads the dashboard every 3 minutes while it is open.
  useEffect(() => readable ? scheduleDashboardRefresh(() => { void refresh(); }) : undefined, [readable, refresh]);
  if (!readable) return <section className="panel wd-state" role="alert"><EmptyState title="No access to the weld dashboard" description="Your profile does not include the weld register or the isometrics. Ask an administrator to open them for you."/></section>;

  const { kpis, summary } = result, performance = kpis.repairPerformance, defaults = defaultDashboardFilters(today);
  const set = <K extends keyof DashboardFilters>(key: K) => (value: DashboardFilters[K]) => setDraft(current => ({ ...current, [key]: value }));
  const apply = (event: FormEvent) => { event.preventDefault(); setFilters(draft); setPage(0); };
  const reset = () => { setDraft(defaults); setFilters(defaults); setPage(0); };
  const listed = filterGroups(result.compliance, mode, query), current = pageOf(listed, page);
  const counts = { notCompliant: summary.notCompliantGroups, compliant: summary.compliantGroups };
  const amount = (value: number) => view === 'length' ? `${formatNumber(value, 0)} mm` : formatNumber(value, 0);
  const tracersOpen = canRecord('inspection_results');

  return <div className="wd-dashboard">
    <section className="wd-kpis" aria-label="Weld key figures">
      <div className="panel wd-kpi"><small>Projects</small><strong>{kpis.projects}</strong><span>Projects inside the current filter scope.</span></div>
      <div className="panel wd-kpi"><small>Isometrics</small><strong>{kpis.isometrics}</strong><span>Unique isometrics inside the current filter scope.</span></div>
      <div className="panel wd-kpi"><small>Total welds</small><strong>{amount(kpis.totalWelds)}</strong><span>{breakdownText(kpis.weldsByType) || 'Total filtered weld workload.'}</span></div>
      <div className="panel wd-kpi"><small>Welded</small><strong>{kpis.welded}</strong><span>{breakdownText(kpis.weldedByType) || 'No welded joints per type in current filter.'}</span></div>
      <div className="panel wd-kpi"><small>Examined %</small><strong>{percentLabel(kpis.examinedPercent)}</strong><span>Welds with an NDT result and a welder, as a share of the current scope.</span></div>
      <div className="panel wd-kpi"><small>Repaired</small><strong>{amount(kpis.repaired)}</strong><span>Measured repair impact within the same dataset.</span></div>
      <div className="panel wd-kpi"><small>Repair rate</small><strong>{percentLabel(kpis.repairRate)}</strong><span>{view === 'length' ? 'Repaired length divided by examined length.' : 'Repaired divided by welded welds. Welds without a welder are excluded.'}</span></div>
      <div className={`panel wd-kpi ${performance.aboveLimit ? 'above' : ''}`}><small>Repair performance</small><strong>{percentLabel(performance.value)}</strong>
        <span>Limit {percentLabel(performance.limit)} · Scope {percentLabel(performance.scopePercent)}</span>
        {performance.aboveLimit ? <Badge color="red"><AlertTriangle size={12} aria-hidden="true"/> Above limit</Badge> : <span className="wd-ok"><CheckCircle2 size={13} aria-hidden="true"/>Within limit</span>}</div>
    </section>

    <form className="panel wd-filters" onSubmit={apply} aria-label="Dashboard filters">
      <div className="panel-heading"><div><span className="eyebrow">FILTERS</span><h2>Select the welds</h2></div>{dashboardFilterCount(filters, defaults) > 0 && <Badge>{dashboardFilterCount(filters, defaults)} changed</Badge>}</div>
      <div className="wd-filter-grid">
        <div className="field wd-field"><label htmlFor="wd-from">From Date</label><input id="wd-from" type="date" value={draft.from} max={draft.to || undefined} onChange={event => set('from')(event.target.value)}/></div>
        <div className="field wd-field"><label htmlFor="wd-to">To Date</label><input id="wd-to" type="date" value={draft.to} min={draft.from || undefined} onChange={event => set('to')(event.target.value)}/></div>
        <Select label="Company" value={draft.companyId} onChange={set('companyId')} options={named(activeRows(rows, 'companies'))}/>
        <Select label="Weld type" value={draft.location} onChange={value => set('location')(value as DashboardFilters['location'])} options={[{ value: 'Shop', label: 'Shop' }, { value: 'Field', label: 'Field' }]}/>
        <MultiSelect label="Intern prj. no." value={draft.projectIds} onChange={set('projectIds')} placeholder={FILTER_PLACEHOLDERS.projects} options={named(activeRows(rows, 'projects'), 'internnumber')}/>
        <MultiSelect label="Welder" value={draft.welderIds} onChange={set('welderIds')} placeholder={FILTER_PLACEHOLDERS.welders} options={labelled(activeRows(rows, 'welders'), welderOptionLabel)}/>
        <Select label="ITP/KNR" value={draft.itpId} onChange={set('itpId')} options={itpsReadable ? labelled(activeRows(rows, 'itps'), itpOptionLabel) : []}/>
        <Select label="Piping class" value={draft.pipingClass} onChange={set('pipingClass')} options={distinct(isos, 'pipingClass').map(value => ({ value, label: value }))}/>
        <Select label="IRN" value={draft.irn} onChange={set('irn')} options={distinct(isos, 'irn').map(value => ({ value, label: value }))}/>
        <Select label="PED Cat.-Mod" value={draft.ped} onChange={set('ped')} options={distinct(isos, 'ped').map(value => ({ value, label: value }))}/>
        <Select label="Material" value={draft.material} onChange={set('material')} options={distinct(isos, 'material').map(value => ({ value, label: value }))}/>
        <MultiSelect label="NDT process group" value={draft.ndtGroupIds} onChange={set('ndtGroupIds')} placeholder={FILTER_PLACEHOLDERS.ndtGroups} options={named(activeRows(rows, 'ndt_groups'))}/>
        <Select label="NDT process" value={draft.ndtProcessId} onChange={set('ndtProcessId')} any={FILTER_PLACEHOLDERS.ndtProcess} options={labelled(activeRows(rows, 'ndt_processes'), ndtProcessLabel, (a, b) => show(a.name).localeCompare(show(b.name), 'en', { numeric: true }))}/>
        <MultiSelect label="WPS method" value={draft.wpsIds} onChange={set('wpsIds')} placeholder={FILTER_PLACEHOLDERS.wps} options={named(activeRows(rows, 'wps'))}/>
      </div>
      <div className="wd-filter-actions"><button className="btn primary" type="submit">Filter</button><button className="btn" type="button" onClick={reset} disabled={!dashboardFilterCount(filters, defaults) && !dashboardFilterCount(draft, defaults)}>Reset</button><DashboardReports filters={filters} defaultTo={defaults.to}/>
        <span role="status" aria-live="polite">{result.scopeWelds} {result.scopeWelds === 1 ? 'weld' : 'welds'} selected</span></div>
    </form>

    <div className="wd-toolbar">
      <p className="wd-summary" aria-label="Current filters">{filterSummary(filters, { project: id => label('projects', id), welder: id => label('welders', id), date: formatDate }).map(([name, value]) => <span key={name}><small>{name}</small>{value}</span>)}</p>
      <div className="wd-toolbar-actions">
        {itpsReadable && <button type="button" className="btn" onClick={() => setManager(true)}><ClipboardCheck size={16} aria-hidden="true"/>Manage ITP/KNR</button>}
        <Dropdown label={viewLabel(view)} trigger={<span className="btn">{viewLabel(view)}<ChevronDown size={15} aria-hidden="true"/></span>}>
          {VIEW_OPTIONS.map(option => <button key={option.value} type="button" aria-current={view === option.value || undefined} onClick={() => setView(option.value)}>{option.label}</button>)}
        </Dropdown>
      </div>
    </div>

    <section className="panel wd-compliance" aria-labelledby="wd-compliance-title">
      <div className="panel-heading"><div><span className="eyebrow">QUALITY</span><h2 id="wd-compliance-title">{COMPLIANCE_TEXTS.title}</h2><p className="wd-hint">{COMPLIANCE_TEXTS.meta}</p></div></div>
      {!itpsReadable && <p className="wd-note" role="status"><AlertTriangle size={14} aria-hidden="true"/>The ITP/KNR register is not open to your profile, so {DEFAULT_NDT_PERCENT} % is applied to every group.</p>}
      {!result.compliance.length
        ? <EmptyState title="No welds to examine" description={dashboardFilterCount(filters, defaults) ? `${COMPLIANCE_TEXTS.noGroups} Reset the filters to see every group.` : COMPLIANCE_TEXTS.noGroups}/>
        : <>
          {result.warnings.length > 0 && <div className="wd-note wd-quality" role="note"><AlertTriangle size={14} aria-hidden="true"/><div><strong>{COMPLIANCE_TEXTS.dataQuality}</strong>{result.warnings.map(line => <span key={line}>{line}</span>)}</div></div>}
          <dl className="wd-overview">
            <div><dt>{COMPLIANCE_TEXTS.totalWelds}</dt><dd>{summary.totalWelds}</dd><small>{breakdownText(summary.weldsByType) || COMPLIANCE_TEXTS.metaTotalEmpty}</small></div>
            <div><dt>{COMPLIANCE_TEXTS.requiredExam}</dt><dd>{summary.required}</dd><small>{COMPLIANCE_TEXTS.metaFallback(summary.fallbackGroups)}</small></div>
            <div><dt>{COMPLIANCE_TEXTS.examinedWelds}</dt><dd>{summary.examined}</dd><small>{COMPLIANCE_TEXTS.metaExaminedOnly}</small></div>
            <div><dt>{COMPLIANCE_TEXTS.selectedExam}</dt><dd>{summary.selected}</dd><small>{COMPLIANCE_TEXTS.metaSelected}</small></div>
            <div><dt>{COMPLIANCE_TEXTS.remainingRequired}</dt><dd>{summary.remaining}</dd><small>{COMPLIANCE_TEXTS.metaRemaining}</small></div>
            <div className={summary.status === 'COMPLIANT' ? 'is-ok' : 'is-bad'}><dt>{COMPLIANCE_TEXTS.complianceStatus}</dt><dd>{summary.status}</dd><small>{COMPLIANCE_TEXTS.metaGroups(summary.compliantGroups, summary.totalGroups)}</small></div>
          </dl>
          <div className="wd-compliance-tools">
            <SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder={COMPLIANCE_TEXTS.search}/>
            <div className="wd-modes" role="group" aria-label="Show groups">{GROUP_FILTERS.map(item => <button key={item} type="button" className={mode === item ? 'selected' : ''} aria-pressed={mode === item} onClick={() => { setMode(item); setPage(0); }}>{item}{item !== 'All groups' && <span>{item === 'Compliant' ? counts.compliant : counts.notCompliant}</span>}</button>)}</div>
            <div className="wd-pager"><button type="button" className="btn small" disabled={current.page === 0} onClick={() => setPage(current.page - 1)}>Previous</button><button type="button" className="btn small" disabled={current.page >= current.pages - 1} onClick={() => setPage(current.page + 1)}>Next</button>
              <span role="status" aria-live="polite">{pageRange(listed.length, current.page, COMPLIANCE_PAGE_SIZE)}</span></div>
          </div>
          {!listed.length ? <p className="wd-empty-page">{query ? 'No group matches this search.' : COMPLIANCE_TEXTS.noPageGroups}</p>
            : <div className="wd-group-list">{current.items.map(group => <GroupCard key={group.key} group={group} onTracers={setProposal} tracersOpen={tracersOpen}/>)}</div>}
        </>}
    </section>
    {manager && <ItpManagerPanel onClose={() => setManager(false)}/>}
    {proposal && <TracerProposalDialog group={proposal} canSave={canRun('tracers')} onClose={() => setProposal(null)}/>}
  </div>;
}

// ----- Tracer proposal of a compliance group ------------------------------------------------------------------------------

/**
 * "Tracer proposal" opened from the Tracers metric of a group: the server lists the group's rejected welds, their current
 * tracers and the candidates (GET /api/tracer-proposal?group=1); saving goes through the tracers action for the group's welder.
 */
function TracerProposalDialog({ group, canSave, onClose }: { group: ComplianceGroup; canSave: boolean; onClose: () => void }) {
  const { refresh, notify, siteId } = useWorkspace();
  const [data, setData] = useState<GroupTracerProposal | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const query = new URLSearchParams({ group: '1', welderId: group.welderId, wpsId: group.wpsId, itpId: group.itpId, siteId }).toString();
  const load = () => api<{ proposal: GroupTracerProposal }>(`/tracer-proposal?${query}`).then(({ proposal }) => {
    setData(proposal); setError('');
    setChosen(Object.fromEntries(proposal.sources.map(entry => [entry.source.id, entry.currentTracers.map(item => item.id)])));
  }, failure => { setData(null); setError((failure as Error).message || 'Tracer proposal could not be loaded.'); });
  useEffect(() => { void load(); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const elsewhere = (sourceId: string, id: string) => Object.entries(chosen).some(([other, list]) => other !== sourceId && list.includes(id));
  const toggle = (sourceId: string, id: string, on: boolean) => setChosen(current => ({ ...current, [sourceId]: on ? [...(current[sourceId] || []), id] : (current[sourceId] || []).filter(item => item !== id) }));
  async function save() {
    if (!data) return;
    setBusy(true); setError('');
    try { await post('/actions/tracers', { assignments: Object.fromEntries(data.sources.map(entry => [entry.source.id, chosen[entry.source.id] || []])), welderId: group.welderId }); await refresh(); notify('Tracer selection saved.'); await load(); }
    catch (failure) { setError(failureText(failure)); }
    finally { setBusy(false); }
  }
  const meta = data ? `Welder: ${data.group.welderLabel} | WPS: ${data.group.wpsLabel} | ITP/KNR: ${data.group.itpLabel}` : `Welder: ${group.welderLabel} | WPS: ${group.wpsName} | ITP/KNR: ${group.itpNumber}`;
  const weldLine = (item: GroupTracerProposal['sources'][number]['candidates'][number]) => <span className="wd-candidate-body"><strong>Weld {item.weldNo}</strong><small>Project: {item.projectNo || '-'} | ISO: {item.isoNo || '-'}{item.typeLabel ? ` | Type: ${item.typeLabel}` : ''} | Date: {item.date ? formatDate(item.date) : '-'}</small><small>{item.statusLabel}</small></span>;
  return <Modal title="Tracer proposal" subtitle={meta} onClose={onClose} wide>
    <div className="modal-body wd-proposal">
      {error && <div className="alert error" role="alert">{error}</div>}
      {!data && !error && <p className="wd-loading" role="status"><Loader2 size={16} className="spin" aria-hidden="true"/>Loading...</p>}
      {data && <>
        <dl className="wd-proposal-tiles"><div><dt>Rejected welds</dt><dd>{data.status.rejectedWelds}</dd></div><div><dt>Expected tracers</dt><dd>{data.status.expectedTracers}</dd></div><div><dt>Existing tracers</dt><dd>{data.status.existingTracers}</dd></div><div><dt>Missing tracers</dt><dd>{data.status.missingTracers}</dd></div></dl>
        {data.warnings.map(line => <p key={line} className="wd-note" role="status"><AlertTriangle size={14} aria-hidden="true"/>{line}</p>)}
        {data.sources.map(entry => {
          const picked = chosen[entry.source.id] || [];
          return <section key={entry.source.id} className="wd-proposal-source" aria-label={`Rejected weld ${entry.source.weldNo}`}>
            <h3>Rejected weld {entry.source.weldNo}</h3>
            <p className="wd-sub">ISO {entry.source.isoNo || '-'} | {entry.linked} linked of {entry.expected} required.</p>
            {entry.currentTracers.length > 0 && <><p className="wd-sub">{entry.locked} locked, {entry.removable} removable.</p>
              <div className="wd-candidates">{entry.currentTracers.map(item => <label key={item.id} className={item.locked ? 'is-disabled' : ''}><input type="checkbox" checked={picked.includes(item.id)} disabled={item.locked || !canSave} onChange={event => toggle(entry.source.id, item.id, event.target.checked)}/>{weldLine(item)}<small className="wd-sub">{item.locked ? TRACER_LOCKED_HINT : TRACER_REMOVABLE_HINT}</small></label>)}</div></>}
            {entry.candidates.length > 0 && <><p className="wd-sub">Select up to {TRACERS_REQUIRED} tracers for this rejected weld.</p>
              <div className="wd-candidates">{entry.candidates.map(item => { const on = picked.includes(item.id), blocked = !on && (picked.length >= TRACERS_REQUIRED || elsewhere(entry.source.id, item.id)); return <label key={item.id} className={blocked ? 'is-disabled' : ''} title={!on && picked.length >= TRACERS_REQUIRED ? TRACER_MAX_TEXT : undefined}><input type="checkbox" checked={on} disabled={blocked || !canSave} onChange={event => toggle(entry.source.id, item.id, event.target.checked)}/>{weldLine(item)}</label>; })}</div></>}
          </section>;
        })}
        {!data.sources.length && <EmptyState title="No rejected welds" description="No candidate welds are currently available for this group."/>}
        {!canSave && <p className="wd-hint">Your profile can view the proposal but not save tracers.</p>}
      </>}
    </div>
    <div className="modal-footer"><button className="btn" type="button" onClick={onClose}>Close</button><button className="btn primary" type="button" disabled={!data || !data.sources.length || busy || !canSave} onClick={() => void save()}>{busy && <Loader2 size={14} className="spin" aria-hidden="true"/>}{busy ? 'Saving...' : 'Save tracer selection'}</button></div>
  </Modal>;
}

// ----- ITP/KNR Manager (panel of the dashboard over the ITPs register) ------------------------------------------------------

/**
 * "Manage ITP/KNR": the central definitions with their NDT %, how many isometrics link each (Usage) and whether it is
 * Active or Archived; Add definition / Edit (ITP/KNR code, Description, NDT %, Active) and Archive / Restore. The
 * records are the ITPs register; Archive switches the entry off (it stays linked), Restore switches it on again.
 */
function ItpManagerPanel({ onClose }: { onClose: () => void }) {
  const { rows, canRecord, refresh, notify } = useWorkspace();
  const [editing, setEditing] = useState<Row | 'new' | null>(null), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const itps = activeRows(rows, 'itps').sort((a, b) => show(a.number).localeCompare(show(b.number), 'en', { numeric: true }));
  const usage = itpUsage(itps, rows.isometrics || []);
  const isos = activeRows(rows, 'isometrics');
  const unmapped = isos.filter(iso => (show(iso.itpNo) && !show(iso.itpId)) || (show(iso.itpNo2) && !show(iso.itp2Id))).length;
  const noPercent = itps.filter(itp => itpNdtPercent(itp) === null).map(itp => show(itp.number));
  const canEdit = canRecord('itps', 'edit'), canAdd = canRecord('itps', 'insert');
  async function toggle(itp: Row) {
    setBusy(itp.id); setError('');
    try { await api(`/records/itps/${itp.id}`, { method: 'PUT', body: JSON.stringify({ active: !itpActive(itp), _version: itp._version }) }); await refresh(); notify(itpActive(itp) ? `ITP/KNR ${show(itp.number)} archived.` : `ITP/KNR ${show(itp.number)} restored.`); }
    catch (failure) { setError(failureText(failure)); }
    finally { setBusy(''); }
  }
  return <Modal title="ITP/KNR Manager" subtitle="Central ITP/KNR definitions and their NDT %" onClose={onClose} wide>
    <div className="modal-body wd-manager">
      {error && <div className="alert error" role="alert">{error}</div>}
      <dl className="wd-manager-quality" aria-label={COMPLIANCE_TEXTS.dataQuality}>
        <div><dt>Definitions</dt><dd>{itps.length}</dd></div>
        <div><dt>Isometrics linked</dt><dd>{isos.filter(iso => show(iso.itpId) || show(iso.itp2Id)).length} of {isos.length}</dd></div>
        <div><dt>Free-text ITP numbers</dt><dd>{unmapped}</dd></div>
        <div><dt>Without NDT %</dt><dd>{noPercent.length ? noPercent.join(', ') : 0}</dd></div>
      </dl>
      {canAdd && editing === null && <div className="wd-manager-actions"><button type="button" className="btn primary small" onClick={() => { setError(''); setEditing('new'); }}><Plus size={14} aria-hidden="true"/>Add definition</button></div>}
      {editing !== null && <ItpDefinitionForm record={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)}/>}
      {itps.length ? <div className="wd-manager-table"><table className="data-table"><thead><tr><th>Code</th><th>NDT %</th><th>Usage</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{itps.map(itp => { const percent = itpNdtPercent(itp), active = itpActive(itp); return <tr key={itp.id}>
          <td><strong>{show(itp.number)}</strong>{show(itp.description) && <small className="wd-sub">{show(itp.description)}</small>}</td>
          <td>{percent === null ? '—' : `${formatNumber(percent)} %`}</td><td>{usage.get(itp.id) ?? 0}</td>
          <td><Badge color={active ? 'green' : 'neutral'}>{active ? 'Active' : 'Archived'}</Badge></td>
          <td><div className="wd-manager-row-actions">{canEdit && <button type="button" className="btn small" onClick={() => { setError(''); setEditing(itp); }} aria-label={`Edit ITP/KNR ${show(itp.number)}`}><Pencil size={13} aria-hidden="true"/>Edit</button>}
            {canEdit && <button type="button" className="btn small" disabled={busy === itp.id} onClick={() => void toggle(itp)}>{busy === itp.id && <Loader2 size={13} className="spin" aria-hidden="true"/>}{active ? 'Archive' : 'Restore'}</button>}
            {!canEdit && <span className="wd-sub">Read only</span>}</div></td>
        </tr>; })}</tbody></table></div>
        : <EmptyState title="No ITP/KNR definitions" description={canAdd ? 'Add the first definition with its NDT %; compliance uses 10 % until an isometric is linked to one.' : 'No ITP/KNR is defined yet. Compliance uses 10 % for every group.'}/>}
    </div>
    <div className="modal-footer"><button className="btn" type="button" onClick={onClose}>Close</button></div>
  </Modal>;
}
function ItpDefinitionForm({ record, onDone }: { record?: Row; onDone: () => void }) {
  const { refresh, notify } = useWorkspace();
  const [values, setValues] = useState({ number: show(record?.number), description: show(record?.description), ndtPercent: record?.ndtPercent === null || record?.ndtPercent === undefined ? '' : String(record.ndtPercent), active: record ? itpActive(record) : true });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string>>({});
  const id = useId();
  async function submit(event: FormEvent) {
    event.preventDefault();
    const percent = values.ndtPercent.trim() === '' ? null : Number(values.ndtPercent.replace(',', '.'));
    const local: Record<string, string> = {};
    if (!values.number.trim()) local.number = 'ITP/KNR code is required.';
    if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) local.ndtPercent = 'NDT % must be between 0 and 100.';
    setFields(local); if (Object.keys(local).length) return;
    setBusy(true); setError('');
    const body = { number: values.number.trim(), description: values.description.trim(), ndtPercent: percent, active: values.active };
    try {
      if (record) await api(`/records/itps/${record.id}`, { method: 'PUT', body: JSON.stringify({ ...body, _version: record._version }) });
      else await post('/records/itps', body);
      await refresh(); notify(record ? `ITP/KNR ${body.number} updated.` : `ITP/KNR ${body.number} added.`); onDone();
    } catch (failure) { setError((failure as Error).message || 'Saving failed.'); setFields((failure as ApiError).fields || {}); }
    finally { setBusy(false); }
  }
  return <form className="wd-manager-form" onSubmit={submit} aria-label={record ? 'Edit definition' : 'Add definition'} noValidate>
    <h3>{record ? 'Edit definition' : 'Add definition'}</h3>
    {error && <div className="alert error" role="alert">{error}</div>}
    <div className="wd-manager-fields">
      <div className="field"><label htmlFor={`${id}-code`}>ITP/KNR code<span className="required"> *</span></label><input id={`${id}-code`} value={values.number} maxLength={80} aria-invalid={Boolean(fields.number)} onChange={event => setValues({ ...values, number: event.target.value })}/>{fields.number && <span className="field-error">{fields.number}</span>}</div>
      <div className="field"><label htmlFor={`${id}-description`}>Description</label><input id={`${id}-description`} value={values.description} maxLength={200} onChange={event => setValues({ ...values, description: event.target.value })}/></div>
      <div className="field"><label htmlFor={`${id}-percent`}>NDT %</label><input id={`${id}-percent`} inputMode="decimal" value={values.ndtPercent} aria-invalid={Boolean(fields.ndtPercent)} onChange={event => setValues({ ...values, ndtPercent: event.target.value })}/>{fields.ndtPercent && <span className="field-error">{fields.ndtPercent}</span>}</div>
      <label className="wd-manager-check"><input type="checkbox" checked={values.active} onChange={event => setValues({ ...values, active: event.target.checked })}/>Active</label>
    </div>
    <div className="wd-manager-form-actions"><button type="button" className="btn small" onClick={onDone}>Cancel</button><button type="submit" className="btn primary small" disabled={busy}>{busy && <Loader2 size={13} className="spin" aria-hidden="true"/>}{record ? 'Save' : 'Add definition'}</button></div>
  </form>;
}

// ----- Link ITP on the isometric header ------------------------------------------------------------------------------------

/**
 * Link ITP / Unlink for one ITP slot of an isometric (Weld Pilot header). The picker offers the ITPs the slot rule allows
 * (shared/itps.ts); the chosen ITP's scope decides the slot on the server. Renders nothing without the rights.
 */
export function ItpLinkControl({ iso, slot: slotNumber }: { iso: Row; slot: 1 | 2 }) {
  const { rows, canRecord, refresh, notify } = useWorkspace();
  const slot = ITP_SLOTS[slotNumber - 1], side: LinkSlot = slotNumber === 1 ? 'primary' : 'secondary';
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!canRecord('itps') || !canRecord('isometrics', 'edit', iso)) return null;
  const itps = rows.itps || [];
  const linked = itps.find(row => row.id === iso[slot.link] && !row._archived);
  async function send(path: string, body: Record<string, unknown>, done: string) {
    setBusy(true); setError('');
    try { await post(path, body); await refresh(); notify(done); setOpen(false); }
    catch (failure) { setError(((failure as ApiError).fields && Object.values((failure as ApiError).fields!)[0]) || (failure as Error).message || 'Saving failed.'); }
    finally { setBusy(false); }
  }
  if (linked) return <button className="icon-btn" aria-label={`Unlink ITP ${show(linked.number)} from ${slot.label}`} title="Unlink ITP" disabled={busy} onClick={() => void send('/itps/unlink', { isoId: iso.id, slot: slotNumber }, 'ITP unlinked. The number stays as free text.')}>{busy ? <Loader2 size={16} className="spin"/> : <Unlink size={16}/>}</button>;
  if (!allowedScopes(iso, itps, side).length) return null;
  return <>
    <button className="icon-btn" aria-label={`Link ITP to ${slot.label}`} title="Link ITP" onClick={() => { setError(''); setOpen(true); }}><Link2 size={16}/></button>
    {open && <LinkItpDialog iso={iso} slot={side} busy={busy} error={error} onClose={() => setOpen(false)} onPick={id => void send('/itps/link', { isoId: iso.id, itpId: id, slot: side, _version: iso._version }, 'ITP linked.')}/>}
  </>;
}

/**
 * The "Link ITP" button of the ITPs card (header and empty body): the picker offers every ITP the isometric can still
 * take and the chosen ITP's scope decides the slot. Hidden without the rights, or when no slot is free (both pilots).
 */
export function ItpCardLinkButton({ iso, compact = false }: { iso: Row; compact?: boolean }) {
  const { rows, canRecord, refresh, notify } = useWorkspace();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!canRecord('itps') || !canRecord('isometrics', 'edit', iso) || !allowedScopes(iso, rows.itps || [], 'any').length) return null;
  async function pick(itpId: string) {
    setBusy(true); setError('');
    try { await post('/itps/link', { isoId: iso.id, itpId, slot: 'any', _version: iso._version }); await refresh(); notify('ITP linked.'); setOpen(false); }
    catch (failure) { setError(((failure as ApiError).fields && Object.values((failure as ApiError).fields!)[0]) || (failure as Error).message || 'Saving failed.'); }
    finally { setBusy(false); }
  }
  return <>
    {compact ? <button type="button" className="icon-btn" title="Link ITP" aria-label="Link ITP" onClick={() => { setError(''); setOpen(true); }}><Link2 size={16}/></button>
      : <button type="button" className="btn small primary" onClick={() => { setError(''); setOpen(true); }}><Link2 size={14} aria-hidden="true"/>Link ITP</button>}
    {open && <LinkItpDialog iso={iso} slot="any" busy={busy} error={error} onClose={() => setOpen(false)} onPick={id => void pick(id)}/>}
  </>;
}

function LinkItpDialog({ iso, slot, busy, error, onClose, onPick }: { iso: Row; slot: LinkSlot; busy: boolean; error: string; onClose: () => void; onPick: (id: string) => void }) {
  const { rows } = useWorkspace();
  const [query, setQuery] = useState(''), [chosen, setChosen] = useState('');
  const term = query.trim().toLowerCase();
  const options = itpPickerOptions(iso, rows.itps || [], rows.itp_projects || [], slot)
    .filter(itp => !term || [itp.number, itp.title, itp.description].some(value => show(value).toLowerCase().includes(term)));
  const scopes = allowedScopes(iso, rows.itps || [], slot);
  return <Modal title="Link ITP" subtitle={`${show(iso.isoNo)} · ${scopes.join(' / ')}`} onClose={onClose}>
    <div className="modal-body">
      {error && <div className="alert error" role="alert">{error}</div>}
      <p className="wd-hint">A Shop ITP fills ITP No, a Field ITP fills ITP No 2, a Shop+Field ITP fills ITP No and hides ITP No 2. X Ray % follows the ITP.</p>
      <SearchInput value={query} onChange={setQuery} placeholder="Search ITP…"/>
      {options.length ? <div className="wd-itp-list" role="radiogroup" aria-label="Choose ITP">{options.map(itp => {
        const rev = itpLatest(itp, rows.attachments).revNo || '0', percent = itpNdtPercent(itp);
        return <label key={itp.id} className={chosen === itp.id ? 'on' : ''}>
          <input type="radio" name="link-itp" value={itp.id} checked={chosen === itp.id} onChange={() => setChosen(itp.id)}/>
          <span><strong>{show(itp.number)}{show(itp.title) ? ` — ${show(itp.title)}` : ''}</strong><small>Scope {itpScope(itp)} · Latest Rev {rev} · {percent === null ? 'X-Ray % not set' : `X-Ray ${formatNumber(percent)} %`}</small></span></label>; })}</div>
        : <EmptyState title="No ITP to link" description={query ? 'No ITP matches this search.' : `No active ${scopes.join(' or ')} ITP is open to this isometric's project. Add one under Welding data → ITPs.`}/>}
    </div>
    <div className="modal-footer"><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={!chosen || busy} onClick={() => onPick(chosen)}>{busy && <Loader2 size={14} className="spin"/>}Link ITP</button></div>
  </Modal>;
}
