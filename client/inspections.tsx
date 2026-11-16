import { useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ClipboardCheck, FileText, Loader2, Printer, Upload } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import {
  KIND_LABELS, MANAGER_TABS, NDT_RESULT_CHOICES, NDT_ROUNDS, NDT_DOCUMENT, REQUEST_PREFIX, TRACERS_REQUIRED, currentRequest, inspectionCellState, isTracer,
  locationField, managerColumns, managerRequests, managerWelds, processField, requestNumberError, resultLabel, roundErrors, roundLabel, tracerError, tracerSummary,
  weldResults, type InspectionKind, type ManagerTab, type RoundInput,
} from '../shared/inspections.ts';
import { api, post, ApiError, apiUrl, formatDate } from './api.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { selectableDefectCodes } from '../shared/weld-catalogs.ts';
import { Badge, EmptyState, Modal, TableScroll } from './components.tsx';
import './inspections.css';

// ----- shared pieces ------------------------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);
type Rows = Record<string, Row[]>;
const weldName = (weld: Row | undefined) => weld ? String(weld.weldNo || weld.id) : '—';
function weldContext(rows: Rows, weld: Row) {
  const iso = rows.isometrics?.find(row => row.id === weld.isoId);
  const project = rows.projects?.find(row => row.id === iso?.projectId);
  return { iso, project, projectName: String(project?.internnumber || project?.description || '—'), isoName: String(iso?.isoNo || '—') };
}
const welderNames = (rows: Rows, weld: Row) => [1, 2, 3, 4].map(side => rows.welders?.find(row => row.id === weld[`welder${side}Id`])).filter(Boolean).map(row => String(row!.number || row!.name)).join(', ');

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
function FilePicker({ id, label, files, onChange, pdf = false, hint }: { id: string; label: string; files: File[]; onChange: (files: File[]) => void; pdf?: boolean; hint?: string }) {
  return <div className="field full-width"><label htmlFor={id}>{label}</label><input id={id} type="file" multiple accept={pdf ? '.pdf,application/pdf' : '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt'} onChange={e => onChange(Array.from(e.target.files || []))}/><small className="field-hint">{hint || (pdf ? 'PDF files only. Several files can be chosen.' : 'Several files can be chosen.')}{files.length ? ` ${files.length} selected.` : ''}</small></div>;
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

type RoundDraft = Required<Pick<RoundInput, 'round'>> & { processId: string; filmNo: string; reportNo: string; date: string; result: string; naLength: string; defectType: string; reweld: boolean };
/** "NDT <project> / <iso> / <weld>": NDT location, request number and the five rounds of one weld (NDT or NDT Pre). */
export function NdtWeldDialog({ weld, type, onClose }: { weld: Row; type: 'NDT' | 'NDT PRE'; onClose: () => void }) {
  const { rows, allRows, canRun, canRecord } = useWorkspace();
  const pre = type === 'NDT PRE', context = weldContext(rows, weld);
  const editable = canRun('ndt-weld', { type });
  const request = currentRequest(rows.inspection_requests, weld.id, type);
  const results = (rows.inspection_results || []).filter(row => !row._archived && row.requestId === request?.id && row.type === type);
  const [location, setLocation] = useState(String(weld[locationField(pre)] || request?.locationId || ''));
  const [requestNo, setRequestNo] = useState(String(request?.number || ''));
  const [rounds, setRounds] = useState<RoundDraft[]>(() => NDT_ROUNDS.map(round => { const row = results.find(item => item.round === round.key); return { round: round.key, processId: String(weld[processField(pre, round.index)] || row?.processId || ''), filmNo: String(row?.filmNo || ''), reportNo: String(row?.reportNo || ''), date: String(row?.date || ''), result: String(row?.result || ''), naLength: row?.naLength === null || row?.naLength === undefined ? '' : String(row.naLength), defectType: String(row?.defectType || ''), reweld: row?.reweld === true }; }));
  const [files, setFiles] = useState<File[]>([]);
  const { busy, error, setError, run } = useSubmit(onClose);
  const set = (index: number, patch: Partial<RoundDraft>) => setRounds(current => current.map((round, i) => i === index ? { ...round, ...patch } : round));
  const documents = (rows.attachments || []).filter(file => !file._archived && file.entityType === 'inspection_requests' && file.entityId === request?.id);
  // Defect codes enabled on the weld's main project and matching its defect norm (weld catalogs); a stored value is kept.
  const site = rows.sites?.find(row => row.id === context.project?.siteId) ?? allRows.sites?.find(row => row.id === context.project?.siteId);
  const defects = selectableDefectCodes(rows, site, String(context.project?.siteId || '')).map(code => ({ value: String(code.code), label: [code.code, code.english].filter(Boolean).join(' — ') }));
  if (rounds[0].defectType && !defects.some(option => option.value === rounds[0].defectType)) defects.unshift({ value: rounds[0].defectType, label: rounds[0].defectType });
  if (!canRecord('inspection_results')) return <NoAccess onClose={onClose} what="viewing NDT results"/>;
  function submit(event: FormEvent) {
    event.preventDefault();
    const numberError = requestNumberError(requestNo); if (numberError) { setError(numberError); return; }
    for (const round of rounds) { const errors = roundErrors({ ...round, naLength: round.naLength === '' ? null : Number(round.naLength) }); const first = Object.values(errors)[0]; if (first) { setError(`${roundLabel(round.round)}: ${first}`); return; } }
    if (files.some(file => !/\.pdf$/i.test(file.name))) { setError('NDT documents must be PDF files.'); return; }
    void run(async () => {
      await post('/actions/ndt-weld', { weldId: weld.id, type, locationId: location, requestNo: requestNo.trim(), rounds: rounds.map(round => ({ ...round, naLength: round.naLength === '' ? null : Number(round.naLength), reweld: round.round === 'Remaining' ? round.reweld : false })) });
      let failed = 0;
      if (files.length) {
        const next = await api<{ rows: Row[] }>('/records/inspection_requests');
        const saved = currentRequest(next.rows, weld.id, type);
        if (saved) failed = await uploadFiles('inspection_requests', saved.id, files, NDT_DOCUMENT); else failed = files.length;
      }
      return failed ? `${type === 'NDT PRE' ? 'NDT Pre' : 'NDT'} saved; ${failed} document${failed === 1 ? '' : 's'} could not be uploaded.` : `${type === 'NDT PRE' ? 'NDT Pre' : 'NDT'} of weld ${weldName(weld)} saved.`;
    });
  }
  const processOptions = options(rows.ndt_processes);
  return <Modal wide title={`${pre ? 'NDT Pre' : 'NDT'} ${context.projectName} / ${context.isoName} / ${weldName(weld)}`} subtitle={editable ? 'Create or update the request and its results. A result of NA creates the repair weld.' : 'Read only: your profile cannot change these results.'} onClose={onClose}>
    <form onSubmit={submit}><div className="modal-body"><Alert message={error}/>
      <div className="form-grid">
        <div className="field"><span className="field-label">Welder</span><p className="inspection-readonly">{welderNames(rows, weld) || '—'}</p></div>
        <Select id="ndt-location" label="NDT location" value={location} onChange={setLocation} options={options(rows.ndt_locations)} disabled={!editable} empty="Select NDT location"/>
        <Text id="ndt-request" label="Request number" value={requestNo} onChange={setRequestNo} disabled={!editable} placeholder={`${REQUEST_PREFIX}-… (generated when empty)`}/>
      </div>
      <TableScroll><table className="data-table inspection-rounds"><caption className="sr-only">Examination rounds</caption><thead><tr><th scope="col">Round</th>{NDT_ROUNDS.map((round, i) => <th scope="col" key={round.key}>{round.label}{rounds[i].processId && <span className="inspection-tick" aria-label="process set"> ✔</span>}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">NDT process</th>{rounds.map((round, i) => <td key={round.round}><select aria-label={`NDT process ${roundLabel(round.round)}`} value={round.processId} disabled={!editable} onChange={e => set(i, { processId: e.target.value })}><option value="">—</option>{processOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td>)}</tr>
          <tr><th scope="row">Film Nr.</th>{rounds.map((round, i) => <td key={round.round}><input aria-label={`Film Nr. ${roundLabel(round.round)}`} value={round.filmNo} disabled={!editable} onChange={e => set(i, { filmNo: e.target.value })}/></td>)}</tr>
          <tr><th scope="row">NDT Rp/Nr.</th>{rounds.map((round, i) => <td key={round.round}><input aria-label={`NDT Rp/Nr. ${roundLabel(round.round)}`} value={round.reportNo} disabled={!editable} onChange={e => set(i, { reportNo: e.target.value })}/></td>)}</tr>
          <tr><th scope="row">NDT date</th>{rounds.map((round, i) => <td key={round.round}><input type="date" aria-label={`NDT date ${roundLabel(round.round)}`} value={round.date} disabled={!editable} onChange={e => set(i, { date: e.target.value })}/></td>)}</tr>
          <tr><th scope="row">NDT res.</th>{rounds.map((round, i) => <td key={round.round}><select aria-label={`NDT result ${roundLabel(round.round)}`} value={round.result} disabled={!editable} onChange={e => set(i, { result: e.target.value, ...(e.target.value !== 'Rejected' ? { naLength: '', defectType: '' } : {}), ...(e.target.value && !round.date ? { date: today() } : {}) })}>{NDT_RESULT_CHOICES.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></td>)}</tr>
          <tr><th scope="row">NA length (mm)</th><td><input type="number" min="0" step="any" aria-label="NA length (mm), Initial" value={rounds[0].naLength} disabled={!editable || rounds[0].result !== 'Rejected'} onChange={e => set(0, { naLength: e.target.value })}/></td><td colSpan={4} className="muted">Initial round only</td></tr>
          <tr><th scope="row">Defect type</th><td><select aria-label="Defect type, Initial" value={rounds[0].defectType} disabled={!editable || rounds[0].result !== 'Rejected'} onChange={e => set(0, { defectType: e.target.value })}><option value="">—</option>{defects.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td><td colSpan={4} className="muted">Initial round only</td></tr>
          <tr><th scope="row">ReWeld?</th><td className="muted">—</td><td><input type="checkbox" aria-label="ReWeld?, Remaining" checked={rounds[1].reweld} disabled={!editable} onChange={e => set(1, { reweld: e.target.checked })}/></td><td colSpan={3} className="muted">Remaining round only</td></tr>
        </tbody></table></TableScroll>
      <section className="inspection-section"><h3>NDT documents</h3><FileLinks files={documents}/>{editable && canRecord('inspection_requests', 'import') && <FilePicker id="ndt-documents" label="Add NDT documents" files={files} onChange={setFiles} pdf/>}</section>
    </div><Footer busy={busy} onClose={onClose} submit={editable ? 'Save' : undefined}/></form>
  </Modal>;
}

// ----- Pre-HT / PWHT per weld --------------------------------------------------------------------------------

export function PwhtWeldDialog({ weld, onClose }: { weld: Row; onClose: () => void }) {
  const { rows, canRecord } = useWorkspace(); const context = weldContext(rows, weld);
  const [upload, setUpload] = useState(false);
  if (!canRecord('inspection_results')) return <NoAccess onClose={onClose} what="viewing heat treatment records"/>;
  const results = weldResults(rows.inspection_results, weld.id, ['PRE-HT', 'PWHT']);
  const state = inspectionCellState(weld, 'PWHT', rows);
  if (upload) return <UploadPwhtDialog weldIds={[weld.id]} onClose={onClose}/>;
  return <Modal title={`Pre-HT/PWHT ${context.projectName} / ${context.isoName} / ${weldName(weld)}`} subtitle="Heat treatment requirements and recorded reports." onClose={onClose}><div className="modal-body">
    <dl className="inspection-facts"><div><dt>Pre-HT</dt><dd>{weld.pwhtReqPre ? 'Required' : 'Not required'}</dd></div><div><dt>PWHT</dt><dd>{weld.pwhtReq ? 'Required' : 'Not required'}</dd></div></dl>
    {results.length ? <TableScroll><table className="data-table"><thead><tr><th scope="col">Type</th><th scope="col">Report number</th><th scope="col">Pre report number</th><th scope="col">Check</th><th scope="col">Date</th></tr></thead><tbody>{results.map(row => <tr key={row.id}><td>{row.type === 'PRE-HT' ? 'Pre-HT' : 'PWHT'}</td><td>{String(row.reportNo || '—')}</td><td>{String(row.preReportNo || '—')}</td><td>{row.checked ? 'Yes' : 'No'}</td><td>{formatDate(row.date)}</td></tr>)}</tbody></table></TableScroll> : <EmptyState title="No heat treatment recorded" description="Upload the Pre-HT or PWHT report once the treatment is done."/>}
    <section className="inspection-section"><h3>Documents</h3><FileLinks files={[...state.reportFiles, ...state.requestFiles]}/></section>
  </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button>{(weld.pwhtReqPre || weld.pwhtReq) && <UploadButton onClick={() => setUpload(true)}/>}</div></Modal>;
}
function UploadButton({ onClick }: { onClick: () => void }) { const { canRun } = useWorkspace(); return canRun('pwht-upload') ? <button type="button" className="btn primary" onClick={onClick}><Upload size={15}/>Upload report</button> : null; }

// ----- tracers ------------------------------------------------------------------------------------------------

/** "Tracer details": the source weld, "n linked of 2 required", and each tracer's NDT results; editors link tracers. */
export function TracerDialog({ weld, onClose }: { weld: Row; onClose: () => void }) {
  const { rows, canRun, label } = useWorkspace();
  const welds = activeRows(rows, 'welds');
  const summary = tracerSummary(weld, welds, rows.inspection_results);
  const [selected, setSelected] = useState<string[]>(summary.tracers.map(row => row.id));
  const [query, setQuery] = useState('');
  const { busy, error, setError, run } = useSubmit(onClose);
  const source = summary.source;
  const editable = Boolean(source) && canRun('tracers') && !isTracer(weld);
  const candidates = source ? welds.filter(row => row.id !== source.id && !row.repairOfId && (!row.tracerOfId || row.tracerOfId === source.id) && (!query.trim() || `${row.weldNo} ${label('isometrics', row.isoId)}`.toLowerCase().includes(query.trim().toLowerCase()))) : [];
  const sameWelder = (row: Row) => source && [1, 2, 3, 4].some(side => source[`welder${side}Id`] && [1, 2, 3, 4].some(other => row[`welder${other}Id`] === source[`welder${side}Id`]));
  candidates.sort((a, b) => Number(Boolean(sameWelder(b))) - Number(Boolean(sameWelder(a))) || String(a.weldNo).localeCompare(String(b.weldNo), 'en', { numeric: true }));
  function submit(event: FormEvent) {
    event.preventDefault(); if (!source) return;
    const problem = tracerError(source, selected, welds, rows.inspection_results); if (problem) { setError(problem); return; }
    void run(async () => { await post('/actions/tracers', { weldId: source.id, tracerIds: selected }); return `Tracer welds of weld ${weldName(source)} saved.`; });
  }
  const describe = (row: Row) => { const context = weldContext(rows, row); return `${context.projectName} · ${context.isoName} · ${weldName(row)}`; };
  return <Modal wide title="Tracer details" subtitle="A weld whose NDT result is not accepted needs tracer welds; tracers do not count toward inspection compliance." onClose={onClose}>
    <form onSubmit={submit}><div className="modal-body"><Alert message={error}/>
      <section className="inspection-section"><h3>Original weld</h3>{source ? <p>{describe(source)}</p> : <p className="muted">No source weld link found.</p>}</section>
      {source && <section className="inspection-section"><h3>Linked tracer welds <span className={`count-pill ${summary.needed ? 'warn' : ''}`}>{summary.text}</span></h3>
        {summary.tracers.length ? summary.tracers.map(tracer => <div className="inspection-tracer" key={tracer.id}><strong>{describe(tracer)}</strong><ul>{weldResults(rows.inspection_results, tracer.id, ['NDT', 'NDT PRE']).map(result => <li key={result.id}>{result.type === 'NDT PRE' ? 'NDT Pre' : 'NDT'} · {roundLabel(result.round)} · {label('ndt_processes', result.processId)} · {String(result.reportNo || '—')} · <Badge>{resultLabel(result.result)}</Badge></li>)}{!weldResults(rows.inspection_results, tracer.id, ['NDT', 'NDT PRE']).length && <li className="muted">No NDT result yet.</li>}</ul></div>) : <p className="muted">No tracer welds linked yet.</p>}</section>}
      {editable && <section className="inspection-section"><h3>Select tracer welds</h3><p className="field-hint">Choose up to {TRACERS_REQUIRED}. Welds of the same welder are listed first. Linking marks the weld as a tracer and sets NDT Req. on it.</p>
        <div className="field"><label htmlFor="tracer-search">Search welds</label><input id="tracer-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Weld or isometric number"/></div>
        <div className="inspection-candidates">{candidates.slice(0, 60).map(row => <label key={row.id}><input type="checkbox" checked={selected.includes(row.id)} disabled={!selected.includes(row.id) && selected.length >= TRACERS_REQUIRED} onChange={e => setSelected(e.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id))}/>{describe(row)}{sameWelder(row) && <small> · same welder</small>}</label>)}{!candidates.length && <p className="muted">No welds match.</p>}</div></section>}
    </div><Footer busy={busy} onClose={onClose} submit={editable ? 'Save tracers' : undefined}/></form>
  </Modal>;
}

// ----- mass actions -------------------------------------------------------------------------------------------

type MassProps = { isoId?: string; weldIds?: string[]; onClose: () => void };
const requestFlag: Record<string, string> = { 'NDT PRE': 'ndoReqPre', NDT: 'ndoReq', 'PRE-HT': 'pwhtReqPre', PWHT: 'pwhtReq' };
const scopeWelds = (rows: Rows, isoId?: string, weldIds?: string[]) => activeRows(rows, 'welds').filter(weld => (!isoId || weld.isoId === isoId) && (!weldIds?.length || weldIds.includes(weld.id))).sort((a, b) => String(a.weldNo).localeCompare(String(b.weldNo), 'en', { numeric: true }));

/** Generate mass NDT-Pre / NDT / Pre-HT/PWHT request: one request number, processes to include, note. */
export function MassRequestDialog({ kind, isoId, weldIds, onClose }: MassProps & { kind: 'NDT PRE' | 'NDT' | 'PWHT' }) {
  const { rows, canRun } = useWorkspace();
  const [type, setType] = useState<string>(kind === 'PWHT' ? 'PWHT' : kind);
  const pool = scopeWelds(rows, isoId, weldIds).filter(weld => weld[requestFlag[type]] === true && !(rows.inspection_requests || []).some(row => !row._archived && row.weldId === weld.id && row.type === type && row.status === 'Open'));
  const [selected, setSelected] = useState<string[]>(() => pool.map(weld => weld.id));
  const [processIds, setProcessIds] = useState<string[]>([]), [location, setLocation] = useState(''), [pwhtProcess, setPwhtProcess] = useState(''), [pwhtLocation, setPwhtLocation] = useState(''), [note, setNote] = useState(''), [date, setDate] = useState(today());
  const { busy, error, setError, run } = useSubmit(onClose);
  const ndt = type === 'NDT' || type === 'NDT PRE';
  if (!canRun('mass-inspection-request', { type })) return <NoAccess onClose={onClose} what="creating these requests"/>;
  const title = kind === 'NDT PRE' ? 'Generate Mass NDT-Pre request' : kind === 'NDT' ? 'Generate Mass NDT request' : 'Generate Mass Pre-HT/PWHT request';
  function submit(event: FormEvent) {
    event.preventDefault();
    const ids = selected.filter(id => pool.some(weld => weld.id === id));
    if (!ids.length) { setError('Select at least one weld.'); return; }
    if (ndt && !processIds.length) { setError('Choose the NDT processes to include.'); return; }
    void run(async () => { await post('/actions/mass-inspection-request', { type, weldIds: ids, processIds: ndt ? processIds : [], locationId: ndt ? location : '', pwhtProcessId: ndt ? '' : pwhtProcess, pwhtLocationId: ndt ? '' : pwhtLocation, date, note }); return `Request created for ${ids.length} weld${ids.length === 1 ? '' : 's'}.`; });
  }
  return <Modal wide title={title} subtitle="One request number for the chosen welds. The printable request follows in a later release." onClose={onClose}><form onSubmit={submit}><div className="modal-body"><Alert message={error}/>
    <div className="form-grid">
      {kind === 'PWHT' && <Select id="mass-type" label="Treatment" value={type} onChange={value => { setType(value); setSelected([]); }} options={[{ value: 'PRE-HT', label: 'Pre-HT' }, { value: 'PWHT', label: 'PWHT' }]} empty={null}/>}
      {ndt ? <><Select id="mass-location" label="NDT location" value={location} onChange={setLocation} options={options(rows.ndt_locations)} empty="Select NDT location"/>
        <fieldset className="field full-width inspection-processes"><legend>NDT processes to include <span className="required">*</span></legend>{options(rows.ndt_processes).map(option => <label key={option.value}><input type="checkbox" checked={processIds.includes(option.value)} onChange={e => setProcessIds(e.target.checked ? [...processIds, option.value] : processIds.filter(id => id !== option.value))}/>{option.label}</label>)}</fieldset></>
        : <><Select id="mass-pwht-process" label="PWHT process" value={pwhtProcess} onChange={setPwhtProcess} options={options(rows.pwht_processes)} empty="Select PWHT process"/><Select id="mass-pwht-location" label="PWHT location" value={pwhtLocation} onChange={setPwhtLocation} options={options(rows.pwht_locations)} empty="Select PWHT location"/></>}
      <Text id="mass-date" label="Request date" type="date" value={date} onChange={setDate} required/>
      <div className="field full-width"><label htmlFor="mass-note">Note</label><textarea id="mass-note" rows={3} value={note} onChange={e => setNote(e.target.value)}/></div>
    </div>
    <WeldPicker welds={pool} value={selected} onChange={setSelected} label="Welds requiring this examination without an open request"/>
  </div><Footer busy={busy} onClose={onClose} submit="Create request" disabled={!pool.length}/></form></Modal>;
}

/** Upload NDT on multiple welds: report number and result per round, and files. */
export function UploadNdtDialog({ isoId, weldIds, onClose, type: initial = 'NDT' }: MassProps & { type?: 'NDT' | 'NDT PRE' }) {
  const { rows, canRun } = useWorkspace();
  const [type, setType] = useState<'NDT' | 'NDT PRE'>(initial);
  const pool = scopeWelds(rows, isoId, weldIds).filter(weld => weld[requestFlag[type]] === true);
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
  return <Modal wide title="Upload NDT on multiple welds" subtitle="The same report number and result per round are written to every selected weld. NA creates each weld's repair weld." onClose={onClose}><form onSubmit={submit}><div className="modal-body"><Alert message={error}/>
    <div className="form-grid"><Select id="upload-type" label="Examination" value={type} onChange={value => { setType(value as 'NDT' | 'NDT PRE'); setSelected([]); }} options={[{ value: 'NDT', label: 'NDT' }, { value: 'NDT PRE', label: 'NDT Pre' }]} empty={null}/><Text id="upload-date" label="NDT date" type="date" value={date} onChange={setDate} required/></div>
    <TableScroll><table className="data-table inspection-rounds"><thead><tr><th scope="col">Round</th><th scope="col">Report number</th><th scope="col">Result</th></tr></thead><tbody>{rounds.map((round, i) => <tr key={round.round}><th scope="row">{roundLabel(round.round)}</th><td><input aria-label={`Report number ${roundLabel(round.round)}`} value={round.reportNo} onChange={e => setRounds(list => list.map((item, index) => index === i ? { ...item, reportNo: e.target.value } : item))}/></td><td><select aria-label={`Result ${roundLabel(round.round)}`} value={round.result} onChange={e => setRounds(list => list.map((item, index) => index === i ? { ...item, result: e.target.value } : item))}>{NDT_RESULT_CHOICES.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></td></tr>)}</tbody></table></TableScroll>
    <WeldPicker welds={pool} value={selected} onChange={setSelected}/>
    <FilePicker id="upload-files" label="NDT documents" files={files} onChange={setFiles} pdf hint="PDF files only; attached to the report."/>
  </div><Footer busy={busy} onClose={onClose} submit="Save results" disabled={!pool.length}/></form></Modal>;
}

/** Upload Pre-HT/PWHT on multiple welds: Pre report number, report number, file, check. */
export function UploadPwhtDialog({ isoId, weldIds, onClose }: MassProps) {
  const { rows, canRun } = useWorkspace();
  const pool = scopeWelds(rows, isoId, weldIds).filter(weld => weld.pwhtReqPre === true || weld.pwhtReq === true);
  const [selected, setSelected] = useState<string[]>(() => weldIds?.length ? pool.map(weld => weld.id) : []);
  const [preReportNo, setPre] = useState(''), [reportNo, setReport] = useState(''), [checked, setChecked] = useState(false), [date, setDate] = useState(today()), [files, setFiles] = useState<File[]>([]);
  const { busy, error, setError, run } = useSubmit(onClose);
  if (!canRun('pwht-upload')) return <NoAccess onClose={onClose} what="recording heat treatment reports"/>;
  function submit(event: FormEvent) {
    event.preventDefault();
    const ids = selected.filter(id => pool.some(weld => weld.id === id)); if (!ids.length) { setError('Select at least one weld.'); return; }
    if (!preReportNo.trim() && !reportNo.trim()) { setError('Enter a Pre report number, a report number, or both.'); return; }
    const missing = pool.find(weld => ids.includes(weld.id) && (preReportNo.trim() && weld.pwhtReqPre !== true || reportNo.trim() && weld.pwhtReq !== true));
    if (missing) { setError(`Weld ${weldName(missing)} does not require ${preReportNo.trim() && missing.pwhtReqPre !== true ? 'Pre-HT' : 'PWHT'}.`); return; }
    void run(async () => {
      const saved = await post<{ records: Row[] }>('/actions/pwht-upload', { weldIds: ids, preReportNo: preReportNo.trim(), reportNo: reportNo.trim(), checked, date });
      const failed = files.length && saved.records[0] ? await uploadFiles('inspection_results', saved.records[0].id, files, 'Heat treatment report') : 0;
      return failed ? `Reports saved; ${failed} file${failed === 1 ? '' : 's'} could not be uploaded.` : `Heat treatment saved for ${ids.length} weld${ids.length === 1 ? '' : 's'}.`;
    });
  }
  return <Modal wide title="Upload Pre-HT/PWHT on multiple welds" subtitle="Records the treatment report on every selected weld that requires it." onClose={onClose}><form onSubmit={submit}><div className="modal-body"><Alert message={error}/>
    <div className="form-grid"><Text id="pwht-pre" label="Pre report number" value={preReportNo} onChange={setPre}/><Text id="pwht-report" label="Report number" value={reportNo} onChange={setReport}/><Text id="pwht-date" label="Date" type="date" value={date} onChange={setDate} required/>
      <div className="field checkbox-field"><label htmlFor="pwht-check"><input id="pwht-check" type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/><span>Check</span></label><small className="field-hint">Tick when the treatment chart has been reviewed.</small></div></div>
    <WeldPicker welds={pool} value={selected} onChange={setSelected}/>
    <FilePicker id="pwht-files" label="File" files={files} onChange={setFiles}/>
  </div><Footer busy={busy} onClose={onClose} submit="Save" disabled={!pool.length}/></form></Modal>;
}

// ----- visual inspection hub ---------------------------------------------------------------------------------

/** Options → Visual inspection: New upload (one VI report to several welds) and the Visual reports archive. */
export function VisualInspectionHub({ isoId, weldIds, onClose }: MassProps) {
  const { rows, canRun, canRecord, label } = useWorkspace();
  const pool = scopeWelds(rows, isoId).filter(weld => weld.welder1Id || weld.welder2Id || weld.welder3Id || weld.welder4Id || weldIds?.includes(weld.id));
  const [tab, setTab] = useState<'new' | 'archive'>('new');
  const [filter, setFilter] = useState(weldIds?.length ? 'select' : 'all');
  const [selected, setSelected] = useState<string[]>(weldIds?.length ? weldIds : []);
  const [outcome, setOutcome] = useState<Record<string, 'Accepted' | 'Not applicable'>>({});
  const [itp, setItp] = useState(''), [activityNo, setActivity] = useState(''), [engineerId, setEngineer] = useState(''), [customNo, setCustom] = useState(''), [reportNo, setReport] = useState(''), [date, setDate] = useState(today()), [files, setFiles] = useState<File[]>([]);
  const { busy, error, setError, run } = useSubmit(onClose);
  const chosen = filter === 'all' ? pool.map(weld => weld.id) : selected;
  const reports = useMemo(() => { const groups = new Map<string, Row[]>(); for (const row of (rows.inspection_results || []).filter(row => !row._archived && row.type === 'VI' && (!isoId || rows.welds?.find(weld => weld.id === row.weldId)?.isoId === isoId))) { const key = String(row.reportNo || '—'); groups.set(key, [...(groups.get(key) || []), row]); } return [...groups.entries()].sort((a, b) => String(b[1][0].date).localeCompare(String(a[1][0].date))); }, [rows, isoId]);
  const knownReports = [...new Set((rows.inspection_results || []).filter(row => row.type === 'VI' && row.reportNo).map(row => String(row.reportNo)))];
  const editable = canRun('visual-inspection');
  if (!canRecord('inspection_results')) return <NoAccess onClose={onClose} what="viewing visual inspections"/>;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen.length) { setError('Select at least one weld.'); return; }
    if (!reportNo.trim()) { setError('Enter the report number.'); return; }
    const accepted = chosen.filter(id => (outcome[id] || 'Accepted') === 'Accepted'), notApplicable = chosen.filter(id => outcome[id] === 'Not applicable');
    void run(async () => {
      const saved = await post<{ records: Row[] }>('/actions/visual-inspection', { weldIds: chosen, accepted, notApplicable, itp, activityNo, engineerId, customNo, reportNo: reportNo.trim(), date });
      const failed = files.length && saved.records[0] ? await uploadFiles('inspection_results', saved.records[0].id, files, 'Visual inspection report') : 0;
      return failed ? `Visual report saved; ${failed} file${failed === 1 ? '' : 's'} could not be uploaded.` : `Visual report ${reportNo.trim()} saved for ${chosen.length} weld${chosen.length === 1 ? '' : 's'}.`;
    });
  }
  const files_ = (ids: string[]) => (rows.attachments || []).filter(file => !file._archived && file.entityType === 'inspection_results' && ids.includes(String(file.entityId)));
  return <Modal wide title="Visual inspection" subtitle={isoId ? `Isometric ${label('isometrics', isoId)}` : 'Visual inspection of welds'} onClose={onClose}>
    <div className="table-tabs inspection-tabs" role="tablist" aria-label="Visual inspection">{([['new', 'New upload'], ['archive', 'Visual reports archive']] as const).map(([key, title]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'selected' : ''} onClick={() => setTab(key)}>{title}{key === 'archive' && <span className="count-pill">{reports.length}</span>}</button>)}</div>
    {tab === 'new' ? editable ? <form onSubmit={submit}><div className="modal-body"><Alert message={error}/>
      <div className="form-grid">
        <Select id="vi-filter" label="Welds" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All welds' }, { value: 'select', label: 'Select specific welds' }]} empty={null}/>
        <Select id="vi-itp" label="ITP" value={itp} onChange={setItp} options={[{ value: 'ITP 1', label: 'ITP 1' }, { value: 'ITP 2', label: 'ITP 2' }]} empty="Select ITP"/>
        <Text id="vi-activity" label="Activity No." value={activityNo} onChange={setActivity}/>
        <Select id="vi-engineer" label="QA/QC engineer" value={engineerId} onChange={setEngineer} options={options(rows.qa_engineers)} empty="Select QA/QC engineer"/>
        <Text id="vi-custom" label="Custom No." value={customNo} onChange={setCustom}/>
        <Text id="vi-report" label="Report No." value={reportNo} onChange={setReport} required list="vi-reports"/><datalist id="vi-reports">{knownReports.map(value => <option key={value} value={value}/>)}</datalist>
        <Text id="vi-date" label="Inspection date" type="date" value={date} onChange={setDate} required/>
      </div>
      {filter === 'select' && <WeldPicker welds={pool} value={selected} onChange={setSelected}/>}
      {chosen.length ? <TableScroll><table className="data-table"><thead><tr><th scope="col">Weld</th><th scope="col">Accepted</th><th scope="col">Not applicable</th></tr></thead><tbody>{chosen.map(id => { const weld = rows.welds?.find(row => row.id === id); return <tr key={id}><th scope="row">{weldName(weld)}</th>{(['Accepted', 'Not applicable'] as const).map(value => <td key={value}><input type="radio" name={`vi-${id}`} aria-label={`${value}: weld ${weldName(weld)}`} checked={(outcome[id] || 'Accepted') === value} onChange={() => setOutcome(current => ({ ...current, [id]: value }))}/></td>)}</tr>; })}</tbody></table></TableScroll> : <EmptyState title="No welds to inspect" description="Welds appear here once a welder is recorded on them."/>}
      <FilePicker id="vi-files" label="Files" files={files} onChange={setFiles}/>
    </div><Footer busy={busy} onClose={onClose} submit="Save visual report" disabled={!chosen.length}/></form>
      : <div className="modal-body"><EmptyState title="Read only" description="Your profile does not allow recording visual inspections. The archive stays available."/></div>
      : <div className="modal-body">{reports.length ? <TableScroll><table className="data-table"><thead><tr><th scope="col">Report No.</th><th scope="col">Inspection date</th><th scope="col">ITP</th><th scope="col">Activity No.</th><th scope="col">QA/QC engineer</th><th scope="col">Custom No.</th><th scope="col">Welds</th><th scope="col">Files</th></tr></thead><tbody>{reports.map(([number, list]) => <tr key={number}><td>{number}</td><td>{formatDate(list[0].date)}</td><td>{String(list[0].itp || '—')}</td><td>{String(list[0].activityNo || '—')}</td><td>{list[0].engineerId ? label('qa_engineers', list[0].engineerId) : '—'}</td><td>{String(list[0].customNo || '—')}</td><td>{list.map(row => `${label('welds', row.weldId)}${row.result === 'Not applicable' ? ' (n/a)' : ''}`).join(', ')}</td><td><FileLinks files={files_(list.map(row => row.id))}/></td></tr>)}</tbody></table></TableScroll> : <EmptyState title="No visual reports yet" description="Saved visual reports are listed here."/>}</div>}
    {tab === 'archive' && <Footer busy={false} onClose={onClose}/>}
  </Modal>;
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

/** Welding data → NDT/PWHT Manager: the eight tabs of the reference. */
export function InspectionManager() {
  const { rows, canRecord, canRun, hasFeature } = useWorkspace();
  const [tabKey, setTab] = useState(MANAGER_TABS[0].key), [selected, setSelected] = useState<string[]>([]), [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<ReactNode>(null);
  const tab = MANAGER_TABS.find(item => item.key === tabKey)!;
  if (!hasFeature('inspections') || !canRecord('welds') || !canRecord('inspection_requests')) return <EmptyState title="This area is restricted" description="Your profile does not include the NDT/PWHT Manager."/>;
  const welds = activeRows(rows, 'welds');
  const match = (values: unknown[]) => !query.trim() || values.some(value => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase()));
  const close = () => { setDialog(null); setSelected([]); };
  const switchTab = (key: ManagerTab['key']) => { setTab(key); setSelected([]); };
  return <div className="page inspection-manager">
    <div className="page-heading"><div><div className="eyebrow">WELD PILOT · WELDING DATA</div><h1>NDT/PWHT Manager</h1><p>Welds that need NDT Pre, NDT or heat treatment, and every request and result already recorded.</p></div></div>
    <section className="panel">
      <div className="table-tabs inspection-tabs" role="tablist" aria-label="NDT/PWHT Manager">{MANAGER_TABS.map(item => { const count = item.requests ? managerRequests(item, rows.inspection_requests).length : managerWelds(item, welds, rows.inspection_results).length; return <button key={item.key} type="button" role="tab" aria-selected={tabKey === item.key} className={tabKey === item.key ? 'selected' : ''} onClick={() => switchTab(item.key)}>{item.label}<span className="count-pill">{count}</span></button>; })}</div>
      <div className="inspection-toolbar"><div className="field"><label htmlFor="manager-search">Search</label><input id="manager-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Project, ISO, weld, report…"/></div>
        {!tab.requests && !tab.archive && <ManagerActions tab={tab} selected={selected} open={setDialog} onDone={close}/>}</div>
      {tab.requests ? <RequestArchive tab={tab} match={match}/> : <WeldTab tab={tab} welds={managerWelds(tab, welds, rows.inspection_results).filter(weld => { const context = weldContext(rows, weld); return match([context.projectName, context.isoName, weld.weldNo, welderNames(rows, weld), currentRequest(rows.inspection_requests, weld.id, tab.types[0])?.number]); })} selected={selected} setSelected={setSelected} selectable={!tab.archive && (canRun('mass-inspection-request', { type: tab.types[0] }) || canRun(tab.kind === 'PWHT' ? 'pwht-upload' : 'inspection-upload', { type: tab.types[0] }))}/>}
    </section>
    {dialog}
  </div>;
}
function ManagerActions({ tab, selected, open, onDone }: { tab: ManagerTab; selected: string[]; open: (node: ReactNode) => void; onDone: () => void }) {
  const { canRun } = useWorkspace();
  const type = tab.types[0] as 'NDT' | 'NDT PRE';
  const pwht = tab.kind === 'PWHT';
  return <div className="inspection-actions">
    {canRun('mass-inspection-request', { type: pwht ? 'PWHT' : type }) && <button type="button" className="btn" disabled={!selected.length} onClick={() => open(<MassRequestDialog kind={pwht ? 'PWHT' : type} weldIds={selected} onClose={onDone}/>)}><Printer size={15}/>{pwht ? 'Generate Pre-HT/PWHT request' : tab.kind === 'NDT PRE' ? 'Generate NDT-Pre request' : 'Generate NDT request'}</button>}
    {pwht ? canRun('pwht-upload') && <button type="button" className="btn primary" disabled={!selected.length} onClick={() => open(<UploadPwhtDialog weldIds={selected} onClose={onDone}/>)}><Upload size={15}/>Upload Pre-HT/PWHT</button>
      : canRun('inspection-upload', { type }) && <button type="button" className="btn primary" disabled={!selected.length} onClick={() => open(<UploadNdtDialog type={type} weldIds={selected} onClose={onDone}/>)}><Upload size={15}/>Upload results</button>}
    <small className="field-hint">{selected.length ? `${selected.length} selected` : 'Tick welds to request or record them.'}</small>
  </div>;
}
function WeldTab({ tab, welds, selected, setSelected, selectable }: { tab: ManagerTab; welds: Row[]; selected: string[]; setSelected: (ids: string[]) => void; selectable: boolean }) {
  const { rows, label } = useWorkspace();
  const [page, setPage] = useState(0);
  if (!welds.length) return <EmptyState title={tab.archive ? 'Nothing archived yet' : 'No welds waiting'} description={tab.archive ? 'Welds move here once a result is recorded.' : 'Welds appear here when their requirement flag is set and no result is recorded yet.'}/>;
  const sorted = [...welds].sort((a, b) => label('isometrics', a.isoId).localeCompare(label('isometrics', b.isoId), 'en', { numeric: true }) || String(a.weldNo).localeCompare(String(b.weldNo), 'en', { numeric: true }));
  const pages = Math.max(1, Math.ceil(sorted.length / 50)), current = Math.min(page, pages - 1), shown = sorted.slice(current * 50, current * 50 + 50);
  const columns = managerColumns(tab);
  const certificate = (weld: Row, side: number) => rows.certifications?.find(row => row.id === weld[`certificate${side}Id`]);
  const material = (weld: Row, side: number) => { const id = weld[`material${side}Id`]; return id ? String(rows.materials?.find(row => row.id === id)?.description || label('materials', id)) : '—'; };
  const pre = tab.kind === 'NDT PRE';
  const process = (weld: Row) => tab.kind === 'PWHT' ? [weld.pwhtPreProcessId, weld.pwhtProcessId].filter(Boolean).map(id => label('pwht_processes', id)).join(', ') || '—' : weld[processField(pre, 1)] ? label('ndt_processes', weld[processField(pre, 1)]) : '—';
  return <><TableScroll><table className="data-table inspection-table" aria-label={tab.label}><thead><tr>{columns.map((column, i) => <th scope="col" key={i}>{column}</th>)}{selectable && <th scope="col"><input type="checkbox" aria-label="Select all welds on this page" checked={shown.every(weld => selected.includes(weld.id))} onChange={e => setSelected(e.target.checked ? [...new Set([...selected, ...shown.map(weld => weld.id)])] : selected.filter(id => !shown.some(weld => weld.id === id)))}/></th>}</tr></thead>
    <tbody>{shown.map(weld => { const context = weldContext(rows, weld); const request = tab.types.map(type => currentRequest(rows.inspection_requests, weld.id, type)).find(Boolean); return <tr key={weld.id}>
      <td>{context.projectName}</td><td>{context.isoName}</td><th scope="row">{weldName(weld)}</th><td>{String(rows.weld_types?.find(row => row.id === weld.typeId)?.abbreviation || label('weld_types', weld.typeId))}</td><td>{welderNames(rows, weld) || '—'}</td>
      <td><ManagerCell weld={weld} kind={tab.kind}/></td><td>{String(request?.number || '—')}</td>
      <td>{String(certificate(weld, 1)?.indexNo || '—')}</td><td>{String(weld.chargeNo1 || '—')}</td><td>{material(weld, 1)}</td><td>{String(certificate(weld, 2)?.indexNo || '—')}</td><td>{String(weld.chargeNo2 || '—')}</td><td>{material(weld, 2)}</td>
      <td>{process(weld)}</td><td>{weld.wpsId ? label('wps', weld.wpsId) : '—'}</td>
      {selectable && <td><input type="checkbox" aria-label={`Select weld ${weldName(weld)}`} checked={selected.includes(weld.id)} onChange={e => setSelected(e.target.checked ? [...selected, weld.id] : selected.filter(id => id !== weld.id))}/></td>}
    </tr>; })}</tbody></table></TableScroll>
    <div className="table-footer"><span role="status">{current * 50 + 1}–{Math.min(current * 50 + 50, sorted.length)} of {sorted.length} welds</span><div><button type="button" className="btn small" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><span>{current + 1} / {pages}</span><button type="button" className="btn small" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</button></div></div></>;
}
function ManagerCell({ weld, kind }: { weld: Row; kind: InspectionKind }) {
  const [open, setOpen] = useState(false); const { rows } = useWorkspace();
  const state = inspectionCellState(weld, kind, rows);
  return <><button type="button" className="text-link" onClick={() => setOpen(true)} aria-label={`${KIND_LABELS[kind]} of weld ${weldName(weld)}: ${state.status.replace('-', ' ')}`}><ClipboardCheck size={14}/>{state.status === 'accepted' ? 'Accepted' : state.status === 'rejected' ? 'NA' : state.status === 'requested' ? 'Requested' : state.status === 'not-applicable' ? 'Not applicable' : 'Open'}</button>{open && <InspectionDialog weld={weld} kind={kind} onClose={() => setOpen(false)}/>}</>;
}
function RequestArchive({ tab, match }: { tab: ManagerTab; match: (values: unknown[]) => boolean }) {
  const { rows, label } = useWorkspace();
  const requests = managerRequests(tab, rows.inspection_requests).filter(row => { const weld = rows.welds?.find(item => item.id === row.weldId); const context = weld ? weldContext(rows, weld) : undefined; return match([row.number, row.type, weld?.weldNo, context?.isoName, context?.projectName, row.status]); });
  if (!requests.length) return <EmptyState title="No requests yet" description="Requests created from this manager or from an isometric are archived here."/>;
  const pwht = tab.kind === 'PWHT';
  return <TableScroll><table className="data-table inspection-table" aria-label={tab.label}><thead><tr><th scope="col">Request number</th><th scope="col">Type</th><th scope="col">Project</th><th scope="col">ISO</th><th scope="col">Weld no.</th><th scope="col">{pwht ? 'PWHT process' : 'NDT processes'}</th><th scope="col">{pwht ? 'PWHT location' : 'NDT location'}</th><th scope="col">Request date</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>
    <tbody>{requests.map(row => { const weld = rows.welds?.find(item => item.id === row.weldId); const context = weld ? weldContext(rows, weld) : undefined; return <tr key={row.id}><th scope="row">{String(row.number || '—')}</th><td>{row.type === 'NDT PRE' ? 'NDT Pre' : row.type === 'PRE-HT' ? 'Pre-HT' : String(row.type)}</td><td>{context?.projectName || '—'}</td><td>{context?.isoName || '—'}</td><td>{weldName(weld)}</td><td>{pwht ? (row.pwhtProcessId ? label('pwht_processes', row.pwhtProcessId) : '—') : String(row.processes || (row.processId ? label('ndt_processes', row.processId) : '—'))}</td><td>{pwht ? (row.pwhtLocationId ? label('pwht_locations', row.pwhtLocationId) : '—') : row.locationId ? label('ndt_locations', row.locationId) : '—'}</td><td>{formatDate(row.date)}</td><td><Badge>{row.status === 'Rejected' ? 'NA' : String(row.status)}</Badge></td><td>{String(row.note || '')}</td></tr>; })}</tbody></table></TableScroll>;
}
