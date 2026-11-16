import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, Archive, ChevronLeft, ChevronRight, Download, FileText, Loader2, Lock, Pencil, Plus, Printer, RefreshCw, RotateCcw, Unlock } from 'lucide-react';
import { useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { ACTIONS } from './catalog.ts';
import { post, formatDate, formatNumber } from './api.ts';
import { Badge, EmptyState, FieldInput, Modal, SearchInput, TableScroll } from './components.tsx';
import { RecordEditor } from './dialogs.tsx';
import { ArchiveRecordDialog } from './archive-record.tsx';
import { currentRevision } from '../shared/revisions.ts';
import { priorityLabel } from '../shared/priority.ts';
import { fwpAccepts, fwpListRows, phaseState, releaseArchiveRows, releaseListRows, storedSignatureTitles, toCsv, PHASE_LOCATION, type PhaseState, type ReleaseCheckInput, type ReleaseListRow, type ReleasePhase } from '../shared/releases.ts';
import type { Row } from '../shared/types.ts';

const today = () => new Date().toISOString().slice(0, 10);
const text = (value: unknown) => String(value ?? '').trim();
const yesNo = (value: unknown) => value ? 'Yes' : 'No';
const PAGE_SIZE = 25;
const time = (value: unknown) => { const date = new Date(text(value)); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-GB'); };

/** Saves rows as a spreadsheet-friendly CSV (UTF-8 with a byte order mark so Excel reads the characters). */
function downloadCsv(name: string, header: string[], lines: unknown[][]) {
  const url = URL.createObjectURL(new Blob(['﻿', toCsv(header, lines)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

function Pager({ page, pages, onPage, total, noun }: { page: number; pages: number; onPage: (page: number) => void; total: number; noun: string }) {
  return <div className="table-footer"><span role="status" aria-live="polite">{total ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)}` : '0'} of {total} {noun}</span>
    <div><button className="icon-btn" type="button" disabled={page === 0} aria-label="Previous page" onClick={() => onPage(page - 1)}><ChevronLeft size={17}/></button><span>{page + 1} / {pages}</span><button className="icon-btn" type="button" disabled={page >= pages - 1} aria-label="Next page" onClick={() => onPage(page + 1)}><ChevronRight size={17}/></button></div></div>;
}

function Restricted({ what }: { what: string }) {
  return <div className="page releases-page" role="alert"><EmptyState title="This area is restricted" description={`Your permission profile does not include ${what}.`}/></div>;
}

/** What the release pages and the status card read: the rows of the active main project, and whether punch items are readable. */
function useReleaseSource() {
  const { rows, canRecord } = useWorkspace();
  const canWelds = canRecord('welds');
  return useMemo(() => ({
    isometrics: rows.isometrics || [], projects: rows.projects || [], spools: canRecord('spools') ? rows.spools || [] : [],
    welds: canWelds ? rows.welds || [] : [], weldTypes: rows.weld_types || [], results: canRecord('inspection_results') ? rows.inspection_results || [] : [],
    releases: rows.releases || [], punch: canRecord('punchlists') ? rows.punchlists || [] : null,
    /** Without the weld register the pages cannot judge a phase; the server still does. */
    limited: !canWelds,
  }), [rows, canWelds, canRecord]);
}

// ----- Prefab release and Field release ---------------------------------------------------------------------------

/** The route of `/…/releases`: Prefab release, Field release or the request archive, chosen by `?view=`. */
export function ReleasesPage() {
  const [params] = useSearchParams(); const { canRecord } = useWorkspace(); const view = params.get('view');
  if (!canRecord('releases')) return <Restricted what="releases"/>;
  if (view === 'archive') return <RequestArchive/>;
  return <ReleaseList key={view === 'field' ? 'Field' : 'Prefab'} type={view === 'field' ? 'Field' : 'Prefab'}/>;
}

function ReleaseList({ type }: { type: ReleasePhase }) {
  const { rows, label, canRun, refresh, notify } = useWorkspace(); const source = useReleaseSource();
  const [show, setShow] = useState<'hide' | 'show'>('hide'), [projectId, setProjectId] = useState(''), [itpNo, setItpNo] = useState('');
  const [selected, setSelected] = useState<string[]>([]), [page, setPage] = useState(0), [releasing, setReleasing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const list = useMemo(() => releaseListRows(type, source, { show, projectId, itpNo }), [type, source, show, projectId, itpNo]);
  const allowed = canRun('release', { type });
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)), current = Math.min(page, pages - 1), shown = list.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const selectable = (entry: ReleaseListRow) => allowed && !entry.release && entry.check.ready;
  const selectableShown = shown.filter(selectable);
  const checked = list.filter(entry => selected.includes(entry.iso.id) && selectable(entry));
  const counts = { ready: list.filter(entry => !entry.release && entry.check.ready).length, blocked: list.filter(entry => !entry.release && !entry.check.ready).length, released: list.filter(entry => entry.release).length };
  const title = `${type} release`, noun = type === 'Prefab' ? 'shop' : 'field';
  useEffect(() => { setSelected(old => old.filter(id => list.some(entry => entry.iso.id === id && selectable(entry)))); }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = () => { setPage(0); setSelected([]); };
  async function reload() { setBusy(true); setError(''); try { await refresh(); notify('The list is up to date.'); } catch (failure) { setError((failure as Error).message || 'The list could not be refreshed.'); } finally { setBusy(false); } }

  return <div className="page releases-page" aria-busy={busy}>
    <div className="page-heading"><div><div className="eyebrow">WELD PILOT · RELEASES</div><h1>{title}<span className="heading-count">{list.length}</span></h1>
      <p>Isometrics of the active main project. {type === 'Prefab' ? 'Release the prefab once the shop welds are complete.' : 'Complete the field work once the field welds are complete and the prefab is released.'}</p></div>
      <div className="heading-actions"><button className="btn" type="button" onClick={() => void reload()} disabled={busy}>{busy ? <Loader2 size={16} className="spin"/> : <RefreshCw size={16}/>}Refresh</button>
        {allowed && <button className="btn primary" type="button" disabled={!checked.length} onClick={() => setReleasing(true)}>Release checked{checked.length ? ` (${checked.length})` : ''}</button>}</div></div>
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    {source.limited && <div className="alert" role="status"><AlertCircle size={18}/><span>Your profile cannot read the weld register, so the {noun} welds are not checked here. The server checks them when you release.</span></div>}
    <section className="table-card" aria-label={`${title} list`}>
      <div className="release-filters filters-panel" role="search">
        <div className="field"><label htmlFor="release-show">Show</label><select id="release-show" value={show} onChange={event => { setShow(event.target.value as 'hide' | 'show'); reset(); }}><option value="hide">Hide released</option><option value="show">Show released</option></select></div>
        <div className="field"><label htmlFor="release-project">Project</label><select id="release-project" value={projectId} onChange={event => { setProjectId(event.target.value); reset(); }}><option value="">All projects</option>{(rows.projects || []).filter(project => !project._archived).map(project => <option key={project.id} value={project.id}>{label('projects', project.id)}</option>)}</select></div>
        <div className="field"><label htmlFor="release-itp">ITP No</label><input id="release-itp" type="search" value={itpNo} placeholder="ITP number or ITP number 2" onChange={event => { setItpNo(event.target.value); reset(); }}/></div>
        <p className="release-counts" role="status" aria-live="polite"><strong>{counts.ready}</strong> ready · <strong>{counts.blocked}</strong> blocked{show === 'show' && <> · <strong>{counts.released}</strong> released</>}</p>
      </div>
      <TableScroll><table className="data-table release-table" aria-label={`${title} isometrics`}>
        <thead><tr>
          <th className="select-cell"><input type="checkbox" aria-label="Select all ready isometrics on this page" disabled={!selectableShown.length} ref={input => { if (input) input.indeterminate = selectableShown.some(entry => selected.includes(entry.iso.id)) && !selectableShown.every(entry => selected.includes(entry.iso.id)); }}
            checked={selectableShown.length > 0 && selectableShown.every(entry => selected.includes(entry.iso.id))} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, ...selectableShown.map(entry => entry.iso.id)])] : old.filter(id => !selectableShown.some(entry => entry.iso.id === id)))}/></th>
          {['Project', 'ISO', 'IRN', 'Rev. no.', 'ITP No', 'ITP No 2', 'Spools', 'Piping class', 'Drawing no. 1', 'NoBo', 'X Ray %', 'PWHT', 'Priority'].map(column => <th key={column} scope="col">{column}</th>)}<th scope="col" className="release-status-col">{type} status</th></tr></thead>
        <tbody>{shown.map(entry => { const { iso, release, check } = entry; return <tr key={iso.id} className={release ? 'released' : check.ready ? 'ready' : 'blocked'}>
          <td className="select-cell"><input type="checkbox" aria-label={`Select ${text(iso.isoNo)} for ${type.toLowerCase()} release`} disabled={!selectable(entry)} checked={selected.includes(iso.id)} onChange={event => setSelected(old => event.target.checked ? [...old, iso.id] : old.filter(id => id !== iso.id))}/></td>
          <td>{entry.project ? label('projects', entry.project.id) : '—'}</td>
          <td><Link className="record-link" to={`/workspace/isometrics/${iso.id}`}>{text(iso.isoNo) || '—'}</Link></td>
          <td>{text(iso.irn) || '—'}</td><td className="tabular">{currentRevision(rows, iso.id, 'ISO')}</td><td>{text(iso.itpNo) || '—'}</td><td>{text(iso.itpNo2) || '—'}</td><td>{entry.spools || '—'}</td>
          <td>{text(iso.pipingClass) || '—'}</td><td>{text(iso.drawingNo) || '—'}</td><td>{yesNo(iso.noBo)}</td><td>{text(iso.xRay) || '—'}</td><td>{yesNo(iso.pwht)}</td><td>{priorityLabel(iso.priority) || '—'}</td>
          <td className="release-status-col"><ReleaseStatusCell entry={entry} noun={noun}/></td></tr>; })}</tbody></table></TableScroll>
      {!list.length && <EmptyState title={itpNo || projectId ? 'No isometrics match your filters' : show === 'hide' ? `Nothing waits for ${type.toLowerCase()} release` : 'No isometrics in this main project yet'} description={itpNo || projectId ? 'Clear the project or ITP filter to see more isometrics.' : show === 'hide' ? 'Every isometric of this main project is released. Choose Show released to see them.' : 'Add isometrics under the main project to release them here.'} action={itpNo || projectId ? <button className="btn" type="button" onClick={() => { setProjectId(''); setItpNo(''); reset(); }}>Clear filters</button> : undefined}/>}
      <Pager page={current} pages={pages} onPage={setPage} total={list.length} noun="isometrics"/>
    </section>
    {releasing && <ReleaseDialog type={type} isometrics={checked.map(entry => entry.iso)} onClose={() => setReleasing(false)} onDone={() => setSelected([])}/>}
  </div>;
}

function ReleaseStatusCell({ entry, noun }: { entry: ReleaseListRow; noun: string }) {
  const { release, check } = entry;
  if (release) return <div className="release-state"><Badge color="green">Released</Badge><small>{formatDate(release.date)}{release.docNo ? ` · ${text(release.docNo)}` : ''}</small></div>;
  if (check.ready) return <div className="release-state"><Badge color="green">Ready</Badge><small>All {noun} welds complete</small></div>;
  return <details className="release-reasons"><summary><Badge color="amber">Blocked · {check.reasons.length}</Badge></summary>
    <ul>{check.reasons.map((reason, index) => <li key={`${reason.group}-${reason.weldId || 'iso'}-${index}`}><strong>{reason.title}</strong> {reason.message}</li>)}</ul></details>;
}

/** Release the checked isometrics of one phase. The server checks every isometric again and releases all of them or none. */
function ReleaseDialog({ type, isometrics, onClose, onDone }: { type: ReleasePhase; isometrics: Row[]; onClose: () => void; onDone?: () => void }) {
  const { refresh, notify } = useWorkspace();
  const fields = ACTIONS.release.fields.filter(field => ['reportNo', 'engineerId', 'signatureId', 'date', 'note'].includes(field.name));
  const [values, setValues] = useState<Record<string, unknown>>({ reportNo: '', engineerId: '', signatureId: '', date: today(), note: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [problems, setProblems] = useState<Record<string, string>>({});
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setProblems({});
    if (!text(values.reportNo)) { setProblems({ reportNo: 'Enter the report number of this release.' }); setError('Enter a report number.'); return; }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { type, isoIds: isometrics.map(iso => iso.id), reportNo: text(values.reportNo), date: values.date || today(), note: text(values.note) };
      if (values.engineerId) payload.engineerId = values.engineerId; if (values.signatureId) payload.signatureId = values.signatureId;
      await post('/actions/release', payload); await refresh();
      notify(`${isometrics.length} ${isometrics.length === 1 ? 'isometric' : 'isometrics'} released for ${type.toLowerCase()}.`); onDone?.(); onClose();
    } catch (failure) { setError((failure as Error).message || 'The release could not be saved.'); setProblems((failure as { fields?: Record<string, string> }).fields || {}); } finally { setBusy(false); }
  }
  return <Modal title={`${type} release`} subtitle={`${isometrics.length} ${isometrics.length === 1 ? 'isometric' : 'isometrics'} · all are released together, or none`} onClose={onClose}>
    <form onSubmit={event => void submit(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <ul className="release-iso-list" aria-label="Isometrics to release">{isometrics.map(iso => <li key={iso.id}>{text(iso.isoNo)}</li>)}</ul>
      <div className="form-grid">{fields.map(field => <FieldInput key={field.name} field={field.name === 'reportNo' ? { ...field, required: true } : field} value={values[field.name]} values={values} error={problems[field.name]} onChange={value => setValues(old => ({ ...old, [field.name]: value }))}/>)}</div>
      <p className="iso-hint">The document number and the signature block titles come from the Document settings of the main project and are stored with each release.</p>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy || !isometrics.length}>{busy && <Loader2 size={15} className="spin"/>}Release {isometrics.length === 1 ? 'isometric' : `${isometrics.length} isometrics`}</button></div></form>
  </Modal>;
}

// ----- Request archive ----------------------------------------------------------------------------------------------

function RequestArchive() {
  const { rows, label, canRecord, refresh } = useWorkspace(); const [from, setFrom] = useState(''), [to, setTo] = useState(''), [type, setType] = useState(''), [query, setQuery] = useState('');
  const [page, setPage] = useState(0), [document, setDocument] = useState<Row | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const invalid = Boolean(from && to && from > to);
  const isoOf = (release: Row) => (rows.isometrics || []).find(iso => iso.id === release.isoId);
  const list = useMemo(() => {
    if (invalid) return [];
    const needle = query.trim().toLowerCase();
    return releaseArchiveRows((rows.releases || []).filter(release => isoInArchive(rows.isometrics || [], release)), { from, to, type })
      .filter(release => !needle || [release.number, release.reportNo, release.docNo, release.releasedBy, isoOf(release)?.isoNo].some(value => text(value).toLowerCase().includes(needle)));
  }, [rows, from, to, type, query, invalid]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)), current = Math.min(page, pages - 1), shown = list.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const exportable = canRecord('releases', 'export');
  const columns = ['Release', 'Type', 'Project', 'ISO', 'Report no.', 'Date', 'QA/QC engineer', 'Released by', 'Status', 'Document no.'];
  const cells = (release: Row) => [release.number, release.type, label('projects', isoOf(release)?.projectId), isoOf(release)?.isoNo, release.reportNo, release.date, release.engineerId ? label('qa_engineers', release.engineerId) : '', release.releasedBy, release.status === 'Reopened' ? 'Reopened' : 'Released', release.docNo];
  async function reload() { setBusy(true); setError(''); try { await refresh(); } catch (failure) { setError((failure as Error).message || 'The archive could not be refreshed.'); } finally { setBusy(false); } }
  return <div className="page releases-page" aria-busy={busy}>
    <div className="page-heading"><div><div className="eyebrow">WELD PILOT · RELEASES</div><h1>Request archive<span className="heading-count">{list.length}</span></h1><p>Prefab, field and hydrotest releases of the active main project, by date.</p></div>
      <div className="heading-actions"><button className="btn" type="button" onClick={() => void reload()} disabled={busy}>{busy ? <Loader2 size={16} className="spin"/> : <RefreshCw size={16}/>}Refresh</button>
        {exportable && <button className="btn" type="button" disabled={!list.length} onClick={() => downloadCsv('release-archive.csv', columns, list.map(cells))}><Download size={16}/>Export</button>}</div></div>
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    <section className="table-card" aria-label="Request archive">
      <div className="release-filters filters-panel" role="search">
        <div className="field"><label htmlFor="archive-from">From date</label><input id="archive-from" type="date" value={from} max={to || undefined} aria-invalid={invalid} onChange={event => { setFrom(event.target.value); setPage(0); }}/></div>
        <div className="field"><label htmlFor="archive-to">To date</label><input id="archive-to" type="date" value={to} min={from || undefined} aria-invalid={invalid} onChange={event => { setTo(event.target.value); setPage(0); }}/></div>
        <div className="field"><label htmlFor="archive-type">Release type</label><select id="archive-type" value={type} onChange={event => { setType(event.target.value); setPage(0); }}><option value="">All types</option>{['Prefab', 'Field', 'Hydrotest'].map(option => <option key={option}>{option}</option>)}</select></div>
        <div className="field"><label htmlFor="archive-search">Search</label><input id="archive-search" type="search" value={query} placeholder="Release, report, document or ISO" onChange={event => { setQuery(event.target.value); setPage(0); }}/></div>
      </div>
      {invalid && <div className="alert error" role="alert"><AlertCircle size={18}/><span>The from date must not be after the to date.</span></div>}
      <TableScroll><table className="data-table release-table" aria-label="Releases by date"><thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}<th scope="col"><span className="sr-only">Document</span></th></tr></thead>
        <tbody>{shown.map(release => { const iso = isoOf(release); return <tr key={release.id}>
          <td>{text(release.number) || '—'}</td><td><Badge color="neutral">{text(release.type)}</Badge></td><td>{iso ? label('projects', iso.projectId) : '—'}</td>
          <td>{iso ? <Link className="record-link" to={`/workspace/isometrics/${iso.id}`}>{text(iso.isoNo)}</Link> : '—'}</td><td>{text(release.reportNo) || '—'}</td><td className="tabular">{formatDate(release.date)}</td>
          <td>{release.engineerId ? label('qa_engineers', release.engineerId) : '—'}</td><td>{text(release.releasedBy) || '—'}</td><td><Badge color={release.status === 'Reopened' ? 'amber' : 'green'}>{release.status === 'Reopened' ? 'Reopened' : 'Released'}</Badge></td>
          <td>{text(release.docNo) || '—'}</td>
          <td><button className="btn small" type="button" onClick={() => setDocument(release)} aria-label={`Open release document ${text(release.number)}`}><FileText size={14}/>Document</button></td></tr>; })}</tbody></table></TableScroll>
      {!list.length && !invalid && <EmptyState title={from || to || type || query ? 'No releases match your filters' : 'No releases yet'} description={from || to || type || query ? 'Widen the date range or clear the other filters.' : 'Released isometrics appear here with their report numbers.'} action={from || to || type || query ? <button className="btn" type="button" onClick={() => { setFrom(''); setTo(''); setType(''); setQuery(''); setPage(0); }}>Clear filters</button> : undefined}/>}
      <Pager page={current} pages={pages} onPage={setPage} total={list.length} noun="releases"/>
    </section>
    {document && <ReleaseDocumentDialog releases={[document]} onClose={() => setDocument(null)}/>}
  </div>;
}
/** A release belongs to the archive of the active main project when its isometric is in scope. */
const isoInArchive = (isometrics: Row[], release: Row) => isometrics.some(iso => iso.id === release.isoId);

// ----- Release document ---------------------------------------------------------------------------------------------

/** The data of a release as a printable document. The layout of the final document comes with the reporting task; everything it needs is stored on the release. */
export function ReleaseDocumentDialog({ releases, onClose }: { releases: Row[]; onClose: () => void }) {
  const { rows, label, canRecord } = useWorkspace(); const [index, setIndex] = useState(0);
  const release = releases[Math.min(index, releases.length - 1)];
  const iso = (rows.isometrics || []).find(row => row.id === release.isoId), project = (rows.projects || []).find(row => row.id === iso?.projectId), site = (rows.sites || []).find(row => row.id === project?.siteId);
  const titles = storedSignatureTitles(release); const printable = canRecord('releases', 'print', release);
  const facts: [string, ReactNode][] = [
    ['Document no.', text(release.docNo) || '—'], ['Release no.', text(release.number) || '—'], ['Report no.', text(release.reportNo) || '—'], ['Release date', formatDate(release.date)],
    ['Released by', text(release.releasedBy) || '—'], ['Released at', time(release.releasedAt)], ['QA/QC engineer', release.engineerId ? label('qa_engineers', release.engineerId) : '—'], ['Signature', release.signatureId && canRecord('signatures') ? label('signatures', release.signatureId) : '—'],
    ['Main project', text(site?.name) || '—'], ['Project', project ? label('projects', project.id) : '—'], ['ISO', text(iso?.isoNo) || '—'], ['IRN', text(iso?.irn) || '—'],
    ['Revision', iso ? currentRevision(rows, iso.id, 'ISO') : '—'], ['Drawing no. 1', text(iso?.drawingNo) || '—'], ['Asset tag', text(iso?.assetTag) || '—'], ['Piping class', text(iso?.pipingClass) || '—'],
  ];
  return <Modal title={`${text(release.type)} release document`} subtitle={text(release.docNo) || text(release.number)} onClose={onClose} wide>
    <div className="modal-body">
      {releases.length > 1 && <div className="table-tabs release-doc-tabs" role="tablist" aria-label="Release document">{releases.map((item, position) => <button key={item.id} type="button" role="tab" aria-selected={position === index} className={position === index ? 'selected' : ''} onClick={() => setIndex(position)}>{text(item.type)} release</button>)}</div>}
      <article className="release-doc" aria-label={`${text(release.type)} release document`}>
        {release.status === 'Reopened' && <div className="alert error" role="status"><AlertCircle size={18}/><span>Reopened {time(release.reopenedAt)} by {text(release.reopenedBy) || 'unknown'}: {text(release.reopenReason) || 'no reason recorded'}. This document is no longer valid.</span></div>}
        <dl className="release-doc-facts">{facts.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
        {text(release.note) && <p className="release-doc-note"><strong>Notes</strong> {text(release.note)}</p>}
        <p className="release-doc-numbering">Numbering from the Document settings: prefix {text(release.docPrefix) || '—'} · drawing number rule “{text(release.docDrawingRule) || '—'}”.</p>
        <h3>Signatures</h3>
        {titles.length ? <div className="release-doc-signatures">{titles.map(entry => <div key={entry.label}><small>{entry.label}</small><strong>{entry.title}</strong><span className="release-doc-line" aria-hidden="true"/><small>Name, date, signature</small></div>)}</div>
          : <p className="muted">The main project had no signature block titles when this release was made.</p>}
      </article>
    </div>
    <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button>{printable && <button type="button" className="btn primary" onClick={() => window.print()}><Printer size={15}/>Print / Save as PDF</button>}</div>
  </Modal>;
}

// ----- Status card of the isometric ----------------------------------------------------------------------------------

const PILL: Record<PhaseState['state'], string> = { released: 'green', ready: 'blue', 'not-ready': 'amber', none: 'neutral' };
const stateText = (type: ReleasePhase, state: PhaseState) => state.state === 'released' ? (type === 'Prefab' ? 'released' : 'completed') : state.state === 'ready' ? 'ready' : state.state === 'none' ? `no ${PHASE_LOCATION[type]} welds` : type === 'Prefab' ? 'not ready' : 'open';

/** "Prefab not ready / ready / released", "Field completed" with Reopen, and "Create release doc" on the isometric's Status card (Weld Pilot only). */
export function ReleaseStatus({ iso }: { iso: Row }) {
  const { canRecord, canRun } = useWorkspace(); const pilot = usePilot(); const source = useReleaseSource();
  const [releasing, setReleasing] = useState<ReleasePhase | ''>(''), [reopening, setReopening] = useState<ReleasePhase | ''>(''), [document, setDocument] = useState(false);
  const input: ReleaseCheckInput = useMemo(() => ({ iso, welds: source.welds, weldTypes: source.weldTypes, results: source.results, releases: source.releases, punch: source.punch }), [iso, source]);
  const prefab = useMemo(() => phaseState('Prefab', input), [input]), field = useMemo(() => phaseState('Field', input), [input]);
  if (pilot?.pilot.key === 'mto' || !canRecord('releases')) return null;
  const released = [prefab.release, field.release].filter((row): row is Row => Boolean(row));
  const phase = (type: ReleasePhase, state: PhaseState) => {
    const title = type === 'Prefab' ? 'Prefab' : 'Field';
    return <div className="iso-release-phase" key={type}>
      <div className="iso-release-line"><span className="iso-release-name">{title}</span><span className={`release-pill ${PILL[state.state]}`}>{state.state === 'released' && <Lock size={12} aria-hidden="true"/>}{stateText(type, state)}</span></div>
      {state.state === 'released' && <small className="iso-release-meta">{formatDate(state.release!.date)} · {text(state.release!.releasedBy) || 'unknown'} · {text(state.release!.reportNo)}</small>}
      {!source.limited && (state.state === 'not-ready' || state.state === 'none') && <details className="release-reasons"><summary>Why {state.state === 'none' ? 'nothing to release' : `${title.toLowerCase()} is not ready`}</summary><ul>{state.check.reasons.map((reason, index) => <li key={`${reason.group}-${index}`}><strong>{reason.title}</strong> {reason.message}</li>)}</ul></details>}
      <div className="iso-release-actions">
        {state.state === 'ready' && canRun('release', { type }) && <button className="btn small primary" type="button" onClick={() => setReleasing(type)}>Release {title.toLowerCase()}</button>}
        {state.state === 'released' && canRun('reopen-release', { type }) && !(type === 'Prefab' && field.state === 'released') && <button className="btn small" type="button" onClick={() => setReopening(type)}><Unlock size={14}/>Reopen</button>}
      </div>
    </div>;
  };
  return <section className="iso-release" aria-label="Prefab and field release">
    {phase('Prefab', prefab)}{phase('Field', field)}
    {released.length > 0 && canRecord('releases', 'show') && <button className="btn small iso-release-doc" type="button" onClick={() => setDocument(true)}><FileText size={14}/>Create release doc</button>}
    {releasing && <ReleaseDialog type={releasing} isometrics={[iso]} onClose={() => setReleasing('')}/>}
    {reopening && <ReopenDialog iso={iso} type={reopening} onClose={() => setReopening('')}/>}
    {document && <ReleaseDocumentDialog releases={released} onClose={() => setDocument(false)}/>}
  </section>;
}

/** Reopen asks for a reason; the reason is kept with the release and in the audit trail. */
function ReopenDialog({ iso, type, onClose }: { iso: Row; type: ReleasePhase; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); const value = reason.trim();
    if (!value) { setError('Enter the reason for reopening.'); return; }
    setBusy(true); setError('');
    try { await post('/actions/reopen-release', { isoId: iso.id, type, reason: value }); await refresh(); notify(`${type} release reopened. The ${PHASE_LOCATION[type]} welds are unlocked.`); onClose(); }
    catch (failure) { setError((failure as Error).message || 'The release could not be reopened.'); } finally { setBusy(false); }
  }
  const welds = PHASE_LOCATION[type];
  return <Modal title={`Reopen ${type.toLowerCase()} release`} subtitle={text(iso.isoNo)} onClose={onClose}>
    <form onSubmit={event => void submit(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <p>The {welds} welds of this isometric are unlocked again and the {type === 'Prefab' ? 'isometric is blocked until the prefab is released again' : 'field completion is withdrawn'}. The release record is kept as history.</p>
      <div className="field"><label htmlFor="reopen-reason">Reason for reopening <span className="required">*</span></label><textarea id="reopen-reason" rows={4} required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} aria-invalid={Boolean(error) && !reason.trim()}/><small className="field-hint">{reason.length} / 500 · recorded in the audit trail</small></div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}<RotateCcw size={15}/>Reopen release</button></div></form>
  </Modal>;
}

// ----- Field work packages -------------------------------------------------------------------------------------------

/** The route of `/…/field_packages`: the packages themselves, and the assignment of isometrics to them. */
export function FieldPackagesPage() {
  const { canRecord, canArea } = useWorkspace(); const [params, setParams] = useSearchParams();
  const canPackages = canRecord('field_packages'), canAssign = canArea('91') && canRecord('isometrics');
  if (!canPackages && !canAssign) return <Restricted what="field work packages"/>;
  const requested = params.get('tab') === 'assign' ? 'assign' : 'packages';
  const tab = requested === 'assign' && canAssign ? 'assign' : requested === 'packages' && canPackages ? 'packages' : canPackages ? 'packages' : 'assign';
  const tabs = [['packages', 'Field Work Packages', canPackages], ['assign', 'Assign Iso to FWP', canAssign]] as const;
  return <div className="page releases-page">
    <div className="page-heading"><div><div className="eyebrow">WELD PILOT · RELEASES</div><h1>{tab === 'packages' ? 'Field work packages' : 'Assign Iso to FWP'}</h1><p>{tab === 'packages' ? 'Name the packages that field crews work from.' : 'Assign the isometrics of the active main project to a field work package.'}</p></div></div>
    <div className="table-tabs fwp-tabs" role="tablist" aria-label="Field work packages">{tabs.filter(([, , allowed]) => allowed).map(([key, title]) => <button key={key} type="button" role="tab" id={`fwp-tab-${key}`} aria-selected={tab === key} aria-controls={`fwp-panel-${key}`} className={tab === key ? 'selected' : ''} onClick={() => setParams(key === 'assign' ? { tab: 'assign' } : {})}>{title}</button>)}</div>
    <div role="tabpanel" id={`fwp-panel-${tab}`} aria-labelledby={`fwp-tab-${tab}`}>{tab === 'packages' ? <PackagesTab/> : <AssignTab/>}</div>
  </div>;
}

function PackagesTab() {
  const { rows, label, canRecord } = useWorkspace(); const [query, setQuery] = useState(''), [editor, setEditor] = useState<Row | 'new' | null>(null), [archiving, setArchiving] = useState<Row | null>(null), [page, setPage] = useState(0);
  const projectIds = new Set((rows.projects || []).map(project => project.id));
  const counts = useMemo(() => { const map = new Map<string, number>(); for (const iso of rows.isometrics || []) if (!iso._archived && iso.fieldPackageId) map.set(String(iso.fieldPackageId), (map.get(String(iso.fieldPackageId)) || 0) + 1); return map; }, [rows.isometrics]);
  const list = useMemo(() => (rows.field_packages || []).filter(item => !item._archived && (!item.projectId || projectIds.has(String(item.projectId))) && (!query.trim() || [item.name, item.description, item.number].some(value => text(value).toLowerCase().includes(query.trim().toLowerCase())))).sort((a, b) => text(a.name).localeCompare(text(b.name), 'en', { numeric: true })), [rows.field_packages, rows.projects, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)), current = Math.min(page, pages - 1), shown = list.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  return <section className="table-card" aria-label="Field work packages">
    <div className="table-toolbar"><SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder="Search field work packages…"/>{canRecord('field_packages', 'insert') && <div className="toolbar-right"><button className="btn primary small" type="button" onClick={() => setEditor('new')}><Plus size={15}/>Add field work package</button></div>}</div>
    <TableScroll><table className="data-table" aria-label="Field work packages"><thead><tr><th scope="col">Name</th><th scope="col">Description</th><th scope="col">Project</th><th scope="col">Package no.</th><th scope="col">Isometrics</th><th scope="col"><span className="sr-only">Options</span></th></tr></thead>
      <tbody>{shown.map(item => <tr key={item.id}><td><strong>{text(item.name)}</strong></td><td>{text(item.description) || '—'}</td><td>{item.projectId ? label('projects', item.projectId) : <span className="muted">All projects</span>}</td><td>{text(item.number) || '—'}</td><td className="tabular">{formatNumber(counts.get(item.id) || 0, 0)}</td>
        <td className="actions-cell">{canRecord('field_packages', 'edit', item) && <button className="icon-btn" type="button" aria-label={`Edit ${text(item.name)}`} onClick={() => setEditor(item)}><Pencil size={16}/></button>}{canRecord('field_packages', 'delete', item) && <button className="icon-btn" type="button" aria-label={`Archive ${text(item.name)}`} onClick={() => setArchiving(item)}><Archive size={16}/></button>}</td></tr>)}</tbody></table></TableScroll>
    {!list.length && <EmptyState title={query ? 'No field work packages match' : 'No field work packages yet'} description={query ? 'Try another search.' : 'Add a package, then assign isometrics to it on the Assign Iso to FWP tab.'} action={query ? <button className="btn" type="button" onClick={() => setQuery('')}>Clear search</button> : canRecord('field_packages', 'insert') ? <button className="btn primary" type="button" onClick={() => setEditor('new')}><Plus size={16}/>Add field work package</button> : undefined}/>}
    <Pager page={current} pages={pages} onPage={setPage} total={list.length} noun="packages"/>
    {editor && <RecordEditor resourceKey="field_packages" record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
    {archiving && <ArchiveRecordDialog resourceKey="field_packages" record={archiving} onClose={() => setArchiving(null)}/>}
  </section>;
}

function AssignTab() {
  const { rows, label, canRun, canArea, refresh, notify } = useWorkspace();
  const [projectId, setProjectId] = useState(''), [packageId, setPackageId] = useState(''), [assignment, setAssignment] = useState(''), [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]), [target, setTarget] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [page, setPage] = useState(0);
  const projectIds = new Set((rows.projects || []).map(project => project.id));
  const packages = useMemo(() => (rows.field_packages || []).filter(item => !item._archived && (!item.projectId || projectIds.has(String(item.projectId)))), [rows.field_packages, rows.projects]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => fwpListRows({ isometrics: rows.isometrics || [], projects: rows.projects || [], testSystems: rows.test_systems || [], fieldPackages: rows.field_packages || [] }, { projectId, fieldPackageId: packageId, assignment, query }), [rows, projectId, packageId, assignment, query]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)), current = Math.min(page, pages - 1), shown = list.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const allowed = canRun('assign-fwp'); const checked = list.filter(entry => selected.includes(entry.iso.id));
  const targetRow = packages.find(item => item.id === target);
  const mismatched = targetRow ? checked.filter(entry => !fwpAccepts(targetRow, entry.iso)) : [];
  useEffect(() => { setSelected(old => old.filter(id => list.some(entry => entry.iso.id === id))); }, [list]);
  const reset = () => { setPage(0); setSelected([]); };
  const header = ['Project', 'ISO', 'Diameter', 'Paint spec.', 'Asset tag', 'Test pressure', 'Test medium', 'Test system', 'FWP'];
  const cells = (entry: (typeof list)[number]) => [entry.project ? label('projects', entry.project.id) : '', entry.iso.isoNo, entry.iso.nomDiameter, entry.iso.paintSpec, entry.iso.assetTag, entry.iso.testPressure, entry.iso.testMedium, entry.testSystem?.name, entry.fieldPackage?.name];
  async function assign(clear: boolean) {
    if (!checked.length || (!clear && !target)) return;
    setBusy(true); setError('');
    try { await post('/actions/assign-fwp', { isoIds: checked.map(entry => entry.iso.id), fieldPackageId: clear ? '' : target }); await refresh(); notify(clear ? `${checked.length} isometrics removed from their package.` : `${checked.length} isometrics assigned to ${text(targetRow?.name)}.`); setSelected([]); }
    catch (failure) { setError((failure as Error).message || 'The assignment could not be saved.'); } finally { setBusy(false); }
  }
  return <section className="table-card" aria-label="Assign isometrics to field work packages" aria-busy={busy}>
    <div className="release-filters filters-panel" role="search">
      <div className="field"><label htmlFor="fwp-project">Project</label><select id="fwp-project" value={projectId} onChange={event => { setProjectId(event.target.value); reset(); }}><option value="">All projects</option>{(rows.projects || []).filter(project => !project._archived).map(project => <option key={project.id} value={project.id}>{label('projects', project.id)}</option>)}</select></div>
      <div className="field"><label htmlFor="fwp-package">FWP</label><select id="fwp-package" value={packageId} onChange={event => { setPackageId(event.target.value); reset(); }}><option value="">All packages</option>{packages.map(item => <option key={item.id} value={item.id}>{text(item.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="fwp-assignment">Assignment</label><select id="fwp-assignment" value={assignment} onChange={event => { setAssignment(event.target.value); reset(); }}><option value="">All isometrics</option><option value="unassigned">Not assigned</option><option value="assigned">Assigned</option></select></div>
      <div className="field"><label htmlFor="fwp-search">Search</label><input id="fwp-search" type="search" value={query} placeholder="ISO, asset tag, paint spec…" onChange={event => { setQuery(event.target.value); reset(); }}/></div>
      {canArea('91', 'export') && <button className="btn small release-export" type="button" disabled={!list.length} onClick={() => downloadCsv('isometrics-field-work-packages.csv', header, list.map(cells))}><Download size={15}/>Export</button>}
    </div>
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    {allowed && <div className="selection-bar fwp-assign" role="group" aria-label="Assign checked isometrics">
      <strong>{checked.length} checked</strong>
      <label className="fwp-target"><span className="sr-only">Field work package</span><select aria-label="Field work package to assign" value={target} onChange={event => setTarget(event.target.value)}><option value="">Choose a package</option>{packages.map(item => <option key={item.id} value={item.id}>{text(item.name)}</option>)}</select></label>
      <button className="btn primary small" type="button" disabled={busy || !checked.length || !target || mismatched.length > 0} onClick={() => void assign(false)}>{busy && <Loader2 size={14} className="spin"/>}Assign checked</button>
      <button className="btn small" type="button" disabled={busy || !checked.some(entry => entry.fieldPackage)} onClick={() => void assign(true)}>Remove from package</button>
      {mismatched.length > 0 && <span className="field-error" role="alert">{text(targetRow?.name)} belongs to another project than {mismatched.slice(0, 2).map(entry => text(entry.iso.isoNo)).join(', ')}{mismatched.length > 2 ? ` and ${mismatched.length - 2} more` : ''}.</span>}
    </div>}
    <TableScroll><table className="data-table release-table" aria-label="Isometrics and their field work packages"><thead><tr>{header.map(column => <th key={column} scope="col">{column}</th>)}
      <th scope="col" className="select-cell">{allowed ? <><span className="sr-only">Check</span><input type="checkbox" aria-label="Check all isometrics on this page" ref={input => { if (input) input.indeterminate = shown.some(entry => selected.includes(entry.iso.id)) && !shown.every(entry => selected.includes(entry.iso.id)); }} checked={shown.length > 0 && shown.every(entry => selected.includes(entry.iso.id))} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, ...shown.map(entry => entry.iso.id)])] : old.filter(id => !shown.some(entry => entry.iso.id === id)))}/></> : 'Check'}</th></tr></thead>
      <tbody>{shown.map(entry => <tr key={entry.iso.id}><td>{entry.project ? label('projects', entry.project.id) : '—'}</td><td><Link className="record-link" to={`/workspace/isometrics/${entry.iso.id}`}>{text(entry.iso.isoNo)}</Link></td>
        <td>{text(entry.iso.nomDiameter) || '—'}</td><td>{text(entry.iso.paintSpec) || '—'}</td><td>{text(entry.iso.assetTag) || '—'}</td><td>{text(entry.iso.testPressure) || '—'}</td><td>{text(entry.iso.testMedium) || '—'}</td><td>{entry.testSystem ? text(entry.testSystem.name) : '—'}</td>
        <td>{entry.fieldPackage ? <Badge color="neutral">{text(entry.fieldPackage.name)}</Badge> : <span className="muted">Not assigned</span>}</td>
        <td className="select-cell">{allowed ? <input type="checkbox" aria-label={`Check ${text(entry.iso.isoNo)}`} checked={selected.includes(entry.iso.id)} onChange={event => setSelected(old => event.target.checked ? [...old, entry.iso.id] : old.filter(id => id !== entry.iso.id))}/> : null}</td></tr>)}</tbody></table></TableScroll>
    {!list.length && <EmptyState title={projectId || packageId || assignment || query ? 'No isometrics match your filters' : 'No isometrics in this main project yet'} description={projectId || packageId || assignment || query ? 'Clear a filter to see more isometrics.' : 'Add isometrics under the main project, then assign them to a field work package here.'} action={projectId || packageId || assignment || query ? <button className="btn" type="button" onClick={() => { setProjectId(''); setPackageId(''); setAssignment(''); setQuery(''); reset(); }}>Clear filters</button> : undefined}/>}
    <Pager page={current} pages={pages} onPage={setPage} total={list.length} noun="isometrics"/>
  </section>;
}
