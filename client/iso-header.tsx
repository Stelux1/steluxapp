import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, ExternalLink, Loader2, Play, Plus } from 'lucide-react';
import { useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { Modal, Progress } from './components.tsx';
import { AddRevisionDialog, DrawingRevisions } from './drawing-revisions.tsx';
import { ItpCardLinkButton, ItpLinkControl } from './itp-dashboard.tsx';
import { EditWeldDialog } from './weld-entry.tsx';
import { NdtWeldDialog } from './inspections.tsx';
import { HYDROTEST_NOT_IN_SCOPE, IDENTIFICATION_FACTS, hydrotestStateText, openPunchCount, phaseBreakdown } from '../shared/iso-card-facts.ts';
import { itpCard, NO_ITP_LINKED } from '../shared/iso-itps-card.ts';
import { blockerOpening, punchListUrl, RELEASE_STATUS_ANCHOR, type BlockerOpening } from '../shared/iso-blocker-targets.ts';
import { lockContext, weldLock } from '../shared/weld-entry.ts';
import { formatMaterialStatus, materialStatus } from '../shared/mto-materials.ts';
import { hydrotestState, isoTestSystemIds } from '../shared/hydrotest.ts';
import { hydrotestSpoolsPath } from './hydrotest.tsx';
import { ReleaseStatus } from './releases.tsx';
import { PunchDialog, PunchStatus } from './punch.tsx';
import { RESOURCE_MAP } from './catalog.ts';
import { ApiError, api, formatNumber, apiUrl } from './api.ts';
import { currentRevision } from '../shared/revisions.ts';
import { isoDrawingTitle, itpDrawingTitle, latestIsoFile } from '../shared/iso-pages.ts';
import { ISO_FINISH_ITEMS, ISO_FINISH_STATES, ISO_QUANTITIES, isoBlockers, isoBudgets, isoInputErrors, isoProgress, isoQuality, noBudgetText, quantityProgress, type IsoStatusInput, type ProgressBudgets } from '../shared/iso-status.ts';
import { priorityLabel } from '../shared/priority.ts';
import { punchCounts } from '../shared/punch.ts';
import { BLOCKER_TITLES } from '../shared/iso-status.ts';
import { PROGRESS_CARD_TEXTS, blockerCountText, finishSpecification, percentText, quantityBarText, summaryProgress } from '../shared/iso-summary.ts';
import { startedIsoIds } from '../shared/iso-list.ts';
import type { Row } from '../shared/types.ts';

const show = (value: unknown) => String(value ?? '').trim() || '—';

function Card({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  const id = useId();
  return <section className={`panel iso-card ${className}`} aria-labelledby={id}><h2 id={id}>{title}</h2>{children}</section>;
}
/** One row of a compact card: label left, value right (client change list 22.11.2026, image 20). */
const Line = ({ label, children, title }: { label: string; children: ReactNode; title?: string }) => <div><dt>{label}</dt><dd title={title}>{children}</dd></div>;
/** The label above the value, as the Details disclosure and Material Core's material slot list their facts. */
const Fact = ({ label, children }: { label: string; children: ReactNode }) => <div><dt>{label}</dt><dd>{children}</dd></div>;

interface HeaderProps {
  iso: Row; project?: Row;
  /** Attached drawing and ITP files of the isometric, newest first. */
  documents: Row[];
  /** Opens Edit isometric (the way the Custom field, the isometric's IRN, is edited); absent without the right. */
  onEditIsometric?: () => void;
  /** The progress quantities dialog, opened from the Completion row and from the page's Options menu. */
  quantities: boolean;
  onQuantities: (open: boolean) => void;
}

/**
 * The top of the isometric page in both Cores (client change list 22.11.2026, image 20): four compact cards —
 * Identification, Compliance, Technical, Progress & Status — and one collapsed Details disclosure with what the cards
 * do not show (Asset tag, Quality, blockers, ITP links, phase flags, release status, punch status). The progress
 * quantities are a dialog. The cards are short so the register below dominates the page.
 */
export function IsometricHeader({ iso, project, documents, onEditIsometric, quantities, onQuantities }: HeaderProps) {
  const { rows, canRecord, canRun, isoSummaries } = useWorkspace(); const pilot = usePilot(); const parts = statusCardParts(pilot?.pilot.key);
  const [details, setDetails] = useState(false), [revision, setRevision] = useState(''), [history, setHistory] = useState(false), [blockers, setBlockers] = useState(false), [opened, setOpened] = useState<BlockerOpening | null>(null), [punch, setPunch] = useState(false);
  const site = rows.sites?.find(row => row.id === project?.siteId);
  // Budgets: the server summary carries them in the hosted profile (Weld Core cannot read material lines); elsewhere from the rows.
  const budgets = useMemo(() => isoSummaries?.[iso.id] ? isoSummaries[iso.id].budgets : isoBudgets(iso, rows), [isoSummaries, iso, rows]);
  // Hosted profile: the server summary (computed from every record, the same in both Cores). Weld-level items are
  // computed here only where this Core reads welds; elsewhere each group shows its count. Other profiles: computed here.
  const summary = isoSummaries?.[iso.id], weldItems = canRecord('welds');
  const status = useMemo(() => {
    const input: IsoStatusInput = { iso, site, welds: rows.welds || [], weldTypes: rows.weld_types || [], diameters: rows.diameters || [], results: rows.inspection_results || [], releases: rows.releases ?? null, punch: rows.punchlists ?? null, testSystems: rows.test_systems ?? null, hydrotestRequests: rows.hydrotest_requests ?? null, spools: rows.spools ?? null, hydrotestResults: rows.hydrotest_results ?? null, flanges: rows.flanges ?? null, budgets };
    const local = !summary || weldItems ? isoBlockers(input) : null;
    if (!summary) return { blockers: local!, quality: isoQuality(input), progress: isoProgress(input) };
    // A group lists its items only when the local calculation agrees with the server's count; otherwise its count line.
    const groups = summary.blockers.groups.map(group => {
      const mine = local?.groups.find(item => item.key === group.key);
      return { key: group.key, title: BLOCKER_TITLES[group.key], count: group.count, items: mine && mine.count === group.count ? mine.items : [{ message: blockerCountText(group.key, group.count) }] };
    });
    return { blockers: { groups, total: summary.blockers.total }, quality: summary.quality, progress: summaryProgress(summary) };
  }, [rows, iso, site, budgets, summary, weldItems]);
  const canEdit = canRecord('isometrics', 'edit', iso);
  const canRevise = canRun('revision', { isoId: iso.id }), historyAvailable = canRecord('revisions');
  // Material Core reads no test systems: the server summary carries the name of this isometric's own one.
  const testSystem = rows.test_systems?.find(row => row.id === iso.testSystemId);
  const isoFile = latestIsoFile(rows, documents, iso.id, 'ISO').file, rev = currentRevision(rows, iso.id, 'ISO');
  // ITP row: the register ITPs linked to this isometric (shared/iso-itps-card.ts); typed ITP numbers do not count.
  const itpCardState = itpCard(iso, rows.itps, rows.attachments);
  const locks = useMemo(() => lockContext(rows.weld_types, rows.releases, rows.isometrics), [rows.weld_types, rows.releases, rows.isometrics]);
  const hydrotest = summary?.hydrotest ?? hydrotestState(iso, rows);
  const systems = rows.test_systems ? isoTestSystemIds(iso, rows).map(id => rows.test_systems!.find(row => row.id === id && !row._archived)).filter((row): row is Row => Boolean(row)) : [];
  const punchSummary = summary?.punch ?? (rows.punchlists ? punchCounts(rows.punchlists.filter(row => row.isoId === iso.id && !row._archived)) : null), openPunch = openPunchCount(punchSummary);
  const punchLinked = pilot?.pilot.key === 'weld' && canRecord('punchlists');
  const [shop, field] = status.progress.phases;
  /** A click on a blocker item opens the dialog that fixes it (shared/iso-blocker-targets.ts). */
  function openBlocker(item: { target?: Parameters<typeof blockerOpening>[0] }) {
    const opening = blockerOpening(item.target, iso, id => { const weld = rows.welds?.find(row => row.id === id); return Boolean(weld) && weldLock(weld!, locks).locked; });
    if (!opening) return;
    setBlockers(false);
    if (opening.dialog === 'release') { setDetails(true); requestAnimationFrame(() => { const line = document.getElementById(RELEASE_STATUS_ANCHOR); line?.scrollIntoView({ block: 'center' }); line?.focus({ preventScroll: true }); }); }
    else if (opening.dialog === 'punch') return;
    else setOpened(opening);
  }
  const quality = status.quality.percent === null ? '—' : percentText(status.quality.percent);

  return <>
    <div className="iso-header" style={{ '--pilot-color': pilot?.pilot.color } as React.CSSProperties}>
      <Card title="Identification"><dl className="iso-rows">
        <Line label="ISO ID"><span className="iso-row-value">{isoFile ? <a className="text-link" href={apiUrl(`/files/${isoFile.id}`)} target="_blank" rel="noreferrer" title={isoDrawingTitle(isoFile, rev)}>{show(iso.isoNo)}<ExternalLink size={12} aria-hidden="true"/></a> : <strong title={isoDrawingTitle(undefined, rev)}>{show(iso.isoNo)}</strong>}
          {canRevise && <button type="button" className="icon-btn iso-row-icon" aria-label="Add rev" title="Add rev" onClick={() => setRevision('ISO')}><Plus size={15}/></button>}</span></Line>
        <Line label="Revision">{historyAvailable ? <button type="button" className="text-link" onClick={() => setHistory(true)} aria-label={`Revision ${rev}, open revision history`}>Rev {rev}</button> : <>Rev {rev}</>}</Line>
        <Line label="ITP" title={`${itpCardState.counter} ITP slots linked`}><span className="iso-row-value iso-itp-links">{itpCardState.rows.map(entry => <span key={entry.slot}>{entry.file
          ? <a className="text-link" href={apiUrl(`/files/${entry.file.id}`)} target="_blank" rel="noreferrer" title={itpDrawingTitle(entry.file, entry.revision)}>{show(entry.number)} · Rev {entry.revision || '—'}<ExternalLink size={12} aria-hidden="true"/></a>
          : <span title={itpDrawingTitle(undefined, entry.revision)}>{show(entry.number)} · Rev {entry.revision || '—'}</span>}</span>)}
          {!itpCardState.rows.length && <span className="muted" title={NO_ITP_LINKED}>—</span>}
          <ItpCardLinkButton iso={iso} compact/></span></Line>
        <Line label="Custom field"><span className="iso-row-value"><span title="IRN of the isometric">{show(iso.irn)}</span>{canEdit && onEditIsometric && <button type="button" className="text-link" onClick={onEditIsometric} aria-label="Edit the custom field (IRN) in Edit isometric">Edit</button>}</span></Line>
      </dl></Card>
      <Card title="Compliance"><dl className="iso-rows">
        <Line label="NoBo">{iso.noBo ? 'Yes' : 'No'}</Line>
        <Line label="NoBo Reg. / Serial">{show(iso.noBoReg)} / {show(iso.noBoSerial)}</Line>
        <Line label="PED Cat.-Mod">{show(iso.ped)}</Line>
        <Line label="X-ray %">{show(iso.xRay)}</Line>
      </dl></Card>
      <Card title="Technical"><dl className="iso-rows">
        <Line label="Piping class">{show(iso.pipingClass)}</Line>
        <Line label="PWHT">{iso.pwht ? 'Yes' : 'No'}</Line>
        <Line label="Test pressure">{show(iso.testPressure)}</Line>
        <Line label="Test system">{show(testSystem?.name ?? summary?.testSystemName)}</Line>
      </dl></Card>
      <Card title="Progress & Status" className="iso-status-card"><dl className="iso-rows">
        <Line label="Completion"><span className="iso-row-value"><strong className="iso-completion" title={PROGRESS_CARD_TEXTS.percent}>{percentText(status.progress.total)}</strong><button type="button" className="text-link" onClick={() => onQuantities(true)}>{canEdit ? 'Edit quantities' : 'Quantities'}</button></span></Line>
        <Line label="Shop / Field"><span className="iso-row-value iso-phases-value">{[shop, field].filter(Boolean).map((phase, index) => <span key={phase.key} title={phaseBreakdown(phase)}>{index ? ' / ' : ''}{phase.label} {percentText(phase.percent)}</span>)}</span></Line>
        {parts.weldExtras ? <>
          <Line label="Hydrotest"><span className="iso-row-value"><span title={hydrotest.inScope ? undefined : HYDROTEST_NOT_IN_SCOPE}>{hydrotestStateText(hydrotest)}</span>
            {systems.length ? systems.map(system => <Link key={system.id} className="text-link" to={hydrotestSpoolsPath(system.id)} title={`Spools of test system ${system.name}`}>{String(system.name)}</Link>) : summary?.testSystemName ? <span>{summary.testSystemName}</span> : null}</span></Line>
          <Line label="Punch / Priority"><span className="iso-row-value">{openPunch === null ? <span className="muted">—</span> : punchLinked ? <button type="button" className="text-link" aria-haspopup="dialog" onClick={() => setPunch(true)}>{openPunch} open</button> : <span>{openPunch} open</span>}<span aria-hidden="true">·</span><span>{priorityLabel(iso.priority) || '—'}</span></span></Line>
        </> : <MaterialRows percent={summary ? summary.materialStatus.percent : materialStatus(iso, rows).percent} hydrotest={hydrotest}/>}
      </dl></Card>
    </div>
    <details className="panel iso-details" open={details} onToggle={event => setDetails(event.currentTarget.open)}>
      <summary><span className="iso-details-title">Details</span><span className="iso-details-meta">
        <span>Quality {quality}</span>
        {parts.weldExtras && (status.blockers.total ? <span className="iso-details-warn">{status.blockers.total} {status.blockers.total === 1 ? 'blocker' : 'blockers'}</span> : <span className="iso-clear"><Check size={13} aria-hidden="true"/>No blockers</span>)}
        <span className="iso-details-hint">{parts.weldExtras ? 'Asset tag, zone, ITP links, phases, release, punch' : 'Asset tag, zone, ITP links'}</span></span></summary>
      <div className="iso-details-body">
        <dl className="iso-facts">
          {IDENTIFICATION_FACTS.map(fact => <Fact key={fact.field} label={fact.label}>{show(iso[fact.field])}</Fact>)}
          <Fact label="Zone / Area">{show(iso.zone || iso.area)}</Fact>
          <Fact label="Quality"><span title={status.quality.percent === null ? 'No NDT result accepted or rejected yet.' : `${status.quality.accepted} accepted, ${status.quality.rejected} rejected`}>{quality}</span></Fact>
          {parts.weldExtras && <Fact label="Blockers">{status.blockers.total
            ? <button type="button" className="iso-open-count" aria-haspopup="dialog" onClick={() => setBlockers(true)}>{status.blockers.total} open</button>
            : <span className="iso-clear"><Check size={14} aria-hidden="true"/>0 open</span>}</Fact>}
        </dl>
        <section className="iso-details-section" aria-label="ITP links"><h3>ITP links <span className="iso-count">{itpCardState.counter}</span></h3>
          {itpCardState.rows.length ? <ul className="iso-itp-rows">{itpCardState.rows.map(entry => <li key={entry.slot} className="iso-itp-row">
            <div>{entry.file ? <a className="text-link iso-itp-number" href={apiUrl(`/files/${entry.file.id}`)} target="_blank" rel="noreferrer" title={itpDrawingTitle(entry.file, entry.revision)}>{show(entry.number)}<ExternalLink size={13} aria-hidden="true"/></a> : <strong title={itpDrawingTitle(undefined, entry.revision)}>{show(entry.number)}</strong>}{entry.scope && <small>{entry.scope}</small>}</div>
            <div className="iso-itp-title" title={entry.title || undefined}>{entry.titleCut || '—'}</div>
            <div className="iso-itp-meta"><span>Rev {entry.revision || '—'}</span></div>
            <ItpLinkControl iso={iso} slot={entry.slot}/>
          </li>)}</ul>
            : <p className="iso-itp-empty"><span aria-hidden="true">—</span> {NO_ITP_LINKED}<ItpCardLinkButton iso={iso}/></p>}
        </section>
        {parts.weldExtras && <>
          <PhaseFlags iso={iso}/>
          <div id={RELEASE_STATUS_ANCHOR} tabIndex={-1} className="iso-release-anchor"><ReleaseStatus iso={iso}/></div>
          <PunchStatus iso={iso} items={rows.punchlists ?? null} summary={summary?.punch}/>
        </>}
      </div>
    </details>
    {quantities && <ProgressQuantitiesDialog key={`${iso.id}-${iso._version}`} iso={iso} budgets={budgets} editable={canEdit} onClose={() => onQuantities(false)}/>}
    {punch && <PunchDialog isoId={iso.id} onClose={() => setPunch(false)}/>}
    {blockers && <Modal title="What blocks this isometric" subtitle={`${show(iso.isoNo)} · ${status.blockers.total} open`} onClose={() => setBlockers(false)}>
      <div className="modal-body iso-blockers">{status.blockers.groups.map(group => <section key={group.key} aria-label={group.title}>
        <h3>{group.title}<span className="count-pill">{group.count}</span></h3>
        <ul>{group.items.map((item, index) => <li key={`${item.weldId || 'iso'}-${index}`}>{item.target && (!item.target.weldId || canRecord('welds'))
          ? item.target.kind === 'punch' ? canRecord('punchlists') && pilot?.pilot.key === 'weld' ? <Link className="text-link" to={item.href || punchListUrl(iso, item.target.punchType)} target="_blank" rel="noreferrer" onClick={() => setBlockers(false)}>{item.message}</Link> : item.message : <button className="text-link" onClick={() => openBlocker(item)}>{item.message}</button>
          : item.href && canRecord('punchlists') && pilot?.pilot.key === 'weld' ? <Link className="text-link" to={item.href} target="_blank" rel="noreferrer">{item.message}</Link> : item.message}</li>)}</ul>
      </section>)}</div>
      <div className="modal-footer"><button className="btn" onClick={() => setBlockers(false)}>Close</button></div>
    </Modal>}
    {opened?.dialog === 'edit-weld' && rows.welds?.find(row => row.id === opened.weldId) && <EditWeldDialog iso={iso} weld={rows.welds!.find(row => row.id === opened.weldId)!} onClose={() => setOpened(null)}/>}
    {opened?.dialog === 'ndt' && rows.welds?.find(row => row.id === opened.weldId) && <NdtWeldDialog weld={rows.welds!.find(row => row.id === opened.weldId)!} type={opened.type} onClose={() => setOpened(null)}/>}
    {revision && <AddRevisionDialog iso={iso} kind={revision} onClose={() => setRevision('')}/>}
    {history && <Modal title="Revision history" subtitle={show(iso.isoNo)} onClose={() => setHistory(false)} wide><div className="modal-body"><DrawingRevisions isoId={iso.id}/></div><div className="modal-footer"><button className="btn" onClick={() => setHistory(false)}>Close</button></div></Modal>}
  </>;
}

/**
 * '[▶ Started]' after the isometric's name once a pick list exists for it (reference weld__iso__00022.txt:1484-1487 and
 * mto__iso__00022.txt:37-38), in both Cores. Cores read it from the server summary, as Weld Core reads no pick lists.
 */
export function IsoStartedTag({ iso }: { iso: Row }) {
  const { rows, isoSummaries } = useWorkspace();
  const summary = isoSummaries?.[iso.id];
  const started = summary ? summary.flags.mtoStarted === true : Boolean(startedIsoIds(rows.picklists)?.has(iso.id));
  return started ? <span className="iso-started-tag">[<Play size={11} aria-hidden="true"/> Started]</span> : null;
}

/** "Hydrotest completed" of Material Core: always Yes or No (No also without a test system, as in the reference). */
export const hydrotestCompletedText = (hydrotest: { inScope: boolean; completed: boolean }) => hydrotest.completed ? 'Yes' : 'No';

/**
 * What the Progress & Status card holds besides Completion and Shop / Field: in Material Core Hydrotest completed and
 * Material status (reference); Hydrotest with its test systems, Punch / Priority, the blockers, phase, release and punch
 * details only in the other Cores.
 */
export const statusCardParts = (pilotKey?: string) => ({ weldExtras: pilotKey !== 'mto' });

/** Hydrotest completed and Material status as two rows of the Progress & Status card (Material Core). */
function MaterialRows({ percent, hydrotest }: { percent: number | null; hydrotest: { inScope: boolean; completed: boolean } }) {
  return <>
    <Line label="Hydrotest completed"><span title={hydrotest.inScope ? undefined : HYDROTEST_NOT_IN_SCOPE}>{hydrotestCompletedText(hydrotest)}</span></Line>
    <Line label="Material status"><span className="iso-row-value" title={percent === null ? 'The isometric has no material lines yet.' : undefined}>{formatMaterialStatus(percent)}{percent !== null && <Progress value={percent}/>}</span></Line>
  </>;
}

/** Hydrotest completed, then Material status (Material Core): covered ÷ required over the isometric's material lines in whole percent, "Empty" without lines (shared/mto-materials.ts). */
export function MaterialStatusSlot({ percent, hydrotest }: { percent: number | null; hydrotest: { inScope: boolean; completed: boolean } }) {
  return <div className="iso-material-slot" data-slot="material-status"><dl className="iso-rows"><MaterialRows percent={percent} hydrotest={hydrotest}/></dl></div>;
}

/** The existing phase flags of the isometric, in the Details disclosure. */
function PhaseFlags({ iso }: { iso: Row }) {
  const flags = (RESOURCE_MAP.isometrics?.fields || []).filter(field => field.section === 'Phases');
  if (!flags.length) return null;
  const done = flags.filter(field => iso[field.name] === true).length;
  return <details className="iso-phases"><summary>Phases <span>{done} of {flags.length} complete</span></summary>
    <ul>{flags.map(field => <li key={field.name} className={iso[field.name] === true ? 'done' : ''}><span aria-hidden="true">{iso[field.name] === true ? '✓' : '○'}</span>{field.label}<span className="sr-only">{iso[field.name] === true ? ' done' : ' open'}</span></li>)}</ul></details>;
}

/**
 * The isometric's stored progress quantities and finish states (the former Progress card, now a dialog opened from
 * Completion and from Options). Every input still saves its stored field. Of the quantities only Field supports drives the
 * progress (Supports erection); the others stay as recorded values beside their MTO budgets.
 */
function ProgressQuantitiesDialog({ iso, budgets, editable, onClose }: { iso: Row; budgets?: ProgressBudgets; editable: boolean; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const id = `iso-quantities-${useId().replaceAll(':', '')}`;
  const original = useMemo(() => ({
    ...Object.fromEntries(ISO_QUANTITIES.map(quantity => [quantity.field, iso[quantity.field] === null || iso[quantity.field] === undefined ? '' : String(iso[quantity.field])])),
    ...Object.fromEntries(ISO_FINISH_ITEMS.map(item => [item.field, ISO_FINISH_STATES.includes(String(iso[item.field])) ? String(iso[item.field]) : 'Open'])),
  } as Record<string, string>), [iso]);
  const [draft, setDraft] = useState(original), [busy, setBusy] = useState(false), [error, setError] = useState(''), [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
    try { await api(`/records/isometrics/${iso.id}`, { method: 'PUT', body: JSON.stringify({ ...payload, _version: iso._version }) }); await refresh(); notify('Progress quantities saved.'); onClose(); }
    catch (failure) { setError((failure as Error).message || 'Saving failed.'); setFieldErrors((failure as ApiError).fields || {}); }
    finally { setBusy(false); }
  }

  const phases = [{ key: 'shop' as const, label: 'Shop prefab' }, { key: 'field' as const, label: 'Field' }];
  return <Modal title="Progress quantities" subtitle={show(iso.isoNo)} onClose={onClose}>
    <div className="modal-body iso-quantities-dialog">
      {error && <div className="alert error" role="alert"><AlertCircle size={16}/><span>{error}</span></div>}
      <p className="iso-hint">The progress of the isometric is computed from its welds, tests, flanges and releases. Of these quantities only Field supports counts (Supports erection); the others are kept as recorded.</p>
      {phases.map(phase => <section key={phase.key} className="iso-quantity-group" aria-labelledby={`${id}-${phase.key}`}>
        <h3 id={`${id}-${phase.key}`} title={PROGRESS_CARD_TEXTS.phase[phase.key]}>{phase.label}</h3>
        <div className="iso-quantities">{ISO_QUANTITIES.filter(quantity => quantity.phase === phase.key).map(quantity => {
          const budget = budgetOf(quantity.phase, quantity.key), inputId = `${id}-${quantity.field}`;
          const percent = quantityBarText(quantity.phase, budget, quantityProgress(draft[quantity.field], budgets, quantity.phase, quantity.key));
          return <div className="iso-quantity" key={quantity.field} title={budget ? undefined : noBudgetText(quantity.phase, quantity.key)}>
            <label htmlFor={inputId}>{quantity.label} ({quantity.unit}){quantity.phase === 'field' && quantity.key === 'supports' && <small className="iso-drives"> · drives Supports erection</small>}</label>
            <input id={inputId} type="number" min={0} max={budget || undefined} step="any" inputMode="decimal" disabled={!editable || !budget} placeholder={budget ? '' : 'N/A'} value={budget ? draft[quantity.field] : ''} aria-describedby={`${inputId}-note`} aria-invalid={Boolean(fieldErrors[quantity.field])} onChange={event => set(quantity.field, event.target.value)}/>
            <small id={`${inputId}-note`}>{percent}<span title={PROGRESS_CARD_TEXTS.budgetColumn[quantity.phase]}>{budget ? ` of ${formatNumber(budget, 2)}` : ' · —'}</span></small>
            {fieldErrors[quantity.field] && <small className="field-error">{fieldErrors[quantity.field]}</small>}
          </div>; })}</div>
      </section>)}
      <section className="iso-quantity-group" aria-labelledby={`${id}-finish`}><h3 id={`${id}-finish`}>Paint / Tracing / Insulation</h3>
        <div className="iso-finish">{ISO_FINISH_ITEMS.map(item => <fieldset key={item.field} disabled={!editable} title={PROGRESS_CARD_TEXTS.finish}><legend>{item.label}<small title={PROGRESS_CARD_TEXTS.specification}> · {finishSpecification(iso, item.field)}</small></legend>
          <div className="iso-segmented">{ISO_FINISH_STATES.map(state => <label key={state} className={draft[item.field] === state ? 'on' : ''}><input type="radio" name={`${id}-${item.field}`} value={state} checked={draft[item.field] === state} onChange={() => set(item.field, state)}/>{state}</label>)}</div>
          {fieldErrors[item.field] && <small className="field-error">{fieldErrors[item.field]}</small>}</fieldset>)}</div>
      </section>
      {!editable && <p className="iso-hint">You can view the quantities but not change them.</p>}
    </div>
    <div className="modal-footer">
      {editable && changed.length > 0 && <span className="iso-unsaved" role="status">Unsaved changes</span>}
      {editable && <button type="button" className="btn" disabled={busy} onClick={setAll}>Set all to 100%</button>}
      <button type="button" className="btn" disabled={busy} onClick={onClose}>{editable ? 'Cancel' : 'Close'}</button>
      {editable && <button type="button" className="btn primary" title={PROGRESS_CARD_TEXTS.save} disabled={busy || !changed.length} onClick={() => void save()}>{busy && <Loader2 size={14} className="spin"/>}Save</button>}
    </div>
  </Modal>;
}
