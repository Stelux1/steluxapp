import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, Archive, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Loader2, Lock, Pencil, Plus, Printer, RefreshCw, RotateCcw, SlidersHorizontal, Unlock } from 'lucide-react';
import { useWorkspace } from './context.tsx';
import { usePilot } from './pilot.tsx';
import { api, apiBlob, apiUrl, post, formatDate, formatNumber } from './api.ts';
import { Badge, Dropdown, EmptyState, Modal, SearchInput, TableScroll } from './components.tsx';
import { RecordEditor } from './dialogs.tsx';
import { PhaseDialog } from './iso-actions.tsx';
import { ReleasePdfButton } from './pdf-documents.tsx';
import { ArchiveRecordDialog } from './archive-record.tsx';
import { exportTable, useTableRights } from './table-export.ts';
import { areaVerb, releaseExportTable } from '../shared/export-tables.ts';
import { currentRevision } from '../shared/revisions.ts';
import { priorityLabel } from '../shared/priority.ts';
import {
  COMPLETE_CONFIRM, ITP_MISSING, RELEASE_DEFAULT_PAGE_LENGTH, RELEASE_PAGE_LENGTHS, SIGNED_RELEASE_DOCUMENT, fwpAccepts, fwpListRows, phaseCompletion, phaseState, releaseArchiveRows, releaseItpOf, releaseItpOptions, releaseListRows, PHASE_LOCATION,
  type PhaseState, type ReleaseArchiveRow, type ReleaseCheckInput, type ReleaseListRow, type ReleasePhase,
} from '../shared/releases.ts';
import type { Row } from '../shared/types.ts';

const text = (value: unknown) => String(value ?? '').trim();
const yesNo = (value: unknown) => value ? 'Yes' : 'No';
const ASSIGN_PAGE_LENGTHS = [10, 25, 50, 100] as const;

const saveBlob = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
/** CSV or Excel of a table of this page: the server writes the file and checks the Export right of the table's area (shared/export-tables.ts). */
function sendTable(table: string, format: 'csv' | 'xlsx', name: string, header: string[], lines: unknown[][], fail: (message: string) => void) {
  void exportTable(table, format, header, lines, name).catch(problem => fail((problem as Error).message || 'The file could not be created.'));
}

/** "Showing 1 to 25 of 140 entries" with page buttons; `size` 0 shows everything on one page. */
function Pager({ page, pages, onPage, total, size }: { page: number; pages: number; onPage: (page: number) => void; total: number; size: number }) {
  const from = total ? page * (size || total) + 1 : 0, to = size ? Math.min((page + 1) * size, total) : total;
  return <div className="table-footer"><span role="status" aria-live="polite">Showing {from} to {to} of {total} entries</span>
    {pages > 1 && <div><button className="icon-btn" type="button" disabled={page === 0} aria-label="Previous page" onClick={() => onPage(page - 1)}><ChevronLeft size={17}/></button><span>{page + 1} / {pages}</span><button className="icon-btn" type="button" disabled={page >= pages - 1} aria-label="Next page" onClick={() => onPage(page + 1)}><ChevronRight size={17}/></button></div>}</div>;
}
const paging = (total: number, page: number, size: number) => { const pages = size ? Math.max(1, Math.ceil(total / size)) : 1; return { pages, current: Math.min(page, pages - 1) }; };

