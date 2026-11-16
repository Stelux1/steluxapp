import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Link2, Loader2, Unlink } from 'lucide-react';
import { useWorkspace, activeRows } from './context.tsx';
import { ApiError, api, formatNumber } from './api.ts';
import { post } from './api.ts';
import { Badge, EmptyState, Modal, SearchInput, TableScroll } from './components.tsx';
import { resourcePath } from './records.tsx';
import { COMPLIANCE_PAGE_SIZE, GROUP_FILTERS, NO_DASHBOARD_FILTERS, dashboardFilterCount, filterGroups, pageOf, weldDashboard, type ComplianceGroup, type DashboardFilters, type GroupFilter } from '../shared/weld-dashboard.ts';
import { DEFAULT_NDT_PERCENT, ITP_SLOTS, itpNdtPercent, itpsForProject } from '../shared/itp-dashboard.ts';
import { allowedScopes, itpLatest, itpPickerOptions, itpScope, type LinkSlot } from '../shared/itps.ts';
import type { Row } from '../shared/types.ts';

const show = (value: unknown) => String(value ?? '').trim();
const distinct = (rows: Row[], key: string) => [...new Set(rows.map(row => show(row[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const percentText = (value: number) => `${formatNumber(value)} %`;

// ----- Weld Pilot dashboard (below the project header and the WDI panel) ---------------------------------------------

function Select({ label, value, onChange, options, any = 'All' }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; any?: string }) {
  const id = useId();
  return <div className="field wd-field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={event => onChange(event.target.value)}><option value="">{any}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}
const named = (rows: Row[], key = 'name') => rows.map(row => ({ value: row.id, label: show(row[key]) || show(row.number) || row.id })).sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));

function Bar({ group }: { group: ComplianceGroup }) {
  const { tested, selected, remaining } = group.bar, whole = Math.max(group.required, 1);
  const text = `${tested} tested, ${selected} selected, ${remaining} remaining of ${group.required} required`;
  return <div className="wd-bar" role="img" aria-label={text} title={text}>
    <span className="tested" style={{ width: `${tested / whole * 100}%` }}/><span className="selected" style={{ width: `${selected / whole * 100}%` }}/><span className="remaining" style={{ width: `${remaining / whole * 100}%` }}/>
  </div>;
}

export function WeldDashboard() {
  const { rows, canRecord, siteId } = useWorkspace();
  const [draft, setDraft] = useState<DashboardFilters>(NO_DASHBOARD_FILTERS), [filters, setFilters] = useState<DashboardFilters>(NO_DASHBOARD_FILTERS);
  const [mode, setMode] = useState<GroupFilter>('Not compliant'), [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const readable = canRecord('welds') && canRecord('isometrics');
  const itpsReadable = canRecord('itps');
  const isos = activeRows(rows, 'isometrics');
  const site = rows.sites?.find(row => row.id === siteId) ?? rows.sites?.find(row => !row._archived);
  const result = useMemo(() => weldDashboard({
    welds: rows.welds || [], isometrics: rows.isometrics || [], projects: rows.projects || [], weldTypes: rows.weld_types || [], welders: rows.welders || [], wps: rows.wps || [], itps: itpsReadable ? rows.itps || [] : [],
    ndtProcesses: rows.ndt_processes || [], ndtGroups: rows.ndt_groups || [], requests: rows.inspection_requests || [], results: rows.inspection_results || [],
  }, filters, site), [rows, filters, site, itpsReadable]);
  if (!readable) return <section className="panel wd-state" role="alert"><EmptyState title="No access to the weld dashboard" description="Your profile does not include the weld register or the isometrics. Ask an administrator to open them for you."/></section>;

  const { kpis } = result, performance = kpis.repairPerformance;
  const set = (key: keyof DashboardFilters) => (value: string) => setDraft(current => ({ ...current, [key]: value } as DashboardFilters));
  const apply = (event: FormEvent) => { event.preventDefault(); setFilters(draft); setPage(0); };
  const reset = () => { setDraft(NO_DASHBOARD_FILTERS); setFilters(NO_DASHBOARD_FILTERS); setPage(0); };
  const processes = activeRows(rows, 'ndt_processes').filter(row => !draft.ndtGroupId || row.groupId === draft.ndtGroupId);
  const listed = filterGroups(result.compliance, mode, query), current = pageOf(listed, page);
  const counts = { notCompliant: result.compliance.filter(group => !group.compliant).length, compliant: result.compliance.filter(group => group.compliant).length };

  return <div className="wd-dashboard">
    <section className="wd-kpis" aria-label="Weld key figures">
      <div className="panel wd-kpi"><small>Projects</small><strong>{kpis.projects}</strong></div>
      <div className="panel wd-kpi"><small>Isometrics</small><strong>{kpis.isometrics}</strong></div>
      <div className="panel wd-kpi"><small>Total welds</small><strong>{kpis.totalWelds}</strong><span>{kpis.weldsByType.length ? kpis.weldsByType.map(item => `${item.label} ${item.count}`).join(' · ') : 'No welds in this selection'}</span></div>
      <div className="panel wd-kpi"><small>Welded</small><strong>{kpis.welded}</strong><span>Welds with a welder</span></div>
      <div className="panel wd-kpi"><small>Examined %</small><strong>{percentText(kpis.examinedPercent)}</strong><span>{kpis.examined} welded welds with an NDT result</span></div>
      <div className="panel wd-kpi"><small>Repaired</small><strong>{kpis.repaired}</strong><span>Welds with a repair</span></div>
      <div className="panel wd-kpi"><small>Repair rate</small><strong>{percentText(kpis.repairRate)}</strong><span>Repaired / welded</span></div>
      <div className={`panel wd-kpi ${performance.aboveLimit ? 'above' : ''}`}><small>Repair performance</small><strong>{percentText(performance.value)}</strong>
        <span>Limit {percentText(performance.limit)} · {performance.scope}</span>
        {performance.aboveLimit ? <Badge color="red"><AlertTriangle size={12} aria-hidden="true"/> Above limit</Badge> : <span className="wd-ok"><CheckCircle2 size={13} aria-hidden="true"/>Within limit</span>}</div>
    </section>

    <form className="panel wd-filters" onSubmit={apply} aria-label="Dashboard filters">
      <div className="panel-heading"><div><span className="eyebrow">FILTERS</span><h2>Select the welds</h2></div>{dashboardFilterCount(filters) > 0 && <Badge>{dashboardFilterCount(filters)} active</Badge>}</div>
      <div className="wd-filter-grid">
        <div className="field wd-field"><label htmlFor="wd-from">From date</label><input id="wd-from" type="date" value={draft.from} max={draft.to || undefined} onChange={event => set('from')(event.target.value)}/></div>
        <div className="field wd-field"><label htmlFor="wd-to">To date</label><input id="wd-to" type="date" value={draft.to} min={draft.from || undefined} onChange={event => set('to')(event.target.value)}/></div>
        <Select label="Company" value={draft.companyId} onChange={set('companyId')} options={named(activeRows(rows, 'companies'))}/>
        <Select label="Weld type" value={draft.location} onChange={set('location')} options={[{ value: 'Shop', label: 'Shop' }, { value: 'Field', label: 'Field' }]}/>
        <Select label="Intern prj. no." value={draft.projectId} onChange={set('projectId')} options={named(activeRows(rows, 'projects'), 'internnumber')}/>
        <Select label="Welder" value={draft.welderId} onChange={set('welderId')} options={named(activeRows(rows, 'welders'))}/>
        <Select label="ITP/KNR" value={draft.itpId} onChange={set('itpId')} options={named(activeRows(rows, 'itps'), 'number')}/>
        <Select label="Piping class" value={draft.pipingClass} onChange={set('pipingClass')} options={distinct(isos, 'pipingClass').map(value => ({ value, label: value }))}/>
        <Select label="IRN" value={draft.irn} onChange={set('irn')} options={distinct(isos, 'irn').map(value => ({ value, label: value }))}/>
        <Select label="PED Cat.-Mod" value={draft.ped} onChange={set('ped')} options={distinct(isos, 'ped').map(value => ({ value, label: value }))}/>
        <Select label="Material" value={draft.material} onChange={set('material')} options={distinct(isos, 'material').map(value => ({ value, label: value }))}/>
        <Select label="NDT process group" value={draft.ndtGroupId} onChange={value => setDraft(current => ({ ...current, ndtGroupId: value, ndtProcessId: '' }))} options={named(activeRows(rows, 'ndt_groups'))}/>
        <Select label="NDT process" value={draft.ndtProcessId} onChange={set('ndtProcessId')} options={named(processes)}/>
        <Select label="WPS method" value={draft.wpsId} onChange={set('wpsId')} options={named(activeRows(rows, 'wps'))}/>
      </div>
      <div className="wd-filter-actions"><button className="btn primary" type="submit">Filter</button><button className="btn" type="button" onClick={reset} disabled={!dashboardFilterCount(filters) && !dashboardFilterCount(draft)}>Reset</button>
        <span role="status" aria-live="polite">{result.scopeWelds} {result.scopeWelds === 1 ? 'weld' : 'welds'} selected</span></div>
    </form>

    <section className="panel wd-compliance" aria-labelledby="wd-compliance-title">
      <div className="panel-heading"><div><span className="eyebrow">QUALITY</span><h2 id="wd-compliance-title">Inspection compliance</h2><p className="wd-hint">Grouped by welder, WPS and ITP/KNR. Tracer welds and welds without a welder are not counted.</p></div>
        {canRecord('itps') && <Link className="btn" to={resourcePath('itps')}><ClipboardCheck size={16}/>Manage ITP/KNR</Link>}</div>
      {!itpsReadable && <p className="wd-note" role="status"><AlertTriangle size={14} aria-hidden="true"/>The ITP/KNR register is not open to your profile, so {DEFAULT_NDT_PERCENT} % is applied to every group.</p>}
      <div className="wd-compliance-tools">
        <div className="wd-modes" role="group" aria-label="Show groups">{GROUP_FILTERS.map(item => <button key={item} type="button" className={mode === item ? 'selected' : ''} aria-pressed={mode === item} onClick={() => { setMode(item); setPage(0); }}>{item}{item !== 'All groups' && <span>{item === 'Compliant' ? counts.compliant : counts.notCompliant}</span>}</button>)}</div>
        <SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder="Search welder, WPS or ITP/KNR…"/>
      </div>
      {!result.compliance.length
        ? <EmptyState title="No welds to examine" description={dashboardFilterCount(filters) ? 'No welded, non-tracer welds match these filters. Reset the filters to see every group.' : 'Compliance appears when welds with a welder are registered on the isometrics.'}/>
        : !listed.length ? <EmptyState title="No matching groups" description={query ? 'Try another search.' : mode === 'Not compliant' ? 'Every group is compliant.' : 'No group is compliant yet.'}/>
        : <><TableScroll><table className="data-table wd-table"><thead><tr><th>Welder</th><th>WPS</th><th>ITP/KNR</th><th>Total welds</th><th>Required</th><th>Examined</th><th>Selected</th><th>Remaining</th><th>Status</th><th>Tested / Selected / Remaining</th><th>Defects</th></tr></thead>
          <tbody>{current.items.map(group => <tr key={group.key}>
            <td>{group.welderName}</td><td>{group.wpsName}</td><td>{group.itpNumber}<small className="wd-sub">{group.itpPercent === null ? `${DEFAULT_NDT_PERCENT} % default` : `${formatNumber(group.itpPercent)} % NDT`}</small></td>
            <td>{group.total}</td><td>{group.required}</td><td>{group.examined}</td><td>{group.selected}</td><td>{group.remaining}</td>
            <td><Badge color={group.compliant ? 'green' : 'red'}>{group.compliant ? 'COMPLIANT' : 'NOT COMPLIANT'}</Badge></td>
            <td><Bar group={group}/><small className="wd-sub">{group.bar.tested} / {group.bar.selected} / {group.bar.remaining}</small></td>
            <td><dl className="wd-defects"><div><dt>Welds</dt><dd>{group.defects.welds}</dd></div><div><dt>Examined</dt><dd>{group.defects.examined} ({percentText(group.defects.examinedPercent)})</dd></div><div><dt>Rejected</dt><dd>{group.defects.rejected} ({percentText(group.defects.rejectedPercent)})</dd></div><div><dt>Tracers</dt><dd>{group.defects.tracers}</dd></div></dl></td>
          </tr>)}</tbody></table></TableScroll>
          <div className="wd-pager"><span role="status" aria-live="polite">{current.page * COMPLIANCE_PAGE_SIZE + 1}–{current.page * COMPLIANCE_PAGE_SIZE + current.items.length} of {listed.length} groups</span>
            <button type="button" className="icon-btn" aria-label="Previous page" disabled={current.page === 0} onClick={() => setPage(current.page - 1)}><ChevronLeft size={17}/></button>
            <span>Page {current.page + 1} of {current.pages}</span>
            <button type="button" className="icon-btn" aria-label="Next page" disabled={current.page >= current.pages - 1} onClick={() => setPage(current.page + 1)}><ChevronRight size={17}/></button></div></>}
    </section>
  </div>;
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
