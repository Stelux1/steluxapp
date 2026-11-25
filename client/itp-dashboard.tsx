import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Link2, Loader2, Unlink } from 'lucide-react';
import { useWorkspace, activeRows } from './context.tsx';
import { ApiError, formatNumber } from './api.ts';
import { post } from './api.ts';
import { Badge, Dropdown, EmptyState, Modal, SearchInput } from './components.tsx';
import {
  FILTER_LABELS, FILTER_PLACEHOLDERS, breakdownText, dashboardFilterCount, defaultDashboardFilters, itpOptionLabel, localDay, percentLabel, scheduleDashboardRefresh, weldDashboard, welderOptionLabel,
  type DashboardFilters,
} from '../shared/weld-dashboard.ts';
import { ITP_SLOTS, itpNdtPercent } from '../shared/itp-dashboard.ts';
import { UNLINK_ITP, allowedScopes, itpLatest, itpPickerOptions, itpScope, type LinkSlot } from '../shared/itps.ts';
import type { Row } from '../shared/types.ts';
import { DashboardReports } from './dashboard-reports.tsx';
import { ProjectCompletionSection } from './project-completion.tsx';

const show = (value: unknown) => String(value ?? '').trim();
const distinct = (rows: Row[], key: string) => [...new Set(rows.map(row => show(row[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
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


export function WeldDashboard() {
  const { rows, allRows, canRecord, siteId, refresh } = useWorkspace();
  const today = localDay();
  const [draft, setDraft] = useState<DashboardFilters>(() => defaultDashboardFilters(today)), [filters, setFilters] = useState<DashboardFilters>(() => defaultDashboardFilters(today));
  const readable = canRecord('welds') && canRecord('isometrics');
  const itpsReadable = canRecord('itps');
  const isos = activeRows(rows, 'isometrics');
  const site = rows.sites?.find(row => row.id === siteId) ?? rows.sites?.find(row => !row._archived);
  const result = useMemo(() => weldDashboard({
    welds: rows.welds || [], isometrics: rows.isometrics || [], projects: rows.projects || [], weldTypes: rows.weld_types || [], welders: rows.welders || [], wps: rows.wps || [], itps: itpsReadable ? rows.itps || [] : [],
    ndtProcesses: rows.ndt_processes || [], requests: rows.inspection_requests || [], results: rows.inspection_results || [], diameters: rows.diameters || [], tracerWelds: allRows.welds || rows.welds || [],
  }, filters, site), [rows, allRows, filters, site, itpsReadable]);
  // The reference reloads the dashboard every 3 minutes while it is open.
  useEffect(() => readable ? scheduleDashboardRefresh(() => { void refresh(); }) : undefined, [readable, refresh]);
  if (!readable) return <section className="panel wd-state" role="alert"><EmptyState title="No access to the weld dashboard" description="Your profile does not include the weld register or the isometrics. Ask an administrator to open them for you."/></section>;

  const { kpis } = result, performance = kpis.repairPerformance, defaults = defaultDashboardFilters(today);
  const set = <K extends keyof DashboardFilters>(key: K) => (value: DashboardFilters[K]) => setDraft(current => ({ ...current, [key]: value }));
  const apply = (event: FormEvent) => { event.preventDefault(); setFilters(draft); };
  const reset = () => { setDraft(defaults); setFilters(defaults); };
  const amount = (value: number) => formatNumber(value, 0);
  const options = (key: string) => distinct(isos, key).map(value => ({ value, label: value }));

  return <div className="wd-dashboard">
    <ProjectCompletionSection/>

    <section className="wd-kpis" aria-label="Weld key figures">
      <div className="panel wd-kpi"><small>Projects</small><strong>{kpis.projects}</strong><span>Projects inside the current filter scope.</span></div>
      <div className="panel wd-kpi"><small>Isometrics</small><strong>{kpis.isometrics}</strong><span>Unique isometrics inside the current filter scope.</span></div>
      <div className="panel wd-kpi"><small>Total welds</small><strong>{amount(kpis.totalWelds)}</strong><span>{breakdownText(kpis.weldsByType) || 'Total filtered weld workload.'}</span></div>
      <div className="panel wd-kpi"><small>Welded</small><strong>{kpis.welded}</strong><span>{breakdownText(kpis.weldedByType) || 'No welded joints per type in current filter.'}</span></div>
      <div className="panel wd-kpi"><small>Examined %</small><strong>{percentLabel(kpis.examinedPercent)}</strong><span>Welds with an NDT result and a welder, as a share of the current scope.</span></div>
      <div className="panel wd-kpi"><small>Repaired</small><strong>{amount(kpis.repaired)}</strong><span>Measured repair impact within the same dataset.</span></div>
      <div className="panel wd-kpi"><small>Repair rate</small><strong>{percentLabel(kpis.repairRate)}</strong><span>Repaired divided by welded welds. Welds without a welder are excluded.</span></div>
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
        <MultiSelect label={FILTER_LABELS.project} value={draft.projectIds} onChange={set('projectIds')} placeholder={FILTER_PLACEHOLDERS.projects} options={named(activeRows(rows, 'projects'), 'internnumber')}/>
        <MultiSelect label="Welder" value={draft.welderIds} onChange={set('welderIds')} placeholder={FILTER_PLACEHOLDERS.welders} options={labelled(activeRows(rows, 'welders'), welderOptionLabel)}/>
        <Select label={FILTER_LABELS.itp} value={draft.itpId} onChange={set('itpId')} any={FILTER_PLACEHOLDERS.itp} options={itpsReadable ? labelled(activeRows(rows, 'itps'), itpOptionLabel) : []}/>
        <Select label="Piping class" value={draft.pipingClass} onChange={set('pipingClass')} options={options('pipingClass')}/>
        <Select label={FILTER_LABELS.customField} value={draft.irn} onChange={set('irn')} any={FILTER_PLACEHOLDERS.customField} options={options('irn')}/>
        <Select label="PED Cat.-Mod" value={draft.ped} onChange={set('ped')} options={options('ped')}/>
        <Select label="Material" value={draft.material} onChange={set('material')} options={options('material')}/>
        <MultiSelect label="WPS method" value={draft.wpsIds} onChange={set('wpsIds')} placeholder={FILTER_PLACEHOLDERS.wps} options={named(activeRows(rows, 'wps'))}/>
      </div>
      <div className="wd-filter-actions"><button className="btn primary" type="submit">Filter</button><button className="btn" type="button" onClick={reset} disabled={!dashboardFilterCount(filters, defaults) && !dashboardFilterCount(draft, defaults)}>Reset</button><DashboardReports filters={filters} defaultTo={defaults.to}/>
        <span role="status" aria-live="polite">{result.scopeWelds} {result.scopeWelds === 1 ? 'weld' : 'welds'} selected</span></div>
    </form>
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
  if (linked) return <>
    <button type="button" className="btn subtle small iso-itp-unlink" aria-label={`${UNLINK_ITP.button} ${show(linked.number)} from ${slot.label}`} title={UNLINK_ITP.title} disabled={busy} onClick={() => { setError(''); setOpen(true); }}><Unlink size={14} aria-hidden="true"/>{UNLINK_ITP.button}</button>
    {open && <Modal title={UNLINK_ITP.title} onClose={() => setOpen(false)}><div className="modal-body">{error && <div className="alert error" role="alert"><AlertTriangle size={18}/><span>{error}</span></div>}<p>{UNLINK_ITP.confirm(show(linked.number))}</p></div>
      <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>{UNLINK_ITP.cancel}</button><button type="button" className="btn danger" disabled={busy} onClick={() => void send('/itps/unlink', { isoId: iso.id, slot: slotNumber }, 'ITP unlinked. The number stays as free text.')}>{busy && <Loader2 size={15} className="spin"/>}{UNLINK_ITP.button}</button></div></Modal>}
  </>;
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
