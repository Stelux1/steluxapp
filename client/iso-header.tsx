import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, ChevronDown, Download, FileText, Loader2, Plus, Upload } from 'lucide-react';
import { useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { Modal, Progress } from './components.tsx';
import { WorkflowDialog } from './dialogs.tsx';
import { DrawingRevisions } from './drawing-revisions.tsx';
import { ReleaseStatus } from './releases.tsx';
import { PunchStatus } from './punch.tsx';
import { RESOURCE_MAP } from './catalog.ts';
import { ApiError, api, formatNumber, apiUrl } from './api.ts';
import { currentRevision } from '../shared/revisions.ts';
import { ISO_FINISH_ITEMS, ISO_FINISH_STATES, ISO_QUANTITIES, isoBlockers, isoBudgets, isoInputErrors, isoProgress, isoQuality, type IsoProgress, type IsoStatusInput, type ProgressBudgets } from '../shared/iso-status.ts';
import { priorityLabel } from '../shared/priority.ts';
import { BLOCKER_TITLES } from '../shared/iso-status.ts';
import { blockerCountText, summaryProgress } from '../shared/iso-summary.ts';
import type { Row } from '../shared/types.ts';

const NO_BUDGET_TIP = 'No MTO budget yet. Add materials with a matching component code in MTO to enter progress here.';
const show = (value: unknown) => String(value ?? '').trim() || '—';

function Card({ title, className = '', aside, children }: { title: string; className?: string; aside?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <section className={`panel iso-card ${className}`} aria-labelledby={id}><header><h2 id={id}>{title}</h2>{aside}</header>{children}</section>;
}
const Fact = ({ label, children }: { label: string; children: ReactNode }) => <div><dt>{label}</dt><dd>{children}</dd></div>;

interface HeaderProps {
  iso: Row; project?: Row;
  /** Attached drawing and ITP files of the isometric, newest first. */
  documents: Row[];
  onUpload: (kind: string) => void;
  /** Open one weld: the page switches to the weld register where it has one. */
  onOpenWeld: (weldId: string) => void;
}

/** The six cards of the isometric header, identical under Weld Pilot and MTO Pilot. */
export function IsometricHeader({ iso, project, documents, onUpload, onOpenWeld }: HeaderProps) {
  const { rows, canRecord, canRun, isoSummaries } = useWorkspace(); const pilot = usePilot();
  const [revision, setRevision] = useState(''), [history, setHistory] = useState(false), [blockers, setBlockers] = useState(false);
  const site = rows.sites?.find(row => row.id === project?.siteId);
  const budgets = isoBudgets(iso);
  // Hosted profile: the server summary (computed from every record, the same in both pilots). Weld-level items are
  // computed here only where this pilot reads welds; elsewhere each group shows its count. Other profiles: computed here.
  const summary = isoSummaries?.[iso.id], weldItems = canRecord('welds');
  const status = useMemo(() => {
    const input: IsoStatusInput = { iso, site, welds: rows.welds || [], weldTypes: rows.weld_types || [], diameters: rows.diameters || [], results: rows.inspection_results || [], releases: rows.releases ?? null, punch: rows.punchlists ?? null, budgets };
    const local = !summary || weldItems ? isoBlockers(input) : null;
    if (!summary) return { blockers: local!, quality: isoQuality(input), progress: isoProgress(input) };
    // A group lists its items only when the local calculation agrees with the server's count; otherwise its count line.
    const groups = summary.blockers.groups.map(group => {
      const mine = local?.groups.find(item => item.key === group.key);
      return { key: group.key, title: BLOCKER_TITLES[group.key], count: group.count, items: mine && mine.count === group.count ? mine.items : [{ message: blockerCountText(group.key, group.count) }] };
    });
    return { blockers: { groups, total: summary.blockers.total }, quality: summary.quality, progress: summaryProgress(summary) };
  }, [rows, iso, site, budgets, summary, weldItems]);
  const canEdit = canRecord('isometrics', 'edit', iso), canImport = canRecord('isometrics', 'import', iso);
  const canRevise = canRun('revision', { isoId: iso.id }), historyAvailable = canRecord('revisions');
  const testSystem = rows.test_systems?.find(row => row.id === iso.testSystemId);
  const fileOf = (kind: string) => documents.find(row => row.documentType === `${kind} revision ${currentRevision(rows, iso.id, kind)}` || row.documentType === kind);
  const itps = [['ITP', iso.itpNo], ['ITP 2', iso.itpNo2]] as const;

  const slot = (kind: string, number: unknown, label: string) => {
    const file = fileOf(kind), text = show(number), rev = currentRevision(rows, iso.id, kind);
    return <div className="iso-slot" key={kind}>
      <div className="iso-slot-main"><FileText size={18} aria-hidden="true"/><div><small>{label}</small>
        {file ? <a className="text-link" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer">{text}<Download size={13} aria-hidden="true"/></a> : <strong>{text}</strong>}
        <span className="iso-slot-meta">{kind === 'ISO' && iso.irn ? <>IRN {String(iso.irn)} · </> : null}
          {historyAvailable ? <button className="text-link" onClick={() => setHistory(true)} aria-label={`${kind} revision ${rev}, open revision history`}>Rev {rev}</button> : <>Rev {rev}</>}
          {!file && ' · no file'}</span></div></div>
      <div className="iso-slot-actions">
        {canImport && <button className="icon-btn" aria-label={`Upload ${kind} document`} title={`Upload ${kind} document`} onClick={() => onUpload(kind)}><Upload size={16}/></button>}
        {canRevise && <button className="icon-btn" aria-label={`Add ${kind} revision`} title={`Add ${kind} revision`} onClick={() => setRevision(kind)}><Plus size={17}/></button>}
      </div>
    </div>;
  };

  return <div className="iso-header" style={{ '--pilot-color': pilot?.pilot.color } as React.CSSProperties}>
    <Card title="Identification">
      {slot('ISO', iso.isoNo, 'ISO No')}
      <dl className="iso-facts"><Fact label="Asset tag">{show(iso.assetTag)}</Fact><Fact label="Drawing no.">{show(iso.drawingNo)}</Fact></dl>
    </Card>
    <Card title="ITPs" aside={<span className="iso-count">{itps.filter(([, number]) => String(number || '').trim()).length}/2</span>}>
      {itps.map(([kind, number]) => slot(kind, number, kind === 'ITP' ? 'ITP No' : 'ITP No 2'))}
    </Card>
    <Card title="Compliance">
      <dl className="iso-facts"><Fact label="NoBo">{iso.noBo ? 'Yes' : 'No'}</Fact><Fact label="NoBo Reg. no. / serial">{show(iso.noBoReg)} / {show(iso.noBoSerial)}</Fact><Fact label="PED Cat.-Mod">{show(iso.ped)}</Fact><Fact label="X Ray %">{show(iso.xRay)}</Fact></dl>
    </Card>
    <Card title="Technical">
      <dl className="iso-facts"><Fact label="Piping class">{show(iso.pipingClass)}</Fact><Fact label="PWHT">{iso.pwht ? 'Yes' : 'No'}</Fact><Fact label="Test pressure">{show(iso.testPressure)}</Fact><Fact label="Test system">{show(testSystem?.name)}</Fact></dl>
    </Card>
    <ProgressCard key={`${iso.id}-${iso._version}`} iso={iso} progress={status.progress} budgets={budgets} editable={canEdit}/>
    <Card title="Status" className="iso-status-card">
      <div className="iso-total" role="group" aria-label="Isometric progress">
        <strong>{status.progress.total === null ? '—' : `${formatNumber(status.progress.total)} %`}</strong>
        <span>{status.progress.configured ? 'of the isometric' : 'weights not configured'}</span>
      </div>
      <Progress value={status.progress.total ?? 0}/>
      <dl className="iso-facts">
        <Fact label="Quality"><span title={status.quality.percent === null ? 'No NDT result accepted or rejected yet.' : `${status.quality.accepted} accepted, ${status.quality.rejected} rejected`}>{status.quality.percent === null ? '—' : `${formatNumber(status.quality.percent)} %`}</span></Fact>
        <Fact label="Blockers">{status.blockers.total
          ? <button className="iso-open-count" aria-haspopup="dialog" onClick={() => setBlockers(true)}>{status.blockers.total} open</button>
          : <span className="iso-clear"><Check size={14} aria-hidden="true"/>0 open</span>}</Fact>
        <Fact label="Priority">{priorityLabel(iso.priority)}</Fact>
      </dl>
      <PhaseFlags iso={iso}/>
      <ReleaseStatus iso={iso}/>
      <PunchStatus iso={iso} items={rows.punchlists ?? null}/>
      {pilot?.pilot.key === 'mto' && <div className="iso-material-slot" data-slot="material-status" aria-hidden="true"/>}
    </Card>
    {blockers && <Modal title="What blocks this isometric" subtitle={`${show(iso.isoNo)} · ${status.blockers.total} open`} onClose={() => setBlockers(false)}>
      <div className="modal-body iso-blockers">{status.blockers.groups.map(group => <section key={group.key} aria-label={group.title}>
        <h3>{group.title}<span className="count-pill">{group.count}</span></h3>
        <ul>{group.items.map((item, index) => <li key={`${item.weldId || 'iso'}-${index}`}>{item.weldId && canRecord('welds')
          ? <button className="text-link" onClick={() => { setBlockers(false); onOpenWeld(item.weldId!); }}>{item.message}</button> : item.message}</li>)}</ul>
      </section>)}</div>
      <div className="modal-footer"><button className="btn" onClick={() => setBlockers(false)}>Close</button></div>
    </Modal>}
    {revision && <WorkflowDialog actionKey="revision" defaults={{ isoId: iso.id, type: revision }} onClose={() => setRevision('')}/>}
    {history && <Modal title="Revision history" subtitle={show(iso.isoNo)} onClose={() => setHistory(false)} wide><div className="modal-body"><DrawingRevisions isoId={iso.id}/></div><div className="modal-footer"><button className="btn" onClick={() => setHistory(false)}>Close</button></div></Modal>}
  </div>;
}

/** The existing phase flags of the isometric, folded into the status card. */
function PhaseFlags({ iso }: { iso: Row }) {
  const flags = (RESOURCE_MAP.isometrics?.fields || []).filter(field => field.section === 'Phases');
  if (!flags.length) return null;
  const done = flags.filter(field => iso[field.name] === true).length;
  return <details className="iso-phases"><summary>Phases <span>{done} of {flags.length} complete</span></summary>
    <ul>{flags.map(field => <li key={field.name} className={iso[field.name] === true ? 'done' : ''}><span aria-hidden="true">{iso[field.name] === true ? '✓' : '○'}</span>{field.label}<span className="sr-only">{iso[field.name] === true ? ' done' : ' open'}</span></li>)}</ul></details>;
}

function ProgressCard({ iso, progress, budgets, editable }: { iso: Row; progress: IsoProgress; budgets?: ProgressBudgets; editable: boolean }) {
  const { refresh, notify } = useWorkspace();
  const original = useMemo(() => ({
    ...Object.fromEntries(ISO_QUANTITIES.map(quantity => [quantity.field, iso[quantity.field] === null || iso[quantity.field] === undefined ? '' : String(iso[quantity.field])])),
    ...Object.fromEntries(ISO_FINISH_ITEMS.map(item => [item.field, ISO_FINISH_STATES.includes(String(iso[item.field])) ? String(iso[item.field]) : 'Open'])),
  } as Record<string, string>), [iso]);
  const [draft, setDraft] = useState(original), [open, setOpen] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const changed = Object.keys(draft).filter(name => draft[name] !== original[name]);
  const budgetOf = (phase: 'shop' | 'field', key: string) => Number(budgets?.[phase]?.[key as 'materialPipe']) || 0;
  const set = (name: string, value: string) => { setDraft(current => ({ ...current, [name]: value })); setFieldErrors(current => ({ ...current, [name]: '' })); };

  function setAll() {
    const next = { ...draft };
    // Every enabled quantity goes to its ceiling; finish items go to Done, and N/A stays N/A (it is not part of the progress).
    for (const quantity of ISO_QUANTITIES) { const budget = budgetOf(quantity.phase, quantity.key); if (budget) next[quantity.field] = String(budget); }
    for (const item of ISO_FINISH_ITEMS) if (next[item.field] !== 'N/A') next[item.field] = 'Done';
    setDraft(next); setError('');
  }
  async function save() {
    const payload: Record<string, unknown> = {};
    for (const name of changed) payload[name] = ISO_QUANTITIES.some(quantity => quantity.field === name) ? (draft[name].trim() === '' ? null : Number(draft[name])) : draft[name];
    const problems = isoInputErrors({ isoNo: iso.isoNo, ...payload }, iso, budgets);
    if (Object.keys(problems).length) { setFieldErrors(problems); setError('Check the highlighted values.'); return; }
    setBusy(true); setError(''); setFieldErrors({});
    try { await api(`/records/isometrics/${iso.id}`, { method: 'PUT', body: JSON.stringify({ ...payload, _version: iso._version }) }); await refresh(); notify('Progress saved.'); }
    catch (failure) { setError((failure as Error).message || 'Saving failed.'); setFieldErrors((failure as ApiError).fields || {}); }
    finally { setBusy(false); }
  }

  const phases = progress.phases;
  return <Card title="Progress" className="iso-progress-card">
    {!progress.configured && <p className="iso-hint" role="status">Progress weights are not configured. Set them under Iso progress on the main project.</p>}
    <div className="iso-phase-list">{phases.map(phase => {
      const id = `iso-phase-${iso.id}-${phase.key}`, expanded = open === phase.key;
      const label = phase.key === 'shop' ? 'Shop prefab' : phase.label;
      return <div key={phase.key} className="iso-phase">
        <h3><button aria-expanded={expanded} aria-controls={id} onClick={() => setOpen(expanded ? '' : phase.key)}>
          <span className="iso-phase-name">{label}</span><span className="iso-phase-value">{phase.percent === null ? '—' : `${formatNumber(phase.percent)} %`}</span><ChevronDown size={16} className="iso-chevron" aria-hidden="true"/></button></h3>
        {expanded && <div id={id} className="iso-phase-body">
          {phase.key === 'site' ? <div className="iso-finish">
            {ISO_FINISH_ITEMS.map(item => <fieldset key={item.field} disabled={!editable}><legend>{item.label}{item.field === 'paintState' && iso.paintSpec ? <small> · {String(iso.paintSpec)}</small> : null}</legend>
              <div className="iso-segmented">{ISO_FINISH_STATES.map(state => <label key={state} className={draft[item.field] === state ? 'on' : ''}><input type="radio" name={`${id}-${item.field}`} value={state} checked={draft[item.field] === state} onChange={() => set(item.field, state)}/>{state}</label>)}</div>
              {fieldErrors[item.field] && <small className="field-error">{fieldErrors[item.field]}</small>}</fieldset>)}
          </div> : <div className="iso-quantities">{ISO_QUANTITIES.filter(quantity => quantity.phase === phase.key).map(quantity => {
            const budget = budgetOf(quantity.phase, quantity.key), inputId = `${id}-${quantity.field}`, entered = Number(draft[quantity.field]);
            const percent = budget ? `${formatNumber(Math.min(100, (Number.isFinite(entered) ? entered : 0) / budget * 100), 0)} %` : 'N/A · no MTO budget yet';
            return <div className="iso-quantity" key={quantity.field} title={budget ? undefined : NO_BUDGET_TIP}>
              <label htmlFor={inputId}>{quantity.label} ({quantity.unit})</label>
              <input id={inputId} type="number" min={0} max={budget || undefined} step="any" inputMode="decimal" disabled={!editable || !budget} placeholder={budget ? '' : 'N/A'} value={budget ? draft[quantity.field] : ''} aria-describedby={`${inputId}-note`} aria-invalid={Boolean(fieldErrors[quantity.field])} onChange={event => set(quantity.field, event.target.value)}/>
              <small id={`${inputId}-note`}>{percent}{budget ? ` of ${formatNumber(budget, 2)}` : ''}</small>
              {fieldErrors[quantity.field] && <small className="field-error">{fieldErrors[quantity.field]}</small>}
            </div>; })}</div>}
        </div>}
      </div>; })}</div>
    {error && <div className="alert error" role="alert"><AlertCircle size={16}/><span>{error}</span></div>}
    {!editable && <p className="iso-hint">You can view the progress but not change it.</p>}
    {editable && <div className="iso-progress-actions">
      <button className="btn primary small" disabled={busy || !changed.length} onClick={() => void save()}>{busy && <Loader2 size={14} className="spin"/>}Save</button>
      <button className="btn small" disabled={busy} onClick={setAll}>Set all to 100%</button>
      {changed.length > 0 && <span className="iso-unsaved" role="status">Unsaved changes</span>}
    </div>}
    {!progress.configured && <Link className="text-link iso-weights-link" to="/workspace/main-projects">Open main projects</Link>}
  </Card>;
}