/** The table tools of a DataTables list: CSV, Excel, Print, "Show N entries" and Search. */
function TableTools({ exportable, printable, onCsv, onExcel, lengths, length, onLength, query, onQuery, labelPrefix }: {
  exportable: boolean; printable: boolean; onCsv: () => void; onExcel: () => void; lengths: readonly number[]; length: number; onLength: (value: number) => void; query: string; onQuery: (value: string) => void; labelPrefix: string;
}) {
  return <div className="table-toolbar release-tools">
    <div className="release-tool-buttons" role="group" aria-label={`${labelPrefix} export`}>
      {exportable && <><button className="btn small" type="button" onClick={onCsv}>CSV</button><button className="btn small" type="button" onClick={onExcel}>Excel</button></>}
      {printable && <button className="btn small" type="button" aria-label="Print" onClick={() => window.print()}><Printer size={14}/></button>}
    </div>
    <label className="release-length">Show <select aria-label={`${labelPrefix} entries per page`} value={length} onChange={event => onLength(Number(event.target.value))}>{(lengths.includes(length) ? lengths : [...lengths, length]).map(value => <option key={value} value={value}>{value === 0 ? 'ALL' : value}</option>)}</select> entries</label>
    <SearchInput value={query} onChange={onQuery} placeholder="Search"/>
  </div>;
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

/** Downloads the release note PDF of a release record (any record of its batch). */
async function downloadReleaseNote(release: Row, fileName = '') {
  const type = text(release.type).toLowerCase();
  saveBlob(`${(fileName || `${type}-release-note`).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/\.pdf$/, '')}.pdf`, await apiBlob(`/pdf/${type}-release?releaseId=${encodeURIComponent(release.id)}`));
}

// ----- Prefab release and Field release ---------------------------------------------------------------------------

/** The route of `/…/releases`: Prefab release or Field release, chosen by `?view=`. */
export function ReleasesPage() {
  const [params] = useSearchParams(); const { canRecord } = useWorkspace(); const view = params.get('view');
  if (!canRecord('releases')) return <Restricted what="releases"/>;
  return <ReleaseList key={view === 'field' ? 'Field' : 'Prefab'} type={view === 'field' ? 'Field' : 'Prefab'}/>;
}

function ReleaseList({ type }: { type: ReleasePhase }) {
  const { rows, label, canRun, canRecord, refresh, notify } = useWorkspace(); const source = useReleaseSource(); const { canExport, canPrint } = useTableRights();
  const [show, setShow] = useState<'hide' | 'show'>('hide'), [projectId, setProjectId] = useState(''), [itpNo, setItpNo] = useState(''), [query, setQuery] = useState('');
  const [length, setLength] = useState<number>(RELEASE_DEFAULT_PAGE_LENGTH), [selected, setSelected] = useState<string[]>([]), [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<'filter' | 'release' | 'archive' | 'upload' | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const itpOptions = useMemo(() => releaseItpOptions(type, canRecord('itps') ? rows.itps : [], rows.attachments, rows.isometrics), [type, rows.itps, rows.attachments, rows.isometrics, canRecord]);
  const base = useMemo(() => releaseListRows(type, source, { show, projectId, itpNo }), [type, source, show, projectId, itpNo]);
  const cells = (entry: ReleaseListRow) => [entry.project ? label('projects', entry.project.id) : '', text(entry.iso.isoNo), text(entry.iso.irn), currentRevision(rows, entry.iso.id, 'ISO'), text(entry.iso.itpNo), text(entry.iso.itpNo2), entry.spools, text(entry.iso.pipingClass), text(entry.iso.drawingNo), yesNo(entry.iso.noBo), text(entry.iso.xRay), yesNo(entry.iso.pwht), priorityLabel(entry.iso.priority) || 'Prio not set'];
  const list = useMemo(() => { const needle = query.trim().toLowerCase(); return needle ? base.filter(entry => cells(entry).some(value => value.toLowerCase().includes(needle))) : base; }, [base, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const allowed = canRun('release', { type });
  const { pages, current } = paging(list.length, page, length); const shown = length ? list.slice(current * length, (current + 1) * length) : list;
  const selectable = (entry: ReleaseListRow) => allowed && entry.selectable;
  const selectableShown = shown.filter(selectable);
  const checked = list.filter(entry => selected.includes(entry.iso.id) && selectable(entry));
  const title = `${type} release`, noun = type === 'Prefab' ? 'shop' : 'field';
  useEffect(() => { setSelected(old => old.filter(id => base.some(entry => entry.iso.id === id && selectable(entry)))); }, [base]); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = () => { setPage(0); setSelected([]); };
  const columns = ['Project', 'ISO', 'IRN', 'Rev. no.', 'ITP No', 'ITP No 2', 'Spools', 'Piping class', 'Drawing no. 1', 'NoBo', 'X Ray %', 'PWHT', 'Priority'];
  const released = useMemo(() => (rows.releases || []).filter(row => !row._archived && row.type === type), [rows.releases, type]);
  const archiveCount = useMemo(() => releaseArchiveRows(released, type, { isometrics: rows.isometrics || [], projects: rows.projects || [], sites: rows.sites || [], itps: rows.itps, attachments: rows.attachments }).length, [released, type, rows]);
  async function reload() { setBusy(true); setError(''); try { await refresh(); notify('The list is up to date.'); } catch (failure) { setError((failure as Error).message || 'The list could not be refreshed.'); } finally { setBusy(false); } }
  const file = `${type.toLowerCase()}-release.`;

  return <div className="page releases-page" aria-busy={busy}>
    <div className="page-heading"><div><div className="eyebrow">WELD PILOT · RELEASES</div><h1>{title}<span className="heading-count">{base.length}</span></h1>
      <p>Isometrics of the active main project marked {type} complete on the isometric. Choose one ITP in the filter, tick the isometrics and release them as one document.</p></div>
      <div className="heading-actions">
        {allowed && checked.length > 0 && <button className="btn primary" type="button" onClick={() => setDialog('release')}>Release selected ({checked.length})</button>}
        <Dropdown label={`${title} options`} trigger={<span className="btn">Options<ChevronDown size={14}/></span>}>
          <button type="button" onClick={() => setDialog('archive')}>Release archive <Badge color="blue">{archiveCount}</Badge></button>
          {canRecord('releases', 'import') && <button type="button" onClick={() => setDialog('upload')}>Upload signed docs</button>}
        </Dropdown>
        <button className="btn" type="button" onClick={() => setDialog('filter')}><SlidersHorizontal size={16}/>Filter</button>
        <button className="btn" type="button" aria-label="Refresh" title="Refresh" onClick={() => void reload()} disabled={busy}>{busy ? <Loader2 size={16} className="spin"/> : <RefreshCw size={16}/>}</button></div></div>
    {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
    {source.limited && <div className="alert" role="status"><AlertCircle size={18}/><span>Your profile cannot read the weld register, so the {noun} welds are not checked here. The server checks them when you release.</span></div>}
    <section className="table-card" aria-label={`${title} list`}>
      <TableTools labelPrefix={title} exportable={canExport(releaseExportTable(type))} printable={canPrint(releaseExportTable(type))} lengths={RELEASE_PAGE_LENGTHS} length={length} onLength={value => { setLength(value); setPage(0); }} query={query} onQuery={value => { setQuery(value); reset(); }}
        onCsv={() => sendTable(releaseExportTable(type), 'csv', file.slice(0, -1), columns, list.map(cells), setError)} onExcel={() => sendTable(releaseExportTable(type), 'xlsx', file.slice(0, -1), columns, list.map(cells), setError)}/>
      <TableScroll><table className="data-table release-table" aria-label={`${title} isometrics`}>
        <thead><tr>
          <th className="select-cell" scope="col"><span className="sr-only">Options</span>{allowed && itpNo && <input type="checkbox" aria-label="Select all isometrics on this page" disabled={!selectableShown.length} ref={input => { if (input) input.indeterminate = selectableShown.some(entry => selected.includes(entry.iso.id)) && !selectableShown.every(entry => selected.includes(entry.iso.id)); }}
            checked={selectableShown.length > 0 && selectableShown.every(entry => selected.includes(entry.iso.id))} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, ...selectableShown.map(entry => entry.iso.id)])] : old.filter(id => !selectableShown.some(entry => entry.iso.id === id)))}/>}</th>
          {columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{shown.map(entry => { const { iso, release } = entry, values = cells(entry); return <tr key={iso.id} className={release ? 'released' : 'ready'}>
          <td className="select-cell">{release ? <Badge color="green">Released</Badge> : entry.selectable && allowed ? <input type="checkbox" aria-label={`Select ${text(iso.isoNo)} for ${type.toLowerCase()} release`} checked={selected.includes(iso.id)} onChange={event => setSelected(old => event.target.checked ? [...old, iso.id] : old.filter(id => id !== iso.id))}/> : entry.selectable ? null : <span className="muted">Choose ITP</span>}</td>
          <td>{values[0] || '—'}</td>
          <td><Link className="record-link" to={`/workspace/isometrics/${iso.id}`}>{values[1] || '—'}</Link></td>
          {values.slice(2).map((value, index) => <td key={columns[index + 2]} className={index === 1 ? 'tabular' : undefined}>{value || '—'}</td>)}</tr>; })}</tbody></table></TableScroll>
      {!list.length && <EmptyState title={itpNo || projectId || query ? 'No isometrics match your filters' : show === 'hide' ? `Nothing waits for ${type.toLowerCase()} release` : `No isometric is ${type} complete yet`} description={itpNo || projectId || query ? 'Clear the filter or the search to see more isometrics.' : show === 'hide' ? `Isometrics appear here once they are marked ${type} complete on the isometric. Released ones show with Show released.` : `Mark an isometric ${type} complete on its Status card to release it here.`} action={itpNo || projectId || query ? <button className="btn" type="button" onClick={() => { setProjectId(''); setItpNo(''); setQuery(''); reset(); }}>Clear filters</button> : undefined}/>}
      <Pager page={current} pages={pages} onPage={setPage} total={list.length} size={length}/>
    </section>
    {dialog === 'filter' && <ReleaseFilterDialog projects={(rows.projects || []).filter(project => !project._archived)} itps={itpOptions} value={{ projectId, itpNo, show }} onClose={() => setDialog(null)} onGo={next => { setProjectId(next.projectId); setItpNo(next.itpNo); setShow(next.show); reset(); setDialog(null); }}/>}
    {dialog === 'release' && <ReleaseDialog type={type} isoIds={checked.map(entry => entry.iso.id)} itp={itpNo} onClose={() => setDialog(null)} onDone={() => setSelected([])}/>}
    {dialog === 'archive' && <ReleaseArchiveDialog type={type} onClose={() => setDialog(null)}/>}
    {dialog === 'upload' && <UploadSignedDialog type={type} onClose={() => setDialog(null)}/>}
  </div>;
}

/** The Filter dialog of the release pages: Project, ITP No and Show, applied with Go. */
function ReleaseFilterDialog({ projects, itps, value, onClose, onGo }: { projects: Row[]; itps: { value: string; label: string }[]; value: { projectId: string; itpNo: string; show: 'hide' | 'show' }; onClose: () => void; onGo: (value: { projectId: string; itpNo: string; show: 'hide' | 'show' }) => void }) {
  const { label } = useWorkspace(); const [draft, setDraft] = useState(value);
  return <Modal title="Filter" onClose={onClose}>
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); onGo(draft); }}><div className="modal-body">
      <div className="field"><label htmlFor="release-project">Project</label><select id="release-project" value={draft.projectId} onChange={event => setDraft({ ...draft, projectId: event.target.value })}><option value="">All</option>{projects.map(project => <option key={project.id} value={project.id}>{label('projects', project.id)}</option>)}</select></div>
      <div className="field"><label htmlFor="release-itp">ITP No</label><select id="release-itp" value={draft.itpNo} onChange={event => setDraft({ ...draft, itpNo: event.target.value })}><option value="">All</option>{itps.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      <div className="field"><label htmlFor="release-show">Show</label><select id="release-show" value={draft.show} onChange={event => setDraft({ ...draft, show: event.target.value as 'hide' | 'show' })}><option value="hide">Hide released</option><option value="show">Show released</option></select></div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Go</button></div></form>
  </Modal>;
}

