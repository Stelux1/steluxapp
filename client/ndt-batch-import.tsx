import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Download, Loader2, Search, Upload } from 'lucide-react';
import { api, apiUrl, post } from './api.ts';
import { useWorkspace } from './context.tsx';
import { EmptyState, Modal, TableScroll } from './components.tsx';
import {
  NDT_BATCH_AREA, NDT_BATCH_COLUMNS, NDT_BATCH_REQUEST_TYPES, NDT_BATCH_STATE_LABELS, NDT_BATCH_TABS, NDT_BATCH_TITLE, batchResult,
  type NdtBatchRequestIso, type NdtBatchRequestTest, type NdtBatchRow, type NdtBatchSummary, type NdtBatchTab,
} from '../shared/ndt-batch.ts';
import { DEFECT_EMPTY_OPTION, resultLabel } from '../shared/inspections.ts';

/**
 * Welding data → NDT Batch Import (reference page ndt-batch-import, manual §21). The server checks and writes every
 * row through the NDT cell's own rules (server/ndt-batch.ts); this page shows the preview, Lookup and the results.
 */
type Status = { type: 'error' | 'success' | 'info'; text: string } | null;
type Repair = { weldId: string; weldNo: string; repairId: string; repairNo: string; isoId: string };
type Done = { message: string; repairs: Repair[] };

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return <div className={`alert ${status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : ''}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.type === 'error' ? <AlertCircle size={18}/> : status.type === 'info' ? <Loader2 size={18} className="spin"/> : <CheckCircle2 size={18}/>}<span>{status.text}</span></div>;
}
/** After a commit: the success message (number of A and NA) and a button per existing repair weld of an NA. */
function DoneLine({ done }: { done: Done | null }) {
  if (!done) return null;
  return <div className="alert success ndt-batch-done" role="status"><CheckCircle2 size={18}/><div><span>{done.message}</span>
    {done.repairs.length > 0 && <div className="ndt-batch-repairs">{done.repairs.map(repair => <Link key={repair.repairId} className="btn small" to={`/workspace/isometrics/${repair.isoId}`}>Open repair weld {repair.repairNo}</Link>)}</div>}</div></div>;
}

export function NdtBatchImport() {
  const { hasFeature, canArea, canRecord } = useWorkspace();
  const [tab, setTab] = useState<NdtBatchTab>('file');
  if (!hasFeature('inspections') || !canArea(NDT_BATCH_AREA) || !canRecord('welds') || !canRecord('inspection_results')) return <EmptyState title="This area is restricted" description="You do not have rights to open this page."/>;
  return <div className="page ndt-batch-page">
    <div className="page-heading"><div><div className="eyebrow">WELD CORE · WELDING DATA</div><h1>{NDT_BATCH_TITLE}</h1><p>Import NDT results in bulk from a file, or enter the results of one NDT request per isometric.</p></div></div>
    <section className="panel">
      <div className="table-tabs inspection-tabs" role="tablist" aria-label={NDT_BATCH_TITLE}>{NDT_BATCH_TABS.map(item => <button key={item.key} id={`ndt-batch-tab-${item.key}`} type="button" role="tab" aria-selected={tab === item.key} aria-controls={`ndt-batch-panel-${item.key}`} className={tab === item.key ? 'selected' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
      <div id={`ndt-batch-panel-${tab}`} role="tabpanel" aria-labelledby={`ndt-batch-tab-${tab}`}>{tab === 'file' ? <ViaFile/> : <ViaRequest/>}</div>
    </section>
  </div>;
}

// ----- Via file ----------------------------------------------------------------------------------------------------
type Preview = { rows: NdtBatchRow[]; summary: NdtBatchSummary };
function ViaFile() {
  const { canArea, canRun, refresh } = useWorkspace();
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<Status>(null), [done, setDone] = useState<Done | null>(null);
  const [lookup, setLookup] = useState<NdtBatchRow | null>(null);
  if (!canArea(NDT_BATCH_AREA, 'import') || !canRun('ndt-weld', { type: 'NDT' })) return <p className="muted ndt-batch-note">Your profile does not allow importing NDT results.</p>;
  const sendRows = (rows: NdtBatchRow[]) => rows.map(row => ({ rowNo: row.rowNo, values: row.values, ...(row.weldId ? { weldId: row.weldId } : {}) }));
  async function upload(event: FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setDone(null); setPreview(null); setStatus({ type: 'info', text: 'Checking the file…' });
    const body = new FormData(); body.set('file', file);
    try { const result = await api<Preview>('/ndt-batch/preview', { method: 'POST', body }); setPreview(result); setStatus(null); }
    catch (failure) { setStatus({ type: 'error', text: (failure as Error).message }); } finally { setBusy(false); }
  }
  async function choose(row: NdtBatchRow, weldId: string) {
    if (!preview) return;
    setLookup(null); setBusy(true);
    try { setPreview(await post<Preview>('/ndt-batch/check', { rows: sendRows(preview.rows.map(item => item.rowNo === row.rowNo ? { ...item, weldId } : item)) })); setStatus(null); }
    catch (failure) { setStatus({ type: 'error', text: (failure as Error).message }); } finally { setBusy(false); }
  }
  async function commit() {
    if (!preview) return;
    const skipped = preview.summary.total - preview.summary.ready;
    if (!window.confirm(`Commit ${preview.summary.ready} ${preview.summary.ready === 1 ? 'row' : 'rows'}?${skipped ? ` ${skipped} ${skipped === 1 ? 'row is' : 'rows are'} not saved.` : ''}`)) return;
    setBusy(true);
    try { const result = await post<Preview & Done>('/ndt-batch/commit', { rows: sendRows(preview.rows), ready: preview.rows.filter(row => row.state === 'ready').map(row => row.rowNo) }); setDone({ message: result.message, repairs: result.repairs }); setPreview(null); setFile(null); setStatus(null); await refresh(); }
    catch (failure) { setStatus({ type: 'error', text: (failure as Error).message }); } finally { setBusy(false); }
  }
  const summary = preview?.summary;
  return <div className="ndt-batch-file">
    <ol className="ndt-batch-steps">
      <li><strong>Download the template</strong> and enter one NDT result per row: the isometric, weld number, NDT process, A or NA, the date and the report number.</li>
      <li><strong>An NA row</strong> needs NaLength, DefectType and Welder. ReWeld is ticked automatically on a weld of 3 inch or smaller when it is left empty.</li>
      <li><strong>Upload</strong> the CSV or Excel file and review the preview. Red rows are not saved; use Lookup for a weld that is not matched.</li>
      <li><strong>Commit</strong> writes the ready rows to the welds, all of them or none.</li>
    </ol>
    <form className="ndt-batch-form" onSubmit={event => void upload(event)}>
      <div className="field"><label htmlFor="ndt-batch-file">CSV or Excel file<span className="required"> *</span></label><input id="ndt-batch-file" type="file" accept=".csv,.xlsx" required onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); setDone(null); }}/></div>
      <div className="ndt-batch-buttons"><button className="btn primary" disabled={busy || !file}>{busy ? <Loader2 size={15} className="spin"/> : <Upload size={15}/>}Upload</button>
        {preview && <button type="button" className="btn primary" disabled={busy || !summary?.ready} onClick={() => void commit()}><CheckCircle2 size={15}/>Commit</button>}
        <a className="btn subtle" href={apiUrl('/ndt-batch/template')}><Download size={15}/>Download template</a></div>
    </form>
    <StatusLine status={status}/><DoneLine done={done}/>
    {preview && summary && <>
      <p className="ndt-batch-summary" role="status">Rows: {summary.total} | Ready: {summary.ready} ({summary.accepted} A, {summary.rejected} NA) | Not matched: {summary.unmatched} | Not saved: {summary.error}</p>
      <TableScroll><table className="data-table ndt-batch-table"><thead><tr><th scope="col">#</th>{NDT_BATCH_COLUMNS.filter(column => column.field !== 'project').map(column => <th key={column.field} scope="col">{column.header}</th>)}<th scope="col">State</th></tr></thead>
        <tbody>{preview.rows.map(row => <tr key={row.rowNo} className={`ndt-batch-${row.state}`}>
          <td className="tabular">{row.rowNo}</td>
          <td>{row.isoNo || row.values.isometric || ''}</td><td>{row.weldNo || row.values.weldNo || ''}</td><td>{row.values.process || ''}</td>
          <td>{batchResult(row.values.result) ? resultLabel(batchResult(row.values.result)) : row.values.result || ''}</td><td className="tabular">{row.values.date || ''}</td><td>{row.values.reportNo || ''}</td><td>{row.values.filmNo || ''}</td>
          <td className="tabular">{row.values.naLength || ''}</td><td>{row.values.defectType || ''}</td><td>{row.values.welder || ''}</td><td>{row.result === 'Rejected' ? (row.reweld ? 'Yes' : 'No') : row.values.reweld || ''}</td>
          <td className="ndt-batch-state"><strong>{NDT_BATCH_STATE_LABELS[row.state]}</strong>{row.errors.length > 0 && <span>{row.errors.join(' ')}</span>}
            {row.state === 'unmatched' && <button type="button" className="btn small" disabled={busy} onClick={() => setLookup(row)}><Search size={14}/>Lookup</button>}</td>
        </tr>)}</tbody></table></TableScroll>
    </>}
    {lookup && <LookupDialog row={lookup} onChoose={weldId => void choose(lookup, weldId)} onClose={() => setLookup(null)}/>}
  </div>;
}

type Found = { id: string; weldNo: string; isoNo: string; project: string };
/** Lookup: choose the weld of an unmatched row among the welds of the open main project. */
function LookupDialog({ row, onChoose, onClose }: { row: NdtBatchRow; onChoose: (weldId: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState([row.values.isometric, row.values.weldNo].filter(Boolean).join(' '));
  const [found, setFound] = useState<Found[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function search(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError('');
    try { setFound((await api<{ welds: Found[] }>(`/ndt-batch/welds?q=${encodeURIComponent(query)}`)).welds); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Lookup" subtitle={`Row ${row.rowNo}: ${[row.values.isometric, row.values.weldNo].filter(Boolean).join(' / ') || 'no weld given'}`} onClose={onClose}>
    <form onSubmit={event => void search(event)}><div className="modal-body">
      <div className="ndt-batch-lookup-search"><div className="field"><label htmlFor="ndt-batch-lookup">Isometric or weld number</label><input id="ndt-batch-lookup" type="search" value={query} onChange={event => setQuery(event.target.value)} autoFocus/></div><button className="btn" disabled={busy}>{busy ? <Loader2 size={15} className="spin"/> : <Search size={15}/>}Search</button></div>
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      {found && (found.length ? <ul className="ndt-batch-lookup-list">{found.map(weld => <li key={weld.id}><button type="button" className="related-row" onClick={() => onChoose(weld.id)}><span>{weld.isoNo} / <strong>{weld.weldNo}</strong></span><span className="muted">{weld.project}</span></button></li>)}</ul>
        : <p className="muted">No weld of the open main project matches.</p>)}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button></div></form>
  </Modal>;
}

// ----- Via request number ------------------------------------------------------------------------------------------
type Found2 = { type: string; number: string; isos: NdtBatchRequestIso[]; welders: { id: string; code: string; name: string }[]; defectCodes: { code: string; english: string }[] };
type Draft = { selected: boolean; result: string; date: string; naLength: string; defectType: string; welderId: string; reweld: boolean };
const testKey = (weldId: string, processId: string) => `${weldId}|${processId}`;
function ViaRequest() {
  const { canArea, canRun, refresh } = useWorkspace();
  const [type, setType] = useState<'NDT' | 'NDT PRE'>('NDT'), [number, setNumber] = useState('');
  const [found, setFound] = useState<Found2 | null>(null), [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reports, setReports] = useState<Record<string, string>>({}), [pdfs, setPdfs] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<Status>(null), [done, setDone] = useState<Done | null>(null);
  const canCommit = canArea(NDT_BATCH_AREA, 'import') && canRun('ndt-weld', { type });
  const pre = found?.type === 'NDT PRE';
  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setStatus(null); setDone(null);
    try {
      const result = await api<Found2>(`/ndt-batch/request?type=${encodeURIComponent(type)}&number=${encodeURIComponent(number)}`);
      setFound(result); setPdfs({});
      setReports(Object.fromEntries(result.isos.map(iso => [iso.isoId, iso.welds.flatMap(weld => weld.tests).find(test => test.reportNo)?.reportNo || ''])));
      setDrafts(Object.fromEntries(result.isos.flatMap(iso => iso.welds.flatMap(weld => weld.tests.map(test => [testKey(weld.weldId, test.processId), { selected: false, result: test.result, date: test.date, naLength: test.naLength, defectType: test.defectType, welderId: test.welderForErrorId || weld.welderIds[0] || '', reweld: test.reweld }])))));
      if (!result.isos.length) setStatus({ type: 'error', text: `No welds of request ${result.number} on the open main project.` });
    } catch (failure) { setFound(null); setStatus({ type: 'error', text: (failure as Error).message }); } finally { setBusy(false); }
  }
  const welds = found ? found.isos.flatMap(iso => iso.welds) : [];
  const update = (key: string, change: Partial<Draft>) => setDrafts(old => {
    const next = { ...old, [key]: { ...old[key], ...change } };
    const processId = key.split('|')[1];
    // Checking one NDT process selects the other tests of that process; an NDT date is copied to the other selected tests of it.
    if (change.selected === true) for (const weld of welds) if (!weld.superseded && weld.tests.some(test => test.processId === processId)) { const other = testKey(weld.weldId, processId); next[other] = { ...next[other], selected: true }; }
    if (change.date !== undefined && next[key].selected) for (const other of Object.keys(next)) if (other.endsWith(`|${processId}`) && next[other].selected) next[other] = { ...next[other], date: change.date };
    return next;
  });
  const setResult = (key: string, result: string, autoReweld: boolean) => update(key, result === 'Rejected' ? { result, reweld: autoReweld } : { result, naLength: '', defectType: '', reweld: false });
  async function commit() {
    if (!found) return;
    const isos = found.isos.map(iso => ({ isoId: iso.isoId, reportNo: reports[iso.isoId] || '', tests: iso.welds.flatMap(weld => weld.tests.filter(test => drafts[testKey(weld.weldId, test.processId)]?.selected).map((test): NdtBatchRequestTest => {
      const draft = drafts[testKey(weld.weldId, test.processId)];
      return { weldId: weld.weldId, processId: test.processId, result: draft.result, date: draft.date, ...(pre ? { welderId: draft.welderId } : draft.result === 'Rejected' ? { naLength: draft.naLength, defectType: draft.defectType, welderId: draft.welderId, reweld: draft.reweld } : {}) };
    })) })).filter(iso => iso.tests.length);
    if (!isos.length) { setStatus({ type: 'error', text: 'Select at least one test to import.' }); return; }
    const body = new FormData(); body.set('payload', JSON.stringify({ type: found.type, number: found.number, isos }));
    for (const iso of isos) { const pdf = pdfs[iso.isoId]; if (pdf) body.append(`pdf-${iso.isoId}`, pdf); }
    setBusy(true); setStatus(null);
    try { const result = await api<Done>('/ndt-batch/request/commit', { method: 'POST', body }); setDone({ message: result.message, repairs: result.repairs }); setFound(null); await refresh(); }
    catch (failure) { setStatus({ type: 'error', text: (failure as Error).message }); } finally { setBusy(false); }
  }
  const stamp = (id: string) => found?.welders.find(welder => welder.id === id);
  const defects = found?.defectCodes ?? [];
  return <div className="ndt-batch-request">
    <form className="ndt-batch-request-form" onSubmit={event => void search(event)}>
      <div className="field"><span className="field-label" id="ndt-batch-type">NDT-Pre / NDT</span><div className="segmented" role="radiogroup" aria-labelledby="ndt-batch-type">{NDT_BATCH_REQUEST_TYPES.map(item => <button key={item.value} type="button" role="radio" aria-checked={type === item.value} className={type === item.value ? 'selected' : ''} onClick={() => { setType(item.value); setFound(null); }}>{item.label}</button>)}</div></div>
      <div className="field"><label htmlFor="ndt-batch-number">NDT Request No.<span className="required"> *</span></label><input id="ndt-batch-number" value={number} required maxLength={40} placeholder="R00029" onChange={event => setNumber(event.target.value)}/></div>
      <button className="btn primary" disabled={busy || !number.trim()}>{busy ? <Loader2 size={15} className="spin"/> : <Search size={15}/>}Search welds</button>
    </form>
    <StatusLine status={status}/><DoneLine done={done}/>
    {found && found.isos.map(iso => <section key={iso.isoId} className="ndt-batch-iso" aria-label={`ISO ${iso.isoNo}`}>
      <div className="ndt-batch-iso-head"><h3>ISO {iso.isoNo}{iso.project && <span className="muted"> · {iso.project}</span>}</h3>
        <div className="field"><label htmlFor={`ndt-batch-report-${iso.isoId}`}>Report No.</label><input id={`ndt-batch-report-${iso.isoId}`} value={reports[iso.isoId] || ''} maxLength={80} onChange={event => setReports(old => ({ ...old, [iso.isoId]: event.target.value }))}/></div>
        <div className="field"><label htmlFor={`ndt-batch-pdf-${iso.isoId}`}>PDF</label><input id={`ndt-batch-pdf-${iso.isoId}`} type="file" accept=".pdf,application/pdf" onChange={event => { const pdf = event.target.files?.[0] || null; setPdfs(old => ({ ...old, [iso.isoId]: pdf })); }}/></div></div>
      <TableScroll><table className="data-table ndt-batch-table"><thead><tr><th scope="col"><span className="sr-only">Select</span></th><th scope="col">Weld</th><th scope="col">NDT Process</th><th scope="col">Welder ID</th><th scope="col">Result</th><th scope="col">NDT Date</th>{!pre && <><th scope="col">NA length</th><th scope="col">Defect type</th></>}<th scope="col">{pre ? 'Welder' : 'Welder for error'}</th>{!pre && <th scope="col">ReWeld?</th>}</tr></thead>
        <tbody>{iso.welds.flatMap(weld => weld.tests.map(test => {
          const key = testKey(weld.weldId, test.processId), draft = drafts[key]; if (!draft) return null;
          const off = !canCommit || weld.superseded || !draft.selected, na = draft.result === 'Rejected', label = `${weld.weldNo} ${test.processName}`;
          return <tr key={key} className={weld.superseded ? 'ndt-batch-error' : ''}>
            <td><input type="checkbox" aria-label={`Select ${label}`} checked={draft.selected} disabled={!canCommit || weld.superseded} onChange={event => update(key, { selected: event.target.checked })}/></td>
            <td>{weld.weldNo}{weld.superseded && <small className="ndt-batch-hint">A later request exists on this weld.</small>}</td><td>{test.processName}</td>
            <td>{weld.welderIds.map((id, index) => <span key={id}>{index > 0 && ', '}<span title={stamp(id)?.name}>{stamp(id)?.code || '—'}</span></span>)}</td>
            <td><select aria-label={`Result ${label}`} value={draft.result} disabled={off} onChange={event => setResult(key, event.target.value, weld.autoReweld)}><option value="">—</option><option value="Accepted">A</option><option value="Rejected">NA</option></select></td>
            <td><input type="date" aria-label={`NDT date ${label}`} value={draft.date} disabled={off} onChange={event => update(key, { date: event.target.value })}/></td>
            {!pre && <><td><input inputMode="numeric" aria-label={`NA length ${label}`} value={draft.naLength} disabled={off || !na} onChange={event => update(key, { naLength: event.target.value.replace(/\D/g, '') })}/></td>
              <td><select aria-label={`Defect type ${label}`} value={draft.defectType} disabled={off || !na} onChange={event => update(key, { defectType: event.target.value })}><option value="">{DEFECT_EMPTY_OPTION}</option>{defects.map(code => <option key={code.code} value={code.code}>{code.english || code.code}</option>)}{draft.defectType && !defects.some(code => code.code === draft.defectType) && <option value={draft.defectType}>{draft.defectType}</option>}</select></td></>}
            <td><select aria-label={`${pre ? 'Welder' : 'Welder for error'} ${label}`} value={draft.welderId} disabled={off || (!pre && !na)} onChange={event => update(key, { welderId: event.target.value })}>{!pre && <option value="">—</option>}{weld.welderIds.map(id => <option key={id} value={id}>{[stamp(id)?.code, stamp(id)?.name].filter(Boolean).join(', ')}</option>)}</select></td>
            {!pre && <td><input type="checkbox" aria-label={`ReWeld ${label}`} checked={draft.reweld} disabled={off || !na} onChange={event => update(key, { reweld: event.target.checked })}/></td>}
          </tr>;
        }))}</tbody></table></TableScroll>
    </section>)}
    {found && found.isos.length > 0 && (canCommit ? <div className="ndt-batch-buttons"><button type="button" className="btn primary" disabled={busy} onClick={() => void commit()}>{busy ? <Loader2 size={15} className="spin"/> : <CheckCircle2 size={15}/>}Commit import</button></div>
      : <p className="muted ndt-batch-note">Your profile does not allow importing NDT results.</p>)}
  </div>;
}
