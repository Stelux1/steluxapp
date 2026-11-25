import { useId, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, FolderOpen, Loader2, Pencil, Plus, Printer, Trash2, Upload } from 'lucide-react';
import { IMPORT_FROM_SITE_TITLE } from '../shared/material-sites.ts';
import { usePilot } from './pilot.tsx';
import { SITE_DEFAULT_SORT, SITE_LIST_COLUMNS, SITE_PAGE_SIZES, siteListRows } from '../shared/site-list.ts';
import { EMPTY_TABLE_TEXT, NO_MATCH_TEXT, entriesText } from '../shared/ui-texts.ts';
import { NO_RIGHTS_TEXT } from '../shared/pilots.ts';
import type { Row } from '../shared/types.ts';
import { RESOURCE_MAP } from './catalog.ts';
import { apiUrl, post } from './api.ts';
import { ArchiveRecordButton, ArchiveRecordDialog } from './archive-record.tsx';
import { Badge, EmptyState, Modal, SearchInput, TableScroll } from './components.tsx';
import { useWorkspace } from './context.tsx';
import { RecordEditor } from './dialogs.tsx';

/**
 * Reference "Delete project site" dialog (weld__general__project-sites.txt #deleteProjectSite). Delete archives the site, as
 * every delete of the reference does; since the Archived checkbox left the form (client change list 22.11.2026) this is the
 * way to archive a site, so the dialog says where it goes and that it can be restored.
 */
export const SITE_DELETE = { title: 'Delete project site', text: 'Are you sure?', note: 'The project site moves to the archived list (Show archived sites), where it can be restored.', button: 'Delete', cancel: 'Cancel' };
/** The server refuses to delete a site that still has projects (409); the dialog says so before Delete is pressed. */
export const SITE_DELETE_BLOCKED = 'This project site still has projects and cannot be deleted. Delete its projects first.';
export const siteHasProjects = (projects: Row[], siteId: string) => projects.some(project => !project._archived && project.siteId === siteId);

