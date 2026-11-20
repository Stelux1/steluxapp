import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpDown, Bell, BellOff, Pause, Play, ChevronLeft, ChevronRight, ChevronDown, CreditCard, Download, FileText, MoreHorizontal, Paperclip, Pencil, Plus, Printer, RotateCcw, Settings, SlidersHorizontal, Trash2, User } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { DEFAULT_WELDER_PAGE_SIZE, NO_WELDER_FILTER, SUMMARY_LIST, WELDER_DEACTIVATE_CONFIRM, WELDERCARD_LINE_COLUMNS, WELDERCARD_LISTS, WELDERCARD_PATH, WELDER_FILTER_ORDER, WELDER_PAGE_SIZES, activeText, cardLineCells, cardOptions, cardOptionsListed, customsOfWelder, defaultWelderSite, documentNameOptions, documentNote, documentWps, expiringQualifications, filterWelders, joinIds, joinWqNos, notificationsOn, notifyDays, splitIds, splitWqNos, summaryListOf, todayIso, welderCardHeading, welderCardLines, welderDocuments, welderFilterCount, welderOnSite, welderTab, welderTabCounts, welderWqNumbers, wpsChoices, wqNoOf, type WelderCardFilter, type WelderTab } from '../shared/welder-data.ts';
import { RELATIONS, relationIds } from './catalog.ts';
import { activeRows, useWorkspace } from './context.tsx';
import { api, apiUrl, formatDate, formatNumber, post } from './api.ts';
import { Badge, Dropdown, EmptyState, Modal, SearchInput, TableScroll } from './components.tsx';
import { RecordEditor } from './dialogs.tsx';
import { ArchiveRecordDialog } from './archive-record.tsx';

