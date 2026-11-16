import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ClipboardCheck, FileText, Download, Loader2, Pencil, Plus, Paperclip, ListChecks, MoveRight } from 'lucide-react';
import { HYDROTEST_DOCUMENT_TYPES, TS_NOT_SET, hydrotestState } from '../shared/hydrotest.ts';
import type { Row } from '../shared/types.ts';
import { api, apiUrl, formatDate, formatNumber } from './api.ts';
import { useWorkspace, activeRows } from './context.tsx';
import { Badge, EmptyState, Modal, SearchInput, TableScroll, revealInvalidField } from './components.tsx';
import { RecordEditor, WorkflowDialog } from './dialogs.tsx';
import { HydrotestPdfButton } from './pdf-documents.tsx';

type Tab = 'systems' | 'spools';
type Dialog =
  | { kind: 'editor'; resource: 'test_systems' | 'hydrotest_requests'; record?: Row; defaults?: Record<string, unknown> }
  | { kind: 'action'; key: 'hydrotest-move' | 'hydrotest-result'; defaults: Record<string, unknown> }
  | { kind: 'documents'; request: Row };

const accepted = (system: Row) => String(system.accepted || '');
const AcceptedBadge = ({ system }: { system: Row }) => accepted(system) ? <Badge color={accepted(system) === 'Approved' ? 'green' : 'neutral'}>{accepted(system)}</Badge> : <span className="muted">{TS_NOT_SET}</span>;

/**
 * Releases → Hydrotest release (Weld Pilot). Tab "Test systems": the systems with the client's acceptance; opening one
 * lists its isometrics (check some to move them to another test system) and its hydrotest requests. Tab "Spools":
 * every spool with its isometric and test system, filtered by test system and project.
 */
