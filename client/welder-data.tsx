import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Bell, BellOff, Pause, Play, ChevronLeft, ChevronRight, ChevronDown, Download, FileText, MoreHorizontal, Paperclip, Pencil, Plus, Printer, RotateCcw, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react';
import type { Row } from '../shared/types.ts';
import { DEFAULT_WELDER_PAGE_SIZE, NO_WELDER_FILTER, STANDARD_SYSTEMS, WELDER_PAGE_SIZES, WELD_KINDS, WELD_POSITIONS, activeText, defaultWelderSite, expireMessage, notificationsOn, notifyDays, roleText, welderOnSite, expiringQualifications, filterWelders, qualificationLabel, todayIso, welderFilterCount, welderTab, welderTabCounts, type WelderQualificationFilter, type WelderTab } from '../shared/welder-data.ts';
import { RELATIONS, relationIds } from './catalog.ts';
import { activeRows, useWorkspace } from './context.tsx';
import { api, apiUrl, formatDate, formatNumber } from './api.ts';
import { Badge, Dropdown, EmptyState, FieldInput, Modal, SearchInput, TableScroll } from './components.tsx';
import { RecordEditor } from './dialogs.tsx';
import { ArchiveRecordDialog } from './archive-record.tsx';

const TABS: { key: WelderTab; label: string }[] = [{ key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' }, { key: 'deleted', label: 'Deleted' }];
const COLUMNS = [['number', 'ID nr.'], ['name', 'Name'], ['company', 'Company'], ['role', 'Role'], ['customs', 'Customs'], ['projects', 'Active on projects'], ['currentlyOn', 'Currently on'], ['description', 'Note'], ['status', 'Active']] as const;
type Column = typeof COLUMNS[number][0];

/** Welders (Weld Pilot): Active / Inactive / Deleted tabs, reference columns, qualification filter, certificates and files. */
export function WeldersPage() {
  const { rows, allRows, siteId, canRecord, label, openRecord, refresh, notify } = useWorkspace();
  const [tab, setTab] = useState<WelderTab>('active'); const [q, setQ] = useState(''); const [project, setProject] = useState(() => defaultWelderSite(siteId));
  // The list opens on the active main project; switching the main project in the top bar moves it along.
  useEffect(() => { setProject(defaultWelderSite(siteId)); setPage(0); }, [siteId]);
  const [filter, setFilter] = useState<WelderQualificationFilter>(NO_WELDER_FILTER); const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<{ column: Column; direction: 1 | -1 }>({ column: 'number', direction: 1 });
  const [page, setPage] = useState(0); const [size, setSize] = useState(DEFAULT_WELDER_PAGE_SIZE);
  const [editor, setEditor] = useState<Row | 'new' | null>(null); const [filesFor, setFilesFor] = useState<Row | null>(null); const [archiving, setArchiving] = useState<Row | null>(null);
  const sites = RELATIONS.welders?.find(relation => relation.field === 'siteIds'), customs = RELATIONS.welders?.find(relation => relation.field === 'customIds');
  const customNames = (id: string) => (customs ? relationIds(rows, customs, id) : []).map(customId => label('welder_customs_catalog', customId));
  const linkedSites = (welder: Row) => sites ? relationIds(allRows, sites, welder.id) : [];
  const projectNames = (welder: Row) => linkedSites(welder).map(siteId => label('sites', siteId));
  const textOf = (welder: Row, column: Column): string => column === 'company' ? String(welder.companyId ? label('companies', welder.companyId) : '') : column === 'role' ? roleText((rows.roles || []).find(role => role.id === welder.roleId)) : column === 'customs' ? customNames(welder.id).join(', ') : column === 'projects' ? projectNames(welder).join(', ') : String(welder[column] ?? '');
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
  /** Deactivate / Activate: one request, no confirmation (the welder moves to the other tab). */
  async function setActive(welder: Row, active: boolean) {
    try { await api(`/records/welders/${welder.id}`, { method: 'PUT', body: JSON.stringify({ status: active ? 'Active' : 'Inactive', _version: welder._version }) }); await refresh(); notify(active ? 'Welder activated.' : 'Welder deactivated.'); }
    catch (error) { notify((error as Error).message); }
  }
  const toggle = (column: Column) => setSort(old => ({ column, direction: old.column === column && old.direction === 1 ? -1 : 1 }));
  const reset = () => { setQ(''); setProject(''); setFilter(NO_WELDER_FILTER); setPage(0); };
  return <div className="page records-page welders-page">
    <div className="page-heading"><div><div className="eyebrow">WELDING</div><h1>Welders<span className="heading-count">{counts.active + counts.inactive}</span></h1><p>Welder identities, deployment, roles and qualifications.</p></div>
      <div className="heading-actions">{creatable && <button className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add welder</button>}</div></div>
    <div className="table-card">
      <div className="table-card-top"><div className="table-tabs" role="tablist" aria-label="Welder status">{TABS.map(item => <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'selected' : ''} onClick={() => { setTab(item.key); setPage(0); }}>{item.label}<span aria-label={`${counts[item.key]} welders`}>{counts[item.key]}</span></button>)}</div>
        <div className="table-utilities">{(canRecord('welders', 'export') || canRecord('welders', 'print')) && <Dropdown trigger={<span className="btn subtle small"><Download size={15}/>Export<ChevronDown size={12}/></span>}>{canRecord('welders', 'export') && <><a href={csvUrl('csv')}>Download CSV</a><a href={csvUrl('xlsx')}>Download Excel</a></>}{canRecord('welders', 'print') && <button onClick={() => window.print()}><Printer size={14}/>Print / Save as PDF</button>}</Dropdown>}</div></div>
      <div className="table-toolbar"><SearchInput value={q} onChange={value => { setQ(value); setPage(0); }} placeholder="Search welders…"/>
        <div className="toolbar-right"><div className="field welder-project-filter"><label htmlFor="welder-project">Main project</label><div className="select-wrap"><select id="welder-project" value={project} onChange={event => { setProject(event.target.value); setPage(0); }}><option value="">All</option>{activeRows(allRows, 'sites').map(site => <option key={site.id} value={site.id}>{String(site.name)}</option>)}</select></div></div>
          <button className={`btn small ${filterCount ? 'active-filter' : ''}`} aria-haspopup="dialog" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={15}/>Filter welders{filterCount > 0 && <span className="count-pill">{filterCount}</span>}</button>
          {project && <span className="muted welder-home-location">Home location: {label('sites', project)}</span>}
          {filterCount > 0 && <button className="text-link" onClick={reset}>Reset filters</button>}</div></div>
      <TableScroll><table className="data-table"><thead><tr>{COLUMNS.map(([column, title]) => <th key={column} aria-sort={sort.column === column ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button onClick={() => toggle(column)}>{title}<ArrowUpDown size={12} className={sort.column === column ? 'sort-active' : ''}/></button></th>)}<th className="actions-cell"><span className="sr-only">Options</span></th></tr></thead>
        <tbody>{shown.map(welder => <tr key={welder.id}>
          {COLUMNS.map(([column]) => <td key={column} className={column === 'description' ? 'description-cell' : ''}>{column === 'number' ? <button className="record-link" onClick={() => openRecord('welders', welder.id)}>{String(welder.number)}</button>
            : column === 'status' ? <>{activeText(welder)}</>
            : column === 'projects' ? <>{textOf(welder, column) || (welder.globallyDeployable ? <span className="muted">All (globally deployable)</span> : <span className="muted">—</span>)}</>
            : textOf(welder, column) || <span className="muted">—</span>}{column === 'name' && expiring.has(welder.id) && <span className="welder-expiry-flag" title="A qualification is expired or expires soon">Qualification</span>}</td>)}
          <td className="actions-cell">{canRecord('welders', 'edit', welder) && !welder._archived && <button className="icon-btn" title={welder.status === 'Inactive' ? 'Activate' : 'Deactivate'} aria-label={`${welder.status === 'Inactive' ? 'Activate' : 'Deactivate'} welder ${label('welders', welder.id)}`} onClick={() => void setActive(welder, welder.status === 'Inactive')}>{welder.status === 'Inactive' ? <Play size={15}/> : <Pause size={15}/>}</button>}<Dropdown className="row-menu" label={`Options for welder ${label('welders', welder.id)}`} trigger={<span className="icon-btn"><MoreHorizontal size={18}/></span>}>
            <button onClick={() => openRecord('welders', welder.id)}><FileText size={14}/>Welder card</button>
            {canRecord('welders', 'edit', welder) && !welder._archived && <button onClick={() => setEditor(welder)}><Pencil size={14}/>Edit welder</button>}
            <button onClick={() => setFilesFor(welder)}><Paperclip size={14}/>Certificates and files</button>
            {canRecord('welders', 'delete', welder) && <button onClick={() => setArchiving(welder)}>{welder._archived ? <><RotateCcw size={14}/>Restore welder</> : <><Trash2 size={14}/>Delete welder</>}</button>}</Dropdown></td></tr>)}</tbody></table></TableScroll>
      {!shownRows.length && <EmptyState title={q || filterCount ? 'No matching welders' : tab === 'deleted' ? 'No deleted welders' : tab === 'inactive' ? 'No inactive welders' : 'No welders yet'} description={q || filterCount ? 'Try another search or reset the filters.' : tab === 'active' ? 'Add your first welder to get started.' : 'Welders appear here when their status or deletion changes.'} action={q || filterCount ? <button className="btn" onClick={reset}>Reset filters</button> : creatable && tab === 'active' ? <button className="btn primary" onClick={() => setEditor('new')}><Plus size={16}/>Add welder</button> : undefined}/>}
      <div className="table-footer"><span role="status" aria-live="polite">{shownRows.length ? `${current * size + 1}–${Math.min((current + 1) * size, shownRows.length)}` : '0'} of {formatNumber(shownRows.length, 0)} welders</span><div><span>Rows per page</span><select aria-label="Rows per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{WELDER_PAGE_SIZES.map(value => <option key={value}>{value}</option>)}</select><button className="icon-btn" disabled={current === 0} aria-label="Previous page" onClick={() => setPage(current - 1)}><ChevronLeft size={17}/></button><span>{current + 1} / {pages}</span><button className="icon-btn" disabled={current >= pages - 1} aria-label="Next page" onClick={() => setPage(current + 1)}><ChevronRight size={17}/></button></div></div>
    </div>
    {editor && <RecordEditor resourceKey="welders" record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
    {archiving && <ArchiveRecordDialog resourceKey="welders" record={archiving} onClose={() => setArchiving(null)}/>}
    {filesFor && <WelderFilesDialog welderId={filesFor.id} onClose={() => setFilesFor(null)}/>}
    {filterOpen && <WelderFilterDialog filter={filter} onApply={next => { setFilter(next); setPage(0); }} onClose={() => setFilterOpen(false)}/>}
  </div>;
}

/** "Filter welders": by the attributes of their valid qualifications. */
export function WelderFilterDialog({ filter, onApply, onClose }: { filter: WelderQualificationFilter; onApply: (filter: WelderQualificationFilter) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(filter);
  const set = (name: keyof WelderQualificationFilter) => (value: unknown) => setDraft(old => ({ ...old, [name]: value === '' || value === undefined || value === null ? '' : String(value) }));
  const input = (name: keyof WelderQualificationFilter, field: Parameters<typeof FieldInput>[0]['field']) => <FieldInput field={{ ...field, name }} value={draft[name]} onChange={set(name)}/>;
  return <Modal title="Filter welders" subtitle="Shows welders with at least one valid qualification that matches every chosen value. Expired qualifications are not counted." onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onApply(draft); onClose(); }}><div className="modal-body"><div className="form-grid">
      {input('wireId', { name: 'wireId', label: 'Welding wire', type: 'ref', ref: 'welding_wires' })}
      {input('processId', { name: 'processId', label: 'Weld process', type: 'ref', ref: 'weld_processes' })}
      {input('diameterId', { name: 'diameterId', label: 'Diameter', type: 'ref', ref: 'diameters' })}
      {input('thickness', { name: 'thickness', label: 'Thickness (mm)', type: 'number', min: 0 })}
      {input('position', { name: 'position', label: 'Pos', type: 'select', options: WELD_POSITIONS })}
      {input('weldKind', { name: 'weldKind', label: 'BW/FW', type: 'select', options: WELD_KINDS })}
      {input('system', { name: 'system', label: 'ASME/EN', type: 'select', options: STANDARD_SYSTEMS })}
    </div></div><div className="modal-footer"><button type="button" className="btn" onClick={() => setDraft(NO_WELDER_FILTER)}>Clear</button><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">Apply filter</button></div></form>
  </Modal>;
}

function AttachFile({ entityType, entityId, label }: { entityType: string; entityId: string; label: string }) {
  const { canRecord, refresh, notify, rows } = useWorkspace(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const target = (rows[entityType] || []).find(row => row.id === entityId);
  if (!canRecord(entityType, 'import', target)) return null;
  async function upload(file: File) { setBusy(true); setError(''); const body = new FormData(); body.set('file', file); body.set('entityType', entityType); body.set('entityId', entityId); try { await api('/files', { method: 'POST', body }); await refresh(); notify('Document attached.'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="attach-file"><label className="btn small"><Upload size={14}/>{busy ? 'Uploading…' : label}<input type="file" className="sr-only" disabled={busy} accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.docx,.txt" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }}/></label>{error && <span className="field-error" role="alert">{error}</span>}</div>;
}

/** Qualifications (welder certificates) and documents of one welder: both carry an expiry date, "Notify (days)" and a notification switch. */
export function WelderFilesDialog({ welderId, onClose }: { welderId: string; onClose: () => void }) {
  const { rows, label, canRecord, refresh, notify } = useWorkspace(); const [editor, setEditor] = useState<{ record?: Row; defaults?: Record<string, unknown> } | null>(null); const [archiving, setArchiving] = useState<Row | null>(null);
  const welder = (rows.welders || []).find(row => row.id === welderId);
  if (!welder) return null;
  const find = (key: string, id: unknown) => (rows[key] || []).find(row => row.id === id);
  const owned = activeRows(rows, 'welder_certificates').filter(row => row.welderId === welderId).sort((a, b) => String(a.expiresAt || '9999').localeCompare(String(b.expiresAt || '9999')));
  const certificates = owned.filter(row => row.isDocument !== true), documents = owned.filter(row => row.isDocument === true);
  const files = (type: string, id: string) => activeRows(rows, 'attachments').filter(file => file.entityType === type && file.entityId === id);
  const today = todayIso();
  const fileList = (type: string, id: string) => files(type, id).map(file => <a key={file.id} className="attachment-row" href={apiUrl(`/files/${file.id}`)}><FileText size={18}/><div><strong>{String(file.name)}</strong><small>{formatNumber(Number(file.size) / 1024)} KB · {formatDate(file._createdAt)}</small></div><Download size={16}/></a>);
  const writable = canRecord('welder_certificates', 'insert') && !welder._archived;
  const switchNotifications = async (item: Row) => { try { await api(`/records/welder_certificates/${item.id}`, { method: 'PUT', body: JSON.stringify({ notify: !notificationsOn(item), _version: item._version }) }); await refresh(); notify(notificationsOn(item) ? 'Notifications switched off.' : 'Notifications switched on.'); } catch (error) { notify((error as Error).message); } };
  if (editor) return <RecordEditor resourceKey="welder_certificates" record={editor.record} defaults={{ welderId, ...editor.defaults }} onClose={() => setEditor(null)}/>;
  if (archiving) return <ArchiveRecordDialog resourceKey="welder_certificates" record={archiving} onClose={() => setArchiving(null)}/>;
  const table = (list: Row[], kind: 'qualification' | 'document') => <TableScroll><table className="data-table"><thead><tr><th>{kind === 'document' ? 'Document' : 'Certificate'}</th>{kind === 'qualification' && <th>Qualification</th>}<th>Valid until</th><th>Notify (days)</th><th><span className="sr-only">Options</span></th></tr></thead><tbody>{list.map(item => {
    const expires = String(item.expiresAt || ''); const days = expires ? Math.floor((Date.parse(`${expires}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null; const on = notificationsOn(item);
    return <tr key={item.id}><td>{String(item.name)}{files('welder_certificates', item.id).length > 0 && <div className="welder-certificate-files">{fileList('welder_certificates', item.id)}</div>}</td>
      {kind === 'qualification' && <td>{qualificationLabel(item, { custom: find('welder_customs_catalog', item.customId), type: find('certificate_types', item.certificateTypeId), process: find('weld_processes', item.processId) })}</td>}
      <td>{expires ? <><span className="tabular">{formatDate(expires)}</span> {on && days !== null && days <= notifyDays(item) && <Badge color={days < 0 ? 'red' : 'amber'}>{expireMessage(days)}</Badge>}</> : <span className="muted">No expiry date</span>}</td>
      <td>{on ? <span className="tabular">{notifyDays(item)} days</span> : <span className="muted">Off</span>}</td>
      <td className="actions-cell">{canRecord('welder_certificates', 'edit', item) && !welder._archived && <button className="icon-btn" aria-pressed={on} title={on ? 'Switch notifications off' : 'Switch notifications on'} aria-label={`${on ? 'Switch off' : 'Switch on'} notifications for ${item.name}`} onClick={() => void switchNotifications(item)}>{on ? <Bell size={15}/> : <BellOff size={15}/>}</button>}{canRecord('welder_certificates', 'edit', item) && !welder._archived && <button className="icon-btn" aria-label={`Edit ${kind === 'document' ? 'document' : 'certificate'} ${item.name}`} onClick={() => setEditor({ record: item })}><Pencil size={15}/></button>}{canRecord('welder_certificates', 'delete', item) && !welder._archived && <button className="icon-btn" aria-label={`Delete ${kind === 'document' ? 'document' : 'certificate'} ${item.name}`} onClick={() => setArchiving(item)}><Trash2 size={15}/></button>}<AttachFile entityType="welder_certificates" entityId={item.id} label="Attach"/></td></tr>; })}</tbody></table></TableScroll>;
  return <Modal title="Certificates and files" subtitle={`${welder.number} · ${label('welders', welder.id)}`} onClose={onClose} wide>
    <div className="modal-body">
      <section className="welder-files-section"><div className="panel-heading"><h3>Qualifications<span className="count-pill">{certificates.length}</span></h3>{writable && <button className="btn small primary" onClick={() => setEditor({})}><Plus size={14}/>Add certificate</button>}</div>
        {certificates.length === 0 ? <p className="muted">No qualifications recorded for this welder.</p> : table(certificates, 'qualification')}
      </section>
      <section className="welder-files-section"><div className="panel-heading"><h3>Documents<span className="count-pill">{documents.length}</span></h3>{writable && <button className="btn small" onClick={() => setEditor({ defaults: { isDocument: true } })}><Plus size={14}/>Add document</button>}</div>
        {documents.length === 0 ? <p className="muted">No documents with an expiry date. Add a summary list or an ID document and give it an expiry date to be warned in time.</p> : table(documents, 'document')}
      </section>
      <section className="welder-files-section"><div className="panel-heading"><h3>Files<span className="count-pill">{files('welders', welder.id).length}</span></h3><AttachFile entityType="welders" entityId={welder.id} label="Attach a file"/></div>
        {files('welders', welder.id).length ? fileList('welders', welder.id) : <p className="muted">No files attached. Photos, ID copies and test reports can be attached here.</p>}</section>
    </div>
    <div className="modal-footer"><button className="btn" onClick={onClose}><X size={14}/>Close</button></div>
  </Modal>;
}

