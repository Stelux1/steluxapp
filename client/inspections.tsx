import { useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Download, FileText, Filter, Loader2, Pencil, Printer, RefreshCw, Search, Upload } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import {
  ARCHIVE_PAGE_SIZES, ARCHIVE_VIEWS, MANAGER_PAGE_SIZES, MANAGER_TABS, MASS_REQUEST_TEXTS, NDT_RESULT_CHOICES, NDT_ROUNDS, NDT_DOCUMENT, PWHT_DOCUMENT, REQUEST_DOCUMENT, REQUEST_PREFIX, TRACERS_REQUIRED, currentRequest, inspectionCellState, workspaceCellRows,
  archiveViewLabel, filterManagerWelds, groupRequests, inspectionFileError, keepEligible, locationField, managerColumns, managerResults, managerWelds, massRequestPlan, monthRange, processField, requestArchiveArea, requestDetail, requestFlag, requestSelectable, resultLabel, roundErrors, roundLabel,
  weldResults, DEFECT_EMPTY_OPTION, defectOptionLabel, type ArchiveFilter, type ArchiveRow, type ArchiveView, type InspectionKind, type ManagerFilter, type ManagerTab, type MassRequestPlan, type RequestDetailLine, type RequestFilter, type RequestGroup, type RoundInput,
  VT_CHOOSE_REPORT, VT_DELETE_CONFIRM, VT_DOCUMENT, VT_FILTERS, VT_ITPS, VT_NEW_LABELS, VT_NOTHING_TO_DELETE, VT_NO_OPEN_REPORT, VT_PICKER_COLUMNS, VT_TABS, VT_TICK_ONE, VT_UPLOAD_COLUMNS, VT_UPLOAD_HELP,
  vtEligibleWelds, vtGenerateError, vtMarks, vtMissingMessage, vtOpenReports, vtResultRows, vtSeq, vtUploadReports, vtWeldIds,
  TRACER_DETAIL_TEXTS, TRACER_LOCKED_HINT, TRACER_MAX_TEXT, TRACER_NO_CANDIDATES, TRACER_PANEL_NOTE, TRACER_REMOVABLE_HINT, TRACER_SELECT_TEXT, autoReweld, naBlockErrors,
  roundLockedError, roundOpen, roundsHaveNa, tracerDetail, weldWelderIds, type TracerDetail, type TracerDetailWeld, type TracerProposal, type TracerProposalWeld,
} from '../shared/inspections.ts';
import { lockContext, weldLock } from '../shared/weld-entry.ts';
import { api, apiBlob, post, ApiError, apiUrl, formatDate } from './api.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { enabledOptions, selectableDefectCodes } from '../shared/weld-catalogs.ts';
import { Badge, EmptyState, Modal, TableScroll } from './components.tsx';
import { RequestPdfButton, VisualReportPdfButton, WeldRequestPdfButtons } from './pdf-documents.tsx';
import { InspectionCell } from './weld-inspection-cell.tsx';

// ----- shared pieces ------------------------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);
type Rows = Record<string, Row[]>;
const weldName = (weld: Row | undefined) => weld ? String(weld.weldNo || weld.id) : '—';
function weldContext(rows: Rows, weld: Row) {
  const iso = rows.isometrics?.find(row => row.id === weld.isoId);
  const project = rows.projects?.find(row => row.id === iso?.projectId);
  return { iso, project, projectName: String(project?.internnumber || project?.description || '—'), isoName: String(iso?.isoNo || '—') };
}
const weldersOf = (rows: Rows, weld: Row) => [1, 2, 3, 4].map(side => rows.welders?.find(row => row.id === weld[`welder${side}Id`])).filter((row): row is Row => Boolean(row));
/** The welder stamps as the weld table's Wdr column shows them (welder ID nr., else ID nr.), and the names for the tooltip. */
const welderNames = (rows: Rows, weld: Row) => weldersOf(rows, weld).map(row => String(row.welderCode || row.number || '')).filter(Boolean).join(', ');
const welderTitles = (rows: Rows, weld: Row) => weldersOf(rows, weld).map(row => String(row.name || row.number || '')).filter(Boolean).join(', ');

function Alert({ message }: { message: string }) { return message ? <div className="alert error" role="alert"><AlertCircle size={18}/><span>{message}</span></div> : null; }
function Footer({ busy, onClose, submit, disabled = false }: { busy: boolean; onClose: () => void; submit?: string; disabled?: boolean }) {
  return <div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>{submit ? 'Cancel' : 'Close'}</button>{submit && <button className="btn primary" disabled={busy || disabled}>{busy && <Loader2 size={15} className="spin"/>}{submit}</button>}</div>;
}
function Select({ id, label, value, onChange, options, disabled, empty = '—' }: { id: string; label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean; empty?: string | null }) {
  return <div className="field"><label htmlFor={id}>{label}</label><div className="select-wrap"><select id={id} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>{empty !== null && <option value="">{empty}</option>}{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></div>;
}
function Text({ id, label, value, onChange, disabled, type = 'text', required, list, placeholder }: { id: string; label: string; value: string | number; onChange: (value: string) => void; disabled?: boolean; type?: string; required?: boolean; list?: string; placeholder?: string }) {
  return <div className="field"><label htmlFor={id}>{label}{required && <span className="required"> *</span>}</label><input id={id} type={type} value={value} disabled={disabled} required={required} list={list} placeholder={placeholder} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} onChange={e => onChange(e.target.value)}/></div>;
}
/** Catalog rows offered on a main project ("Enabled on this site", shared/weld-catalogs.ts); stored values stay selectable. */
const enabledRows = (rows: Record<string, Row[]>, key: string, siteId: unknown, keep?: unknown) => enabledOptions(key, activeRows(rows, key), String(siteId || '') || null, rows, keep);
const options = (rows: Row[] | undefined, label = (row: Row) => String(row.name)) => (rows || []).filter(row => !row._archived).map(row => ({ value: row.id, label: label(row) }));

