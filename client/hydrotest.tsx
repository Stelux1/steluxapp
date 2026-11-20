import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, Download, ExternalLink, FileText, FolderOpen, Loader2, MoveRight, Paperclip, Pencil, Play, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { HYDROTEST_ACTIONS, HYDROTEST_DOCUMENT_TYPES, NO_TEST_SYSTEM, PDF_ONLY, SPOOL_COLUMNS, TS_NOT_SET, colourMeaning, isPdfName, spoolColour, spoolFacts, spoolTestSystemId, testSystemColour, type HydrotestColour } from '../shared/hydrotest.ts';
import type { Row } from '../shared/types.ts';
import { ApiError, api, apiBlob, apiUrl, formatDate, formatNumber, post } from './api.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { Dropdown, EmptyState, FieldInput, Modal, SearchInput, TableScroll, revealInvalidField } from './components.tsx';
import { RecordEditor } from './dialogs.tsx';

/** Path of the Spools tab filtered by one test system (the reference's folder icon and name link). */
export const hydrotestSpoolsPath = (systemId: string) => `/welding/test_systems?tab=spools&testSystem=${encodeURIComponent(systemId)}`;
const text = (value: unknown) => String(value ?? '').trim();
const dash = (value: string) => value || '-';

/** The coloured square of a test system or spool state (Approved green, Testing not applicable red, Not set blue; a spool without a system red). */
export function StateSquare({ colour, meaning }: { colour: HydrotestColour; meaning: string }) {
  return <span className={`ts-state ts-${colour}`} role="img" aria-label={meaning} title={meaning}/>;
}

type Tab = 'systems' | 'spools';
type Dialog =
  | { kind: 'system'; record?: Row }
  | { kind: 'delete'; system: Row }
  | { kind: 'move'; spoolIds: string[] }
  | { kind: 'release'; system: Row }
  | { kind: 'results' }
  | { kind: 'history' }
  | { kind: 'filter' }
  | { kind: 'documents'; system: Row };

/**
 * Releases → Hydrotest release (Weld Pilot). Tab "Test systems": the systems with their state colour and the client's
 * acceptance; the name and the folder open the Spools tab filtered by the system. Tab "Spools": every spool with its
 * test system; check spools to move them into a test system. With one system filtered the top bar offers the hydrotest
 * release (Pressure Test Plan) and the panel its attachments. Results are entered per test system.
 */