const TABS: { key: WelderTab; label: string }[] = [{ key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' }, { key: 'deleted', label: 'Deleted' }];
const COLUMNS = [['number', 'ID nr.'], ['name', 'Name'], ['company', 'Company'], ['customs', 'Customs'], ['projects', 'Active on projects'], ['currentlyOn', 'Currently on'], ['description', 'Note'], ['status', 'Active']] as const;
type Column = typeof COLUMNS[number][0];
type Dialog = { kind: 'show' | 'files' | 'card'; welder: Row } | null;

/** A labelled select (the dialogs below are small forms of their own, outside the generic record editor). */
function Pick({ label, value, onChange, children, multiple = false, id }: { label: string; value: string | string[]; onChange: (value: string | string[]) => void; children: React.ReactNode; multiple?: boolean; id: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label><div className="select-wrap"><select id={id} multiple={multiple} value={value} onChange={event => onChange(multiple ? Array.from(event.target.selectedOptions, option => option.value) : event.target.value)}>{children}</select></div></div>;
}

/** Welders (Weld Pilot): Active / Inactive / Deleted tabs, reference columns, card filter, Personnel data, Welder card, certificates and files. */
export function WeldersPage() {
  const { rows, allRows, siteId, canRecord, label, refresh, notify } = useWorkspace();
  const [tab, setTab] = useState<WelderTab>('active'); const [q, setQ] = useState(''); const [project, setProject] = useState(() => defaultWelderSite(siteId));
  // The list opens on the active main project; switching the main project in the top bar moves it along.
  useEffect(() => { setProject(defaultWelderSite(siteId)); setPage(0); }, [siteId]);
  const [filter, setFilter] = useState<WelderCardFilter>(NO_WELDER_FILTER); const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<{ column: Column; direction: 1 | -1 }>({ column: 'number', direction: 1 });
  const [page, setPage] = useState(0); const [size, setSize] = useState(DEFAULT_WELDER_PAGE_SIZE);
  const [editor, setEditor] = useState<Row | 'new' | null>(null); const [dialog, setDialog] = useState<Dialog>(null); const [archiving, setArchiving] = useState<Row | null>(null); const [deactivating, setDeactivating] = useState<Row | null>(null);
  const sites = RELATIONS.welders?.find(relation => relation.field === 'siteIds');
  const linkedSites = (welder: Row) => sites ? relationIds(allRows, sites, welder.id) : [];
  const projectNames = (welder: Row) => linkedSites(welder).map(id => label('sites', id));
  const textOf = (welder: Row, column: Column): string => column === 'company' ? String(welder.companyId ? label('companies', welder.companyId) : '') : column === 'customs' ? customsOfWelder(rows.welder_certificates, welder.id, rows.welder_customs_catalog).join(', ') : column === 'projects' ? projectNames(welder).join(', ') : String(welder[column] ?? '');
  const welders = rows.welders || [];
  const scoped = useMemo(() => {
    const query = q.toLowerCase().trim();
    const onProject = (welder: Row) => welderOnSite(welder, linkedSites(welder), project);
    return filterWelders(welders.filter(welder => onProject(welder) && (!query || [...COLUMNS.map(([column]) => textOf(welder, column)), String(welder.welderCode || '')].some(value => value.toLowerCase().includes(query)))), rows, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, project, filter]);
  const counts = welderTabCounts(scoped);
  const shownRows = useMemo(() => scoped.filter(welder => welderTab(welder) === tab).sort((a, b) => textOf(a, sort.column).localeCompare(textOf(b, sort.column), 'en', { numeric: true }) * sort.direction),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, tab, sort, rows]);
  const pages = Math.max(1, Math.ceil(shownRows.length / size)), current = Math.min(page, pages - 1), shown = shownRows.slice(current * size, (current + 1) * size);
  const expiring = useMemo(() => new Set(expiringQualifications(rows, todayIso()).map(warning => warning.welderId)), [rows]);
  const filterCount = welderFilterCount(filter) + (project ? 1 : 0);
  const creatable = canRecord('welders', 'insert');
  const csvUrl = (format: string) => apiUrl(`/export/welders?format=${format}&archived=true&ids=${shownRows.map(row => row.id).join(',') || '__none__'}`);
  if (!canRecord('welders')) return <EmptyState title="This area is restricted" description="Your profile does not include welders."/>;
  /** Deactivate / Activate: one request (the welder moves to the other tab). Deactivate first asks "Set this welder inactive?" as the reference does. */
  async function setActive(welder: Row, active: boolean) {
    try { await api(`/records/welders/${welder.id}`, { method: 'PUT', body: JSON.stringify({ status: active ? 'Active' : 'Inactive', _version: welder._version }) }); await refresh(); notify(active ? 'Welder activated.' : 'Welder deactivated.'); }
    catch (error) { notify((error as Error).message); }
  }
  const toggle = (column: Column) => setSort(old => ({ column, direction: old.column === column && old.direction === 1 ? -1 : 1 }));
  const reset = () => { setQ(''); setProject(''); setFilter(NO_WELDER_FILTER); setPage(0); };
  const homeLocation = (welder: Row) => (project ? [label('sites', project)] : projectNames(welder)).join(', ');
  return <div className="page records-page welders-page">
    <div className="page-heading"><div><div className="eyebrow">WELDING</div><h1>Welders<span className="heading-count">{counts.active + counts.inactive}</span></h1><p>Welder identities, deployment, roles and qualifications.</p></div>
      <div className="heading-actions">{canRecord('weldercard_options') && <Link className="btn icon-label" to={WELDERCARD_PATH} title="Weldercard settings" aria-label="Weldercard settings"><Settings size={16}/><span className="sr-only">Weldercard settings</span></Link>}
        <button className={`btn ${filterCount ? 'active-filter' : ''}`} aria-haspopup="dialog" title="Filter" aria-label="Filter" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={16}/>{welderFilterCount(filter) > 0 && <span className="count-pill">{welderFilterCount(filter)}</span>}<span className="sr-only">Filter</span></button>
        {creatable && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add Welder</button>}</div></div>
    <div className="table-card">
      <div className="table-card-top"><div className="table-tabs" role="tablist" aria-label="Welder status">{TABS.map(item => <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'selected' : ''} onClick={() => { setTab(item.key); setPage(0); }}>{item.label}<span aria-label={`${counts[item.key]} welders`}>{counts[item.key]}</span></button>)}</div>
        <div className="table-utilities">{(canRecord('welders', 'export') || canRecord('welders', 'print')) && <Dropdown trigger={<span className="btn subtle small"><Download size={15}/>Export<ChevronDown size={12}/></span>}>{canRecord('welders', 'export') && <><a href={csvUrl('csv')}>Download CSV</a><a href={csvUrl('xlsx')}>Download Excel</a></>}{canRecord('welders', 'print') && <button onClick={() => window.print()}><Printer size={14}/>Print / Save as PDF</button>}</Dropdown>}</div></div>
      <div className="table-toolbar"><SearchInput value={q} onChange={value => { setQ(value); setPage(0); }} placeholder="Search welders…"/>
        <div className="toolbar-right"><div className="field welder-project-filter"><label htmlFor="welder-project">Main project</label><div className="select-wrap"><select id="welder-project" value={project} onChange={event => { setProject(event.target.value); setPage(0); }}><option value="">All</option>{activeRows(allRows, 'sites').map(site => <option key={site.id} value={site.id}>{String(site.name)}</option>)}</select></div></div>
          {project && <span className="muted welder-home-location">Home location: {label('sites', project)}</span>}
          {filterCount > 0 && <button className="text-link" onClick={reset}>Reset filters</button>}</div></div>
      <TableScroll><table className="data-table"><thead><tr>{COLUMNS.map(([column, title]) => <th key={column} aria-sort={sort.column === column ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button onClick={() => toggle(column)}>{title}<ArrowUpDown size={12} className={sort.column === column ? 'sort-active' : ''}/></button></th>)}<th className="actions-cell"><span className="sr-only">Options</span></th></tr></thead>
        <tbody>{shown.map(welder => <tr key={welder.id}>
          {COLUMNS.map(([column]) => <td key={column} className={column === 'description' ? 'description-cell' : ''}>{column === 'name' ? <button className="record-link" onClick={() => setDialog({ kind: 'show', welder })}>{String(welder.name || welder.number)}</button>
            : column === 'status' ? <>{activeText(welder)}</>
            : column === 'projects' ? <>{textOf(welder, column) || (welder.globallyDeployable ? <span className="muted">All (globally deployable)</span> : <span className="muted">—</span>)}</>
            : textOf(welder, column) || <span className="muted">—</span>}{column === 'name' && expiring.has(welder.id) && <span className="welder-expiry-flag" title="A qualification is expired or expires soon">Qualification</span>}</td>)}
          <td className="actions-cell"><Dropdown className="row-menu" label={`Options for welder ${label('welders', welder.id)}`} trigger={<span className="icon-btn"><MoreHorizontal size={18}/></span>}>
            <button onClick={() => setDialog({ kind: 'show', welder })}><User size={14}/>Show</button>
            {canRecord('welders', 'edit', welder) && !welder._archived && <button onClick={() => setEditor(welder)}><Pencil size={14}/>Edit</button>}
            <button onClick={() => setDialog({ kind: 'files', welder })}><Paperclip size={14}/>Certificates and files</button>
            <button onClick={() => setDialog({ kind: 'card', welder })}><CreditCard size={14}/>Welder card</button>
            {canRecord('welders', 'delete', welder) && <button onClick={() => setArchiving(welder)}>{welder._archived ? <><RotateCcw size={14}/>Restore</> : <><Trash2 size={14}/>Delete</>}</button>}
            {canRecord('welders', 'edit', welder) && !welder._archived && <button onClick={() => welder.status === 'Inactive' ? void setActive(welder, true) : setDeactivating(welder)}>{welder.status === 'Inactive' ? <><Play size={14}/>Activate</> : <><Pause size={14}/>Deactivate</>}</button>}</Dropdown></td></tr>)}</tbody></table></TableScroll>
      {!shownRows.length && <EmptyState title={q || filterCount ? 'No matching welders' : tab === 'deleted' ? 'No deleted welders' : tab === 'inactive' ? 'No inactive welders' : 'No welders yet'} description={q || filterCount ? 'Try another search or reset the filters.' : tab === 'active' ? 'Add your first welder to get started.' : 'Welders appear here when their status or deletion changes.'} action={q || filterCount ? <button className="btn" onClick={reset}>Reset filters</button> : creatable && tab === 'active' ? <button className="btn primary" onClick={() => setEditor('new')}><Plus size={16}/>Add Welder</button> : undefined}/>}
      <div className="table-footer"><span role="status" aria-live="polite">{shownRows.length ? `${current * size + 1}–${Math.min((current + 1) * size, shownRows.length)}` : '0'} of {formatNumber(shownRows.length, 0)} welders</span><div><span>Rows per page</span><select aria-label="Rows per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{WELDER_PAGE_SIZES.map(value => <option key={value}>{value}</option>)}</select><button className="icon-btn" disabled={current === 0} aria-label="Previous page" onClick={() => setPage(current - 1)}><ChevronLeft size={17}/></button><span>{current + 1} / {pages}</span><button className="icon-btn" disabled={current >= pages - 1} aria-label="Next page" onClick={() => setPage(current + 1)}><ChevronRight size={17}/></button></div></div>
    </div>
    {editor && <RecordEditor resourceKey="welders" record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
    {archiving && <ArchiveRecordDialog resourceKey="welders" record={archiving} onClose={() => setArchiving(null)}/>}
    {deactivating && <Modal title="Deactivate" subtitle={String(deactivating.name || deactivating.number || '')} onClose={() => setDeactivating(null)}>
      <div className="modal-body"><p>{WELDER_DEACTIVATE_CONFIRM}</p></div>
      <div className="modal-footer"><button type="button" className="btn" onClick={() => setDeactivating(null)}>Cancel</button><button type="button" className="btn primary" autoFocus onClick={() => { const welder = deactivating; setDeactivating(null); void setActive(welder, false); }}>OK</button></div>
    </Modal>}
    {dialog?.kind === 'show' && <WelderShowDialog welderId={dialog.welder.id} homeLocation={homeLocation(dialog.welder)} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'files' && <WelderFilesDialog welderId={dialog.welder.id} onClose={() => setDialog(null)}/>}
    {dialog?.kind === 'card' && <WelderCardDialog welderId={dialog.welder.id} onClose={() => setDialog(null)}/>}
    {filterOpen && <WelderFilterDialog filter={filter} onApply={next => { setFilter(next); setPage(0); }} onClose={() => setFilterOpen(false)}/>}
  </div>;
}

/** "Filter": one select per weldercard list; a welder matches when a card line carries the chosen value (exact). */
export function WelderFilterDialog({ filter, onApply, onClose }: { filter: WelderCardFilter; onApply: (filter: WelderCardFilter) => void; onClose: () => void }) {
  const { rows } = useWorkspace();
  const [draft, setDraft] = useState(filter);
  return <Modal title="Filter" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onApply(draft); onClose(); }}><div className="modal-body"><div className="form-grid">
      {WELDER_FILTER_ORDER.map(key => {
        const list = WELDERCARD_LISTS.find(item => item.key === key)!, name = list.filter as keyof WelderCardFilter;
        const names = [...new Set(cardOptions(rows.weldercard_options, key).map(option => String(option.name)))];
        return <Pick key={key} id={`welder-filter-${key}`} label={list.label} value={draft[name]} onChange={value => setDraft(old => ({ ...old, [name]: String(value) }))}><option value="">-------------</option>{names.map(value => <option key={value} value={value}>{value}</option>)}</Pick>;
      })}
    </div></div><div className="modal-footer"><button className="btn primary">Filter</button><button type="button" className="btn" onClick={() => { setDraft(NO_WELDER_FILTER); onApply(NO_WELDER_FILTER); onClose(); }}>Reset</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div></form>
  </Modal>;
}

const useFiles = () => { const { rows } = useWorkspace(); return (type: string, id: string) => activeRows(rows, 'attachments').filter(file => file.entityType === type && file.entityId === id); };
const expired = (document: Row) => Boolean(document.expiresAt) && String(document.expiresAt) < todayIso();

/** "Personnel data" (Show): photo, Summary list link, the personal data, and the welder's documents by expire date. */
export function WelderShowDialog({ welderId, homeLocation, onClose }: { welderId: string; homeLocation: string; onClose: () => void }) {
  const { rows, allRows, label } = useWorkspace(); const files = useFiles();
  const welder = (rows.welders || []).find(row => row.id === welderId);
  if (!welder) return null;
  const documents = welderDocuments(rows.welder_certificates, welderId);
  const summary = summaryListOf(documents), summaryFile = summary ? files('welder_certificates', summary.id)[0] : undefined;
  const photo = files('welders', welderId).find(file => file.documentType === 'Photo');
  const company = welder.companyId ? label('companies', welder.companyId) : '';
  const pill = (yes: boolean) => <Badge color={yes ? 'green' : 'red'}>{yes ? 'Yes' : 'No'}</Badge>;
  const details: [string, React.ReactNode][] = [['ID nr.', String(welder.number ?? '')], ['Welder ID Nr.', String(welder.welderCode ?? '')], ['Name', String(welder.name ?? '')], ['Address', String(welder.address ?? '')], ['Zip code', String(welder.zip ?? '')], ['Residence', String(welder.residence ?? '')], ['Phone', String(welder.phone ?? '')], ['Fax', String(welder.fax ?? '')], ['Email address', String(welder.email ?? '')], ['Company', company], ['Home location', homeLocation], ['Active', pill(welder.status !== 'Inactive')], ['Globally deployable', pill(welder.globallyDeployable === true)]];
  return <Modal title="Personnel data" onClose={onClose} wide>
    <div className="modal-body">
      <div className="welder-show">
        <div className="welder-show-photo">{photo ? <img src={apiUrl(`/files/${photo.id}`)} alt={`Photo of ${label('welders', welderId)}`}/> : <div className="welder-photo-placeholder" aria-hidden="true"><User size={56}/></div>}
          {summaryFile && <a className="btn small" href={apiUrl(`/files/${summaryFile.id}`)} target="_blank" rel="noreferrer"><Printer size={14}/>{SUMMARY_LIST}</a>}</div>
        <dl className="welder-show-details">{details.map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value || <span className="muted">—</span>}</dd></div>)}</dl>
      </div>
      <TableScroll><table className="data-table"><thead><tr><th>#</th><th>Document</th><th>WQ No</th><th>WPS</th><th>Note</th><th>Expire</th><th>Notify days</th></tr></thead>
        <tbody>{documents.map((document, index) => { const file = files('welder_certificates', document.id)[0], wps = documentWps(document, allRows.wps || rows.wps);
          return <tr key={document.id}><td>{index + 1}</td><td>{file ? <a href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer"><Download size={13}/> {String(document.name)}</a> : String(document.name)}</td><td>{wqNoOf(document)}</td><td>{wps.join(', ') || 'Not selected'}</td><td>{documentNote(document) || '-'}</td>
            <td>{document.expiresAt ? <>{formatDate(String(document.expiresAt))} {expired(document) && <AlertTriangle size={13} className="welder-expired-icon" aria-label="Expired"/>}</> : '-'}</td><td>{notifyDays(document)} days</td></tr>; })}</tbody></table></TableScroll>
      {!documents.length && <p className="muted">No documents recorded for this welder.</p>}
    </div>
    <div className="modal-footer"><button className="btn" onClick={onClose}>Close</button></div>
  </Modal>;
}

/** "Welder card": the seven lists and the welder's WQ numbers in one add row, Add, Print, and the card lines with a delete each. */
export function WelderCardDialog({ welderId, onClose }: { welderId: string; onClose: () => void }) {
  const { rows, canRecord, refresh, notify } = useWorkspace();
  const welder = (rows.welders || []).find(row => row.id === welderId);
  const first = (key: string) => cardOptions(rows.weldercard_options, key)[0]?.id ?? '';
  const [chosen, setChosen] = useState<Record<string, string>>({}); const [wq, setWq] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!welder) return null;
  const lines = welderCardLines(rows.welder_card_lines, welderId);
  const wqNumbers = welderWqNumbers(rows.welder_certificates, welderId);
  const value = (key: string) => chosen[key] && cardOptions(rows.weldercard_options, key).some(option => option.id === chosen[key]) ? chosen[key] : first(key);
  const writable = canRecord('welder_card_lines', 'insert') && !welder._archived, missing = WELDERCARD_LISTS.some(list => !value(list.key));
  async function add(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await post('/records/welder_card_lines', { welderId, ...Object.fromEntries(WELDERCARD_LISTS.map(list => [list.field, value(list.key)])), wqNos: joinWqNos(wq) }); await refresh(); notify('Welder card line added.'); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function remove(line: Row) { setBusy(true); setError(''); try { await post(`/records/welder_card_lines/${line.id}/archive`, { _version: line._version }); await refresh(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  return <Modal title="Welder card" onClose={onClose} wide>
    <form onSubmit={event => void add(event)}><div className="modal-body">
      <p className="welder-card-heading"><strong>{welderCardHeading(welder)}</strong></p>
      {error && <div className="alert error" role="alert">{error}</div>}
      {writable && <>{missing && <p className="muted">Add the values of the welder card in Weldercard settings first.</p>}
        <div className="form-grid">{WELDERCARD_LINE_COLUMNS.map(column => <Pick key={column.list} id={`card-${column.list}`} label={column.label} value={value(column.list)} onChange={next => setChosen(old => ({ ...old, [column.list]: String(next) }))}>{cardOptions(rows.weldercard_options, column.list).map(option => <option key={option.id} value={option.id}>{String(option.name)}</option>)}</Pick>)}
          <Pick id="card-wq" label="WQ No" multiple value={wq} onChange={next => setWq(next as string[])}>{wqNumbers.map(number => <option key={number} value={number}>{number}</option>)}</Pick></div>
        <div className="welder-card-buttons"><button className="btn primary" disabled={busy || missing}>Add</button>{canRecord('welders', 'print') && <a className="btn" href={apiUrl(`/pdf/welder-card?welderId=${welder.id}`)} target="_blank" rel="noreferrer"><Printer size={14}/>Print</a>}</div></>}
      {!writable && canRecord('welders', 'print') && <div className="welder-card-buttons"><a className="btn" href={apiUrl(`/pdf/welder-card?welderId=${welder.id}`)} target="_blank" rel="noreferrer"><Printer size={14}/>Print</a></div>}
      <TableScroll><table className="data-table"><thead><tr><th>#</th>{WELDERCARD_LINE_COLUMNS.map(column => <th key={column.list}>{column.header}</th>)}<th>WQ No</th><th><span className="sr-only">Delete</span></th></tr></thead>
        <tbody>{lines.map((line, index) => <tr key={line.id}><td>{index + 1}</td>{cardLineCells(line, rows.weldercard_options).map((cell, position) => <td key={position}>{cell || <span className="muted">—</span>}</td>)}
          <td className="actions-cell">{canRecord('welder_card_lines', 'delete', line) && !welder._archived && <button type="button" className="icon-btn" disabled={busy} aria-label={`Delete card line ${index + 1}`} title="Delete" onClick={() => void remove(line)}><Trash2 size={15}/></button>}</td></tr>)}</tbody></table></TableScroll>
      {!lines.length && <p className="muted">This welder has no card lines yet.</p>}
    </div><div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Close</button></div></form>
  </Modal>;
}

interface DocumentDraft { name: string; wqNo: string; wps: string[]; note: string; expiresAt: string; notifyDays: string; file: File | null }
const emptyDraft = (document?: Row, wps?: string[]): DocumentDraft => ({ name: document ? String(document.name ?? '') : SUMMARY_LIST, wqNo: document ? wqNoOf(document) : '', wps: wps ?? [], note: document ? documentNote(document) : '', expiresAt: document ? String(document.expiresAt ?? '') : '', notifyDays: document && document.notifyDays !== undefined && document.notifyDays !== null ? String(document.notifyDays) : '', file: null });

/** The document fields (Name, WQ No, WPS, File, Note, Expire date, Notify): the add row and the edit dialog share them. */
function DocumentFields({ draft, setDraft, current }: { draft: DocumentDraft; setDraft: (next: DocumentDraft) => void; current?: Row }) {
  const { rows } = useWorkspace();
  const names = documentNameOptions(rows.welder_customs_catalog, rows.certificate_types);
  const options = current && !names.includes(draft.name) ? [draft.name, ...names] : names;
  const key = current?.id ?? 'new', set = (patch: Partial<DocumentDraft>) => setDraft({ ...draft, ...patch });
  const input = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => <div className="field"><label htmlFor={`${id}-${key}`}>{label}</label><input id={`${id}-${key}`} {...props}/></div>;
  return <div className="form-grid welder-document-fields">
    <Pick id={`doc-name-${key}`} label="Name" value={draft.name} onChange={value => set({ name: String(value) })}>{options.map(name => <option key={name} value={name}>{name}</option>)}</Pick>
    {input('doc-wq', 'WQ No', { type: 'text', value: draft.wqNo, onChange: event => set({ wqNo: event.target.value }) })}
    <Pick id={`doc-wps-${key}`} label="WPS" multiple value={draft.wps} onChange={value => set({ wps: (value as string[]).filter(Boolean) })}><option value="">--------</option>{wpsChoices(rows.wps).map(wps => <option key={wps.id} value={wps.id}>{String(wps.name)}</option>)}</Pick>
    {input('doc-file', 'File', { type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.docx,.txt', onChange: event => set({ file: event.target.files?.[0] ?? null }) })}
    {input('doc-note', 'Note', { type: 'text', value: draft.note, onChange: event => set({ note: event.target.value }) })}
    {input('doc-expire', 'Expire date', { type: 'date', value: draft.expiresAt, onChange: event => set({ expiresAt: event.target.value }) })}
    {input('doc-notify', 'Notify (days)', { type: 'number', min: 0, step: 1, value: draft.notifyDays, onChange: event => set({ notifyDays: event.target.value }) })}
  </div>;
}

/** "Personel's certificates and files" (the reference's spelling): one document list per welder with an always-open add row. */
export function WelderFilesDialog({ welderId, onClose }: { welderId: string; onClose: () => void }) {
  const { rows, allRows, canRecord, refresh, notify } = useWorkspace(); const files = useFiles();
  const [draft, setDraft] = useState<DocumentDraft>(() => emptyDraft()); const [editing, setEditing] = useState<{ record: Row; draft: DocumentDraft } | null>(null);
  const welder = (rows.welders || []).find(row => row.id === welderId);
  const [welderNote, setWelderNote] = useState(() => String(welder?.description ?? '')); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!welder) return null;
  const documents = welderDocuments(rows.welder_certificates, welderId), writable = canRecord('welder_certificates', 'insert') && !welder._archived;
  const payload = (value: DocumentDraft) => ({ name: value.name, wqNo: value.wqNo.trim(), wpsIds: joinIds(value.wps), note: value.note.trim(), expiresAt: value.expiresAt, notifyDays: value.notifyDays === '' ? '' : Number(value.notifyDays) });
  async function upload(file: File | null, id: string) { if (!file) return; const body = new FormData(); body.set('file', file); body.set('entityType', 'welder_certificates'); body.set('entityId', id); await api('/files', { method: 'POST', body }); }
  async function run(work: () => Promise<void>) { setBusy(true); setError(''); try { await work(); await refresh(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  const add = (event: FormEvent) => { event.preventDefault(); void run(async () => { const saved = await api<{ record: Row }>('/records/welder_certificates', { method: 'POST', body: JSON.stringify({ ...payload(draft), welderId, isDocument: true, notify: true }) }); await upload(draft.file, saved.record.id); setDraft(emptyDraft()); notify('Document added.'); }); };
  const update = (event: FormEvent) => { event.preventDefault(); if (!editing) return; void run(async () => { await api('/records/welder_certificates/' + editing.record.id, { method: 'PUT', body: JSON.stringify({ ...payload(editing.draft), _version: editing.record._version }) }); await upload(editing.draft.file, editing.record.id); setEditing(null); notify('Document updated.'); }); };
  const saveNote = (event: FormEvent) => { event.preventDefault(); void run(async () => { await api(`/records/welders/${welder.id}`, { method: 'PUT', body: JSON.stringify({ description: welderNote, _version: welder._version }) }); notify('Note saved.'); }); };
  const bell = (item: Row) => run(async () => { await api(`/records/welder_certificates/${item.id}`, { method: 'PUT', body: JSON.stringify({ notify: !notificationsOn(item), _version: item._version }) }); notify(notificationsOn(item) ? 'Notifications switched off.' : 'Notifications switched on.'); });
  const remove = (item: Row) => run(async () => { await post(`/records/welder_certificates/${item.id}/archive`, { _version: item._version }); });
  // Edit qualification: its own dialog; Close and Update return to the list.
  if (editing) return <Modal title="Edit personnel info" onClose={() => setEditing(null)} wide>
    <form onSubmit={update}><div className="modal-body"><p className="welder-card-heading"><strong>{welderCardHeading(welder)}</strong></p>{error && <div className="alert error" role="alert">{error}</div>}
      <DocumentFields draft={editing.draft} current={editing.record} setDraft={next => setEditing({ record: editing.record, draft: next })}/></div>
      <div className="modal-footer"><button className="btn primary" disabled={busy}>Update</button><button type="button" className="btn" onClick={() => setEditing(null)}>Close</button></div></form></Modal>;
  return <Modal title="Personel's certificates and files" onClose={onClose} wide>
    <div className="modal-body">
      <p className="welder-card-heading"><strong>{welderCardHeading(welder)}</strong></p>
      {error && <div className="alert error" role="alert">{error}</div>}
      {writable && <form onSubmit={add}><DocumentFields draft={draft} setDraft={setDraft}/><div className="welder-card-buttons"><button className="btn primary" disabled={busy}>Add</button></div></form>}
      {writable && canRecord('welders', 'edit', welder) && <form className="welder-note-form" onSubmit={saveNote}><div className="field"><label htmlFor="welder-note">Note</label><input id="welder-note" type="text" value={welderNote} onChange={event => setWelderNote(event.target.value)}/></div><button className="btn primary" disabled={busy}>Save</button></form>}
      <TableScroll><table className="data-table"><thead><tr><th>#</th><th>Document 1</th><th>WQ No</th><th>WPS</th><th>Note</th><th>Expire</th><th>Notify days</th><th><span className="sr-only">Options</span></th></tr></thead>
        <tbody>{documents.map((item, index) => { const on = notificationsOn(item), file = files('welder_certificates', item.id)[0], wps = documentWps(item, allRows.wps || rows.wps), name = String(item.name);
          return <tr key={item.id}><td>{index + 1}</td><td>{file ? <a href={apiUrl(`/files/${file.id}`)} target="_blank" rel="noreferrer"><Download size={13}/> {name}</a> : name}</td><td>{wqNoOf(item)}</td><td>{wps.join(', ') || 'Nothing selected'}</td><td>{documentNote(item) || '-'}</td>
            <td>{item.expiresAt ? <>{formatDate(String(item.expiresAt))} {expired(item) && <AlertTriangle size={13} className="welder-expired-icon" aria-label="Expired"/>}</> : '-'}</td><td>{notifyDays(item)} days</td>
            <td className="actions-cell">{canRecord('welder_certificates', 'edit', item) && !welder._archived && <>
              <button className="icon-btn" aria-label={`Edit ${name}`} title="Edit" onClick={() => setEditing({ record: item, draft: emptyDraft(item, splitIds(item.wpsIds)) })}><Pencil size={15}/></button></>}
              {canRecord('welder_certificates', 'delete', item) && !welder._archived && <button className="icon-btn" aria-label={`Delete ${name}`} title="Delete" disabled={busy} onClick={() => void remove(item)}><Trash2 size={15}/></button>}
              {canRecord('welder_certificates', 'edit', item) && !welder._archived && <button className="icon-btn" aria-pressed={on} disabled={busy} title="Show in Expire warnings when this certificate is due" aria-label={`${on ? 'Switch off' : 'Switch on'} Expire warnings for ${name}`} onClick={() => void bell(item)}>{on ? <Bell size={15}/> : <BellOff size={15}/>}</button>}</td></tr>; })}</tbody></table></TableScroll>
      {!documents.length && <p className="muted">No documents recorded for this welder.</p>}
    </div>
    <div className="modal-footer"><button className="btn" onClick={onClose}>Close</button></div>
  </Modal>;
}

/** "Weldercard settings": the seven lists behind the welder card and Filter; Add / Edit / Delete ("Are you sure?", archived underneath). */
export function WelderCardSettingsPage() {
  const { rows, canRecord, refresh, notify } = useWorkspace();
  const [list, setList] = useState<string>(WELDERCARD_LISTS[0].key); const [q, setQ] = useState('');
  const [form, setForm] = useState<{ record?: Row } | null>(null); const [deleting, setDeleting] = useState<Row | null>(null);
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!canRecord('weldercard_options')) return <EmptyState title="This area is restricted" description="Your profile does not include the Weldercard settings."/>;
  const current = WELDERCARD_LISTS.find(item => item.key === list)!;
  const query = q.toLowerCase().trim();
  const listed = cardOptionsListed(rows.weldercard_options, list).filter(option => !query || `${option.name} ${option.description}`.toLowerCase().includes(query));
  const open = (record?: Row) => { setForm({ record }); setName(String(record?.name ?? '')); setDescription(String(record?.description ?? '')); setError(''); };
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const record = form?.record; await api(record ? `/records/weldercard_options/${record.id}` : '/records/weldercard_options', { method: record ? 'PUT' : 'POST', body: JSON.stringify({ name: name.trim(), description, ...(record ? { _version: record._version } : { list }) }) }); await refresh(); notify(record ? 'Value updated.' : 'Value added.'); setForm(null); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function remove() { if (!deleting) return; setBusy(true); setError(''); try { await post(`/records/weldercard_options/${deleting.id}/archive`, { _version: deleting._version }); await refresh(); notify('Value deleted.'); setDeleting(null); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  return <div className="page records-page weldercard-settings-page">
    <div className="page-heading"><div><div className="eyebrow">WELDING</div><h1>{current.label}</h1><p>Values of the welder card and of the Filter on Welders.</p></div>
      <div className="heading-actions">{canRecord('weldercard_options', 'insert') && <button className="btn primary" onClick={() => open()}><Plus size={17}/>Add</button>}</div></div>
    <div className="table-card">
      <div className="table-card-top"><div className="table-tabs" role="tablist" aria-label="Welder card lists">{WELDERCARD_LISTS.map(item => <button key={item.key} role="tab" aria-selected={list === item.key} className={list === item.key ? 'selected' : ''} onClick={() => { setList(item.key); setQ(''); }}>{item.label}</button>)}</div></div>
      <div className="table-toolbar"><SearchInput value={q} onChange={setQ} placeholder="Search"/></div>
      <TableScroll><table className="data-table"><thead><tr><th>Name</th><th>Description</th><th className="actions-cell"><span className="sr-only">Options</span></th></tr></thead>
        <tbody>{listed.map(option => <tr key={option.id}><td>{String(option.name)}</td><td>{String(option.description || '') || <span className="muted">—</span>}</td>
          <td className="actions-cell">{canRecord('weldercard_options', 'edit', option) && <button className="icon-btn" aria-label={`Edit ${option.name}`} title="Edit" onClick={() => open(option)}><Pencil size={15}/></button>}{canRecord('weldercard_options', 'delete', option) && <button className="icon-btn" aria-label={`Delete ${option.name}`} title="Delete" onClick={() => { setDeleting(option); setError(''); }}><Trash2 size={15}/></button>}</td></tr>)}</tbody></table></TableScroll>
      {!listed.length && <EmptyState title={q ? 'No matching values' : `No ${current.label} values yet`} description={q ? 'Try another search.' : 'Add the first value of this list.'}/>}
      <div className="table-footer"><span role="status" aria-live="polite">{listed.length} entries</span></div>
    </div>
    {form && <Modal title={form.record ? 'Edit' : 'Add'} onClose={() => setForm(null)}><form onSubmit={event => void save(event)}><div className="modal-body">{error && <div className="alert error" role="alert">{error}</div>}
      <div className="field"><label htmlFor="weldercard-name">Name<span className="required"> *</span></label><input id="weldercard-name" required value={name} onChange={event => setName(event.target.value)}/></div>
      <div className="field"><label htmlFor="weldercard-description">Description</label><input id="weldercard-description" value={description} onChange={event => setDescription(event.target.value)}/></div></div>
      <div className="modal-footer"><button className="btn primary" disabled={busy}>{form.record ? 'Update' : 'Add'}</button><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button></div></form></Modal>}
    {deleting && <Modal title="Delete" onClose={() => setDeleting(null)}><div className="modal-body">{error && <div className="alert error" role="alert">{error}</div>}<p>Are you sure?</p></div>
      <div className="modal-footer"><button className="btn danger" disabled={busy} onClick={() => void remove()}><Trash2 size={14}/>Delete</button><button className="btn" onClick={() => setDeleting(null)}>Cancel</button></div></Modal>}
  </div>;
}