/** Uploads files to a record (one request each); returns how many failed. */
async function uploadFiles(entityType: string, entityId: string, files: File[], documentType: string) {
  let failed = 0;
  for (const file of files) {
    const body = new FormData(); body.set('entityType', entityType); body.set('entityId', entityId); body.set('documentType', documentType); body.set('file', file);
    try { await api('/files', { method: 'POST', body }); } catch { failed++; }
  }
  return failed;
}
function FilePicker({ id, label, files, onChange, pdf = false, hint, single = false }: { id: string; label: string; files: File[]; onChange: (files: File[]) => void; pdf?: boolean; hint?: string; single?: boolean }) {
  return <div className="field full-width"><label htmlFor={id}>{label}</label><input id={id} type="file" multiple={!single} accept={pdf ? '.pdf,application/pdf' : '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt'} onChange={e => onChange(Array.from(e.target.files || []))}/><small className="field-hint">{hint || (pdf ? 'PDF files only. Several files can be chosen.' : 'Several files can be chosen.')}{files.length ? ` ${files.length} selected.` : ''}</small></div>;
}
function FileLinks({ files }: { files: Row[] }) {
  if (!files.length) return <p className="muted">No documents yet.</p>;
  return <ul className="inspection-files">{files.map(file => <li key={file.id}><a href={apiUrl(`/files/${file.id}`)}><FileText size={14}/>{String(file.name)}</a></li>)}</ul>;
}
/** Selected welds, or a picker over the given welds when none are selected. */
function WeldPicker({ welds, value, onChange, label = 'Welds' }: { welds: Row[]; value: string[]; onChange: (ids: string[]) => void; label?: string }) {
  if (!welds.length) return <p className="muted">No welds qualify here.</p>;
  const all = welds.every(weld => value.includes(weld.id));
  return <fieldset className="inspection-weld-picker"><legend>{label} <span className="count-pill">{value.length}</span></legend>
    <label className="inspection-pick-all"><input type="checkbox" checked={all} onChange={e => onChange(e.target.checked ? welds.map(weld => weld.id) : [])}/>All welds</label>
    <div>{welds.map(weld => <label key={weld.id}><input type="checkbox" checked={value.includes(weld.id)} onChange={e => onChange(e.target.checked ? [...value, weld.id] : value.filter(id => id !== weld.id))}/>{weldName(weld)}</label>)}</div></fieldset>;
}
function useSubmit(onDone: () => void) {
  const { refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run(work: () => Promise<string>) {
    setBusy(true); setError('');
    try { const message = await work(); await refresh(); notify(message); onDone(); }
    catch (failure) { setError((failure as ApiError).message || 'Saving failed.'); }
    finally { setBusy(false); }
  }
  return { busy, error, setError, run };
}
function NoAccess({ onClose, what }: { onClose: () => void; what: string }) {
  return <Modal title="No access" onClose={onClose}><div className="modal-body"><EmptyState title="This action is restricted" description={`Your profile does not allow ${what}.`}/></div><Footer busy={false} onClose={onClose}/></Modal>;
}

// ----- NDT per weld --------------------------------------------------------------------------------------------

type RoundDraft = Required<Pick<RoundInput, 'round'>> & { processId: string; filmNo: string; reportNo: string; date: string; result: string };
type NaDraft = { naLength: string; defectType: string; welderForErrorId: string; reweld: boolean };
/** "Welder ML396, Aleksandar Djuric  Welder 2 ML670, Dimitrije Tunic": the weld's welders as text (reference showNDO). */
const welderLine = (rows: Rows, weld: Row) => [1, 2, 3, 4].map(side => ({ side, welder: rows.welders?.find(row => row.id === weld[`welder${side}Id`]) })).filter(item => item.welder).map(item => ({ label: item.side === 1 ? 'Welder' : `Welder ${item.side}`, value: [item.welder!.welderCode || item.welder!.number, item.welder!.name].filter(Boolean).map(String).join(', ') }));
/**
 * NDT / NDT Pre of one weld (reference showNDO / showNDOPre): project / iso / weld, the welders (NDT: as text; NDT Pre:
 * a required Welder select), NDT location (locked once requested), Request number (given by the request), five
 * columns of NDT process, Film Nr., NDT Rp/Nr., NDT date, NDT res. (a column without a process stays locked), the NA
 * block while a result is NA (NDT only), the tracer panel, NDT documents, Save / Cancel.
 */
export function NdtWeldDialog({ weld, type, onClose }: { weld: Row; type: 'NDT' | 'NDT PRE'; onClose: () => void }) {
  const { rows, allRows, canRun, canRecord } = useWorkspace();
  const pre = type === 'NDT PRE', context = weldContext(rows, weld);
  const editable = canRun('ndt-weld', { type });
  // A weld of a completed phase is locked: its NDT cannot be restarted (the server refuses it too, 423).
  const lock = weldLock(weld, lockContext(rows.weld_types, rows.releases, rows.isometrics));
  const request = currentRequest(rows.inspection_requests, weld.id, type);
  const results = (rows.inspection_results || []).filter(row => !row._archived && row.requestId === request?.id && row.type === type);
  const naResult = results.find(row => row.result === 'Rejected');
  // Processes of the request (mass request names them) preselect empty columns.
  const requested = String(request?.processes || '').split(',').map(name => name.trim()).filter(Boolean).map(name => activeRows(rows, 'ndt_processes').find(row => row.name === name)?.id).filter((id): id is string => Boolean(id));
  const [location, setLocation] = useState(String(weld[locationField(pre)] || request?.locationId || ''));
  const [welderId, setWelderId] = useState(String(request?.welderId || ''));
  const [rounds, setRounds] = useState<RoundDraft[]>(() => NDT_ROUNDS.map((round, i) => { const row = results.find(item => item.round === round.key); return { round: round.key, processId: String(weld[processField(pre, round.index)] || row?.processId || requested[i] || ''), filmNo: String(row?.filmNo || ''), reportNo: String(row?.reportNo || ''), date: String(row?.date || ''), result: String(row?.result || '') }; }));
  const [na, setNa] = useState<NaDraft>(() => ({ naLength: naResult?.naLength === null || naResult?.naLength === undefined ? '' : String(naResult.naLength), defectType: String(naResult?.defectType || ''), welderForErrorId: String(naResult?.welderForErrorId || ''), reweld: results.some(row => row.reweld === true) }));
  const [files, setFiles] = useState<File[]>([]);
  const [tracerIds, setTracerIds] = useState<string[] | null>(null);
  const { busy, error, setError, run } = useSubmit(onClose);
  const hasNa = !pre && roundsHaveNa(rounds);
  const small = autoReweld(weld, rows.diameters);
  /** Reference __ndoShowNAUpdate: without NA the block is cleared and ReWeld? unticked; with NA on a weld ≤ 3" ReWeld? is ticked. */
  const set = (index: number, patch: Partial<RoundDraft>) => {
    const next = rounds.map((round, i) => i === index ? { ...round, ...patch } : round);
    setRounds(next);
    if (patch.result !== undefined) { if (!roundsHaveNa(next)) setNa(current => ({ ...current, naLength: '', defectType: '', reweld: false })); else if (small) setNa(current => ({ ...current, reweld: true })); }
  };
  const documents = (rows.attachments || []).filter(file => !file._archived && file.entityType === 'inspection_requests' && file.entityId === request?.id);
  // Defect codes enabled on the weld's main project and matching its defect norm (weld catalogs); a stored value is kept.
  const site = rows.sites?.find(row => row.id === context.project?.siteId) ?? allRows.sites?.find(row => row.id === context.project?.siteId);
  const defects = selectableDefectCodes(rows, site, String(context.project?.siteId || ''), naResult?.defectType).map(code => ({ value: String(code.code), label: defectOptionLabel(code) }));
  if (na.defectType && !defects.some(option => option.value === na.defectType)) defects.unshift({ value: na.defectType, label: na.defectType });
  const ownWelders = weldWelderIds(weld).map(id => rows.welders?.find(row => row.id === id)).filter((row): row is Row => Boolean(row)).map(row => ({ value: row.id, label: [row.welderCode || row.number, row.name].filter(Boolean).map(String).join(', ') }));
  if (!canRecord('inspection_results')) return <NoAccess onClose={onClose} what="viewing NDT results"/>;
  const label = pre ? 'NDT Pre' : 'NDT';
  function submit(event: FormEvent) {
    event.preventDefault();
    if (pre && !welderId) { setError('Choose the welder.'); return; }
    for (const round of rounds) { const first = roundLockedError(round) || Object.values(roundErrors(round))[0]; if (first) { setError(`${roundLabel(round.round)}: ${first}`); return; } }
    const block = hasNa ? na : { naLength: '', defectType: '', welderForErrorId: '', reweld: false };
    const blockError = Object.values(naBlockErrors(block, { pre, hasNa, welderIds: weldWelderIds(weld) }))[0]; if (blockError) { setError(blockError); return; }
    if (files.some(file => !/\.pdf$/i.test(file.name))) { setError('NDT documents must be PDF files.'); return; }
    void run(async () => {
      await post('/actions/ndt-weld', { weldId: weld.id, type, locationId: location, rounds, ...(pre ? { welderId } : { naLength: block.naLength === '' ? null : block.naLength, defectType: block.defectType, welderForErrorId: block.welderForErrorId, reweld: block.reweld, ...(hasNa && tracerIds ? { tracerIds } : {}) }) });
      let failed = 0;
      if (files.length) {
        const next = await api<{ rows: Row[] }>('/records/inspection_requests');
        const saved = currentRequest(next.rows, weld.id, type);
        if (saved) failed = await uploadFiles('inspection_requests', saved.id, files, NDT_DOCUMENT); else failed = files.length;
      }
      return failed ? `${label} saved; ${failed} document${failed === 1 ? '' : 's'} could not be uploaded.` : `${label} of weld ${weldName(weld)} saved.`;
    });
  }
  const processOptions = options(enabledRows(rows, 'ndt_processes', context.project?.siteId, rounds.map(round => round.processId)));
  const locked = (round: RoundDraft) => !editable || !roundOpen(round);
  const naDisabled = !editable || !hasNa;
  return <Modal wide title={label} subtitle={`${context.projectName} / ${context.isoName} / ${weldName(weld)}`} onClose={onClose}>
    <form onSubmit={submit}><div className="modal-body"><Alert message={error}/>
      {!editable && <p className="field-hint">Read only: your profile cannot change these results.</p>}
      <div className="form-grid">
        {pre ? <Select id="ndt-welder" label="Welder *" value={welderId} onChange={setWelderId} options={options(activeRows(rows, 'welders'), row => [row.welderCode || row.number, row.name].filter(Boolean).map(String).join(', '))} disabled={!editable} empty="Select welder"/>
          : <div className="field ndt-welders">{welderLine(rows, weld).length ? welderLine(rows, weld).map(item => <p key={item.label}><span className="field-label">{item.label}</span><span className="inspection-readonly">{item.value}</span></p>) : <p><span className="field-label">Welder</span><span className="inspection-readonly">—</span></p>}</div>}
        <Select id="ndt-location" label="NDT location" value={location} onChange={setLocation} options={options(enabledRows(rows, 'ndt_locations', context.project?.siteId, location))} disabled={!editable || Boolean(request)} empty="Select NDT location"/>
        <div className="field"><label htmlFor="ndt-request">Request number</label><input id="ndt-request" value={String(request?.number || '')} placeholder={REQUEST_PREFIX} disabled readOnly/><small className="field-hint">Given by the NDT request.</small></div>
      </div>
      <TableScroll><table className="data-table ndt-rounds"><caption className="sr-only">Examination rounds</caption><thead><tr><th scope="col"><span className="sr-only">Field</span></th>{NDT_ROUNDS.map((round, i) => <th scope="col" key={round.key}>{round.label}{rounds[i].processId && <span className="inspection-tick" aria-label="process set"> ✔</span>}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">NDT process</th>{rounds.map((round, i) => <td key={round.round}><select aria-label={`NDT process ${roundLabel(round.round)}`} value={round.processId} disabled={!editable} onChange={e => set(i, { processId: e.target.value })}><option value="">—</option>{processOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td>)}</tr>
          <tr><th scope="row">Film Nr.</th>{rounds.map((round, i) => <td key={round.round}><input aria-label={`Film Nr. ${roundLabel(round.round)}`} value={round.filmNo} readOnly={locked(round)} disabled={!editable} onChange={e => set(i, { filmNo: e.target.value })}/></td>)}</tr>
          <tr><th scope="row">NDT Rp/Nr.</th>{rounds.map((round, i) => <td key={round.round}><input aria-label={`NDT Rp/Nr. ${roundLabel(round.round)}`} value={round.reportNo} readOnly={locked(round)} disabled={!editable} onChange={e => set(i, { reportNo: e.target.value })}/></td>)}</tr>
          <tr><th scope="row">NDT date</th>{rounds.map((round, i) => <td key={round.round}><input type="date" aria-label={`NDT date ${roundLabel(round.round)}`} value={round.date} readOnly={locked(round)} disabled={!editable} onChange={e => set(i, { date: e.target.value })}/></td>)}</tr>
          <tr><th scope="row">NDT res.</th>{rounds.map((round, i) => <td key={round.round}><select aria-label={`NDT result ${roundLabel(round.round)}`} value={round.result} disabled={locked(round)} onChange={e => set(i, { result: e.target.value, ...(e.target.value && !round.date ? { date: today() } : {}) })}>{NDT_RESULT_CHOICES.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></td>)}</tr>
        </tbody></table></TableScroll>
      <small className="field-hint">A column takes a result once its NDT process is chosen.</small>
      <div className="form-grid ndt-na-block">
        <div className="field"><label htmlFor="ndt-na-length">NA length</label><input id="ndt-na-length" inputMode="numeric" placeholder="mm" value={pre ? '' : na.naLength} disabled={pre || naDisabled} onChange={e => setNa({ ...na, naLength: e.target.value.replace(/\D/g, '') })}/></div>
        {!pre && <>
          <Select id="ndt-defect" label="Defect type" value={na.defectType} onChange={value => setNa({ ...na, defectType: value })} options={defects} disabled={naDisabled} empty={DEFECT_EMPTY_OPTION}/>
          <Select id="ndt-welder-error" label="Welder for error" value={na.welderForErrorId} onChange={value => setNa({ ...na, welderForErrorId: value })} options={ownWelders} disabled={naDisabled}/>
          <div className="field checkbox-field"><label htmlFor="ndt-reweld"><input id="ndt-reweld" type="checkbox" checked={na.reweld} disabled={naDisabled} onChange={e => setNa({ ...na, reweld: e.target.checked })}/><span>ReWeld?</span></label></div>
        </>}
      </div>
      {!pre && hasNa && editable && canRun('tracers') && <NdtTracerPanel weld={weld} welderId={na.welderForErrorId} onPendingChange={setTracerIds}/>}
      <section className="inspection-section"><h3>NDT documents</h3><FileLinks files={documents}/><WeldRequestPdfButtons weld={weld} types={[type]}/>{editable && canRecord('inspection_requests', 'import') && <FilePicker id="ndt-documents" label="NDT documents (several files; only PDFs are allowed)" files={files} onChange={setFiles} pdf/>}</section>
      {/* Reference: "Restart NDT process" under the NDT documents of the NDT / NDT Pre dialog (I1-weld-isometric, ndt-001 / ndt-pre-003). */}
      {!lock.locked && <NdtRestartBox weld={weld} type={type}/>}
    </div><Footer busy={busy} onClose={onClose} submit={editable ? 'Save' : undefined}/></form>
  </Modal>;
}

/**
 * The NDT dialog's tracer panel (reference #ndtTracerPanel): shown while an NA is chosen; "Enable tracers" loads the
 * server proposal for the weld's welder / WPS / ITP-KNR group. "Save tracers" saves the group's rejected welds at once;
 * the tracers of this weld while its NA is still unsaved go with the dialog's Save (`onPendingChange`).
 */
function NdtTracerPanel({ weld, welderId, onPendingChange }: { weld: Row; welderId: string; onPendingChange: (ids: string[] | null) => void }) {
  const { rows: scoped, allRows, refresh, notify } = useWorkspace();
  // Tracers and candidates may lie on other isometrics and projects of the site: look them up in all rows of the pilot.
  const rows = allRows.welds ? allRows : scoped;
  const [enabled, setEnabled] = useState(() => activeRows(rows, 'welds').some(row => row.tracerOfId === weld.id));
  const [state, setState] = useState<{ loading: boolean; error: string; proposal?: TracerProposal }>({ loading: false, error: '' });
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false), [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!enabled) { setState({ loading: false, error: '' }); onPendingChange(null); return; }
    let live = true; setState(current => ({ ...current, loading: true, error: '' }));
    const query = new URLSearchParams({ weldId: weld.id, pending: '1', ...(welderId ? { welderId } : {}) });
    api<{ proposal: TracerProposal }>(`/tracer-proposal?${query}`).then(({ proposal }) => {
      if (!live) return;
      setState({ loading: false, error: '', proposal });
      const picked = Object.fromEntries(proposal.sources.map(entry => [entry.source.id, entry.currentTracers.map(row => row.id)]));
      setSelection(picked);
      const own = proposal.sources.find(entry => entry.source.id === weld.id && entry.pending);
      onPendingChange(own ? picked[weld.id] : null);
    }).catch((failure: ApiError) => { if (live) setState({ loading: false, error: failure.message || 'Tracer proposal could not be loaded.' }); });
    return () => { live = false; };
  }, [enabled, welderId, weld.id, reload]);
  const proposal = state.proposal;
  function toggle(sourceId: string, id: string, on: boolean) {
    const current = selection[sourceId] || [];
    if (on && current.length >= TRACERS_REQUIRED) { setMessage(TRACER_MAX_TEXT); return; }
    if (on && Object.entries(selection).some(([other, ids]) => other !== sourceId && ids.includes(id))) { setMessage('A weld can be the tracer of one rejected weld only.'); return; }
    setMessage('');
    const next = { ...selection, [sourceId]: on ? [...current, id] : current.filter(item => item !== id) };
    setSelection(next);
    if (proposal?.sources.some(entry => entry.source.id === weld.id && entry.pending)) onPendingChange(next[weld.id] || []);
  }
  const saved = proposal?.sources.filter(entry => !entry.pending) || [];
  async function save() {
    setSaving(true); setMessage('');
    try { await post('/actions/tracers', { assignments: Object.fromEntries(saved.map(entry => [entry.source.id, selection[entry.source.id] || []])) }); await refresh(); notify('Tracers saved.'); setReload(value => value + 1); }
    catch (failure) { setMessage((failure as ApiError).message || 'Tracer(s) could not be saved.'); }
    finally { setSaving(false); }
  }
  const describe = (item: TracerProposalWeld) => { const iso = rows.isometrics?.find(row => row.id === item.isoId); const project = rows.projects?.find(row => row.id === iso?.projectId); const weldType = rows.weld_types?.find(row => row.id === item.typeId); return { project: String(project?.internnumber || project?.description || '-'), iso: String(iso?.isoNo || '-'), type: String(weldType?.abbreviation || weldType?.name || ''), date: item.date ? formatDate(item.date) : '-' }; };
  const candidate = (sourceId: string, item: TracerProposalWeld, current: boolean) => { const meta = describe(item); const checked = (selection[sourceId] || []).includes(item.id); return <label key={item.id} className="ndt-tracer-candidate"><input type="checkbox" checked={checked} disabled={current && item.locked} onChange={e => toggle(sourceId, item.id, e.target.checked)}/><span><strong>Weld {item.weldNo}</strong><small>Project: {meta.project} | ISO: {meta.iso}{meta.type ? ` | Type: ${meta.type}` : ''} | Date: {meta.date}</small><small>{item.statusLabel}</small>{current && <small className="field-hint">{item.locked ? TRACER_LOCKED_HINT : TRACER_REMOVABLE_HINT}</small>}</span></label>; };
  return <section className="inspection-section ndt-tracer-panel">
    <label className="ndt-tracer-toggle" htmlFor="ndt-enable-tracers"><input id="ndt-enable-tracers" type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/><span>Enable tracers</span></label>
    <p className="field-hint">{TRACER_PANEL_NOTE}</p>
    {enabled && <div className="ndt-tracer-body" aria-live="polite">
      {state.loading ? <p className="muted"><Loader2 size={14} className="spin"/> Loading…</p> : state.error ? <Alert message={state.error}/> : proposal && <>
        <dl className="inspection-facts">{([['Rejected welds', proposal.status.rejectedWelds], ['Expected tracers', proposal.status.expectedTracers], ['Existing tracers', proposal.status.existingTracers], ['Missing tracers', proposal.status.missingTracers]] as const).map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl>
        {message && <Alert message={message}/>}
        {proposal.sources.length ? proposal.sources.map(entry => <div className="inspection-tracer" key={entry.source.id}>
          <strong>Rejected weld {entry.source.weldNo}</strong>
          <p className="field-hint">ISO {describe(entry.source).iso} | {entry.linked} linked of {entry.expected} required.{entry.pending ? ' Saved with Save, together with the NA result.' : ''}</p>
          {entry.currentTracers.length > 0 && <div className="ndt-tracer-list">{entry.currentTracers.map(item => candidate(entry.source.id, item, true))}</div>}
          {entry.candidates.length > 0 && <><p className="field-hint">{TRACER_SELECT_TEXT}</p><div className="ndt-tracer-list">{entry.candidates.map(item => candidate(entry.source.id, item, false))}</div></>}
        </div>) : <p className="muted">{TRACER_NO_CANDIDATES}</p>}
        <div className="logistics-actions"><button type="button" className="btn small primary" disabled={saving || !saved.length} onClick={() => void save()}>{saving && <Loader2 size={14} className="spin"/>}Save tracers</button></div>
      </>}
    </div>}
  </section>;
}

// ----- Pre-HT / PWHT per weld --------------------------------------------------------------------------------

export function PwhtWeldDialog({ weld, onClose }: { weld: Row; onClose: () => void }) {
  const { rows, canRecord } = useWorkspace(); const context = weldContext(rows, weld);
  const [upload, setUpload] = useState(false);
  if (!canRecord('inspection_results')) return <NoAccess onClose={onClose} what="viewing heat treatment records"/>;
  const results = weldResults(rows.inspection_results, weld.id, ['PRE-HT', 'PWHT']);
  const state = inspectionCellState(weld, 'PWHT', workspaceCellRows(rows));
  if (upload) return <UploadPwhtDialog weldIds={[weld.id]} onClose={onClose}/>;
  return <Modal title={`Pre-HT/PWHT ${context.projectName} / ${context.isoName} / ${weldName(weld)}`} subtitle="Heat treatment requirements and recorded reports." onClose={onClose}><div className="modal-body">
    <dl className="inspection-facts"><div><dt>Pre-HT</dt><dd>{weld.pwhtReqPre ? 'Required' : 'Not required'}</dd></div><div><dt>PWHT</dt><dd>{weld.pwhtReq ? 'Required' : 'Not required'}</dd></div></dl>
    {results.length ? <TableScroll><table className="data-table"><thead><tr><th scope="col">Type</th><th scope="col">Report number</th><th scope="col">Pre report number</th><th scope="col">Check</th><th scope="col">Date</th></tr></thead><tbody>{results.map(row => <tr key={row.id}><td>{row.type === 'PRE-HT' ? 'Pre-HT' : 'PWHT'}</td><td>{String(row.reportNo || '—')}</td><td>{String(row.preReportNo || '—')}</td><td>{row.checked ? 'Yes' : 'No'}</td><td>{formatDate(row.date)}</td></tr>)}</tbody></table></TableScroll> : <EmptyState title="No heat treatment recorded" description="Upload the Pre-HT or PWHT report once the treatment is done."/>}
    <section className="inspection-section"><h3>Documents</h3><FileLinks files={[...state.reportFiles, ...state.requestFiles]}/><WeldRequestPdfButtons weld={weld} types={['PRE-HT', 'PWHT']}/></section>
  </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button>{(weld.pwhtReqPre || weld.pwhtReq) && <UploadButton onClick={() => setUpload(true)}/>}</div></Modal>;
}
function UploadButton({ onClick }: { onClick: () => void }) { const { canRun } = useWorkspace(); return canRun('pwht-upload') ? <button type="button" className="btn primary" onClick={onClick}><Upload size={15}/>Upload report</button> : null; }

// ----- tracers ------------------------------------------------------------------------------------------------

/** "Tracer details" (reference #weldTracerDetailModal): read only — the original rejected weld, the linked tracers and their NDT results. */
export function TracerDialog({ weld, onClose }: { weld: Row; onClose: () => void }) {
  const { rows: scoped, allRows, label } = useWorkspace();
  // The source and the tracers may lie on other isometrics and projects of the site.
  const rows = allRows.welds ? allRows : scoped;
  const detail = tracerDetail(weld, activeRows(rows, 'welds'), rows.inspection_results);
  const place = (row: Row) => { const context = weldContext(rows, row); return { project: context.projectName, iso: context.isoName }; };
  return <Modal wide title={TRACER_DETAIL_TEXTS.title} onClose={onClose}>
    <div className="modal-body"><TracerDetailBody detail={detail} place={place} processName={id => id ? label('ndt_processes', id) : 'NDT'}/></div>
    <Footer busy={false} onClose={onClose}/>
  </Modal>;
}
/** The read-only body of "Tracer details" (no selection: tracers are chosen in the NDT dialog). */
export function TracerDetailBody({ detail, place, processName }: { detail: TracerDetail; place: (weld: Row) => { project: string; iso: string }; processName: (id: string) => string }) {
  const results = (item: TracerDetailWeld) => item.results.length ? <ul className="ndt-tracer-results">{item.results.map(result => <li key={result.id}>{processName(result.processId)} <Badge>{result.label}</Badge></li>)}</ul> : <p className="muted">{TRACER_DETAIL_TEXTS.noNdt}</p>;
  const line = (item: TracerDetailWeld) => { const where = place(item.weld); return <p>Project: {where.project} | Isometric: {where.iso}</p>; };
  return <>
    <section className="inspection-section"><h3>{TRACER_DETAIL_TEXTS.original}{detail.source && <> | Weld: {weldName(detail.source.weld)}</>}</h3>
      {detail.source ? <>{line(detail.source)}<p className="field-label">{TRACER_DETAIL_TEXTS.ndtResults}</p>{results(detail.source)}</> : <p className="muted">{TRACER_DETAIL_TEXTS.noSource}</p>}</section>
    <section className="inspection-section"><h3>{TRACER_DETAIL_TEXTS.linked} <span className={`count-pill ${detail.linked < detail.expected ? 'warn' : ''}`}>{detail.linked} linked of {detail.expected} required.</span></h3>
      {detail.tracers.length ? detail.tracers.map(item => <div className="inspection-tracer" key={item.weld.id}>
        <strong>{TRACER_DETAIL_TEXTS.tracer} | Weld: {weldName(item.weld)}</strong>{line(item)}{item.clicked && <Badge>{TRACER_DETAIL_TEXTS.clicked}</Badge>}
        <p className="field-label">{TRACER_DETAIL_TEXTS.ndtResults}:</p>{results(item)}
      </div>) : <p className="muted">{TRACER_DETAIL_TEXTS.noTracers}</p>}</section>
  </>;
}

// ----- mass actions -------------------------------------------------------------------------------------------

type MassProps = { isoId?: string; weldIds?: string[]; onClose: () => void };
const scopeWelds = (rows: Rows, isoId?: string, weldIds?: string[]) => activeRows(rows, 'welds').filter(weld => (!isoId || weld.isoId === isoId) && (!weldIds?.length || weldIds.includes(weld.id))).sort((a, b) => String(a.weldNo).localeCompare(String(b.weldNo), 'en', { numeric: true }));
/** The welds ticked in the table (a dialog opened with nothing ticked sees none: the reference asks to select welds first). */
const tickedWelds = (rows: Rows, weldIds?: string[]) => activeRows(rows, 'welds').filter(weld => (weldIds || []).includes(weld.id)).sort((a, b) => String(a.weldNo).localeCompare(String(b.weldNo), 'en', { numeric: true }));
/** "RT - Execution: …": the process name and its description. */
const processText = (rows: Rows, id: unknown) => { const process = rows.ndt_processes?.find(row => row.id === id); return process ? [process.name, process.description].filter(Boolean).map(String).join(' - ') : '-'; };
const REQUEST_PDF: Record<string, string> = { NDT: 'ndt-request', 'NDT PRE': 'ndt-pre-request', 'PRE-HT': 'pwht-request', PWHT: 'pwht-request' };
/** Makes the PDF of a request (stored on it as its request document) and opens it in a new tab; a blocked tab downloads it instead. */
async function openRequestPdf(type: string, number: string, isometrics: boolean) {
  const blob = await apiBlob(`/pdf/${REQUEST_PDF[type]}?${new URLSearchParams({ requestNo: number, isometrics: isometrics ? '1' : '0' })}`, { method: 'POST' });
  const url = URL.createObjectURL(blob);
  if (!window.open(url, '_blank')) { const link = document.createElement('a'); link.href = url; link.download = `${number}-request.pdf`; document.body.appendChild(link); link.click(); link.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export interface MassRequestFormProps {
  kind: 'NDT PRE' | 'NDT' | 'PWHT'; type: string; onType: (type: string) => void; plan: MassRequestPlan; processes: { id: string; label: string }[];
  chosen: string[]; onChosen: (ids: string[]) => void; note: string; onNote: (note: string) => void; include: boolean; onInclude: (value: boolean) => void;
  error: string; busy: boolean; onClose: () => void; onSubmit: (event: FormEvent) => void;
}
/**
 * The print dialog of "Generate Mass … request" (reference pdfNdtRequestLanguageISO / pdfNdtPreRequestLanguageISO / pdfPwhtRequestLanguageISO):
 * the open processes of the ticked welds (NDT) or Pre-WHT / PWHT (radio), a note, the isometric option and Go. Go is the only way
 * a request is made: it creates the request and its PDF in one step.
 */
export function MassRequestForm({ kind, type, onType, plan, processes, chosen, onChosen, note, onNote, include, onInclude, error, busy, onClose, onSubmit }: MassRequestFormProps) {
  const ndt = kind !== 'PWHT';
  const title = kind === 'NDT PRE' ? 'NDT-Pre Request' : kind === 'NDT' ? 'NDT Request' : 'PWHT request';
  return <Modal title={title} onClose={onClose}><form onSubmit={onSubmit}><div className="modal-body"><Alert message={error}/>
    <div className="alert" role="note"><span>{MASS_REQUEST_TEXTS.alert}</span></div>
    {ndt ? (plan.error ? <p className="muted" role="status">{plan.error}</p>
        : <fieldset className="field full-width inspection-processes"><legend>{kind === 'NDT PRE' ? 'NDT-Pre Process' : 'NDT Process'}</legend>{processes.map(process => <label key={process.id}><input type="checkbox" checked={chosen.includes(process.id)} onChange={e => onChosen(e.target.checked ? [...chosen, process.id] : chosen.filter(id => id !== process.id))}/>{process.label}</label>)}</fieldset>)
      : <><fieldset className="field inspection-processes"><legend className="sr-only">Pre-HT or PWHT</legend>
          <label><input type="radio" name="mass-pwht-type" checked={type === 'PRE-HT'} onChange={() => onType('PRE-HT')}/>Pre-WHT</label>
          <label><input type="radio" name="mass-pwht-type" checked={type === 'PWHT'} onChange={() => onType('PWHT')}/>PWHT</label></fieldset>
        {plan.error && <p className="muted" role="status">{plan.error}</p>}</>}
    {ndt && <div className="field full-width"><label htmlFor="mass-note">Note</label><textarea id="mass-note" rows={3} maxLength={2000} value={note} onChange={e => onNote(e.target.value)}/></div>}
    <div className="field checkbox-field"><label htmlFor="mass-iso"><input id="mass-iso" type="checkbox" checked={include} onChange={e => onInclude(e.target.checked)}/><span>{MASS_REQUEST_TEXTS.includeIsometrics}</span></label></div>
  </div><Footer busy={busy} onClose={onClose} submit="Go" disabled={Boolean(plan.error) || (ndt && !chosen.length)}/></form></Modal>;
}

/** Generate Mass NDT-Pre / NDT / Pre-HT/PWHT request for the welds ticked in the table. Go creates the request (one number R + five digits) and its PDF. */
export function MassRequestDialog({ kind, weldIds, onClose }: MassProps & { kind: 'NDT PRE' | 'NDT' | 'PWHT' }) {
  const { rows, canRun } = useWorkspace();
  const [type, setType] = useState<string>(kind), [chosen, setChosen] = useState<string[]>([]), [note, setNote] = useState(''), [include, setInclude] = useState(false);
  const { busy, error, setError, run } = useSubmit(onClose);
  const ndt = kind !== 'PWHT';
  const plan = massRequestPlan(type, tickedWelds(rows, weldIds), rows.inspection_requests, rows.inspection_results, rows.ndt_processes);
  if (!canRun('mass-inspection-request', { type })) return <NoAccess onClose={onClose} what="creating these requests"/>;
  const processes = plan.processIds.map(id => ({ id, label: String(rows.ndt_processes?.find(row => row.id === id)?.name ?? '-') }));
  const picked = chosen.filter(id => plan.processIds.includes(id));
  function submit(event: FormEvent) {
    event.preventDefault();
    if (plan.error) { setError(plan.error); return; }
    if (ndt && !picked.length) { setError(MASS_REQUEST_TEXTS.selectProcess); return; }
    void run(async () => {
      const saved = await post<{ records: Row[] }>('/actions/mass-inspection-request', { type, weldIds: plan.open.map(line => line.weldId), processIds: ndt ? picked : [], note });
      const number = String(saved.records[0]?.number ?? ''), made = `Request ${number} created for ${saved.records.length} weld${saved.records.length === 1 ? '' : 's'}.`;
      try { await openRequestPdf(type, number, include); return made; }
      catch (failure) { return `${made} Its PDF could not be made (${(failure as ApiError).message || 'try again'}); print it from the request archive.`; }
    });
  }
  return <MassRequestForm kind={kind} type={type} onType={setType} plan={plan} processes={processes} chosen={picked} onChosen={setChosen} note={note} onNote={setNote} include={include} onInclude={setInclude} error={error} busy={busy} onClose={onClose} onSubmit={submit}/>;
}

/** Upload NDT on multiple welds: report number and result per round, and files. */
export function UploadNdtDialog({ isoId, weldIds, onClose, type: initial = 'NDT' }: MassProps & { type?: 'NDT' | 'NDT PRE' }) {
  const { rows, canRun } = useWorkspace();
  const [type, setType] = useState<'NDT' | 'NDT PRE'>(initial);
  const poolFor = (examination: string) => scopeWelds(rows, isoId, weldIds).filter(weld => weld[requestFlag(examination)] === true);
  const pool = poolFor(type);
  const [selected, setSelected] = useState<string[]>(() => weldIds?.length ? pool.map(weld => weld.id) : []);
  const [rounds, setRounds] = useState(() => NDT_ROUNDS.map(round => ({ round: round.key, reportNo: '', result: '' })));
  const [date, setDate] = useState(today()), [files, setFiles] = useState<File[]>([]);
  const { busy, error, setError, run } = useSubmit(onClose);
  if (!canRun('inspection-upload', { type })) return <NoAccess onClose={onClose} what="recording NDT results"/>;
  function submit(event: FormEvent) {
    event.preventDefault();
    const ids = selected.filter(id => pool.some(weld => weld.id === id)); if (!ids.length) { setError('Select at least one weld.'); return; }
    const filled = rounds.filter(round => round.reportNo.trim() || round.result);
    if (!filled.length) { setError('Enter a report number and a result for at least one round.'); return; }
    const half = filled.find(round => !round.reportNo.trim() || !round.result); if (half) { setError(`${roundLabel(half.round)}: enter both the report number and the result.`); return; }
    if (files.some(file => !/\.pdf$/i.test(file.name))) { setError('NDT documents must be PDF files.'); return; }
    void run(async () => {
      const saved = await post<{ records: Row[] }>('/actions/inspection-upload', { type, weldIds: ids, rounds: filled.map(round => ({ ...round, reportNo: round.reportNo.trim() })), date });
      const failed = files.length && saved.records[0] ? await uploadFiles('inspection_results', saved.records[0].id, files, NDT_DOCUMENT) : 0;
      return failed ? `Results saved; ${failed} file${failed === 1 ? '' : 's'} could not be uploaded.` : `Results saved for ${ids.length} weld${ids.length === 1 ? '' : 's'}.`;
    });
  }
  // Changing the examination keeps the ticked welds that the new examination still applies to (scn-SA-D4).
  const changeType = (value: string) => { setType(value as 'NDT' | 'NDT PRE'); setSelected(current => keepEligible(current, poolFor(value).map(weld => weld.id))); };
  return <Modal wide title="Upload NDT on multiple welds" subtitle="The same report number and result per round are written to every selected weld." onClose={onClose}><form onSubmit={submit}><div className="modal-body"><Alert message={error}/>
    <div className="form-grid"><Select id="upload-type" label="Examination" value={type} onChange={changeType} options={[{ value: 'NDT', label: 'NDT' }, { value: 'NDT PRE', label: 'NDT Pre' }]} empty={null}/><Text id="upload-date" label="NDT date" type="date" value={date} onChange={setDate} required/></div>
    <TableScroll><table className="data-table inspection-rounds"><thead><tr><th scope="col">Round</th><th scope="col">Report number</th><th scope="col">Result</th></tr></thead><tbody>{rounds.map((round, i) => <tr key={round.round}><th scope="row">{roundLabel(round.round)}</th><td><input aria-label={`Report number ${roundLabel(round.round)}`} value={round.reportNo} onChange={e => setRounds(list => list.map((item, index) => index === i ? { ...item, reportNo: e.target.value } : item))}/></td><td><select aria-label={`Result ${roundLabel(round.round)}`} value={round.result} onChange={e => setRounds(list => list.map((item, index) => index === i ? { ...item, result: e.target.value } : item))}>{NDT_RESULT_CHOICES.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></td></tr>)}</tbody></table></TableScroll>
    <WeldPicker welds={pool} value={selected} onChange={setSelected}/>
    <FilePicker id="upload-files" label="NDT documents" files={files} onChange={setFiles} pdf hint="PDF files only; attached to the report."/>
  </div><Footer busy={busy} onClose={onClose} submit="Save results" disabled={!pool.length}/></form></Modal>;
}

/** Upload Pre-HT/PWHT on multiple welds (reference uploadPWHTonMultipleWelds): Pre-HT Rp/Nr., PWHT Rp/Nr., one PDF document, PWHT 100%. */
export function UploadPwhtDialog({ isoId, weldIds, onClose }: MassProps) {
  const { rows, canRun } = useWorkspace();
  const pool = scopeWelds(rows, isoId, weldIds).filter(weld => weld.pwhtReqPre === true || weld.pwhtReq === true);
  const [selected, setSelected] = useState<string[]>(() => weldIds?.length ? pool.map(weld => weld.id) : []);
  const [preReportNo, setPre] = useState(''), [reportNo, setReport] = useState(''), [checked, setChecked] = useState(false), [files, setFiles] = useState<File[]>([]);
  const { busy, error, setError, run } = useSubmit(onClose);
  if (!canRun('pwht-upload')) return <NoAccess onClose={onClose} what="recording heat treatment reports"/>;
  function submit(event: FormEvent) {
    event.preventDefault();
    const ids = selected.filter(id => pool.some(weld => weld.id === id)); if (!ids.length) { setError('Select at least one weld.'); return; }
    if (!preReportNo.trim() && !reportNo.trim()) { setError('Enter a Pre-HT Rp/Nr., a PWHT Rp/Nr., or both.'); return; }
    const missing = pool.find(weld => ids.includes(weld.id) && (preReportNo.trim() && weld.pwhtReqPre !== true || reportNo.trim() && weld.pwhtReq !== true));
    if (missing) { setError(`Weld ${weldName(missing)} does not require ${preReportNo.trim() && missing.pwhtReqPre !== true ? 'Pre-HT' : 'PWHT'}.`); return; }
    const wrong = files.map(file => inspectionFileError(PWHT_DOCUMENT, file.name)).find(Boolean); if (wrong) { setError(wrong); return; }
    void run(async () => {
      const saved = await post<{ records: Row[] }>('/actions/pwht-upload', { weldIds: ids, preReportNo: preReportNo.trim(), reportNo: reportNo.trim(), checked });
      const failed = files.length && saved.records[0] ? await uploadFiles('inspection_results', saved.records[0].id, files, PWHT_DOCUMENT) : 0;
      return failed ? `Reports saved; ${failed} file${failed === 1 ? '' : 's'} could not be uploaded.` : `Heat treatment saved for ${ids.length} weld${ids.length === 1 ? '' : 's'}.`;
    });
  }
  return <Modal wide title="Upload Pre-HT/PWHT on multiple welds" subtitle="Records the treatment report on every selected weld that requires it." onClose={onClose}><form onSubmit={submit}><div className="modal-body"><Alert message={error}/>
    <div className="form-grid"><Text id="pwht-pre" label="Pre-HT Rp/Nr." value={preReportNo} onChange={setPre}/><Text id="pwht-report" label="PWHT Rp/Nr." value={reportNo} onChange={setReport}/>
      <div className="field checkbox-field"><label htmlFor="pwht-check"><input id="pwht-check" type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/><span>PWHT 100%</span></label></div></div>
    <WeldPicker welds={pool} value={selected} onChange={setSelected}/>
    <FilePicker id="pwht-files" label="Document (Only PDFs are allowed)" files={files} onChange={setFiles} pdf single hint="One PDF file."/>
  </div><Footer busy={busy} onClose={onClose} submit="Upload" disabled={!pool.length}/></form></Modal>;
}

// ----- visual inspection hub ---------------------------------------------------------------------------------

/** What the Wdr column of the weld pickers shows: the welders' stamp and name, "------" without a welder. */
const vtWelders = (rows: Rows, weld: Row) => weldersOf(rows, weld).map(row => [row.welderCode || row.number, row.name].filter(Boolean).join(' ')).filter(Boolean).join(', ') || '------';
const vtType = (rows: Rows, weld: Row) => String(rows.weld_types?.find(row => row.id === weld.typeId)?.name || '-');
/** One weld per row of the New and Upload tabs: WN, Type (full name of the weld type) and Wdr (stamp and name). */
function vtWeldCells(rows: Rows, weld: Row) { return <><td>{weldName(weld)}</td><td>{vtType(rows, weld)}</td><td>{vtWelders(rows, weld)}</td></>; }
type VtTab = 'new' | 'upload' | 'archive';

/** Options → Visual inspection: New (generate a numbered VT report), Upload (A / NA per weld, PDF) and the Visual reports archive. */
export function VisualInspectionHub({ isoId, weldIds, onClose }: MassProps) {
  const { rows, canRun, canRecord, label, siteId, refresh, notify } = useWorkspace();
  const reports = activeRows(rows, 'visual_reports').filter(report => !isoId || report.isoId === isoId);
  const eligible = vtEligibleWelds(rows.welds, rows.visual_reports, rows.inspection_results, isoId);
  const openReports = vtOpenReports(reports, rows.inspection_results, isoId);
  // A weld opened from its VI cell that already sits on an open report goes straight to that report.
  const uploadReports = vtUploadReports(reports, isoId);
  const cellReport = weldIds?.length === 1 ? uploadReports.find(report => vtWeldIds(report).includes(weldIds[0])) : undefined;
  const [tab, setTab] = useState<VtTab>(cellReport ? 'upload' : 'new');
  const [reportId, setReportId] = useState(cellReport?.id || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const editable = canRun('visual-inspection');
  const legacy = useMemo(() => { const numbers = new Set(reports.map(report => String(report.number))); const groups = new Map<string, Row[]>(); for (const row of (rows.inspection_results || []).filter(row => !row._archived && row.type === 'VI' && row.reportNo && !numbers.has(String(row.reportNo)) && (!isoId || rows.welds?.find(weld => weld.id === row.weldId)?.isoId === isoId))) groups.set(String(row.reportNo), [...(groups.get(String(row.reportNo)) || []), row]); return [...groups.entries()].sort((a, b) => String(b[1][0].date).localeCompare(String(a[1][0].date))); }, [rows, isoId, reports]);
  if (!canRecord('inspection_results')) return <NoAccess onClose={onClose} what="viewing visual inspections"/>;
  /** Runs one VT operation; the hub stays open so the next step can follow. */
  async function act(work: () => Promise<string>, then?: () => void) {
    setBusy(true); setError('');
    try { const message = await work(); await refresh(); notify(message); then?.(); }
    catch (failure) { setError((failure as ApiError).message || 'Saving failed.'); }
    finally { setBusy(false); }
  }
  const tabs: [VtTab, string][] = [['new', VT_TABS.new], ['upload', VT_TABS.upload], ['archive', VT_TABS.archive]];
  const readOnly = <div className="modal-body"><EmptyState title="Read only" description="Your profile does not allow recording visual inspections. The archive stays available."/></div>;
  return <Modal wide title="Visual inspection" subtitle={isoId ? `Isometric ${label('isometrics', isoId)}` : 'Visual inspection of welds'} onClose={onClose}>
    <div className="table-tabs inspection-tabs" role="tablist" aria-label="Visual inspection">{tabs.map(([key, title]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'selected' : ''} onClick={() => { setTab(key); setError(''); }}>{title}{key === 'archive' && <span className="count-pill">{reports.length + legacy.length}</span>}</button>)}</div>
    {tab === 'new' && (editable ? <VtNewTab isoId={isoId} weldIds={weldIds} eligible={eligible} openReports={openReports} siteId={siteId} busy={busy} error={error} setError={setError} act={act} onFill={id => { setReportId(id); setTab('upload'); setError(''); }} onClose={onClose}/> : readOnly)}
    {tab === 'upload' && (editable ? <VtUploadTab openReports={uploadReports} reportId={reportId} setReportId={setReportId} busy={busy} error={error} setError={setError} act={act} onClose={onClose}/> : readOnly)}
    {tab === 'archive' && <VtArchiveTab reports={reports} legacy={legacy} editable={editable} busy={busy} error={error} setError={setError} act={act} onClose={onClose}/>}
  </Modal>;
}
type VtAct = (work: () => Promise<string>, then?: () => void) => Promise<void>;
interface VtTabProps { busy: boolean; error: string; setError: (message: string) => void; act: VtAct; onClose: () => void; }

function VtNewTab({ isoId, weldIds, eligible, openReports, siteId, busy, error, setError, act, onFill, onClose }: VtTabProps & { isoId?: string; weldIds?: string[]; eligible: Row[]; openReports: Row[]; siteId: unknown; onFill: (reportId: string) => void }) {
  const { rows } = useWorkspace();
  const preselected = (weldIds || []).filter(id => eligible.some(weld => weld.id === id));
  const [filter, setFilter] = useState(preselected.length ? 'select' : 'all'), [selected, setSelected] = useState<string[]>(preselected);
  const engineers = enabledRows(rows, 'qa_engineers', siteId);
  const [itp, setItp] = useState(VT_ITPS[0]), [activityNo, setActivity] = useState(''), [engineerId, setEngineer] = useState(String(engineers[0]?.id || '')), [customNo, setCustom] = useState('');
  const [choosing, setChoosing] = useState(false);
  const chosen = filter === 'all' ? eligible.map(weld => weld.id) : selected;
  function generate(event: FormEvent) {
    event.preventDefault();
    const problem = vtGenerateError(chosen, rows.welds || [], rows.visual_reports, rows.inspection_results, String(isoId || eligible[0]?.isoId || ''));
    if (problem) { setError(problem); return; }
    void act(async () => {
      const saved = await post<{ record: Row }>('/actions/visual-inspection', { op: 'generate', mode: 'Go (PDF)', isoId: isoId || eligible[0]?.isoId, weldIds: chosen, itp, activityNo, engineerId, customNo });
      const number = String(saved.record.number);
      try {
        const blob = await apiBlob(`/pdf/visual-report?${new URLSearchParams({ reportNo: number })}`);
        const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `Visual-inspection-report-${number.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return `Report ${number} created for ${chosen.length} weld${chosen.length === 1 ? '' : 's'}; its PDF was downloaded.`;
      } catch { return `Report ${number} created for ${chosen.length} weld${chosen.length === 1 ? '' : 's'}. Open its PDF in the Visual reports archive.`; }
    }, () => { setSelected([]); setFilter('all'); });
  }
  function fill() {
    setError('');
    if (!openReports.length) { setError(VT_NO_OPEN_REPORT); return; }
    if (openReports.length === 1) { onFill(openReports[0].id); return; }
    setChoosing(true);
  }
  if (choosing) return <div className="modal-body"><p>{VT_CHOOSE_REPORT}</p><div className="logistics-actions">{openReports.map(report => <button key={report.id} type="button" className="btn small" onClick={() => { setChoosing(false); onFill(report.id); }}>{String(report.number)}</button>)}</div><div className="modal-footer"><button type="button" className="btn" onClick={() => setChoosing(false)}>Cancel</button></div></div>;
  return <form onSubmit={generate}><div className="modal-body"><Alert message={error}/>
    <div className="form-grid">
      <Select id="vi-filter" label={VT_NEW_LABELS.filter} value={filter} onChange={setFilter} options={VT_FILTERS} empty={null}/>
      <Select id="vi-itp" label={VT_NEW_LABELS.itp} value={itp} onChange={setItp} options={VT_ITPS.map(value => ({ value, label: value }))} empty={null}/>
      <Text id="vi-activity" label={VT_NEW_LABELS.activityNo} value={activityNo} onChange={setActivity}/>
      <Select id="vi-engineer" label={VT_NEW_LABELS.engineer} value={engineerId} onChange={setEngineer} options={options(engineers)} empty={engineers.length ? null : '—'}/>
      <Text id="vi-custom" label={VT_NEW_LABELS.customNo} value={customNo} onChange={setCustom}/>
    </div>
    {filter === 'select' && (eligible.length ? <TableScroll><table className="data-table" aria-label="Welds for the new report"><thead><tr>{VT_PICKER_COLUMNS.map(column => <th key={column} scope="col">{column === 'C' ? <input type="checkbox" aria-label="Select all welds" checked={eligible.every(weld => selected.includes(weld.id))} onChange={e => setSelected(e.target.checked ? eligible.map(weld => weld.id) : [])}/> : column}</th>)}</tr></thead><tbody>{eligible.map(weld => <tr key={weld.id}><td><input type="checkbox" aria-label={`Select weld ${weldName(weld)}`} checked={selected.includes(weld.id)} onChange={e => setSelected(e.target.checked ? [...selected, weld.id] : selected.filter(id => id !== weld.id))}/></td>{vtWeldCells(rows, weld)}</tr>)}</tbody></table></TableScroll> : null)}
    {!eligible.length && <EmptyState title="No welds to put on a report" description="Every weld of this isometric is already on a visual report."/>}
  </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn" onClick={fill} disabled={busy}><Pencil size={15}/>Digital fill-in</button><button className="btn primary" disabled={busy || !eligible.length}>{busy && <Loader2 size={15} className="spin"/>}Go (PDF)</button></div></form>;
}

function VtUploadTab({ openReports, reportId, setReportId, busy, error, setError, act, onClose }: VtTabProps & { openReports: Row[]; reportId: string; setReportId: (id: string) => void }) {
  const { rows } = useWorkspace();
  const report = openReports.find(item => item.id === reportId) || openReports[0];
  const saved = useMemo(() => report ? vtMarks(report, rows.inspection_results) : new Map<string, string>(), [report, rows.inspection_results]);
  const [date, setDate] = useState(today()), [files, setFiles] = useState<File[]>([]);
  const [ticks, setTicks] = useState<Record<string, string>>({});
  if (!report) return <div className="modal-body"><EmptyState title="No report to fill in" description="Generate a report on the New tab first. Reports with an uploaded PDF are in the archive."/></div>;
  const welds = vtWeldIds(report).map(id => rows.welds?.find(weld => weld.id === id)).filter((weld): weld is Row => Boolean(weld));
  const mark = (id: string) => ticks[id] ?? saved.get(id) ?? '';
  const set = (id: string, value: string) => { setTicks(current => ({ ...current, [id]: mark(id) === value ? '' : value })); setError(''); };
  const changed = (value: string) => welds.filter(weld => mark(weld.id) === value && saved.get(weld.id) !== value).map(weld => weld.id);
  const stillOpen = () => welds.filter(weld => !mark(weld.id));
  const pick = (id: string) => { setReportId(id); setTicks({}); setFiles([]); setError(''); };
  const saveMarks = () => post('/actions/visual-inspection', { op: 'marks', reportId: report.id, date, accepted: changed('Accepted'), notAccepted: changed('Rejected') });
  function save() {
    if (!welds.some(weld => mark(weld.id))) { setError(VT_TICK_ONE); return; }
    if (!changed('Accepted').length && !changed('Rejected').length) { setError(''); return; }
    void act(async () => { await saveMarks(); const open = welds.filter(weld => !mark(weld.id)); return open.length ? `Results saved. Still open: ${open.map(weldName).join(', ')}` : 'Results saved.'; }, () => setTicks({}));
  }
  function upload() {
    const open = stillOpen(); if (open.length) { setError(vtMissingMessage(open.map(weldName))); return; }
    if (!files.length) { setError('Choose at least one PDF file to upload.'); return; }
    if (files.some(file => !/\.pdf$/i.test(file.name))) { setError('VI documents must be PDF files.'); return; }
    void act(async () => {
      if (changed('Accepted').length || changed('Rejected').length) await saveMarks();
      const failed = await uploadFiles('visual_reports', report.id, files, VT_DOCUMENT);
      if (failed) throw new ApiError(`${failed} file${failed === 1 ? '' : 's'} could not be uploaded. Try again.`, 422);
      await post('/actions/visual-inspection', { op: 'upload', reportId: report.id });
      return `Report ${report.number} uploaded.`;
    }, () => { setTicks({}); setFiles([]); });
  }
  return <form onSubmit={event => { event.preventDefault(); upload(); }}><div className="modal-body"><Alert message={error}/>
    <div className="form-grid">
      <Select id="vt-report" label="Select report" value={report.id} onChange={pick} options={openReports.map(item => ({ value: String(item.id), label: String(item.number) }))} empty={null}/>
      <Text id="vt-date" label="Inspection date" type="date" value={date} onChange={setDate}/>
    </div>
    <TableScroll><table className="data-table" aria-label={`Welds of report ${report.number}`}><thead><tr>{VT_UPLOAD_COLUMNS.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{welds.map(weld => <tr key={weld.id}>
      <td><input type="checkbox" aria-label={`A (accepted): weld ${weldName(weld)}`} checked={mark(weld.id) === 'Accepted'} onChange={() => set(weld.id, 'Accepted')}/></td>
      <td><input type="checkbox" aria-label={`NA (not accepted): weld ${weldName(weld)}`} checked={mark(weld.id) === 'Rejected'} onChange={() => set(weld.id, 'Rejected')}/></td>{vtWeldCells(rows, weld)}</tr>)}</tbody></table></TableScroll>
    <small className="field-hint">{VT_UPLOAD_HELP}</small>
    <FilePicker id="vt-files" label="VI document(s) (Hold CTRL for multiple files upload) Only PDFs are allowed" files={files} onChange={setFiles} pdf/>
  </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn" onClick={save} disabled={busy}>Save A/NA</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Upload</button></div></form>;
}

function VtArchiveTab({ reports, legacy, editable, busy, error, setError, act, onClose }: VtTabProps & { reports: Row[]; legacy: [string, Row[]][]; editable: boolean }) {
  const { rows, label } = useWorkspace();
  const [marked, setMarked] = useState<string[]>([]), [confirming, setConfirming] = useState(false);
  const generated = [...reports].sort((a, b) => vtSeq(b) - vtSeq(a));
  const uploaded = generated.filter(report => report.uploaded === true);
  const filesOf = (entityType: string, ids: string[]) => (rows.attachments || []).filter(file => !file._archived && file.entityType === entityType && ids.includes(String(file.entityId)));
  function remove() {
    if (!marked.length) { setError(VT_NOTHING_TO_DELETE); setConfirming(false); return; }
    void act(async () => { await post('/actions/visual-inspection', { op: 'delete', reportIds: marked }); return `${marked.length} VT report${marked.length === 1 ? '' : 's'} deleted.`; }, () => { setMarked([]); setConfirming(false); });
  }
  if (!generated.length && !legacy.length) return <><div className="modal-body"><EmptyState title="No visual reports yet" description="Reports generated on the New tab are listed here."/></div><Footer busy={false} onClose={onClose}/></>;
  return <form onSubmit={event => { event.preventDefault(); if (!marked.length) { setError(VT_NOTHING_TO_DELETE); return; } setError(''); setConfirming(true); }}><div className="modal-body"><Alert message={error}/>
    <h4>Generated reports</h4>
    {generated.length ? <TableScroll><table className="data-table" aria-label="Generated reports"><tbody>{generated.map(report => <tr key={report.id}>
      {editable && <td><input type="checkbox" aria-label={`Delete ${report.number}`} checked={marked.includes(report.id)} onChange={e => setMarked(e.target.checked ? [...marked, report.id] : marked.filter(id => id !== report.id))}/></td>}
      <td><VisualReportPdfButton reportNo={String(report.number)} label={String(report.number)}/></td></tr>)}</tbody></table></TableScroll> : <p className="muted">No generated reports.</p>}
    <h4>Uploaded reports</h4>
    {uploaded.length || legacy.length ? <TableScroll><table className="data-table" aria-label="Uploaded reports"><thead><tr><th scope="col">Report</th><th scope="col">Inspection date</th><th scope="col">Welds</th><th scope="col">Files</th></tr></thead><tbody>
      {uploaded.map(report => <tr key={report.id}><td><VisualReportPdfButton reportNo={String(report.number)} label={String(report.number)}/></td><td>{formatDate(vtResultRows(report, rows.inspection_results)[0]?.date || report.date)}</td><td>{vtWeldIds(report).map(id => label('welds', id)).join(', ')}</td><td><FileLinks files={filesOf('visual_reports', [report.id])}/></td></tr>)}
      {legacy.map(([number, list]) => <tr key={number}><td><VisualReportPdfButton reportNo={number} label={number}/></td><td>{formatDate(list[0].date)}</td><td>{list.map(row => `${label('welds', row.weldId)}${row.result === 'Not applicable' ? ' (n/a)' : row.result === 'Rejected' ? ' (NA)' : ''}`).join(', ')}</td><td><FileLinks files={filesOf('inspection_results', list.map(row => row.id))}/></td></tr>)}
    </tbody></table></TableScroll> : <p className="muted">No uploaded reports.</p>}
    {editable && generated.length > 0 && <p className="muted">Check for delete</p>}
    {confirming && <div className="alert" role="alertdialog" aria-label="Delete reports"><span>{VT_DELETE_CONFIRM}</span><div className="logistics-actions"><button type="button" className="btn small danger" onClick={remove} disabled={busy}>Delete</button><button type="button" className="btn small" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button></div></div>}
  </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>{editable && generated.length > 0 && !confirming && <button className="btn primary" disabled={busy}>Delete</button>}</div></form>;
}

// ----- the cell's dialog and the isometric Options menu -------------------------------------------------------

/** The dialog a weld-table cell opens. */
export function InspectionDialog({ weld, kind, tracer = false, onClose }: { weld: Row; kind: InspectionKind; tracer?: boolean; onClose: () => void }) {
  if (tracer) return <TracerDialog weld={weld} onClose={onClose}/>;
  if (kind === 'NDT' || kind === 'NDT PRE') return <NdtWeldDialog weld={weld} type={kind} onClose={onClose}/>;
  if (kind === 'VI') return <VisualInspectionHub isoId={String(weld.isoId)} weldIds={[weld.id]} onClose={onClose}/>;
  return <PwhtWeldDialog weld={weld} onClose={onClose}/>;
}

export interface InspectionMenuProps { isoId: string; weldIds: string[]; onClose: () => void; }
export interface InspectionMenuItem {
  key: string; label: string;
  /** The action the item runs, with the type its permission depends on. */
  action: string; type?: string;
  Dialog: ComponentType<InspectionMenuProps>;
}
/**
 * Entries for the isometric's Options menu (weld table). Show an item when `canRun(item.action, { type: item.type })`
 * (from `useWorkspace()`) and the profile has the `inspections` feature; render `<item.Dialog isoId weldIds onClose/>`.
 */
export const inspectionMenuItems: InspectionMenuItem[] = [
  { key: 'visual-inspection', label: 'Visual inspection', action: 'visual-inspection', Dialog: props => <VisualInspectionHub {...props}/> },
  { key: 'mass-ndt-pre', label: 'Generate Mass NDT-Pre request', action: 'mass-inspection-request', type: 'NDT PRE', Dialog: props => <MassRequestDialog kind="NDT PRE" {...props}/> },
  { key: 'mass-ndt', label: 'Generate Mass NDT request', action: 'mass-inspection-request', type: 'NDT', Dialog: props => <MassRequestDialog kind="NDT" {...props}/> },
  { key: 'mass-pwht', label: 'Generate Mass Pre-HT/PWHT request', action: 'mass-inspection-request', type: 'PWHT', Dialog: props => <MassRequestDialog kind="PWHT" {...props}/> },
  { key: 'upload-ndt', label: 'Upload NDT on multiple welds', action: 'inspection-upload', type: 'NDT', Dialog: props => <UploadNdtDialog {...props}/> },
  { key: 'upload-pwht', label: 'Upload Pre-HT/PWHT on multiple welds', action: 'pwht-upload', Dialog: props => <UploadPwhtDialog {...props}/> },
];
/** The menu entries this account may run (with the visual count the reference shows next to "Visual inspection"). */
export function useInspectionMenu(isoId: string) {
  const { rows, canRun, hasFeature } = useWorkspace();
  if (!hasFeature('inspections')) return [];
  const visual = (rows.inspection_results || []).filter(row => !row._archived && row.type === 'VI' && rows.welds?.find(weld => weld.id === row.weldId)?.isoId === isoId).length;
  return inspectionMenuItems.filter(item => canRun(item.action, item.type ? { type: item.type } : {})).map(item => ({ ...item, label: item.key === 'visual-inspection' ? `${item.label} (${visual})` : item.label }));
}

// ----- NDT/PWHT Manager ---------------------------------------------------------------------------------------

/** "16.11.2026. 12:40", the way the archives show their last refresh. */
export const refreshStamp = (at: Date) => { const pad = (value: number) => String(value).padStart(2, '0'); return `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.${at.getFullYear()}. ${pad(at.getHours())}:${pad(at.getMinutes())}`; };
function downloadCsv(name: string, header: string[], lines: string[][]) {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob([[header, ...lines].map(line => line.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
const projectIdOf = (rows: Rows, weld: Row) => String(weldContext(rows, weld).project?.id ?? '');
const projectOptions = (rows: Rows) => options(activeRows(rows, 'projects'), row => String(row.internnumber || row.description || row.id));
/** Index no., charge no. and material of side 1 or 2 of a weld, as the manager tables show them. */
function weldMaterial(rows: Rows, label: (resource: string, id: unknown) => string, weld: Row, side: 1 | 2) {
  const certificate = rows.certifications?.find(row => row.id === weld[`certificate${side}Id`]), id = weld[`material${side}Id`];
  return { index: String(certificate?.indexNo || '—'), charge: String(weld[`chargeNo${side}`] || '—'), material: id ? String(rows.materials?.find(row => row.id === id)?.description || label('materials', id)) : '—' };
}
/** The Proces column: the welding process of the weld ("-" when none), never an NDT process. */
export const weldingProcessText = (weld: Row, processes: Row[] | undefined) => { const found = weld.processId ? (processes || []).find(row => row.id === weld.processId) : undefined; return found ? String(found.name) : '-'; };

/** "Show [10] entries" and the paging line under a manager table. */
function Pager({ total, page, setPage, size, setSize, sizes, unit }: { total: number; page: number; setPage: (page: number) => void; size: number; setSize: (size: number) => void; sizes: number[]; unit: string }) {
  const pages = Math.max(1, Math.ceil(total / size)), current = Math.min(page, pages - 1);
  return <div className="table-footer"><label className="inspection-page-size">Show <select aria-label="Rows per page" value={size} onChange={e => { setSize(Number(e.target.value)); setPage(0); }}>{sizes.map(item => <option key={item} value={item}>{item}</option>)}</select> entries</label>
    <span role="status">{total ? `Showing ${current * size + 1} to ${Math.min(current * size + size, total)} of ${total} ${unit}` : `Showing 0 of 0 ${unit}`}</span>
    <div><button type="button" className="btn small" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><span>{current + 1} / {pages}</span><button type="button" className="btn small" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</button></div></div>;
}

/** Welding data → NDT/PWHT Manager: the eight tabs of the reference. */
export function InspectionManager() {
  const { rows, canRecord, canRun, canArea, hasFeature } = useWorkspace();
  const [tabKey, setTab] = useState(MANAGER_TABS[0].key), [selected, setSelected] = useState<string[]>([]), [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ManagerFilter>({});
  const [dialog, setDialog] = useState<ReactNode>(null);
  // The request archives need their own area (NDT request archive 66, PWHT request archive 67).
  const tabs = MANAGER_TABS.filter(item => !item.requests || canArea(requestArchiveArea(item)));
  const tab = tabs.find(item => item.key === tabKey) ?? tabs[0];
  if (!hasFeature('inspections') || !canRecord('welds') || !canRecord('inspection_requests') || !tab) return <EmptyState title="This area is restricted" description="Your profile does not include the NDT/PWHT Manager."/>;
  const welds = activeRows(rows, 'welds');
  const match = (values: unknown[]) => !query.trim() || values.some(value => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase()));
  const close = () => { setDialog(null); setSelected([]); };
  const switchTab = (key: ManagerTab['key']) => { setTab(key); setSelected([]); setQuery(''); };
  const projectOf = (weld: Row) => projectIdOf(rows, weld);
  const count = (item: ManagerTab) => item.requests ? groupRequests(item, rows.inspection_requests).length : item.archive ? managerResults(item, 'finished', welds, rows.inspection_results, rows.inspection_requests, rows.ndt_processes).length : managerWelds(item, welds, rows.inspection_results).length;
  const weldTab = !tab.requests && !tab.archive;
  const shownWelds = weldTab ? filterManagerWelds(managerWelds(tab, welds, rows.inspection_results), filter, projectOf).filter(weld => { const context = weldContext(rows, weld); return match([context.projectName, context.isoName, weld.weldNo, welderNames(rows, weld), weldRequestNumbers(rows, weld, tab)]); }) : [];
  const selectRight = weldTab && (canRun('mass-inspection-request', { type: tab.types[0] }) || canRun(tab.kind === 'PWHT' ? 'pwht-upload' : 'inspection-upload', { type: tab.types[0] }));
  return <div className="page inspection-manager">
    <div className="page-heading"><div><div className="eyebrow">WELD PILOT · WELDING DATA</div><h1>NDT/PWHT Manager</h1><p>Welds that need NDT Pre, NDT or heat treatment, and every request and result already recorded.</p></div></div>
    <section className="panel">
      <div className="table-tabs inspection-tabs" role="tablist" aria-label="NDT/PWHT Manager">{tabs.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab.key === item.key} className={tab.key === item.key ? 'selected' : ''} onClick={() => switchTab(item.key)}>{item.label}<span className="count-pill">{count(item)}</span></button>)}</div>
      {weldTab && <div className="inspection-toolbar"><div className="field"><label htmlFor="manager-search">Search</label><input id="manager-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search"/></div>
        <ManagerActions tab={tab} selected={selected} open={setDialog} onDone={close} filtered={Boolean(filter.project || filter.welder || filter.weldType)} onFilter={() => setDialog(<ManagerFilterDialog filter={filter} onApply={next => { setFilter(next); setSelected([]); setDialog(null); }} onClose={() => setDialog(null)}/>)}/></div>}
      {tab.requests ? <RequestArchive key={tab.key} tab={tab}/> : tab.archive ? <ArchiveTab key={tab.key} tab={tab}/> : <WeldTab key={tab.key} tab={tab} welds={shownWelds} selected={selected} setSelected={setSelected} canSelect={selectRight}/>}
    </section>
    {dialog}
  </div>;
}
/** Request numbers (R00161, R00162) of the live requests of a weld on a tab. */
const weldRequestNumbers = (rows: Rows, weld: Row, tab: ManagerTab) => [...new Set(tab.types.flatMap(type => (rows.inspection_requests || []).filter(row => !row._archived && row.weldId === weld.id && row.type === type && row.status !== 'Cancelled').map(row => String(row.number || '')).filter(Boolean)))].join(', ');

/** The Filter dialog of the request managers: Project, Welder, Type. */
function ManagerFilterDialog({ filter, onApply, onClose }: { filter: ManagerFilter; onApply: (filter: ManagerFilter) => void; onClose: () => void }) {
  const { rows } = useWorkspace();
  const [draft, setDraft] = useState(filter);
  const welders = options(activeRows(rows, 'welders'), row => [`[${row.welderCode || row.number || ''}]`, row.name].filter(Boolean).join(' ')), types = options(activeRows(rows, 'weld_types'), row => `[${row.abbreviation || ''}] ${row.name}`);
  return <Modal title="Filter" onClose={onClose}><form onSubmit={event => { event.preventDefault(); onApply(draft); }}><div className="modal-body">
    <Select id="manager-filter-project" label="Project" value={draft.project || ''} onChange={project => setDraft({ ...draft, project })} options={projectOptions(rows)} empty="---Any---"/>
    <Select id="manager-filter-welder" label="Welder" value={draft.welder || ''} onChange={welder => setDraft({ ...draft, welder })} options={welders} empty="---Any---"/>
    <Select id="manager-filter-type" label="Type" value={draft.weldType || ''} onChange={weldType => setDraft({ ...draft, weldType })} options={types} empty="---Any---"/>
  </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Go</button></div></form></Modal>;
}

function ManagerActions({ tab, selected, open, onDone, onFilter, filtered }: { tab: ManagerTab; selected: string[]; open: (node: ReactNode) => void; onDone: () => void; onFilter: () => void; filtered: boolean }) {
  const { canRun } = useWorkspace();
  const type = tab.types[0] as 'NDT' | 'NDT PRE';
  const pwht = tab.kind === 'PWHT';
  const ticked = selected.length > 0;
  return <div className="inspection-actions">
    <button type="button" className="btn" onClick={onFilter}><Filter size={15}/>Filter{filtered && <span className="count-pill">on</span>}</button>
    {/* The NDT managers show Generate only once welds are ticked; the PWHT manager always shows it. */}
    {canRun('mass-inspection-request', { type: pwht ? 'PWHT' : type }) && (pwht || ticked) && <button type="button" className="btn" onClick={() => open(<MassRequestDialog kind={pwht ? 'PWHT' : type} weldIds={selected} onClose={onDone}/>)}><Printer size={15}/>{pwht ? 'Generate Mass Pre-HT/PWHT request' : tab.kind === 'NDT PRE' ? 'Generate Mass NDT request PRE' : 'Generate Mass NDT request'}</button>}
    {ticked && (pwht ? canRun('pwht-upload') && <button type="button" className="btn primary" onClick={() => open(<UploadPwhtDialog weldIds={selected} onClose={onDone}/>)}><Upload size={15}/>Upload Pre-HT/PWHT</button>
      : canRun('inspection-upload', { type }) && <button type="button" className="btn primary" onClick={() => open(<UploadNdtDialog type={type} weldIds={selected} onClose={onDone}/>)}><Upload size={15}/>Upload results</button>)}
    {ticked && <small className="field-hint">{selected.length} selected</small>}
  </div>;
}
function WeldTab({ tab, welds, selected, setSelected, canSelect }: { tab: ManagerTab; welds: Row[]; selected: string[]; setSelected: (ids: string[]) => void; canSelect: boolean }) {
  const { rows, label } = useWorkspace();
  const [page, setPage] = useState(0), [size, setSize] = useState(MANAGER_PAGE_SIZES[0]);
  if (!welds.length) return <EmptyState title="No welds waiting" description={tab.kind === 'PWHT' ? 'Welds appear here when Pre-HT or PWHT is required.' : 'Welds appear here when their requirement flag is set and no result is recorded yet.'}/>;
  const sorted = [...welds].sort((a, b) => label('isometrics', a.isoId).localeCompare(label('isometrics', b.isoId), 'en', { numeric: true }) || String(a.weldNo).localeCompare(String(b.weldNo), 'en', { numeric: true }));
  const pages = Math.max(1, Math.ceil(sorted.length / size)), current = Math.min(page, pages - 1), shown = sorted.slice(current * size, current * size + size);
  const columns = managerColumns(tab), pwht = tab.kind === 'PWHT';
  // NDT / NDT Pre: a weld is selectable only while one of its NDT processes is on no request yet; the PWHT manager selects every row.
  const selectable = (weld: Row) => canSelect && requestSelectable(weld, tab.kind, rows.inspection_requests, rows.inspection_results, rows.ndt_processes);
  const pickable = shown.filter(selectable);
  return <><TableScroll><table className="data-table inspection-table" aria-label={tab.label}><thead><tr>{columns.map((column, i) => <th scope="col" key={i}>{column}</th>)}{canSelect && <th scope="col">{pickable.length > 0 && <input type="checkbox" aria-label="Select all welds on this page" checked={pickable.every(weld => selected.includes(weld.id))} onChange={e => setSelected(e.target.checked ? [...new Set([...selected, ...pickable.map(weld => weld.id)])] : selected.filter(id => !pickable.some(weld => weld.id === id)))}/>}</th>}</tr></thead>
    <tbody>{shown.map(weld => { const context = weldContext(rows, weld), first = weldMaterial(rows, label, weld, 1), second = weldMaterial(rows, label, weld, 2); return <tr key={weld.id}>
      <td>{context.projectName}</td><td>{pwht && context.iso ? <Link className="record-link" to={`/workspace/isometrics/${context.iso.id}`}>{context.isoName}</Link> : context.isoName}</td><th scope="row">{weldName(weld)}</th><td>{String(rows.weld_types?.find(row => row.id === weld.typeId)?.abbreviation || label('weld_types', weld.typeId))}</td><td>{welderNames(rows, weld) || '—'}</td>
      <td><InspectionCell weld={weld} kind={tab.kind}/></td>{!pwht && <td>{weldRequestNumbers(rows, weld, tab) || '—'}</td>}
      <td>{first.index}</td><td>{first.charge}</td><td>{first.material}</td><td>{second.index}</td><td>{second.charge}</td><td>{second.material}</td>
      <td>{weldingProcessText(weld, rows.weld_processes)}</td><td>{weld.wpsId ? label('wps', weld.wpsId) : '—'}</td>
      {canSelect && <td>{selectable(weld) ? <input type="checkbox" aria-label={`Select weld ${weldName(weld)}`} checked={selected.includes(weld.id)} onChange={e => setSelected(e.target.checked ? [...selected, weld.id] : selected.filter(id => id !== weld.id))}/> : '-'}</td>}
    </tr>; })}</tbody></table></TableScroll>
    <Pager total={sorted.length} page={current} setPage={setPage} size={size} setSize={setSize} sizes={MANAGER_PAGE_SIZES} unit="welds"/></>;
}

// ----- archive tabs: one row per examined process -------------------------------------------------------------

/** Cells of an archive row as text, in the order of `managerColumns` (without the closing "Open" column). */
function archiveCells(rows: Rows, label: (resource: string, id: unknown) => string, tab: ManagerTab, row: ArchiveRow, view: ArchiveView): string[] {
  const weld = row as Row, context = weldContext(rows, weld), first = weldMaterial(rows, label, weld, 1), second = weldMaterial(rows, label, weld, 2);
  const diameter = rows.diameters?.find(item => item.id === weld.diameterId)?.sizeinch;
  const process = tab.kind === 'PWHT' ? (row.processId ? label('pwht_processes', row.processId) : '-') : row.processId ? `${row.roundIndex}-${processText(rows, row.processId)}` : '-';
  const documented = view === 'finished' && (rows.attachments || []).some(file => !file._archived && (file.entityType === 'inspection_results' && file.entityId === row.resultId || file.entityType === 'inspection_requests' && Boolean(row.requestId) && file.entityId === row.requestId && file.documentType !== REQUEST_DOCUMENT));
  return [context.projectName, context.isoName, weldName(weld), String(rows.weld_types?.find(item => item.id === weld.typeId)?.name || '-'), welderNames(rows, weld) || '-', diameter === undefined || diameter === null || diameter === '' ? '-' : String(diameter).replace('.', ','), formatDate(row.resultDate), process,
    view === 'finished' ? resultLabel(row.resultValue) : '---', first.index, first.charge, first.material, second.index, second.charge, second.material, weld.wpsId ? label('wps', weld.wpsId) : '-', documented ? 'Yes' : 'No', row.reportNo || '-'];
}
/** NDT archive PRE / NDT archive / PWHT archive: Finished / Open results / Open welds views, Refresh, Export and Filter. */
function ArchiveTab({ tab }: { tab: ManagerTab }) {
  const { rows, label, refresh, notify } = useWorkspace();
  const [view, setView] = useState<ArchiveView>('finished'), [filter, setFilter] = useState<ArchiveFilter>({}), [filtering, setFiltering] = useState(false), [query, setQuery] = useState('');
  const [page, setPage] = useState(0), [size, setSize] = useState(20), [refreshedAt, setRefreshedAt] = useState(() => new Date()), [busy, setBusy] = useState(false);
  const welds = activeRows(rows, 'welds');
  const list = managerResults(tab, view, welds, rows.inspection_results, rows.inspection_requests, rows.ndt_processes, { filter, projectOf: weld => projectIdOf(rows, weld) });
  const cells = list.map(row => ({ row, text: archiveCells(rows, label, tab, row, view) })).filter(item => !query.trim() || item.text.some(value => value.toLowerCase().includes(query.trim().toLowerCase())));
  const columns = managerColumns(tab);
  const pages = Math.max(1, Math.ceil(cells.length / size)), current = Math.min(page, pages - 1);
  async function reload() { setBusy(true); try { await refresh(); setRefreshedAt(new Date()); } catch { notify('The archive could not be refreshed.'); } finally { setBusy(false); } }
  const exportCsv = () => downloadCsv(`${tab.key}-${view}.csv`, columns.slice(0, -1), cells.map(item => item.text));
  const heading = archiveViewLabel(tab, view);
  return <div className="inspection-archive">
    <div className="inspection-toolbar"><div className="field"><label htmlFor="archive-search">Search</label><input id="archive-search" type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Search"/></div>
      <div className="inspection-actions"><Select id="archive-view" label="Switch view" value={view} onChange={value => { setView(value as ArchiveView); setPage(0); }} options={ARCHIVE_VIEWS.map(item => ({ value: item, label: archiveViewLabel(tab, item) }))} empty={null}/>
        <button type="button" className="btn" disabled={busy} onClick={() => void reload()}>{busy ? <Loader2 size={15} className="spin"/> : <RefreshCw size={15}/>}Refresh</button>
        <button type="button" className="btn" disabled={!cells.length} onClick={exportCsv}><Download size={15}/>Export</button>
        <button type="button" className="btn" onClick={() => setFiltering(true)}><Filter size={15}/>Filter{(filter.project || filter.processId || filter.result) && <span className="count-pill">on</span>}</button></div></div>
    <h2 className="inspection-archive-heading">{heading} <small className="muted">Last refresh: {refreshStamp(refreshedAt)}</small></h2>
    {cells.length ? <><TableScroll><table className="data-table inspection-table" aria-label={`${tab.label}: ${heading}`}><thead><tr>{columns.map((column, i) => <th scope="col" key={i}>{column || <span className="sr-only">Isometric</span>}</th>)}</tr></thead>
      <tbody>{cells.slice(current * size, current * size + size).map(({ row, text }) => <tr key={row.id}>{text.map((value, i) => i === 2 ? <th scope="row" key={i}>{value}</th> : <td key={i}>{value}</td>)}<td>{row.isoId ? <Link className="record-link" to={`/workspace/isometrics/${row.isoId}`} target="_blank">Open</Link> : '-'}</td></tr>)}</tbody></table></TableScroll>
      <Pager total={cells.length} page={current} setPage={setPage} size={size} setSize={setSize} sizes={ARCHIVE_PAGE_SIZES} unit="entries"/></>
      : <EmptyState title={view === 'finished' ? 'Nothing finished yet' : view === 'open-results' ? 'No open results' : 'No open welds'} description={view === 'finished' ? 'A process moves here once its result is recorded.' : view === 'open-results' ? 'Processes of a request that still wait for their result are listed here.' : 'Welds with a process that is on no request yet are listed here.'}/>}
    {filtering && <ArchiveFilterDialog tab={tab} filter={filter} onApply={next => { setFilter(next); setPage(0); setFiltering(false); }} onClose={() => setFiltering(false)}/>}
  </div>;
}
/** "Filter welds by project": Project, NDT process and Result. */
function ArchiveFilterDialog({ tab, filter, onApply, onClose }: { tab: ManagerTab; filter: ArchiveFilter; onApply: (filter: ArchiveFilter) => void; onClose: () => void }) {
  const { rows } = useWorkspace();
  const [draft, setDraft] = useState(filter);
  return <Modal title="Filter welds by project" onClose={onClose}><form onSubmit={event => { event.preventDefault(); onApply(draft); }}><div className="modal-body">
    <Select id="archive-filter-project" label="Project" value={draft.project || ''} onChange={project => setDraft({ ...draft, project })} options={projectOptions(rows)} empty="All"/>
    {tab.kind !== 'PWHT' && <Select id="archive-filter-process" label="NDT process" value={draft.processId || ''} onChange={processId => setDraft({ ...draft, processId })} options={activeRows(rows, 'ndt_processes').map(row => ({ value: row.id, label: processText(rows, row.id) }))} empty="All"/>}
    <Select id="archive-filter-result" label="Result" value={draft.result || ''} onChange={result => setDraft({ ...draft, result })} options={[{ value: 'Accepted', label: 'Accepted' }, { value: 'Rejected', label: 'NA' }]} empty="All"/>
  </div><div className="modal-footer"><button className="btn primary">Filter</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div></form></Modal>;
}

// ----- request archives: one row per request -------------------------------------------------------------------

/** NDT request archive / PWHT request archive: Date, Request number, Welds, Options (print, Undo); filters Project, NDT, From Date, To Date. */
function RequestArchive({ tab }: { tab: ManagerTab }) {
  const { rows, canRun } = useWorkspace();
  const month = monthRange(today());
  const [draft, setDraft] = useState<RequestFilter>({ from: month.from, to: month.to }), [applied, setApplied] = useState<RequestFilter>(draft);
  const [page, setPage] = useState(0), [size, setSize] = useState(10), [detail, setDetail] = useState('');
  const pwht = tab.kind === 'PWHT';
  const projectOf = (weldId: string) => { const weld = rows.welds?.find(item => item.id === weldId); return weld ? projectIdOf(rows, weld) : ''; };
  const groups = groupRequests(tab, rows.inspection_requests, applied, projectOf);
  const chosen = groups.find(group => group.key === detail);
  if (chosen) return <RequestDetail tab={tab} group={chosen} onBack={() => setDetail('')}/>;
  const pages = Math.max(1, Math.ceil(groups.length / size)), current = Math.min(page, pages - 1);
  const undo = !pwht && canRun('inspection-request-undo', { type: applied.pre ? 'NDT PRE' : 'NDT' });
  return <div className="inspection-archive">
    <form className="inspection-toolbar inspection-request-filter" onSubmit={event => { event.preventDefault(); setApplied(draft); setPage(0); }}>
      <Select id="request-project" label="Project" value={draft.project || ''} onChange={project => setDraft({ ...draft, project })} options={projectOptions(rows)} empty="All projects"/>
      {!pwht && <Select id="request-pre" label="NDT" value={draft.pre ? 'pre' : ''} onChange={value => setDraft({ ...draft, pre: value === 'pre' })} options={[{ value: '', label: 'NDT' }, { value: 'pre', label: 'NDT Pre' }]} empty={null}/>}
      <Text id="request-from" label="From Date" type="date" value={draft.from || ''} onChange={from => setDraft({ ...draft, from })}/>
      <Text id="request-to" label="To Date" type="date" value={draft.to || ''} onChange={to => setDraft({ ...draft, to })}/>
      <button className="btn"><Search size={15}/>Filter</button></form>
    {groups.length ? <><TableScroll><table className="data-table inspection-table" aria-label={tab.label}><thead><tr>{managerColumns(tab).map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
      <tbody>{groups.slice(current * size, current * size + size).map(group => <tr key={group.key}><td>{formatDate(group.date)}</td><th scope="row"><button type="button" className="text-link" onClick={() => setDetail(group.key)} aria-label={`Open request ${group.shown}`}>{group.shown}</button></th><td>{group.welds}</td>
        <td className="inspection-options"><RequestPdfButton request={group.lines[0]}/>{undo && <button type="button" className="btn small" onClick={() => setDetail(group.key)}>Undo</button>}</td></tr>)}</tbody></table></TableScroll>
      <Pager total={groups.length} page={current} setPage={setPage} size={size} setSize={setSize} sizes={MANAGER_PAGE_SIZES} unit="requests"/></>
      : <EmptyState title="No requests found" description="Requests generated from the Manager or from an isometric are archived here. Widen the date range or the project to see more."/>}
  </div>;
}
type UndoPick = { weldId: string; processId: string };
/** One request: its welds and processes (ISO, Weld no., NDT). The NDT archive restarts ticked processes or undoes a single one. */
function RequestDetail({ tab, group, onBack }: { tab: ManagerTab; group: RequestGroup; onBack: () => void }) {
  const { rows, label, canRun, refresh, notify } = useWorkspace();
  const [picked, setPicked] = useState<UndoPick[]>([]), [confirm, setConfirm] = useState<{ text: string[]; run: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lines = requestDetail(group.lines, rows.inspection_results, rows.ndt_processes);
  const pwht = tab.kind === 'PWHT', canUndo = !pwht && canRun('inspection-request-undo', { type: group.type });
  const isPicked = (line: RequestDetailLine) => picked.some(item => item.weldId === line.weldId && item.processId === line.processId);
  const toggle = (line: RequestDetailLine, on: boolean) => setPicked(on ? [...picked, { weldId: line.weldId, processId: line.processId }] : picked.filter(item => !(item.weldId === line.weldId && item.processId === line.processId)));
  /** One undo call per weld; the processes of a weld that go together. */
  async function undo(items: UndoPick[]) {
    setBusy(true); setError('');
    try {
      for (const weldId of new Set(items.map(item => item.weldId))) await post('/actions/inspection-request-undo', { type: group.type, requestNo: group.number, weldId, processIds: items.filter(item => item.weldId === weldId).map(item => item.processId).filter(Boolean) });
      await refresh(); notify(items.length === 1 ? 'The process was taken off the request.' : 'The selected processes were taken off the request.'); setPicked([]); setConfirm(null);
    } catch (failure) { setError((failure as ApiError).message || 'Undo failed'); setConfirm(null); } finally { setBusy(false); }
  }
  const ask = (items: UndoPick[], text: string[]) => { setError(''); setConfirm({ text, run: () => undo(items) }); };
  const restart = () => {
    if (!picked.length) { setError('Select at least one process'); return; }
    const withResult = lines.some(line => isPicked(line) && line.hasResult);
    ask(picked, ['You are about to restart the selected NDT process.', ...(withResult ? ['The NDT result for the selected process will be removed.'] : []), 'Are you sure?']);
  };
  return <div className="inspection-archive">
    <div className="inspection-toolbar"><h2 className="inspection-archive-heading">{tab.label}: request {group.shown}</h2><button type="button" className="btn" onClick={onBack}><ArrowLeft size={15}/>Back to the request archive</button></div>
    {error && <Alert message={error}/>}
    <TableScroll><table className="data-table inspection-table" aria-label={`Request ${group.shown}`}><thead><tr><th scope="col">ISO</th><th scope="col">Weld no.</th><th scope="col">{pwht ? 'PWHT' : 'NDT'}</th>{canUndo && <th scope="col"><span className="sr-only">Select</span></th>}{canUndo && <th scope="col"><span className="sr-only">Undo</span></th>}</tr></thead>
      <tbody>{lines.map(line => { const weld = rows.welds?.find(item => item.id === line.weldId), context = weld ? weldContext(rows, weld) : undefined; return <tr key={`${line.request.id}:${line.processId}`}>
        <td>{context?.isoName || '—'}</td><td>{weldName(weld)}</td><td>{pwht ? (group.type === 'PRE-HT' ? 'Pre-HT' : 'PWHT') : line.processId ? processText(rows, line.processId) : '-'}</td>
        {canUndo && <td><input type="checkbox" aria-label={`Select ${weldName(weld)} ${line.processId ? label('ndt_processes', line.processId) : ''}`} checked={isPicked(line)} onChange={e => toggle(line, e.target.checked)}/></td>}
        {canUndo && <td><button type="button" className="btn small" disabled={busy} onClick={() => ask([{ weldId: line.weldId, processId: line.processId }], [line.last ? 'Undo this process and remove this weld from the request?' : 'Undo this process on this request?'])}>Undo</button></td>}
      </tr>; })}</tbody></table></TableScroll>
    {canUndo && picked.length > 0 && <div className="logistics-actions"><button type="button" className="btn" disabled={busy} onClick={restart}>Restart NDT process</button></div>}
    {confirm && <div className="alert" role="alertdialog" aria-label="Confirm undo">{confirm.text.map(line => <span key={line}>{line}</span>)}<div className="logistics-actions"><button type="button" className="btn small danger" disabled={busy} onClick={() => void confirm.run()}>{busy && <Loader2 size={14} className="spin"/>}Yes</button><button type="button" className="btn small" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div></div>}
  </div>;
}

/**
 * "Restart NDT process" of a weld's NDT / NDT Pre dialog (reference): lists the weld's processes that are on a request with
 * their result; the ticked ones leave their request and their results are removed, the weld's other processes stay.
 */
export function NdtRestartBox({ weld, type, onDone }: { weld: Row; type: 'NDT' | 'NDT PRE'; onDone?: () => void }) {
  const { rows, label, canRun, refresh, notify } = useWorkspace();
  const [open, setOpen] = useState(false), [ticked, setTicked] = useState<string[]>([]), [asking, setAsking] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!canRun('ndt-restart', { type })) return null;
  const lines = requestDetail((rows.inspection_requests || []).filter(row => !row._archived && row.weldId === weld.id && row.type === type && row.status !== 'Cancelled'), rows.inspection_results, rows.ndt_processes).filter(line => line.processId);
  if (!lines.length) return null;
  const result = (line: RequestDetailLine) => (rows.inspection_results || []).filter(row => !row._archived && row.requestId === line.request.id && row.processId === line.processId && row.result).map(row => row.result)[0];
  const withResult = lines.some(line => ticked.includes(line.processId) && result(line));
  async function restart() {
    setBusy(true); setError('');
    try { await post('/actions/ndt-restart', { weldId: weld.id, type, processIds: ticked }); await refresh(); notify('The selected NDT process was restarted.'); setOpen(false); setAsking(false); setTicked([]); onDone?.(); }
    catch (failure) { setError((failure as ApiError).message || 'Restart failed'); setAsking(false); } finally { setBusy(false); }
  }
  return <section className="inspection-section"><button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>Restart NDT process</button>
    {open && <div><Alert message={error}/>{lines.map(line => <label key={`${line.request.id}:${line.processId}`} className="inspection-restart-line"><input type="checkbox" checked={ticked.includes(line.processId)} onChange={e => setTicked(e.target.checked ? [...ticked, line.processId] : ticked.filter(id => id !== line.processId))}/><span>{processText(rows, line.processId)}</span>{result(line) && <Badge>{resultLabel(result(line))}</Badge>}</label>)}
      <button type="button" className="btn" disabled={busy || !ticked.length} onClick={() => setAsking(true)}>Restart</button>
      {asking && <div className="alert" role="alertdialog" aria-label="Confirm restart"><span>You are about to restart the selected NDT process.</span>{withResult && <span>The NDT result for the selected process will be removed.</span>}<span>Are you sure?</span><div className="logistics-actions"><button type="button" className="btn small danger" disabled={busy} onClick={() => void restart()}>{busy && <Loader2 size={14} className="spin"/>}Yes</button><button type="button" className="btn small" disabled={busy} onClick={() => setAsking(false)}>Cancel</button></div></div>}</div>}
  </section>;
}