/** Delete project site: "Are you sure?" and Delete; the site leaves the list (archived underneath, as every delete of the reference is). */
export function DeleteSiteDialog({ site, onClose }: { site: Row; onClose: () => void }) {
  const { allRows, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const blocked = siteHasProjects(allRows.projects || [], site.id) ? SITE_DELETE_BLOCKED : '';
  async function submit() {
    setBusy(true); setError('');
    try { await post(`/records/sites/${site.id}/archive`, { _version: site._version }); await refresh(); notify('Project site deleted.'); onClose(); }
    catch (failure) { setError((failure as Error).message); setBusy(false); }
  }
  return <Modal title={SITE_DELETE.title} subtitle={String(site.name)} onClose={onClose}>
    <div className="modal-body">{(error || blocked) && <div className="alert error" role="alert">{error || blocked}</div>}<p>{SITE_DELETE.text}</p>{!blocked && <p className="muted">{SITE_DELETE.note}</p>}</div>
    <div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>{SITE_DELETE.cancel}</button><button type="button" className="btn danger" disabled={busy || Boolean(blocked)} onClick={() => void submit()}><Trash2 size={15}/>{SITE_DELETE.button}</button></div>
  </Modal>;
}

/**
 * General data → Project sites (both pilots): the table of main projects. The name opens that site's Projects and makes it
 * the active site; Options open Projects, edit and delete (an archived site can be restored). The card screen "Select a main project" stays the choice after sign-in.
 */
export function SitesPage() {
  const { allRows, canRecord, selectSite, user } = useWorkspace(); const navigate = useNavigate();
  const def = RESOURCE_MAP.sites;
  const [archived, setArchived] = useState(false), [query, setQuery] = useState(''), [size, setSize] = useState(SITE_PAGE_SIZES[1]), [page, setPage] = useState(0);
  const [sort, setSort] = useState(SITE_DEFAULT_SORT), [editor, setEditor] = useState<Row | 'new' | null>(null), [archiving, setArchiving] = useState<Row | null>(null), [deleting, setDeleting] = useState<Row | null>(null);
  const [importing, setImporting] = useState<Row | null>(null); const pilot = usePilot();
  const all = allRows.sites || [];
  const rows = useMemo(() => siteListRows(all, { archived, query, sort }), [all, archived, query, sort]);
  if (!canRecord('sites')) return <div className="page"><EmptyState title={NO_RIGHTS_TEXT} description="Ask an administrator to add the right to your permission profile."/></div>;
  const pages = Math.max(1, Math.ceil(rows.length / size)), current = Math.min(page, pages - 1), shown = rows.slice(current * size, (current + 1) * size);
  const label = (name: string) => def.fields.find(field => field.name === name)?.label || name;
  const exportUrl = (format: string) => apiUrl(`/export/sites?format=${format}&archived=true&ids=${rows.map(row => row.id).join(',') || '__none__'}`);
  const open = (site: Row) => { selectSite(site.id); navigate(canRecord('projects') ? '/workspace/projects' : '/dashboard'); };
  const toggleSort = (field: string) => { setSort(old => ({ field, direction: old.field === field ? (old.direction === 1 ? -1 : 1) : 1 })); setPage(0); };
  // A limited account cannot add a main project: it would lie outside its access.
  const canAdd = canRecord('sites', 'insert') && !user.siteLimited;
  // MTO Pilot: the row icon "Import Materials DB from another project site" (the same rights as Import material).
  const canImportMaterials = pilot?.pilot.key === 'mto' && canRecord('materials', 'import') && canRecord('materials', 'insert');
  return <div className="page records-page sites-page">
    <div className="page-heading"><div><div className="eyebrow">GENERAL DATA</div><h1>{def.title}</h1><p>The main projects of your workspace. Open one to work in its projects.</p></div>
      <div className="heading-actions"><button type="button" className="btn" onClick={() => { setArchived(value => !value); setPage(0); }}>{archived ? 'Back to active sites' : 'Show archived sites'}</button>{canAdd && <button type="button" className="btn primary" onClick={() => setEditor('new')}><Plus size={17}/>Add project site</button>}</div></div>
    <div className="table-card">
      <div className="table-toolbar sites-toolbar">
        <label className="page-size">Show <select aria-label="Entries per page" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{SITE_PAGE_SIZES.map(option => <option key={option}>{option}</option>)}</select> entries</label>
        <div className="toolbar-right sites-export">
          {canRecord('sites', 'export') && <><a className="btn small" href={exportUrl('csv')}>CSV</a><a className="btn small" href={exportUrl('xlsx')}>Excel</a></>}
          {canRecord('sites', 'print') && <button type="button" className="btn small" onClick={() => window.print()}><Printer size={14}/>Print</button>}
        </div>
        <SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder="Search project sites…"/>
      </div>
      <TableScroll><table className="data-table sites-table"><thead><tr>
        {SITE_LIST_COLUMNS.map(column => <th key={column} aria-sort={sort.field === column ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => toggleSort(column)}>{label(column)}<ArrowUpDown size={12} className={sort.field === column ? 'sort-active' : ''}/></button></th>)}
        <th className="actions-cell">Options</th></tr></thead>
        <tbody>{shown.map(site => <tr key={site.id}>
          <td>{site._archived ? <>{String(site.name)} <Badge>Archived</Badge></> : <button type="button" className="record-link" onClick={() => open(site)}>{String(site.name)}</button>}</td>
          {SITE_LIST_COLUMNS.slice(1).map(column => <td key={column}>{String(site[column] ?? '') || <span className="muted">—</span>}</td>)}
          <td className="actions-cell"><span className="site-options">
            {!site._archived && <button type="button" className="icon-btn" aria-label={`Open projects of ${String(site.name)}`} title="Projects" onClick={() => open(site)}><FolderOpen size={16}/></button>}
            {!site._archived && canRecord('sites', 'edit', site) && <button type="button" className="icon-btn" aria-label={`Edit project site ${String(site.name)}`} title="Edit project site" onClick={() => setEditor(site)}><Pencil size={16}/></button>}
            {!site._archived && canRecord('sites', 'delete', site) && <button type="button" className="icon-btn" aria-label={`Delete project site ${String(site.name)}`} title="Delete project site" onClick={() => setDeleting(site)}><Trash2 size={16}/></button>}
            {site._archived && <ArchiveRecordButton resourceKey="sites" record={site} onArchive={() => setArchiving(site)}/>}
            {!site._archived && canImportMaterials && <button type="button" className="icon-btn" aria-label={`${IMPORT_FROM_SITE_TITLE}: ${String(site.name)}`} title={IMPORT_FROM_SITE_TITLE} onClick={() => setImporting(site)}><Upload size={16}/></button>}
          </span></td></tr>)}
          {!shown.length && <tr><td colSpan={SITE_LIST_COLUMNS.length + 1} className="empty-cell" role="status">{query.trim() ? NO_MATCH_TEXT : EMPTY_TABLE_TEXT}</td></tr>}
        </tbody></table></TableScroll>
      <div className="table-footer"><span role="status" aria-live="polite">{entriesText(rows.length ? current * size + 1 : 0, Math.min((current + 1) * size, rows.length), rows.length)}</span>
        <div><button type="button" className="icon-btn" disabled={current === 0} aria-label="Previous page" onClick={() => setPage(current - 1)}><ChevronLeft size={17}/></button><span>{current + 1} / {pages}</span><button type="button" className="icon-btn" disabled={current >= pages - 1} aria-label="Next page" onClick={() => setPage(current + 1)}><ChevronRight size={17}/></button></div></div>
    </div>
    {archiving && <ArchiveRecordDialog resourceKey="sites" record={archiving} onClose={() => setArchiving(null)}/>}
    {deleting && <DeleteSiteDialog site={deleting} onClose={() => setDeleting(null)}/>}
    {editor && <RecordEditor resourceKey="sites" record={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)}/>}
    {importing && <ImportMaterialsDialog site={importing} sites={all} onClose={() => setImporting(null)}/>}
  </div>;
}