export function HydrotestRelease() {
  const { canRecord } = useWorkspace(); const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'spools' ? 'spools' : 'systems';
  const systemId = params.get('testSystem') || '', projectId = params.get('project') || '';
  const [dialog, setDialog] = useState<Dialog | null>(null);
  if (!canRecord('test_systems')) return <EmptyState title="You do not have rights to open this page." description="Ask an administrator to add the Test systems area to your profile."/>;
  const go = (next: Tab, filter: { testSystem?: string; project?: string } = {}) => {
    const query = new URLSearchParams(); if (next === 'spools') { query.set('tab', 'spools'); if (filter.testSystem) query.set('testSystem', filter.testSystem); if (filter.project) query.set('project', filter.project); }
    setParams(query);
  };
  const tabs: [Tab, string][] = [['systems', 'Test systems'], ['spools', 'Spools']];
  const keyMove = (event: React.KeyboardEvent) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { const next = tab === 'systems' ? 'spools' : 'systems'; go(next); document.getElementById(`hydrotest-tab-${next}`)?.focus(); } };
  return <div className="page hydrotest-page">
    <div className="page-heading"><div><div className="eyebrow">WELD PILOT · RELEASES</div><h1>Hydrotest release</h1><p>Compose test systems from spools, print the Pressure Test Plan and enter the signed results.</p></div>
      {tab === 'systems' && canRecord('test_systems', 'insert') && <div className="heading-actions"><button className="btn primary" onClick={() => setDialog({ kind: 'system' })}><Plus size={16}/>Add test system</button></div>}</div>
    <section className="panel hydrotest-panel">
      <div className="table-card-top"><div className="table-tabs" role="tablist" aria-label="Hydrotest release" onKeyDown={keyMove}>{tabs.map(([key, title]) => <button key={key} id={`hydrotest-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`hydrotest-panel-${key}`} tabIndex={tab === key ? 0 : -1} className={tab === key ? 'selected' : ''} onClick={() => go(key)}>{title}</button>)}</div></div>
      <div role="tabpanel" id={`hydrotest-panel-${tab}`} aria-labelledby={`hydrotest-tab-${tab}`}>
        {tab === 'systems' ? <SystemList setDialog={setDialog}/> : <SpoolList systemId={systemId} projectId={projectId} setDialog={setDialog}/>}
      </div>
    </section>
    {dialog?.kind === 'system' && <RecordEditor resourceKey="test_systems" record={dialog.record} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'delete' && <DeleteSystem system={dialog.system} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'move' && <MoveDialog spoolIds={dialog.spoolIds} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'release' && <ReleaseDialog system={dialog.system} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'results' && <ResultDialog systemId={systemId} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'history' && <ResultsHistory systemId={systemId} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'documents' && <DocumentsDialog system={dialog.system} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'filter' && <FilterDialog systemId={systemId} projectId={projectId} onApply={filter => { go('spools', filter); setDialog(null); }} onClose={() => setDialog(null)}/>}
  </div>;
}

function SystemList({ setDialog }: { setDialog: (dialog: Dialog) => void }) {
  const { rows, canRecord } = useWorkspace(); const [q, setQ] = useState('');
  const all = activeRows(rows, 'test_systems').sort((a, b) => text(a.name).localeCompare(text(b.name), 'en', { numeric: true }));
  const list = all.filter(system => !q || [system.name, system.accepted || TS_NOT_SET].some(value => text(value).toLowerCase().includes(q.toLowerCase())));
  return <>
    <div className="table-toolbar"><SearchInput value={q} onChange={setQ} placeholder="Search test systems…"/></div>
    {list.length ? <TableScroll><table className="data-table"><caption className="sr-only">Test systems</caption><thead><tr><th scope="col">Name</th><th scope="col">TS accepted by client</th><th scope="col">Options</th></tr></thead><tbody>
      {list.map(system => <tr key={system.id}>
        <td><span className="ts-name"><StateSquare colour={testSystemColour(system)} meaning={colourMeaning(system)}/><Link className="record-link" to={hydrotestSpoolsPath(system.id)}>{text(system.name)}</Link></span></td>
        <td>{text(system.accepted) || <span className="muted">{TS_NOT_SET}</span>}</td>
        <td><div className="hydrotest-options">
          <Link className="icon-btn" to={hydrotestSpoolsPath(system.id)} aria-label={`Spools of test system ${system.name}`} title="Spools of this test system"><FolderOpen size={15}/></Link>
          {canRecord('test_systems', 'edit', system) && <button className="icon-btn" onClick={() => setDialog({ kind: 'system', record: system })} aria-label={`Edit test system ${system.name}`} title="Edit"><Pencil size={15}/></button>}
          {canRecord('test_systems', 'delete', system) && <button className="icon-btn" onClick={() => setDialog({ kind: 'delete', system })} aria-label={`Delete test system ${system.name}`} title="Delete"><Trash2 size={15}/></button>}
        </div></td></tr>)}
    </tbody></table></TableScroll> : <EmptyState title={all.length ? 'No test systems match your search' : 'No test systems yet'} description={all.length ? 'Try another name or clear the search.' : 'Add a test system, then move spools into it from the Spools tab.'}/>}
    <div className="table-footer"><span>{list.length} of {all.length} test system{all.length === 1 ? '' : 's'}</span></div>
  </>;
}

function DeleteSystem({ system, onClose }: { system: Row; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function remove() {
    setBusy(true); setError('');
    try { await post(`/records/test_systems/${system.id}/archive`, { _version: system._version }); await refresh(); notify('Test system deleted.'); onClose(); }
    catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Delete test system" subtitle={text(system.name)} onClose={onClose}>
    <div className="modal-body">{error && <div className="alert error" role="alert">{error}</div>}<p>Are you sure?</p><p className="muted">Its spools are then without a test system.</p></div>
    <div className="modal-footer"><button className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn danger" disabled={busy} onClick={() => void remove()}>{busy ? <Loader2 size={15} className="spin"/> : <Trash2 size={15}/>}Delete</button></div>
  </Modal>;
}

function SpoolList({ systemId, projectId, setDialog }: { systemId: string; projectId: string; setDialog: (dialog: Dialog) => void }) {
  const { rows, label, canRun, canRecord } = useWorkspace(); const [q, setQ] = useState(''); const [checked, setChecked] = useState<string[]>([]);
  const isoOf = useMemo(() => new Map(activeRows(rows, 'isometrics').map(iso => [iso.id, iso])), [rows.isometrics]);
  const systems = useMemo(() => new Map(activeRows(rows, 'test_systems').map(system => [system.id, system])), [rows.test_systems]);
  const projects = useMemo(() => new Map(activeRows(rows, 'projects').map(project => [project.id, project])), [rows.projects]);
  const system = systemId ? systems.get(systemId) : undefined;
  const all = activeRows(rows, 'spools').map(spool => { const iso = isoOf.get(text(spool.isoId)); const id = spoolTestSystemId(spool, iso); return { spool, iso, system: systems.get(id) }; }).filter(entry => entry.iso);
  const list = all.filter(({ spool, iso, system: own }) => (!systemId || own?.id === systemId) && (!projectId || iso!.projectId === projectId)
    && (!q || [spool.name, iso!.isoNo, own?.name, projects.get(text(iso!.projectId))?.internnumber].some(value => text(value).toLowerCase().includes(q.toLowerCase()))))
    .sort((a, b) => text(a.iso!.testPressure).localeCompare(text(b.iso!.testPressure), 'en', { numeric: true }) || text(a.iso!.isoNo).localeCompare(text(b.iso!.isoNo), 'en', { numeric: true }) || text(a.spool.name).localeCompare(text(b.spool.name), 'en', { numeric: true }));
  const selected = list.filter(entry => checked.includes(entry.spool.id)).map(entry => entry.spool.id);
  const mayMove = canRun('hydrotest-move', {}), mayRelease = canRun('hydrotest-release', {}), mayResult = canRun('hydrotest-result', {});
  const filtered = [systemId && (system ? `Test system ${text(system.name)}` : 'Test system unavailable'), projectId && `Project ${label('projects', projectId)}`].filter(Boolean).join(' · ');
  return <>
    <div className="hydrotest-bar" role="toolbar" aria-label="Spools">
      {system && <button className="btn small primary" disabled={!mayRelease} title={mayRelease ? undefined : 'Your profile may not make a hydrotest release.'} onClick={() => setDialog({ kind: 'release', system })}><Play size={14}/>Hydrotest release</button>}
      <button className="btn small" disabled={!selected.length || !mayMove} title={mayMove ? 'Check spools first.' : 'Your profile may not move spools.'} onClick={() => setDialog({ kind: 'move', spoolIds: selected })}><MoveRight size={14}/>Move to test system</button>
      {canRecord('hydrotest_results') && <Dropdown label="Results" className="hydrotest-results-menu" trigger={<span className="btn small"><Check size={14}/>Results<ChevronDown size={13}/></span>}>
        <button disabled={!mayResult} onClick={() => setDialog({ kind: 'results' })}>Enter results</button>
        <button onClick={() => setDialog({ kind: 'history' })}>Results history</button>
      </Dropdown>}
      <button className="btn small" onClick={() => setDialog({ kind: 'filter' })}><SlidersHorizontal size={14}/>Filter</button>
      <span className="hydrotest-bar-status" role="status">{selected.length ? `${selected.length} checked` : filtered}</span>
    </div>
    {system && <div className="hydrotest-system-head"><h2><StateSquare colour={testSystemColour(system)} meaning={colourMeaning(system)}/>{text(system.name)}</h2><button className="btn small" onClick={() => setDialog({ kind: 'documents', system })}><Paperclip size={14}/>Attachments</button></div>}
    <div className="table-toolbar"><SearchInput value={q} onChange={setQ} placeholder="Search spools…"/>{(systemId || projectId) && <Link className="text-link" to="/welding/test_systems?tab=spools"><X size={13}/>Clear filter</Link>}</div>
    {list.length ? <TableScroll><table className="data-table"><caption className="sr-only">Spools with their test system</caption><thead><tr>{SPOOL_COLUMNS.map(column => column === 'Check'
      ? <th key={column} scope="col" className="select-cell"><span className="sr-only">Check</span><input type="checkbox" aria-label="Check all spools" checked={list.length > 0 && list.every(entry => checked.includes(entry.spool.id))} onChange={event => setChecked(event.target.checked ? list.map(entry => entry.spool.id) : [])}/></th>
      : <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>
      {list.map(({ spool, iso, system: own }) => { const facts = spoolFacts(spool, iso, projects.get(text(iso!.projectId))); return <tr key={spool.id} className={checked.includes(spool.id) ? 'row-selected' : ''}>
        <td>{dash(facts[0])}</td>
        <td><span className="ts-name"><StateSquare colour={spoolColour(own)} meaning={colourMeaning(own)}/><Link className="record-link" to={`/workspace/isometrics/${iso!.id}`}>{facts[1]}</Link></span></td>
        {facts.slice(2).map((value, index) => <td key={index}>{dash(value)}</td>)}
        <td>{own ? <button className="record-link" onClick={() => setDialog({ kind: 'documents', system: own })} aria-label={`Attachments of test system ${own.name}`}>{text(own.name)}</button> : <span className="muted">--</span>}</td>
        <td className="select-cell"><input type="checkbox" aria-label={`Check spool ${spool.name} of ${iso!.isoNo}`} checked={checked.includes(spool.id)} onChange={event => setChecked(old => event.target.checked ? [...old, spool.id] : old.filter(id => id !== spool.id))}/></td>
      </tr>; })}
    </tbody></table></TableScroll> : <EmptyState title={all.length ? 'No spools match this filter' : 'No spools yet'} description={all.length ? 'Choose another test system or project, or clear the filter.' : 'Spools appear here once isometrics have spools.'}/>}
    <div className="table-footer"><span>{list.length} of {all.length} spool{all.length === 1 ? '' : 's'}</span></div>
  </>;
}

function FilterDialog({ systemId, projectId, onApply, onClose }: { systemId: string; projectId: string; onApply: (filter: { testSystem: string; project: string }) => void; onClose: () => void }) {
  const { rows, label } = useWorkspace(); const [system, setSystem] = useState(systemId), [project, setProject] = useState(projectId);
  return <Modal title="Filter" onClose={onClose}><form onSubmit={event => { event.preventDefault(); onApply({ testSystem: system, project }); }}>
    <div className="modal-body form-grid">
      <div className="field"><label htmlFor="hydrotest-filter-system">Test system</label><select id="hydrotest-filter-system" value={system} onChange={event => setSystem(event.target.value)}><option value="">All</option>{activeRows(rows, 'test_systems').map(row => <option key={row.id} value={row.id}>{text(row.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="hydrotest-filter-project">Project</label><select id="hydrotest-filter-project" value={project} onChange={event => setProject(event.target.value)}><option value="">All</option>{activeRows(rows, 'projects').map(row => <option key={row.id} value={row.id}>{label('projects', row.id)}</option>)}</select></div>
    </div>
    <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Go</button></div>
  </form></Modal>;
}

/** Shared frame of the small action dialogs: error line, busy state, Cancel and the submit button. */
function ActionModal({ title, subtitle, submit, busy, error, onSubmit, onClose, children, wide }: { title: string; subtitle?: string; submit: string; busy: boolean; error: string; onSubmit: () => void; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <Modal title={title} subtitle={subtitle} onClose={onClose} wide={wide}><form onInvalidCapture={revealInvalidField} onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit(); }} aria-busy={busy}>
    <div className="modal-body">{error && <div className="alert error" role="alert">{error}</div>}{children}</div>
    <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}{submit}</button></div>
  </form></Modal>;
}

function MoveDialog({ spoolIds, onClose }: { spoolIds: string[]; onClose: () => void }) {
  const { rows, refresh, notify } = useWorkspace(); const [systemId, setSystemId] = useState(''); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit() {
    setBusy(true); setError('');
    try { await post('/actions/hydrotest-move', { spoolIds, testSystemId: systemId }); await refresh(); notify(systemId ? 'Spools moved to the test system.' : 'Spools taken off their test system.'); onClose(); }
    catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
  }
  return <ActionModal title="Move to test system" subtitle={`${spoolIds.length} spool${spoolIds.length === 1 ? '' : 's'} checked`} submit="Confirm" busy={busy} error={error} onSubmit={() => void submit()} onClose={onClose}>
    <div className="field"><label htmlFor="hydrotest-move-system">Test system</label><select id="hydrotest-move-system" value={systemId} onChange={event => setSystemId(event.target.value)}><option value="">{NO_TEST_SYSTEM}</option>{activeRows(rows, 'test_systems').map(row => <option key={row.id} value={row.id}>{text(row.name)}</option>)}</select><small className="field-hint">"{NO_TEST_SYSTEM}" takes the spools off their test system.</small></div>
  </ActionModal>;
}

const RELEASE_ACTION = HYDROTEST_ACTIONS.find(action => action.key === 'hydrotest-release')!;
/** "Hydrotest release" of the filtered test system: the dialog's fields, the files to include, then the Pressure Test Plan as PDF. */
function ReleaseDialog({ system, onClose }: { system: Row; onClose: () => void }) {
  const { rows, refresh } = useWorkspace();
  const fields = RELEASE_ACTION.fields.filter(field => !field.hidden && field.name !== 'includeDocuments' && field.name !== 'includeIsometrics');
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ engineerId: activeRows(rows, 'qa_engineers')[0]?.id ?? '', includeIsometrics: false }));
  const [include, setInclude] = useState<string[]>([]); const [busy, setBusy] = useState(false), [error, setError] = useState(''), [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ path: string; recordNo: string } | null>(null);
  const attached = HYDROTEST_DOCUMENT_TYPES.filter(type => activeRows(rows, 'attachments').some(file => file.entityType === 'test_systems' && file.entityId === system.id && file.documentType === type));
  async function submit() {
    setBusy(true); setError(''); setErrors({});
    try {
      const { record } = await post<{ record: Row }>('/actions/hydrotest-release', { ...values, testSystemId: system.id, includeDocuments: include });
      const path = `/pdf/hydrotest-request?requestId=${encodeURIComponent(record.id)}`;
      const blob = await apiBlob(path), url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `Pressure-Test-Plan-${text(system.name).replace(/[^A-Za-z0-9._-]+/g, '-')}-${text(record.recordNo).replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDone({ path, recordNo: text(record.recordNo) }); await refresh().catch(() => undefined);
    } catch (problem) { setError((problem as Error).message); setErrors((problem as ApiError).fields || {}); } finally { setBusy(false); }
  }
  if (done) return <Modal title="Hydrotest release" subtitle={text(system.name)} onClose={onClose}><div className="modal-body"><div className="alert success" role="status">The Pressure Test Plan {done.recordNo} was downloaded. <a className="text-link" href={apiUrl(done.path)} target="_blank" rel="noreferrer">Open in a new tab<ExternalLink size={13} aria-hidden="true"/></a></div></div><div className="modal-footer"><button className="btn" onClick={onClose}>Close</button></div></Modal>;
  return <ActionModal title="Hydrotest release" subtitle={text(system.name)} submit="Confirm" busy={busy} error={error} onSubmit={() => void submit()} onClose={onClose} wide>
    <div className="form-grid">{fields.map(field => <FieldInput key={field.name} field={field} value={values[field.name]} values={values} error={errors[field.name]} onChange={value => setValues(old => ({ ...old, [field.name]: value }))}/>)}</div>
    <fieldset className="field hydrotest-include"><legend>Include files in hydrotest release</legend>
      <label><input type="checkbox" checked={values.includeIsometrics === true} onChange={event => setValues(old => ({ ...old, includeIsometrics: event.target.checked }))}/>Include isometric(s)</label>
      {attached.map(type => <label key={type}><input type="checkbox" checked={include.includes(type)} onChange={event => setInclude(old => event.target.checked ? [...old, type] : old.filter(item => item !== type))}/>{type}</label>)}
      {!attached.length && <small className="field-hint">Documents attached to the test system (Attachments) can be included here.</small>}
    </fieldset>
  </ActionModal>;
}

/** "Enter results": test system, the signed PDF document(s) and "Accepted?". */
function ResultDialog({ systemId, onClose }: { systemId: string; onClose: () => void }) {
  const { rows, refresh, notify } = useWorkspace(); const systems = activeRows(rows, 'test_systems');
  const [system, setSystem] = useState(systemId || systems[0]?.id || ''), [accepted, setAccepted] = useState(false), [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit() {
    if (files.some(file => !isPdfName(file.name))) { setError(PDF_ONLY); return; }
    setBusy(true); setError('');
    try {
      const { record } = await post<{ record: Row }>('/actions/hydrotest-result', { testSystemId: system, accepted });
      for (const file of files) { const body = new FormData(); body.set('file', file); body.set('entityType', 'hydrotest_results'); body.set('entityId', record.id); body.set('documentType', 'Hydrotest result'); await api('/files', { method: 'POST', body }); }
      await refresh(); notify(accepted ? 'Result added; the test system is accepted.' : 'Result added.'); onClose();
    } catch (problem) { await refresh().catch(() => undefined); setError((problem as Error).message); } finally { setBusy(false); }
  }
  return <ActionModal title="Enter results" submit="Add" busy={busy} error={error} onSubmit={() => void submit()} onClose={onClose}>
    {!systems.length ? <p className="muted">Add a test system first.</p> : <>
      <div className="field"><label htmlFor="hydrotest-result-system">Test system</label><select id="hydrotest-result-system" required value={system} onChange={event => setSystem(event.target.value)}>{systems.map(row => <option key={row.id} value={row.id}>{text(row.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="hydrotest-result-file">Document</label><input id="hydrotest-result-file" type="file" accept=".pdf" multiple onChange={event => setFiles([...(event.target.files || [])])}/><small className="field-hint">{PDF_ONLY} Up to 20 MB each.</small></div>
      <div className="field checkbox-field"><label htmlFor="hydrotest-result-accepted"><input id="hydrotest-result-accepted" type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)}/><span>Accepted?</span></label></div>
    </>}
  </ActionModal>;
}

/** "Results history": every entered result with its files; the filtered test system's, or all. */
function ResultsHistory({ systemId, onClose }: { systemId: string; onClose: () => void }) {
  const { rows, label, canRun, refresh, notify } = useWorkspace(); const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const results = activeRows(rows, 'hydrotest_results').filter(row => !systemId || row.testSystemId === systemId).sort((a, b) => text(b._createdAt).localeCompare(text(a._createdAt)));
  const files = (id: string) => activeRows(rows, 'attachments').filter(file => file.entityType === 'hydrotest_results' && file.entityId === id);
  async function remove(result: Row) {
    setBusy(result.id); setError('');
    try { await post('/actions/hydrotest-result-delete', { resultId: result.id }); await refresh(); notify('Result deleted.'); } catch (problem) { setError((problem as Error).message); } finally { setBusy(''); }
  }
  return <Modal title="Results" subtitle={systemId ? label('test_systems', systemId) : 'All test systems'} onClose={onClose} wide>
    <div className="modal-body">{error && <div className="alert error" role="alert">{error}</div>}
      {rows.hydrotest_results === undefined ? <p className="muted">Your profile does not include hydrotest results.</p> : results.length ? <TableScroll><table className="data-table"><caption className="sr-only">Results history</caption><thead><tr><th scope="col">Test system</th><th scope="col">File</th><th scope="col">Result</th><th scope="col">Options</th></tr></thead><tbody>
        {results.map(result => <tr key={result.id}><td>{label('test_systems', result.testSystemId)}<small className="muted hydrotest-sub">{formatDate(result.date)}</small></td>
          <td>{files(result.id).length ? <ul className="hydrotest-file-list">{files(result.id).map(file => <li key={file.id}><a className="text-link" target="_blank" rel="noopener noreferrer" href={apiUrl(`/files/${file.id}`)}><Download size={12}/>{text(file.name)}</a></li>)}</ul> : <span className="muted">No file</span>}</td>
          <td>{result.accepted === true ? <span className="check-value hydrotest-accepted"><Check size={14}/>Accepted</span> : <span className="muted">Not accepted</span>}</td>
          <td>{canRun('hydrotest-result-delete', {}) && <button className="icon-btn" disabled={Boolean(busy)} onClick={() => void remove(result)} aria-label={`Delete result of ${label('test_systems', result.testSystemId)} from ${formatDate(result.date)}`}>{busy === result.id ? <Loader2 size={15} className="spin"/> : <Trash2 size={15}/>}</button>}</td></tr>)}
      </tbody></table></TableScroll> : <p className="muted">No results entered yet.</p>}</div>
    <div className="modal-footer"><button className="btn" onClick={onClose}>Cancel</button></div>
  </Modal>;
}

/** "Attachments" of a test system: custom documents (PDF only, several at once), "Check for delete" and Save. */
function DocumentsDialog({ system, onClose }: { system: Row; onClose: () => void }) {
  const { rows, canRecord, canRun, refresh, notify } = useWorkspace();
  const [type, setType] = useState(HYDROTEST_DOCUMENT_TYPES[0]), [files, setFiles] = useState<File[]>([]), [remove, setRemove] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const list = activeRows(rows, 'attachments').filter(item => item.entityType === 'test_systems' && item.entityId === system.id)
    .sort((a, b) => HYDROTEST_DOCUMENT_TYPES.indexOf(text(a.documentType)) - HYDROTEST_DOCUMENT_TYPES.indexOf(text(b.documentType)) || text(a._createdAt).localeCompare(text(b._createdAt)));
  const mayUpload = canRecord('test_systems', 'import', system), mayDelete = canRun('hydrotest-documents', {});
  async function save() {
    if (files.some(file => !isPdfName(file.name))) { setError(PDF_ONLY); return; }
    if (!files.length && !remove.length) { onClose(); return; }
    setBusy(true); setError('');
    try {
      for (const file of files) { const body = new FormData(); body.set('file', file); body.set('entityType', 'test_systems'); body.set('entityId', system.id); body.set('documentType', type); await api('/files', { method: 'POST', body }); }
      if (remove.length) await post('/actions/hydrotest-documents', { testSystemId: system.id, deleteIds: remove });
      await refresh(); notify('Attachments saved.'); onClose();
    } catch (problem) { await refresh().catch(() => undefined); setError((problem as Error).message); } finally { setBusy(false); }
  }
  return <ActionModal title="Attachments" subtitle={text(system.name)} submit="Save" busy={busy} error={error} onSubmit={() => void save()} onClose={onClose} wide>
    {mayUpload && <div className="form-grid">
      <div className="field"><label htmlFor="hydrotest-doc-type">Custom document type</label><select id="hydrotest-doc-type" value={type} onChange={event => setType(event.target.value)}>{HYDROTEST_DOCUMENT_TYPES.map(item => <option key={item}>{item}</option>)}</select></div>
      <div className="field"><label htmlFor="hydrotest-doc-file">Document</label><input id="hydrotest-doc-file" type="file" accept=".pdf" multiple onChange={event => setFiles([...(event.target.files || [])])}/><small className="field-hint">{PDF_ONLY} Several files at once; up to 20 MB each.</small></div>
    </div>}
    {list.length ? <TableScroll><table className="data-table"><caption className="sr-only">Documents of {text(system.name)}</caption><thead><tr><th scope="col">Custom document type</th><th scope="col">File</th>{mayDelete && <th scope="col" className="select-cell">Check for delete</th>}</tr></thead><tbody>
      {list.map(file => <tr key={file.id}><td>{text(file.documentType)}</td><td><a className="text-link" target="_blank" rel="noopener noreferrer" href={apiUrl(`/files/${file.id}`)}><FileText size={13}/>{text(file.name)}</a><small className="muted hydrotest-sub">{formatNumber(Number(file.size) / 1024)} KB · {formatDate(file._createdAt)}</small></td>
        {mayDelete && <td className="select-cell"><input type="checkbox" aria-label={`Check ${file.name} for delete`} checked={remove.includes(file.id)} onChange={event => setRemove(old => event.target.checked ? [...old, file.id] : old.filter(id => id !== file.id))}/></td>}</tr>)}
    </tbody></table></TableScroll> : <p className="muted">No documents attached yet.</p>}
    {mayDelete && list.length > 0 && <small className="field-hint">Check for delete, then Save.</small>}
  </ActionModal>;
}