/** Release selected: a confirmation only. The server numbers the document, marks the isometrics released, and the release note downloads. */
function ReleaseDialog({ type, isoIds, itp, onClose, onDone }: { type: ReleasePhase; isoIds: string[]; itp: string; onClose: () => void; onDone?: () => void }) {
  const { refresh, notify } = useWorkspace(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function confirm() {
    setBusy(true); setError('');
    try {
      const result = await post<{ records?: Row[] }>('/actions/release', { type, isoIds, itp });
      await refresh(); onDone?.(); onClose();
      const first = result.records?.[0];
      try { if (first) await downloadReleaseNote(first, text(first.reportNo) && `${type}-release-note-${text(first.reportNo)}`); notify(`${isoIds.length} ${isoIds.length === 1 ? 'isometric' : 'isometrics'} released for ${type.toLowerCase()}${first ? ` · report ${text(first.reportNo)}` : ''}.`); }
      catch { notify(`${isoIds.length} ${isoIds.length === 1 ? 'isometric' : 'isometrics'} released. The release note could not be created; open it from Options → Release archive.`); }
    } catch (failure) { setError((failure as Error).message || 'The release could not be saved.'); } finally { setBusy(false); }
  }
  return <Modal title="Release selected" onClose={onClose}>
    <div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <p>Are you sure you want to generate a release document?</p>
    </div>
    <div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" disabled={busy || !isoIds.length} onClick={() => void confirm()}>{busy && <Loader2 size={15} className="spin"/>}Confirm</button></div>
  </Modal>;
}

// ----- Release archive and signed documents -------------------------------------------------------------------------------

function useArchive(type: ReleasePhase): ReleaseArchiveRow[] {
  const { rows } = useWorkspace();
  return useMemo(() => releaseArchiveRows(rows.releases, type, { isometrics: rows.isometrics || [], projects: rows.projects || [], sites: rows.sites || [], itps: rows.itps, attachments: rows.attachments }), [rows, type]);
}

/** Options → Release archive: the generated release documents of the page, with their signed copies; ticked rows are deleted with Delete. */
function ReleaseArchiveDialog({ type, onClose }: { type: ReleasePhase; onClose: () => void }) {
  const { canRecord, refresh, notify } = useWorkspace(); const archive = useArchive(type); const { canExport, canPrint } = useTableRights();
  const [query, setQuery] = useState(''), [length, setLength] = useState(20), [page, setPage] = useState(0), [ticked, setTicked] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const label = (entry: ReleaseArchiveRow) => `${entry.reportNo} | ${entry.fileName}`;
  const list = useMemo(() => { const needle = query.trim().toLowerCase(); return archive.filter(entry => !needle || label(entry).toLowerCase().includes(needle)); }, [archive, query]);
  const { pages, current } = paging(list.length, page, length); const shown = list.slice(current * length, (current + 1) * length);
  const second = type === 'Prefab';
  async function open(entry: ReleaseArchiveRow) { setError(''); try { await downloadReleaseNote(entry.releases[0], entry.fileName); } catch (failure) { setError((failure as Error).message || 'The document could not be created.'); } }
  async function remove() {
    const doomed = archive.filter(entry => ticked.includes(entry.key)).flatMap(entry => entry.signed);
    if (!ticked.length) { setError('Tick the release documents to delete first.'); return; }
    if (!doomed.length) { setError('The ticked release documents have no uploaded signed copy. Only uploaded signed documents can be deleted; the release document stays with its release.'); return; }
    setBusy(true); setError('');
    try { for (const attachment of doomed) await post(`/records/attachments/${attachment.id}/archive`, { _version: attachment._version }); await refresh(); notify(`${doomed.length} signed ${doomed.length === 1 ? 'document' : 'documents'} deleted.`); setTicked([]); }
    catch (failure) { setError((failure as Error).message || 'The documents could not be deleted.'); await refresh().catch(() => undefined); } finally { setBusy(false); }
  }
  const header = second ? ['File', ''] : ['File'];
  const cells = (entry: ReleaseArchiveRow) => second ? [label(entry), entry.signed.length ? 'Signed copy uploaded' : ''] : [label(entry)];
  return <Modal title="Release archive" subtitle={`${type} release`} onClose={onClose} wide>
    <div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <TableTools labelPrefix="Release archive" exportable={canExport(releaseExportTable(type))} printable={canPrint(releaseExportTable(type))} lengths={[5, 20, 50, 100]} length={length} onLength={value => { setLength(value); setPage(0); }} query={query} onQuery={value => { setQuery(value); setPage(0); }}
        onCsv={() => sendTable(releaseExportTable(type), 'csv', `${type.toLowerCase()}-release-archive`, header, list.map(cells), setError)} onExcel={() => sendTable(releaseExportTable(type), 'xlsx', `${type.toLowerCase()}-release-archive`, header, list.map(cells), setError)}/>
      <TableScroll><table className="data-table release-archive-table" aria-label={`${type} release archive`}>
        <thead><tr><th scope="col">File</th>{second && <th scope="col"><span className="sr-only">Signed copy</span></th>}</tr></thead>
        <tbody>{shown.map(entry => <tr key={entry.key}>
          <td><label className="release-archive-file"><input type="checkbox" aria-label={`Check ${label(entry)} for delete`} checked={ticked.includes(entry.key)} onChange={event => setTicked(old => event.target.checked ? [...old, entry.key] : old.filter(key => key !== entry.key))}/>
            <button type="button" className="text-link" onClick={() => void open(entry)}><FileText size={13} aria-hidden="true"/>{label(entry)}</button></label>
            {!second && entry.signed.map(file => <div key={file.id} className="release-archive-signed"><Printer size={13} aria-hidden="true"/><a className="text-link" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer">{entry.reportNo} | {text(file.name)}</a></div>)}</td>
          {second && <td>{entry.signed.map(file => <a key={file.id} className="icon-btn" href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer" aria-label={`Signed copy ${text(file.name)}`} title={`Signed copy: ${text(file.name)}`}><Printer size={15}/></a>)}</td>}</tr>)}</tbody></table></TableScroll>
      {!list.length && <p className="muted" role="status">No data available in table</p>}
      <Pager page={current} pages={pages} onPage={setPage} total={list.length} size={length}/>
      <p className="muted">Check for delete: ticked rows lose their uploaded signed copy when you press Delete.</p>
    </div>
    <div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>{canRecord('attachments', 'delete') && <button type="button" className="btn primary" disabled={busy} onClick={() => void remove()}>{busy && <Loader2 size={15} className="spin"/>}Delete</button>}</div>
  </Modal>;
}

/** Options → Upload signed docs: choose the report, then one or more PDF files. They are attached to the release document. */
function UploadSignedDialog({ type, onClose }: { type: ReleasePhase; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const archive = useArchive(type);
  const [reportKey, setReportKey] = useState(''), [files, setFiles] = useState<File[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const entry = archive.find(item => item.key === reportKey);
    if (!entry) { setError('Select the report first.'); return; }
    if (!files.length) { setError('Choose at least one PDF file.'); return; }
    if (files.some(file => !/\.pdf$/i.test(file.name))) { setError('Only PDF files are allowed.'); return; }
    setBusy(true);
    try {
      for (const file of files) { const body = new FormData(); body.set('file', file); body.set('entityType', 'releases'); body.set('entityId', entry.releases[0].id); body.set('documentType', SIGNED_RELEASE_DOCUMENT); await api('/files', { method: 'POST', body }); }
      await refresh(); notify(`${files.length} signed ${files.length === 1 ? 'document' : 'documents'} uploaded to report ${entry.reportNo}.`); onClose();
    } catch (failure) { setError((failure as Error).message || 'The upload failed.'); await refresh().catch(() => undefined); } finally { setBusy(false); }
  }
  return <Modal title="Upload signed docs" subtitle={`${type} release`} onClose={onClose}>
    <form onSubmit={event => void submit(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="field"><label htmlFor="signed-report">Select report:</label><select id="signed-report" value={reportKey} onChange={event => setReportKey(event.target.value)}><option value="">{archive.length ? '' : 'No release documents yet'}</option>{archive.map(entry => <option key={entry.key} value={entry.key}>{entry.reportNo} - {entry.itpLabel}</option>)}</select></div>
      <div className="field"><label htmlFor="signed-files">Document Only PDFs are allowed</label><input id="signed-files" type="file" accept=".pdf,application/pdf" multiple onChange={event => setFiles([...(event.target.files || [])])}/></div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy || !archive.length}>{busy && <Loader2 size={15} className="spin"/>}Upload</button></div></form>
  </Modal>;
}

// ----- Status card of the isometric ----------------------------------------------------------------------------------

const PILL: Record<PhaseState['state'], string> = { released: 'green', completed: 'green', ready: 'blue', 'not-ready': 'amber' };

/**
 * Per phase on the isometric's Status card (Weld Pilot only): "Prefab not ready" with the reasons, the "Prefab
 * complete" button with the reference confirmation, or "Prefab completed" with Reopen; the same for Field. Once
 * completed: "Create release doc" (confirm, generates the release document for this isometric and marks it released)
 * when the phase's ITP is filled in, else "Release not available" with the reason. "Batch release" links to the pages.
 */
export function ReleaseStatus({ iso }: { iso: Row }) {
  const { canRecord, canRun } = useWorkspace(); const pilot = usePilot(); const source = useReleaseSource();
  const [completing, setCompleting] = useState<ReleasePhase | ''>(''), [reopening, setReopening] = useState<ReleasePhase | ''>(''), [creating, setCreating] = useState<ReleasePhase | ''>('');
  const input: ReleaseCheckInput = useMemo(() => ({ iso, welds: source.welds, weldTypes: source.weldTypes, results: source.results, releases: source.releases, punch: source.punch }), [iso, source]);
  const prefab = useMemo(() => phaseState('Prefab', input), [input]), field = useMemo(() => phaseState('Field', input), [input]);
  if (pilot?.pilot.key === 'mto' || !canRecord('releases')) return null;
  const phase = (type: ReleasePhase, state: PhaseState) => {
    const done = state.state === 'completed' || state.state === 'released';
    const itp = releaseItpOf(iso, type);
    return <div className="iso-release-phase" key={type}>
      <div className="iso-release-line"><span className="iso-release-name">{type}</span>
        {state.state === 'ready' && canRun('complete-phase', { type }) ? <button className="btn small primary" type="button" onClick={() => setCompleting(type)}>{type} complete</button>
          : <span className={`release-pill ${PILL[state.state]}`}>{done && <Lock size={12} aria-hidden="true"/>}{state.state === 'ready' ? `${type} ready` : state.label}</span>}</div>
      {done && state.completion && <small className="iso-release-meta">{formatDate(state.completion.at)} · {state.completion.by || 'unknown'}{state.release ? ` · released ${text(state.release.reportNo || state.release.number)}` : ''}</small>}
      {!source.limited && state.state === 'not-ready' && <details className="release-reasons"><summary>Why {type.toLowerCase()} is not ready</summary><ul>{state.check.reasons.map((reason, index) => <li key={`${reason.group}-${index}`}><strong>{reason.title}</strong> {reason.message}</li>)}</ul></details>}
      <div className="iso-release-actions">
        {done && canRun('reopen-release', { type }) && <button className="btn small" type="button" onClick={() => setReopening(type)}><Unlock size={14}/>Reopen</button>}
        {state.state === 'completed' && (itp
          ? canRun('release', { type }) && <button className="btn small iso-release-doc" type="button" onClick={() => setCreating(type)}><FileText size={14}/>Create release doc</button>
          : <span className="release-pill neutral" title={ITP_MISSING[type]} tabIndex={0}>Release not available<span className="sr-only"> — {ITP_MISSING[type]}</span></span>)}
        {state.state === 'released' && state.release && <ReleasePdfButton release={state.release}/>}
      </div>
    </div>;
  };
  return <section className="iso-release" aria-label="Prefab and field release">
    {phase('Prefab', prefab)}{phase('Field', field)}
    <p className="iso-release-batch">Batch release: <Link className="text-link" to="/welding/releases?view=prefab">Prefab overview</Link> | <Link className="text-link" to="/welding/releases?view=field">Field overview</Link></p>
    {completing && <CompleteDialog iso={iso} type={completing} onClose={() => setCompleting('')}/>}
    {reopening && <ReopenDialog iso={iso} type={reopening} onClose={() => setReopening('')}/>}
    {creating && <CreateReleaseDocDialog iso={iso} type={creating} onClose={() => setCreating('')}/>}
  </section>;
}

/** "Create release doc" on the isometric: confirm (naming the ITP), then the server generates the document for this one isometric and marks it released. */
function CreateReleaseDocDialog({ iso, type, onClose }: { iso: Row; type: ReleasePhase; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const itp = releaseItpOf(iso, type);
  async function confirm() {
    setBusy(true); setError('');
    try {
      const result = await post<{ records?: Row[] }>('/actions/release', { type, isoIds: [iso.id], itp });
      await refresh(); onClose(); const first = result.records?.[0];
      try { if (first) await downloadReleaseNote(first, text(first.reportNo) && `${type}-release-note-${text(first.reportNo)}`); notify(`${text(iso.isoNo)} is released for ${type.toLowerCase()}${first ? ` · report ${text(first.reportNo)}` : ''}.`); }
      catch { notify(`${text(iso.isoNo)} is released. The release note could not be created; use Release PDF on the Status card.`); }
    } catch (failure) { setError((failure as Error).message || 'The release document could not be created.'); } finally { setBusy(false); }
  }
  return <Modal title="Release selected" subtitle={text(iso.isoNo)} onClose={onClose}>
    <div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <p>Are you sure you want to generate a {type} release document for this isometric? {type === 'Prefab' ? 'ITP' : 'ITP 2'}: {itp} — after generation the isometric is marked as released.</p>
    </div>
    <div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={() => void confirm()}>{busy && <Loader2 size={15} className="spin"/>}Confirm</button></div>
  </Modal>;
}

/** "Prefab complete" / "Field complete": a confirmation only (reference wording); the server checks the phase again. */
function CompleteDialog({ iso, type, onClose }: { iso: Row; type: ReleasePhase; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function confirm() {
    setBusy(true); setError('');
    try { await post('/actions/complete-phase', { isoId: iso.id, type }); await refresh(); notify(`${text(iso.isoNo)} is ${type} complete. The ${PHASE_LOCATION[type]} welds are locked.`); onClose(); }
    catch (failure) { setError((failure as Error).message || `${type} complete could not be saved.`); } finally { setBusy(false); }
  }
  return <Modal title={`${type} complete`} subtitle={text(iso.isoNo)} onClose={onClose}>
    <div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <p>{COMPLETE_CONFIRM[type]}</p>
    </div>
    <div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={() => void confirm()}>{busy && <Loader2 size={15} className="spin"/>}Confirm</button></div>
  </Modal>;
}

/** Reopen asks for a reason; the reason is kept in the audit trail and with a release document of the phase. */
function ReopenDialog({ iso, type, onClose }: { iso: Row; type: ReleasePhase; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); const value = reason.trim();
    if (!value) { setError('Enter the reason for reopening.'); return; }
    setBusy(true); setError('');
    try { await post('/actions/reopen-release', { isoId: iso.id, type, reason: value }); await refresh(); notify(`${type} complete reopened. The ${PHASE_LOCATION[type]} welds are unlocked.`); onClose(); }
    catch (failure) { setError((failure as Error).message || `${type} complete could not be reopened.`); } finally { setBusy(false); }
  }
  const welds = PHASE_LOCATION[type];
  return <Modal title={`Reopen ${type.toLowerCase()} complete`} subtitle={text(iso.isoNo)} onClose={onClose}>
    <form onSubmit={event => void submit(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <p>Are you sure you want to reopen {type} complete?</p>
      <p className="muted">{type === 'Prefab' ? 'Shop welds become editable again. The isometric is removed from the prefab release overview.' : 'The isometric is removed from the field release overview.'} The {welds} welds are unlocked; a release document of this phase is kept as history.</p>
      <div className="field"><label htmlFor="reopen-reason">Reason for reopening <span className="required">*</span></label><textarea id="reopen-reason" rows={4} required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} aria-invalid={Boolean(error) && !reason.trim()}/><small className="field-hint">{reason.length} / 500 · recorded in the audit trail</small></div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin"/>}<RotateCcw size={15}/>Reopen</button></div></form>
  </Modal>;
}

// ----- Field work packages -------------------------------------------------------------------------------------------

/** The route of `/…/field_packages`: the packages themselves, and the assignment of isometrics to them (the menu opens the assignment). */
export function FieldPackagesPage() {
  const { canRecord, canArea } = useWorkspace(); const [params, setParams] = useSearchParams();
  const canPackages = canRecord('field_packages'), canAssign = canArea('91') && canRecord('isometrics');
  if (!canPackages && !canAssign) return <Restricted what="field work packages"/>;
  const requested = params.get('tab') === 'packages' ? 'packages' : 'assign';
  const tab = requested === 'assign' && canAssign ? 'assign' : requested === 'packages' && canPackages ? 'packages' : canPackages ? 'packages' : 'assign';
  const tabs = [['packages', 'Field Work Packages', canPackages], ['assign', 'Assign Iso to FWP', canAssign]] as const;
  return <div className="page releases-page">
    <div className="page-heading"><div><div className="eyebrow">WELD PILOT · RELEASES</div><h1>{tab === 'packages' ? 'Field work packages' : 'Assign Iso to FWP'}</h1><p>{tab === 'packages' ? 'Name the packages that field crews work from.' : 'Assign the isometrics of the active main project to a field work package.'}</p></div></div>
    <div className="table-tabs fwp-tabs" role="tablist" aria-label="Field work packages">{tabs.filter(([, , allowed]) => allowed).map(([key, title]) => <button key={key} type="button" role="tab" id={`fwp-tab-${key}`} aria-selected={tab === key} aria-controls={`fwp-panel-${key}`} className={tab === key ? 'selected' : ''} onClick={() => setParams({ tab: key })}>{title}</button>)}</div>
    <div role="tabpanel" id={`fwp-panel-${tab}`} aria-labelledby={`fwp-tab-${tab}`}>{tab === 'packages' ? <PackagesTab/> : <AssignTab/>}</div>
  </div>;
}

function PackagesTab() {
  const { rows, label, canRecord } = useWorkspace(); const [query, setQuery] = useState(''), [editor, setEditor] = useState<Row | 'new' | null>(null), [archiving, setArchiving] = useState<Row | null>(null), [page, setPage] = useState(0);
  const SIZE = 25;
  const projectIds = new Set((rows.projects || []).map(project => project.id));
  const counts = useMemo(() => { const map = new Map<string, number>(); for (const iso of rows.isometrics || []) if (!iso._archived && iso.fieldPackageId) map.set(String(iso.fieldPackageId), (map.get(String(iso.fieldPackageId)) || 0) + 1); return map; }, [rows.isometrics]);
  const list = useMemo(() => (rows.field_packages || []).filter(item => !item._archived && (!item.projectId || projectIds.has(String(item.projectId))) && (!query.trim() || [item.name, item.description, item.number].some(value => text(value).toLowerCase().includes(query.trim().toLowerCase())))).sort((a, b) => text(a.name).localeCompare(text(b.name), 'en', { numeric: true })), [rows.field_packages, rows.projects, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const { pages, current } = paging(list.length, page, SIZE), shown = list.slice(current * SIZE, (current + 1) * SIZE);
  return <section className="table-card" aria-label="Field work packages">
    <div className="table-toolbar"><SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder="Search field work packages…"/>{canRecord('field_packages', 'insert') && <div className="toolbar-right"><button className="btn primary small" type="button" onClick={() => setEditor('new')}><Plus size={15}/>Add field work package</button></div>}</div>
    <TableScroll><table className="data-table" aria-label="Field work packages"><thead><tr><th scope="col">Name</th><th scope="col">Description</th><th scope="col">Project</th><th scope="col">Package no.</th><th scope="col">Isometrics</th><th scope="col"><span className="sr-only">Options</span></th></tr></thead>
      <tbody>{shown.map(item => <tr key={item.id}><td><strong>{text(item.name)}</strong></td><td>{text(item.description) || '—'}</td><td>{item.projectId ? label('projects', item.projectId) : <span className="muted">All projects</span>}</td><td>{text(item.number) || '—'}</td><td className="tabular">{formatNumber(counts.get(item.id) || 0, 0)}</td>
        <td className="actions-cell">{canRecord('field_packages', 'edit', item) && <button className="icon-btn" type="button" aria-label={`Edit ${text(item.name)}`} onClick={() => setEditor(item)}><Pencil size={16}/></button>}{canRecord('field_packages', 'delete', item) && <button className="icon-btn" type="button" aria-label={`Archive ${text(item.name)}`} onClick={() => setArchiving(item)}><Archive size={16}/></button>}</td></tr>)}</tbody></table></TableScroll>
    {!list.length && <EmptyState title={query ? 'No field work packages match' : 'No field work packages yet'} description={query ? 'Try another search.' : 'Add a package, then assign isometrics to it on the Assign Iso to FWP tab.'} action={query ? <button className="btn" type="button" onClick={() => setQuery('')}>Clear search</button> : canRecord('field_packages', 'insert') ? <button className="btn primary" type="button" onClick={() => setEditor('new')}><Plus size={16}/>Add field work package</button> : undefined}/>}
    <Pager page={current} pages={pages} onPage={setPage} total={list.length} size={SIZE}/>
    {editor && <RecordEditor resourceKey="field_packages" record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
    {archiving && <ArchiveRecordDialog resourceKey="field_packages" record={archiving} onClose={() => setArchiving(null)}/>}
  </section>;
}

const SHOW_ASSIGNMENT = [['all', 'All', ''], ['onlyOn', 'With FWP', 'assigned'], ['onlyOff', 'Without FWP', 'unassigned']] as const;

/** The Assign Iso to FWP tab: top bar Assign Iso to FWP + Set phase (Mass) (once rows are checked), Filter, Export; the table with its Check column. */
function AssignTab() {
  const { rows, label, canRun, canArea, canRecord, refresh, notify } = useWorkspace();
  const [projectId, setProjectId] = useState(''), [packageId, setPackageId] = useState(''), [assignment, setAssignment] = useState('all'), [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]), [length, setLength] = useState(25), [page, setPage] = useState(0), [dialog, setDialog] = useState<'filter' | 'assign' | 'phase' | null>(null);
  const projectIds = new Set((rows.projects || []).map(project => project.id));
  const packages = useMemo(() => (rows.field_packages || []).filter(item => !item._archived && (!item.projectId || projectIds.has(String(item.projectId)))), [rows.field_packages, rows.projects]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => fwpListRows({ isometrics: rows.isometrics || [], projects: rows.projects || [], testSystems: rows.test_systems || [], fieldPackages: rows.field_packages || [] }, { projectId, fieldPackageId: packageId, assignment: SHOW_ASSIGNMENT.find(item => item[0] === assignment)?.[2] ?? '', query }), [rows, projectId, packageId, assignment, query]);
  const { pages, current } = paging(list.length, page, length), shown = list.slice(current * length, (current + 1) * length);
  const allowed = canRun('assign-fwp'); const checked = list.filter(entry => selected.includes(entry.iso.id));
  const phaseAllowed = canRun('phases');
  useEffect(() => { setSelected(old => old.filter(id => list.some(entry => entry.iso.id === id))); }, [list]);
  const reset = () => { setPage(0); setSelected([]); };
  const header = ['Project', 'ISO', 'Diameter', 'Paint spec.', 'Asset tag', 'Test pressure', 'Test medium', 'Test system', 'FWP'];
  const cells = (entry: (typeof list)[number]) => [entry.project ? label('projects', entry.project.id) : '', entry.iso.isoNo, entry.iso.nomDiameter, entry.iso.paintSpec, entry.iso.assetTag, entry.iso.testPressure, entry.iso.testMedium, entry.testSystem?.name, entry.fieldPackage?.name];
  return <section className="table-card" aria-label="Assign isometrics to field work packages">
    <div className="release-topbar" role="toolbar" aria-label="Assign Iso to FWP actions">
      {allowed && checked.length > 0 && <button className="btn primary small" type="button" onClick={() => setDialog('assign')}>Assign Iso to FWP</button>}
      {phaseAllowed && checked.length > 0 && <button className="btn small" type="button" onClick={() => setDialog('phase')}>Set phase (Mass)</button>}
      <button className="btn small" type="button" onClick={() => setDialog('filter')}><SlidersHorizontal size={15}/>Filter</button>
      {canArea('91', areaVerb('91')) && <button className="btn small" type="button" disabled={!list.length} onClick={() => sendTable('assign-fwp', 'xlsx', 'isometrics-field-work-packages', header, list.map(cells), message => notify(message))}><Download size={15}/>Export</button>}
    </div>
    <div className="table-toolbar release-tools">
      <label className="release-length">Show <select aria-label="Entries per page" value={length} onChange={event => { setLength(Number(event.target.value)); setPage(0); }}>{ASSIGN_PAGE_LENGTHS.map(value => <option key={value} value={value}>{value}</option>)}</select> entries</label>
      <SearchInput value={query} onChange={value => { setQuery(value); reset(); }} placeholder="Search"/>
    </div>
    <TableScroll><table className="data-table release-table" aria-label="Isometrics and their field work packages"><thead><tr>{header.map(column => <th key={column} scope="col">{column}</th>)}
      <th scope="col" className="select-cell">{allowed ? <><span className="sr-only">Check</span><input type="checkbox" aria-label="Check all isometrics on this page" ref={input => { if (input) input.indeterminate = shown.some(entry => selected.includes(entry.iso.id)) && !shown.every(entry => selected.includes(entry.iso.id)); }} checked={shown.length > 0 && shown.every(entry => selected.includes(entry.iso.id))} onChange={event => setSelected(old => event.target.checked ? [...new Set([...old, ...shown.map(entry => entry.iso.id)])] : old.filter(id => !shown.some(entry => entry.iso.id === id)))}/></> : 'Check'}</th></tr></thead>
      <tbody>{shown.map(entry => <tr key={entry.iso.id}><td>{entry.project ? label('projects', entry.project.id) : '—'}</td><td><Link className="record-link" to={`/workspace/isometrics/${entry.iso.id}`}>{text(entry.iso.isoNo)}</Link></td>
        <td>{text(entry.iso.nomDiameter) || '—'}</td><td>{text(entry.iso.paintSpec) || '—'}</td><td>{text(entry.iso.assetTag) || '—'}</td><td>{text(entry.iso.testPressure) || '—'}</td><td>{text(entry.iso.testMedium) || '—'}</td><td>{entry.testSystem ? text(entry.testSystem.name) : '—'}</td>
        <td>{entry.fieldPackage ? <Badge color="neutral">{text(entry.fieldPackage.name)}</Badge> : <span className="muted">—</span>}</td>
        <td className="select-cell">{allowed ? <input type="checkbox" aria-label={`Check ${text(entry.iso.isoNo)}`} checked={selected.includes(entry.iso.id)} onChange={event => setSelected(old => event.target.checked ? [...old, entry.iso.id] : old.filter(id => id !== entry.iso.id))}/> : null}</td></tr>)}</tbody></table></TableScroll>
    {!list.length && <EmptyState title={projectId || packageId || assignment !== 'all' || query ? 'No isometrics match your filters' : 'No isometrics in this main project yet'} description={projectId || packageId || assignment !== 'all' || query ? 'Clear a filter to see more isometrics.' : 'Add isometrics under the main project, then assign them to a field work package here.'} action={projectId || packageId || assignment !== 'all' || query ? <button className="btn" type="button" onClick={() => { setProjectId(''); setPackageId(''); setAssignment('all'); setQuery(''); reset(); }}>Clear filters</button> : undefined}/>}
    <Pager page={current} pages={pages} onPage={setPage} total={list.length} size={length}/>
    <p className="release-count" role="status">Showed {list.length} {list.length === 1 ? 'isometric' : 'isometrics'}</p>
    {dialog === 'filter' && <FwpFilterDialog projects={(rows.projects || []).filter(project => !project._archived)} packages={packages} value={{ projectId, packageId, assignment }} onClose={() => setDialog(null)} onGo={next => { setProjectId(next.projectId); setPackageId(next.packageId); setAssignment(next.assignment); reset(); setDialog(null); }}/>}
    {dialog === 'assign' && <AssignDialog isometrics={checked.map(entry => entry.iso)} packages={packages} onClose={() => setDialog(null)} onDone={() => setSelected([])}/>}
    {dialog === 'phase' && canRecord('isometrics') && <PhaseDialog records={checked.map(entry => entry.iso)} onClose={() => setDialog(null)} onDone={() => setSelected([])}/>}
  </section>;
}

/** The Filter dialog of the Assign Iso to FWP tab: Project, FWP and Show (All, With FWP, Without FWP), applied with Go. */
function FwpFilterDialog({ projects, packages, value, onClose, onGo }: { projects: Row[]; packages: Row[]; value: { projectId: string; packageId: string; assignment: string }; onClose: () => void; onGo: (value: { projectId: string; packageId: string; assignment: string }) => void }) {
  const { label } = useWorkspace(); const [draft, setDraft] = useState(value);
  return <Modal title="Filter" onClose={onClose}>
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); onGo(draft); }}><div className="modal-body">
      <div className="field"><label htmlFor="fwp-project">Project</label><select id="fwp-project" value={draft.projectId} onChange={event => setDraft({ ...draft, projectId: event.target.value })}><option value="">All</option>{projects.map(project => <option key={project.id} value={project.id}>{label('projects', project.id)}</option>)}</select></div>
      <div className="field"><label htmlFor="fwp-package">FWP</label><select id="fwp-package" value={draft.packageId} onChange={event => setDraft({ ...draft, packageId: event.target.value })}><option value="">All</option>{packages.map(item => <option key={item.id} value={item.id}>{text(item.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="fwp-show">Show</label><select id="fwp-show" value={draft.assignment} onChange={event => setDraft({ ...draft, assignment: event.target.value })}>{SHOW_ASSIGNMENT.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></div>
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Go</button></div></form>
  </Modal>;
}

/** Assign Iso to FWP: choose the package ("----" clears the assignment) and Confirm. */
function AssignDialog({ isometrics, packages, onClose, onDone }: { isometrics: Row[]; packages: Row[]; onClose: () => void; onDone: () => void }) {
  const { refresh, notify } = useWorkspace(); const [target, setTarget] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const targetRow = packages.find(item => item.id === target);
  const mismatched = targetRow ? isometrics.filter(iso => !fwpAccepts(targetRow, iso)) : [];
  async function confirm(event: FormEvent) {
    event.preventDefault(); if (mismatched.length) return; setBusy(true); setError('');
    try { await post('/actions/assign-fwp', { isoIds: isometrics.map(iso => iso.id), fieldPackageId: target }); await refresh(); notify(target ? `${isometrics.length} ${isometrics.length === 1 ? 'isometric' : 'isometrics'} assigned to ${text(targetRow?.name)}.` : `${isometrics.length} ${isometrics.length === 1 ? 'isometric' : 'isometrics'} removed from their package.`); onDone(); onClose(); }
    catch (failure) { setError((failure as Error).message || 'The assignment could not be saved.'); } finally { setBusy(false); }
  }
  return <Modal title="Assign Iso to FWP" subtitle={`${isometrics.length} ${isometrics.length === 1 ? 'isometric' : 'isometrics'} checked`} onClose={onClose}>
    <form onSubmit={event => void confirm(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <div className="field"><label htmlFor="assign-fwp">FWP</label><select id="assign-fwp" value={target} onChange={event => setTarget(event.target.value)}><option value="">----</option>{packages.map(item => <option key={item.id} value={item.id}>{text(item.name)}</option>)}</select></div>
      {mismatched.length > 0 && <span className="field-error" role="alert">{text(targetRow?.name)} belongs to another project than {mismatched.slice(0, 2).map(iso => text(iso.isoNo)).join(', ')}{mismatched.length > 2 ? ` and ${mismatched.length - 2} more` : ''}.</span>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy || !isometrics.length || mismatched.length > 0}>{busy && <Loader2 size={15} className="spin"/>}Confirm</button></div></form>
  </Modal>;
}