/**
 * MTO Pilot → Project sites → "Import Materials DB from another project site": every material of the chosen project site
 * becomes available on this one (no copies); materials it already has stay as they are.
 */
function ImportMaterialsDialog({ site, sites, onClose }: { site: Row; sites: Row[]; onClose: () => void }) {
  const { refresh, notify } = useWorkspace(); const id = useId();
  const sources = sites.filter(row => !row._archived && row.id !== site.id).sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true }));
  const [source, setSource] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!source) { setError('Choose the project site to import the material database from.'); return; }
    setBusy(true);
    try { const result = await post<{ linked: number }>('/material-sites/import', { siteId: site.id, sourceSiteId: source }); await refresh(); notify(`${result.linked} ${result.linked === 1 ? 'material is' : 'materials are'} now available on ${String(site.name)}.`); onClose(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={IMPORT_FROM_SITE_TITLE} subtitle={String(site.name)} onClose={onClose}>
    <form noValidate onSubmit={event => void submit(event)}><div className="modal-body">
      {error && <div className="alert error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      {sources.length ? <div className="field"><label htmlFor={id}>Project site<span className="required"> *</span></label><div className="select-wrap"><select id={id} value={source} required onChange={event => setSource(event.target.value)}><option value="">Choose a project site</option>{sources.map(row => <option key={row.id} value={row.id}>{String(row.name)}</option>)}</select><ChevronDown size={14}/></div><small className="field-hint">Its materials become available on this project site too; nothing is copied.</small></div>
        : <p role="status">There is no other project site to import from.</p>}
    </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !sources.length}>{busy && <Loader2 size={15} className="spin"/>}Import</button></div></form>
  </Modal>;
}