export function HydrotestRelease() {
  const { rows, canRecord } = useWorkspace();
  const [tab, setTab] = useState<Tab>('systems'); const [openId, setOpenId] = useState(''); const [dialog, setDialog] = useState<Dialog | null>(null);
  if (!canRecord('test_systems')) return <EmptyState title="You do not have rights to open this page." description="Ask an administrator to add the Test systems area to your profile."/>;
  const systems = activeRows(rows, 'test_systems'); const open = systems.find(system => system.id === openId);
  const tabs: [Tab, string][] = [['systems', 'Test systems'], ['spools', 'Spools']];
  const keyMove = (event: React.KeyboardEvent) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { const next = tab === 'systems' ? 'spools' : 'systems'; setTab(next); setOpenId(''); document.getElementById(`hydrotest-tab-${next}`)?.focus(); } };
  return <div className="page hydrotest-page">
    <div className="page-heading"><div><div className="eyebrow">WELD PILOT · RELEASES</div><h1>Hydrotest release</h1><p>Group isometrics into test systems, record each pressure test and follow the client’s acceptance.</p></div>
      {tab === 'systems' && !open && canRecord('test_systems', 'insert') && <div className="heading-actions"><button className="btn primary" onClick={() => setDialog({ kind: 'editor', resource: 'test_systems' })}><Plus size={16}/>Add test system</button></div>}</div>
    <section className="panel hydrotest-panel">
      <div className="table-card-top"><div className="table-tabs" role="tablist" aria-label="Hydrotest release" onKeyDown={keyMove}>{tabs.map(([key, title]) => <button key={key} id={`hydrotest-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`hydrotest-panel-${key}`} tabIndex={tab === key ? 0 : -1} className={tab === key ? 'selected' : ''} onClick={() => { setTab(key); setOpenId(''); }}>{title}</button>)}</div></div>
      <div role="tabpanel" id={`hydrotest-panel-${tab}`} aria-labelledby={`hydrotest-tab-${tab}`}>
        {tab === 'systems' && (open ? <TestSystemView system={open} onBack={() => setOpenId('')} setDialog={setDialog}/> : <SystemList onOpen={setOpenId} setDialog={setDialog}/>)}
        {tab === 'spools' && <SpoolList/>}
      </div>
    </section>
    {dialog?.kind === 'editor' && <RecordEditor resourceKey={dialog.resource} record={dialog.record} defaults={dialog.defaults} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'action' && <WorkflowDialog actionKey={dialog.key} defaults={dialog.defaults} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'documents' && <HydrotestDocuments request={dialog.request} onClose={() => setDialog(null)}/>}
  </div>;
}

function SystemList({ onOpen, setDialog }: { onOpen: (id: string) => void; setDialog: (dialog: Dialog) => void }) {
  const { rows, canRecord, label } = useWorkspace(); const [q, setQ] = useState('');
  const all = activeRows(rows, 'test_systems'); const list = all.filter(system => !q || [system.name, system.accepted, label('projects', system.projectId)].some(value => String(value || '').toLowerCase().includes(q.toLowerCase())));
  const count = (id: string) => activeRows(rows, 'isometrics').filter(iso => iso.testSystemId === id).length;
  return <>
    <div className="table-toolbar"><SearchInput value={q} onChange={setQ} placeholder="Search test systems…"/></div>
    {list.length ? <TableScroll><table className="data-table"><caption className="sr-only">Test systems</caption><thead><tr><th scope="col">Name</th><th scope="col">TS accepted by client</th><th scope="col">Options</th></tr></thead><tbody>
      {list.map(system => <tr key={system.id}><td><button className="record-link" onClick={() => onOpen(system.id)}>{String(system.name)}</button><small className="muted hydrotest-sub">{system.projectId ? label('projects', system.projectId) : 'All projects'} · {count(system.id)} isometric{count(system.id) === 1 ? '' : 's'}</small></td>
        <td><AcceptedBadge system={system}/></td>
        <td><div className="hydrotest-options"><button className="btn small" onClick={() => onOpen(system.id)} aria-label={`Open test system ${system.name}`}><ListChecks size={14}/>Open</button>{canRecord('test_systems', 'edit', system) && <button className="btn small" onClick={() => setDialog({ kind: 'editor', resource: 'test_systems', record: system })} aria-label={`Edit test system ${system.name}`}><Pencil size={14}/>Edit</button>}</div></td></tr>)}
    </tbody></table></TableScroll> : <EmptyState title={all.length ? 'No test systems match your search' : 'No test systems yet'} description={all.length ? 'Try another name or clear the search.' : 'Add a test system, then move isometrics into it.'}/>}
    <div className="table-footer"><span>{list.length} of {all.length} test system{all.length === 1 ? '' : 's'}</span></div>
  </>;
}

function TestSystemView({ system, onBack, setDialog }: { system: Row; onBack: () => void; setDialog: (dialog: Dialog) => void }) {
  const { rows, canRecord, canRun, label } = useWorkspace(); const [checked, setChecked] = useState<string[]>([]);
  const isos = activeRows(rows, 'isometrics').filter(iso => iso.testSystemId === system.id);
  const requests = activeRows(rows, 'hydrotest_requests').filter(request => request.testSystemId === system.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b._createdAt).localeCompare(String(a._createdAt)));
  const state = (iso: Row) => hydrotestState(iso, { test_systems: rows.test_systems ?? null, hydrotest_requests: rows.hydrotest_requests ?? null, releases: rows.releases ?? null });
  const selected = isos.filter(iso => checked.includes(iso.id)).map(iso => iso.id);
  const mayMove = canRun('hydrotest-move', {});
  const completed = isos.filter(iso => state(iso).completed).length;
  return <div className="hydrotest-view">
    <div className="hydrotest-head"><button className="btn small" onClick={onBack}><ArrowLeft size={14}/>All test systems</button>
      <div><h2>{String(system.name)}</h2><dl className="hydrotest-facts"><div><dt>Accepted by client</dt><dd><AcceptedBadge system={system}/></dd></div><div><dt>Project</dt><dd>{system.projectId ? label('projects', system.projectId) : 'All projects'}</dd></div><div><dt>Test medium</dt><dd>{String(system.medium || '—')}</dd></div><div><dt>Test pressure</dt><dd>{String(system.pressure || '—')}</dd></div><div><dt>Hydrotest completed</dt><dd>{system.accepted === 'Testing not applicable' ? 'Not applicable' : `${completed} of ${isos.length}`}</dd></div></dl></div></div>

    <h3 className="hydrotest-title">Isometrics <span className="count-pill">{isos.length}</span></h3>
    <div className="logistics-actions"><button className="btn small primary" disabled={!selected.length || !mayMove} onClick={() => setDialog({ kind: 'action', key: 'hydrotest-move', defaults: { isoIds: selected, testSystemId: '' } })}><MoveRight size={15}/>Move isometric(s) to test system</button><span role="status">{selected.length ? `${selected.length} checked` : mayMove ? 'Check isometrics to move them to another test system.' : 'Your profile may not move isometrics.'}</span></div>
    {isos.length ? <TableScroll><table className="data-table"><caption className="sr-only">Isometrics of {String(system.name)}</caption><thead><tr><th className="select-cell" scope="col"><input type="checkbox" aria-label="Check all isometrics of this test system" checked={checked.length > 0 && isos.every(iso => checked.includes(iso.id))} onChange={event => setChecked(event.target.checked ? isos.map(iso => iso.id) : [])}/></th><th scope="col">Project</th><th scope="col">ISO</th><th scope="col">Piping class</th><th scope="col">Test pressure</th><th scope="col">Hydrotest</th></tr></thead><tbody>
      {isos.map(iso => { const s = state(iso); return <tr key={iso.id} className={checked.includes(iso.id) ? 'row-selected' : ''}><td className="select-cell"><input type="checkbox" aria-label={`Check isometric ${iso.isoNo}`} checked={checked.includes(iso.id)} onChange={event => setChecked(old => event.target.checked ? [...old, iso.id] : old.filter(id => id !== iso.id))}/></td><td>{label('projects', iso.projectId)}</td><td>{String(iso.isoNo)}</td><td>{String(iso.pipingClass || '—')}</td><td>{String(iso.testPressure || '—')}</td><td>{!s.inScope ? <Badge color="neutral">Not applicable</Badge> : s.completed ? <Badge color="green">Completed</Badge> : <Badge color="amber">Open</Badge>}</td></tr>; })}
    </tbody></table></TableScroll> : <EmptyState title="No isometrics in this test system" description="Open another test system, check its isometrics and move them here."/>}

    <h3 className="hydrotest-title">Hydrotest requests <span className="count-pill">{requests.length}</span></h3>
    {canRecord('hydrotest_requests', 'insert') && <div className="logistics-actions"><button className="btn small" onClick={() => setDialog({ kind: 'editor', resource: 'hydrotest_requests', defaults: { testSystemId: system.id, testMedium: system.medium || '', requiredPressure: system.pressure || '', pipingClass: isos[0]?.pipingClass || '' } })}><Plus size={15}/>Add hydrotest request</button></div>}
    {rows.hydrotest_requests === undefined ? <EmptyState title="Hydrotest requests are not available" description="Your profile does not include hydrotest requests."/> : requests.length ? <TableScroll><table className="data-table"><caption className="sr-only">Hydrotest requests of {String(system.name)}</caption><thead><tr><th scope="col">Test record no.</th><th scope="col">Date</th><th scope="col">Required test pressure</th><th scope="col">Actual test pressure</th><th scope="col">Result</th><th scope="col">Options</th></tr></thead><tbody>
      {requests.map(request => { const docs = activeRows(rows, 'attachments').filter(file => file.entityType === 'hydrotest_requests' && file.entityId === request.id).length; return <tr key={request.id}><td>{String(request.recordNo)}</td><td>{formatDate(request.date)}</td><td>{String(request.requiredPressure || '—')}</td><td>{String(request.actualPressure || '—')}</td><td>{request.result ? <Badge color={request.result === 'Passed' ? 'green' : 'red'}>{String(request.result)}</Badge> : <Badge color="amber">Not recorded</Badge>}</td>
        <td><div className="hydrotest-options">{canRecord('hydrotest_requests', 'edit', request) && <button className="btn small" onClick={() => setDialog({ kind: 'editor', resource: 'hydrotest_requests', record: request })} aria-label={`Edit hydrotest request ${request.recordNo}`}><Pencil size={14}/>Edit</button>}
          {canRun('hydrotest-result', {}) && <button className="btn small" onClick={() => setDialog({ kind: 'action', key: 'hydrotest-result', defaults: { requestId: request.id, result: request.result || 'Passed', actualPressure: request.actualPressure || '', date: request.date || undefined, testStart: request.testStart || '', testEnd: request.testEnd || '' } })} aria-label={`Record result of hydrotest request ${request.recordNo}`}><ClipboardCheck size={14}/>Record result</button>}
          <button className="btn small" onClick={() => setDialog({ kind: 'documents', request })} aria-label={`Documents of hydrotest request ${request.recordNo}`}><Paperclip size={14}/>Documents{docs ? ` (${docs})` : ''}</button><HydrotestPdfButton request={request}/></div></td></tr>; })}
    </tbody></table></TableScroll> : <EmptyState title="No hydrotest request yet" description="Add a request to record the equipment, the test pressure and the result for this test system."/>}
  </div>;
}

function SpoolList() {
  const { rows, label } = useWorkspace(); const [systemId, setSystemId] = useState(''); const [projectId, setProjectId] = useState(''); const [q, setQ] = useState('');
  const isoOf = useMemo(() => new Map(activeRows(rows, 'isometrics').map(iso => [iso.id, iso])), [rows.isometrics]);
  const all = activeRows(rows, 'spools').map(spool => ({ spool, iso: isoOf.get(String(spool.isoId)) })).filter((entry): entry is { spool: Row; iso: Row } => Boolean(entry.iso));
  const list = all.filter(({ spool, iso }) => (!systemId || (systemId === '-' ? !iso.testSystemId : iso.testSystemId === systemId)) && (!projectId || iso.projectId === projectId) && (!q || [spool.name, iso.isoNo].some(value => String(value || '').toLowerCase().includes(q.toLowerCase()))));
  return <>
    <div className="filters-panel hydrotest-filters" style={{ display: 'grid' }}>
      <div className="field"><label htmlFor="hydrotest-spool-system">Test system</label><select id="hydrotest-spool-system" value={systemId} onChange={event => setSystemId(event.target.value)}><option value="">All test systems</option><option value="-">No test system</option>{activeRows(rows, 'test_systems').map(system => <option key={system.id} value={system.id}>{String(system.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="hydrotest-spool-project">Project</label><select id="hydrotest-spool-project" value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">All projects</option>{activeRows(rows, 'projects').map(project => <option key={project.id} value={project.id}>{label('projects', project.id)}</option>)}</select></div>
      <button className="text-link" onClick={() => { setSystemId(''); setProjectId(''); setQ(''); }}>Reset</button></div>
    <div className="table-toolbar"><SearchInput value={q} onChange={setQ} placeholder="Search spool or isometric…"/></div>
    {list.length ? <TableScroll><table className="data-table"><caption className="sr-only">Spools with their test system</caption><thead><tr><th scope="col">Project</th><th scope="col">ISO</th><th scope="col">Spool</th><th scope="col">Diameter</th><th scope="col">Test system</th></tr></thead><tbody>
      {list.map(({ spool, iso }) => <tr key={spool.id}><td>{label('projects', iso.projectId)}</td><td>{String(iso.isoNo)}</td><td>{String(spool.name)}</td><td>{String(spool.diameter || '—')}</td><td>{iso.testSystemId ? label('test_systems', iso.testSystemId) : <span className="muted">No test system</span>}</td></tr>)}
    </tbody></table></TableScroll> : <EmptyState title={all.length ? 'No spools match these filters' : 'No spools yet'} description={all.length ? 'Choose another test system or project.' : 'Spools appear here once isometrics have spools.'}/>}
    <div className="table-footer"><span>{list.length} of {all.length} spool{all.length === 1 ? '' : 's'}</span></div>
  </>;
}

/** Custom hydrotest documents: a file with one of the six document types, attached to the request. */
function HydrotestDocuments({ request, onClose }: { request: Row; onClose: () => void }) {
  const { rows, canRecord, refresh, notify } = useWorkspace();
  const [type, setType] = useState(HYDROTEST_DOCUMENT_TYPES[0]); const [file, setFile] = useState<File | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const files = activeRows(rows, 'attachments').filter(item => item.entityType === 'hydrotest_requests' && item.entityId === request.id);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file) { setError('Choose a file to attach.'); return; }
    setBusy(true); setError('');
    try { const body = new FormData(); body.set('file', file); body.set('entityType', 'hydrotest_requests'); body.set('entityId', request.id); body.set('documentType', type); await api('/files', { method: 'POST', body }); await refresh(); notify('Document attached.'); setFile(null); (event.target as HTMLFormElement).reset(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={`Documents · ${String(request.recordNo)}`} subtitle="Punch lists, pressure test records and other files of this hydrotest." onClose={onClose}>
    <div className="modal-body">{error && <div className="alert error" role="alert">{error}</div>}
      {files.length ? <ul className="hydrotest-files">{files.map(item => <li key={item.id}><a className="attachment-row" href={apiUrl(`/files/${item.id}`)}><FileText size={21}/><div><strong>{String(item.name)}</strong><small>{String(item.documentType)} · {formatNumber(Number(item.size) / 1024)} KB · {formatDate(item._createdAt)}</small></div><Download size={17}/></a></li>)}</ul> : <p className="muted">No documents attached yet.</p>}
      {canRecord('hydrotest_requests', 'import', request) && <form onInvalidCapture={revealInvalidField} onSubmit={event => void submit(event)} className="hydrotest-upload">
        <div className="field"><label htmlFor="hydrotest-doc-type">Document type</label><select id="hydrotest-doc-type" value={type} onChange={event => setType(event.target.value)}>{HYDROTEST_DOCUMENT_TYPES.map(item => <option key={item}>{item}</option>)}</select></div>
        <div className="field"><label htmlFor="hydrotest-doc-file">File</label><input id="hydrotest-doc-file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.docx,.txt" onChange={event => setFile(event.target.files?.[0] || null)}/><small>PDF, images, CSV, Excel, Word or text · up to 20 MB</small></div>
        <button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}Attach document</button></form>}</div>
    <div className="modal-footer"><button className="btn" onClick={onClose}>Close</button></div>
  </Modal>;
}
